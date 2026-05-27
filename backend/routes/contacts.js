const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const Contact = require('../models/Contact');
const path = require('path');
const fs = require('fs');

const upload = multer({ dest: path.join(__dirname, '../uploads/') });

// Upload Excel and extract contacts (Name, Phone, Email)
router.post('/upload-excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (data.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.json({ success: true, contacts: [], count: 0 });
    }

    // Determine column indices based on headers
    const headers = (data[0] || []).map(h => String(h || '').trim().toLowerCase());
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('number') || h.includes('contact'));
    const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('customer') || h.includes('person'));
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail'));

    const contacts = [];
    const seenPhones = new Set();
    const phoneRegex = /[6-9]\d{9}/; // matches 10-digit mobile

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      let phone = '';
      let name = '';
      let email = '';

      // Try reading phone from matching column index
      if (phoneIdx !== -1 && row[phoneIdx] !== undefined) {
        const raw = String(row[phoneIdx]).replace(/\D/g, '');
        const clean = raw.replace(/^91/, '');
        if (clean.length === 10 && ['6','7','8','9'].includes(clean[0])) {
          phone = clean;
        }
      }

      // Fallback search of all cells in the row if phone wasn't found at index
      if (!phone) {
        for (let j = 0; j < row.length; j++) {
          const val = String(row[j] || '').replace(/\D/g, '').replace(/^91/, '');
          if (val.length === 10 && ['6','7','8','9'].includes(val[0])) {
            phone = val;
            break;
          }
        }
      }

      if (!phone || seenPhones.has(phone)) continue;
      seenPhones.add(phone);

      if (nameIdx !== -1 && row[nameIdx] !== undefined) {
        name = String(row[nameIdx]).trim();
      }
      if (emailIdx !== -1 && row[emailIdx] !== undefined) {
        email = String(row[emailIdx]).trim();
      }

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
        await Contact.findOneAndUpdate(
          { phone: c.phone },
          { phone: c.phone, name: c.name || '', email: c.email || '', source },
          { upsert: true, new: true }
        );
        added++;
      } catch (e) { skipped++; }
    }
  } else if (phones && Array.isArray(phones)) {
    for (const phone of phones) {
      try {
        await Contact.findOneAndUpdate(
          { phone },
          { phone, source },
          { upsert: true, new: true }
        );
        added++;
      } catch (e) { skipped++; }
    }
  } else {
    return res.status(400).json({ success: false, message: 'No contacts or phones provided' });
  }

  res.json({ success: true, added, skipped });
});

// Get all contacts
router.get('/', async (req, res) => {
  const contacts = await Contact.find().sort('-createdAt');
  res.json({ success: true, contacts });
});

// Delete contact
router.delete('/:id', async (req, res) => {
  await Contact.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;