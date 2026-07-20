// Database layer for EazyCheats — uses Node's built-in SQLite (node:sqlite).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// DATA_DIR can point at a mounted persistent disk in production.
const DATA_DIR = config.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'eazycheats.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    username      TEXT UNIQUE,
    display_name  TEXT,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    email_verified INTEGER NOT NULL DEFAULT 0,
    verify_token  TEXT,
    pending_email TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS games (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    image      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    slug       TEXT NOT NULL,
    image      TEXT,
    summary    TEXT,
    content    TEXT,
    price      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Hosted Lua scripts, served raw at /s/<slug> for game:HttpGet.
  -- protected = 1 means a valid key (+HWID) is required to fetch the content.
  CREATE TABLE IF NOT EXISTS scripts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    protected  INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Access keys. Bound to the first HWID that uses them; a second HWID trips the
  -- leak alert and disables the key. expires_at NULL = permanent.
  CREATE TABLE IF NOT EXISTS keys (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT NOT NULL UNIQUE,
    hwid       TEXT,
    note       TEXT,
    discord_id TEXT,
    bind_hwid  INTEGER NOT NULL DEFAULT 1,
    disabled   INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    last_used  TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Migrations: add columns to existing databases if they're missing ---
function ensureColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
ensureColumn('users', 'username', 'TEXT');
ensureColumn('users', 'display_name', 'TEXT');
ensureColumn('users', 'pending_email', 'TEXT');
// Enforce unique usernames (SQLite allows multiple NULLs, which is fine).
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');

// Seed the starter Roblox game if the games table is empty. This runs on every
// boot, so the demo game reappears even after a free-tier disk reset.
if (db.prepare('SELECT COUNT(*) AS n FROM games').get().n === 0) {
  db.prepare('INSERT INTO games (title, slug, image, sort_order) VALUES (?, ?, ?, ?)')
    .run('Roblox', 'roblox', '/img/roblox.svg', 1);
}

// Seed a permanent test key "123" (not HWID-locked, so it works on any device
// for testing). Delete or disable it from the admin panel when you go live.
if (!db.prepare('SELECT 1 FROM keys WHERE key = ?').get('123')) {
  db.prepare('INSERT INTO keys (key, note, bind_hwid) VALUES (?, ?, 0)')
    .run('123', 'test key (not HWID-locked)');
}

module.exports = db;
