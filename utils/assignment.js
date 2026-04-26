const User = require('../models/User');

/**
 * Round-Robin Lead Assignment Utility
 * Rotates leads among active team members based on the last assignment.
 */
async function getNextAvailableStaff() {
  try {
    // 1. Get all active team members (TEAM role, not Super Admin)
    const staff = await User.find({ role: 'TEAM', isActive: true }).sort({ _id: 1 });
    
    if (staff.length === 0) {
      console.warn('[Assignment] No active staff members found for assignment.');
      return null;
    }

    // 2. Find the last lead assigned to a team member to determine the rotation
    const Lead = require('../models/Lead');
    const lastLead = await Lead.findOne({ assignedTo: { $ne: null } }).sort({ createdAt: -1 });

    if (!lastLead) return staff[0]._id;

    // 3. Find index of last assigned staff and move to next
    const lastIndex = staff.findIndex(s => s._id.toString() === lastLead.assignedTo.toString());
    const nextIndex = (lastIndex + 1) % staff.length;

    return staff[nextIndex]._id;
  } catch (error) {
    console.error('[Assignment] Selection error:', error.message);
    return null;
  }
}

module.exports = { getNextAvailableStaff };
