/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Flyajwa Backend — CSRF Protection Middleware
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
    let token = req.cookies._csrf;
    if (!token) {
      token = generateCSRFToken();
      const isProd = process.env.NODE_ENV === 'production';
      res.cookie('_csrf', token, {
        httpOnly: false,    // Must be readable by JS
        secure: isProd,
        sameSite: isProd ? 'None' : 'Lax',
        maxAge: 24 * 60 * 60 * 1000,
      });
    }
    // ALWAYS set the header on GET requests to keep frontend in sync
    res.setHeader('X-CSRF-Token', token);
    return next();
  }

  // For state-changing requests: require matching header + cookie
  const cookieToken = req.cookies._csrf;
  const headerToken = req.headers['x-csrf-token'];

  // ── Exception: Login/Registration Routes ──
  // Broad exception to prevent any login/registration deadlock.
  // These routes are already protected by rate limiters and auth logic.
  const isAuthRoute = req.originalUrl.includes('/auth/login') || 
                      req.originalUrl.includes('/auth/send-otp') || 
                      req.originalUrl.includes('/auth/verify-otp') ||
                      req.originalUrl.includes('/auth/forgot-password') ||
                      req.originalUrl.includes('/auth/reset-password');

  if (isAuthRoute) {
    return next();
  }

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
      message: 'Session security check failed. Please refresh the page and try again.',
    });
  }

  // Constant-time comparison to prevent timing attacks
  if (cookieToken.length !== headerToken.length || 
      !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    console.warn(`[CSRF] Token mismatch at ${req.path}. IP: ${req.ip}`);
    return res.status(403).json({
      success: false,
      message: 'Your session has expired or is invalid. Please refresh the page.',
    });
  }

  // Removed aggressive token rotation on every request to prevent race conditions
  // Tokens are valid for 24h as per cookie maxAge
  
  next();
}

module.exports = { 
  generateCSRFToken, 
  csrfProtection,
};

