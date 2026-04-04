require('dotenv').config();
const mongoose = require('mongoose');
const Testimonial = require('./models/Testimonial');
const connectDB = require('./config/db');

const reviewsData = [
  { name: 'HASHIJ M', text: 'Had an amazing experience on our 5 day, 4 night Delhi - Manali trip with Ajwa Travels and Holidays. They guided us through every detail while planning the trip, even though we approached them at the last minute. We had a great time...' },
  { name: 'Nijaz PP', text: 'We recently had a trip to Maldives.it was our dream destination for our Honeymoon.we made our dream through Ajwa holidays as of 3 days and 4 night trip.The service from there side is appreatable.The team was very responsible throughout our...' },
  { name: 'Nandu Nair', text: 'Me and my friends took a Munnar & Allepey trip arranged by Ajwa Travels & Holidays. We really had a very good time throughout the trip. The tpur driver was very friendly and took us to all good places. The resort at Munnar and Houseboat at Allepey was beautiful and we all loved it. We all recommend Ajwa Travels.' },
  { name: 'GM Mutuall Serv', text: 'We had wonderful and unforgettable experience with the Lakshadweep tour package. Everything was perfectly organised, and the entire trip was smooth and hassle free.' },
  { name: 'Daniel', text: 'We recently had a private tour package with Ajwa Tours to Thailand, and their service was truly exceptional. During the trip, my daughter fell ill, and their team responded promptly — arranging necessary medical support and standing by us...' },
  { name: 'Malik Nassar M C', text: 'We had an amazing honeymoon trip to the Maldives with Ajwa Holidays (3 days, 4 nights). Everything was perfectly arranged, from service to food and excursions.' },
  { name: 'abdul haseeb', text: 'I share my experience with Ajwa Travels. I am happy to choose this agency for my honeymoon destination in the Maldives. Ashik Sir and Heera Mam are taking care of this trip and planned it very well. I enjoyed it very well.' },
  { name: 'Mohammed Adeeb S', text: 'We had planned for our dream honeymoon to Maldives through Ajwa holidays. As the trip was planned immediately after our wedding ,we needed a perfect getaway from all the wedding stress and Ajwa exactly did that.' },
  { name: 'shafla nabeel Cheppu', text: 'I strongley recommend Ajwa travels for your enjoyment trip. Firstly Thanks to Nabeel (owner of Ajwa trals) and sreena (coordinator ). Our trip was in ramakalmedu it was a wonder ful experience.' },
  { name: 'Joseph Jose', text: 'Our group of six (three couples) enjoyed a fantastic 7-day, 6-night trip to Thailand, visiting Pattaya, Bangkok, Krabi, Phuket, and Phi Phi. The trip was wonderfully organized by Ajwa, with exceptional support from Najiha and Ashiq.' },
  { name: 'Sujith Edapal', text: 'Hi Ajwa Travels, I recently used your services for my Goa trip and wanted to share my feedback. I had a great experience overall! The service was excellent, and I\'d definitely recommend you to others. Special thanks to Sreena and Nabeel for making everything smooth. Thanks again, Ajwa Travels!' },
  { name: 'Safar Mohd', text: 'My trip to Lakshadweep, organized by Ajwa Travels Edapal, was truly unforgettable! The stunning islands and well-planned itinerary exceeded my expectations. The team ensured smooth travel, comfortable stays, and hassle-free arrangements.' },
  { name: 'GOKUL P KUMAR', text: 'I recently took a tour package to Lakshadweep with Ajwa Holidays, and it was an amazing experience for my family and me. From the moment we booked, the service was impeccable. The team at Ajwa Holidays ensured that every detail of our trip...' },
  { name: 'Niranjana A', text: 'We enjoyed our honeymoon in Malaysia. The trip was fully organized by Ajwa Travels and holidays. Everything was well organized, from the hotel booking to the sightseeing tours. The team was very responsive and ensured we were comfortable throughout the journey. Special thanks for making our trip so memorable.' },
  { name: 'Hari Krishnan M', text: 'As always Heera from Ajwa travels is always the best . No need to worry on any transit or ticket bookings . Always helpful' },
  { name: 'Shahzad Chechu', text: 'We wholeheartedly recommend Ajwa Holidays for anyone looking to experience the Maldives. Their attention to detail and commitment to customer satisfaction are unparalleled. A special thank you to Najma for making our dream vacation a reality!' },
  { name: 'Aneesh Rudraveena', text: 'It\'s fantastic trip ever I seen, thank you ajwa travels' },
  { name: 'Nihas Ali', text: 'We had an incredible experience with Ajwa Holidays. We booked a 4N tour of Maldives, and everything was perfectly organized, from airport transfers to hotel accommodations. I highly recommend Ajwa Holidays for a hassle-free and unforgettable trip!' },
  { name: 'Harold Rosario', text: 'The trip was very well coodinated by Ajwa Holidays, thanks alot team for the entire package. Even though it was last minute everything was very well handled by Devika and Ashik. They were available for any support throughout the Journey, surely looking forward on flying more with you.' },
  { name: 'Arjun Das', text: 'Outstanding experience with the Ajwa! From the cultural wonders of Delhi and Agra to beautiful landscapes of Manali, every detail of our family trip was meticulously planned. The seamless execution,...' },
  { name: 'Fathima Shahna', text: 'Ajwa has been so far the best tour agency i have travelled so far. They provided me with best customised plan for my Himalayan trip. They were available for all my queries and charged comparatively lesser amount. In total, had a very hassle experience.' },
  { name: 'sheji rasiq', text: 'I had a wonderful experience with the company. The representative jinsiya was a wonderful person and helped us with all our requirements and requests. I would most definetly advice you to pick this travel agency for your trips, the staff are wonderful and a pleasure to work with.' },
  { name: 'Uthara Prasad', text: 'My recent tour to Kashmir with AJWA HOLIDAYS was an unforgettable exploration of one of India\'s most mesmerizing destinations. From the moment I booked my trip until the final day, every aspect of the journey was expertly handled...' },
  { name: 'anwarsadath udinoor', text: 'The tour agency provided an unforgettable experience from start to finish. Their attention to detail, knowledgeable guides, and seamless organisation made our trip truly exceptional. I highly recommend them to anyone looking for a memorable adventure.' },
  { name: 'Suni Anvar', text: 'Tour coordinators went above and beyond to ensure our trip was flawless. Their excellent communication, personalized attention, and expertise in planning made our journey stress-free and enjoyable. I can\'t thank them enough for making our vacation truly unforgettable.' }
];

// Clean emojis utilizing regex
const removeEmojis = (str) => {
  return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}\u{FE0F}]/gu, '').trim();
};

const seedPastedReviews = async () => {
  await connectDB();

  try {
    const formattedReviews = reviewsData.map((r, i) => ({
      name: r.name,
      rating: 5, // All highly detailed ones get 5 stars explicitly as requested
      text: removeEmojis(r.text).replace('...', '.'),
      source: 'google',
      status: 'APPROVED',
      avatarUrl: '',
      googleReviewId: `google-pasted-${i}-${Date.now()}`,
    }));

    await Testimonial.insertMany(formattedReviews);
    console.log(`✅ Successfully seeded ${formattedReviews.length} detailed 5-star Google Reviews!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding reviews:', error.message);
    process.exit(1);
  }
};

seedPastedReviews();
