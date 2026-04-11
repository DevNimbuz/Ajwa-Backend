/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa — Lead Routes
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * POST   /api/leads              — Submit new lead (public, rate limited) | Logged in customers auto-linked
 * GET    /api/leads              — List leads with filters (admin)
 * GET    /api/leads/analytics    — Lead statistics (admin)
 * GET    /api/leads/export       — Export leads as CSV (admin)
 * PUT    /api/leads/:id          — Update lead (admin)
 * DELETE /api/leads/:id          — Delete lead (super admin)
 */

const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Package = require('../models/Package');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { getClientIP, detectDevice } = require('../middleware/security');
const { leadLimiter } = require('../middleware/rateLimiter');
const { honeypotCheck } = require('../middleware/security');
const { sendLeadNotification } = require('../utils/email');

// ── Notification broadcaster (lazy load to avoid circular) ──
let notificationRouter;
function broadcastLead(lead) {
  try {
    if (!notificationRouter) {
      notificationRouter = require('./notifications');
    }
    notificationRouter.broadcast({
      type: 'NEW_LEAD',
      lead: {
        id: lead._id,
        name: lead.name,
        phone: lead.phone,
        destination: lead.destination,
        source: lead.source,
        createdAt: lead.createdAt,
      },
      message: `New lead: ${lead.name}${lead.destination ? ` (${lead.destination})` : ''}`,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[Notifications] Broadcast error:', e.message);
  }
}

const { body, validationResult } = require('express-validator');

// ══════════════════════════════════════════════
// POST /api/leads — Submit new lead (PUBLIC — rate limited + honeypot)
// ══════════════════════════════════════════════
router.post('/', [
  leadLimiter, 
  honeypotCheck,
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Enter a valid email').normalizeEmail(),
  body('phone').trim().notEmpty().withMessage('Phone is required'),
  body('message').optional().trim().isLength({ max: 2000 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { name, email, phone, destination, packageSlug, message, source,
      serviceType, serviceDetails,
      selectedDays, selectedFlight, selectedHotelStar, selectedGroupSize, quotedPrice,
      utmSource, utmMedium, utmCampaign, referrer } = req.body;

    // Validate required fields
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }

    // Phone validation (basic)
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid phone number' });
    }

    // Bind to customer if logged in
    let customerId = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (user && user.role === 'CUSTOMER') {
          customerId = user._id;
        }
      }
    } catch (e) {
      // Not logged in or invalid token - continue without customer link
    }

    // Create the lead
    const leadData = {
      name: name.trim(),
      email: email?.trim(),
      phone: cleanPhone,
      destination: destination?.trim(),
      packageSlug: packageSlug?.trim(),
      message: message?.trim(),
      source: source || 'website',
      serviceType,
      serviceDetails,
      selectedDays, selectedFlight, selectedHotelStar, selectedGroupSize, quotedPrice,
      utmSource, utmMedium, utmCampaign, referrer,
    };

    if (customerId) {
      leadData.customer = customerId;
    }

    const lead = await Lead.create(leadData);

    // Broadcast real-time notification to admin panels
    broadcastLead(lead);

    // Send email notification (async — don't block response)
    sendLeadNotification(lead).catch(err => console.error('[Lead] Email error:', err.message));

    res.status(201).json({
      success: true,
      message: 'Thank you! We will contact you shortly.',
      data: { id: lead._id },
    });
  } catch (error) {
    console.error('[Leads] Create error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

// ══════════════════════════════════════════════
// POST /api/leads/whatsapp-click — Track WhatsApp button clicks (PUBLIC)
// ══════════════════════════════════════════════
router.post('/whatsapp-click', async (req, res) => {
  try {
    const { phone, name, destination, packageSlug, page, selectedOptions } = req.body;

    // Try to find existing lead by phone or create minimal tracking
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9+]/g, '');
      let lead = await Lead.findOne({ phone: cleanPhone });

      if (lead) {
        // Add click to existing lead
        lead.whatsappClicks.push({
          clickedAt: new Date(),
          page: page || 'unknown',
          packageSlug: packageSlug || lead.packageSlug,
          selectedOptions: selectedOptions || {
            days: lead.selectedDays,
            flight: lead.selectedFlight,
            hotelStar: lead.selectedHotelStar,
            groupSize: lead.selectedGroupSize,
          },
        });
        await lead.save();
        return res.json({ success: true, message: 'WhatsApp click tracked' });
      }
    }

    // Create a new lead entry for WhatsApp click tracking
    const lead = await Lead.create({
      name: name?.trim() || 'WhatsApp Visitor',
      phone: phone ? phone.replace(/[^0-9+]/g, '') : 'unknown',
      destination: destination?.trim(),
      packageSlug: packageSlug?.trim(),
      source: 'whatsapp',
      status: 'NEW',
      priority: 'LOW',
      whatsappClicks: [{
        clickedAt: new Date(),
        page: page || 'unknown',
        packageSlug: packageSlug,
        selectedOptions: selectedOptions || {},
      }],
    });

    // Broadcast notification for WhatsApp click
    broadcastLead(lead);

    res.json({ success: true, message: 'WhatsApp click tracked', data: { id: lead._id } });
  } catch (error) {
    console.error('[Leads] WhatsApp click error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to track click' });
  }
});

