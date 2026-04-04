const mongoose = require('mongoose');

const TestimonialSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  text: {
    type: String,
    required: true,
  },
  source: {
    type: String,
    enum: ['website', 'google'],
    default: 'website',
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
  },
  avatarUrl: {
    type: String, // Optional user uploaded photo or google profile photo
    default: '',
  },
  googleReviewId: {
    type: String, // To prevent duplicate syncs
    sparse: true,
    unique: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Testimonial', TestimonialSchema);
