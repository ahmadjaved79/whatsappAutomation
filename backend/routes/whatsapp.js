const express = require('express');
const router = express.Router();
const {
  initWhatsApp, getStatus, getQR, disconnectWhatsApp, onStatusChange, formatPhone
} = require('../utils/whatsappService');

// SSE for real-time status updates
router.get('/status/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  send({ status: getStatus(), qr: getQR() });

  const cb = (data) => send(data);
  onStatusChange(cb);

  req.on('close', () => {
    // cleanup handled by garbage collection
  });
});

router.get('/status', (req, res) => {
  res.json({ status: getStatus(), qr: getQR() });
});

router.post('/connect', async (req, res) => {
  try {
    initWhatsApp(); // non-blocking
    res.json({ success: true, message: 'WhatsApp initialization started. Scan QR code.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/disconnect', async (req, res) => {
  await disconnectWhatsApp();
  res.json({ success: true, message: 'Disconnected' });
});

router.get('/host-info', async (req, res) => {
  const { getClient } = require('../utils/whatsappService');
  const client = getClient();
  if (!client) return res.status(400).json({ error: 'Client not connected' });
  try {
    const info = await client.getHostDevice().catch(() => null);
    const meUser = await client.page.evaluate(() => {
      return typeof WPP !== 'undefined' ? WPP.conn.getMeUser() : null;
    }).catch(() => null);
    res.json({ success: true, info, wid: client.wid, meUser, session: client.session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
