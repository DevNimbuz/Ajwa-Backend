/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa — User/Team Management Routes
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * All routes require SUPER_ADMIN role
 * GET    /api/users         — List team members
 * POST   /api/users         — Create team member
 * PUT    /api/users/:id     — Update team member
 * DELETE /api/users/:id     — Delete team member
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { getClientIP, detectDevice } = require('../middleware/security');

// All routes require super admin
router.use(requireAuth, requireSuperAdmin);

// ══════════════════════════════════════════════
// GET /api/users — List all team members
// ══════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/users — Create new team member
// ══════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const { email, password, name, phone, role } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'Email, password, and name are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    // Check if email exists
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Create user (password will be hashed by pre-save hook)
    const user = await User.create({
      email: email.toLowerCase().trim(),
      password,
      name: name.trim(),
      phone: phone?.trim(),
      role: role || 'TEAM',
    });

    await AuditLog.create({
      action: 'USER_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'SYSTEM',
      reason: `Account Created: New team member "${user.name}" added`,
      metadata: { targetUserId: user._id, role: user.role }
    });

    res.status(201).json({ success: true, data: user.toSafeJSON() });
  } catch (error) {
    console.error('[Users] Create error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ══════════════════════════════════════════════
// PUT /api/users/:id — Update team member
// ══════════════════════════════════════════════
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, role, isActive, password } = req.body;
    const update = {};

    if (name) update.name = name.trim();
    if (phone !== undefined) update.phone = phone?.trim();
    if (role) update.role = role;
    if (isActive !== undefined) update.isActive = isActive;

    // If password is being reset
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
      }
      // Hash password manually since findByIdAndUpdate skips pre-save hooks
      const bcrypt = require('bcryptjs');
      update.password = await bcrypt.hash(password, 12);
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await AuditLog.create({
      action: 'USER_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'CAUTION',
      reason: `Account Modified: Updates made to team member "${user.name}"`,
      metadata: { targetUserId: user._id, updates: { role, isActive, password: !!password } }
    });

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// DELETE /api/users/:id — Delete team member
// ══════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  try {
    // Prevent deleting yourself
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await AuditLog.create({
      action: 'USER_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'CAUTION',
      reason: `Account Deleted: Team member account "${user.name}" removed`,
      metadata: { targetUserId: user._id, name: user.name }
    });

    res.json({ success: true, message: `User ${user.name} deleted` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
