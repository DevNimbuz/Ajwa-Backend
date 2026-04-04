/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa Backend — Email Notification Service
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Sends formatted HTML email alerts for new leads
 * Falls back to console logging if SMTP is not configured
 */

const nodemailer = require('nodemailer');

let transporter = null;

/**
 * Gets or creates the SMTP transporter
 */
function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    console.log('[Email] SMTP not configured — notifications logged to console');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587'),
    secure: parseInt(SMTP_PORT || '587') === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });

  return transporter;
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
        <h2 style="margin:0;font-size:20px;">🔔 New Lead — FlyAjwa</h2>
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
      subject: `🔔 New Lead: ${lead.name} — ${lead.destination || 'FlyAjwa'}`,
      html,
    });
    console.log(`[Email] Notification sent to ${to}`);
    return { success: true, method: 'email' };
  } catch (error) {
    console.error('[Email] Failed:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendLeadNotification };
