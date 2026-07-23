const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const db = require('./db');
const config = require('./config');
const mailer = require('./mailer');
const SqliteStore = require('./session-store')(session);

const BCRYPT_COST = 12;

// --- Refuse to boot with insecure config in production ---
if (config.isProd) {
  if (!process.env.SESSION_SECRET || config.SESSION_SECRET === 'change-this-secret-in-production') {
    console.error('FATAL: SESSION_SECRET must be set to a strong random value in production.');
    process.exit(1);
  }
  if (!config.APP_URL) {
    console.error('FATAL: APP_URL must be set in production (used for CSRF origin checks and email links).');
    process.exit(1);
  }
}

const app = express();
// Trust the hosting proxy (Render/Railway/nginx) so secure cookies + protocol work.
app.set('trust proxy', 1);

// ---------- View engine ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- Uploads ----------
// Store uploads under DATA_DIR when set (persistent disk in production).
const UPLOAD_DIR = config.DATA_DIR
  ? path.join(config.DATA_DIR, 'uploads')
  : path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Only these image types are allowed; the stored extension is derived from this
// map (never from the client-supplied filename) so a spoofed Content-Type can't
// get an executable .html/.js/.svg written into the served uploads folder.
// SVG is intentionally excluded (it can carry embedded scripts).
const ALLOWED_IMAGE_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_IMAGE_EXT[file.mimetype] || '.bin';
    cb(null, crypto.randomBytes(10).toString('hex') + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = !!ALLOWED_IMAGE_EXT[file.mimetype];
    cb(ok ? null : new Error('Only PNG, JPG, GIF or WEBP images are allowed'), ok);
  },
});

// ---------- Security headers (helmet) ----------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Our styles/scripts are same-origin files; allow inline style attrs used in templates.
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ---------- Body + static ----------
app.use(express.urlencoded({ extended: true, limit: '4mb' })); // room for pasting large scripts
app.use(express.static(path.join(__dirname, 'public')));
// Uploads may live outside /public (on the data disk), so serve them explicitly.
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- Sessions ----------
app.use(session({
  name: 'ez.sid',
  secret: config.SESSION_SECRET,
  store: new SqliteStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',        // blocks cross-site cookie sending — core CSRF defense
    secure: config.isProd,  // HTTPS-only cookies in production
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
}));

// ---------- Rate limiting on auth endpoints ----------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

