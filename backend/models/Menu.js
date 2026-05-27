const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, enum: ['mutton', 'chicken', 'special'], required: true },
  price: { type: Number, required: true },
  unit: { type: String, default: 'kg' },
  description: { type: String, default: '' },
  available: { type: Boolean, default: true },
  imageUrl: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Menu', menuSchema);