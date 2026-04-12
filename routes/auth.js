/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa — Auth Routes
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * POST /api/auth/login       — Login with email + password → JWT
 * GET  /api/auth/me          — Get current authenticated user
 * PUT  /api/auth/password    — Change password
 * POST /api/auth/send-otp    — Send OTP for email/phone verification
 * POST /api/auth/verify-otp  — Verify OTP and complete registration
 * POST /api/auth/resend-otp  — Resend OTP
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
const { getClientIP, detectDevice } = require('../middleware/security');
const { sendOTPEmail } = require('../utils/email');

/**
 * Utility: Set secure HttpOnly cookie
 */
const setTokenCookie = (res, token) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,                      // HTTPS only in production
    sameSite: isProd ? 'None' : 'Lax',  // None = cross-domain (Vercel → Render)
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
// POST /api/auth/send-otp — Send OTP for registration
// ══════════════════════════════════════════════
router.post('/send-otp', [
  body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { email, name, phone, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }

    const crypto = require('crypto');
    const emailOTP = crypto.randomInt(100000, 999999).toString();

    const pendingUser = await User.findOneAndUpdate(
      { email },
      {
        pendingRegistration: {
          name,
          phone,
          email,
          password,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
        emailOTP: {
          code: emailOTP,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
        },
      },
      { upsert: true, new: true }
    );

    // Send email (non-blocking, failures won't crash the request)
    sendOTPEmail({ email, name, otp: emailOTP, type: 'email' })
      .then(result => {
        if (result.method === 'console') {
          console.log(`[OTP] Email OTP for ${email}: ${emailOTP}`);
        }
      })
      .catch(err => {
        console.log(`[OTP] Email OTP for ${email}: ${emailOTP} (email failed: ${err.message})`);
      });

    res.json({
      success: true,
      message: 'OTP sent successfully',
      verifyToken: pendingUser._id.toString(),
      emailMasked: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
      expiresIn: 600,
    });
  } catch (error) {
    console.error('[Auth] Send OTP error:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/verify-otp — Verify OTP and complete registration
// ══════════════════════════════════════════════
router.post('/verify-otp', [
  body('verifyToken').notEmpty().withMessage('Verification token is required'),
  body('emailOTP').isLength({ min: 6, max: 6 }).withMessage('Email OTP must be 6 digits'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { verifyToken, emailOTP } = req.body;

    const user = await User.findById(verifyToken).select('+emailOTP.code +emailOTP.expiresAt +emailOTP.attempts +pendingRegistration');

    if (!user || !user.pendingRegistration) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification session. Please register again.' });
    }

    if (new Date() > user.pendingRegistration.expiresAt) {
      await User.findByIdAndDelete(verifyToken);
      return res.status(400).json({ success: false, message: 'Verification session expired. Please register again.' });
    }

    if (user.emailOTP.attempts >= 5) {
      return res.status(429).json({ success: false, message: 'Too many attempts. Please request a new OTP.' });
    }

    if (user.emailOTP.code !== emailOTP) {
      user.emailOTP.attempts += 1;
      await user.save();
      const remaining = 5 - user.emailOTP.attempts;
      return res.status(400).json({ success: false, message: `Invalid OTP. ${remaining} attempts remaining.` });
    }

    if (new Date() > user.emailOTP.expiresAt) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    const { name, phone, email, password } = user.pendingRegistration;

    user.email = email;
    user.name = name;
    user.phone = phone;
    user.password = password;
    user.role = 'CUSTOMER';
    user.isEmailVerified = true;
    user.isVerified = true;
    user.pendingRegistration = undefined;
    user.emailOTP = undefined;
    await user.save();

    const token = user.generateToken();
    setTokenCookie(res, token);

    await AuditLog.create({
      action: 'USER_REGISTRATION',
      user: user._id,
      email: user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'SYSTEM',
      reason: 'New customer account registered via email OTP verification'
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: user.toSafeJSON(),
    });
  } catch (error) {
    console.error('[Auth] Verify OTP error:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/resend-otp — Resend OTP
// ══════════════════════════════════════════════
router.post('/resend-otp', [
  body('verifyToken').notEmpty().withMessage('Verification token is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { verifyToken } = req.body;

    const user = await User.findById(verifyToken).select('+emailOTP.code +pendingRegistration');

    if (!user || !user.pendingRegistration) {
      return res.status(400).json({ success: false, message: 'Invalid verification session. Please register again.' });
    }

    const crypto = require('crypto');
    const emailOTP = crypto.randomInt(100000, 999999).toString();

    user.emailOTP = {
      code: emailOTP,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    };
    await user.save();

    // Send email (non-blocking)
    sendOTPEmail({
      email: user.pendingRegistration.email,
      name: user.pendingRegistration.name,
      otp: emailOTP,
      type: 'email'
    }).then(result => {
      if (result.method === 'console') {
        console.log(`[OTP] Resent Email OTP: ${emailOTP}`);
      }
    }).catch(err => {
      console.log(`[OTP] Resent Email OTP: ${emailOTP} (email failed: ${err.message})`);
    });

    res.json({
      success: true,
      message: 'OTP resent successfully',
      emailMasked: user.pendingRegistration.email.replace(/(.{2}).*(@.*)/, '$1***$2'),
      expiresIn: 600,
    });
  } catch (error) {
    console.error('[Auth] Resend OTP error:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/logout — Clear cookie
// ══════════════════════════════════════════════
router.post('/send-otp', [
  body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { email, name, phone, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }

    const crypto = require('crypto');
    const emailOTP = crypto.randomInt(100000, 999999).toString();
    const phoneOTP = crypto.randomInt(100000, 999999).toString();

    const pendingUser = await User.findOneAndUpdate(
      { email, pendingRegistration: { $exists: true } },
      {
        pendingRegistration: {
          name,
          phone,
          email,
          password,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
        emailOTP: {
          code: emailOTP,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
        },
        phoneOTP: {
          code: phoneOTP,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
        },
      },
      { upsert: true, new: true, select: '+emailOTP.code +phoneOTP.code' }
    );

    await sendOTPEmail({ email, name, otp: emailOTP, type: 'email' });
    await sendOTPSMS({ phone, name, otp: phoneOTP });

    console.log(`[OTP] Email OTP for ${email}: ${emailOTP}`);

    res.json({
      success: true,
      message: 'OTPs sent successfully',
      verifyToken: pendingUser._id.toString(),
      emailMasked: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
      phoneMasked: phone.replace(/(\+\d{2})\d+(\d{4})$/, '$1****$2'),
      expiresIn: 600,
    });
  } catch (error) {
    console.error('[Auth] Send OTP error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/verify-otp — Verify OTP and complete registration
// ══════════════════════════════════════════════
router.post('/verify-otp', [
  body('verifyToken').notEmpty().withMessage('Verification token is required'),
  body('emailOTP').optional().isLength({ min: 6, max: 6 }).withMessage('Email OTP must be 6 digits'),
  body('phoneOTP').optional().isLength({ min: 6, max: 6 }).withMessage('Phone OTP must be 6 digits'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { verifyToken, emailOTP, phoneOTP } = req.body;

    const user = await User.findById(verifyToken).select('+emailOTP.code +emailOTP.expiresAt +emailOTP.attempts +phoneOTP.code +phoneOTP.expiresAt +phoneOTP.attempts +pendingRegistration.password');

    if (!user || !user.pendingRegistration) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification session. Please register again.' });
    }

    if (new Date() > user.pendingRegistration.expiresAt) {
      await User.findByIdAndDelete(verifyToken);
      return res.status(400).json({ success: false, message: 'Verification session expired. Please register again.' });
    }

    const { name, phone, email, password } = user.pendingRegistration;
    let emailVerified = false;
    let phoneVerified = false;

    if (emailOTP) {
      if (user.emailOTP.attempts >= 5) {
        return res.status(429).json({ success: false, message: 'Too many email OTP attempts. Please request a new one.' });
      }
      if (user.emailOTP.code !== emailOTP) {
        user.emailOTP.attempts += 1;
        await user.save();
        const remaining = 5 - user.emailOTP.attempts;
        return res.status(400).json({ success: false, message: `Invalid email OTP. ${remaining} attempts remaining.` });
      }
      if (new Date() > user.emailOTP.expiresAt) {
        return res.status(400).json({ success: false, message: 'Email OTP has expired. Please request a new one.' });
      }
      emailVerified = true;
    }

    if (phoneOTP) {
      if (user.phoneOTP.attempts >= 5) {
        return res.status(429).json({ success: false, message: 'Too many phone OTP attempts. Please request a new one.' });
      }
      if (user.phoneOTP.code !== phoneOTP) {
        user.phoneOTP.attempts += 1;
        await user.save();
        const remaining = 5 - user.phoneOTP.attempts;
        return res.status(400).json({ success: false, message: `Invalid phone OTP. ${remaining} attempts remaining.` });
      }
      if (new Date() > user.phoneOTP.expiresAt) {
        return res.status(400).json({ success: false, message: 'Phone OTP has expired. Please request a new one.' });
      }
      phoneVerified = true;
    }

    user.isEmailVerified = emailVerified;
    user.isPhoneVerified = phoneVerified;
    user.isVerified = emailVerified && phoneVerified;

    if (emailVerified && phoneVerified) {
      user.email = email;
      user.name = name;
      user.phone = phone;
      user.password = password;
      user.role = 'CUSTOMER';
      user.pendingRegistration = undefined;
      user.emailOTP = undefined;
      user.phoneOTP = undefined;
      await user.save();

      const token = user.generateToken();
      setTokenCookie(res, token);

      await AuditLog.create({
        action: 'USER_REGISTRATION',
        user: user._id,
        email: user.email,
        ip: getClientIP(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        device: detectDevice(req.headers['user-agent']),
        category: 'SYSTEM',
        reason: 'New customer account registered via OTP verification'
      });

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        token,
        user: user.toSafeJSON(),
      });
    } else {
      await user.save();
      res.json({
        success: true,
        message: emailVerified && phoneVerified ? 'Both verified' : emailVerified ? 'Email verified' : 'Phone verified',
        verifyToken: verifyToken,
        emailVerified,
        phoneVerified,
        remaining: emailVerified ? 'phone' : 'email',
      });
    }
  } catch (error) {
    console.error('[Auth] Verify OTP error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/resend-otp — Resend OTP
// ══════════════════════════════════════════════
router.post('/resend-otp', [
  body('verifyToken').notEmpty().withMessage('Verification token is required'),
  body('type').isIn(['email', 'phone', 'both']).withMessage('Type must be email, phone, or both'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { verifyToken, type } = req.body;

    const user = await User.findById(verifyToken).select('+emailOTP.code +phoneOTP.code');

    if (!user || !user.pendingRegistration) {
      return res.status(400).json({ success: false, message: 'Invalid verification session. Please register again.' });
    }

    const crypto = require('crypto');

    if (type === 'email' || type === 'both') {
      user.emailOTP = {
        code: crypto.randomInt(100000, 999999).toString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      };
      await sendOTPEmail({
        email: user.pendingRegistration.email,
        name: user.pendingRegistration.name,
        otp: user.emailOTP.code,
        type: 'email'
      });
      console.log(`[OTP] Resent Email OTP: ${user.emailOTP.code}`);
    }

    if (type === 'phone' || type === 'both') {
      user.phoneOTP = {
        code: crypto.randomInt(100000, 999999).toString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      };
      await sendOTPSMS({
        phone: user.pendingRegistration.phone,
        name: user.pendingRegistration.name,
        otp: user.phoneOTP.code,
      });
      console.log(`[OTP] Resent Phone OTP: ${user.phoneOTP.code}`);
    }

    await user.save();

    res.json({
      success: true,
      message: 'OTP resent successfully',
      emailMasked: type !== 'phone' ? user.pendingRegistration.email.replace(/(.{2}).*(@.*)/, '$1***$2') : undefined,
      phoneMasked: type !== 'email' ? user.pendingRegistration.phone.replace(/(\+\d{2})\d+(\d{4})$/, '$1****$2') : undefined,
      expiresIn: 600,
    });
  } catch (error) {
    console.error('[Auth] Resend OTP error:', error.message);
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
// GET /api/auth/wishlist — Get customer's wishlist
// ══════════════════════════════════════════════
router.get('/wishlist', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const user = await User.findById(req.user._id)
      .populate('wishlist', 'slug name title heroImg startingPrice defaultDuration');

    res.json({ success: true, data: user.wishlist });
  } catch (error) {
    console.error('[Auth] Wishlist error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/wishlist/:packageId — Add to wishlist
// ══════════════════════════════════════════════
router.post('/wishlist/:packageId', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const Package = require('../models/Package');
    const pkg = await Package.findById(req.params.packageId);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    const user = await User.findById(req.user._id);
    if (!user.wishlist.includes(req.params.packageId)) {
      user.wishlist.push(req.params.packageId);
      await user.save();

      await AuditLog.create({
        action: 'WISHLIST_ADD',
        user: user._id,
        email: user.email,
        ip: getClientIP(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        device: detectDevice(req.headers['user-agent']),
        category: 'SUCCESS',
        reason: `Added "${pkg.name}" to wishlist`,
        metadata: { packageId: pkg._id, packageName: pkg.name }
      });
    }

    res.json({ success: true, message: 'Added to wishlist' });
  } catch (error) {
    console.error('[Auth] Wishlist add error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// DELETE /api/auth/wishlist/:packageId — Remove from wishlist
// ══════════════════════════════════════════════
router.delete('/wishlist/:packageId', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const user = await User.findById(req.user._id);
    user.wishlist = user.wishlist.filter(
      id => id.toString() !== req.params.packageId
    );
    await user.save();

    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    console.error('[Auth] Wishlist remove error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// PUT /api/auth/profile — Update customer profile
// ══════════════════════════════════════════════
router.put('/profile', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { name, phone, profile } = req.body;
    const update = {};

    if (name) update.name = name.trim();
    if (phone !== undefined) update.phone = phone?.trim();
    if (profile) {
      if (profile.dob !== undefined) update['profile.dob'] = profile.dob;
      if (profile.address !== undefined) update['profile.address'] = profile.address?.trim();
      if (profile.passportNo !== undefined) update['profile.passportNo'] = profile.passportNo?.trim();
      if (profile.passportExpiry !== undefined) update['profile.passportExpiry'] = profile.passportExpiry;
      if (profile.mealPreference !== undefined) update['profile.mealPreference'] = profile.mealPreference;
      if (profile.seatPreference !== undefined) update['profile.seatPreference'] = profile.seatPreference;
    }

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });

    await AuditLog.create({
      action: 'PROFILE_UPDATE',
      user: user._id,
      email: user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'CAUTION',
      reason: 'Customer updated their profile'
    });

    res.json({ success: true, user: user.toSafeJSON() });
  } catch (error) {
    console.error('[Auth] Profile update error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// GET /api/auth/ustomer-trips — Get customer's trips and inquiries
// ══════════════════════════════════════════════
router.get('/trips', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const Lead = require('../models/Lead');
    const Package = require('../models/Package');

    const leads = await Lead.find({ customer: req.user._id })
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });

    const bookedLeads = leads.filter(l => l.status === 'BOOKED');
    const activeLeads = leads.filter(l => ['NEW', 'CONTACTED', 'INTERESTED', 'QUOTED'].includes(l.status));

    res.json({ 
      success: true, 
      data: {
        all: leads,
        booked: bookedLeads,
        active: activeLeads,
      }
    });
  } catch (error) {
    console.error('[Auth] Trips error:', error.message);
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
