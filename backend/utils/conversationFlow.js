const Order = require('../models/Order');
const Contact = require('../models/Contact');
const Menu = require('../models/Menu');
const Conversation = require('../models/Conversation');
const { v4: uuidv4 } = require('uuid');
const { sendTextMessage, sendImageMessage, sendButtons } = require('./whatsappService');

const STATES = {
  IDLE: 'IDLE',
  AWAITING_INTEREST: 'AWAITING_INTEREST',
  AWAITING_ITEM_SELECTION: 'AWAITING_ITEM_SELECTION',
  AWAITING_QUANTITY: 'AWAITING_QUANTITY',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const digits = (phone) => String(phone).replace(/\D/g, '');

// ── Normalise any phone format to 10-digit for sendTextMessage ───────────────
const toSendPhone = (phone) => {
  const d = digits(phone);
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  return d.slice(-10);
};

// ── Normalise any phone format to 10-digit for DB storage ────────────────────
// Always store sessions as 10-digit numbers so lookups are consistent.
const toDbPhone = (phone) => {
  const d = digits(phone);
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  return d.slice(-10);
};

// ── Resolve @lid or @c.us to actual phone number ─────────────────────────────
const resolvePhone = async (message, client) => {
  const from = String(message.from || '');

  // @lid = WhatsApp privacy LID — must resolve via getPnLidEntry/getContact
  if (from.includes('@lid')) {
    console.log(`🔍 Resolving LID: ${from}`);
    try {
      const entry = await client.getPnLidEntry(from);
      console.log('PnLid entry resolved:', JSON.stringify(entry));
      if (entry?.phoneNumber?.user) return digits(entry.phoneNumber.user);
      if (entry?.phoneNumber?._serialized) return digits(entry.phoneNumber._serialized.replace('@c.us', ''));
    } catch (e) {
      console.log('getPnLidEntry failed:', e.message);
    }

    try {
      const contact = await client.getContact(from);
      console.log('Contact resolved:', JSON.stringify({
        number: contact?.number,
        id: contact?.id,
        pushname: contact?.pushname,
      }));
      if (contact?.number) return digits(contact.number);
      if (contact?.id?.user) return digits(contact.id.user);
      if (contact?.id?._serialized) return digits(contact.id._serialized.replace('@c.us','').replace('@lid',''));
    } catch (e) {
      console.log('getContact failed:', e.message);
    }

    // Try getChatById as fallback
    try {
      const chat = await client.getChatById(from);
      if (chat?.id?.user) return digits(chat.id.user);
    } catch {}

    // Last resort: extract digit sequence from LID — log clearly so it can be debugged
    const fallback = digits(from.replace(/@[\w.]+/g, ''));
    console.log(`⚠️ LID resolution exhausted for ${from}. Using raw digits: ${fallback}. This may cause session mismatch.`);
    return fallback;
  }

  // Standard @c.us format — strip suffix and country code if present
  const raw = digits(from.replace('@c.us', ''));
  return toDbPhone(raw);
};

// ── Session helpers ──────────────────────────────────────────────────────────
// FIX: Always store sessions using the normalised 10-digit key so lookups never fail
// due to 91-prefix mismatches.
const setSession = async (phone, data) => {
  const key = toDbPhone(phone);
  await Conversation.findOneAndUpdate(
    { phone: key },
    { ...data, updatedAt: new Date() },
    { upsert: true, new: true }
  );
};

// ── Smart session finder ─────────────────────────────────────────────────────
const findActiveSession = async (phone) => {
  const d = digits(phone);

  // 1. Exact match
  let s = await Conversation.findOne({ phone: d, state: { $ne: STATES.IDLE } });
  if (s) return { session: s, key: d };

  // 2. Without 91 prefix
  if (d.startsWith('91') && d.length === 12) {
    const short = d.slice(2);
    s = await Conversation.findOne({ phone: short, state: { $ne: STATES.IDLE } });
    if (s) return { session: s, key: short };
  }

  // 3. With 91 prefix
  if (d.length === 10) {
    s = await Conversation.findOne({ phone: '91' + d, state: { $ne: STATES.IDLE } });
    if (s) {
      // Migrate the old 12-digit key to 10-digit for future consistency
      await Conversation.findOneAndUpdate({ phone: '91' + d }, { phone: d });
      return { session: s, key: d };
    }
  }

  // 4. Partial match — extract 10-digit Indian mobile substrings
  if (d.length > 12) {
    for (let i = 0; i <= d.length - 10; i++) {
      const sub = d.slice(i, i + 10);
      if (['6','7','8','9'].includes(sub[0])) {
        s = await Conversation.findOne({ phone: { $in: [sub, '91'+sub] }, state: { $ne: STATES.IDLE } });
        if (s) {
          await Conversation.findOneAndUpdate({ phone: s.phone }, { phone: toDbPhone(d) });
          return { session: s, key: toDbPhone(d) };
        }
      }
    }
  }

  return { session: null, key: toDbPhone(d) };
};

// ── Main message handler ─────────────────────────────────────────────────────
const handleMessage = async (message, client) => {
  if (message.isGroupMsg) return;
  if (!['chat', 'buttons_response', 'list_response'].includes(message.type)) return;

  // Resolve actual phone number (handles both @c.us and @lid)
  const rawPhone = await resolvePhone(message, client);
  const phone    = toDbPhone(rawPhone);   // always 10 digits
  const body = (message.selectedButtonId || message.selectedRowId || message.body || '').trim().toLowerCase();

  console.log(`📨 [${phone}] msg="${body}" (raw: ${message.from})`);

  const { session, key } = await findActiveSession(phone);

  if (session) {
    console.log(`✅ Session found: state=${session.state} key=${key}`);
    if (session.state === STATES.AWAITING_INTEREST)       return handleInterestResponse(key, body, session);
    if (session.state === STATES.AWAITING_ITEM_SELECTION) return handleItemSelection(key, body, session);
    if (session.state === STATES.AWAITING_QUANTITY)        return handleQuantityInput(key, body, session);
    if (session.state === STATES.ORDER_CONFIRMED) {
      if (['order','reorder','again'].includes(body)) {
        await sendMenuItems(toSendPhone(key));
        await setSession(key, { state: STATES.AWAITING_ITEM_SELECTION, selectedItems: [], currentItemIndex: 0 });
      }
      return;
    }
  } else {
    console.log(`⚠️  No active session for [${phone}]`);
    const all = await Conversation.find({ state: { $ne: STATES.IDLE } });
    console.log('Active sessions:', all.map(s => `${s.phone}(${s.state})`).join(', ') || 'none');
  }

  if (body === 'order') {
    await sendMenuItems(toSendPhone(phone));
    await setSession(phone, { state: STATES.AWAITING_ITEM_SELECTION, selectedItems: [], currentItemIndex: 0 });
  } else if (['hi','hello','hlo','hey'].includes(body)) {
    await sendTextMessage(toSendPhone(phone), '👋 Hello! Reply *ORDER* to place an order 🥩');
  }
};

// ── Step 1: Send template ────────────────────────────────────────────────────
const startTemplate = async (phone, imageUrl, templateText, headerText, footerText, client) => {
  // FIX: always store session with 10-digit key
  const d = toDbPhone(phone);
  await setSession(d, { state: STATES.AWAITING_INTEREST, selectedItems: [], currentItemIndex: 0 });
  console.log(`📤 Template session set for: ${d}`);

  const sp = toSendPhone(phone);

  // Fetch contact details for dynamic personalisation
  const contact = await Contact.findOne({ phone: d });
  const name  = contact ? contact.name  : '';
  const email = contact ? contact.email : '';

  const personalize = (text) => {
    if (!text) return '';
    return text
      .replace(/{Name}/gi,  name  || '')
      .replace(/{Email}/gi, email || '')
      .replace(/{Phone}/gi, phone || '');
  };

  const pHeader  = personalize(headerText || 'Fresh Stock Available!');
  const pMessage = personalize(templateText);
  const pFooter  = personalize(footerText || '');

  // Send optional image first
  if (imageUrl) {
    try {
      await sendImageMessage(sp, imageUrl, pHeader);
      await sleep(1500);
    } catch (imgErr) {
      console.log('Failed sending template image header:', imgErr.message);
    }
  }

  // Send the personalised template message with numbered text options
  let combinedText = `*${pHeader}*\n\n${pMessage}`;
  if (pFooter) combinedText += `\n\n_${pFooter}_`;
  combinedText += `\n\n🛒 *Are you interested?*\n1️⃣ Yes, Interested!\n2️⃣ No, Not Interested`;

  await sendTextMessage(sp, combinedText);
};

// ── Step 2: Interest response ────────────────────────────────────────────────
const handleInterestResponse = async (key, body, session) => {
  const sp = toSendPhone(key);
  const yes = ['1','yes','interested','haan','ok','okay','sure','ha','yep','yeah','y'].some(w => body === w || body.startsWith(w));
  const no  = ['2','no','nahi','nope','not','nahin','n'].some(w => body === w || body.startsWith(w));

  if (yes) {
    await sendTextMessage(sp, '🎉 Great! Let me show you today\'s fresh menu...');
    await sleep(800);
    await sendMenuItems(sp);
    await setSession(key, { state: STATES.AWAITING_ITEM_SELECTION });
  } else if (no) {
    await sendNotInterestedMessage(sp);
    await setSession(key, { state: STATES.IDLE });
    await updateContact(key, 'not_interested');
  } else {
    await sendTextMessage(sp, `⚠️ Please reply:\n*1* ✅ Yes, Interested!\n*2* ❌ No, Not Interested`);
  }
};

// ── Step 3: Send menu ────────────────────────────────────────────────────────
const sendMenuItems = async (sp) => {
  const items = await Menu.find({ available: true }).sort('category name');
  if (!items.length) { await sendTextMessage(sp, '😔 Menu not available. Please call us!'); return; }

  let txt = `🍖 *TODAY'S FRESH MENU* 🍗\n──────────────────────\n\n`;
  items.forEach((item, i) => {
    const e = item.category === 'mutton' ? '🐑' : item.category === 'chicken' ? '🐔' : '⭐';
    txt += `*${i + 1}.* ${e} *${item.name}*\n    💰 ₹${item.price} / ${item.unit}\n`;
    if (item.description) txt += `    _${item.description}_\n`;
    txt += '\n';
  });
  txt += `──────────────────────\n📝 *Select by number*\nExample: *1* or *1,3* or *2,4,5*\n✅ Multiple items allowed!`;
  await sendTextMessage(sp, txt);
};

// ── Step 4: Item selection ───────────────────────────────────────────────────
const handleItemSelection = async (key, body, session) => {
  const sp = toSendPhone(key);
  if (body === 'menu') { await sendMenuItems(sp); return; }

  const items = await Menu.find({ available: true }).sort('category name');
  const indices = body.split(/[,\s]+/).map(n => parseInt(n.trim()) - 1)
    .filter(n => !isNaN(n) && n >= 0 && n < items.length);

  if (!indices.length) {
    await sendTextMessage(sp, `❌ Invalid. Enter numbers like *1* or *1,3*\nType *menu* to see menu again.`);
    return;
  }
  const selected = [...new Set(indices)].map(i => ({
    item: { _id: items[i]._id, name: items[i].name, price: items[i].price, unit: items[i].unit, category: items[i].category },
    quantity: 0
  }));
  await setSession(key, { state: STATES.AWAITING_QUANTITY, selectedItems: selected, currentItemIndex: 0 });
  await askQuantity(sp, selected[0].item);
};

// ── Step 5: Ask quantity ─────────────────────────────────────────────────────
const askQuantity = async (sp, item) => {
  const e = item.category === 'mutton' ? '🐑' : item.category === 'chicken' ? '🐔' : '⭐';
  await sendTextMessage(sp,
    `${e} *${item.name}*\n💰 ₹${item.price} per ${item.unit}\n\n📦 How many *${item.unit}*?\n_(e.g. *0.5* = 500g, *1* = 1kg)_`
  );
};

// ── Step 6: Quantity input ───────────────────────────────────────────────────
const handleQuantityInput = async (key, body, session) => {
  const sp = toSendPhone(key);
  const qty = parseFloat(body.replace(/[^\d.]/g, ''));
  if (isNaN(qty) || qty <= 0) { await sendTextMessage(sp, '❌ Enter a valid quantity like *0.5* or *1*'); return; }

  const { selectedItems, currentItemIndex } = session;
  selectedItems[currentItemIndex].quantity = qty;
  const next = currentItemIndex + 1;

  if (next < selectedItems.length) {
    await setSession(key, { selectedItems, currentItemIndex: next });
    await askQuantity(sp, selectedItems[next].item);
  } else {
    await confirmOrder(key, sp, selectedItems);
  }
};

// ── Step 7: Confirm order ────────────────────────────────────────────────────
const confirmOrder = async (key, sp, selectedItems) => {
  const orderId = 'ORD-' + uuidv4().slice(0, 8).toUpperCase();
  let total = 0, itemsSummary = '';

  const orderItems = selectedItems.map(({ item, quantity }) => {
    const amount = Math.round(item.price * quantity * 100) / 100;
    total += amount;
    itemsSummary += `  • ${item.name}: ${quantity} ${item.unit} = ₹${amount}\n`;
    return { menuItem: item._id, name: item.name, quantity, unit: item.unit, price: item.price, total: amount };
  });

  const order = new Order({ orderId, customerPhone: toSendPhone(key), items: orderItems, totalAmount: total, status: 'confirmed' });
  await order.save();
  await setSession(key, { state: STATES.ORDER_CONFIRMED, selectedItems: [], currentItemIndex: 0 });

  await sendTextMessage(sp,
`✅ *ORDER CONFIRMED!*
──────────────────────
🆔 Order ID: *${orderId}*
──────────────────────
📦 *Items Ordered:*
${itemsSummary}──────────────────────
💰 *Total: ₹${total}*
──────────────────────

📍 *Live Tracking:*
✅ Confirmed ← _Now_
⬜ Preparing
⬜ Out for Delivery
⬜ Delivered

⏱ Est. delivery: *30–45 mins* 🙏`
  );
  await updateContact(key, 'ordered');
};

// ── Delivery updates ─────────────────────────────────────────────────────────
const sendDeliveryUpdate = async (phone, orderId, status) => {
  const sp = toSendPhone(digits(phone));
  const msgs = {
    preparing:
`📍 *Order Update - ${orderId}*
──────────────────────
✅ Confirmed
🔄 *Preparing* ← _Now_
⬜ Out for Delivery
⬜ Delivered
──────────────────────
👨‍🍳 *Being freshly prepared!*`,
    out_for_delivery:
`🚚 *On the Way! - ${orderId}*
──────────────────────
✅ Confirmed
✅ Prepared
🚚 *Out for Delivery* ← _Now!_
⬜ Delivered
──────────────────────
📱 *Keep your phone ready!*`,
  };
  await sendTextMessage(sp, msgs[status] || `📦 Order *${orderId}*: *${status}*`);
};

// ── Thank you ────────────────────────────────────────────────────────────────
const sendThankYouMessage = async (phone, orderId) => {
  const sp = toSendPhone(digits(phone));
  await setSession(digits(phone), { state: STATES.IDLE });
  await sendTextMessage(sp,
`🎉 *Delivered! Thank You!*
──────────────────────
✅ Confirmed
✅ Prepared
✅ Delivered
✅ *Done!* 🎊
──────────────────────
⭐ Thank you for choosing *FreshMeat Shop!*
Hope you enjoyed the fresh meat 🥩

🔄 Order again? Reply *ORDER*
— *FreshMeat Shop* 🍖`
  );
};

// ── Not interested ───────────────────────────────────────────────────────────
const sendNotInterestedMessage = async (sp) => {
  await sendTextMessage(sp,
`😊 *No problem! Thank you!*
──────────────────────
🥩 Fresh stock available daily!
📢 We'll notify you next time!

Ready to order? Reply *ORDER* 🛒
— *FreshMeat Shop* 🍖`
  );
};

// ── Poll response handler ─────────────────────────────────────────────────────
// FIX: Was extracting phone from @lid digits directly (wrong). Now delegates to
// resolvePhone() which properly handles LID lookup — same as handleMessage does.
const processedPolls = new Map();

const handlePollResponse = async (pollResponse, client) => {
  if (!pollResponse.selectedOptions || !Array.isArray(pollResponse.selectedOptions)) return;

  const validOptions = pollResponse.selectedOptions.filter(opt => opt && opt.name);
  if (validOptions.length === 0) return;

  const selectedText = validOptions[0].name || '';

  // Deduplicate triggers within 3 seconds for the same message option
  const dedupKey = `${pollResponse.msgId || 'default'}_${selectedText}`;
  const now = Date.now();
  if (processedPolls.has(dedupKey)) {
    const expiry = processedPolls.get(dedupKey);
    if (now < expiry) {
      console.log(`ℹ️ [handlePollResponse] Ignoring duplicate event for key: ${dedupKey}`);
      return;
    }
  }
  processedPolls.set(dedupKey, now + 3000);

  // Periodically clean up expired cache keys
  if (processedPolls.size > 200) {
    for (const [k, exp] of processedPolls.entries()) {
      if (now > exp) processedPolls.delete(k);
    }
  }

  // FIX: Build a proper mock message using chatId/sender so resolvePhone()
  // can correctly handle @lid → real phone resolution (old code just stripped
  // digits from the LID string, which gave wrong numbers).
  const fromField = pollResponse.chatId || pollResponse.sender || '';
  const mockMessage = {
    from: String(fromField),
    body: selectedText,
    type: 'chat',
    isGroupMsg: false,
  };

  console.log(`📨 [poll] raw_from="${fromField}" selected="${selectedText}"`);
  await handleMessage(mockMessage, client);
};

const updateContact = async (key, status) => {
  try {
    const phone10 = toSendPhone(key);
    await Contact.findOneAndUpdate({ phone: phone10 }, { lastStatus: status }, { upsert: true });
  } catch {}
};

module.exports = {
  ConversationFlow: { handleMessage, handlePollResponse, startTemplate, sendDeliveryUpdate, sendThankYouMessage },
  STATES,
};