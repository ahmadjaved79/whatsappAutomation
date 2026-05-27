const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu' },
  name: String,
  quantity: Number,
  unit: String,
  price: Number,
  total: Number,
});

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, required: true },
  customerPhone: { type: String, required: true },
  customerName: { type: String, default: '' },
  items: [orderItemSchema],
  totalAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'confirmed',
  },
  notes: String,
  deliveredAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);