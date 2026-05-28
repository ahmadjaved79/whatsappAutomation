const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  title:           { type: String, required: true },
  message:         { type: String, required: true },
  footer:          { type: String, default: '' },
  imageUrl:        { type: String, default: '' },
  contacts:        [{ type: String }],
  totalSent:       { type: Number, default: 0 },
  totalFailed:     { type: Number, default: 0 },
  interested:      { type: Number, default: 0 },
  notInterested:   { type: Number, default: 0 },
  ordersGenerated: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['draft', 'sending', 'completed', 'failed', 'scheduled'],
    default: 'draft',
  },
  sentAt:       Date,
  // Scheduling
  isScheduled:  { type: Boolean, default: false },
  scheduleTime: { type: String, default: '' },     // "HH:MM"
  repeatDaily:  { type: Boolean, default: false },
  scheduleDays: [{ type: String }],                // ['mon','tue',...] empty = every day
  lastRunAt:    { type: Date },
  nextRunAt:    { type: Date },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Template', templateSchema);