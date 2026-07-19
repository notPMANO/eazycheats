# EazyCheats

**We make you better at games.** A store/guide site for game products, built as a self-contained Node.js app.

## What's inside
- Landing page with hero + scrollable **Games** grid (square game buttons showing `Products: N`)
- Accounts: sign up / log in (passwords hashed with bcrypt)
- **Admin panel** locked to one email (`phoenix@edis.org`): add games with a drag-and-drop logo, add products under games, each product gets its own guide page, edit/delete anything
- Email verification is scaffolded but **off** until email sending is set up (see below)

## Run it locally
```bash
npm install      # first time only
npm start        # then open http://localhost:3000
```
Dev mode with auto-reload: `npm run dev`

## Become the admin
Sign up with the email in `.env` → `ADMIN_EMAIL` (default `phoenix@edis.org`).
That account automatically gets the **Admin Panel**. Everyone else is a normal user.

## Tech
- **Node + Express** — web server
- **node:sqlite** — built-in SQLite database (no native build needed). Data lives in `data/eazycheats.db`.
- **EJS** — HTML templates in `views/`
- **multer** — image uploads, saved to `public/uploads/`
- **bcryptjs** — password hashing

## Project layout
```
server.js            all routes + auth + admin logic
db.js                database schema
config.js / .env     settings (admin email, port, secret)
seed.js              inserts the starter Roblox game
views/               EJS templates (pages + admin/)
public/css/          styles
public/js/           dropzone + small UI helpers
public/img/          logos
public/uploads/      uploaded game/product images (gitignored)
data/                the SQLite database (gitignored)
```

## Turning on email verification (later)
1. Pick an email service (SendGrid, Mailgun, or Gmail SMTP).
2. Add a mail-sending function and call it where `verify-sent` is rendered in `server.js`.
3. Set `REQUIRE_EMAIL_VERIFICATION=true` in `.env`.
The verification token + `/verify` route already exist.

## Deploying (your domain is on GoDaddy)
GoDaddy shared/cPanel hosting can't run Node. Two good paths:
- **Easiest:** deploy to **Render** or **Railway** (free tier), then point `eazycheats.com`'s DNS at it in GoDaddy.
- **Full control:** a GoDaddy/other **VPS**, run `npm start` behind a reverse proxy (nginx/Caddy).

Before going live: set a long random `SESSION_SECRET` in `.env`.

## Not built yet (on purpose)
- Payments / checkout (structure-first for now)
- Real email delivery (stubbed)
- Persistent login sessions across restarts (uses in-memory sessions; fine for dev)