// Make current user + site info available to every template.
app.use((req, res, next) => {
  // Define pageTitle as a per-request local so views that set `<% pageTitle = ... %>`
  // write to THIS request's locals instead of leaking into the global scope.
  // (Without this, a 404 render would set a global "Not found" that then stuck as
  // the title of every page — like the homepage — that doesn't set its own.)
  res.locals.pageTitle = undefined;
  res.locals.user = null;
  if (req.session.userId) {
    const u = db.prepare('SELECT id, email, username, display_name, email_verified, pending_email FROM users WHERE id = ?')
      .get(req.session.userId);
    if (u) {
      // Admin authority is derived here, not trusted from a stored column: it's
      // the single account that holds the configured admin email. That email is
      // UNIQUE, so only the owner (who registers it) can ever be admin — no
      // email-verification gate needed, and it can't be grabbed once claimed.
      u.is_admin = (u.email === config.ADMIN_EMAIL) ? 1 : 0;
      res.locals.user = u;
    } else {
      req.session.destroy(() => {});
    }
  }
  res.locals.site = { name: config.SITE_NAME, tagline: config.TAGLINE };
  res.locals.path = req.path;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// ---------- CSRF defense (origin check on state-changing requests) ----------
// SameSite=lax already blocks cross-site form POSTs; this rejects any that slip
// through by requiring the Origin/Referer host to match one of our trusted hosts.
// Trusted hosts = our custom domain (APP_URL) + its www/apex variant + the
// platform URL (RENDER_EXTERNAL_URL), so the site works on eazycheats.com,
// www.eazycheats.com, and eazycheats.onrender.com alike.
function hostOf(u) { try { return new URL(/^https?:\/\//.test(u) ? u : 'https://' + u).host; } catch { return ''; } }
const TRUSTED_HOSTS = new Set();
function trust(h) { if (!h) return; const bare = h.replace(/^www\./, ''); TRUSTED_HOSTS.add(bare); TRUSTED_HOSTS.add('www.' + bare); }
trust(hostOf(config.APP_URL));
trust(hostOf(process.env.RENDER_EXTERNAL_URL || ''));
(process.env.EXTRA_ORIGINS || '').split(',').map((s) => s.trim()).forEach((o) => trust(hostOf(o)));

app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin') || req.get('referer');
  // Allow through when there's no usable Origin/Referer — missing, the literal
  // "null" (privacy extensions and sandboxed contexts send this), or unparseable.
  // The SameSite=lax session cookie is the real cross-site defense; this header
  // check only adds a hard block for a *real, mismatched* origin (below).
  if (!origin || origin === 'null') return next();
  let originHost;
  try { originHost = new URL(origin).host; } catch { return next(); }

  if (TRUSTED_HOSTS.size) {
    if (!TRUSTED_HOSTS.has(originHost)) return res.status(403).render('403');
    return next();
  }
  // Dev / preview (no APP_URL/RENDER URL set): accept our own host views and localhost.
  const allowed = new Set([req.headers.host, req.get('host'), req.get('x-forwarded-host')].filter(Boolean));
  if (allowed.has(originHost) || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(originHost)) return next();
  return res.status(403).render('403');
});

function flash(req, type, message) {
  req.session.flash = { type, message };
}

// ---------- Email-verification gate ----------
// A logged-in user whose email isn't verified can't use the site — every route
// shows the "verify your email" page until they click the link. Only the
// verification flow itself and logout are allowed through.
const VERIFY_ALLOWED_PATHS = new Set(['/verify', '/verify-email', '/resend-verification', '/logout']);
app.use((req, res, next) => {
  const u = res.locals.user;
  if (!u || u.email_verified) return next(); // logged out or verified → normal access
  if (VERIFY_ALLOWED_PATHS.has(req.path)) return next();
  return res.status(403).render('verify-pending', { email: u.email, resent: false });
});

// ---------- Helpers ----------
function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function uniqueGameSlug(base) {
  let slug = slugify(base), i = 2;
  while (db.prepare('SELECT 1 FROM games WHERE slug = ?').get(slug)) slug = slugify(base) + '-' + i++;
  return slug;
}
function uniqueProductSlug(base, gameId) {
  let slug = slugify(base), i = 2;
  while (db.prepare('SELECT 1 FROM products WHERE slug = ? AND game_id = ?').get(slug, gameId))
    slug = slugify(base) + '-' + i++;
  return slug;
}

function productCount(gameId) {
  return db.prepare('SELECT COUNT(*) AS n FROM products WHERE game_id = ?').get(gameId).n;
}

// Absolute base URL for building links in emails (prefers configured APP_URL).
function baseUrl(req) {
  return config.APP_URL || `${req.protocol}://${req.get('host')}`;
}

// Authoritative admin check for a raw user row (email + verified).
function isAdminUser(u) {
  return !!(u && u.email === config.ADMIN_EMAIL && u.email_verified);
}

// Log a user in with a fresh session id to prevent session fixation.
function establishSession(req, userId, done) {
  req.session.regenerate((err) => {
    if (!err) req.session.userId = userId;
    done();
  });
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameTaken(username, exceptUserId) {
  const row = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(username);
  return row && row.id !== exceptUserId;
}
function emailTaken(email, exceptUserId) {
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  return row && row.id !== exceptUserId;
}

function requireLogin(req, res, next) {
  if (!res.locals.user) { flash(req, 'error', 'Please log in first.'); return res.redirect('/login'); }
  next();
}
function requireAdmin(req, res, next) {
  if (!res.locals.user || !res.locals.user.is_admin) return res.status(403).render('403');
  next();
}

// Remove an uploaded file referenced by a public path like "/uploads/abc.png".
function deleteUpload(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return;
  const abs = path.join(UPLOAD_DIR, path.basename(publicPath));
  fs.promises.unlink(abs).catch(() => {});
}

// ---------- Scripts + keys (hosted Lua + access control) ----------
function uniqueScriptSlug(base, exceptId) {
  let slug = slugify(base), i = 2;
  for (;;) {
    const row = db.prepare('SELECT id FROM scripts WHERE slug = ?').get(slug);
    if (!row || row.id === exceptId) return slug;
    slug = slugify(base) + '-' + i++;
  }
}

function genKeyString() {
  const b = crypto.randomBytes(9).toString('hex').toUpperCase();
  return `EZ-${b.slice(0, 4)}-${b.slice(4, 8)}-${b.slice(8, 12)}-${b.slice(12, 18)}`;
}

// Fire a Discord alert (activation / leak) via a webhook, if LEAK_WEBHOOK is set.
function notifyDiscord(content) {
  const url = process.env.LEAK_WEBHOOK;
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  }).catch(() => {});
}

// Lua returned when access is denied. Begins with "--@DENY:" so the loader can
// detect a refusal, and also pops an in-game notification if run directly.
function denyLua(reason) {
  const safe = String(reason).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
  return `--@DENY:${safe}\nlocal m="${safe}"\npcall(function() game:GetService("StarterGui"):SetCore("SendNotification",{Title="EazyCheats",Text=m,Duration=8}) end)\nwarn("[EazyCheats] "..m)\n`;
}

// The Discord bot issues free keys into a JSON file (freekeys.json) rather than
// the DB. Look one up so bot-issued keys also work with the loader.
function findBotFreeKey(key) {
  try {
    const dir = config.DATA_DIR || path.join(__dirname, 'data');
    const store = JSON.parse(fs.readFileSync(path.join(dir, 'freekeys.json'), 'utf8'));
    if (!store || !Array.isArray(store.keys)) return null;
    return store.keys.find((k) => k.key === key) || null;
  } catch { return null; }
}

// All HWIDs a key has ever been used on (oldest first).
function allHwidsFor(keyId) {
  return db.prepare('SELECT hwid FROM key_hwids WHERE key_id = ? ORDER BY first_seen, id')
    .all(keyId).map((r) => r.hwid);
}

// Ping the server owner (in the bot's #key-alerts channel) that a key was used on
// a new device. Safe anytime: the bot no-ops if it isn't ready and never throws.
function alertKeyUsed(key, hwid, allHwids) {
  try { require('./discord-bot/bot').keyUsedAlert({ key, hwid, allHwids }); } catch {}
}

// Validate a key + HWID. NEVER blocks on device: it records every HWID a key is
// used on (key_hwids) and pings the owner when a 2nd+ device appears — the key
// keeps working on all of them. bind_hwid is just an opt-in flag (set via the bot)
// that adds an activation notice; to actually cut off a sharer, disable the key
// (/revoke). Returns { ok, reason }.
// Resolve a game reference (id, slug, or title) to its numeric id, or null.
function resolveGameId(val) {
  if (val == null || String(val).trim() === '') return null;
  const s = String(val).trim();
  const g = db.prepare(
    'SELECT id FROM games WHERE id = ? OR slug = ? OR lower(title) = lower(?)'
  ).get(Number(s) || -1, s, s);
  return g ? g.id : null;
}
function allGames() {
  return db.prepare('SELECT id, title, slug FROM games ORDER BY sort_order ASC, title ASC').all();
}

// Validate a key + HWID for a given game. requiredGameId is the game a hub script
// is tied to (or null/undefined if the script is open). A game-tied script only
// accepts keys tied to that same game; open scripts accept any key.
// TEMPORARY PUBLIC BYPASS — key system effectively disabled.
// The universal key "123" unlocks every protected script for anyone, with no DB
// record, HWID tracking, expiry, or per-game gate. This is the "public version":
// the loader still shows its key box, but typing 123 always works.
// To re-enable real key enforcement: delete this constant + the check below.
const PUBLIC_BYPASS_KEY = '123';

function validateKeyAuth(key, hwid, requiredGameId) {
  if (key === PUBLIC_BYPASS_KEY) return { ok: true };
  if (!key || !hwid) return { ok: false, reason: 'Missing key or HWID.' };
  let rec = db.prepare('SELECT * FROM keys WHERE key = ?').get(key);

  // Not in the DB? It may be a Discord free key — accept it and import it into the
  // key system on first use so it's tracked like any other key.
  if (!rec) {
    const fk = findBotFreeKey(key);
    if (!fk) return { ok: false, reason: 'Invalid key.' };
    if (fk.expiresAtMs && fk.expiresAtMs < Date.now()) {
      return { ok: false, reason: 'This key has expired. Get a fresh one from Discord.' };
    }
    const expiresIso = fk.expiresAtMs ? new Date(fk.expiresAtMs).toISOString() : null;
    // A free key may name its game (fk.game / fk.gameSlug); tie it on import.
    const fkGameId = resolveGameId(fk.game || fk.gameSlug || fk.game_id);
    db.prepare('INSERT OR IGNORE INTO keys (key, note, bind_hwid, expires_at, game_id) VALUES (?, ?, 0, ?, ?)')
      .run(key, 'discord free key', expiresIso, fkGameId);
    rec = db.prepare('SELECT * FROM keys WHERE key = ?').get(key);
    if (!rec) return { ok: false, reason: 'Invalid key.' };
  }
  if (rec.disabled) return { ok: false, reason: 'This key has been disabled.' };
  if (rec.expires_at && new Date(rec.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'This key has expired. Generate a new one.' };
  }

  // --- Per-game gate: a game-tied hub only accepts a key tied to the same game ---
  if (requiredGameId != null) {
    if (rec.game_id == null || Number(rec.game_id) !== Number(requiredGameId)) {
      const g = db.prepare('SELECT title FROM games WHERE id = ?').get(requiredGameId);
      return { ok: false, reason: `This key isn't valid for ${g ? g.title : 'this game'}.` };
    }
  }

  // --- HWID tracking (every key) ---
  const seenBefore = db.prepare('SELECT 1 FROM key_hwids WHERE key_id = ? AND hwid = ?').get(rec.id, hwid);
  const priorCount = db.prepare('SELECT COUNT(*) AS n FROM key_hwids WHERE key_id = ?').get(rec.id).n;
  if (!seenBefore) {
    db.prepare('INSERT OR IGNORE INTO key_hwids (key_id, hwid) VALUES (?, ?)').run(rec.id, hwid);
  }
  // A 2nd+ distinct device (not the very first the key ever ran on) pings the owner.
  if (!seenBefore && priorCount > 0) {
    alertKeyUsed(rec.key, hwid, allHwidsFor(rec.id));
  }
  db.prepare("UPDATE keys SET last_used = datetime('now') WHERE id = ?").run(rec.id);

  // Record the primary (first) device for display. A locked key also posts an
  // activation notice. Nothing is ever blocked — /revoke a key to cut off sharing.
  if (!rec.hwid) {
    db.prepare('UPDATE keys SET hwid = ? WHERE id = ?').run(hwid, rec.id);
    if (rec.bind_hwid) {
      notifyDiscord(`🔑 Key \`${rec.key}\`${rec.note ? ' (' + rec.note + ')' : ''} first used on HWID \`${hwid}\``);
    }
  }
  return { ok: true };
}

// ============================================================
//  PUBLIC ROUTES
// ============================================================
app.get('/', (req, res) => {
  const games = db.prepare('SELECT * FROM games ORDER BY sort_order ASC, id ASC').all()
    .map(g => ({ ...g, product_count: productCount(g.id) }));
  res.render('index', { games });
});

app.get('/game/:slug', (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE slug = ?').get(req.params.slug);
  if (!game) return res.status(404).render('404');
  const products = db.prepare('SELECT * FROM products WHERE game_id = ? ORDER BY id DESC').all(game.id);
  res.render('game', { game, products });
});

app.get('/game/:gameSlug/:productSlug', (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE slug = ?').get(req.params.gameSlug);
  if (!game) return res.status(404).render('404');
  const product = db.prepare('SELECT * FROM products WHERE slug = ? AND game_id = ?')
    .get(req.params.productSlug, game.id);
  if (!product) return res.status(404).render('404');
  res.render('product', { game, product });
});

// ---------- Hosted scripts (raw Lua for game:HttpGet) ----------
// GET /s/<slug>  → returns the script as raw text.
// If the script is "protected", a valid ?key=&hwid= is required; otherwise it
// returns a deny stub (still valid Lua) instead of the content.
app.get('/s/:slug', (req, res) => {
  const script = db.prepare('SELECT * FROM scripts WHERE slug = ?').get(req.params.slug);
  res.type('text/plain; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  if (!script) return res.status(404).send('-- script not found');
  if (!script.protected) return res.send(script.content);
  const check = validateKeyAuth(String(req.query.key || ''), String(req.query.hwid || ''), script.game_id);
  if (!check.ok) return res.send(denyLua(check.reason));
  // Per-buyer watermark: stamp a unique marker (hash of key+HWID) into the
  // obfuscated payload so a leaked dump traces back to who it was served to.
  let out = script.content;
  if (out.indexOf('__EZ_WM__') !== -1) {
    const wm = crypto.createHash('sha256')
      .update(String(req.query.key || '') + '|' + String(req.query.hwid || '')).digest('hex').slice(0, 16);
    out = out.split('__EZ_WM__').join(wm);
  }
  return res.send(out);
});

// ============================================================
//  BOT API — the Discord bot registers each key it generates here, so the
//  loader's key check (which reads the DB) accepts it. One source of truth.
//  Auth: shared secret in the BOT_API_SECRET env var, sent as `x-api-key`
//  (or `Authorization: Bearer <secret>`). With no secret set, the route is
//  disabled (fail closed) so it can never become an open key-minting endpoint.
// ============================================================
app.post('/api/keys', express.json(), (req, res) => {
  const secret = process.env.BOT_API_SECRET;
  if (!secret) return res.status(503).json({ ok: false, error: 'Key API not configured.' });
  const provided = req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (provided !== secret) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const body = req.body || {};
  const note = String(body.note || 'discord').trim().slice(0, 200);
  const discordId = body.discord_id ? String(body.discord_id).slice(0, 40) : null;
  // Unlocked by default (keys just ping the owner on new devices, never block).
  // Only lock when the caller explicitly passes bind_hwid:true.
  const bindHwid = (body.bind_hwid === true || body.bind_hwid === 1 || body.bind_hwid === '1') ? 1 : 0;
  // Default 4h lifetime (matches the bot's free keys); hours:0 = permanent.
  const hours = body.hours == null ? 4 : parseFloat(body.hours);
  const expires = hours > 0 ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;

  // Optional: tie the key to a game (id, slug, or title). The bot passes this so
  // each game's keys are separate. Unknown game = 400 (don't mint an unbound key).
  let gameId = null;
  if (body.game != null && String(body.game).trim() !== '') {
    gameId = resolveGameId(body.game);
    if (gameId == null) return res.status(400).json({ ok: false, error: `Unknown game "${body.game}".` });
  }

  // Use the key the bot supplies, or mint one and return it if it didn't send one.
  let key = body.key ? String(body.key).trim().slice(0, 100) : null;
  if (!key) {
    do { key = genKeyString(); } while (db.prepare('SELECT 1 FROM keys WHERE key = ?').get(key));
  }
  // Don't silently overwrite an existing key — report the collision instead.
  if (db.prepare('SELECT id FROM keys WHERE key = ?').get(key)) {
    return res.status(409).json({ ok: false, error: 'Key already exists.', key });
  }

  db.prepare('INSERT INTO keys (key, note, discord_id, bind_hwid, expires_at, game_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(key, note, discordId, bindHwid, expires, gameId);
  return res.json({ ok: true, key, expires_at: expires, bind_hwid: bindHwid, game_id: gameId });
});

// Revoke (disable) a key early — e.g. the bot cleaning up on demand.
app.post('/api/keys/revoke', express.json(), (req, res) => {
  const secret = process.env.BOT_API_SECRET;
  if (!secret) return res.status(503).json({ ok: false, error: 'Key API not configured.' });
  const provided = req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (provided !== secret) return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  const key = req.body && req.body.key ? String(req.body.key).trim() : '';
  if (!key) return res.status(400).json({ ok: false, error: 'Missing key.' });
  const info = db.prepare('UPDATE keys SET disabled = 1 WHERE key = ?').run(key);
  return res.json({ ok: true, revoked: info.changes > 0 });
});

// Toggle a key's HWID lock. bind_hwid:true → lock to the first device; false →
// unlock AND clear its bound device so it re-binds fresh if locked again later.
app.post('/api/keys/hwid', express.json(), (req, res) => {
  const secret = process.env.BOT_API_SECRET;
  if (!secret) return res.status(503).json({ ok: false, error: 'Key API not configured.' });
  const provided = req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (provided !== secret) return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  const key = req.body && req.body.key ? String(req.body.key).trim() : '';
  if (!key) return res.status(400).json({ ok: false, error: 'Missing key.' });
  const rec = db.prepare('SELECT id FROM keys WHERE key = ?').get(key);
  if (!rec) return res.status(404).json({ ok: false, error: 'Key not found.' });

  const bind = (req.body.bind_hwid === true || req.body.bind_hwid === 1 || req.body.bind_hwid === '1') ? 1 : 0;
  if (bind) {
    db.prepare('UPDATE keys SET bind_hwid = 1 WHERE id = ?').run(rec.id);
  } else {
    db.prepare('UPDATE keys SET bind_hwid = 0, hwid = NULL WHERE id = ?').run(rec.id);
  }
  return res.json({ ok: true, key, bind_hwid: bind });
});

// ============================================================
//  AUTH
// ============================================================
app.get('/login', (req, res) => {
  if (res.locals.user) return res.redirect('/');
  res.render('login', { email: '' });
});

app.post('/login', authLimiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    flash(req, 'error', 'Wrong email or password.');
    return res.status(401).render('login', { email });
  }
  establishSession(req, user.id, () => {
    flash(req, 'success', 'Welcome back!');
    res.redirect(isAdminUser(user) ? '/admin' : '/');
  });
});

app.get('/signup', (req, res) => {
  if (res.locals.user) return res.redirect('/');
  res.render('signup', { email: '', username: '', display_name: '' });
});

app.post('/signup', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const username = String(req.body.username || '').trim();
  const display_name = String(req.body.display_name || '').trim();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm || '');
  const form = { email, username, display_name };

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) { flash(req, 'error', 'Please enter a valid email address.'); return res.render('signup', form); }
  if (!USERNAME_RE.test(username)) { flash(req, 'error', 'Username must be 3–20 characters: letters, numbers, or underscores.'); return res.render('signup', form); }
  if (password.length < 8) { flash(req, 'error', 'Password must be at least 8 characters.'); return res.render('signup', form); }
  if (password !== confirm) { flash(req, 'error', 'Passwords do not match.'); return res.render('signup', form); }
  if (emailTaken(email)) { flash(req, 'error', 'An account with that email already exists.'); return res.render('signup', form); }
  if (usernameTaken(username)) { flash(req, 'error', 'That username is taken.'); return res.render('signup', form); }

  const hash = bcrypt.hashSync(password, BCRYPT_COST);
  const isAdmin = email === config.ADMIN_EMAIL ? 1 : 0;
  const token = crypto.randomBytes(24).toString('hex');
  // If verification is required, start unverified until the emailed link is clicked.
  const verified = config.REQUIRE_EMAIL_VERIFICATION ? 0 : 1;

  const info = db.prepare(
    'INSERT INTO users (email, username, display_name, password_hash, is_admin, email_verified, verify_token) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(email, username, display_name || username, hash, isAdmin, verified, token);

  const newUserId = info.lastInsertRowid;

  if (config.REQUIRE_EMAIL_VERIFICATION) {
    const link = `${baseUrl(req)}/verify?token=${token}`;
    let sent = false;
    try { ({ sent } = await mailer.sendVerification(email, link)); }
    catch (e) { console.error('Verification email failed:', e.message); }
    // Log them in (unverified) with a fresh session; admin powers stay off until verified.
    return establishSession(req, newUserId, () =>
      res.render('verify-sent', { email, link: sent ? null : link }));
  }
  establishSession(req, newUserId, () => {
    flash(req, 'success', 'Account created — welcome to EazyCheats!');
    res.redirect(email === config.ADMIN_EMAIL ? '/admin' : '/');
  });
});

