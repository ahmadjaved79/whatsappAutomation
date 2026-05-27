const wppconnect = require('@wppconnect-team/wppconnect');
const path = require('path');

let client = null;
let clientStatus = 'DISCONNECTED';
let qrCodeData = null;
let statusCallbacks = [];

const getClient = () => client;
const getStatus = () => clientStatus;
const getQR = () => qrCodeData;
const onStatusChange = (cb) => statusCallbacks.push(cb);

const broadcastStatus = (status, extra = {}) => {
  clientStatus = status;
  statusCallbacks = statusCallbacks.filter(cb => {
    try { cb({ status, ...extra }); return true; } catch { return false; }
  });
};

const initWhatsApp = async () => {
  if (client) return client;
  try {
    broadcastStatus('INITIALIZING');

    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ||
      (process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '/usr/bin/google-chrome');

    client = await wppconnect.create({
      session: process.env.SESSION_NAME || 'mutton-shop',

      catchQR: (base64Qr) => {
        qrCodeData = base64Qr;
        broadcastStatus('QR_READY', { qr: base64Qr });
        console.log('📱 QR Code ready — scan with WhatsApp');
      },

      statusFind: (statusSession) => {
        console.log('WPP Status:', statusSession);
        if (statusSession === 'inChat' || statusSession === 'isLogged') {
          broadcastStatus('CONNECTED');
          qrCodeData = null;
        } else if (statusSession === 'browserClose' || statusSession === 'serverClose') {
          broadcastStatus('DISCONNECTED');
          client = null;
        }
        // notLogged = waiting for QR scan — do NOT disconnect here
      },

      headless: true,
      devtools: false,
      useChrome: true,
      debug: false,
      logQR: false,
      disableWelcome: true,
      updatesLog: false,
      autoClose: 0,
      tokenStore: 'file',
      folderNameToken: path.join(__dirname, '../tokens'),

      puppeteerOptions: {
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-software-rasterizer',
        ],
      },
    });

    client.onMessage(async (message) => {
      try {
        const { ConversationFlow } = require('./conversationFlow');
        await ConversationFlow.handleMessage(message, client);
      } catch (err) {
        console.error('Message handler error:', err.message);
      }
    });

    client.onPollResponse(async (pollResponse) => {
      try {
        const { ConversationFlow } = require('./conversationFlow');
        await ConversationFlow.handlePollResponse(pollResponse, client);
      } catch (err) {
        console.error('Poll response handler error:', err.message);
      }
    });

    try {
      const me = (typeof client.getMe === 'function') ? await client.getMe().catch(() => null) : null;
      const hostInfo = await client.getHostDevice().catch(() => null);
      let meUser = null;
      try {
        meUser = await client.page.evaluate(() => {
          return typeof WPP !== 'undefined' ? WPP.conn.getMeUser() : null;
        });
      } catch {}

      // ── FIX: Strip @c.us / @lid suffix and normalise to pure digits ────────
      // getMeUser() can return '91XXXXXXXXXX@c.us', '91XXXXXXXXXX@lid', or just '91XXXXXXXXXX'
      // We must strip the suffix BEFORE storing hostUser so exact-match logic works correctly.
      const stripSuffix = (val) => {
        if (!val) return '';
        return String(val).split('@')[0].replace(/\D/g, '');
      };

      client.hostUser =
        stripSuffix(typeof meUser === 'string' ? meUser : meUser?.user) ||
        stripSuffix(me?.wid?._serialized || me?.wid?.user || '') ||
        stripSuffix(client.wid?.user || '') ||
        stripSuffix(hostInfo?.id?.user || hostInfo?.wid?.user || '') ||
        '';

      console.log('👤 Connected as host user:', client.hostUser || 'unknown');
    } catch (e) {
      console.log('Failed to fetch host device user:', e.message);
    }

    broadcastStatus('CONNECTED');
    console.log('✅ WhatsApp connected!');
    return client;

  } catch (err) {
    console.error('❌ WPP Error:', err.message);
    broadcastStatus('ERROR', { error: err.message });
    client = null;
    throw err;
  }
};

// ── Format phone to WhatsApp ID ──────────────────────────────────────────────
const formatPhone = (phone) => {
  let c = String(phone).replace(/\D/g, '');
  if (c.startsWith('0')) c = '91' + c.slice(1);
  if (!c.startsWith('91') && c.length === 10) c = '91' + c;
  return c + '@c.us';
};

// ── BUG FIX: Exact self-send check (replaces unsafe startsWith) ──────────────
// OLD CODE used target.startsWith(client.hostUser) which caused FALSE POSITIVES:
//   e.g. if hostUser was '86392717' (truncated) it would block ANY number whose
//   formatted string BEGAN with those digits — including real customers.
// NEW CODE: normalises both sides to pure digits then checks exact equality,
//   also accounting for the 91-prefix variant.
const isSelfSend = (target, hostUser) => {
  if (!hostUser) return false;
  const targetNum = target.split('@')[0].replace(/\D/g, ''); // e.g. '918639271799'
  const host      = String(hostUser).replace(/\D/g, '');     // e.g. '918639271799' or '8639271799'
  return (
    targetNum === host ||                   // exact match with same prefix style
    targetNum === '91' + host ||            // target has 91, host doesn't
    '91' + targetNum === host               // host has 91, target doesn't (unlikely but safe)
  );
};

