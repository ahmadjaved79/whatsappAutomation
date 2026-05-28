const Order        = require('../models/Order');
const Contact      = require('../models/Contact');
const Menu         = require('../models/Menu');
const Conversation = require('../models/Conversation');
const { v4: uuidv4 } = require('uuid');
const { sendTextMessage, sendImageMessage } = require('./whatsappService');

const STATES = {
  IDLE: 'IDLE',
  AWAITING_INTEREST: 'AWAITING_INTEREST',
  AWAITING_ITEM_SELECTION: 'AWAITING_ITEM_SELECTION',
  AWAITING_QUANTITY: 'AWAITING_QUANTITY',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
};

const sleep   = (ms) => new Promise(r => setTimeout(r, ms));
const digits  = (phone) => String(phone).replace(/\D/g, '');

const toSendPhone = (phone) => {
  const d = digits(phone);
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  return d.slice(-10);
};
const toDbPhone = (phone) => toSendPhone(phone);

// ── Resolve @lid or @c.us to actual phone ────────────────────────────────────
const resolvePhone = async (message, client) => {
  const from = String(message.from || '');
  if (from.includes('@lid')) {
    console.log(`🔍 Resolving LID: ${from}`);
    try {
      const entry = await client.getPnLidEntry(from);
      console.log('PnLid resolved:', JSON.stringify(entry));
      if (entry?.phoneNumber?.user) return digits(entry.phoneNumber.user);
      if (entry?.phoneNumber?._serialized) return digits(entry.phoneNumber._serialized.replace('@c.us', ''));
    } catch (e) { console.log('getPnLidEntry failed:', e.message); }
    try {
      const contact = await client.getContact(from);
      if (contact?.number) return digits(contact.number);
      if (contact?.id?.user) return digits(contact.id.user);
    } catch (e) { console.log('getContact failed:', e.message); }
    try { const chat = await client.getChatById(from); if (chat?.id?.user) return digits(chat.id.user); } catch {}
    const fallback = digits(from.replace(/@[\w.]+/g, ''));
    console.log(`⚠️ LID fallback: ${fallback}`);
    return fallback;
  }
  const raw = digits(from.replace('@c.us', ''));
  return toDbPhone(raw);
};

// ── Session helpers ───────────────────────────────────────────────────────────
const setSession = async (phone, data) => {
  const key = toDbPhone(phone);
  await Conversation.findOneAndUpdate({ phone: key }, { ...data, updatedAt: new Date() }, { upsert: true, new: true });
};

const findActiveSession = async (phone) => {
  const d = digits(phone);
  let s = await Conversation.findOne({ phone: d, state: { $ne: STATES.IDLE } });
  if (s) return { session: s, key: d };
  if (d.startsWith('91') && d.length === 12) {
    const short = d.slice(2);
    s = await Conversation.findOne({ phone: short, state: { $ne: STATES.IDLE } });
    if (s) return { session: s, key: short };
  }
  if (d.length === 10) {
    s = await Conversation.findOne({ phone: '91' + d, state: { $ne: STATES.IDLE } });
    if (s) { await Conversation.findOneAndUpdate({ phone: '91' + d }, { phone: d }); return { session: s, key: d }; }
  }
  return { session: null, key: toDbPhone(d) };
};

// ── Contact update with segment refresh ───────────────────────────────────────
const updateContact = async (key, status, extra = {}) => {
  try {
    const phone10 = toSendPhone(key);
    const c = await Contact.findOneAndUpdate(
      { phone: phone10 },
      { lastStatus: status, ...extra },
      { upsert: true, new: true }
    );
    if (c && typeof c.refreshSegment === 'function') { c.refreshSegment(); await c.save(); }
  } catch {}
};

// ── STOP — opt-out ────────────────────────────────────────────────────────────
const handleOptOut = async (phone) => {
  const phone10 = toSendPhone(phone);
  await Contact.findOneAndUpdate({ phone: phone10 }, { optedOut: true, optedOutAt: new Date(), lastStatus: 'opted_out' }, { upsert: true });
  await setSession(phone, { state: STATES.IDLE });
  await sendTextMessage(phone10,
    `✅ You have been unsubscribed from FreshMeat Shop.\nYou will no longer receive messages.\n\nReply *START* anytime to re-subscribe. 🙏`
  );
  console.log(`🚫 ${phone10} opted out`);
};