app.get('/verify', (req, res) => {
  const token = String(req.query.token || '');
  const user = db.prepare('SELECT * FROM users WHERE verify_token = ?').get(token);
  if (!user) { flash(req, 'error', 'That verification link is invalid or expired.'); return res.redirect('/'); }
  db.prepare('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?').run(user.id);
  establishSession(req, user.id, () => {
    flash(req, 'success', 'Email verified — you are all set!');
    res.redirect(user.email === config.ADMIN_EMAIL ? '/admin' : '/');
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Re-send the verification email to the logged-in (unverified) user.
app.post('/resend-verification', authLimiter, requireLogin, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(res.locals.user.id);
  if (!user) return res.redirect('/login');
  if (user.email_verified) return res.redirect('/');
  const token = user.verify_token || crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE users SET verify_token = ? WHERE id = ?').run(token, user.id);
  const link = `${baseUrl(req)}/verify?token=${token}`;
  try { await mailer.sendVerification(user.email, link); }
  catch (e) { console.error('Resend verification failed:', e.message); }
  res.render('verify-pending', { email: user.email, resent: true });
});

// ============================================================
//  ACCOUNT SETTINGS
// ============================================================
app.get('/account', requireLogin, (req, res) => {
  const link = req.session.emailChangeLink || null;
  delete req.session.emailChangeLink;
  res.render('account', { emailChangeLink: link });
});

// Change username + display name
app.post('/account/profile', requireLogin, (req, res) => {
  const username = String(req.body.username || '').trim();
  const display_name = String(req.body.display_name || '').trim();
  if (!USERNAME_RE.test(username)) {
    flash(req, 'error', 'Username must be 3–20 characters: letters, numbers, or underscores.');
    return res.redirect('/account');
  }
  if (usernameTaken(username, res.locals.user.id)) {
    flash(req, 'error', 'That username is taken.');
    return res.redirect('/account');
  }
  db.prepare('UPDATE users SET username = ?, display_name = ? WHERE id = ?')
    .run(username, display_name || username, res.locals.user.id);
  flash(req, 'success', 'Profile updated.');
  res.redirect('/account');
});

// Request an email change — requires current password, then verify the new address
app.post('/account/email', authLimiter, requireLogin, async (req, res) => {
  const newEmail = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(res.locals.user.id);
  if (!bcrypt.compareSync(password, user.password_hash)) {
    flash(req, 'error', 'Wrong current password.');
    return res.redirect('/account');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    flash(req, 'error', 'Please enter a valid email address.');
    return res.redirect('/account');
  }
  if (newEmail === user.email) { flash(req, 'error', 'That is already your email.'); return res.redirect('/account'); }
  if (emailTaken(newEmail, user.id)) { flash(req, 'error', 'That email is already in use.'); return res.redirect('/account'); }

  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE users SET pending_email = ?, verify_token = ? WHERE id = ?').run(newEmail, token, user.id);
  const link = `${baseUrl(req)}/verify-email?token=${token}`;

  let sent = false;
  try { ({ sent } = await mailer.sendVerification(newEmail, link)); }
  catch (e) { console.error('Email-change verification failed:', e.message); }
  // Show the link on screen only when email sending isn't configured (dev mode).
  if (!sent) req.session.emailChangeLink = link;
  flash(req, 'success', sent
    ? `Verification link sent to ${newEmail}. Click it to finish the change.`
    : `Verification link created for ${newEmail}. Confirm it to finish the change.`);
  res.redirect('/account');
});

// Apply a verified email change
app.get('/verify-email', requireLogin, (req, res) => {
  const token = String(req.query.token || '');
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND verify_token = ? AND pending_email IS NOT NULL')
    .get(res.locals.user.id, token);
  if (!user) { flash(req, 'error', 'That email verification link is invalid or expired.'); return res.redirect('/account'); }
  if (emailTaken(user.pending_email, user.id)) {
    db.prepare('UPDATE users SET pending_email = NULL, verify_token = NULL WHERE id = ?').run(user.id);
    flash(req, 'error', 'That email is now in use by another account.');
    return res.redirect('/account');
  }
  db.prepare('UPDATE users SET email = ?, pending_email = NULL, verify_token = NULL, email_verified = 1 WHERE id = ?')
    .run(user.pending_email, user.id);
  flash(req, 'success', 'Your email address has been updated and verified.');
  res.redirect('/account');
});

// Change password — requires current password
app.post('/account/password', authLimiter, requireLogin, (req, res) => {
  const current = String(req.body.current || '');
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm || '');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(res.locals.user.id);
  if (!bcrypt.compareSync(current, user.password_hash)) {
    flash(req, 'error', 'Wrong current password.');
    return res.redirect('/account');
  }
  if (password.length < 8) { flash(req, 'error', 'New password must be at least 8 characters.'); return res.redirect('/account'); }
  if (password !== confirm) { flash(req, 'error', 'New passwords do not match.'); return res.redirect('/account'); }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, BCRYPT_COST), user.id);
  // Changing the password logs out other sessions by rotating the session id.
  req.session.regenerate((err) => {
    if (err) { flash(req, 'success', 'Password changed.'); return res.redirect('/account'); }
    req.session.userId = user.id;
    flash(req, 'success', 'Password changed.');
    res.redirect('/account');
  });
});

