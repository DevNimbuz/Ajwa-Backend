/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa — Package Routes
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * GET    /api/packages             — List all active packages (public)
 * GET    /api/packages/all         — List ALL packages including inactive (admin)
 * GET    /api/packages/:slug       — Get single package (public)
 * GET    /api/packages/:slug/pricing — Dynamic price calculation (public)
 * POST   /api/packages             — Create package (super admin)
 * PUT    /api/packages/:id         — Update package (super admin)
 * DELETE /api/packages/:id         — Delete package (super admin)
 */

const express = require('express');
const router = express.Router();
const Package = require('../models/Package');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireSuperAdmin, requireAnyAdmin } = require('../middleware/auth');
const { getClientIP, detectDevice } = require('../middleware/security');
const { cacheMiddleware, clearCache } = require('../utils/cache');

// ══════════════════════════════════════════════
// GET /api/packages — List active packages (PUBLIC)
// ══════════════════════════════════════════════
router.get('/', cacheMiddleware(1800), async (req, res) => {
  try {
    const packages = await Package.find({ isActive: true })
      .select('_id slug name title tagline heroImg sortOrder variants')
      .sort({ sortOrder: 1 });

    // Transform for frontend — include starting price and default duration
    const result = packages.map(pkg => {
      const activeVariants = pkg.variants.filter(v => v.isActive);
      const lowestPrice = activeVariants.length > 0
        ? Math.min(...activeVariants.map(v => v.basePrice))
        : 0;
      const defaultVariant = activeVariants[0];

      return {
        _id: pkg._id.toString(),
        slug: pkg.slug,
        name: pkg.name,
        title: pkg.title,
        tagline: pkg.tagline,
        heroImg: pkg.heroImg,
        startingPrice: lowestPrice,
        duration: defaultVariant
          ? `${defaultVariant.durationDays} Days / ${defaultVariant.durationNights} Nights`
          : 'Customizable',
        tourType: pkg.tourType || 'Private / Group',
      };
    });

    res.json({ success: true, count: result.length, data: result });
  } catch (error) {
    console.error('[Packages] List error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// GET /api/packages/all — List ALL packages (ADMIN)
// ══════════════════════════════════════════════
router.get('/all', requireAuth, requireAnyAdmin, async (req, res) => {
  try {
    const packages = await Package.find().sort({ sortOrder: 1 });
    res.json({ success: true, count: packages.length, data: packages });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// GET /api/packages/:slug — Get single package (PUBLIC)
// ══════════════════════════════════════════════
router.get('/:slug', cacheMiddleware(1800), async (req, res) => {
  try {
    const pkg = await Package.findOne({ slug: req.params.slug, isActive: true });

    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    res.json({ success: true, data: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// GET /api/packages/:slug/pricing — Dynamic price calculation (PUBLIC)
// Query: ?days=5&flight=true&star=3&groupSize=4
// ══════════════════════════════════════════════
router.get('/:slug/pricing', async (req, res) => {
  try {
    const { days, flight, star, groupSize } = req.query;
    const pkg = await Package.findOne({ slug: req.params.slug, isActive: true });

    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    // Find matching variant
    const daysNum = parseInt(days) || pkg.variants[0]?.durationDays || 4;
    const flightBool = flight === 'true';
    const starNum = parseInt(star) || 3;
    const groupNum = parseInt(groupSize) || 1;

    // Only return exact match
    const variant = pkg.variants.find(v =>
      v.isActive &&
      v.durationDays === daysNum &&
      v.withFlight === flightBool &&
      v.hotelStar === starNum
    );

    if (!variant) {
      return res.status(404).json({ success: false, message: 'No exact pricing variant found for this combination' });
    }

    // Calculate group discount
    let discount = 0;
    if (groupNum > 1 && variant.groupDiscounts.length > 0) {
      const tier = variant.groupDiscounts.find(g => groupNum >= g.minSize && groupNum <= g.maxSize);
      if (tier) discount = tier.discountPercent;
    }

    const basePrice = variant.basePrice;
    const discountedPrice = Math.round(basePrice * (1 - discount / 100));

    res.json({
      success: true,
      data: {
        durationDays: variant.durationDays,
        durationNights: variant.durationNights,
        withFlight: variant.withFlight,
        hotelStar: variant.hotelStar,
        basePrice,
        minPrice: variant.minPrice,
        maxPrice: variant.maxPrice,
        groupSize: groupNum,
        groupDiscount: discount,
        finalPrice: discountedPrice,
        pricePerPerson: discountedPrice,
        currency: '₹',
      },
    });
  } catch (error) {
    console.error('[Packages] Pricing error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
// POST /api/packages — Create package (SUPER ADMIN)
// ══════════════════════════════════════════════
router.post('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const pkg = await Package.create(req.body);
    clearCache('/api/packages');

    await AuditLog.create({
      action: 'PACKAGE_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'SYSTEM',
      reason: `Created new travel package: "${pkg.name}"`,
      metadata: { packageId: pkg._id, name: pkg.name }
    });

    res.status(201).json({ success: true, data: pkg });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Package with this slug already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// ══════════════════════════════════════════════
// PUT /api/packages/:id — Update package (SUPER ADMIN)
// ══════════════════════════════════════════════
router.put('/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const pkg = await Package.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    clearCache('/api/packages');

    await AuditLog.create({
      action: 'PACKAGE_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'SYSTEM',
      reason: `Updated travel package configuration: "${pkg.name}"`,
      metadata: { packageId: pkg._id }
    });

    res.json({ success: true, data: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ══════════════════════════════════════════════
// DELETE /api/packages/:id — Delete package (SUPER ADMIN)
// ══════════════════════════════════════════════
router.delete('/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const pkg = await Package.findByIdAndDelete(req.params.id);

    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    clearCache('/api/packages');

    await AuditLog.create({
      action: 'PACKAGE_MUTATION',
      user: req.user._id,
      email: req.user.email,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      device: detectDevice(req.headers['user-agent']),
      category: 'CAUTION',
      reason: `Permanently deleted travel package: "${pkg.name}"`,
      metadata: { packageId: pkg._id, name: pkg.name }
    });

    res.json({ success: true, message: 'Package deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
