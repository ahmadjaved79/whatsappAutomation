const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  state: { type: String, default: 'IDLE' },
  selectedItems: { type: Array, default: [] },
  currentItemIndex: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);