// ============================================================
//  ADMIN PANEL  (phoenix@edis.org only)
// ============================================================
app.get('/admin', requireAdmin, (req, res) => {
  const games = db.prepare('SELECT * FROM games ORDER BY sort_order ASC, id ASC').all()
    .map(g => ({ ...g, product_count: productCount(g.id) }));
  res.render('admin/dashboard', { games });
});

// ---- Games ----
app.get('/admin/games/new', requireAdmin, (req, res) => {
  res.render('admin/game-form', { game: null });
});

app.post('/admin/games', requireAdmin, upload.single('image'), (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) { flash(req, 'error', 'Game needs a title.'); return res.redirect('/admin/games/new'); }
  const image = req.file ? '/uploads/' + req.file.filename : null;
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM games').get().m;
  db.prepare('INSERT INTO games (title, slug, image, sort_order) VALUES (?, ?, ?, ?)')
    .run(title, uniqueGameSlug(title), image, maxOrder + 1);
  flash(req, 'success', `Added game "${title}".`);
  res.redirect('/admin');
});

app.get('/admin/games/:id/edit', requireAdmin, (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!game) return res.status(404).render('404');
  res.render('admin/game-form', { game });
});

app.post('/admin/games/:id', requireAdmin, upload.single('image'), (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!game) return res.status(404).render('404');
  const title = String(req.body.title || '').trim() || game.title;
  let image = game.image;
  if (req.file) { deleteUpload(game.image); image = '/uploads/' + req.file.filename; }
  db.prepare('UPDATE games SET title = ?, image = ? WHERE id = ?').run(title, image, game.id);
  flash(req, 'success', 'Game updated.');
  res.redirect('/admin');
});

