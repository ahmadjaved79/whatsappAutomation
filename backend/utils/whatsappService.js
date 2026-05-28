const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const path   = require('path');
const fs     = require('fs');
const pino   = require('pino');
const MessageCache = require('../models/MessageCache');

// ── Suppress libsignal / Baileys noise ──────────────────────────────────────
// Bad MAC, Failed to decrypt, Closing session — all harmless, just noise
const _err = console.error;
const _log = console.log;
const _warn = console.warn;
const SUPPRESS = [
  'Bad MAC', 'Failed to decrypt', 'Session error', 'Decrypted message with closed session',
  'Closing session', 'Closing open session', 'Error no open browser',
];
const isSuppressed = (...args) => {
  const msg = String(args[0] || '');
  return SUPPRESS.some(s => msg.includes(s));
};
console.error = (...args) => { if (!isSuppressed(...args)) _err(...args); };
console.log   = (...args) => { if (!isSuppressed(...args)) _log(...args); };
console.warn  = (...args) => { if (!isSuppressed(...args)) _warn(...args); };

// Silence noisy libsignal "Closing session" console output
const _origLog = console.log;
console.log = (...args) => {
  const msg = String(args[0] || '');
  if (msg.startsWith('Closing session') || msg.startsWith('Closing open session')) return;
  _origLog(...args);
};

// Simple message cache — replaces makeInMemoryStore (removed from Baileys v6+)
// Fixes "Waiting for this message" by returning the original on retry requests
const msgCache = new Map();

// Map to track processed message IDs to prevent double handling of incoming messages
const processedMsgIds = new Map();


// LID → phone JID map — WhatsApp multi-device uses @lid instead of phone numbers
const lidToPhone   = new Map();
// Queue for @lid messages that arrived before contacts synced
const lidMsgQueue  = [];
let   contactsReady = false;
const cacheMsg = async (remoteJid, id, message) => {
  if (!remoteJid || !id || !message) return;
  const key = `${remoteJid}::${id}`;
  msgCache.set(key, message);
  // Keep cache bounded — evict oldest entries beyond 500
  if (msgCache.size > 500) {
    const firstKey = msgCache.keys().next().value;
    msgCache.delete(firstKey);
  }

  try {
    await MessageCache.updateOne(
      { remoteJid, id },
      { $set: { message } },
      { upsert: true }
    );
  } catch (err) {
    console.error('Failed to cache message in MongoDB:', err.message);
  }
};
const getCachedMsg = async (remoteJid, id) => {
  if (!remoteJid || !id) return null;
  const key = `${remoteJid}::${id}`;
  if (msgCache.has(key)) {
    return msgCache.get(key);
  }

  try {
    const record = await MessageCache.findOne({ remoteJid, id });
    if (record && record.message) {
      msgCache.set(key, record.message);
      return record.message;
    }
  } catch (err) {
    console.error('Failed to retrieve cached message from MongoDB:', err.message);
  }
  return null;
};

let sock            = null;
let clientStatus    = 'DISCONNECTED';
let qrCodeData      = null;
let statusCallbacks = [];
let shouldReconnect  = true;
let isInitializing   = false;   // prevents concurrent initWhatsApp calls

const AUTH_FOLDER = path.join(__dirname, '../tokens/baileys-auth');

const getClient      = () => sock;
const getStatus      = () => clientStatus;
const getQR          = () => qrCodeData;
const onStatusChange = (cb) => statusCallbacks.push(cb);

const broadcastStatus = (status, extra = {}) => {
  clientStatus = status;
  statusCallbacks = statusCallbacks.filter(cb => {
    if (cb.__removed) return false; // SSE client disconnected
    try { cb({ status, ...extra }); return true; } catch { return false; }
  });
};

