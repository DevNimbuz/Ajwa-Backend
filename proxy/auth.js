/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Flyajwa Backend — JWT Authentication Middleware
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * - requireAuth: verifies JWT token, attaches user to req
 * - requireSuperAdmin: ensures user is SUPER_ADMIN
 * - requireAnyAdmin: ensures user is SUPER_ADMIN or TEAM
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { getClientIP, detectDevice } = require('./security');

/**
 * Middleware: Require authenticated user
 * Extracts JWT from Authorization header or cookie
 * Attaches user object to req.user
 */
const requireAuth = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header (Bearer token)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Check query string fallback (critical for SSE/EventSource)
    else if (req.query && req.query.token) {
      token = req.query.token;
    }
    // Check cookie fallback
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      // HIGH-4 FIX: Log to console only — AuditLog.create here causes DB write amplification under attack
      console.warn(`[Auth] Unauthorized access attempt: ${req.originalUrl} from ${getClientIP(req)}`);
      return res.status(401).json({ success: false, message: 'Not authorized — no token provided' });
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user and exclude password
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account deactivated' });
    }

    // Verify token version (Global logout/Password change revokes)
    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Session expired — please login again' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      console.warn(`[Auth] Invalid token for ${req.originalUrl} from ${getClientIP(req)}`);
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired — please login again' });
    }
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

/**
 * Middleware: Require SUPER_ADMIN role
 * Must be used AFTER requireAuth
 */
const requireSuperAdmin = async (req, res, next) => {
  if (req.user && req.user.role === 'SUPER_ADMIN') {
    return next();
  }
  
  await AuditLog.create({
    action: 'PERMISSION_DENIED',
    user: req.user?._id,
    email: req.user?.email,
    ip: getClientIP(req),
    userAgent: req.headers['user-agent'] || 'unknown',
    device: detectDevice(req.headers['user-agent']),
    category: 'HAZARD',
    reason: `Forbidden: User [${req.user?.role}] attempted to access Super Admin resource [${req.originalUrl}]`
  });

  return res.status(403).json({ success: false, message: 'Access denied — Super Admin only' });
};

/**
 * Middleware: Require any admin role (SUPER_ADMIN or TEAM)
 * Must be used AFTER requireAuth
 */
const requireAnyAdmin = async (req, res, next) => {
  if (req.user && ['SUPER_ADMIN', 'ADMIN', 'TEAM'].includes(req.user.role)) {
    return next();
  }

  await AuditLog.create({
    action: 'PERMISSION_DENIED',
    user: req.user?._id,
    email: req.user?.email,
    ip: getClientIP(req),
    userAgent: req.headers['user-agent'] || 'unknown',
    device: detectDevice(req.headers['user-agent']),
    category: 'HAZARD',
    reason: `Forbidden: Unauthorized role attempted to access admin resource [${req.originalUrl}]`
  });

  return res.status(403).json({ success: false, message: 'Access denied — Admin only' });
};

/**
 * Middleware: Require CUSTOMER role (traveler)
 * Must be used AFTER requireAuth
 */
const requireCustomer = async (req, res, next) => {
  if (req.user && req.user.role === 'CUSTOMER') {
    return next();
  }

  await AuditLog.create({
    action: 'PERMISSION_DENIED',
    user: req.user?._id,
    email: req.user?.email,
    ip: getClientIP(req),
    userAgent: req.headers['user-agent'] || 'unknown',
    device: detectDevice(req.headers['user-agent']),
    category: 'HAZARD',
    reason: `Forbidden: Non-customer role attempted to access traveler resource [${req.originalUrl}]`
  });

  return res.status(403).json({ success: false, message: 'Access denied — Travelers only' });
};

/**
 * Middleware: Require Full Admin role (SUPER_ADMIN or ADMIN)
 * Permits management but excludes base staff (TEAM)
 */
const requireFullAdmin = async (req, res, next) => {
  if (req.user && ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
    return next();
  }

  await AuditLog.create({
    action: 'PERMISSION_DENIED',
    user: req.user?._id,
    email: req.user?.email,
    ip: getClientIP(req),
    userAgent: req.headers['user-agent'] || 'unknown',
    device: detectDevice(req.headers['user-agent']),
    category: 'HAZARD',
    reason: `Forbidden: Staff level [TEAM] attempted to access Full Admin resource [${req.originalUrl}]`
  });

  return res.status(403).json({ success: false, message: 'Access denied — Higher admin privilege required' });
};

module.exports = { requireAuth, requireSuperAdmin, requireAnyAdmin, requireFullAdmin, requireCustomer };
