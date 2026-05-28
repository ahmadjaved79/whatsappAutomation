const express = require('express');
const router  = express.Router();
const {
  initWhatsApp, getStatus, getQR, disconnectWhatsApp,
  onStatusChange, formatPhone, getClient,
} = require('../utils/whatsappService');

// Keep a registry of active SSE connections so we can clean up properly
const sseClients = new Set();

// ── SSE — real-time status stream ─────────────────────────────────────────────
router.get('/status/stream', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  let closed = false;

  const send = (data) => {
    if (closed) return;
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      closed = true;
    }
  };

  // Send heartbeat every 25s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    if (closed) { clearInterval(heartbeat); return; }
    try { res.write(': heartbeat\n\n'); } catch { closed = true; }
  }, 25_000);

  // Send current state immediately on connect
  send({ status: getStatus(), qr: getQR() });

  // Register status-change callback
  const cb = (data) => send(data);
  onStatusChange(cb);
  sseClients.add(cb);

  // Clean up when client disconnects
  const cleanup = () => {
    closed = true;
    clearInterval(heartbeat);
    sseClients.delete(cb);
    // Remove cb from whatsappService's callback list
    // broadcastStatus filters out throwing callbacks automatically,
    // but force it by making cb a no-op so it gets cleaned on next broadcast
    Object.assign(cb, { __removed: true });
  };

  req.on('close',   cleanup);
  req.on('error',   cleanup);
  res.on('close',   cleanup);
  res.on('finish',  cleanup);
});

// ── GET current status ────────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({ status: getStatus(), qr: getQR() });
});

// ── Connect ───────────────────────────────────────────────────────────────────
router.post('/connect', async (req, res) => {
  try {
    initWhatsApp(); // fire-and-forget; QR arrives via SSE
    res.json({ success: true, message: 'WhatsApp initialization started. Scan the QR code.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Disconnect ────────────────────────────────────────────────────────────────
router.post('/disconnect', async (req, res) => {
  await disconnectWhatsApp();
  res.json({ success: true, message: 'Disconnected' });
});

// ── Host info ─────────────────────────────────────────────────────────────────
router.get('/host-info', async (req, res) => {
  const client = getClient();
  if (!client) return res.status(400).json({ error: 'Client not connected' });
  try {
    const user  = client.user || {};
    const phone = (user.id || '').split(':')[0].split('@')[0];
    res.json({ success: true, phone, name: user.name || '', id: user.id || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;