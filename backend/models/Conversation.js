const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  phone:            { type: String, required: true, unique: true },
  state:            { type: String, default: 'IDLE' },
  selectedItems:    { type: Array,  default: [] },
  currentItemIndex: { type: Number, default: 0 },
  templateId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Template', default: null },
  // LID (WhatsApp Linked ID) — stored when first message arrives so future
  // messages from the same @lid JID can be matched to this phone number
  lid:              { type: String, default: null, index: true },
  updatedAt:        { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);