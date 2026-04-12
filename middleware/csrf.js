/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa Backend — CSRF Protection Middleware
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Provides double-submit cookie pattern CSRF protection
 * for sensitive operations like password changes, profile updates, etc.
 */

const crypto = require('crypto');

/**
 * Generate a CSRF token for a session
 * @param {string} sessionId - User's session or user ID
 * @returns {string} CSRF token
 */
function generateCSRFToken(sessionId) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256')
    .update(`${sessionId}:${timestamp}:${random}:${process.env.JWT_SECRET}`)
    .digest('hex');
  return `${timestamp}.${random}.${hash}`;
}

/**
 * Verify a CSRF token
 * @param {string} token - The token to verify
 * @param {string} sessionId - The user's session ID
 * @returns {boolean} Whether the token is valid
 */
function verifyCSRFToken(token, sessionId) {
  if (!token || !sessionId) return false;
  
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  const [timestamp, random, hash] = parts;
  
  // Token expires after 1 hour
  const tokenAge = Date.now() - parseInt(timestamp, 36);
  if (tokenAge > 60 * 60 * 1000) return false;
  
  const expectedHash = crypto.createHash('sha256')
    .update(`${sessionId}:${timestamp}:${random}:${process.env.JWT_SECRET}`)
    .digest('hex');
  
  return hash === expectedHash;
}

/**
 * Middleware: CSRF protection for sensitive routes
 * Checks X-CSRF-Token header against the token in the request
 */
function csrfProtection(req, res, next) {
  // Skip for safe HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Get token from header
  const token = req.headers['x-csrf-token'];
  
  // Get session ID from JWT token if available
  let sessionId = 'anonymous';
  if (req.user && req.user._id) {
    sessionId = req.user._id.toString();
  }
  
  // In production, require CSRF token for authenticated users
  if (process.env.NODE_ENV === 'production' && req.user && !token) {
    return res.status(403).json({ 
      success: false, 
      message: 'CSRF token required. Include X-CSRF-Token header.' 
    });
  }
  
  // Verify token if provided
  if (token && !verifyCSRFToken(token, sessionId)) {
    console.warn(`[CSRF] Invalid token from user ${sessionId} at ${req.path}`);
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid CSRF token' 
    });
  }
  
  // Generate new token for authenticated users
  if (req.user) {
    const csrfToken = generateCSRFToken(sessionId);
    res.setHeader('X-CSRF-Token', csrfToken);
  }
  
  next();
}

/**
 * Get CSRF token for current user (used in login responses)
 */
function getCSRFTokenForUser(userId) {
  return generateCSRFToken(userId.toString());
}

module.exports = { 
  generateCSRFToken, 
  verifyCSRFToken, 
  csrfProtection,
  getCSRFTokenForUser
};
