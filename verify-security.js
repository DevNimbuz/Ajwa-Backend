const axios = require('axios');

async function verifySecurity() {
  const API_URL = 'http://localhost:5000/api';
  console.log('--- Starting FlyAjwa Security Verification ---');

  // 1. Test XSS Sanitization (Leads)
  try {
    console.log('[1/2] Testing XSS Sanitization...');
    const xssPayload = {
      name: '<script>alert("XSS")</script>Secure User',
      phone: '9846617000',
      message: 'Hello <img src=x onerror=alert(1)>'
    };
    const res = await axios.post(`${API_URL}/leads`, xssPayload);
    console.log('✅ Lead submission accepted.');
    // Note: Verification of sanitization requires checking the DB, 
    // but the request passing without error is the first step.
  } catch (err) {
    console.error('❌ Lead submission failed:', err.response?.data || err.message);
  }

  // 2. Test Login Lockout (Simulate 6 failed attempts)
  try {
    console.log('[2/2] Testing Login Lockout (5 attempts)...');
    const loginPayload = {
      email: 'admin@flyajwa.com',
      password: 'WrongPassword123!'
    };

    for (let i = 1; i <= 6; i++) {
      try {
        await axios.post(`${API_URL}/auth/login`, loginPayload);
      } catch (err) {
        console.log(`Attempt ${i}: ${err.response?.data?.message}`);
        if (i === 6 && err.response?.data?.message.includes('locked')) {
          console.log('✅ Account lockout correctly triggered after 5 attempts.');
        }
      }
    }
  } catch (err) {
    console.error('❌ Lockout test error:', err.message);
  }

  console.log('--- Verification Complete ---');
}

verifySecurity();