app.post('/admin/games/:id/delete', requireAdmin, (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (game) {
    // Clean up images for the game and its products.
    db.prepare('SELECT image FROM products WHERE game_id = ?').all(game.id).forEach(p => deleteUpload(p.image));
    deleteUpload(game.image);
    db.prepare('DELETE FROM games WHERE id = ?').run(game.id);
    flash(req, 'success', `Deleted "${game.title}" and its products.`);
  }
  res.redirect('/admin');
});

// ---- Products ----
app.get('/admin/games/:id/products/new', requireAdmin, (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!game) return res.status(404).render('404');
  res.render('admin/product-form', { game, product: null });
});

app.post('/admin/games/:id/products', requireAdmin, upload.single('image'), (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!game) return res.status(404).render('404');
  const title = String(req.body.title || '').trim();
  if (!title) { flash(req, 'error', 'Product needs a title.'); return res.redirect(`/admin/games/${game.id}/products/new`); }
  const image = req.file ? '/uploads/' + req.file.filename : null;
  db.prepare(
    'INSERT INTO products (game_id, title, slug, image, summary, content, price) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    game.id, title, uniqueProductSlug(title, game.id), image,
    String(req.body.summary || '').trim(),
    String(req.body.content || ''),
    String(req.body.price || '').trim()
  );
  flash(req, 'success', `Added product "${title}".`);
  res.redirect(`/game/${game.slug}`);
});

