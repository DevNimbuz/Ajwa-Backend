/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa — Auth Routes
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * POST /api/auth/login    — Login with email + password → JWT
 * GET  /api/auth/me       — Get current authenticated user
 * PUT  /api/auth/password  — Change password
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
const { getClientIP, detectDevice } = require('../middleware/security');

/**
 * Utility: Set secure HttpOnly cookie
 */
const setTokenCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax', // Allows navigation from external but prevents CSRF
    // No 'expires' or 'Max-Age' -> Session Cookie (clears on browser close)
  });
};

const { body, validationResult } = require('express-validator');

// ══════════════════════════════════════════════
// POST /api/auth/login — Authenticate user
// ══════════════════════════════════════════════
router.post('/login', [
  loginLimiter,
  body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { email, password } = req.body;
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const device = detectDevice(userAgent);

    // Find user by email
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      // Log generic failure to avoid account enumeration if possible, 
      // but here we already have the email so we log it
      await AuditLog.create({
        action: 'LOGIN_FAILURE',
        email,
        ip: clientIP,
        userAgent,
        device,
        category: 'HAZARD',
        reason: 'Failed login attempt: Account does not exist'
      });
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const remainingMin = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(403).json({ 
        success: false, 
        message: `Account is temporarily locked due to multiple failed attempts. Try again in ${remainingMin} minutes.` 
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated' });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      // Brute force protection: Increment failures
      user.failedLoginAttempts += 1;
      let message = 'Invalid email or password';
      
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000; // Lock for 15 mins
        message = 'Account locked for 15 minutes due to multiple failed attempts.';
      }
      
      await user.save();

      await AuditLog.create({
        action: 'LOGIN_FAILURE',
        user: user._id,
        email: user.email,
        ip: clientIP,
        userAgent,
        device,
        category: 'HAZARD',
        reason: `Failed login attempt: Incorrect password (Attempt ${user.failedLoginAttempts})`
      });
      
      return res.status(401).json({ success: false, message });
    }

    // Success: Reset brute force tracking
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Capture successful login
    await AuditLog.create({
      action: 'LOGIN_SUCCESS',
      user: user._id,
      email: user.email,
      ip: clientIP,
      userAgent,
      device,
      category: 'SUCCESS',
      reason: 'Successful administrator login'
    });

    const token = user.generateToken();
    setTokenCookie(res, token);

    res.json({
      success: true,
      token,
      user: user.toSafeJSON(),
    });
  } catch (error) {
    console.error('[Auth] Login error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/logout — Clear cookie
// ══════════════════════════════════════════════
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out' });
});

// ══════════════════════════════════════════════
// GET /api/auth/logs — Admin Security Logs
// ══════════════════════════════════════════════
router.get('/logs', requireAuth, async (req, res) => {
  try {
    // Only allow admins to see logs
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(500);

    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('[Auth] Logs error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// DELETE /api/auth/logs — Clear all audit logs
// ══════════════════════════════════════════════
router.delete('/logs', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Only super admins can clear logs' });
    }

    await AuditLog.deleteMany({});
    
    // Log the clear action itself so there's an audit trail of the deletion
    await AuditLog.create({
      action: 'LOGS_CLEARED',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'CAUTION',
      reason: 'Administrator manually cleared all security and audit logs'
    });

    res.json({ success: true, message: 'Audit logs cleared successfully' });
  } catch (error) {
    console.error('[Auth] Clear logs error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/unlock — Manually unlock a user
// ══════════════════════════════════════════════
router.post('/unlock', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'User email is required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Log the unlock action
    await AuditLog.create({
      action: 'USER_UNLOCKED',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'SYSTEM',
      reason: `Administrator manually unlocked account for: ${email}`
    });

    res.json({ success: true, message: `Account for ${email} has been unlocked` });
  } catch (error) {
    console.error('[Auth] Unlock error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// GET /api/auth/me — Get current user profile
// ══════════════════════════════════════════════
router.get('/me', requireAuth, async (req, res) => {
  try {
    res.json({ success: true, user: req.user.toSafeJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// PUT /api/auth/password — Change password
// ══════════════════════════════════════════════
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    // Reset token version (Invalidate all other sessions)
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.password = newPassword;
    await user.save();

    // Log password change
    await AuditLog.create({
      action: 'PASSWORD_CHANGE',
      user: user._id,
      email: user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'CAUTION',
      reason: 'User successfully changed their account password'
    });

    // Generate new token & reset cookie
    const token = user.generateToken();
    setTokenCookie(res, token);

    res.json({ success: true, message: 'Password updated successfully and all other sessions revoked', token });
  } catch (error) {
    console.error('[Auth] Password change error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
