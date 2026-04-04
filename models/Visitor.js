/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa — Visitor Model (Mongoose)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Anonymous page view tracking for analytics
 * Privacy-preserving: IPs are hashed, no PII stored
 * Auto-expires after 90 days (TTL index)
 */

const mongoose = require('mongoose');

const VisitorSchema = new mongoose.Schema({
  page: {
    type: String,
    required: true,     // URL path visited e.g. "/package/maldives-package"
    index: true,
  },
  referrer: String,     // Where they came from
  userAgent: String,    // Raw user agent string
  ipHash: String,       // SHA-256 hashed IP (privacy)
  device: {
    type: String,
    enum: ['mobile', 'tablet', 'desktop', 'unknown'],
    default: 'unknown',
  },
  // ── UTM Tracking ──
  utmSource: String,
  utmMedium: String,
  utmCampaign: String,
  // ── Session ──
  sessionId: String,    // Anonymous session identifier
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ── Auto-delete visitor records after 90 days ──
VisitorSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('Visitor', VisitorSchema);