app.get('/admin/products/:id/edit', requireAdmin, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).render('404');
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(product.game_id);
  res.render('admin/product-form', { game, product });
});

app.post('/admin/products/:id', requireAdmin, upload.single('image'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).render('404');
  const title = String(req.body.title || '').trim() || product.title;
  let image = product.image;
  if (req.file) { deleteUpload(product.image); image = '/uploads/' + req.file.filename; }
  db.prepare('UPDATE products SET title = ?, image = ?, summary = ?, content = ?, price = ? WHERE id = ?')
    .run(title, image, String(req.body.summary || '').trim(), String(req.body.content || ''),
      String(req.body.price || '').trim(), product.id);
  const game = db.prepare('SELECT slug FROM games WHERE id = ?').get(product.game_id);
  flash(req, 'success', 'Product updated.');
  res.redirect(`/game/${game.slug}/${product.slug}`);
});

app.post('/admin/products/:id/delete', requireAdmin, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (product) {
    const game = db.prepare('SELECT slug FROM games WHERE id = ?').get(product.game_id);
    deleteUpload(product.image);
    db.prepare('DELETE FROM products WHERE id = ?').run(product.id);
    flash(req, 'success', `Deleted "${product.title}".`);
    return res.redirect(`/game/${game.slug}`);
  }
  res.redirect('/admin');
});

