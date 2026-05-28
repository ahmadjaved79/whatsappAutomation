const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const Contact = require('../models/Contact');
const path    = require('path');
const fs      = require('fs');
const { sendTextMessage } = require('../utils/whatsappService');

const upload = multer({ dest: path.join(__dirname, '../uploads/') });

// Upload Excel
router.post('/upload-excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  try {
    const workbook  = XLSX.readFile(req.file.path);
    const sheet     = workbook.Sheets[workbook.SheetNames[0]];
    const data      = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!data.length) { fs.unlinkSync(req.file.path); return res.json({ success: true, contacts: [], count: 0 }); }

    const headers  = (data[0] || []).map(h => String(h || '').trim().toLowerCase());
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('number') || h.includes('contact'));
    const nameIdx  = headers.findIndex(h => h.includes('name') || h.includes('customer') || h.includes('person'));
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail'));

    const contacts = []; const seenPhones = new Set();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || !row.length) continue;
      let phone = '', name = '', email = '';
      if (phoneIdx !== -1 && row[phoneIdx] !== undefined) {
        const raw = String(row[phoneIdx]).replace(/\D/g, '').replace(/^91/, '');
        if (raw.length === 10 && ['6','7','8','9'].includes(raw[0])) phone = raw;
      }
      if (!phone) {
        for (let j = 0; j < row.length; j++) {
          const val = String(row[j] || '').replace(/\D/g, '').replace(/^91/, '');
          if (val.length === 10 && ['6','7','8','9'].includes(val[0])) { phone = val; break; }
        }
      }
      if (!phone || seenPhones.has(phone)) continue;
      seenPhones.add(phone);
      if (nameIdx  !== -1 && row[nameIdx]  !== undefined) name  = String(row[nameIdx]).trim();
      if (emailIdx !== -1 && row[emailIdx] !== undefined) email = String(row[emailIdx]).trim();
      contacts.push({ phone, name, email });
    }
    fs.unlinkSync(req.file.path);
    res.json({ success: true, contacts, count: contacts.length });
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Save contacts
router.post('/save', async (req, res) => {
  const { contacts, phones, source = 'manual' } = req.body;
  let added = 0, skipped = 0;
  if (contacts && Array.isArray(contacts)) {
    for (const c of contacts) {
      try {
        if (!c.phone) continue;
        await Contact.findOneAndUpdate({ phone: c.phone }, { phone: c.phone, name: c.name || '', email: c.email || '', source }, { upsert: true, new: true });
        added++;
      } catch { skipped++; }
    }
  } else if (phones && Array.isArray(phones)) {
    for (const phone of phones) {
      try { await Contact.findOneAndUpdate({ phone }, { phone, source }, { upsert: true, new: true }); added++; }
      catch { skipped++; }
    }
  } else { return res.status(400).json({ success: false, message: 'No contacts or phones provided' }); }
  res.json({ success: true, added, skipped });
});

// Get all contacts (with optional segment/optedOut filter)
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.segment)  filter.segment  = req.query.segment;
  if (req.query.optedOut !== undefined) filter.optedOut = req.query.optedOut === 'true';
  const contacts = await Contact.find(filter).sort('-createdAt');
  res.json({ success: true, contacts });
});

// Delete contact
router.delete('/:id', async (req, res) => {
  await Contact.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Send manual WhatsApp message
// POST /api/contacts/send-message  { phone, message }
router.post('/send-message', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ success: false, message: 'phone and message required' });
  try {
    await sendTextMessage(phone, message);
    res.json({ success: true, message: 'Message sent!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Re-compute segments for all contacts
// POST /api/contacts/refresh-segments
router.post('/refresh-segments', async (req, res) => {
  const contacts = await Contact.find();
  let updated = 0;
  for (const c of contacts) {
    const prev = c.segment; c.refreshSegment();
    if (c.segment !== prev) { await c.save(); updated++; }
  }
  res.json({ success: true, updated });
});

// Opt-out contact
router.put('/:id/opt-out', async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(req.params.id, { optedOut: true, optedOutAt: new Date() }, { new: true });
  res.json({ success: true, contact });
});

// Opt-in contact
router.put('/:id/opt-in', async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(req.params.id, { optedOut: false, $unset: { optedOutAt: '' } }, { new: true });
  res.json({ success: true, contact });
});

module.exports = router;