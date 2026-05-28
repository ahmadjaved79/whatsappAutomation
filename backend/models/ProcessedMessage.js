const mongoose = require('mongoose');

const processedMessageSchema = new mongoose.Schema({
  msgId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // 24 hours TTL
});

module.exports = mongoose.model('ProcessedMessage', processedMessageSchema);
