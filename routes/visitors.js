/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa — Visitor Tracking Routes
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * POST /api/visitors           — Track page view (public)
 * GET  /api/visitors/analytics — Visitor statistics (admin)
 */

const express = require('express');
const router = express.Router();
const Visitor = require('../models/Visitor');
const { requireAuth, requireAnyAdmin } = require('../proxy/auth');
const { visitorLimiter } = require('../proxy/rateLimiter');
const { hashIP, getClientIP, detectDevice } = require('../proxy/security');

// ══════════════════════════════════════════════
// POST /api/visitors — Track page view (PUBLIC)
// ══════════════════════════════════════════════
router.post('/', visitorLimiter, async (req, res) => {
  try {
    const { page, referrer, utmSource, utmMedium, utmCampaign, sessionId } = req.body;

    if (!page) {
      return res.status(400).json({ success: false, message: 'Page is required' });
    }

    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';

    await Visitor.create({
      page,
      referrer: referrer || req.headers['referer'],
      userAgent: userAgent.substring(0, 500), // Limit UA length
      ipHash: hashIP(ip),
      device: detectDevice(userAgent),
      utmSource,
      utmMedium,
      utmCampaign,
      sessionId,
    });

    res.status(201).json({ success: true });
  } catch (error) {
    // Don't fail silently — visitor tracking is non-critical
    res.status(200).json({ success: true });
  }
});

// ══════════════════════════════════════════════
// GET /api/visitors/analytics — Visitor statistics (ADMIN)
// Query: ?days=30
// ══════════════════════════════════════════════
router.get('/analytics', requireAuth, requireAnyAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalViews,
      uniqueVisitors,
      topPages,
      deviceBreakdown,
      dailyViews,
      topReferrers,
    ] = await Promise.all([
      // Total page views
      Visitor.countDocuments({ createdAt: { $gte: since } }),

      // Unique visitors (by IP hash)
      Visitor.distinct('ipHash', { createdAt: { $gte: since } }).then(arr => arr.length),

      // Top pages
      Visitor.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$page', views: { $sum: 1 } } },
        { $sort: { views: -1 } },
        { $limit: 10 },
      ]),

      // Device breakdown
      Visitor.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$device', count: { $sum: 1 } } },
      ]),

      // Daily views (for charts)
      Visitor.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            views: { $sum: 1 },
            unique: { $addToSet: '$ipHash' },
          },
        },
        { $addFields: { uniqueVisitors: { $size: '$unique' } } },
        { $project: { unique: 0 } },
        { $sort: { _id: 1 } },
      ]),

      // Top referrers
      Visitor.aggregate([
        { $match: { createdAt: { $gte: since }, referrer: { $ne: null, $ne: '' } } },
        { $group: { _id: '$referrer', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    // Transform device breakdown
    const devices = {};
    deviceBreakdown.forEach(d => { devices[d._id] = d.count; });

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        totalViews,
        uniqueVisitors,
        topPages: topPages.map(p => ({ page: p._id, views: p.views })),
        devices,
        dailyViews: dailyViews.map(d => ({
          date: d._id,
          views: d.views,
          uniqueVisitors: d.uniqueVisitors,
        })),
        topReferrers: topReferrers.map(r => ({ referrer: r._id, count: r.count })),
      },
    });
  } catch (error) {
    console.error('[Visitors] Analytics error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
