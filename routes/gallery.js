const express = require('express');
const router = express.Router();
const Gallery = require('../models/Gallery');
const { requireAuth, requireAnyAdmin } = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { validateFile, sanitizeFilename } = require('../middleware/uploadValidator');

// ── Cloudinary config (uses env vars) ──
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Upload from buffer helper ──
const uploadToCloudinary = (buffer, folder = 'flyajwa/gallery') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', format: 'webp', quality: 'auto:good' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
};

// ── Multer: memory storage with enhanced validation ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 20, // Max 20 files per request
  },
  fileFilter: (req, file, cb) => {
    // Sanitize filename
    file.originalname = sanitizeFilename(file.originalname);
    
    // Validate using our validator
    const result = validateFile(file, 'image');
    if (result.valid) {
      cb(null, true);
    } else {
      cb(new Error(result.error));
    }
  },
});

// ══════════════════════════════════════════════
// GET /api/gallery — Public with optional pagination
// ══════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { package: packageSlug } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    let filter = {};
    if (packageSlug === 'general') {
      filter = { $or: [{ packageSlug: null }, { packageSlug: '' }] };
    } else if (packageSlug) {
      filter = { packageSlug };
    }

    const [docs, total] = await Promise.all([
      Gallery.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Gallery.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: docs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/gallery — Admin Upload
// ══════════════════════════════════════════════
router.post('/', requireAuth, requireAnyAdmin, upload.array('images', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No images uploaded' });
    }

    const uploadPromises = req.files.map(async (file) => {
      const result = await uploadToCloudinary(file.buffer, 'flyajwa/gallery');
      return {
        url: result.secure_url,          // Full Cloudinary CDN URL
        cloudinaryId: result.public_id,  // For deletion later
        alt: req.body.alt || 'FlyAjwa Travel Memory',
        packageSlug: req.body.packageSlug || null,
        uploadedBy: req.user._id,
      };
    });

    const processedDocs = await Promise.all(uploadPromises);
    const insertedDocs = await Gallery.insertMany(processedDocs);

    res.status(201).json({
      success: true,
      data: insertedDocs,
      message: `Successfully uploaded ${insertedDocs.length} images to CDN.`,
    });
  } catch (error) {
    console.error('[Gallery Error]', error.message);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// ══════════════════════════════════════════════
// DELETE /api/gallery/:id — Admin Delete
// ══════════════════════════════════════════════
router.delete('/:id', requireAuth, requireAnyAdmin, async (req, res) => {
  try {
    const doc = await Gallery.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });

    // Delete from Cloudinary if we have the public_id
    if (doc.cloudinaryId) {
      await cloudinary.uploader.destroy(doc.cloudinaryId);
    }

    await Gallery.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

// ══════════════════════════════════════════════
// POST /api/gallery/bulk-delete — Admin Bulk Delete
// ══════════════════════════════════════════════
router.post('/bulk-delete', requireAuth, requireAnyAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No IDs provided' });
    }

    const docs = await Gallery.find({ _id: { $in: ids } });

    // Delete from Cloudinary
    const deletePromises = docs
      .filter(doc => doc.cloudinaryId)
      .map(doc => cloudinary.uploader.destroy(doc.cloudinaryId));
    await Promise.all(deletePromises);

    await Gallery.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, message: `Deleted ${docs.length} images` });
  } catch (error) {
    console.error('[Bulk Delete Error]', error.message);
    res.status(500).json({ success: false, message: 'Bulk delete failed' });
  }
});

module.exports = router;