// Helper for retrying message sends with built-in error handling
const sendWithRetry = async (fn, target, retries = 2, delay = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.message && err.message.includes('msgChunks')) {
        console.warn(`⚠️ [WA-Service] Skipping send to ${target} due to msgChunks error (likely self-send).`);
        return { success: true, selfSend: true, skipped: true, reason: 'msgChunks' };
      }
      if (attempt === retries) throw err;
      console.log(`⚠️ [WA-Service] Send to ${target} failed (attempt ${attempt}/${retries}): ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
};

// ── Send text ────────────────────────────────────────────────────────────────
const sendTextMessage = async (phone, text) => {
  if (!client) throw new Error('WhatsApp not connected');
  const target = formatPhone(phone);

  // ── FIX: use exact isSelfSend() instead of startsWith ───────────────────
  if (isSelfSend(target, client.hostUser)) {
    console.log(`⚠️ [WA-Service] Self-send detected for ${target} (hostUser=${client.hostUser}). Skipping.`);
    return { success: true, selfSend: true };
  }

  console.log(`📤 [WA-Service] Sending text to ${target}: "${text.replace(/\n/g, ' ').slice(0, 40)}..."`);
  return sendWithRetry(async () => {
    const res = await client.sendText(target, text);
    console.log(`✅ [WA-Service] Text sent to ${target}`);
    return res;
  }, target);
};

// ── Send image ───────────────────────────────────────────────────────────────
const sendImageMessage = async (phone, imagePath, caption = '') => {
  if (!client) throw new Error('WhatsApp not connected');
  const target = formatPhone(phone);

  if (isSelfSend(target, client.hostUser)) {
    console.log(`⚠️ [WA-Service] Self-send detected for ${target}. Skipping.`);
    return { success: true, selfSend: true };
  }

  console.log(`📤 [WA-Service] Sending image to ${target} with caption: "${caption.slice(0, 30)}..."`);
  return sendWithRetry(async () => {
    const res = await client.sendImage(target, imagePath, 'image', caption);
    console.log(`✅ [WA-Service] Image sent to ${target}`);
    return res;
  }, target);
};

// ── Send buttons (up to 3) ───────────────────────────────────────────────────
const sendButtons = async (phone, text, buttons, title = '', footer = '') => {
  if (!client) throw new Error('WhatsApp not connected');
  const target = formatPhone(phone);

  if (isSelfSend(target, client.hostUser)) {
    console.log(`⚠️ [WA-Service] Self-send detected for ${target}. Skipping.`);
    return { success: true, selfSend: true };
  }

  console.log(`📤 [WA-Service] Sending template buttons to ${target}`);
  return sendWithRetry(async () => {
    const formattedButtons = buttons.map(btn => ({
      id: btn.buttonId,
      text: btn.buttonText.displayText
    }));
    const res = await client.sendText(target, text, {
      useInteractiveMessage: true,
      buttons: formattedButtons,
      title: title || undefined,
      footer: footer || undefined
    });
    console.log(`✅ [WA-Service] Buttons sent to ${target}`);
    return res;
  }, target);
};

// ── Send Poll Message ────────────────────────────────────────────────────────
const sendPoll = async (phone, name, choices) => {
  if (!client) throw new Error('WhatsApp not connected');
  const target = formatPhone(phone);

  if (isSelfSend(target, client.hostUser)) {
    console.log(`⚠️ [WA-Service] Self-send detected for ${target}. Skipping.`);
    return { success: true, selfSend: true };
  }

  console.log(`📤 [WA-Service] Sending poll to ${target}: "${name}" with choices: [${choices.join(', ')}]`);
  return sendWithRetry(async () => {
    const res = await client.sendPollMessage(target, name, choices, { selectableCount: 1 });
    console.log(`✅ [WA-Service] Poll sent to ${target}`);
    return res;
  }, target);
};

// ── Send list/menu message ───────────────────────────────────────────────────
const sendListMenu = async (phone, options) => {
  if (!client) throw new Error('WhatsApp not connected');
  const chatId = formatPhone(phone);

  if (isSelfSend(chatId, client.hostUser)) {
    console.log(`⚠️ [WA-Service] Self-send detected for ${chatId}. Skipping.`);
    return { success: true, selfSend: true };
  }

  return sendWithRetry(async () => {
    return client.sendListMessage(chatId, options);
  }, chatId);
};

// ── Disconnect ───────────────────────────────────────────────────────────────
const disconnectWhatsApp = async () => {
  if (client) {
    try { await client.close(); } catch {}
    client = null;
    broadcastStatus('DISCONNECTED');
  }
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