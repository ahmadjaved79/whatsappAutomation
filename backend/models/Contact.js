const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  source: { type: String, enum: ['excel', 'manual', 'whatsapp'], default: 'manual' },
  lastStatus: { type: String, default: 'pending' },
  templatesSent: { type: Number, default: 0 },
  ordersPlaced: { type: Number, default: 0 },
  optedOut: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Contact', contactSchema);