require('dotenv').config();
const mongoose = require('mongoose');
const Testimonial = require('./models/Testimonial');
const connectDB = require('./config/db');

const seedReviews = async () => {
  await connectDB();

  const reviews = [
    {
      name: 'HASHIJ M',
      rating: 5,
      text: 'Had an amazing experience on our 5 day, 4 night Delhi - Manali trip with Ajwa Travels and Holidays. They guided us through every detail while planning the trip, even though we approached them at the last minute. We had a great time relying on their excellent service.',
      source: 'google',
      status: 'APPROVED',
      avatarUrl: '', // Will use initial 'H' fallback in frontend
      googleReviewId: 'google-review-1',
    },
    {
      name: 'Priyanka Menon',
      rating: 5,
      text: 'Exceptional service for our family trip to the Maldives! The team at FlyAjwa took care of the flight bookings, resort transfers, and visas flawlessly. Everything was incredibly smooth and truly a 5-star experience from start to finish.',
      source: 'google',
      status: 'APPROVED',
      avatarUrl: '',
      googleReviewId: 'google-review-2',
    },
    {
      name: 'Rahul Nair',
      rating: 4,
      text: 'Very professional agency in Edappal. They helped me secure my UAE Visit Visa within days with zero hassle. The staff is polite, highly responsive on WhatsApp, and very knowledgeable. Highly recommended.',
      source: 'google',
      status: 'APPROVED',
      avatarUrl: '',
      googleReviewId: 'google-review-3',
    },
    {
      name: 'Fathima KS',
      rating: 5,
      text: 'We booked our Umrah package through Ajwa Travels and it was a spiritually beautiful journey. The accommodation was extremely close to the Haram, and their guided tours were perfect for our elderly parents.',
      source: 'google',
      status: 'APPROVED',
      avatarUrl: '',
      googleReviewId: 'google-review-4',
    }
  ];

  try {
    for (const r of reviews) {
      // Use upsert to avoid duplicate errors if run multiple times
      await Testimonial.findOneAndUpdate(
        { googleReviewId: r.googleReviewId },
        { $set: r },
        { upsert: true, new: true }
      );
    }
    console.log('✅ Successfully seeded Google Reviews into database!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding reviews:', error.message);
    process.exit(1);
  }
};

seedReviews();