// ── Init WhatsApp ─────────────────────────────────────────────────────────────
const initWhatsApp = async () => {
  if (sock) return sock;
  if (isInitializing) {
    // Another init is in progress — wait for it to finish (max 30s)
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (sock) return sock;
      if (!isInitializing) break;
    }
    return sock;
  }
  isInitializing  = true;
  shouldReconnect = true;

  try {
    broadcastStatus('INITIALIZING');

    if (!fs.existsSync(AUTH_FOLDER)) {
      fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version }          = await fetchLatestBaileysVersion();

    console.log(`🚀 Starting Baileys v${version.join('.')}`);

    const msgRetryCounterCache = new Map();

    sock = makeWASocket({
      version,
      auth: state,
      logger:                        pino({ level: 'silent' }),
      printQRInTerminal:             false,
      browser:                       ['FreshMeat Shop', 'Chrome', '1.0.0'],
      connectTimeoutMs:              60_000,
      defaultQueryTimeoutMs:         60_000,
      keepAliveIntervalMs:           10_000,
      retryRequestDelayMs:           250,
      generateHighQualityLinkPreview: false,
      syncFullHistory:               false,
      markOnlineOnConnect:           false,
      msgRetryCounterCache,

      // Supply original message on retry — prevents "Waiting for this message"
      getMessage: async (key) => {
        const cached = await getCachedMsg(key.remoteJid, key.id);
        if (cached) return cached;
        // Return a minimal valid message so Baileys can re-encrypt the retry
        return { extendedTextMessage: { text: '' } };
      },


    });

    // Save credentials whenever they change
    sock.ev.on('creds.update', saveCreds);

    // ── Build LID → phone map ──────────────────────────────────────────────────
    const storeContact = (contact) => {
      if (!contact) return;
      const id  = contact.id  || '';
      const lid = contact.lid || '';
      if (id && lid) {
        lidToPhone.set(lid, id);
        lidToPhone.set(lid.split('@')[0], id.split('@')[0]);
      }
    };

    sock.ev.on('contacts.upsert', (contacts) => {
      contacts.forEach(storeContact);
      contactsReady = true;
      console.log(`📋 Contacts synced: ${lidToPhone.size} LID→phone mappings`);
      // Process any messages that arrived before contacts were ready
      if (lidMsgQueue.length > 0) {
        console.log(`🔄 Processing ${lidMsgQueue.length} queued @lid messages`);
        const queued = lidMsgQueue.splice(0);
        for (const [msg, client] of queued) {
          (async () => {
            try {
              const { ConversationFlow } = require('./conversationFlow');
              const normalized = normalizeMessage(msg);
              if (normalized) await ConversationFlow.handleMessage(normalized, client);
            } catch(e) { console.error('Queued msg error:', e.message); }
          })();
        }
      }
    });

    sock.ev.on('contacts.update', (updates) => {
      updates.forEach(storeContact);
    });

    // ── Connection lifecycle ──────────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeData = await qrcode.toDataURL(qr);
          broadcastStatus('QR_READY', { qr: qrCodeData });
          console.log('📱 QR Code ready — scan with WhatsApp');
        } catch (e) {
          console.error('QR generation error:', e.message);
        }
      }

      if (connection === 'connecting') {
        broadcastStatus('INITIALIZING');
        console.log('🔄 Connecting to WhatsApp...');
      }

      if (connection === 'open') {
        qrCodeData = null;
        broadcastStatus('CONNECTED');
        console.log('✅ WhatsApp connected! User:', sock.user?.id || 'unknown');
        // Ensure queued @lid messages are processed even if contacts.upsert is slow
        setTimeout(() => {
          if (!contactsReady) {
            contactsReady = true;
            console.log(`⏰ Contacts sync timeout — processing ${lidMsgQueue.length} queued messages`);
            const queued = lidMsgQueue.splice(0);
            for (const [msg, client] of queued) {
              (async () => {
                try {
                  const { ConversationFlow } = require('./conversationFlow');
                  const normalized = normalizeMessage(msg);
                  if (normalized) await ConversationFlow.handleMessage(normalized, client);
                } catch(e) { console.error('Queued msg error:', e.message); }
              })();
            }
          }
        }, 15000); // wait 15s for contacts.upsert, then force-process
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut  = statusCode === DisconnectReason.loggedOut;

        console.log(`🔌 Connection closed. Code: ${statusCode} | LoggedOut: ${loggedOut}`);
        sock       = null;
        qrCodeData = null;

        if (loggedOut) {
          try { fs.rmSync(AUTH_FOLDER, { recursive: true, force: true }); } catch {}
          broadcastStatus('DISCONNECTED');
          if (shouldReconnect) {
            console.log('🔄 Logged out — restarting for fresh QR in 3s...');
            setTimeout(() => initWhatsApp().catch(console.error), 3_000);
          }
        } else if (shouldReconnect) {
          broadcastStatus('RECONNECTING');
          console.log('🔄 Reconnecting in 5s...');
          setTimeout(() => initWhatsApp().catch(console.error), 5_000);
        } else {
          broadcastStatus('DISCONNECTED');
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message) continue;

        const msgId = msg.key.id;
        const now = Date.now();

        // 1. Synchronous In-memory check (performed IMMEDIATELY before any async/await statements to block race conditions)
        if (msgId && !msg.key.fromMe) {
          if (processedMsgIds.has(msgId) && (now - processedMsgIds.get(msgId)) < 15000) {
            console.log(`ℹ️ Duplicate message ignored in memory (sync): ${msgId}`);
            continue;
          }
          processedMsgIds.set(msgId, now);
        }

        // Cache every message so getMessage can return it on retry
        await cacheMsg(msg.key.remoteJid, msg.key.id, msg.message);

        if (msg.key.fromMe) continue;

        if (msgId) {
          // 2. Database check (prevents duplicate processing across multiple running processes/servers)
          try {
            const ProcessedMessage = require('../models/ProcessedMessage');
            await ProcessedMessage.create({ msgId });
          } catch (err) {
            if (err.code === 11000) {
              console.log(`ℹ️ Duplicate message ignored in DB: ${msgId}`);
              continue;
            }
            console.error('Failed to save ProcessedMessage to MongoDB:', err.message);
          }

          // Keep map bounded to prevent memory leaks (clear entries older than 30 seconds)
          if (processedMsgIds.size > 1000) {
            const expirationTime = now - 30000;
            for (const [k, time] of processedMsgIds.entries()) {
              if (time < expirationTime) {
                processedMsgIds.delete(k);
              }
            }
          }
        }

        try {
          const { ConversationFlow } = require('./conversationFlow');
          const normalized = normalizeMessage(msg);
          if (normalized) await ConversationFlow.handleMessage(normalized, sock);
        } catch (err) {
          console.error('Message handler error:', err.message);
        }
      }
    });



    isInitializing = false;
    return sock;

  } catch (err) {
    isInitializing = false;
    console.error('❌ Baileys init error:', err.message);
    broadcastStatus('ERROR', { error: err.message });
    sock = null;
    throw err;
  }
};

