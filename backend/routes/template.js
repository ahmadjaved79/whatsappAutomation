const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Template = require('../models/Template');
const Contact = require('../models/Contact');
const { getClient, initWhatsApp } = require('../utils/whatsappService');
const { ConversationFlow } = require('../utils/conversationFlow');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/campaigns/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Ensure upload directory exists
const fs = require('fs');
const dir = path.join(__dirname, '../uploads/campaigns/');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── FIX: Random jitter delay to avoid WhatsApp rate-limit bans ──────────────
// For 100 contacts at 2 s flat delay → 3.3 minutes, but the fixed interval
// pattern looks robotic to WhatsApp servers. Adding ±1 s jitter makes it
// appear more human and significantly reduces ban risk.
const sendDelay = (base = 3500) => {
  const jitter = Math.floor(Math.random() * 2000) - 1000; // -1000 to +1000 ms
  return sleep(Math.max(2000, base + jitter));             // never below 2 s
};

// ── Create + send template ────────────────────────────────────────────────────
router.post('/send', upload.single('image'), async (req, res) => {
  const { title, message, footer, phones } = req.body;
  let phoneList = [];

  try {
    phoneList = JSON.parse(phones || '[]');
  } catch (e) {
    phoneList = (phones || '').split(',').map(p => p.trim()).filter(Boolean);
  }

  if (!phoneList.length) {
    // Use all saved opted-in contacts
    const contacts = await Contact.find({ optedOut: false });
    phoneList = contacts.map(c => c.phone);
  }

  if (!phoneList.length) return res.status(400).json({ success: false, message: 'No contacts to send to' });

  const imageUrl = req.file ? path.join(__dirname, '../uploads/campaigns/', req.file.filename) : null;

  const template = new Template({
    title: title || 'Fresh Stock Available!',
    message,
    footer: footer || '',
    imageUrl: req.file ? `/uploads/campaigns/${req.file.filename}` : '',
    contacts: phoneList,
    status: 'sending',
    sentAt: new Date(),
  });
  await template.save();

  // Respond immediately so the client isn't waiting
  res.json({ success: true, templateId: template._id, total: phoneList.length, message: 'Template started!' });

  // ── Background sending ────────────────────────────────────────────────────
  (async () => {
    let client = getClient();
    if (!client) {
      console.log('⚠️ WhatsApp client not running. Attempting connection before template dispatch...');
      try {
        client = await initWhatsApp();
      } catch (err) {
        console.error('❌ Failed to connect WhatsApp client for templates:', err.message);
      }
    }
    if (!client) {
      console.error('❌ Cannot send templates: WhatsApp client is disconnected.');
      template.status = 'failed';
      await template.save();
      return;
    }

    let sent = 0, failed = 0;
    console.log(`🚀 Starting bulk send to ${phoneList.length} contacts...`);

    for (let i = 0; i < phoneList.length; i++) {
      const phone = phoneList[i];
      try {
        await ConversationFlow.startTemplate(phone, imageUrl, message, title, footer, client);
        await Contact.findOneAndUpdate(
          { phone },
          { $inc: { templatesSent: 1 }, lastStatus: 'sent' },
          { upsert: true }
        );
        sent++;
        console.log(`✅ [${i + 1}/${phoneList.length}] Sent to ${phone}`);
      } catch (e) {
        failed++;
        console.error(`❌ [${i + 1}/${phoneList.length}] Failed to send template to ${phone}:`, e.message);
      }

      // FIX: Only sleep between sends, not after the last one.
      // Use jittered delay so WhatsApp does not detect the fixed-interval pattern.
      if (i < phoneList.length - 1) {
        await sendDelay(3500);
      }
    }

    template.totalSent  = sent;
    template.totalFailed = failed;
    template.status      = 'completed';
    await template.save();
    console.log(`🏁 Bulk send complete: ${sent} sent, ${failed} failed out of ${phoneList.length} total.`);
  })();
});

// ── Get all templates ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const templates = await Template.find().sort('-createdAt');
  res.json({ success: true, templates });
});

module.exports = router;