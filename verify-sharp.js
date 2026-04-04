const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

async function verifyImageOptimization() {
  const API_URL = 'http://localhost:5000/api';
  console.log('--- Testing Sharp Image Optimization ---');

  try {
    // 1. Login to get token
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@flyajwa.com',
      password: 'FlyAjwa@Admin2026!'
    });
    const token = loginRes.data.token;

    // 2. Prepare a mock image
    const form = new FormData();
    // Create a 1x1 red PNG pixel
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    form.append('images', pixel, 'test-pixel.png');
    form.append('alt', 'Test Optimization');

    // 3. Upload
    console.log('Uploading mock image...');
    const uploadRes = await axios.post(`${API_URL}/gallery`, form, {
      headers: { 
        ...form.getHeaders(),
        'Authorization': `Bearer ${token}`,
        'Cookie': `token=${token}` // Both for safety
      }
    });

    const uploadedUrl = uploadRes.data.data[0].url;
    console.log('✅ Upload Success. URL:', uploadedUrl);

    if (uploadedUrl.endsWith('.webp')) {
      console.log('✅ Success: Image automatically converted to WebP.');
    } else {
      console.error('❌ Failure: Image extension is NOT .webp');
    }

  } catch (err) {
    console.error('❌ Image Optimization Test Failed:', err.response?.data || err.message);
  }
}

verifyImageOptimization();
