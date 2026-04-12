const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 
      'PASSWORD_CHANGE', 'UNAUTHORIZED_ACCESS', 'PERMISSION_DENIED',
      'SETTINGS_UPDATE', 'PACKAGE_MUTATION', 'USER_MUTATION', 'LEAD_EXPORT',
      'USER_REGISTRATION', 'EMAIL_VERIFY', 'PHONE_VERIFY'
    ],
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // May be null for failed logins
  },
  email: {
    type: String,
    required: false, // The email used for the attempt
  },
  ip: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
    required: true,
  },
  device: {
    type: String,
    enum: ['mobile', 'tablet', 'desktop', 'unknown'],
    default: 'unknown'
  },
  category: {
    type: String,
    required: true,
    enum: ['SUCCESS', 'HAZARD', 'SYSTEM', 'CAUTION'],
    default: 'SUCCESS'
  },
  reason: {
    type: String, // Explicit description (e.g. "Unauthorized attempt to access /admin/leads")
    required: false,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // For storing flexible data (e.g. packageId, settingKey)
    required: false,
  },
  details: {
    type: String,
    required: false,
  }
}, {
  timestamps: true,
});

// Create index for fast searching and automatic cleanup after 90 days
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
AuditLogSchema.index({ user: 1 });
AuditLogSchema.index({ action: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
