/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Flyajwa Backend — Security Middleware
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Honeypot validation, input sanitization, IP hashing
 */

const crypto = require('crypto');
const DOMPurify = require('isomorphic-dompurify');

/**
 * Middleware: Honeypot spam detection
 * Bots fill hidden form fields — humans leave them empty
 * The frontend includes a hidden field named "website"
 */
const honeypotCheck = (req, res, next) => {
  // If the hidden "website" field has a value, it's a bot
  if (req.body && req.body.website && req.body.website.trim() !== '') {
    // Silently reject — don't tell the bot it was detected
    return res.status(200).json({ success: true, message: 'Submission received' });
  }
  // Remove honeypot field from body before processing
  if (req.body) delete req.body.website;
  next();
};

/**
 * Sanitizes a string using DomPurify to prevent XSS attacks
 * Removes all dangerous script tags, event handlers, and data URIs
 * @param {string} input - Raw user input
 * @returns {string} Sanitized string
 */
const sanitizeString = (input) => {
  if (typeof input !== 'string') return input;
  // DomPurify is much safer than custom regex and handles obfuscation
  return DOMPurify.sanitize(input.trim(), {
    ALLOWED_TAGS: [], // No HTML allowed by default for plain text strings
    ALLOWED_ATTR: [],
  });
};

/**
 * Middleware: Sanitize all string fields in request body
 * Prevents stored XSS attacks
 */
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    const sanitizeObj = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = sanitizeString(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObj(obj[key]);
        }
      }
    };
    sanitizeObj(req.body);
  }
  next();
};

/**
 * Hashes an IP address for privacy-preserving analytics
 * Uses SHA-256 with a daily salt (hashes rotate daily)
 * @param {string} ip - Raw IP address
 * @returns {string} Hashed IP (16 chars, not reversible)
 */
const hashIP = (ip) => {
  if (!ip) return 'unknown';
  const dailySalt = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return crypto.createHash('sha256').update(`${ip}:${dailySalt}`).digest('hex').substring(0, 16);
};

/**
 * Extracts the client's real IP from request headers
 * Handles proxies (Render, Vercel, Cloudflare, nginx)
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
const getClientIP = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.headers['cf-connecting-ip'] || // Cloudflare
    req.ip ||
    'unknown'
  );
};

/**
 * Detects device type from User-Agent string
 * @param {string} userAgent - Browser user agent
 * @returns {string} "mobile", "tablet", or "desktop"
 */
const detectDevice = (userAgent) => {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone|ipod/i.test(ua)) return 'mobile';
  return 'desktop';
};

module.exports = { honeypotCheck, sanitizeBody, sanitizeString, hashIP, getClientIP, detectDevice };
