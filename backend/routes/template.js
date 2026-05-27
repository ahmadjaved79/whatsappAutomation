const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Template = require('../models/Template');
const Contact = require('../models/Contact');
const { getClient, initWhatsApp, getStatus } = require('../utils/whatsappService');
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

const sendDelay = (base = 4000) => {
  const jitter = Math.floor(Math.random() * 2000) - 1000;
  return sleep(Math.max(2500, base + jitter));
};

// ── Wait until WhatsApp is fully CONNECTED (not just QR scanned) ─────────────
// After QR scan, WPP goes: qrReadSuccess → SYNCING → inChat (CONNECTED)
// Sending during SYNCING causes "dropping db read operation due to logout"
// This waits up to `maxWait` ms for status to become CONNECTED.
const waitForConnected = async (maxWait = 60000) => {
  const interval = 2000;
  let elapsed = 0;
  while (elapsed < maxWait) {
    const status = getStatus();
    console.log(`⏳ Waiting for WhatsApp CONNECTED... current status: ${status} (${elapsed}ms)`);
    if (status === 'CONNECTED') return true;
    if (status === 'DISCONNECTED' || status === 'ERROR') return false;
    await sleep(interval);
    elapsed += interval;
  }
  console.error('❌ Timed out waiting for WhatsApp CONNECTED status');
  return false;
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
    const contacts = await Contact.find({ optedOut: false });
    phoneList = contacts.map(c => c.phone);
  }

  if (!phoneList.length)
    return res.status(400).json({ success: false, message: 'No contacts to send to' });

  const imageUrl = req.file
    ? path.join(__dirname, '../uploads/campaigns/', req.file.filename)
    : null;

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

  // Respond immediately so frontend isn't waiting
  res.json({ success: true, templateId: template._id, total: phoneList.length, message: 'Template started!' });

  // ── Background sending ────────────────────────────────────────────────────
  (async () => {
    // Step 1: Get or init WhatsApp client
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

    // Step 2: CRITICAL — wait for WhatsApp to finish syncing before sending
    // Without this, messages fail with "dropping db read operation due to logout"
    // because WPP is still in SYNCING state after QR scan
    const isReady = await waitForConnected(90000); // wait up to 90 seconds
    if (!isReady) {
      console.error('❌ WhatsApp never reached CONNECTED state. Aborting template send.');
      template.status = 'failed';
      await template.save();
      return;
    }

    // Step 3: Extra buffer after CONNECTED — WhatsApp needs a moment to
    // fully settle internal state before accepting outgoing messages
    console.log('✅ WhatsApp is CONNECTED. Waiting 5s buffer before sending...');
    await sleep(5000);

    // Step 4: Send to all contacts
    let sent = 0, failed = 0;
    console.log(`🚀 Starting bulk send to ${phoneList.length} contacts...`);

    for (let i = 0; i < phoneList.length; i++) {
      const phone = phoneList[i];

      // Re-check connection before each send — don't waste attempts if disconnected
      if (getStatus() !== 'CONNECTED') {
        console.error(`❌ WhatsApp disconnected during bulk send at contact ${i + 1}. Aborting.`);
        failed += phoneList.length - i;
        break;
      }

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

      if (i < phoneList.length - 1) {
        await sendDelay(4000);
      }
    }

    template.totalSent = sent;
    template.status = sent > 0 ? 'completed' : 'failed';
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