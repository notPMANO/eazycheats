require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  isProd,
  PORT: process.env.PORT || 3000,
  SESSION_SECRET: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  // The one account that gets admin powers.
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'phoenix@edis.org').toLowerCase(),
  SITE_NAME: 'EazyCheats',
  TAGLINE: 'We make you better at games',

  // Public base URL — used to build verification links in emails.
  // e.g. https://eazycheats.com  (falls back to the request host if unset)
  APP_URL: process.env.APP_URL || '',

  // Where the database + uploads live. On a host with a mounted disk,
  // point DATA_DIR at that disk so data survives restarts/redeploys.
  DATA_DIR: process.env.DATA_DIR || '',

  // Require clicking an emailed link before an account is "verified".
  REQUIRE_EMAIL_VERIFICATION: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',

  // Outgoing email (SMTP). For Resend: host smtp.resend.com, port 465,
  // user "resend", pass = your Resend API key.
  SMTP: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  MAIL_FROM: process.env.MAIL_FROM || 'EazyCheats <no-reply@eazycheats.com>',
};
