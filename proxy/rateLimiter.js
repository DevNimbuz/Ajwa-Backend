/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Flyajwa Backend — Rate Limiting Middleware
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Protects against brute force attacks and spam
 * Uses express-rate-limit with different tiers
 */

const rateLimit = require('express-rate-limit');

/**
 * Global API rate limiter
 * 500 requests per 15 minutes per IP
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: {
    success: false,
    message: 'Too many requests — please try again after 15 minutes',
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
});

/**
 * Login rate limiter (strict)
 * 10 attempts per 15 minutes per IP
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Reduced from 10
  message: {
    success: false,
    message: 'Too many login attempts — please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Lead submission rate limiter
 * 5 submissions per hour per IP (prevents spam)
 */
const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Reduced from 10
  message: {
    success: false,
    message: 'Too many submissions — please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Visitor tracking limiter (generous)
 * 120 page views per minute per IP
 */
const visitorLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { success: false, message: 'Rate limit exceeded' },
  standardHeaders: false,
  legacyHeaders: false,
});

module.exports = { globalLimiter, loginLimiter, leadLimiter, visitorLimiter };