// ── Normalize Baileys raw message → consistent shape for conversationFlow ─────
const normalizeMessage = (msg) => {
  let remoteJid = msg.key?.remoteJid || '';

  // @lid JIDs are passed through as-is — conversationFlow.resolvePhone handles DB lookup

  const isGroup = remoteJid.endsWith('@g.us');
  const m         = msg.message || {};

  const body = (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    ''
  ).trim();

  let type = 'chat';
  if (m.buttonsResponseMessage)   type = 'buttons_response';
  else if (m.listResponseMessage) type = 'list_response';

  if (!body && type === 'chat') return null;

  return { from: remoteJid, body, type, isGroupMsg: isGroup };
};

// ── Format phone → Baileys JID ────────────────────────────────────────────────
const formatPhone = (phone) => {
  let c = String(phone).replace(/\D/g, '');
  if (c.startsWith('0')) c = '91' + c.slice(1);
  if (!c.startsWith('91') && c.length === 10) c = '91' + c;
  return c + '@s.whatsapp.net';
};

// ── Self-send check ───────────────────────────────────────────────────────────
const isSelfSend = (target, hostId) => {
  if (!hostId) return false;
  const targetNum = target.split('@')[0].replace(/\D/g, '');
  const host      = String(hostId).split(':')[0].split('@')[0].replace(/\D/g, '');
  return (
    targetNum === host ||
    targetNum === '91' + host ||
    '91' + targetNum === host
  );
};

