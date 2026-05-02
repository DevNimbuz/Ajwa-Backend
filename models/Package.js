/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Flyajwa — Package Model (Mongoose)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Tour package with embedded pricing variants
 * Each variant = combination of (days, flight, hotel star)
 * Admin sets base/min/max prices per variant
 */

const mongoose = require('mongoose');

// ── Group Discount Sub-Schema ──
const GroupDiscountSchema = new mongoose.Schema({
  minSize: { type: Number, required: true },  // e.g. 3
  maxSize: { type: Number, required: true },  // e.g. 5
  discountPercent: { type: Number, required: true }, // e.g. 5 (%)
}, { _id: false });

// ── Pricing Variant Sub-Schema ──
// Each variant represents one pricing option (e.g., 4N/5D, without flight, 3-star)
const PackageVariantSchema = new mongoose.Schema({
  durationDays: { type: Number, required: true },     // e.g. 4
  durationNights: { type: Number, required: true },   // e.g. 3
  withFlight: { type: Boolean, default: false },
  hotelStar: { type: Number, default: 3, enum: [3, 4, 5] },
  basePrice: { type: Number, required: true },   // Standard display price
  minPrice: { type: Number, required: true },     // Lowest (off-season/group)
  maxPrice: { type: Number, required: true },     // Peak season/premium
  groupDiscounts: [GroupDiscountSchema],           // Discount tiers by group size
  isActive: { type: Boolean, default: true },
}, { _id: true, timestamps: true });

// ── Itinerary Day Sub-Schema ──
const ItineraryDaySchema = new mongoose.Schema({
  day: { type: String, required: false },          // "Day 01"
  title: { type: String, required: true },        // "Arrival & City Tour"
  description: { type: String, required: false },  // Full description (Frontend name)
  desc: { type: String, required: false },         // Full description (Legacy name)
  highlights: [String],                            // List of highlights (Frontend name)
  activities: [String],                            // List of activities (Legacy name)
  optional: { type: Boolean, default: false },     // Optional activities flag
}, { _id: false });

// ── FAQ Sub-Schema ──
const FaqSchema = new mongoose.Schema({
  q: { type: String, required: true },
  a: { type: String, required: true },
}, { _id: false });

// ── Main Package Schema ──
const PackageSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Package name is required'],
    trim: true,
  },
  title: {
    type: String,
    required: [true, 'Package title is required'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
  },
  tagline: {
    type: String,
    trim: true,
  },
  heroImg: {
    type: String,
    required: true,
  },
  gallery: [String],        // Array of image paths
  highlights: [String],     // Tour highlights
  itinerary: [ItineraryDaySchema], // Day-by-day itinerary
  included: [String],       // What's included
  excluded: [String],       // What's not included
  faqs: [FaqSchema],        // Frequently asked questions
  snapshots: [String],      // Client snapshot images (from Gallery)
  variants: [PackageVariantSchema], // Pricing variants
  isActive: {
    type: Boolean,
    default: true,
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

// ── Virtual: Get lowest price across all active variants ──
PackageSchema.virtual('startingPrice').get(function () {
  const activeVariants = this.variants.filter(v => v.isActive);
  if (activeVariants.length === 0) return 0;
  return Math.min(...activeVariants.map(v => v.basePrice));
});

// ── Virtual: Get default duration (first active variant) ──
PackageSchema.virtual('defaultDuration').get(function () {
  const first = this.variants.find(v => v.isActive);
  if (!first) return '';
  return `${first.durationDays} Days / ${first.durationNights} Nights`;
});

// Ensure virtuals are included in JSON output
PackageSchema.set('toJSON', { virtuals: true });
PackageSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Package', PackageSchema);
