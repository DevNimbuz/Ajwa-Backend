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
const { requireAuth, requireSuperAdmin } = require('../proxy/auth');
const { loginLimiter } = require('../proxy/rateLimiter');
const { getClientIP, detectDevice } = require('../proxy/security');
const { sendOTPEmail, sendPasswordResetEmail } = require('../utils/email');

/**
 * Utility: Set secure HttpOnly cookie
 */
const setTokenCookie = (res, token) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,                      // HTTPS only in production
    sameSite: isProd ? 'None' : 'Lax',  // None = cross-domain (Vercel → Render)
    maxAge: 24 * 60 * 60 * 1000,        // 24 hours (match JWT expiry)
  });
};

const clearTokenCookie = (res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
  });
};

const { body, validationResult } = require('express-validator');

// ══════════════════════════════════════════════
// POST /api/auth/login — Authenticate user
// ══════════════════════════════════════════════
router.post('/login', [
  loginLimiter,
  body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail({ gmail_remove_dots: false }),
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
      user: user.toSafeJSON(),
      // Removed token from body for H5 security (Cookie-Only Auth)
    });
  } catch (error) {
    console.error('[Auth] Login error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/send-otp — Send OTP for registration (Email + Phone)
// ══════════════════════════════════════════════
router.post('/send-otp', [
  body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail({ gmail_remove_dots: false }),
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
    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }

    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const sharedOTP = crypto.randomInt(100000, 999999).toString();
    const emailOTP = sharedOTP;

    // Pre-hash password before storing — no plaintext ever hits the DB
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Use findOneAndUpdate with upsert to handle both new and returning pending users
    const pendingUser = await User.findOneAndUpdate(
      { email },
      {
        pendingRegistration: {
          name,
          phone,
          email,
          password: hashedPassword, // Stored hashed — never plaintext
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
        emailOTP: {
          code: emailOTP,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
        },
      },
      { upsert: true, new: true, select: '+emailOTP.code +pendingRegistration' }
    );

    // Send email (non-blocking)
    sendOTPEmail({ email, name, otp: emailOTP, type: 'email' })
      .catch(err => console.error('[OTP] Email fail:', err.message));

    // Removed OTP console.log for C3 security (Production Logging)

    res.json({
      success: true,
      message: 'Verification code sent to your email',
      verifyToken: pendingUser._id.toString(),
      emailMasked: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
      expiresIn: 600,
    });
  } catch (error) {
    console.error('[Auth] Send OTP error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/verify-otp — Complete registration
// ══════════════════════════════════════════════
  body('emailOTP').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { verifyToken, emailOTP } = req.body;

    if (!verifyToken) {
      return res.status(400).json({ success: false, message: 'Invalid request: No session token.' });
    }

    const user = await User.findById(verifyToken).select('+emailOTP.code +emailOTP.expiresAt +emailOTP.attempts +pendingRegistration +pendingRegistration.password');

    if (!user || !user.pendingRegistration) {
      return res.status(400).json({ success: false, message: 'Registration session not found or already completed.' });
    }

    if (new Date() > user.pendingRegistration.expiresAt) {
      return res.status(400).json({ success: false, message: 'Session expired. Please register again.' });
    }

    // 4. Verify Email OTP
    if (!user.emailOTP || !user.emailOTP.code) {
      return res.status(400).json({ success: false, message: 'Email code session missing. Click Resend.' });
    }
    
    if (user.emailOTP.attempts >= 10) return res.status(429).json({ success: false, message: 'Too many email attempts' });
    
    if (user.emailOTP.code !== emailOTP) {
      user.emailOTP.attempts += 1;
      await user.save();
      return res.status(400).json({ success: false, message: 'The email code you entered is incorrect.' });
    }

    // 5. Success: Finalize User
    const { name, phone, email, password } = user.pendingRegistration;
    user.name = name;
    user.email = email;
    user.phone = phone;
    user.password = password; // Already hashed in pendingRegistration
    user.role = 'CUSTOMER';
    user.isVerified = true;
    user.isEmailVerified = true;
    user.pendingRegistration = undefined;
    user.emailOTP = undefined;
    
    // Prevent the pre-save hook from re-hashing the already hashed password
    user._skipPasswordHook = true;
    await user.save();

    const token = user.generateToken();
    setTokenCookie(res, token);

    return res.status(201).json({
      success: true,
      message: 'Account verified successfully',
      user: user.toSafeJSON(),
      // Removed token from body for H5 security
    });
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
], async (req, res) => {
  try {
    const { verifyToken } = req.body;
    const user = await User.findById(verifyToken).select('+emailOTP.code +pendingRegistration');

    if (!user || !user.pendingRegistration) {
      return res.status(400).json({ success: false, message: 'Invalid session' });
    }

    const crypto = require('crypto');
    const newCode = crypto.randomInt(100000, 999999).toString();
    user.emailOTP = { code: newCode, expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 };
    
    sendOTPEmail({ email: user.pendingRegistration.email, name: user.pendingRegistration.name, otp: newCode, type: 'email' })
      .catch(() => {});

    await user.save();
    res.json({ success: true, message: 'OTP resent successfully' });
  } catch (error) {
    console.error('[Auth] Resend OTP error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/logout — Clear cookie
// ══════════════════════════════════════════════
router.post('/logout', (req, res) => {
  clearTokenCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

// ══════════════════════════════════════════════
// GET /api/auth/logs — Admin Security Logs
// ══════════════════════════════════════════════
router.get('/logs', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
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
router.delete('/logs', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
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
    const user = await User.findById(req.user._id);
    const Package = require('../models/Package');
    
    const packages = await Package.find({ _id: { $in: user.wishlist } })
      .select('_id slug name heroImg variants tagline');
    
    const result = packages.map(pkg => {
      const activeVariants = pkg.variants?.filter(v => v.isActive) || [];
      const lowestPrice = activeVariants.length > 0
        ? Math.min(...activeVariants.map(v => v.basePrice))
        : 0;
      const defaultVariant = activeVariants[0];
      
      return {
        _id: pkg._id,
        slug: pkg.slug,
        name: pkg.name,
        heroImg: pkg.heroImg,
        tagline: pkg.tagline,
        startingPrice: lowestPrice,
        duration: defaultVariant
          ? `${defaultVariant.durationDays}D/${defaultVariant.durationNights}N`
          : 'Customizable'
      };
    });

    res.json({ success: true, data: result });
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
    const Package = require('../models/Package');
    const { packageId } = req.params;
    
    console.log('[Wishlist] Add request:', { packageId });
    
    let pkg;
    if (packageId.match(/^[0-9a-fA-F]{24}$/)) {
      pkg = await Package.findById(packageId);
    } else {
      pkg = await Package.findOne({ slug: packageId });
    }
    
    console.log('[Wishlist] Package found:', pkg ? pkg.slug : null);
    
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    const user = await User.findById(req.user._id);
    const pkgId = pkg._id.toString();
    if (!user.wishlist.map(id => id.toString()).includes(pkgId)) {
      user.wishlist.push(pkgId);
      await user.save();
    }

    res.json({ success: true, message: 'Added to wishlist' });
  } catch (error) {
    console.error('[Auth] Wishlist add error:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// DELETE /api/auth/wishlist/:packageId — Remove from wishlist
// ══════════════════════════════════════════════
router.delete('/wishlist/:packageId', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const { packageId } = req.params;
    user.wishlist = user.wishlist.filter(id => id.toString() !== packageId);
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
router.post('/unlock', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
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

    res.json({ success: true, message: 'Password updated successfully and all other sessions revoked' });
  } catch (error) {
    console.error('[Auth] Password change error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/forgot-password — Request reset token (H8)
// ══════════════════════════════════════════════
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Enter a valid email').normalizeEmail({ gmail_remove_dots: false }),
], async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always return success to prevent email enumeration (Security Best Practice)
    if (!user) {
      return res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
    }

    // Generate reset token (random 32 bytes hex)
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Store hashed token and expiry (1 hour)
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 3600000; 
    
    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

    // Send email
    await sendPasswordResetEmail({ 
      email: user.email, 
      name: user.name, 
      resetUrl 
    });

    res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/auth/reset-password — Complete reset (H8)
// ══════════════════════════════════════════════
router.post('/reset-password/:token', [
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], async (req, res) => {
  try {
    const crypto = require('crypto');
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    // Update password (pre-save hook handles hashing)
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate all other sessions
    
    await user.save();

    res.json({ success: true, message: 'Password has been reset successfully. You can now login.' });
  } catch (error) {
    console.error('[Auth] Reset password error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
