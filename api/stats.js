// Vercel serverless function: usage stats for the managers hub.
// Guarded the same way as /api/refresh and /api/requests — the manager
// passphrase travels in the POST body and is compared to REFRESH_PASSPHRASE.
//
// Required env vars: REFRESH_PASSPHRASE, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN.

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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { REFRESH_PASSPHRASE, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
  if (!REFRESH_PASSPHRASE) return res.status(500).json({ error: 'Server not configured (missing REFRESH_PASSPHRASE).' });
  if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
    return res.status(500).json({ error: 'Server not configured (missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const passphrase = body && body.passphrase;
  if (!passphrase || passphrase !== REFRESH_PASSPHRASE) {
    return res.status(401).json({ error: 'Wrong passphrase.' });
  }

  try {
    const db = getClient();

    // Table may not exist until the first calculation is logged.
    const existsResult = await db.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'usage_log'"
    );
    if (existsResult.rows.length === 0) {
      return res.status(200).json({
        ok: true,
        summary: { total: 0, uniqueUsers: 0, last30: 0, today: 0 },
        daily: [], byUser: [], recent: [],
      });
    }

    const [summaryResult, dailyResult, byUserResult, recentResult] = await db.batch([
      `SELECT
         COUNT(*)                                                              AS total,
         COUNT(DISTINCT user_name)                                             AS uniqueUsers,
         SUM(CASE WHEN ts >= datetime('now', '-30 days') THEN 1 ELSE 0 END)    AS last30,
         SUM(CASE WHEN date(ts) = date('now') THEN 1 ELSE 0 END)               AS today
       FROM usage_log`,
      `SELECT date(ts) AS day, COUNT(*) AS count
       FROM usage_log
       WHERE ts >= datetime('now', '-30 days')
       GROUP BY date(ts)
       ORDER BY day ASC`,
      `SELECT user_name, COUNT(*) AS count, MAX(ts) AS last_used
       FROM usage_log
       GROUP BY user_name
       ORDER BY count DESC
       LIMIT 25`,
      `SELECT ts, user_name, erd, lrd
       FROM usage_log
       ORDER BY id DESC
       LIMIT 50`,
    ], 'read');

    const s = summaryResult.rows[0];
    return res.status(200).json({
      ok: true,
      summary: {
        total: Number(s.total) || 0,
        uniqueUsers: Number(s.uniqueUsers) || 0,
        last30: Number(s.last30) || 0,
        today: Number(s.today) || 0,
      },
      daily: dailyResult.rows.map(r => ({ day: r.day, count: Number(r.count) })),
      byUser: byUserResult.rows.map(r => ({ user_name: r.user_name, count: Number(r.count), last_used: r.last_used })),
      recent: recentResult.rows.map(r => ({ ts: r.ts, user_name: r.user_name, erd: r.erd, lrd: r.lrd })),
    });
  } catch (err) {
    console.error('[stats] failed:', err.message);
    return res.status(500).json({ error: 'Could not load usage stats.' });
  }
};
