const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Contact = require('../models/Contact');
const { getClient } = require('../utils/whatsappService');
const { ConversationFlow } = require('../utils/conversationFlow');

// Get all orders
router.get('/', async (req, res) => {
  const { status, date } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end   = new Date(date); end.setHours(23, 59, 59, 999);
    filter.createdAt = { $gte: start, $lte: end };
  }
  const orders = await Order.find(filter).sort('-createdAt');
  res.json({ success: true, orders });
});

// Get single order
router.get('/stats/summary', async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [total, todayOrders, revenue, pending] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: today } }),
    Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    Order.countDocuments({ status: { $in: ['confirmed', 'preparing'] } }),
  ]);
  res.json({
    success: true,
    stats: {
      totalOrders: total,
      todayOrders,
      totalRevenue: revenue[0]?.total || 0,
      pendingOrders: pending,
    }
  });
});

router.get('/:id', async (req, res) => {
  const order = await Order.findOne({ orderId: req.params.id });
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, order });
});

// Update order status + send WhatsApp notification
router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  const order = await Order.findOneAndUpdate(
    { orderId: req.params.id },
    { status, ...(status === 'delivered' ? { deliveredAt: new Date() } : {}) },
    { new: true }
  );

  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  // Reduce stock if order is delivered (completed)
  if (status === 'delivered') {
    const Menu = require('../models/Menu');
    for (const item of order.items) {
      if (item.menuItem) {
        await Menu.findByIdAndUpdate(item.menuItem, { $inc: { stockQty: -item.quantity } })
          .catch((err) => console.error(`Failed to reduce stock on order completion:`, err.message));
      }
    }
  }

  // Send WhatsApp notification
  const client = getClient();
  if (client) {
    try {
      if (status === 'preparing') {
        await ConversationFlow.sendDeliveryUpdate(order.customerPhone, order.orderId, 'preparing');
      } else if (status === 'out_for_delivery') {
        await ConversationFlow.sendDeliveryUpdate(order.customerPhone, order.orderId, 'out_for_delivery');
      } else if (status === 'delivered') {
        await ConversationFlow.sendThankYouMessage(order.customerPhone, order.orderId);
        await Contact.findOneAndUpdate(
          { phone: order.customerPhone },
          { $inc: { ordersPlaced: 1 } }
        );
      }
    } catch (e) {
      console.error('WA notification failed:', e.message);
    }
  }

  res.json({ success: true, order });
});

// Delete order + restore stock + send WhatsApp notification to customer
router.delete('/:id', async (req, res) => {
  const order = await Order.findOne({ orderId: req.params.id });
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  // Block deletion of completed (delivered) orders
  if (order.status === 'delivered') {
    return res.status(400).json({ success: false, message: 'Cannot cancel or delete a completed order' });
  }



  // 2. Send WhatsApp notification
  const client = getClient();
  if (client) {
    try {
      const { sendTextMessage, formatPhone } = require('../utils/whatsappService');
      const cancelMsg = `❌ *ORDER CANCELLED*
──────────────────────
🆔 Order ID: *${order.orderId}*
──────────────────────
😔 Your order has been cancelled and deleted by the store admin.

If you have any questions, please contact us. 🙏`;
      await sendTextMessage(formatPhone(order.customerPhone), cancelMsg);
    } catch (e) {
      console.error('Failed to send cancellation message:', e.message);
    }
  }

  // 3. Delete order from database
  await Order.deleteOne({ orderId: req.params.id });

  res.json({ success: true, message: 'Order deleted successfully' });
});

module.exports = router;