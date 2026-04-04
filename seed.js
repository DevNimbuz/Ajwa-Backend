/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa Backend — Database Seed Script
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Run: cd backend && node seed.js
 *
 * Creates:
 *   1. Super Admin account
 *   2. All 11 tour packages with pricing variants
 *   3. Default site settings
 *
 * ┌─────────────────────────────────────────────┐
 * │  Admin Email:    admin@flyajwa.com          │
 * │  Admin Password: FlyAjwa@Admin2026!         │
 * └─────────────────────────────────────────────┘
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Package = require('./models/Package');
const Setting = require('./models/Setting');

// ── Default group discount tiers ──
const groupDiscounts = [
  { minSize: 3, maxSize: 5, discountPercent: 5 },
  { minSize: 6, maxSize: 10, discountPercent: 10 },
  { minSize: 11, maxSize: 50, discountPercent: 15 },
];

// ── All Packages Data ──
const packagesData = [
  {
    slug: 'maldives-package', name: 'Maldives', tagline: 'Paradise on Earth',
    title: 'Experience the Maldives: A Thrilling Adventure Awaits!',
    description: 'Discover the breathtaking beauty of the Maldives while indulging in the most thrilling and adventurous activities.',
    heroImg: '/assets/img/Ajwa/maldives-ajwa.webp',
    gallery: ['/assets/img/Ajwa/Maldives/maldives1-ajwa.webp', '/assets/img/Ajwa/Maldives/maldives2-ajwa.webp', '/assets/img/Ajwa/Maldives/maldives3-ajwa.webp', '/assets/img/Ajwa/Maldives/maldives4-ajwa.webp', '/assets/img/Ajwa/Maldives/maldives5-ajwa.webp'],
    highlights: ['Sunset Cruise & Fishing Trip', 'Snorkeling & Dolphin Watching', 'Sandbank Picnic', 'Manta Ray & Shark Encounter', 'Thrilling Water Sports'],
    itinerary: [
      { day: 'Day 01', title: 'Arrival', desc: 'Airport transfer to Maafushi Island. Explore the island, sunset cruise with fishing, fish BBQ dinner.', activities: ['Explore Maafushi Island', 'Sunset Cruise & Fishing', 'Fish BBQ Dinner'] },
      { day: 'Day 02', title: 'Snorkeling & Sandbank', desc: 'Half-day snorkeling at coral reefs, dolphin reef, sandbank picnic with packed lunch.', activities: ['Snorkel coral reefs', 'Dolphin & turtle reef', 'Sandbank relaxation'] },
      { day: 'Day 03', title: 'Marine Adventures', desc: 'Manta ray trip, shark encounter, island hopping, water sports.', activities: ['Manta Ray Trip', 'Shark Encounter', 'Water Sports'], optional: true },
      { day: 'Day 04', title: 'Departure', desc: 'Breakfast, checkout, speedboat transfer to airport.', activities: [] },
    ],
    included: ['3-star accommodation', 'Airport transfers via speedboat', 'Guided sightseeing', 'All meals included', 'Sandbank excursion', 'Dolphin & turtle reef tour'],
    excluded: ['Flight tickets', 'Optional activities', 'Personal expenses'],
    faqs: [
      { q: 'How do I book?', a: 'Contact us via WhatsApp, call, or email with your preferences.' },
      { q: 'Payment methods?', a: 'Cash, bank transfer, UPI, or credit/debit cards.' },
      { q: 'Cancellation policy?', a: 'Depends on timing. Early cancellations may receive full refund.' },
      { q: 'Group discounts?', a: 'Yes! Special pricing for groups of 3+.' },
    ],
    snapshots: ['/assets/img/Ajwa/Gallery/1.jpg', '/assets/img/Ajwa/Gallery/2.jpg', '/assets/img/Ajwa/Gallery/3.jpg', '/assets/img/Ajwa/Gallery/4.jpg', '/assets/img/Ajwa/Gallery/5.jpg', '/assets/img/Ajwa/Gallery/6.jpg'],
    variants: [
      { durationDays: 4, durationNights: 3, withFlight: false, hotelStar: 3, basePrice: 18999, minPrice: 16149, maxPrice: 23749, groupDiscounts },
      { durationDays: 4, durationNights: 3, withFlight: true, hotelStar: 3, basePrice: 28999, minPrice: 24649, maxPrice: 36249, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: false, hotelStar: 3, basePrice: 24499, minPrice: 20824, maxPrice: 30624, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: true, hotelStar: 3, basePrice: 34499, minPrice: 29324, maxPrice: 43124, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: false, hotelStar: 3, basePrice: 32999, minPrice: 28049, maxPrice: 41249, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: true, hotelStar: 3, basePrice: 44999, minPrice: 38249, maxPrice: 56249, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: false, hotelStar: 5, basePrice: 45999, minPrice: 39099, maxPrice: 57499, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: true, hotelStar: 5, basePrice: 55999, minPrice: 47599, maxPrice: 69999, groupDiscounts },
    ],
  },
  {
    slug: 'thailand-package', name: 'Thailand', tagline: 'Land of Smiles',
    title: 'Explore Thailand: Land of Smiles!',
    description: 'Experience the vibrant culture, stunning temples, and beautiful beaches of Thailand.',
    heroImg: '/assets/img/Ajwa/Thailand-ajwa.jpg',
    gallery: ['/assets/img/Ajwa/Thailand/thailand1.webp', '/assets/img/Ajwa/Thailand/thailand2.webp', '/assets/img/Ajwa/Thailand/thailand3.webp', '/assets/img/Ajwa/Thailand/thailand4.webp', '/assets/img/Ajwa/Thailand/thailand5.webp'],
    highlights: ['Bangkok City Tour', 'Phi Phi Islands', 'Thai Temple Visit', 'Floating Market', 'Thai Cooking Class'],
    included: ['Hotel accommodation', 'Airport transfers', 'Sightseeing as per itinerary', 'Daily breakfast'],
    excluded: ['Flight tickets', 'Personal expenses', 'Activities not in inclusions'],
    faqs: [{ q: 'How do I book?', a: 'Contact us via WhatsApp, call, or email.' }, { q: 'Group discounts?', a: 'Yes! Special pricing for groups of 3+.' }],
    snapshots: ['/assets/img/Ajwa/Gallery/7.jpg', '/assets/img/Ajwa/Gallery/8.jpg', '/assets/img/Ajwa/Gallery/9.jpg', '/assets/img/Ajwa/Gallery/10.jpg', '/assets/img/Ajwa/Gallery/11.jpg', '/assets/img/Ajwa/Gallery/12.jpg'],
    variants: [
      { durationDays: 5, durationNights: 4, withFlight: false, hotelStar: 3, basePrice: 18999, minPrice: 16149, maxPrice: 23749, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: true, hotelStar: 3, basePrice: 28999, minPrice: 24649, maxPrice: 36249, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: false, hotelStar: 3, basePrice: 22999, minPrice: 19549, maxPrice: 28749, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: true, hotelStar: 3, basePrice: 34999, minPrice: 29749, maxPrice: 43749, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: false, hotelStar: 5, basePrice: 38999, minPrice: 33149, maxPrice: 48749, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: true, hotelStar: 5, basePrice: 50999, minPrice: 43349, maxPrice: 63749, groupDiscounts },
    ],
  },
  {
    slug: 'azerbaijan-package', name: 'Azerbaijan', tagline: 'Land of Fire',
    title: 'Discover Azerbaijan: Land of Fire!',
    description: 'Explore the stunning landscapes and rich culture of Azerbaijan.',
    heroImg: '/assets/img/Ajwa/azerbaijan3-ajwa.webp',
    gallery: ['/assets/img/Ajwa/Azerbaijan/azerbaijan1.webp', '/assets/img/Ajwa/Azerbaijan/azerbaijan2.webp', '/assets/img/Ajwa/Azerbaijan/azerbaijan3.webp', '/assets/img/Ajwa/Azerbaijan/azerbaijan4.webp', '/assets/img/Ajwa/Azerbaijan/azerbaijan5.webp'],
    highlights: ['Baku Old City', 'Flame Towers', 'Heydar Aliyev Center', 'Mud Volcanoes', 'Gobustan Rock Art'],
    included: ['Hotel accommodation', 'Airport transfers', 'Guided sightseeing', 'Daily breakfast'],
    excluded: ['Flight tickets', 'Personal expenses', 'Optional activities'],
    faqs: [{ q: 'How do I book?', a: 'Contact us via WhatsApp, call, or email.' }, { q: 'Group discounts?', a: 'Yes! Special pricing for groups of 3+.' }],
    snapshots: ['/assets/img/Ajwa/Gallery/13.jpg', '/assets/img/Ajwa/Gallery/14.jpg', '/assets/img/Ajwa/Gallery/15.jpg', '/assets/img/Ajwa/Gallery/16.jpg', '/assets/img/Ajwa/Gallery/17.jpg', '/assets/img/Ajwa/Gallery/18.jpg'],
    variants: [
      { durationDays: 5, durationNights: 4, withFlight: false, hotelStar: 3, basePrice: 24999, minPrice: 21249, maxPrice: 31249, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: true, hotelStar: 3, basePrice: 36999, minPrice: 31449, maxPrice: 46249, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: false, hotelStar: 3, basePrice: 29999, minPrice: 25499, maxPrice: 37499, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: true, hotelStar: 3, basePrice: 42999, minPrice: 36549, maxPrice: 53749, groupDiscounts },
    ],
  },
  {
    slug: 'malaysia-package', name: 'Malaysia', tagline: 'Truly Asia',
    title: 'Explore Malaysia: Truly Asia!',
    description: "Discover Malaysia's diverse culture, stunning islands, and modern cities.",
    heroImg: '/assets/img/Ajwa/Malaysia-ajwa.webp',
    gallery: ['/assets/img/Ajwa/Malaysia/malaysia1-ajwa.webp', '/assets/img/Ajwa/Malaysia/malaysia2-ajwa.webp', '/assets/img/Ajwa/Malaysia/malaysia3-ajwa.webp', '/assets/img/Ajwa/Malaysia/malaysia4-ajwa.webp', '/assets/img/Ajwa/Malaysia/malaysia5-ajwa.webp'],
    highlights: ['Petronas Twin Towers', 'Langkawi Island', 'Batu Caves', 'Georgetown Heritage', 'Genting Highlands'],
    included: ['Hotel accommodation', 'Airport transfers', 'Guided sightseeing', 'Daily breakfast'],
    excluded: ['Flight tickets', 'Personal expenses'],
    faqs: [{ q: 'How do I book?', a: 'Contact us via WhatsApp, call, or email.' }],
    snapshots: ['/assets/img/Ajwa/Gallery/19.jpg', '/assets/img/Ajwa/Gallery/20.jpg', '/assets/img/Ajwa/Gallery/21.jpg', '/assets/img/Ajwa/Gallery/22.jpg', '/assets/img/Ajwa/Gallery/23.jpg', '/assets/img/Ajwa/Gallery/24.jpg'],
    variants: [
      { durationDays: 5, durationNights: 4, withFlight: false, hotelStar: 3, basePrice: 15999, minPrice: 13599, maxPrice: 19999, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: true, hotelStar: 3, basePrice: 24999, minPrice: 21249, maxPrice: 31249, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: false, hotelStar: 3, basePrice: 19999, minPrice: 16999, maxPrice: 24999, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: true, hotelStar: 3, basePrice: 29999, minPrice: 25499, maxPrice: 37499, groupDiscounts },
    ],
  },
  {
    slug: 'dubai-package', name: 'Dubai', tagline: 'City of Dreams',
    title: 'Experience Dubai: City of Dreams!',
    description: 'Experience the luxury and excitement of Dubai with our curated packages.',
    heroImg: '/assets/img/Ajwa/Uae-ajwaVisa.jpg',
    gallery: ['/assets/img/Ajwa/Dubai/dubai1.webp', '/assets/img/Ajwa/Dubai/dubai2.webp', '/assets/img/Ajwa/Dubai/dubai3.webp', '/assets/img/Ajwa/Dubai/dubai4.webp', '/assets/img/Ajwa/Dubai/dubai5.webp'],
    highlights: ['Burj Khalifa Visit', 'Desert Safari', 'Dubai Mall & Aquarium', 'Palm Jumeirah', 'Dhow Cruise Dinner'],
    included: ['Hotel accommodation', 'Airport transfers', 'Guided sightseeing', 'Daily breakfast'],
    excluded: ['Flight tickets', 'Personal expenses', 'Optional activities'],
    faqs: [{ q: 'How do I book?', a: 'Contact us via WhatsApp, call, or email.' }],
    snapshots: ['/assets/img/Ajwa/Gallery/25.jpg', '/assets/img/Ajwa/Gallery/26.jpg', '/assets/img/Ajwa/Gallery/27.jpg', '/assets/img/Ajwa/Gallery/28.jpg', '/assets/img/Ajwa/Gallery/29.jpg', '/assets/img/Ajwa/Gallery/30.jpg'],
    variants: [
      { durationDays: 4, durationNights: 3, withFlight: false, hotelStar: 3, basePrice: 19999, minPrice: 16999, maxPrice: 24999, groupDiscounts },
      { durationDays: 4, durationNights: 3, withFlight: true, hotelStar: 3, basePrice: 29999, minPrice: 25499, maxPrice: 37499, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: false, hotelStar: 3, basePrice: 25999, minPrice: 22099, maxPrice: 32499, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: true, hotelStar: 3, basePrice: 35999, minPrice: 30599, maxPrice: 44999, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: false, hotelStar: 5, basePrice: 45999, minPrice: 39099, maxPrice: 57499, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: true, hotelStar: 5, basePrice: 55999, minPrice: 47599, maxPrice: 69999, groupDiscounts },
    ],
  },
  {
    slug: 'kashmir-package', name: 'Kashmir', tagline: 'Paradise of India',
    title: 'Visit Kashmir: Paradise of India!',
    description: 'Experience the breathtaking beauty of Kashmir — snow-capped mountains, Dal Lake, and more.',
    heroImg: '/assets/img/Ajwa/trek.webp',
    gallery: ['/assets/img/Ajwa/Kashmir/kashmir1.webp', '/assets/img/Ajwa/Kashmir/kashmir2.webp', '/assets/img/Ajwa/Kashmir/kashmir3.webp', '/assets/img/Ajwa/Kashmir/kashmir4.webp', '/assets/img/Ajwa/Kashmir/kashmir5.webp'],
    highlights: ['Dal Lake Shikara Ride', 'Gulmarg Gondola', 'Pahalgam Valley', 'Mughal Gardens', 'Local Cuisine'],
    included: ['Hotel accommodation', 'Airport transfers', 'Sightseeing', 'Daily breakfast'],
    excluded: ['Flight tickets', 'Personal expenses'],
    faqs: [{ q: 'How do I book?', a: 'Contact us via WhatsApp, call, or email.' }],
    snapshots: ['/assets/img/Ajwa/Gallery/31.jpg', '/assets/img/Ajwa/Gallery/32.jpg', '/assets/img/Ajwa/Gallery/33.jpg', '/assets/img/Ajwa/Gallery/34.jpg', '/assets/img/Ajwa/Gallery/35.jpg', '/assets/img/Ajwa/Gallery/36.jpg'],
    variants: [
      { durationDays: 4, durationNights: 3, withFlight: false, hotelStar: 3, basePrice: 11999, minPrice: 10199, maxPrice: 14999, groupDiscounts },
      { durationDays: 4, durationNights: 3, withFlight: true, hotelStar: 3, basePrice: 19999, minPrice: 16999, maxPrice: 24999, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: false, hotelStar: 3, basePrice: 14999, minPrice: 12749, maxPrice: 18749, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: true, hotelStar: 3, basePrice: 22999, minPrice: 19549, maxPrice: 28749, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: false, hotelStar: 3, basePrice: 19999, minPrice: 16999, maxPrice: 24999, groupDiscounts },
      { durationDays: 7, durationNights: 6, withFlight: true, hotelStar: 3, basePrice: 28999, minPrice: 24649, maxPrice: 36249, groupDiscounts },
    ],
  },
  {
    slug: 'bali-package', name: 'Bali', tagline: 'Island of Gods',
    title: 'Explore Bali: Island of Gods!',
    description: "Discover Bali's stunning temples, rice terraces, and vibrant nightlife.",
    heroImg: '/assets/img/Ajwa/ajwa-beach.webp',
    gallery: ['/assets/img/Ajwa/Bali/Bali1.webp', '/assets/img/Ajwa/Bali/Bali2.webp', '/assets/img/Ajwa/Bali/Bali3.webp', '/assets/img/Ajwa/Bali/Bali4.webp', '/assets/img/Ajwa/Bali/Bali5.webp'],
    highlights: ['Ubud Rice Terraces', 'Tanah Lot Temple', 'Kuta Beach', 'Mount Batur Sunrise', 'Balinese Spa'],
    included: ['Hotel accommodation', 'Airport transfers', 'Guided sightseeing', 'Daily breakfast'],
    excluded: ['Flight tickets', 'Personal expenses'],
    faqs: [{ q: 'How do I book?', a: 'Contact us via WhatsApp, call, or email.' }],
    snapshots: ['/assets/img/Ajwa/Gallery/37.jpg', '/assets/img/Ajwa/Gallery/38.jpg', '/assets/img/Ajwa/Gallery/39.jpg', '/assets/img/Ajwa/Gallery/40.jpg', '/assets/img/Ajwa/Gallery/41.jpg', '/assets/img/Ajwa/Gallery/42.jpg'],
    variants: [
      { durationDays: 5, durationNights: 4, withFlight: false, hotelStar: 3, basePrice: 22999, minPrice: 19549, maxPrice: 28749, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: true, hotelStar: 3, basePrice: 34999, minPrice: 29749, maxPrice: 43749, groupDiscounts },
      { durationDays: 6, durationNights: 5, withFlight: false, hotelStar: 3, basePrice: 26999, minPrice: 22949, maxPrice: 33749, groupDiscounts },
      { durationDays: 6, durationNights: 5, withFlight: true, hotelStar: 3, basePrice: 38999, minPrice: 33149, maxPrice: 48749, groupDiscounts },
    ],
  },
  {
    slug: 'goa-package', name: 'Goa', tagline: 'Beach Paradise',
    title: 'Enjoy Goa: Beach Paradise!',
    description: "Relax on pristine beaches, explore Portuguese heritage, and enjoy Goa's vibrant nightlife.",
    heroImg: '/assets/img/Ajwa/surfing-02.jpg',
    gallery: ['/assets/img/Ajwa/Goa/goa1.webp', '/assets/img/Ajwa/Goa/goa2.webp', '/assets/img/Ajwa/Goa/goa3.webp', '/assets/img/Ajwa/Goa/goa4.webp', '/assets/img/Ajwa/Goa/goa5.webp'],
    highlights: ['Beach Hopping', 'Water Sports', 'Old Goa Churches', 'Dudhsagar Falls', 'Spice Plantation'],
    included: ['Hotel accommodation', 'Airport transfers', 'Sightseeing', 'Daily breakfast'],
    excluded: ['Flight tickets', 'Personal expenses'],
    faqs: [{ q: 'How do I book?', a: 'Contact us via WhatsApp, call, or email.' }],
    snapshots: ['/assets/img/Ajwa/Gallery/43.jpg', '/assets/img/Ajwa/Gallery/44.jpg', '/assets/img/Ajwa/Gallery/45.jpg', '/assets/img/Ajwa/Gallery/46.jpg', '/assets/img/Ajwa/Gallery/47.jpg', '/assets/img/Ajwa/Gallery/48.jpg'],
    variants: [
      { durationDays: 3, durationNights: 2, withFlight: false, hotelStar: 3, basePrice: 7999, minPrice: 6799, maxPrice: 9999, groupDiscounts },
      { durationDays: 3, durationNights: 2, withFlight: true, hotelStar: 3, basePrice: 14999, minPrice: 12749, maxPrice: 18749, groupDiscounts },
      { durationDays: 4, durationNights: 3, withFlight: false, hotelStar: 3, basePrice: 9999, minPrice: 8499, maxPrice: 12499, groupDiscounts },
      { durationDays: 4, durationNights: 3, withFlight: true, hotelStar: 3, basePrice: 17999, minPrice: 15299, maxPrice: 22499, groupDiscounts },
    ],
  },
  {
    slug: 'manali-package', name: 'Manali', tagline: 'Mountain Escape',
    title: 'Discover Manali: Mountain Escape!',
    description: 'Experience the magic of Manali — snow-covered peaks, adventure sports, and serene valleys.',
    heroImg: '/assets/img/Ajwa/ski-touring-02.jpg',
    gallery: ['/assets/img/Ajwa/Manali/manali1.webp', '/assets/img/Ajwa/Manali/manali2.webp', '/assets/img/Ajwa/Manali/manali3.webp', '/assets/img/Ajwa/Manali/manali4.webp', '/assets/img/Ajwa/Manali/manali5.webp'],
    highlights: ['Rohtang Pass', 'Solang Valley', 'Hadimba Temple', 'Old Manali', 'River Rafting'],
    included: ['Hotel accommodation', 'Airport transfers', 'Sightseeing', 'Daily breakfast'],
    excluded: ['Flight tickets', 'Personal expenses'],
    faqs: [{ q: 'How do I book?', a: 'Contact us via WhatsApp, call, or email.' }],
    snapshots: ['/assets/img/Ajwa/Gallery/49.jpg', '/assets/img/Ajwa/Gallery/50.jpg', '/assets/img/Ajwa/Gallery/51.jpg', '/assets/img/Ajwa/Gallery/52.jpg', '/assets/img/Ajwa/Gallery/53.jpg', '/assets/img/Ajwa/Gallery/54.jpg'],
    variants: [
      { durationDays: 4, durationNights: 3, withFlight: false, hotelStar: 3, basePrice: 9999, minPrice: 8499, maxPrice: 12499, groupDiscounts },
      { durationDays: 4, durationNights: 3, withFlight: true, hotelStar: 3, basePrice: 16999, minPrice: 14449, maxPrice: 21249, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: false, hotelStar: 3, basePrice: 12999, minPrice: 11049, maxPrice: 16249, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: true, hotelStar: 3, basePrice: 19999, minPrice: 16999, maxPrice: 24999, groupDiscounts },
    ],
  },
  {
    slug: 'vietnam-package', name: 'Vietnam', tagline: 'Hidden Gem of Asia',
    title: 'Explore Vietnam: Hidden Gem of Asia!',
    description: "Discover Vietnam's rich history, stunning landscapes, and incredible cuisine.",
    heroImg: '/assets/img/Ajwa/Thailand-ajwa3.jpg',
    gallery: ['/assets/img/Ajwa/Vietnam/vietnam1.jpg', '/assets/img/Ajwa/Vietnam/vietnam2.jpg', '/assets/img/Ajwa/Vietnam/vietnam3.jpeg', '/assets/img/Ajwa/Vietnam/vietnam4.jpg', '/assets/img/Ajwa/Vietnam/vietnam5.jpg'],
    highlights: ['Ha Long Bay Cruise', 'Hoi An Ancient Town', 'Cu Chi Tunnels', 'Mekong Delta', 'Street Food Tour'],
    included: ['Hotel accommodation', 'Airport transfers', 'Guided sightseeing', 'Daily breakfast'],
    excluded: ['Flight tickets', 'Personal expenses'],
    faqs: [{ q: 'How do I book?', a: 'Contact us via WhatsApp, call, or email.' }],
    snapshots: ['/assets/img/Ajwa/Gallery/1.jpg', '/assets/img/Ajwa/Gallery/10.jpg', '/assets/img/Ajwa/Gallery/20.jpg', '/assets/img/Ajwa/Gallery/30.jpg', '/assets/img/Ajwa/Gallery/40.jpg', '/assets/img/Ajwa/Gallery/50.jpg'],
    variants: [
      { durationDays: 5, durationNights: 4, withFlight: false, hotelStar: 3, basePrice: 19999, minPrice: 16999, maxPrice: 24999, groupDiscounts },
      { durationDays: 5, durationNights: 4, withFlight: true, hotelStar: 3, basePrice: 32999, minPrice: 28049, maxPrice: 41249, groupDiscounts },
      { durationDays: 6, durationNights: 5, withFlight: false, hotelStar: 3, basePrice: 24999, minPrice: 21249, maxPrice: 31249, groupDiscounts },
      { durationDays: 6, durationNights: 5, withFlight: true, hotelStar: 3, basePrice: 38999, minPrice: 33149, maxPrice: 48749, groupDiscounts },
    ],
  },
  {
    slug: 'agra-jaipur-package', name: 'Agra & Jaipur', tagline: 'Heritage Trail',
    title: 'Heritage Trail: Agra & Jaipur!',
    description: "Explore India's Golden Triangle — Taj Mahal, pink city Jaipur, and Mughal heritage.",
    heroImg: '/assets/img/Ajwa/Rajasthan-ajwaCard.jpg',
    gallery: ['/assets/img/Ajwa/Agra/agra1.webp', '/assets/img/Ajwa/Agra/agra2.webp', '/assets/img/Ajwa/Agra/agra3.webp', '/assets/img/Ajwa/Agra/agra4.webp', '/assets/img/Ajwa/Agra/agra5.webp'],
    highlights: ['Taj Mahal Sunrise', 'Amber Fort', 'Hawa Mahal', 'Agra Fort', 'Jaipur City Palace'],
    included: ['Hotel accommodation', 'Airport transfers', 'Sightseeing', 'Daily breakfast'],
    excluded: ['Flight tickets', 'Personal expenses'],
    faqs: [{ q: 'How do I book?', a: 'Contact us via WhatsApp, call, or email.' }],
    snapshots: ['/assets/img/Ajwa/Gallery/5.jpg', '/assets/img/Ajwa/Gallery/15.jpg', '/assets/img/Ajwa/Gallery/25.jpg', '/assets/img/Ajwa/Gallery/35.jpg', '/assets/img/Ajwa/Gallery/45.jpg', '/assets/img/Ajwa/Gallery/51.jpg'],
    variants: [
      { durationDays: 3, durationNights: 2, withFlight: false, hotelStar: 3, basePrice: 8999, minPrice: 7649, maxPrice: 11249, groupDiscounts },
      { durationDays: 3, durationNights: 2, withFlight: true, hotelStar: 3, basePrice: 15999, minPrice: 13599, maxPrice: 19999, groupDiscounts },
      { durationDays: 4, durationNights: 3, withFlight: false, hotelStar: 3, basePrice: 11999, minPrice: 10199, maxPrice: 14999, groupDiscounts },
      { durationDays: 4, durationNights: 3, withFlight: true, hotelStar: 3, basePrice: 18999, minPrice: 16149, maxPrice: 23749, groupDiscounts },
    ],
  },
];

