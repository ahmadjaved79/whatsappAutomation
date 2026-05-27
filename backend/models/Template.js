const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  footer: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  contacts: [{ type: String }],
  totalSent: { type: Number, default: 0 },
  interested: { type: Number, default: 0 },
  notInterested: { type: Number, default: 0 },
  ordersGenerated: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['draft', 'sending', 'completed', 'failed'], // ✅ added 'failed'
    default: 'draft'
  },
  sentAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Template', templateSchema);