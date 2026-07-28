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
    const requestedDays = body && body.rangeDays;
    const rangeDays = requestedDays === 'all'
      ? null
      : ([7, 30, 90].includes(Number(requestedDays)) ? Number(requestedDays) : 30);
    const user = typeof body?.user === 'string' ? body.user.trim().slice(0, 100) : '';
    const filters = [];
    const args = [];

    if (rangeDays) {
      filters.push("ts >= datetime('now', ?)");
      args.push(`-${rangeDays} days`);
    }
    if (user) {
      filters.push('user_name = ?');
      args.push(user);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const periodLabel = rangeDays ? `Last ${rangeDays} days` : 'All time';
    const emptySummary = {
      total: 0,
      uniqueUsers: 0,
      activeDays: 0,
      avgPerUser: 0,
      avgPerActiveDay: 0,
      returningUsers: 0,
      repeatRate: 0,
      previousTotal: null,
      changePct: null,
    };

    // Table may not exist until the first calculation is logged.
    const existsResult = await db.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'usage_log'"
    );
    if (existsResult.rows.length === 0) {
      return res.status(200).json({
        ok: true,
        summary: emptySummary,
        daily: [], byUser: [], recent: [], users: [],
        filter: { rangeDays: rangeDays || 'all', periodLabel, user },
      });
    }

    const previousFilters = [];
    const previousArgs = [];
    if (rangeDays) {
      previousFilters.push("ts >= datetime('now', ?)", "ts < datetime('now', ?)");
      previousArgs.push(`-${rangeDays * 2} days`, `-${rangeDays} days`);
    }
    if (user) {
      previousFilters.push('user_name = ?');
      previousArgs.push(user);
    }
    const previousWhere = previousFilters.length ? `WHERE ${previousFilters.join(' AND ')}` : '';

    const statement = (sql, statementArgs = []) => ({ sql, args: statementArgs });
    const [
      summaryResult,
      returningResult,
      previousResult,
      dailyResult,
      byUserResult,
      recentResult,
      usersResult,
    ] = await db.batch([
      statement(
        `SELECT
           COUNT(*) AS total,
           COUNT(DISTINCT user_name) AS uniqueUsers,
           COUNT(DISTINCT date(ts)) AS activeDays
         FROM usage_log ${where}`,
        args
      ),
      statement(
        `SELECT COUNT(*) AS returningUsers
         FROM (
           SELECT user_name
           FROM usage_log ${where}
           GROUP BY user_name
           HAVING COUNT(*) > 1
         )`,
        args
      ),
      rangeDays
        ? statement(`SELECT COUNT(*) AS total FROM usage_log ${previousWhere}`, previousArgs)
        : statement('SELECT NULL AS total'),
      statement(
        `SELECT date(ts) AS day, COUNT(*) AS count
         FROM usage_log ${where}
         GROUP BY date(ts)
         ORDER BY day ASC`,
        args
      ),
      statement(
        `SELECT user_name, COUNT(*) AS count, MAX(ts) AS last_used
         FROM usage_log ${where}
         GROUP BY user_name
         ORDER BY count DESC, user_name COLLATE NOCASE ASC
         LIMIT 50`,
        args
      ),
      statement(
        `SELECT ts, user_name, erd, lrd
         FROM usage_log ${where}
         ORDER BY id DESC
         LIMIT 50`,
        args
      ),
      statement(
        `SELECT user_name, COUNT(*) AS count
         FROM usage_log
         GROUP BY user_name
         ORDER BY user_name COLLATE NOCASE ASC`
      ),
    ], 'read');

    const s = summaryResult.rows[0];
    const total = Number(s.total) || 0;
    const uniqueUsers = Number(s.uniqueUsers) || 0;
    const activeDays = Number(s.activeDays) || 0;
    const returningUsers = Number(returningResult.rows[0]?.returningUsers) || 0;
    const previousTotal = rangeDays ? (Number(previousResult.rows[0]?.total) || 0) : null;
    const changePct = previousTotal === null
      ? null
      : (previousTotal === 0 ? (total > 0 ? 100 : 0) : Math.round(((total - previousTotal) / previousTotal) * 100));

    return res.status(200).json({
      ok: true,
      summary: {
        total,
        uniqueUsers,
        activeDays,
        avgPerUser: uniqueUsers ? Number((total / uniqueUsers).toFixed(1)) : 0,
        avgPerActiveDay: activeDays ? Number((total / activeDays).toFixed(1)) : 0,
        returningUsers,
        repeatRate: uniqueUsers ? Math.round((returningUsers / uniqueUsers) * 100) : 0,
        previousTotal,
        changePct,
      },
      daily: dailyResult.rows.map(r => ({ day: r.day, count: Number(r.count) })),
      byUser: byUserResult.rows.map(r => ({ user_name: r.user_name, count: Number(r.count), last_used: r.last_used })),
      recent: recentResult.rows.map(r => ({ ts: r.ts, user_name: r.user_name, erd: r.erd, lrd: r.lrd })),
      users: usersResult.rows.map(r => ({ user_name: r.user_name, count: Number(r.count) })),
      filter: { rangeDays: rangeDays || 'all', periodLabel, user },
    });
  } catch (err) {
    console.error('[stats] failed:', err.message);
    return res.status(500).json({ error: 'Could not load usage stats.' });
  }
};