// ═══════════════════════════════════════════════
// SEED FUNCTION
// ═══════════════════════════════════════════════
async function seed() {
  try {
    console.log('\n🌱 Seeding FlyAjwa database...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // 1. Create Super Admin
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@flyajwa.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'FlyAjwa@Admin2026!';

    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      admin = await User.create({
        email: adminEmail,
        password: adminPassword, // pre-save hook hashes this
        name: 'FlyAjwa Admin',
        phone: '+919846617000',
        role: 'SUPER_ADMIN',
      });
      console.log(`✅ Super Admin created: ${adminEmail}`);
    } else {
      console.log(`ℹ  Super Admin exists: ${adminEmail}`);
    }

    // 2. Create/Update Packages
    for (const [index, pkgData] of packagesData.entries()) {
      const existing = await Package.findOne({ slug: pkgData.slug });
      if (existing) {
        await Package.findOneAndUpdate({ slug: pkgData.slug }, { ...pkgData, sortOrder: index });
        console.log(`🔄 Updated: ${pkgData.name} (${pkgData.variants.length} variants)`);
      } else {
        await Package.create({ ...pkgData, sortOrder: index });
        console.log(`✅ Created: ${pkgData.name} (${pkgData.variants.length} variants)`);
      }
    }

    // 3. Create Default Settings
    const defaultSettings = [
      { key: 'contact_phones', value: ['+91 98466 17000', '+91 95266 17000'] },
      { key: 'contact_email', value: 'holidays2@ajwatravel.com' },
      { key: 'whatsapp_number', value: '919846617000' },
      { key: 'announcement', value: '' },
      { key: 'currency', value: 'INR' },
      { key: 'currency_symbol', value: '₹' },
    ];

    for (const setting of defaultSettings) {
      await Setting.findOneAndUpdate(
        { key: setting.key },
        { key: setting.key, value: setting.value },
        { upsert: true }
      );
    }
    console.log(`\n✅ ${defaultSettings.length} default settings created`);

    // Done!
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🎉 Database seeded successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  📧 Admin Email:    ${adminEmail}`);
    console.log(`  🔑 Admin Password: ${adminPassword}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seed failed:', error.message);
    process.exit(1);
  }
}

seed();
