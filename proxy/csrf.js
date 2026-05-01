/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa Backend — CSRF Protection Middleware
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Double-submit cookie pattern:
 * 1. Server sets a random CSRF token in a readable cookie
 * 2. Client reads the cookie and sends it back as X-CSRF-Token header
 * 3. Server verifies the header matches the cookie
 * 
 * This works because an attacker can trigger requests with cookies
 * but cannot read cross-origin cookies to set the header.
 */

const crypto = require('crypto');

/**
 * Generate a cryptographically random CSRF token
 */
function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware: CSRF protection using double-submit cookie pattern
 * Mounted globally — works without req.user
 */
function csrfProtection(req, res, next) {
  // Skip for safe HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    // Ensure a CSRF cookie exists for subsequent POST/PUT/DELETE
    if (!req.cookies._csrf) {
      const token = generateCSRFToken();
      const isProd = process.env.NODE_ENV === 'production';
      res.cookie('_csrf', token, {
        httpOnly: false,    // Must be readable by JS
        secure: isProd,
        sameSite: isProd ? 'None' : 'Lax',
        maxAge: 24 * 60 * 60 * 1000,
      });
      res.setHeader('X-CSRF-Token', token);
    }
    return next();
  }

  // For state-changing requests: require matching header + cookie
  const cookieToken = req.cookies._csrf;
  const headerToken = req.headers['x-csrf-token'];

  // If no auth cookie present, this is an unauthenticated request (public forms)
  // Still allow — the auth middleware will reject unauthorized access downstream
  if (!req.cookies.token) {
    return next();
  }

  // Authenticated state-changing request: enforce CSRF
  if (!cookieToken || !headerToken) {
    console.warn(`[CSRF] Missing token at ${req.path}. Cookie: ${!!cookieToken}, Header: ${!!headerToken}`);
    return res.status(403).json({
      success: false,
      message: 'CSRF token missing. Please refresh the page and try again.',
    });
  }

  // Constant-time comparison to prevent timing attacks
  if (cookieToken.length !== headerToken.length || 
      !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    console.warn(`[CSRF] Token mismatch at ${req.path}`);
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token. Please refresh the page and try again.',
    });
  }

  // Rotate token after each state-changing request
  const newToken = generateCSRFToken();
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('_csrf', newToken, {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.setHeader('X-CSRF-Token', newToken);

  next();
}

module.exports = { 
  generateCSRFToken, 
  csrfProtection,
};

