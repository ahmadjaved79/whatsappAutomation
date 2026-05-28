const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const Template = require('../models/Template');
const Contact  = require('../models/Contact');
const { getClient, initWhatsApp, getStatus } = require('../utils/whatsappService');
const { ConversationFlow } = require('../utils/conversationFlow');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/campaigns/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

const fs  = require('fs');
const dir = path.join(__dirname, '../uploads/campaigns/');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const sendDelay = (base = 4000) => {
  const jitter = Math.floor(Math.random() * 2000) - 1000;
  return sleep(Math.max(2500, base + jitter));
};

const waitForConnected = async (maxWait = 90000) => {
  const interval = 2000;
  let elapsed = 0;
  while (elapsed < maxWait) {
    const status = getStatus();
    console.log(`⏳ Waiting for CONNECTED... status: ${status} (${elapsed}ms)`);
    if (status === 'CONNECTED') return true;
    if (status === 'DISCONNECTED' || status === 'ERROR') return false;
    await sleep(interval);
    elapsed += interval;
  }
  console.error('❌ Timed out waiting for CONNECTED');
  return false;
};

// ── Shared broadcast runner ───────────────────────────────────────────────────
const runBroadcast = async (template, phoneList, imageUrl) => {
  let client = getClient();
  if (!client) {
    try { client = await initWhatsApp(); } catch (err) { console.error('❌ WA init failed:', err.message); }
  }
  if (!client) { template.status = 'failed'; await template.save(); return; }

  const isReady = await waitForConnected(90000);
  if (!isReady) { template.status = 'failed'; await template.save(); return; }

  console.log('✅ WhatsApp CONNECTED. Waiting 5s buffer...');
  await sleep(5000);

  let sent = 0, failed = 0;
  console.log(`🚀 Bulk send to ${phoneList.length} contacts...`);

  for (let i = 0; i < phoneList.length; i++) {
    const phone = phoneList[i];

    if (getStatus() !== 'CONNECTED') {
      console.error(`❌ WA disconnected at contact ${i + 1}. Aborting.`);
      failed += phoneList.length - i;
      break;
    }

    try {
      // ── Pass template._id so conversationFlow can track interested/orders ──
      await ConversationFlow.startTemplate(
        phone, imageUrl,
        template.message, template.title, template.footer,
        client,
        template._id   // ← templateId for stats tracking
      );
      await Contact.findOneAndUpdate({ phone }, { $inc: { templatesSent: 1 }, lastStatus: 'sent' }, { upsert: true });
      sent++;
      console.log(`✅ [${i + 1}/${phoneList.length}] Sent to ${phone}`);
    } catch (e) {
      failed++;
      console.error(`❌ [${i + 1}/${phoneList.length}] Failed ${phone}:`, e.message);
    }
    if (i < phoneList.length - 1) await sendDelay(4000);
  }

  template.totalSent   = sent;
  template.totalFailed = failed;
  template.status      = sent > 0 ? 'completed' : 'failed';
  template.lastRunAt   = new Date();
  await template.save();
  console.log(`🏁 Done: ${sent} sent, ${failed} failed`);
};

// POST /api/template/send
router.post('/send', upload.single('image'), async (req, res) => {
  const { title, message, footer, phones } = req.body;
  let phoneList = [];
  try { phoneList = JSON.parse(phones || '[]'); }
  catch { phoneList = (phones || '').split(',').map(p => p.trim()).filter(Boolean); }

  if (!phoneList.length) {
    const contacts = await Contact.find({ optedOut: false });
    phoneList = contacts.map(c => c.phone);
  }
  if (!phoneList.length) return res.status(400).json({ success: false, message: 'No contacts to send to' });

  // Deduplication check: prevent duplicate templates within 10 seconds
  const tenSecondsAgo = new Date(Date.now() - 10000);
  const duplicate = await Template.findOne({
    message,
    title: title || 'Fresh Stock Available!',
    footer: footer || '',
    createdAt: { $gte: tenSecondsAgo }
  });
  if (duplicate) {
    console.log('⚠️ [WA] Duplicate template broadcast request detected. Ignoring.');
    return res.json({ success: true, templateId: duplicate._id, total: phoneList.length, message: 'Template already sent (duplicate check).' });
  }

  const imageUrl = req.file ? path.join(__dirname, '../uploads/campaigns/', req.file.filename) : null;
  const template = new Template({
    title: title || 'Fresh Stock Available!', message, footer: footer || '',
    imageUrl: req.file ? `/uploads/campaigns/${req.file.filename}` : '',
    contacts: phoneList, status: 'sending', sentAt: new Date(),
  });
  await template.save();

  res.json({ success: true, templateId: template._id, total: phoneList.length, message: 'Template started!' });
  runBroadcast(template, phoneList, imageUrl);
});

// POST /api/template/schedule
router.post('/schedule', upload.single('image'), async (req, res) => {
  const { title, message, footer, phones, scheduleTime, repeatDaily, scheduleDays } = req.body;
  if (!scheduleTime) return res.status(400).json({ success: false, message: 'scheduleTime required (HH:MM)' });

  let phoneList = [];
  try { phoneList = JSON.parse(phones || '[]'); }
  catch { phoneList = (phones || '').split(',').map(p => p.trim()).filter(Boolean); }

  if (!phoneList.length) {
    const contacts = await Contact.find({ optedOut: false });
    phoneList = contacts.map(c => c.phone);
  }

  const [hh, mm] = scheduleTime.split(':').map(Number);
  const next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);

  const template = new Template({
    title: title || 'Fresh Stock Available!', message, footer: footer || '',
    imageUrl: req.file ? `/uploads/campaigns/${req.file.filename}` : '',
    contacts: phoneList, status: 'scheduled',
    isScheduled: true, scheduleTime,
    repeatDaily: repeatDaily === 'true' || repeatDaily === true,
    scheduleDays: scheduleDays ? JSON.parse(scheduleDays) : [],
    nextRunAt: next, isActive: true,
  });
  await template.save();
  res.json({ success: true, template, message: `Scheduled for ${scheduleTime}` });
});

router.get('/schedules', async (req, res) => {
  const schedules = await Template.find({ isScheduled: true }).sort('-createdAt');
  res.json({ success: true, schedules });
});

router.put('/schedule/:id/toggle', async (req, res) => {
  const t = await Template.findById(req.params.id);
  if (!t) return res.status(404).json({ success: false, message: 'Not found' });
  t.isActive = !t.isActive;
  await t.save();
  res.json({ success: true, template: t });
});

router.delete('/schedule/:id', async (req, res) => {
  await Template.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

router.get('/', async (req, res) => {
  const templates = await Template.find({ isScheduled: { $ne: true } }).sort('-createdAt');
  res.json({ success: true, templates });
});

const runScheduledTemplates = async () => {
  const now = new Date();
  const due = await Template.find({ isScheduled: true, isActive: true, nextRunAt: { $lte: now }, status: { $ne: 'sending' } });

  for (const t of due) {
    console.log(`⏰ Running scheduled broadcast: ${t.title}`);
    t.status = 'sending';
    await t.save();
    const imageUrl = t.imageUrl ? path.join(__dirname, '../uploads/campaigns/', path.basename(t.imageUrl)) : null;
    runBroadcast(t, t.contacts, imageUrl).then(async () => {
      if (t.repeatDaily) {
        const next = new Date(t.nextRunAt);
        next.setDate(next.getDate() + 1);
        await Template.findByIdAndUpdate(t._id, { nextRunAt: next, status: 'scheduled' });
      }
    });
  }
};

module.exports = router;
module.exports.runScheduledTemplates = runScheduledTemplates;