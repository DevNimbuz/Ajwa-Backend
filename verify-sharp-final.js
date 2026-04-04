/**
 * FlyAjwa Image Engine Verification Script
 * Uses native Fetch and FormData (Node 18+)
 */

async function verifyImageOptimization() {
  const API_URL = 'http://localhost:5000/api';
  console.log('--- Testing Sharp Image Optimization (Zero Dependency) ---');

  try {
    // 1. Login to get token
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@flyajwa.com',
        password: 'FlyAjwa@Admin2026!'
      })
    });
    const loginData = await loginRes.json();
    if (!loginData.success) throw new Error('Login failed: ' + loginData.message);
    const token = loginData.token;

    // 2. Prepare a mock image
    const formData = new FormData();
    // 1x1 Red PNG Pixel
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const blob = new Blob([pixel], { type: 'image/png' });
    formData.append('images', blob, 'test-pixel.png');
    formData.append('alt', 'Test Optimization');

    // 3. Upload
    console.log('Uploading mock image...');
    const uploadRes = await fetch(`${API_URL}/gallery`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const uploadData = await uploadRes.json();
    if (!uploadData.success) throw new Error('Upload failed: ' + uploadData.message);

    const uploadedUrl = uploadData.data[0].url;
    console.log('✅ Upload Success. URL:', uploadedUrl);

    if (uploadedUrl.endsWith('.webp')) {
      console.log('✅ Success: Image automatically converted to WebP by Sharp engine.');
    } else {
      console.error('❌ Failure: Image extension is NOT .webp');
    }

  } catch (err) {
    console.error('❌ Image Optimization Test Failed:', err.message);
  }

  process.exit();
}

verifyImageOptimization();
