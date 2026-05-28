const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  category:       { type: String, enum: ['mutton', 'chicken', 'special'], required: true },
  price:          { type: Number, required: true },
  unit:           { type: String, default: 'kg' },
  description:    { type: String, default: '' },
  available:      { type: Boolean, default: true },
  imageUrl:       { type: String, default: '' },
  stockQty:       { type: Number, default: null },   // null = not tracked
  stockThreshold: { type: Number, default: 5 },      // warn when qty <= this
}, { timestamps: true });

menuSchema.virtual('isLowStock').get(function () {
  if (this.stockQty === null) return false;
  return this.stockQty <= this.stockThreshold;
});

menuSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Menu', menuSchema);