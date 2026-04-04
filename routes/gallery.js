const express = require('express');
const router = express.Router();
const Gallery = require('../models/Gallery');
const { requireAuth } = require('../middleware/auth');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads/gallery');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Memory storage for multer to process with Sharp
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit (processed down by sharp)
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'));
  }
});

// GET /api/gallery — Public (Fetch all images or filter by package)
router.get('/', async (req, res) => {
  try {
    const { package: packageSlug } = req.query;
    
    let filter = {};
    if (packageSlug === 'general') {
      filter = { $or: [{ packageSlug: null }, { packageSlug: '' }] };
    } else if (packageSlug) {
      filter = { packageSlug };
    }
    
    const docs = await Gallery.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/gallery — Admin Upload Multiple Images (Optimized with Sharp)
router.post('/', requireAuth, upload.array('images', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No images uploaded' });
    }

    const processedDocs = [];

    // Process each image buffer with Sharp
    const processingPromises = req.files.map(async (file) => {
      const fileName = `ajwa-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
      const filePath = path.join(uploadDir, fileName);

      // Perform Optimization: Resize, Convert to WebP, Compress
      await sharp(file.buffer)
        .resize({ width: 1920, withoutEnlargement: true }) // Desktop max width
        .webp({ quality: 80 }) // High quality WebP compression
        .toFile(filePath);

      processedDocs.push({
        url: `/uploads/gallery/${fileName}`,
        alt: req.body.alt || 'FlyAjwa Travel Memory',
        packageSlug: req.body.packageSlug || null,
        uploadedBy: req.user._id,
      });
    });

    await Promise.all(processingPromises);

    const insertedDocs = await Gallery.insertMany(processedDocs);

    res.status(201).json({ 
      success: true, 
      data: insertedDocs,
      message: `Successfully optimized and uploaded ${insertedDocs.length} images.`
    });
  } catch (error) {
    console.error('[Gallery Error]', error.message);
    res.status(500).json({ success: false, message: 'Upload or Optimization failed' });
  }
});

// DELETE /api/gallery/:id — Admin delete
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Gallery.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });

    // Optional: remove file from disk
    const filePath = path.join(__dirname, '../public', doc.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await Gallery.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

// POST /api/gallery/bulk-delete — Admin bulk delete
router.post('/bulk-delete', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No IDs provided' });
    }

    const docs = await Gallery.find({ _id: { $in: ids } });
    
    // Physical file cleanup
    docs.forEach(doc => {
      const filePath = path.join(__dirname, '../public', doc.url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    await Gallery.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, message: `Deleted ${docs.length} images` });
  } catch (error) {
    console.error('[Bulk Delete Error]', error.message);
    res.status(500).json({ success: false, message: 'Bulk delete failed' });
  }
});

module.exports = router;
