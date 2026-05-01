/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa — Settings Routes
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * GET /api/settings     — Get all settings (admin)
 * PUT /api/settings     — Update settings (super admin)
 * GET /api/settings/public — Get public settings (public)
 */

const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireSuperAdmin } = require('../proxy/auth');
const { getClientIP, detectDevice } = require('../proxy/security');

// ══════════════════════════════════════════════
// GET /api/settings/public — Public settings (contact info, etc.)
// ══════════════════════════════════════════════
router.get('/public', async (req, res) => {
  try {
    const publicKeys = ['contact_phones', 'contact_email', 'whatsapp_number', 'announcement', 'currency_symbol'];
    const settings = await Setting.find({ key: { $in: publicKeys } });

    const result = {};
    settings.forEach(s => { result[s.key] = s.value; });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// GET /api/settings — Get all settings (ADMIN)
// ══════════════════════════════════════════════
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const settings = await Setting.find();
    const result = {};
    settings.forEach(s => { result[s.key] = s.value; });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// PUT /api/settings — Update settings (SUPER ADMIN)
// Body: { key: "contact_phones", value: ["+91 98466 17000"] }
// Or batch: { settings: [{ key: "...", value: "..." }, ...] }
// ══════════════════════════════════════════════
router.put('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { key, value, settings: batchSettings } = req.body;

    // Batch update
    if (batchSettings && Array.isArray(batchSettings)) {
      for (const setting of batchSettings) {
        await Setting.findOneAndUpdate(
          { key: setting.key },
          { key: setting.key, value: setting.value },
          { upsert: true, new: true }
        );
      }

      await AuditLog.create({
        action: 'SETTINGS_UPDATE',
        user: req.user._id,
        email: req.user.email,
        ip: getClientIP(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        device: detectDevice(req.headers['user-agent']),
        category: 'SYSTEM',
        reason: `Bulk update of ${batchSettings.length} system settings`,
        metadata: { keys: batchSettings.map(s => s.key) }
      });

      return res.json({ success: true, message: `${batchSettings.length} settings updated` });
    }

    // Single update
    if (!key) {
      return res.status(400).json({ success: false, message: 'Setting key is required' });
    }

    await Setting.findOneAndUpdate(
      { key },
      { key, value },
      { upsert: true, new: true }
    );

    await AuditLog.create({
      action: 'SETTINGS_UPDATE',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'SYSTEM',
      reason: `Updated system setting: "${key}"`,
      metadata: { key, newValue: value }
    });

    res.json({ success: true, message: `Setting "${key}" updated` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