// ── START — opt-in ────────────────────────────────────────────────────────────
const handleOptIn = async (phone) => {
  const phone10 = toSendPhone(phone);
  await Contact.findOneAndUpdate({ phone: phone10 }, { optedOut: false, $unset: { optedOutAt: '' }, lastStatus: 'opted_in' }, { upsert: true });
  await sendTextMessage(phone10, `👋 Welcome back! You are now subscribed again.\nReply *ORDER* to place an order 🥩`);
};

// ── Main message handler ──────────────────────────────────────────────────────
const handleMessage = async (message, client) => {
  if (message.isGroupMsg) return;
  if (!['chat', 'buttons_response', 'list_response'].includes(message.type)) return;

  const rawPhone = await resolvePhone(message, client);
  const phone    = toDbPhone(rawPhone);
  const body     = (message.selectedButtonId || message.selectedRowId || message.body || '').trim().toLowerCase();

  console.log(`📨 [${phone}] msg="${body}" (raw: ${message.from})`);

  // Handle STOP/START before anything else
  if (body === 'stop' || body === 'unsubscribe') { await handleOptOut(phone); return; }
  if (body === 'start' || body === 'subscribe')  { await handleOptIn(phone);  return; }

  // Check opted-out
  const contact = await Contact.findOne({ phone: toSendPhone(phone) });
  if (contact?.optedOut) { console.log(`⛔ ${phone} opted out — ignoring`); return; }

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
    await sendTextMessage(toSendPhone(phone), '👋 Hello! Reply *ORDER* to place an order 🥩\n\n_Reply STOP to unsubscribe_');
  }
};

// ── Template start ────────────────────────────────────────────────────────────
const startTemplate = async (phone, imageUrl, templateText, headerText, footerText, client) => {
  const d  = toDbPhone(phone);
  const sp = toSendPhone(phone);

  const contact = await Contact.findOne({ phone: sp });
  if (contact?.optedOut) { console.log(`⛔ Skipping opted-out: ${sp}`); return; }

  await setSession(d, { state: STATES.AWAITING_INTEREST, selectedItems: [], currentItemIndex: 0 });
  console.log(`📤 Template session set for: ${d}`);

  const name  = contact?.name  || '';
  const email = contact?.email || '';
  const personalize = (text) => !text ? '' : text.replace(/{Name}/gi, name).replace(/{Email}/gi, email).replace(/{Phone}/gi, phone);

  const pHeader  = personalize(headerText || 'Fresh Stock Available!');
  const pMessage = personalize(templateText);
  const pFooter  = personalize(footerText || '');

  if (imageUrl) {
    try { await sendImageMessage(sp, imageUrl, pHeader); await sleep(1500); }
    catch (e) { console.log('Image send failed:', e.message); }
  }

  let combinedText = `*${pHeader}*\n\n${pMessage}`;
  if (pFooter) combinedText += `\n\n_${pFooter}_`;
  combinedText += `\n\n🛒 *Are you interested?*\n1️⃣ Yes, Interested!\n2️⃣ No, Not Interested\n\n_Reply STOP to unsubscribe_`;
  await sendTextMessage(sp, combinedText);
};

