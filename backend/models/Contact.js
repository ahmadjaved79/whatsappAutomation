const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  phone:         { type: String, required: true, unique: true },
  name:          { type: String, default: '' },
  email:         { type: String, default: '' },
  source:        { type: String, enum: ['excel', 'manual', 'whatsapp'], default: 'manual' },
  lastStatus:    { type: String, default: 'pending' },
  templatesSent: { type: Number, default: 0 },
  ordersPlaced:  { type: Number, default: 0 },
  totalSpend:    { type: Number, default: 0 },
  lastOrderAt:   { type: Date },
  optedOut:      { type: Boolean, default: false },
  optedOutAt:    { type: Date },
  segment:       { type: String, enum: ['new', 'regular', 'vip'], default: 'new' },
}, { timestamps: true });

// Auto-compute segment based on orders placed
contactSchema.methods.refreshSegment = function () {
  if (this.ordersPlaced >= 5)      this.segment = 'vip';
  else if (this.ordersPlaced >= 2) this.segment = 'regular';
  else                              this.segment = 'new';
};

module.exports = mongoose.model('Contact', contactSchema);