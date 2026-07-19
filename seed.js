// Seeds the starter data (Roblox game). Safe to run multiple times.
const db = require('./db');

const exists = db.prepare('SELECT 1 FROM games WHERE slug = ?').get('roblox');
if (!exists) {
  db.prepare('INSERT INTO games (title, slug, image, sort_order) VALUES (?, ?, ?, ?)')
    .run('Roblox', 'roblox', '/img/roblox.svg', 1);
  console.log('Seeded: Roblox game added.');
} else {
  console.log('Roblox already exists — nothing to seed.');
}