// ══════════════════════════════════════════════
// GET /api/leads — List leads with filters (ADMIN)
// Query: ?status=NEW&source=website&search=john&page=1&limit=20&sort=-createdAt
// ══════════════════════════════════════════════
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, source, priority, search, assignedTo,
      startDate, endDate, page = 1, limit = 20, sort = '-createdAt' } = req.query;

    // Build filter
    const filter = {};

    if (status) filter.status = status;
    if (source) filter.source = source;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    // Search filter (name, email, phone, destination)
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { destination: { $regex: search, $options: 'i' } },
      ];
    }

    // Team members can only see their assigned leads
    if (req.user.role === 'TEAM') {
      filter.$or = [
        { assignedTo: req.user._id },
        { assignedTo: null }, // Unassigned leads are visible to all
      ];
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .populate('assignedTo', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      Lead.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[Leads] List error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// GET /api/leads/analytics — Lead statistics (ADMIN)
// ══════════════════════════════════════════════
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalLeads,
      todayLeads,
      weekLeads,
      monthLeads,
      statusCounts,
      sourceCounts,
      destinationCounts,
      recentLeads,
    ] = await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ createdAt: { $gte: today } }),
      Lead.countDocuments({ createdAt: { $gte: thisWeek } }),
      Lead.countDocuments({ createdAt: { $gte: thisMonth } }),
      Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Lead.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }]),
      Lead.aggregate([
        { $match: { destination: { $ne: null, $ne: '' } } },
        { $group: { _id: '$destination', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Lead.find().sort({ createdAt: -1 }).limit(5).populate('assignedTo', 'name'),
    ]);

    // Convert aggregation results to objects
    const byStatus = {};
    statusCounts.forEach(s => { byStatus[s._id] = s.count; });
    const bySource = {};
    sourceCounts.forEach(s => { bySource[s._id] = s.count; });

    res.json({
      success: true,
      data: {
        overview: { total: totalLeads, today: todayLeads, thisWeek: weekLeads, thisMonth: monthLeads },
        byStatus,
        bySource,
        topDestinations: destinationCounts.map(d => ({ name: d._id, count: d.count })),
        recentLeads,
      },
    });
  } catch (error) {
    console.error('[Leads] Analytics error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// GET /api/leads/export — Export leads as CSV (ADMIN)
// ══════════════════════════════════════════════
router.get('/export', requireAuth, async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const leads = await Lead.find(filter).sort({ createdAt: -1 }).populate('assignedTo', 'name');

    // Build CSV
    const headers = 'Name,Email,Phone,Destination,Source,Status,Priority,Assigned To,Message,Created At\n';
    const rows = leads.map(l =>
      `"${l.name}","${l.email || ''}","${l.phone}","${l.destination || ''}","${l.source}","${l.status}","${l.priority}","${l.assignedTo?.name || 'Unassigned'}","${(l.message || '').replace(/"/g, '""')}","${l.createdAt.toISOString()}"`
    ).join('\n');

    await AuditLog.create({
      action: 'LEAD_EXPORT',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'CAUTION',
      reason: `Sensitive Data Export: Exported ${leads.length} customer leads as CSV`,
      metadata: { count: leads.length, filters: { status, startDate, endDate } }
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=flyajwa-leads-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(headers + rows);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// PUT /api/leads/:id — Update lead (ADMIN)
// ══════════════════════════════════════════════
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { status, priority, assignedTo, note } = req.body;
    const update = {};

    if (status) update.status = status;
    if (priority) update.priority = priority;
    if (assignedTo !== undefined) update.assignedTo = assignedTo || null;

    // Add note if provided
    if (note) {
      update.$push = {
        notes: {
          by: req.user.name,
          text: note,
          at: new Date(),
        },
      };
    }

    const lead = await Lead.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('assignedTo', 'name email');

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    await AuditLog.create({
      action: 'USER_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'SYSTEM',
      reason: `Updated lead status/details for: "${lead.name}"`,
      metadata: { leadId: lead._id, updates: { status, priority, assignedTo } }
    });

    res.json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// DELETE /api/leads/:id — Delete lead (SUPER ADMIN)
// ══════════════════════════════════════════════
router.delete('/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    await AuditLog.create({
      action: 'USER_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'CAUTION',
      reason: `Permanently deleted lead record: "${lead.name}"`,
      metadata: { leadId: lead._id, leadName: lead.name }
    });

    res.json({ success: true, message: 'Lead deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
