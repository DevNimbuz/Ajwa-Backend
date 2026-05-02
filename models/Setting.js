/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Flyajwa — Setting Model (Mongoose)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Key-value store for dynamic site configuration
 * Examples: contact_phones, whatsapp_number, announcement
 */

const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed, // Can store any type (string, array, object)
    required: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Setting', SettingSchema);
