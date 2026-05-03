/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Flyajwa Backend — Email Notification Service
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Sends formatted HTML email alerts for new leads
 * Falls back to console logging if SMTP is not configured
 * --------------------------------------------------------------------------
 */

const nodemailer = require('nodemailer');

let transporter = null;

/**
 * Gets or creates the SMTP transporter
 */
function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;

  // Check if variables are missing or empty strings
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    console.warn('[Email] SMTP Configuration Missing:', {
      host: !!SMTP_HOST,
      user: !!SMTP_USER,
      pass: !!SMTP_PASSWORD
    });
    console.log('[Email] Falling back to console logging');
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST.trim(),
      port: parseInt(SMTP_PORT || '587'),
      secure: parseInt(SMTP_PORT || '587') === 465,
      auth: { user: SMTP_USER.trim(), pass: SMTP_PASSWORD.trim() },
      tls: {
        // Do not fail on invalid certs (common with some shared hosts)
        rejectUnauthorized: false
      }
    });
    return transporter;
  } catch (error) {
    console.error('[Email] Transporter creation failed:', error.message);
    return null;
  }
}

/**
 * Sends a new lead notification email to the admin
 * @param {Object} lead - Lead data (name, phone, email, destination, message, source)
 */
async function sendLeadNotification(lead) {
  const transport = getTransporter();
  const to = process.env.NOTIFICATION_EMAIL || process.env.SMTP_USER;

  const html = `
    <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#1e2a4a,#2a3f5f);color:#fff;padding:24px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;font-size:20px;">🔔 New Lead — Flyajwa</h2>
        <p style="margin:8px 0 0;opacity:0.8;font-size:14px;">
          ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
        </p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#64748b;width:120px;">Name</td><td style="font-weight:600;">${lead.name || 'N/A'}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Phone</td><td style="font-weight:600;"><a href="tel:${lead.phone}" style="color:#2563eb;">${lead.phone || 'N/A'}</a></td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Email</td><td>${lead.email || 'N/A'}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Destination</td><td><span style="background:#ecfdf5;color:#059669;padding:2px 8px;border-radius:4px;">${lead.destination || 'Not specified'}</span></td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Source</td><td style="text-transform:capitalize;">${lead.source || 'website'}</td></tr>
          ${lead.serviceType ? `<tr><td style="padding:8px 0;color:#64748b;">Service Type</td><td style="font-weight:600;color:#63ab45;">${lead.serviceType}</td></tr>` : ''}
          ${lead.serviceDetails && (lead.serviceDetails.size > 0 || Object.keys(lead.serviceDetails).length > 0) 
              ? (typeof lead.serviceDetails.entries === 'function' ? Array.from(lead.serviceDetails.entries()) : Object.entries(lead.serviceDetails))
                  .map(([k, v]) => `<tr><td style="padding:8px 0;color:#64748b;">${k}</td><td style="font-weight:600;">${v}</td></tr>`).join('') 
              : ''}
          ${lead.message ? `<tr><td colspan="2" style="padding:12px 0 0;"><div style="background:#f8fafc;border-radius:8px;padding:12px;font-size:14px;color:#334155;"><strong style="display:block;margin-bottom:4px;color:#64748b;font-size:12px;">Message:</strong>${lead.message}</div></td></tr>` : ''}
        </table>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/leads" style="display:inline-block;background:#63ab45;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View in Admin →</a>
        </div>
      </div>
    </div>`;

  if (!transport) {
    console.log(`[Email] New lead: ${lead.name} — ${lead.phone} — ${lead.destination || 'N/A'}`);
    return { success: true, method: 'console' };
  }

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `🔔 New Lead: ${lead.name} — ${lead.destination || 'Flyajwa'}`,
      html,
    });
    console.log(`[Email] Notification sent to ${to}`);
    return { success: true, method: 'email' };
  } catch (error) {
    console.error('[Email] SMTP Send Error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      command: error.command
    });
    return { success: false, error: error.message };
  }
}

/**
 * Sends OTP verification email
 * @param {Object} data - { email, name, otp, type }
 */
async function sendOTPEmail({ email, name, otp, type }) {
  const transport = getTransporter();
  
  const html = `
    <div style="font-family:'Segoe UI',sans-serif;max-width:500px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#1e2a4a,#2a3f5f);color:#fff;padding:32px;border-radius:16px 16px 0 0;text-align:center;">
        <div style="width:60px;height:60px;margin:0 auto 16px;background:rgba(99,171,69,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;">
          ✈️
        </div>
        <h2 style="margin:0;font-size:22px;">Verify Your Email</h2>
        <p style="margin:8px 0 0;opacity:0.8;font-size:14px;">Welcome to Flyajwa, ${name}!</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:32px;border-radius:0 0 16px 16px;text-align:center;">
        <p style="color:#334155;font-size:15px;margin:0 0 24px;">Enter this code to verify your email address:</p>
        <div style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border-radius:12px;padding:20px;margin-bottom:24px;">
          <span style="font-family:'SF Mono',Monaco,'Courier New',monospace;font-size:36px;font-weight:800;color:#1e293b;letter-spacing:8px;">${otp}</span>
        </div>
        <p style="color:#94a3b8;font-size:12px;margin:0;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
      </div>
    </div>`;

  if (!transport) {
    console.log(`[Email] OTP for ${email} (${type}): ${otp}`);
    return { success: true, method: 'console' };
  }

  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await transport.sendMail({
      from,
      to: email,
      subject: `🔐 Flyajwa Email Verification Code: ${otp}`,
      html,
    });
    console.log(`[Email] OTP sent to ${email} (via ${from})`);
    return { success: true, method: 'email' };
  } catch (error) {
    console.error('[Email] OTP Send Error:', {
      to: email,
      error: error.message,
      code: error.code
    });
    return { success: false, error: error.message };
  }
}


/**
 * Sends Password Reset email
 * @param {Object} data - { email, name, resetUrl }
 */
async function sendPasswordResetEmail({ email, name, resetUrl }) {
  const transport = getTransporter();
  
  const html = `
    <div style="font-family:'Segoe UI',sans-serif;max-width:500px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#1e2a4a,#2a3f5f);color:#fff;padding:32px;border-radius:16px 16px 0 0;text-align:center;">
        <h2 style="margin:0;font-size:22px;">Reset Your Password</h2>
        <p style="margin:8px 0 0;opacity:0.8;font-size:14px;">Flyajwa Travel Account Recovery</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:32px;border-radius:0 0 16px 16px;text-align:center;">
        <p style="color:#334155;font-size:15px;margin:0 0 24px;">Hello ${name}, you requested to reset your password. Click the button below to choose a new one:</p>
        <a href="${resetUrl}" style="display:inline-block;background:#63ab45;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">Reset Password →</a>
        <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">This link will expire in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid #f1f5f9;font-size:11px;color:#cbd5e1;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${resetUrl}" style="color:#2563eb;word-break:break-all;">${resetUrl}</a>
        </div>
      </div>
    </div>`;

  if (!transport) {
    console.log(`[Email] Password Reset Link for ${email}: ${resetUrl}`);
    return { success: true, method: 'console' };
  }

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: `🔐 Flyajwa Password Reset Request`,
      html,
    });
    console.log(`[Email] Reset link sent to ${email}`);
    return { success: true, method: 'email' };
  } catch (error) {
    console.error('[Email] Reset failed:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendLeadNotification, sendOTPEmail, sendPasswordResetEmail };
