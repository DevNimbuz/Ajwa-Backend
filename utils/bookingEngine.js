/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Flyajwa — Booking & Assignment Engine
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Automates lead scoring, prioritization, and intelligent routing
 */

const User = require('../models/User');

/**
 * Calculate a priority score (0-100) for a lead
 * @param {Object} leadData - The lead payload
 */
const calculatePriorityScore = (leadData) => {
  let score = 0;

  // 1. Intent Score (Direct Booking is high intent)
  if (leadData.bookingType === 'DIRECT_BOOKING') score += 30;
  else score += 10;

  // 2. Urgency Score (Closer travel date = higher priority)
  if (leadData.travelDate) {
    const today = new Date();
    const travel = new Date(leadData.travelDate);
    const diffDays = Math.ceil((travel - today) / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) score += 40;
    else if (diffDays <= 14) score += 30;
    else if (diffDays <= 30) score += 15;
    else score += 5;
  }

  // 3. Value Score (Larger groups = higher priority)
  const groupSize = leadData.selectedGroupSize || 1;
  score += Math.min(groupSize * 5, 20); // Max 20 points for value

  // 4. Source Score
  if (leadData.source === 'whatsapp') score += 10;

  return Math.min(score, 100);
};

/**
 * Assign a lead to the best available staff based on performance
 * @param {number} priorityScore - Calculated score
 */
const autoAssignLead = async (priorityScore) => {
  try {
    // Logic: If priority is high (>70), look for top 30% of staff
    // Otherwise, look for anyone available.
    
    let query = { role: 'TEAM', isActive: true };
    
    // Sort by performanceScore descending
    const staff = await User.find(query).sort({ performanceScore: -1 });

    if (staff.length === 0) return null;

    // Intelligent selection:
    // If priority is high, pick from top performers
    if (priorityScore > 70) {
      const topPerformers = staff.slice(0, Math.ceil(staff.length * 0.3));
      return topPerformers[Math.floor(Math.random() * topPerformers.length)]._id;
    }

    // Default: Round-robin or random among all active staff
    return staff[Math.floor(Math.random() * staff.length)]._id;
  } catch (error) {
    console.error('Assignment error:', error);
    return null;
  }
};

module.exports = {
  calculatePriorityScore,
  autoAssignLead
};
