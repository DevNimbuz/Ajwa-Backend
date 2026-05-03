/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Flyajwa — User/Team Management Routes
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * All routes require AUTH
 * GET    /api/users         — List team members (admin)
 * GET    /api/users/customers — List customers (admin)
 * POST   /api/users         — Create team member
 * PUT    /api/users/:id     — Update team member
 * DELETE /api/users/:id     — Delete team member
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Lead = require('../models/Lead');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireSuperAdmin, requireAnyAdmin } = require('../proxy/auth');
const { getClientIP, detectDevice } = require('../proxy/security');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { validateFile } = require('../proxy/uploadValidator');

// ── Cloudinary config ──
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Upload helper ──
const uploadToCloudinary = (buffer, folder = 'flyajwa/documents', resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
};

// ── Multer setup ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// All routes require authentication
router.use(requireAuth);

const TEAM_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TEAM'];
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

// ══════════════════════════════════════════════
// GET /api/users — List all team members
// ══════════════════════════════════════════════
router.get('/', requireAnyAdmin, async (req, res) => {
  try {
    // MED-1 FIX: TEAM users only see name/email/role. SUPER_ADMIN sees full data.
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const selectFields = isSuperAdmin
      ? '-password -resetPasswordToken -resetPasswordExpire'
      : 'name email role isActive createdAt';
    const users = await User.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN', 'TEAM'] } }).select(selectFields).sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// GET /api/users/customers — List registered customers
// ══════════════════════════════════════════════
router.get('/customers', requireAnyAdmin, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const query = { role: 'CUSTOMER' };
    
    if (search) {
      // Escape regex special characters to prevent ReDoS
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { phone: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    // MED-1 FIX: Strip auth-state internals from customer responses
    const customers = await User.find(query)
      .select('-password -tokenVersion -verificationToken -resetPasswordToken -resetPasswordExpire -failedLoginAttempts -lockUntil -emailOTP -phoneOTP -pendingRegistration')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: customers,
      pagination: { page: parseInt(page), pages: Math.ceil(total / limit), total }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// GET /api/users/customers/:id — Get customer with their leads
// ══════════════════════════════════════════════
router.get('/customers/:id', requireAnyAdmin, async (req, res) => {
  try {
    const customer = await User.findById(req.params.id)
      .select('-password -tokenVersion -verificationToken');
    
    if (!customer || customer.role !== 'CUSTOMER') {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const leads = await Lead.find({ customer: customer._id })
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { customer, leads }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/users/customers/:id/documents — Upload document (FILE)
// ══════════════════════════════════════════════
router.post('/customers/:id/documents', requireAnyAdmin, upload.single('document'), async (req, res) => {
  try {
    const { name, type } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Validate file
    const validation = validateFile(req.file, req.file.mimetype.includes('image') ? 'image' : 'document');
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const customer = await User.findById(req.params.id);
    if (!customer || customer.role !== 'CUSTOMER') {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, 'flyajwa/documents', 'auto');

    customer.documents.push({
      name: name || req.file.originalname,
      url: result.secure_url,
      type: type || 'other',
      uploadedAt: new Date()
    });
    
    await customer.save();

    await AuditLog.create({
      action: 'USER_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      category: 'SYSTEM',
      reason: `Uploaded file "${name || req.file.originalname}" to customer vault`,
      metadata: { customerId: customer._id, documentName: name, documentType: type }
    });

    res.json({ success: true, message: 'Document uploaded successfully', data: customer.documents });
  } catch (error) {
    console.error('[Document Upload Error]', error.message);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// ══════════════════════════════════════════════
// PUT /api/users/customers/:id — Upload document (URL - legacy)
// ══════════════════════════════════════════════
router.put('/customers/:id', requireAnyAdmin, async (req, res) => {
  try {
    const { name, url, type } = req.body;

    // MED-2 FIX: Validate document URL — only allow whitelisted hosts
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, message: 'Document URL is required' });
    }
    try {
      const parsed = new URL(url);
      const allowedHosts = ['res.cloudinary.com', 'cloudinary.com', 'flyajwa.com', 'www.flyajwa.com'];
      if (!['https:'].includes(parsed.protocol) || !allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
        return res.status(400).json({ success: false, message: 'Only Cloudinary or Flyajwa hosted documents are allowed' });
      }
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid document URL' });
    }

    const customer = await User.findById(req.params.id);
    
    if (!customer || customer.role !== 'CUSTOMER') {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    customer.documents.push({
      name,
      url,
      type: type || 'other',
      uploadedAt: new Date()
    });
    await customer.save();

    await AuditLog.create({
      action: 'USER_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'SYSTEM',
      reason: `Uploaded document "${name}" to customer vault`,
      metadata: { customerId: customer._id, documentName: name, documentType: type }
    });

    res.json({ success: true, message: 'Document uploaded successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/users — Create new team member (super admin only)
// ══════════════════════════════════════════════
router.post('/', requireSuperAdmin, async (req, res) => {
  try {
    const { email, password, name, phone, role } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'Email, password, and name are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    if (role && !TEAM_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid team role' });
    }

    // Check if email exists
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Create user (password will be hashed by pre-save hook)
    const user = await User.create({
      email: email.toLowerCase().trim(),
      password,
      name: name.trim(),
      phone: phone?.trim(),
      role: role || 'TEAM',
    });

    await AuditLog.create({
      action: 'USER_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'SYSTEM',
      reason: `Account Created: New team member "${user.name}" added`,
      metadata: { targetUserId: user._id, role: user.role }
    });

    res.status(201).json({ success: true, data: user.toSafeJSON() });
  } catch (error) {
    console.error('[Users] Create error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ══════════════════════════════════════════════
// PUT /api/users/:id — Update team member
// ══════════════════════════════════════════════
router.put('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { name, phone, role, isActive, password } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!TEAM_ROLES.includes(user.role)) {
      return res.status(404).json({ success: false, message: 'Team member not found' });
    }

    if (role && !TEAM_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid team role' });
    }

    if (req.params.id === req.user._id.toString() && isActive === false) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }

    const removingActiveSuperAdmin =
      user.role === 'SUPER_ADMIN' &&
      user.isActive &&
      ((role && role !== 'SUPER_ADMIN') || isActive === false);

    if (removingActiveSuperAdmin) {
      const activeSuperAdmins = await User.countDocuments({ role: 'SUPER_ADMIN', isActive: true });
      if (activeSuperAdmins <= 1) {
        return res.status(400).json({ success: false, message: 'At least one active super admin account must remain' });
      }
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone?.trim();
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;

    if (password) {
      if (!STRONG_PASSWORD_REGEX.test(password)) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
        });
      }
      user.password = password;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
    }

    await user.save();

    await AuditLog.create({
      action: 'USER_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'CAUTION',
      reason: `Account Modified: Updates made to team member "${user.name}"`,
      metadata: { targetUserId: user._id, updates: { role, isActive, password: !!password } }
    });

    res.json({ success: true, data: user.toSafeJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// DELETE /api/users/:id — Delete team member
// ══════════════════════════════════════════════
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  try {
    // Prevent deleting yourself
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!TEAM_ROLES.includes(user.role)) {
      return res.status(404).json({ success: false, message: 'Team member not found' });
    }

    if (user.role === 'SUPER_ADMIN' && user.isActive) {
      const activeSuperAdmins = await User.countDocuments({ role: 'SUPER_ADMIN', isActive: true });
      if (activeSuperAdmins <= 1) {
        return res.status(400).json({ success: false, message: 'You cannot delete the last active super admin account' });
      }
    }

    await user.deleteOne();

    await AuditLog.create({
      action: 'USER_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'CAUTION',
      reason: `Account Deleted: Team member account "${user.name}" removed`,
      metadata: { targetUserId: user._id, name: user.name }
    });

    res.json({ success: true, message: `User ${user.name} deleted` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
