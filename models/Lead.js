/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa — Lead Model (Mongoose)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Tracks every customer enquiry from website, WhatsApp, phone
 * Status funnel: NEW → CONTACTED → INTERESTED → QUOTED → BOOKED
 * Supports notes, assignment, and priority
 */

const mongoose = require('mongoose');

// ── Note Sub-Schema (team conversation log) ──
const NoteSchema = new mongoose.Schema({
  by: { type: String, required: true },        // Team member name
  text: { type: String, required: true },       // Note content
  at: { type: Date, default: Date.now },        // When it was added
}, { _id: false });

// ── WhatsApp Click Sub-Schema ──
const WhatsAppClickSchema = new mongoose.Schema({
  clickedAt: { type: Date, default: Date.now },
  page: { type: String },       // Where they clicked from
  packageSlug: { type: String },
  selectedOptions: {
    days: Number,
    flight: Boolean,
    hotelStar: Number,
    groupSize: Number,
  },
}, { _id: false });

const LeadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
  },
  destination: {
    type: String,
    trim: true,
  },
  packageSlug: {
    type: String,
    trim: true,
  },
  message: {
    type: String,
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters'],
  },
  // ── Source & Tracking ──
  source: {
    type: String,
    default: 'website',
  },
  // ── WhatsApp Click Tracking ──
  whatsappClicks: [WhatsAppClickSchema],
  // ── Status Funnel ──
  status: {
    type: String,
    enum: ['NEW', 'CONTACTED', 'INTERESTED', 'QUOTED', 'BOOKED', 'LOST'],
    default: 'NEW',
    index: true,
  },
  priority: {
    type: String,
    enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
    default: 'NORMAL',
  },
  // ── Dynamic Service Forms ──
  serviceType: {
    type: String, // e.g., 'Visa Services', 'Study Abroad'
  },
  serviceDetails: {
    type: Map,
    of: String, // Stores key-value pairs like {'Target Country': 'UK'}
  },
  // ── Assignment & Notes ──
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  whatsappStatus: {
    type: String,
    enum: ['NONE', 'SENT', 'REPLIED', 'QUALIFIED', 'FAILED'],
    default: 'NONE',
  },
  externalId: {
    type: String, // From Excel/Facebook to prevent duplicates
    unique: true,
    sparse: true,
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  notes: [NoteSchema], // Conversation log
  // ── UTM Tracking ──
  utmSource: String,
  utmMedium: String,
  utmCampaign: String,
  referrer: String,
  // ── Selected Package Options (for dynamic pricing leads) ──
  selectedDays: Number,
  selectedFlight: Boolean,
  selectedHotelStar: Number,
  selectedGroupSize: Number,
  quotedPrice: Number,
}, {
  timestamps: true,
});

// ── Indexes for efficient querying ──
LeadSchema.index({ phone: 1 }); // Fast lookup for WhatsApp click tracking
LeadSchema.index({ email: 1 }); // Fast lookup for customer history
LeadSchema.index({ createdAt: -1 }); // Sort by newest
LeadSchema.index({ status: 1, createdAt: -1 }); // Filter by status
LeadSchema.index({ assignedTo: 1 }); // Filter by assignment
LeadSchema.index({ source: 1 }); // Filter by source

module.exports = mongoose.model('Lead', LeadSchema);
