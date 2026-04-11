/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa — Notification SSE Routes
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Server-Sent Events for real-time admin notifications
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// ── Connected SSE clients ──
const clients = new Set();

// ── Broadcast to all connected clients ──
function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    try {
      client.write(message);
    } catch (e) {
      clients.delete(client);
    }
  });
}

// ── Expose broadcaster for other routes ──
module.exports.broadcast = broadcast;

// ══════════════════════════════════════════════
// GET /api/notifications/stream — SSE endpoint (ADMIN)
// ══════════════════════════════════════════════
router.get('/stream', requireAuth, (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Connected to notification stream' })}\n\n`);
  
  // Add client to set
  clients.add(res);
  
  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch (e) {
      clearInterval(pingInterval);
      clients.delete(res);
    }
  }, 30000);
  
  // Remove client on disconnect
  req.on('close', () => {
    clearInterval(pingInterval);
    clients.delete(res);
  });
});

// ══════════════════════════════════════════════
// GET /api/notifications — Get recent notifications (ADMIN)
// ══════════════════════════════════════════════
router.get('/', requireAuth, async (req, res) => {
  // Return empty array — notifications are real-time via SSE
  // This endpoint exists for future pagination/history if needed
  res.json({ success: true, data: [], message: 'Use SSE stream for real-time notifications' });
});

module.exports = router;
