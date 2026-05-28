const mongoose = require('mongoose');

const messageCacheSchema = new mongoose.Schema({
  remoteJid: { type: String, required: true },
  id:        { type: String, required: true },
  message:   { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: 604800 } // 7 days
});

// Compound unique index on remoteJid and id for fast lookups and deduplication
messageCacheSchema.index({ remoteJid: 1, id: 1 }, { unique: true });

module.exports = mongoose.model('MessageCache', messageCacheSchema);
