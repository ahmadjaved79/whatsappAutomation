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

module.exports = router;