// ── Interest response ─────────────────────────────────────────────────────────
const handleInterestResponse = async (key, body, session) => {
  const sp  = toSendPhone(key);
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

// ── Send menu ─────────────────────────────────────────────────────────────────
const sendMenuItems = async (sp) => {
  const items = await Menu.find({ available: true }).sort('category name');
  if (!items.length) { await sendTextMessage(sp, '😔 Menu not available. Please call us!'); return; }

  let txt = `🍖 *TODAY'S FRESH MENU* 🍗\n──────────────────────\n\n`;
  items.forEach((item, i) => {
    const e = item.category === 'mutton' ? '🐑' : item.category === 'chicken' ? '🐔' : '⭐';
    txt += `*${i + 1}.* ${e} *${item.name}*\n    💰 ₹${item.price} / ${item.unit}\n`;
    if (item.description) txt += `    _${item.description}_\n`;
    if (item.stockQty !== null && item.stockQty !== undefined && item.stockQty <= item.stockThreshold) txt += `    ⚠️ _Limited stock!_\n`;
    txt += '\n';
  });
  txt += `──────────────────────\n📝 *Select by number*\nExample: *1* or *1,3* or *2,4,5*\n✅ Multiple items allowed!`;
  await sendTextMessage(sp, txt);
};

// ── Item selection ────────────────────────────────────────────────────────────
const handleItemSelection = async (key, body, session) => {
  const sp = toSendPhone(key);
  if (body === 'menu') { await sendMenuItems(sp); return; }

  const items   = await Menu.find({ available: true }).sort('category name');
  const indices = body.split(/[,\s]+/).map(n => parseInt(n.trim()) - 1)
    .filter(n => !isNaN(n) && n >= 0 && n < items.length);

  if (!indices.length) { await sendTextMessage(sp, `❌ Invalid. Enter numbers like *1* or *1,3*\nType *menu* to see menu again.`); return; }

  const selected = [...new Set(indices)].map(i => ({
    item: { _id: items[i]._id, name: items[i].name, price: items[i].price, unit: items[i].unit, category: items[i].category },
    quantity: 0,
  }));
  await setSession(key, { state: STATES.AWAITING_QUANTITY, selectedItems: selected, currentItemIndex: 0 });
  await askQuantity(sp, selected[0].item);
};

// ── Ask quantity ──────────────────────────────────────────────────────────────
const askQuantity = async (sp, item) => {
  const e = item.category === 'mutton' ? '🐑' : item.category === 'chicken' ? '🐔' : '⭐';
  await sendTextMessage(sp, `${e} *${item.name}*\n💰 ₹${item.price} per ${item.unit}\n\n📦 How many *${item.unit}*?\n_(e.g. *0.5* = 500g, *1* = 1kg)_`);
};

// ── Quantity input ────────────────────────────────────────────────────────────
const handleQuantityInput = async (key, body, session) => {
  const sp  = toSendPhone(key);
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

// ── Confirm order ─────────────────────────────────────────────────────────────
const confirmOrder = async (key, sp, selectedItems) => {
  const orderId = 'ORD-' + uuidv4().slice(0, 8).toUpperCase();
  let total = 0, itemsSummary = '';

  const orderItems = selectedItems.map(({ item, quantity }) => {
    const amount = Math.round(item.price * quantity * 100) / 100;
    total += amount;
    itemsSummary += `  • ${item.name}: ${quantity} ${item.unit} = ₹${amount}\n`;
    return { menuItem: item._id, name: item.name, quantity, unit: item.unit, price: item.price, total: amount };
  });

  // Deduct stock
  for (const { item, quantity } of selectedItems) {
    await Menu.findByIdAndUpdate(item._id, { $inc: { stockQty: -quantity } }).catch(() => {});
  }

  const order = new Order({ orderId, customerPhone: toSendPhone(key), items: orderItems, totalAmount: total, status: 'confirmed' });
  await order.save();
  await setSession(key, { state: STATES.ORDER_CONFIRMED, selectedItems: [], currentItemIndex: 0 });

  // Update contact stats + segment
  await updateContact(key, 'ordered', { $inc: { ordersPlaced: 1, totalSpend: total }, lastOrderAt: new Date() });

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
};

// ── Delivery updates ──────────────────────────────────────────────────────────
const sendDeliveryUpdate = async (phone, orderId, status) => {
  const sp   = toSendPhone(digits(phone));
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

const sendNotInterestedMessage = async (sp) => {
  await sendTextMessage(sp,
`😊 *No problem! Thank you!*
──────────────────────
🥩 Fresh stock available daily!
📢 We'll notify you next time!

Ready to order? Reply *ORDER* 🛒
_Reply STOP to unsubscribe_
— *FreshMeat Shop* 🍖`
  );
};

// ── Poll response ─────────────────────────────────────────────────────────────
const processedPolls = new Map();

const handlePollResponse = async (pollResponse, client) => {
  if (!pollResponse.selectedOptions || !Array.isArray(pollResponse.selectedOptions)) return;
  const validOptions = pollResponse.selectedOptions.filter(opt => opt && opt.name);
  if (!validOptions.length) return;

  const selectedText = validOptions[0].name || '';
  const dedupKey = `${pollResponse.msgId || 'default'}_${selectedText}`;
  const now = Date.now();
  if (processedPolls.has(dedupKey) && now < processedPolls.get(dedupKey)) {
    console.log(`ℹ️ Duplicate poll ignored: ${dedupKey}`); return;
  }
  processedPolls.set(dedupKey, now + 3000);
  if (processedPolls.size > 200) { for (const [k, exp] of processedPolls.entries()) { if (now > exp) processedPolls.delete(k); } }

  const fromField = pollResponse.chatId || pollResponse.sender || '';
  const mockMessage = { from: String(fromField), body: selectedText, type: 'chat', isGroupMsg: false };
  console.log(`📨 [poll] raw_from="${fromField}" selected="${selectedText}"`);
  await handleMessage(mockMessage, client);
};

module.exports = {
  ConversationFlow: { handleMessage, handlePollResponse, startTemplate, sendDeliveryUpdate, sendThankYouMessage },
  STATES,
};