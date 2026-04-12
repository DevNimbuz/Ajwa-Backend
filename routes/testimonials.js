const express = require('express');
const router = express.Router();
const Testimonial = require('../models/Testimonial');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { validateFile, sanitizeFilename } = require('../middleware/uploadValidator');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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
  }
});

// POST /api/testimonials/upload-avatar — Public avatar upload
router.post('/upload-avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'flyajwa/avatars', resource_type: 'image', format: 'webp', quality: 'auto:good', width: 200, height: 200, crop: 'fill' },
        (error, result) => { if (error) reject(error); else resolve(result); }
      );
      stream.end(req.file.buffer);
    });

    res.json({ success: true, data: { url: result.secure_url } });
  } catch (error) {
    console.error('[Avatar Upload Error]', error.message);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// POST /api/testimonials — Public submit
router.post('/', async (req, res) => {
  try {
    const { name, rating, text, source, avatarUrl } = req.body;
    if (!name || !rating || !text) {
      return res.status(400).json({ success: false, message: 'Name, rating, and text are required' });
    }

    const doc = await Testimonial.create({
      name,
      rating: Number(rating),
      text,
      source: source || 'website',
      avatarUrl,
      status: 'PENDING',
    });

    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    console.error('[Testimonials] Create Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/testimonials/public — List APPROVED testimonials
router.get('/public', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const docs = await Testimonial.find({ status: 'APPROVED' })
      .sort({ rating: -1, createdAt: -1 })
      .limit(limit);
    
    res.json({ success: true, data: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══ ADMIN ROUTES ══
// GET /api/testimonials — Admin list all with pagination
router.get('/', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status;

    let filter = {};
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      filter.status = status;
    }

    const [docs, total] = await Promise.all([
      Testimonial.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Testimonial.countDocuments(filter),
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

// PUT /api/testimonials/:id — Approve/Reject/Update
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { status, name, text, rating, avatarUrl } = req.body;
    const doc = await Testimonial.findByIdAndUpdate(
      req.params.id,
      { status, name, text, rating, avatarUrl },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/testimonials/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Testimonial.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });

    // Note: Cloudinary avatars are not deleted automatically here to save API limits.
    // They are tiny and not a concern on the free tier.

    await Testimonial.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/testimonials/sync-google — Admin exclusively fetches place reviews
router.post('/sync-google', requireAuth, async (req, res) => {
  try {
    const { placeId } = req.body;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!apiKey || !placeId) {
      return res.status(400).json({ success: false, message: 'Please configure GOOGLE_PLACES_API_KEY inside backend/.env and provide placeId' });
    }

    const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&key=${apiKey}`);
    const data = await response.json();

    if (!data.result || !data.result.reviews) {
      return res.status(400).json({ success: false, message: 'No reviews found from Google APIs' });
    }

    let synced = 0;
    const { reviews } = data.result;

    for (const review of reviews) {
      // Only keep 4+ stars
      if (review.rating >= 4) {
        try {
          // Wrap in try catch to ignore duplicates uniquely triggered by googleReviewId schema index
          await Testimonial.create({
            name: review.author_name,
            rating: review.rating,
            text: review.text,
            source: 'google',
            status: 'APPROVED',
            avatarUrl: review.profile_photo_url,
            googleReviewId: review.author_url || review.time.toString(), 
          });
          synced++;
        } catch (duplicateErr) {
          // ignore duplicate
        }
      }
    }

    res.json({ success: true, message: `Successfully synced ${synced} high-rating reviews from Google.` });
  } catch (error) {
    console.error('[Google Sync Error]', error.message);
    res.status(500).json({ success: false, message: 'Failed fetching Google Reviews.' });
  }
});

module.exports = router;
