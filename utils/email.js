const axios = require('axios');

/**
 * Sends an email using Brevo (formerly Sendinblue) API
 * This bypasses SMTP port blocking on cloud providers like Render.
 */
async function sendEmailViaBrevo(payload) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  
  if (!BREVO_API_KEY) {
    // Only log dummy emails in non-production environments if needed
    return { success: true, method: 'console' };
  }

  try {
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { 
        name: 'Flyajwa', 
        email: process.env.SMTP_FROM || 'no-reply@flyajwa.com' 
      },
      ...payload
    }, {
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    // Log success only if needed for audit trails
    return { success: true, method: 'api' };
  } catch (error) {
    console.error('[Email] Brevo API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Sends a new lead notification email to the admin
 */
async function sendLeadNotification(lead) {
  const to = process.env.NOTIFICATION_EMAIL || process.env.SMTP_USER || 'admin@flyajwa.com';

  const html = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background-color:#f8fafc;padding:20px;">
      <div style="background-color:#1e2a4a;color:#ffffff;padding:32px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">New Lead Received</h1>
        <p style="margin:8px 0 0;opacity:0.8;font-size:14px;">A new traveler is interested in Flyajwa</p>
      </div>
      <div style="background-color:#ffffff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px;width:120px;">Name</td>
            <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#1e293b;font-weight:600;">${lead.name || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px;">Phone</td>
            <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#63ab45;font-weight:600;">${lead.phone || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px;">Email</td>
            <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#1e293b;">${lead.email || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px;">Destination</td>
            <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;"><span style="background-color:#ecfdf5;color:#059669;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;">${lead.destination || 'Inquiry'}</span></td>
          </tr>
        </table>
        <div style="margin-top:24px;padding:16px;background-color:#f8fafc;border-radius:8px;color:#475569;font-size:14px;line-height:1.6;">
          <strong style="display:block;margin-bottom:4px;color:#1e2a4a;font-size:12px;text-transform:uppercase;">Message:</strong>
          ${lead.message || 'No message provided.'}
        </div>
        <div style="margin-top:32px;text-align:center;">
          <a href="https://flyajwa.com/admin" style="background-color:#63ab45;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">View in Dashboard</a>
        </div>
      </div>
      <div style="text-align:center;margin-top:20px;color:#94a3b8;font-size:12px;">
        © ${new Date().getFullYear()} Flyajwa Travel. All rights reserved.
      </div>
    </div>`;

  return sendEmailViaBrevo({
    to: [{ email: to }],
    subject: `🔔 New Lead: ${lead.name} — Flyajwa`,
    htmlContent: html
  });
}

/**
 * Sends OTP verification email
 */
async function sendOTPEmail({ email, name, otp, type }) {
  const html = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:500px;margin:0 auto;background-color:#f8fafc;padding:20px;">
      <div style="background-color:#1e2a4a;color:#ffffff;padding:40px 20px;border-radius:16px 16px 0 0;text-align:center;">
        <div style="background-color:rgba(255,255,255,0.1);width:60px;height:60px;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:30px;">✈️</div>
        <h1 style="margin:0;font-size:24px;font-weight:700;">Verify Your Email</h1>
        <p style="margin:10px 0 0;opacity:0.8;font-size:15px;">Welcome to Flyajwa, ${name}!</p>
      </div>
      <div style="background-color:#ffffff;padding:40px 30px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;text-align:center;">
        <p style="color:#475569;font-size:16px;margin:0 0 25px;">Please use the following code to complete your verification:</p>
        <div style="background-color:#f1f5f9;border-radius:12px;padding:25px;margin-bottom:25px;border:1px dashed #cbd5e1;">
          <span style="font-family:monospace;font-size:38px;font-weight:800;color:#1e2a4a;letter-spacing:10px;">${otp}</span>
        </div>
        <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.5;"> This code expires in <strong style="color:#e11d48;">10 minutes</strong>.<br>If you didn't request this, you can safely ignore this email.</p>
      </div>
      <div style="text-align:center;margin-top:20px;color:#94a3b8;font-size:12px;">
        Sent by Flyajwa Security Team
      </div>
    </div>`;

  return sendEmailViaBrevo({
    to: [{ email }],
    subject: `🔐 Flyajwa Verification Code: ${otp}`,
    htmlContent: html
  });
}

/**
 * Sends Password Reset email
 */
async function sendPasswordResetEmail({ email, name, resetUrl }) {
  const html = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:500px;margin:0 auto;background-color:#f8fafc;padding:20px;">
      <div style="background-color:#1e2a4a;color:#ffffff;padding:40px 20px;border-radius:16px 16px 0 0;text-align:center;">
        <div style="background-color:rgba(255,255,255,0.1);width:60px;height:60px;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:30px;">🔑</div>
        <h1 style="margin:0;font-size:24px;font-weight:700;">Reset Password</h1>
      </div>
      <div style="background-color:#ffffff;padding:40px 30px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;text-align:center;">
        <p style="color:#475569;font-size:16px;margin:0 0 25px;">Hello ${name}, click the button below to reset your Flyajwa account password:</p>
        <a href="${resetUrl}" style="background-color:#63ab45;color:#ffffff;padding:16px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;box-shadow:0 4px 6px rgba(99,171,69,0.2);">Reset My Password</a>
        <p style="color:#94a3b8;font-size:13px;margin:25px 0 0;line-height:1.5;">This link will expire in 1 hour. If you didn't request this, your password will remain unchanged.</p>
      </div>
    </div>`;

  return sendEmailViaBrevo({
    to: [{ email }],
    subject: `🔐 Flyajwa Password Reset`,
    htmlContent: html
  });
}

module.exports = { 
  sendLeadNotification, 
  sendOTPEmail, 
  sendPasswordResetEmail 
};
