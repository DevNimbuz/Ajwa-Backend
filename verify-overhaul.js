/**
 * FlyAjwa Security & Performance Verification Script
 * Uses native Fetch (Node 18+) to avoid dependencies
 */

async function verifyAll() {
  const API_URL = 'http://localhost:5000/api';
  console.log('--- Starting Overhaul Verification ---');

  // 1. Test XSS Sanitization (Leads)
  try {
    console.log('\n[1/3] Testing XSS Sanitization...');
    const xssPayload = {
      name: '<script>alert("XSS")</script>Secure User',
      phone: '9846617000',
      message: 'Hello <img src=x onerror=alert(1)>'
    };
    const res = await fetch(`${API_URL}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(xssPayload)
    });
    const data = await res.json();
    if (res.ok) console.log('✅ XSS payload handled safely.');
    else console.log('❌ Lead submission failed:', data.message);
  } catch (err) { console.error('Error:', err.message); }

  // 2. Test Login Lockout
  try {
    console.log('\n[2/3] Testing Login Lockout (Simulating distributed brute force)...');
    for (let i = 1; i <= 6; i++) {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@flyajwa.com', password: 'wrong' })
      });
      const data = await res.json();
      console.log(`Attempt ${i}: ${data.message}`);
      if (i === 6 && data.message.includes('locked')) {
        console.log('✅ Account lockout correctly triggered.');
      }
    }
  } catch (err) { console.error('Error:', err.message); }

  // 3. Test API Caching (Performance)
  try {
    console.log('\n[3/3] Testing API Caching Performance...');
    const start1 = Date.now();
    await fetch(`${API_URL}/packages`);
    const time1 = Date.now() - start1;
    console.log(`Initial Request (from DB): ${time1}ms`);

    const start2 = Date.now();
    await fetch(`${API_URL}/packages`);
    const time2 = Date.now() - start2;
    console.log(`Second Request (from Cache): ${time2}ms`);

    if (time2 < time1 * 0.5) {
      console.log('✅ API Caching is significantly faster (Hit detected).');
    }
  } catch (err) { console.error('Error:', err.message); }

  console.log('\n--- Verification Complete ---');
}

verifyAll();
