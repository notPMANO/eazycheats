// A tiny express-session store backed by our SQLite database.
// Keeps logins alive across restarts without any native dependency.
const db = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  data    TEXT NOT NULL
);`);

module.exports = function (session) {
  class SqliteStore extends session.Store {
    constructor() {
      super();
      // Sweep expired sessions every hour.
      this._sweep();
      this._timer = setInterval(() => this._sweep(), 60 * 60 * 1000);
      if (this._timer.unref) this._timer.unref();
    }

    _sweep() {
      try { db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); } catch {}
    }

    _expiry(sess) {
      const maxAge = sess && sess.cookie && sess.cookie.maxAge;
      return Date.now() + (maxAge || 1000 * 60 * 60 * 24 * 30);
    }

    get(sid, cb) {
      try {
        const row = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?').get(sid);
        if (!row) return cb(null, null);
        if (row.expires < Date.now()) { this.destroy(sid, () => {}); return cb(null, null); }
        return cb(null, JSON.parse(row.data));
      } catch (e) { return cb(e); }
    }

    set(sid, sess, cb) {
      try {
        db.prepare('INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?) ' +
          'ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data')
          .run(sid, this._expiry(sess), JSON.stringify(sess));
        return cb && cb(null);
      } catch (e) { return cb && cb(e); }
    }

    touch(sid, sess, cb) {
      try {
        db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').run(this._expiry(sess), sid);
        return cb && cb(null);
      } catch (e) { return cb && cb(e); }
    }

    destroy(sid, cb) {
      try { db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); return cb && cb(null); }
      catch (e) { return cb && cb(e); }
    }
  }
  return SqliteStore;
};
