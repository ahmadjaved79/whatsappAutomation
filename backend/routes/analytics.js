const express = require('express');
const router  = express.Router();
const Order   = require('../models/Order');
const Contact = require('../models/Contact');

// GET /api/analytics/revenue?period=daily|weekly|monthly
// Revenue = ONLY delivered orders
router.get('/revenue', async (req, res) => {
  const period = req.query.period || 'daily';
  let groupId, daysBack;

  if (period === 'monthly')     { groupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };  daysBack = 365; }
  else if (period === 'weekly') { groupId = { year: { $year: '$createdAt' }, week: { $week: '$createdAt' } };    daysBack = 90;  }
  else                          { groupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } }; daysBack = 30; }

  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const data = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, status: 'delivered' } }, // ← delivered only
    { $group: { _id: groupId, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
  ]);

  res.json({ success: true, period, data });
});

// GET /api/analytics/top-items
router.get('/top-items', async (req, res) => {
  const data = await Order.aggregate([
    { $match: { status: 'delivered' } },
    { $unwind: '$items' },
    { $group: { _id: '$items.name', qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.total' }, orders: { $sum: 1 } } },
    { $sort: { revenue: -1 } },
    { $limit: 10 },
  ]);
  res.json({ success: true, data });
});

// GET /api/analytics/summary
// Revenue counts ONLY delivered orders
router.get('/summary', async (req, res) => {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart  = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [
    totalOrders, todayOrders, weekOrders, monthOrders,
    totalRevenue, todayRevenue, weekRevenue, monthRevenue,
    totalContacts, vipCount, regularCount, newCount, pendingOrders,
  ] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: todayStart } }),
    Order.countDocuments({ createdAt: { $gte: weekStart } }),
    Order.countDocuments({ createdAt: { $gte: monthStart } }),
    // Revenue = delivered only
    Order.aggregate([{ $match: { status: 'delivered' } }, { $group: { _id: null, t: { $sum: '$totalAmount' } } }]),
    Order.aggregate([{ $match: { status: 'delivered', createdAt: { $gte: todayStart } } }, { $group: { _id: null, t: { $sum: '$totalAmount' } } }]),
    Order.aggregate([{ $match: { status: 'delivered', createdAt: { $gte: weekStart  } } }, { $group: { _id: null, t: { $sum: '$totalAmount' } } }]),
    Order.aggregate([{ $match: { status: 'delivered', createdAt: { $gte: monthStart } } }, { $group: { _id: null, t: { $sum: '$totalAmount' } } }]),
    Contact.countDocuments({ optedOut: false }),
    Contact.countDocuments({ segment: 'vip' }),
    Contact.countDocuments({ segment: 'regular' }),
    Contact.countDocuments({ segment: 'new' }),
    Order.countDocuments({ status: { $in: ['confirmed', 'preparing'] } }),
  ]);

  res.json({
    success: true,
    summary: {
      orders:   { total: totalOrders, today: todayOrders, week: weekOrders, month: monthOrders, pending: pendingOrders },
      revenue:  { total: totalRevenue[0]?.t || 0, today: todayRevenue[0]?.t || 0, week: weekRevenue[0]?.t || 0, month: monthRevenue[0]?.t || 0 },
      contacts: { total: totalContacts, vip: vipCount, regular: regularCount, new: newCount },
    },
  });
});

// GET /api/analytics/customer/:phone
router.get('/customer/:phone', async (req, res) => {
  const contact = await Contact.findOne({ phone: req.params.phone });
  const orders  = await Order.find({ customerPhone: req.params.phone }).sort('-createdAt').limit(50);
  res.json({ success: true, contact, orders });
});

module.exports = router;