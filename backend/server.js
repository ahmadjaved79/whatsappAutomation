require('dotenv').config();
require('express-async-errors');
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const path     = require('path');
const cron     = require('node-cron');

const app = express();

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/whatsapp',  require('./routes/whatsapp'));
app.use('/api/contacts',  require('./routes/contacts'));
app.use('/api/template',  require('./routes/template'));
app.use('/api/orders',    require('./routes/orders'));
app.use('/api/menu',      require('./routes/menu'));
app.use('/api/analytics', require('./routes/analytics'));

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message });
});

// ── MongoDB + startup ─────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mutton_chicken_shop')
  .then(async () => {
    console.log('✅ MongoDB connected');

    // Auto-init WhatsApp — delay slightly so server is fully ready first
    const { initWhatsApp } = require('./utils/whatsappService');
    setTimeout(() => {
      initWhatsApp().catch(err => console.error('❌ Auto-init WhatsApp failed:', err.message));
    }, 1000);

    // Cron: run scheduled broadcasts every minute
    const { runScheduledTemplates } = require('./routes/template');
    cron.schedule('* * * * *', async () => {
      try { await runScheduledTemplates(); }
      catch (e) { console.error('Scheduler error:', e.message); }
    });
    console.log('⏰ Broadcast scheduler started');
  })
  .catch(err => console.error('❌ MongoDB error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app;