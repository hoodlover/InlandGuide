// Vercel serverless function: logs one calculator submit to Turso (SQLite).
// Deliberately fire-and-forget from the client — a logging failure must never
// break the calculator, so this endpoint always answers quickly and the client
// ignores the response.
//
// Required env vars (Vercel → Project → Settings → Environment Variables):
//   TURSO_DATABASE_URL   libsql://<db>-<org>.turso.io
//   TURSO_AUTH_TOKEN     database auth token
// Each log row is ~100 bytes, so years of team usage fits in megabytes —
// comfortably inside Turso's free plan.

const { createClient } = require('@libsql/client');

let client = null;
function getClient() {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

// One CREATE TABLE round-trip per warm instance, not per request.
let schemaReady = null;
function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch([
      `CREATE TABLE IF NOT EXISTS usage_log (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        ts        TEXT NOT NULL DEFAULT (datetime('now')),
        user_name TEXT NOT NULL,
        erd       TEXT,
        lrd       TEXT,
        ip        TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log (ts)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log (user_name)`,
    ], 'write').catch(err => {
      schemaReady = null; // retry on the next request
      throw err;
    });
  }
  return schemaReady;
}

function clean(value, maxLength) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function requestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return clean(Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0], 80) || null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({ error: 'Server not configured (missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  const userName = clean(body.userName, 80) || 'Unknown';
  const erd = clean(body.erd, 40) || null;
  const lrd = clean(body.lrd, 40) || null;
  const ip = requestIp(req);

  try {
    const db = getClient();
    await ensureSchema(db);
    await db.execute({
      sql: 'INSERT INTO usage_log (user_name, erd, lrd, ip) VALUES (?, ?, ?, ?)',
      args: [userName, erd, lrd, ip],
    });
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[usage] failed to write log entry:', err.message);
    return res.status(500).json({ error: 'Could not record usage.' });
  }
};
