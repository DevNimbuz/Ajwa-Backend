const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { getNextAvailableStaff } = require('../utils/assignment');
const { sendWhatsAppGreeting } = require('../utils/whatsapp');

/**
 * @route   POST /api/leads/ingest
 * @desc    Ingest external leads from Excel/n8n/Make
 * @access  Private (API-KEY Protected)
 */
router.post('/ingest', async (req, res) => {
  const { apiKey, name, email, phone, destination, source, externalId, budget } = req.body;

  // 1. Authorization
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