// ---- Scripts (hosted Lua) ----
app.get('/admin/scripts', requireAdmin, (req, res) => {
  const scripts = db.prepare('SELECT * FROM scripts ORDER BY id DESC').all();
  res.render('admin/scripts', { scripts, base: baseUrl(req) });
});
app.get('/admin/scripts/new', requireAdmin, (req, res) => {
  res.render('admin/script-form', { script: null, games: allGames() });
});
app.post('/admin/scripts', requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) { flash(req, 'error', 'Script needs a name.'); return res.redirect('/admin/scripts/new'); }
  const slug = uniqueScriptSlug(req.body.slug ? String(req.body.slug) : name);
  const gameId = req.body.game_id ? (resolveGameId(req.body.game_id) || null) : null;
  db.prepare('INSERT INTO scripts (slug, name, content, protected, game_id) VALUES (?, ?, ?, ?, ?)')
    .run(slug, name, String(req.body.content || ''), req.body.protected ? 1 : 0, gameId);
  flash(req, 'success', `Created script "${name}".`);
  res.redirect('/admin/scripts');
});
app.get('/admin/scripts/:id/edit', requireAdmin, (req, res) => {
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id);
  if (!script) return res.status(404).render('404');
  res.render('admin/script-form', { script, games: allGames() });
});
app.post('/admin/scripts/:id', requireAdmin, (req, res) => {
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id);
  if (!script) return res.status(404).render('404');
  const name = String(req.body.name || '').trim() || script.name;
  const slug = uniqueScriptSlug(req.body.slug ? String(req.body.slug) : name, script.id);
  const gameId = req.body.game_id ? (resolveGameId(req.body.game_id) || null) : null;
  db.prepare("UPDATE scripts SET name = ?, slug = ?, content = ?, protected = ?, game_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name, slug, String(req.body.content || ''), req.body.protected ? 1 : 0, gameId, script.id);
  flash(req, 'success', 'Script saved.');
  res.redirect('/admin/scripts');
});
app.post('/admin/scripts/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM scripts WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Script deleted.');
  res.redirect('/admin/scripts');
});

// ---- Images (hosted media, served at /uploads/<file>) ----
// The scripts table's counterpart for media: upload once here, then use the
// public URL anywhere. Files land on the same persistent disk as the DB, so
// they survive redeploys.
app.get('/admin/images', requireAdmin, (req, res) => {
  const images = db.prepare('SELECT * FROM images ORDER BY id DESC').all();
  res.render('admin/images', { images, base: baseUrl(req) });
});
app.post('/admin/images', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    flash(req, 'error', 'Choose an image to upload.');
    return res.redirect('/admin/images');
  }
  // Fall back to the original filename (minus extension) when no name is typed.
  const typed = String(req.body.name || '').trim();
  const name = typed || String(req.file.originalname || req.file.filename).replace(/\.[^.]+$/, '');
  const publicPath = '/uploads/' + req.file.filename;
  db.prepare('INSERT INTO images (name, path, mime, size) VALUES (?, ?, ?, ?)')
    .run(name, publicPath, req.file.mimetype, req.file.size);
  flash(req, 'success', `Uploaded "${name}".`);
  res.redirect('/admin/images');
});
app.post('/admin/images/:id/delete', requireAdmin, (req, res) => {
  const image = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
  if (!image) return res.redirect('/admin/images');
  deleteUpload(image.path);   // remove the file from disk, then the row
  db.prepare('DELETE FROM images WHERE id = ?').run(image.id);
  flash(req, 'success', `Deleted "${image.name}".`);
  res.redirect('/admin/images');
});

