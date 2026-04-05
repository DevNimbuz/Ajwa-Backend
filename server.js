/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa Backend — Express Server
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * MERN Stack API Server
 * - MongoDB (Mongoose) for data
 * - JWT authentication
 * - Role-based access control
 * - Rate limiting & security headers
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const connectDB = require('./config/db');
const { globalLimiter } = require('./middleware/rateLimiter');
const { sanitizeBody } = require('./middleware/security');

// ── Initialize Express ──
const app = express();

// Trust Render/Vercel reverse proxy (fixes express-rate-limit X-Forwarded-For error)
app.set('trust proxy', 1);

// Enable Gzip Compression (huge performance boost on JSON responses)
app.use(compression());

// ── Connect to MongoDB ──
connectDB();

// ══════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════

// Security headers (XSS, clickjacking, MIME sniffing protection)
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// CORS — allow frontend domain
app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      'http://localhost:3000',
      'https://www.flyajwa.com',
      'https://flyajwa.com',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    // Allow Vercel preview deployments (*.vercel.app)
    if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Apply cookie parser
app.use(cookieParser());

// Anti NoSQL Injection
app.use(mongoSanitize());

// Parse JSON bodies (limit 10mb for package data with images)
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Global rate limiter (100 requests / 15 min per IP)
app.use('/api/', globalLimiter);

// Sanitize all request bodies (XSS prevention)
app.use(sanitizeBody);

// ══════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'FlyAjwa API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Route handlers
app.use('/api/auth', require('./routes/auth'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/visitors', require('./routes/visitors'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/testimonials', require('./routes/testimonials'));
app.use('/api/gallery', require('./routes/gallery'));

// Serve static dynamic uploads (like Gallery images) separately
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ══════════════════════════════════════════════
// ERROR HANDLING
// ══════════════════════════════════════════════

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(`[Error] ${err.message}`);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ success: false, message: `${field} already exists` });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  // Default server error
  res.status(err.statusCode || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ══════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  🚀 FlyAjwa API running on port ${PORT}`);
  console.log(`  📍 http://localhost:${PORT}/api/health`);
  console.log(`  🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

module.exports = app;
 
