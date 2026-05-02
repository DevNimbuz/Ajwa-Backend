/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Flyajwa — Loyalty Points Engine
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Calculates points based on spend, membership duration,
 * frequency of travel, and bonus triggers.
 */

const Lead = require('../models/Lead');

/**
 * Calculate points for a specific lead/booking
 * @param {Object} user - User document
 * @param {Object} lead - Lead document
 * @returns {Number} - Points to award
 */
const calculatePoints = async (user, lead) => {
  let totalPoints = 0;

  // 1. Base Spend Points (1 point per ₹50 spent)
  if (lead.quotedPrice) {
    const spendPoints = Math.floor(lead.quotedPrice / 50);
    totalPoints += spendPoints;
  }

  // 2. Direct Booking Bonus (Flat 500 points for booking via website)
  if (lead.bookingType === 'DIRECT_BOOKING') {
    totalPoints += 500;
  }

  // 3. Loyalty Multiplier (Duration of membership)
  // +5% bonus points for every 6 months of being a member
  const monthsSinceJoining = Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24 * 30));
  const loyaltyTiers = Math.floor(monthsSinceJoining / 6);
  if (loyaltyTiers > 0) {
    const multiplier = 1 + (loyaltyTiers * 0.05);
    totalPoints = Math.floor(totalPoints * multiplier);
  }

  // 4. Frequency Bonus (Repeat Travelers)
  // If user has >3 previously BOOKED leads, give 10% bonus
  const previousBookingsCount = await Lead.countDocuments({
    customer: user._id,
    status: 'BOOKED',
    _id: { $ne: lead._id } // Don't count current lead
  });

  if (previousBookingsCount >= 3) {
    totalPoints = Math.floor(totalPoints * 1.1);
  }

  return totalPoints;
};

module.exports = {
  calculatePoints
};
