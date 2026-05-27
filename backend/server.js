require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/template', require('./routes/template'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/menu', require('./routes/menu'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message });
});

// MongoDB connect
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mutton_chicken_shop')
  .then(() => {
    console.log('✅ MongoDB connected');
    // Auto-init WhatsApp
    const { initWhatsApp } = require('./utils/whatsappService');
    initWhatsApp().catch(err => console.error('❌ Auto-init WhatsApp failed:', err.message));
  })
  .catch(err => console.error('❌ MongoDB error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app;