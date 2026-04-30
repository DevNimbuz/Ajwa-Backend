const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const rateLimit = require('express-rate-limit');
const { getNextAvailableStaff } = require('../utils/assignment');
const { sendWhatsAppGreeting } = require('../utils/whatsapp');

// MED-3 FIX: Rate limit external lead ingestion (30 leads per 15 minutes per IP)
const ingestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many ingestion requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   POST /api/leads/ingest
 * @desc    Ingest external leads from Excel/n8n/Make
 * @access  Private (API-KEY Protected)
 */
router.post('/ingest', ingestLimiter, async (req, res) => {
  const { name, email, phone, destination, source, externalId, budget } = req.body;
  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.headers['x-api-key'];

  // 1. Authorization (H7: Use Headers instead of Body)
  if (!apiKey || apiKey !== process.env.EXTERNAL_API_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized access' });
  }

  try {
    // 2. Check for duplicates locally
    const existingLead = await Lead.findOne({ 
      $or: [
        { externalId: externalId },
        { phone: phone, destination: destination, createdAt: { $gt: new Date(Date.now() - 24*60*60*1000) } } // Prevents same lead twice in 24h
      ]
    });

    if (existingLead) {
      return res.status(200).json({ success: true, message: 'Duplicate lead ignored', id: existingLead._id });
    }

    // 3. Determine Assignment
    const assignedStaffId = await getNextAvailableStaff();

    // 4. Create Lead
    const newLead = await Lead.create({
      name,
      email,
      phone,
      destination,
      source: source || 'external-excel',
      externalId,
      assignedTo: assignedStaffId,
      status: 'NEW',
      notes: [{ 
        by: 'System', 
        text: `Automated ingestion from Excel. Assigned to staff: ${assignedStaffId || 'Unassigned'}` 
      }]
    });

    res.status(201).json({ 
      success: true, 
      id: newLead._id, 
      assignedTo: assignedStaffId 
    });

  } catch (error) {
    console.error('[Ingest] Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Ingestion Error' });
  }
});

module.exports = router;
