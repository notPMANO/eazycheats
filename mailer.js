// Email sending. Uses SMTP (Resend, SendGrid, Gmail, etc.) when configured.
// If SMTP isn't set up, it runs in "dev mode": nothing is sent, and the
// verification link is returned so the app can show it on screen instead.
const nodemailer = require('nodemailer');
const config = require('./config');

const configured = !!(config.SMTP.host && config.SMTP.user && config.SMTP.pass);

let transporter = null;
if (configured) {
  transporter = nodemailer.createTransport({
    host: config.SMTP.host,
    port: config.SMTP.port,
    secure: config.SMTP.port === 465, // 465 = TLS
    auth: { user: config.SMTP.user, pass: config.SMTP.pass },
  });
}

const isConfigured = () => configured;

function verifyEmailHtml(link) {
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;background:#161628;color:#eef0ff;border-radius:14px;overflow:hidden;border:1px solid #2a2a45">
    <div style="background:linear-gradient(135deg,#7c5cff,#22d3ee);padding:22px 28px;color:#0a0a12;font-weight:800;font-size:20px">EazyCheats</div>
    <div style="padding:28px">
      <h1 style="font-size:22px;margin:0 0 12px">Confirm your email</h1>
      <p style="color:#9aa0c0;margin:0 0 22px">Click the button below to verify your email address and finish setting up your account.</p>
      <a href="${link}" style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700">Verify my email</a>
      <p style="color:#9aa0c0;font-size:13px;margin:22px 0 0">Or paste this link into your browser:<br><a href="${link}" style="color:#22d3ee;word-break:break-all">${link}</a></p>
    </div>
  </div>`;
}

// Sends a verification email. Returns { sent: boolean, link } so callers can
// fall back to showing the link on screen in dev mode.
async function sendVerification(to, link) {
  if (!configured) return { sent: false, link };
  await transporter.sendMail({
    from: config.MAIL_FROM,
    to,
    subject: 'Verify your EazyCheats email',
    html: verifyEmailHtml(link),
    text: `Verify your EazyCheats email: ${link}`,
  });
  return { sent: true, link };
}

module.exports = { isConfigured, sendVerification };
