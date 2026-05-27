const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  title: { type: String, required: true }, // Header text
  message: { type: String, required: true }, // Main message text
  footer: { type: String, default: '' }, // Footer text
  imageUrl: { type: String, default: '' },
  contacts: [{ type: String }],
  totalSent: { type: Number, default: 0 },
  interested: { type: Number, default: 0 },
  notInterested: { type: Number, default: 0 },
  ordersGenerated: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'sending', 'completed'], default: 'draft' },
  sentAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Template', templateSchema);