// ---- Keys ----
app.get('/admin/keys', requireAdmin, (req, res) => {
  const keys = db.prepare(
    'SELECT k.*, g.title AS game_title FROM keys k LEFT JOIN games g ON g.id = k.game_id ORDER BY k.id DESC'
  ).all();
  res.render('admin/keys', { keys, games: allGames() });
});
app.post('/admin/keys', requireAdmin, (req, res) => {
  const note = String(req.body.note || '').trim();
  const hours = parseFloat(req.body.hours || '0');
  const expires = hours > 0 ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;
  const gameId = req.body.game_id ? (resolveGameId(req.body.game_id) || null) : null;
  let key;
  do { key = genKeyString(); } while (db.prepare('SELECT 1 FROM keys WHERE key = ?').get(key));
  db.prepare('INSERT INTO keys (key, note, bind_hwid, expires_at, game_id) VALUES (?, ?, ?, ?, ?)')
    .run(key, note, req.body.bind_hwid ? 1 : 0, expires, gameId);
  flash(req, 'success', `Generated key ${key}`);
  res.redirect('/admin/keys');
});
app.post('/admin/keys/:id/disable', requireAdmin, (req, res) => {
  db.prepare('UPDATE keys SET disabled = 1 WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Key disabled.');
  res.redirect('/admin/keys');
});
app.post('/admin/keys/:id/enable', requireAdmin, (req, res) => {
  db.prepare('UPDATE keys SET disabled = 0 WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Key re-enabled.');
  res.redirect('/admin/keys');
});
app.post('/admin/keys/:id/reset', requireAdmin, (req, res) => {
  db.prepare('UPDATE keys SET hwid = NULL, disabled = 0 WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Key HWID reset — it can bind to a new device.');
  res.redirect('/admin/keys');
});
app.post('/admin/keys/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM keys WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Key deleted.');
  res.redirect('/admin/keys');
});

// ---------- Errors ----------
app.use((req, res) => res.status(404).render('404'));
app.use((err, req, res, next) => {
  console.error(err);
  const msg = err && err.message ? err.message : 'Something went wrong.';
  res.status(500).render('error', { message: msg });
});

// Seed hosted scripts from the repo's scripts/ folder so large scripts (the hub)
// deploy via git instead of a giant admin paste. The repo file is the source of
// truth for these slugs — edit scripts/<slug>.lua and push to update it.
function seedScriptsFromRepo() {
  const dir = path.join(__dirname, 'scripts');
  // Serve the OBFUSCATED hub. The clean source (scripts/hub.lua) is gitignored
  // and never committed to this public repo.
  //
  // The key loaders are seeded here too. They used to be maintained only through
  // the admin edit form, whose Save has been unreliable, and there was no record
  // of what was actually live. Being in git means a deploy is reproducible and
  // reviewable — but it also means the repo file WINS: editing these two in the
  // admin panel will be undone by the next deploy. Edit scripts/<slug>.lua.
  const manifest = {
    hub:   { name: 'Hub', protected: 1, file: 'hub.obf.lua' },
    prior: { name: 'Prior Extinction', protected: 0, file: 'prior.lua' },
  };
  for (const [slug, meta] of Object.entries(manifest)) {
    let content;
    try { content = fs.readFileSync(path.join(dir, meta.file || (slug + '.lua')), 'utf8'); } catch { continue; }
    const row = db.prepare('SELECT id FROM scripts WHERE slug = ?').get(slug);
    if (row) {
      db.prepare("UPDATE scripts SET name = ?, content = ?, protected = ?, updated_at = datetime('now') WHERE slug = ?")
        .run(meta.name, content, meta.protected, slug);
    } else {
      db.prepare('INSERT INTO scripts (slug, name, content, protected) VALUES (?, ?, ?, ?)')
        .run(slug, meta.name, content, meta.protected);
    }
    console.log(`  Seeded script /s/${slug} (${content.length} bytes, ${meta.protected ? 'protected' : 'public'})`);
  }
}

app.listen(config.PORT, () => {
  console.log(`\n  ${config.SITE_NAME} running at http://localhost:${config.PORT}`);
  console.log(`  Admin account: ${config.ADMIN_EMAIL} (sign up with this email to get admin powers)\n`);

  // One-time cleanup of any leftover test accounts.
  try { db.prepare("DELETE FROM users WHERE email LIKE '%@example.com'").run(); } catch {}

  // Load the hub (and any other repo scripts) into the DB from scripts/.
  try { seedScriptsFromRepo(); } catch (err) { console.error('  Script seed failed:', err.message); }

  // Start the EazyCheats Discord bot in the same process so it stays online
  // 24/7 with the site. Best-effort: a bot problem never crashes the website.
  try {
    if (process.env.DISCORD_TOKEN) {
      require('./discord-bot/bot').startBot();
    } else {
      console.log('  Discord bot: DISCORD_TOKEN not set — skipping.\n');
    }
  } catch (err) {
    console.error('  Discord bot failed to start:', err.message, '\n');
  }
});