// ── Retry helper ──────────────────────────────────────────────────────────────
const sendWithRetry = async (fn, target, retries = 2, delay = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`⚠️ [WA] Send to ${target} failed (${attempt}/${retries}): ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
};

// ── Send text ─────────────────────────────────────────────────────────────────
const sendTextMessage = async (phone, text) => {
  if (!sock) throw new Error('WhatsApp not connected');
  const jid    = formatPhone(phone);
  const hostId = sock.user?.id || '';

  if (isSelfSend(jid, hostId)) {
    console.log(`⚠️ [WA] Self-send detected for ${jid}. Skipping.`);
    return { success: true, selfSend: true };
  }

  console.log(`📤 [WA] Sending text to ${jid}: "${text.replace(/\n/g, ' ').slice(0, 40)}..."`);
  return sendWithRetry(async () => {
    const res = await sock.sendMessage(jid, { text });
    // Cache sent message immediately so getMessage can serve it on retry
    if (res?.key?.id) {
      await cacheMsg(res.key.remoteJid || jid, res.key.id, res.message || { conversation: text });
    }
    console.log(`✅ [WA] Text sent to ${jid}`);
    return res;
  }, jid);
};

// ── Send image ────────────────────────────────────────────────────────────────
const sendImageMessage = async (phone, imagePath, caption = '') => {
  if (!sock) throw new Error('WhatsApp not connected');
  const jid    = formatPhone(phone);
  const hostId = sock.user?.id || '';

  if (isSelfSend(jid, hostId)) {
    console.log(`⚠️ [WA] Self-send detected for ${jid}. Skipping.`);
    return { success: true, selfSend: true };
  }

  console.log(`📤 [WA] Sending image to ${jid}: "${caption.slice(0, 30)}"`);
  return sendWithRetry(async () => {
    const imageSource = (typeof imagePath === 'string' && imagePath.startsWith('http'))
      ? { url: imagePath }
      : fs.readFileSync(imagePath);
    const res = await sock.sendMessage(jid, { image: imageSource, caption });
    // Cache sent image message immediately
    if (res?.key?.id && res?.message) {
      await cacheMsg(res.key.remoteJid || jid, res.key.id, res.message);
    }
    console.log(`✅ [WA] Image sent to ${jid}`);
    return res;
  }, jid);
};

// ── Send buttons (text fallback) ──────────────────────────────────────────────
const sendButtons = async (phone, text, buttons, title = '', footer = '') => {
  if (!sock) throw new Error('WhatsApp not connected');
  const jid   = formatPhone(phone);
  const lines = buttons.map((btn, i) => `${i + 1}. ${btn.buttonText?.displayText || btn.id}`).join('\n');
  const fullText = [
    title  ? `*${title}*` : '',
    text,
    lines,
    footer ? `_${footer}_` : '',
  ].filter(Boolean).join('\n\n');
  return sendWithRetry(async () => {
    const res = await sock.sendMessage(jid, { text: fullText });
    if (res?.key?.id && res?.message) {
      await cacheMsg(res.key.remoteJid || jid, res.key.id, res.message);
    }
    return res;
  }, jid);
};

// ── Send Poll ─────────────────────────────────────────────────────────────────
const sendPoll = async (phone, name, choices) => {
  if (!sock) throw new Error('WhatsApp not connected');
  const jid = formatPhone(phone);
  console.log(`📤 [WA] Sending poll to ${jid}: "${name}"`);
  return sendWithRetry(async () => {
    const res = await sock.sendMessage(jid, {
      poll: { name, values: choices, selectableCount: 1 },
    });
    if (res?.key?.id && res?.message) {
      await cacheMsg(res.key.remoteJid || jid, res.key.id, res.message);
    }
    console.log(`✅ [WA] Poll sent to ${jid}`);
    return res;
  }, jid);
};

// ── Send list/menu (text fallback) ────────────────────────────────────────────
const sendListMenu = async (phone, options) => {
  if (!sock) throw new Error('WhatsApp not connected');
  const jid = formatPhone(phone);
  let text = options.description ? `${options.description}\n\n` : '';
  for (const section of (options.sections || [])) {
    if (section.title) text += `*${section.title}*\n`;
    for (const row of (section.rows || [])) {
      text += `• ${row.title}${row.description ? ' — ' + row.description : ''}\n`;
    }
  }
  if (options.buttonText) text += `\n_${options.buttonText}_`;
  return sendWithRetry(async () => {
    const res = await sock.sendMessage(jid, { text: text.trim() });
    if (res?.key?.id && res?.message) {
      await cacheMsg(res.key.remoteJid || jid, res.key.id, res.message);
    }
    return res;
  }, jid);
};

// ── Disconnect ────────────────────────────────────────────────────────────────
const disconnectWhatsApp = async () => {
  shouldReconnect = false;
  if (sock) {
    try { await sock.logout(); } catch {}
    sock = null;
  }
  qrCodeData = null;
  broadcastStatus('DISCONNECTED');
};

module.exports = {
  initWhatsApp,
  getClient,
  getStatus,
  getQR,
  onStatusChange,
  sendTextMessage,
  sendImageMessage,
  sendButtons,
  sendPoll,
  sendListMenu,
  formatPhone,
  isSelfSend,
  disconnectWhatsApp,
};