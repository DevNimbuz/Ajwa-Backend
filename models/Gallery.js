const mongoose = require('mongoose');

const GallerySchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
  },
  cloudinaryId: {
    type: String,
  },
  alt: {
    type: String,
    default: 'Flyajwa Travel Moment',
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Admin who uploaded it
  },
  packageSlug: {
    type: String, // Optional: for package-specific gallery tagging
    default: null,
    index: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Gallery', GallerySchema);
