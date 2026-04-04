const express = require('express');
const router = express.Router();
const Testimonial = require('../models/Testimonial');
const { requireAuth } = require('../middleware/auth');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads/avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'));
  }
});

// POST /api/testimonials/upload-avatar — Public avatar upload
router.post('/upload-avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const fileName = `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
    const filePath = path.join(uploadDir, fileName);

    await sharp(req.file.buffer)
      .resize({ width: 200, height: 200, fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(filePath);

    const url = `/uploads/avatars/${fileName}`;
    res.json({ success: true, data: { url } });
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
// GET /api/testimonials — Admin list all
router.get('/', requireAuth, async (req, res) => {
  try {
    const docs = await Testimonial.find().sort({ createdAt: -1 });
    res.json({ success: true, data: docs });
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

    // Remove avatar from disk if it's a local upload
    if (doc.avatarUrl && doc.avatarUrl.startsWith('/uploads/avatars/')) {
      const filePath = path.join(__dirname, '../public', doc.avatarUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

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
