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
const jwt = require('jsonwebtoken');
const { requireAuth, requireSuperAdmin, requireAnyAdmin } = require('../proxy/auth');
const { getClientIP, detectDevice } = require('../proxy/security');
const { leadLimiter } = require('../proxy/rateLimiter');
const { honeypotCheck } = require('../proxy/security');
const { sendLeadNotification } = require('../utils/email');
const { calculatePriorityScore, autoAssignLead } = require('../utils/bookingEngine');
const { calculatePoints } = require('../utils/loyaltyEngine');

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

function buildLeadAccessFilter(user) {
  if (!user || user.role !== 'TEAM') {
    return {};
  }

  return {
    $or: [
      { assignedTo: user._id },
      { assignedTo: null },
    ],
  };
}

function mergeFilters(...filters) {
  const activeFilters = filters.filter(filter => filter && Object.keys(filter).length > 0);

  if (activeFilters.length === 0) {
    return {};
  }

  if (activeFilters.length === 1) {
    return activeFilters[0];
  }

  return { $and: activeFilters };
}

function prependMatch(filter, pipeline) {
  if (!filter || Object.keys(filter).length === 0) {
    return pipeline;
  }

  return [{ $match: filter }, ...pipeline];
}

// ══════════════════════════════════════════════
// POST /api/leads — Submit new lead (PUBLIC — rate limited + honeypot)
// ══════════════════════════════════════════════
router.post('/', [
  leadLimiter, 
  honeypotCheck,
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Enter a valid email').normalizeEmail({ gmail_remove_dots: false }),
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

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }

    const { bookingType, travelDate, travelerDetails } = req.body;

    // Direct Bookings REQUIRE an account (and therefore points)
    let customerId = null;
    let decodedUser = null;
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : req.cookies?.token;

      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        decodedUser = await User.findById(decoded.id);
        if (decodedUser && decodedUser.role === 'CUSTOMER') {
          customerId = decodedUser._id;
        }
      }
    } catch (e) {
      // Not logged in or invalid token
    }

    if (bookingType === 'DIRECT_BOOKING' && !customerId) {
      return res.status(401).json({ success: false, message: 'Account required for direct booking' });
    }
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid phone number' });
    }

    // Logic handled above

    // ── Priority & Assignment Engine ──
    const priorityScore = calculatePriorityScore(req.body);
    const assignedStaffId = await autoAssignLead(priorityScore);

    let calculatedPriority = 'LOW';
    if (priorityScore >= 80) calculatedPriority = 'URGENT';
    else if (priorityScore >= 60) calculatedPriority = 'HIGH';
    else if (priorityScore >= 30) calculatedPriority = 'NORMAL';

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
      adults, children, infants, selectedRoomType,
      utmSource, utmMedium, utmCampaign, referrer,
      bookingType: bookingType || 'INQUIRY',
      travelDate,
      travelerDetails,
      priorityScore,
      priority: calculatedPriority,
      assignedTo: assignedStaffId,
      ajwaPointsPending: bookingType === 'DIRECT_BOOKING' ? 500 : 0, // Reward for direct booking
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
// POST /api/leads/whatsapp-click — Track WhatsApp button clicks (PUBLIC — rate limited + honeypot)
// ══════════════════════════════════════════════
router.post('/whatsapp-click', [leadLimiter, honeypotCheck], async (req, res) => {
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
router.get('/', requireAuth, requireAnyAdmin, async (req, res) => {
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
      // Escape regex special characters to prevent ReDoS (M3)
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { phone: { $regex: escapedSearch, $options: 'i' } },
        { destination: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    const scopedFilter = mergeFilters(filter, buildLeadAccessFilter(req.user));

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const [leads, total] = await Promise.all([
      Lead.find(scopedFilter)
        .populate('assignedTo', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      Lead.countDocuments(scopedFilter),
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
router.get('/analytics', requireAuth, requireAnyAdmin, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const accessFilter = buildLeadAccessFilter(req.user);

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
      Lead.countDocuments(accessFilter),
      Lead.countDocuments(mergeFilters(accessFilter, { createdAt: { $gte: today } })),
      Lead.countDocuments(mergeFilters(accessFilter, { createdAt: { $gte: thisWeek } })),
      Lead.countDocuments(mergeFilters(accessFilter, { createdAt: { $gte: thisMonth } })),
      Lead.aggregate(prependMatch(accessFilter, [{ $group: { _id: '$status', count: { $sum: 1 } } }])),
      Lead.aggregate(prependMatch(accessFilter, [{ $group: { _id: '$source', count: { $sum: 1 } } }])),
      Lead.aggregate(prependMatch(mergeFilters(accessFilter, { destination: { $nin: [null, ''] } }), [
        { $group: { _id: '$destination', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])),
      Lead.find(accessFilter).sort({ createdAt: -1 }).limit(5).populate('assignedTo', 'name'),
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
router.get('/export', requireAuth, requireAnyAdmin, async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const scopedFilter = mergeFilters(filter, buildLeadAccessFilter(req.user));
    const leads = await Lead.find(scopedFilter).sort({ createdAt: -1 }).populate('assignedTo', 'name');

    // Build CSV with injection protection (M2)
    const escapeCSV = (val) => {
      if (val === undefined || val === null) return '';
      let str = String(val);
      // CSV injection protection: prefix with single quote if it starts with risky chars
      if (['=', '+', '-', '@'].some(char => str.startsWith(char))) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = 'Name,Email,Phone,Destination,Travel Date,Travelers,Days,Flight Req,Hotel Star,Value (INR),Source,Status,Priority,Assigned To,Booking Type,Message,Internal Notes,Created At\n';
    const rows = leads.map(l => {
      const notesStr = (l.notes || []).map(n => `[${n.by} @ ${new Date(n.at).toLocaleDateString()}]: ${n.text}`).join(' | ');
      const travelDateStr = l.travelDate ? new Date(l.travelDate).toLocaleDateString() : 'TBD';
      return `${escapeCSV(l.name)},${escapeCSV(l.email)},${escapeCSV(l.phone)},${escapeCSV(l.destination)},${escapeCSV(travelDateStr)},${escapeCSV(l.selectedGroupSize || 0)},${escapeCSV(l.selectedDays || 0)},${escapeCSV(l.selectedFlight ? 'YES' : 'NO')},${escapeCSV(l.selectedHotelStar || 0)},${escapeCSV(l.quotedPrice || 0)},${escapeCSV(l.source)},${escapeCSV(l.status)},${escapeCSV(l.priority)},${escapeCSV(l.assignedTo?.name || 'Unassigned')},${escapeCSV(l.bookingType)},${escapeCSV(l.message)},${escapeCSV(notesStr)},"${l.createdAt.toISOString()}"`;
    }).join('\n');

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
router.put('/:id', requireAuth, requireAnyAdmin, async (req, res) => {
  try {
    const { status, priority, assignedTo, note, quotedPrice } = req.body;
    if (req.user.role === 'TEAM' && assignedTo !== undefined) {
      return res.status(403).json({ success: false, message: 'Only super admins can reassign leads' });
    }

    const lead = await Lead.findOne(mergeFilters(
      { _id: req.params.id },
      buildLeadAccessFilter(req.user)
    ));

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    if (status) lead.status = status;
    if (priority) lead.priority = priority;
    if (assignedTo !== undefined) lead.assignedTo = assignedTo || null;
    if (quotedPrice !== undefined) lead.quotedPrice = quotedPrice;

    if (note) {
      lead.notes.push({
        by: req.user.name,
        text: note,
        at: new Date(),
      });
    }

    // ── Loyalty Points Trigger ──
    // Award points when status is PAYMENT_ACCEPTED or BOOKED
    if (['PAYMENT_ACCEPTED', 'BOOKED'].includes(lead.status) && lead.customer && !lead.ajwaPointsAwarded) {
      try {
        const customer = await User.findById(lead.customer);
        if (customer) {
          const pointsToAward = await calculatePoints(customer, lead);
          customer.ajwaPoints += pointsToAward;
          await customer.save();
          lead.ajwaPointsAwarded = true;
          
          // Optionally add a system note
          lead.notes.push({
            by: 'SYSTEM',
            text: `Loyalty Points Awarded: ${pointsToAward} Ajwa Points credited to customer account.`,
            at: new Date(),
          });
        }
      } catch (e) {
        console.error('[Loyalty] Point award error:', e.message);
      }
    }

    await lead.save();
    await lead.populate('assignedTo', 'name email');

    await AuditLog.create({
      action: 'USER_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'SYSTEM',
      reason: `Updated lead status/details for: "${lead.name}"`,
      metadata: { leadId: lead._id, updates: { status, priority, assignedTo, quotedPrice } }
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

// ══════════════════════════════════════════════
// POST /api/leads/:id/invoice — Generate/Update invoice (STAFF)
// ══════════════════════════════════════════════
router.post('/:id/invoice', requireAuth, requireAnyAdmin, async (req, res) => {
  try {
    const { items, discount = 0 } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const subtotal = items.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
    const numDiscount = Number(discount) || 0;
    const pointsRedeemed = Number(lead.invoice?.pointsRedeemed) || 0;
    const total = subtotal - numDiscount - pointsRedeemed;

    lead.invoice = {
      invoiceId: lead.invoice?.invoiceId || `INV-${Date.now().toString().slice(-6)}`,
      items,
      subtotal,
      discount: numDiscount,
      pointsRedeemed,
      total,
      status: 'SENT',
      generatedAt: lead.invoice?.generatedAt || new Date(),
      updatedAt: new Date(),
    };

    await lead.save();
    res.json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ══════════════════════════════════════════════
// POST /api/leads/:id/redeem — Redeem points on invoice (CUSTOMER)
// ══════════════════════════════════════════════
router.post('/:id/redeem', requireAuth, async (req, res) => {
  try {
    const { points } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    
    if (!lead.invoice) return res.status(400).json({ success: false, message: 'No invoice found for this booking' });

    // Ensure the points belong to the customer of this lead
    const user = await User.findById(req.user._id);
    if (user.ajwaPoints < points) {
      return res.status(400).json({ success: false, message: 'Insufficient Ajwa Points' });
    }

    const numPoints = Number(points) || 0;
    const subtotal = Number(lead.invoice.subtotal) || 0;
    const discount = Number(lead.invoice.discount) || 0;

    // 1 Point = ₹1
    lead.invoice.pointsRedeemed = numPoints;
    lead.invoice.total = Math.max(0, subtotal - discount - numPoints); // Prevent negative totals
    lead.invoice.status = 'DRAFT'; // Set back to draft so staff can regenerate/finalize if needed
    lead.invoice.updatedAt = new Date();

    await lead.save();

    res.json({ success: true, message: 'Points applied to invoice', data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ══════════════════════════════════════════════
// POST /api/leads/:id/pay — Upload payment proof (CUSTOMER)
// ══════════════════════════════════════════════
router.post('/:id/pay', requireAuth, async (req, res) => {
  try {
    const { screenshot } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.paymentProof = {
      screenshot,
      status: 'PENDING',
      uploadedAt: new Date()
    };
    
    // Update lead status to PROCESSING or PAYMENT_SUBMITTED
    lead.status = 'PROCESSING';

    await lead.save();
    res.json({ success: true, message: 'Payment proof submitted', data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ══════════════════════════════════════════════
// POST /api/leads/:id/verify-payment — Verify payment (STAFF)
// ══════════════════════════════════════════════
router.post('/:id/verify-payment', requireAuth, requireAnyAdmin, async (req, res) => {
  try {
    const { verified, notes } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (verified) {
      lead.paymentProof.status = 'VERIFIED';
      lead.paymentProof.verifiedAt = new Date();
      lead.status = 'PAYMENT_ACCEPTED';
      if (lead.invoice) lead.invoice.status = 'PAID';
      
      // Deduct redeemed points from user if any
      if (lead.invoice?.pointsRedeemed > 0 && lead.customer) {
        const user = await User.findById(lead.customer);
        if (user) {
          user.ajwaPoints -= lead.invoice.pointsRedeemed;
          await user.save();
          
          await AuditLog.create({
            action: 'LOYALTY_REDEMPTION',
            user: lead.customer,
            email: user.email,
            ip: getClientIP(req),
            userAgent: req.headers['user-agent'] || 'unknown',
            category: 'SYSTEM',
            reason: `Redeemed ${lead.invoice.pointsRedeemed} points for Invoice ${lead.invoice.invoiceId}`,
            metadata: { leadId: lead._id, points: lead.invoice.pointsRedeemed }
          });
        }
      }
    } else {
      lead.paymentProof.status = 'REJECTED';
      lead.paymentProof.notes = notes;
      lead.status = 'QUOTED'; // Move back to quoted
    }

    await lead.save();
    res.json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ══════════════════════════════════════════════
// POST /api/leads/:id/credit-points — Manual point adjustment (STAFF)
// ══════════════════════════════════════════════
router.post('/:id/credit-points', requireAuth, requireAnyAdmin, async (req, res) => {
  try {
    const { points, reason } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead || !lead.customer) {
      return res.status(400).json({ success: false, message: 'Lead must be linked to a registered customer' });
    }

    const user = await User.findById(lead.customer);
    if (!user) return res.status(404).json({ success: false, message: 'Customer not found' });

    user.ajwaPoints += Number(points);
    await user.save();

    await AuditLog.create({
      action: 'LOYALTY_ADJUSTMENT',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      category: 'SYSTEM',
      reason: `Manual Point Credit: ${points} points to ${user.name} (${reason})`,
      metadata: { leadId: lead._id, customerId: user._id, points, reason }
    });

    // Add a note to the lead as well
    lead.notes.push({
      by: req.user.name,
      text: `Awarded ${points} Ajwa Points manually. Reason: ${reason}`,
      at: new Date()
    });
    await lead.save();

    res.json({ success: true, message: `Successfully awarded ${points} points`, data: { balance: user.ajwaPoints } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
