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

  // One person = one email. Rows logged before the email rollout (or with a
  // blank email) fall back to the typed name, so history still shows up.
  const IDENT = "COALESCE(NULLIF(LOWER(TRIM(email)), ''), user_name)";

  try {
    const db = getClient();
    const requestedDays = body && body.rangeDays;
    const rangeDays = requestedDays === 'all'
      ? null
      : ([1, 7, 30, 90].includes(Number(requestedDays)) ? Number(requestedDays) : 30);
    const isToday = rangeDays === 1;
    const user = typeof body?.user === 'string' ? body.user.trim().slice(0, 100) : '';
    const filters = [];
    const args = [];

    if (rangeDays) {
      if (isToday) {
        filters.push("ts >= datetime(date('now'))");
      } else {
        filters.push("ts >= datetime('now', ?)");
        args.push(`-${rangeDays} days`);
      }
    }
    if (user) {
      filters.push(`${IDENT} = ?`);
      args.push(user);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const periodLabel = isToday ? 'Today' : (rangeDays ? `Last ${rangeDays} days` : 'All time');
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

    // A table created before the email/booking rollout needs the columns added
    // before any query below references them (usage.js does the same on insert).
    await db.execute('ALTER TABLE usage_log ADD COLUMN email TEXT').catch(() => {});
    await db.execute('ALTER TABLE usage_log ADD COLUMN booking TEXT').catch(() => {});

    const previousFilters = [];
    const previousArgs = [];
    if (rangeDays) {
      if (isToday) {
        previousFilters.push(
          "ts >= datetime(date('now', '-1 day'))",
          "ts < datetime(date('now'))"
        );
      } else {
        previousFilters.push("ts >= datetime('now', ?)", "ts < datetime('now', ?)");
        previousArgs.push(`-${rangeDays * 2} days`, `-${rangeDays} days`);
      }
    }
    if (user) {
      previousFilters.push(`${IDENT} = ?`);
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
      // activeDays counts weekdays only (Sat/Sun excluded) so the per-day
      // averages reflect the business week; weekend calcs still count in total.
      statement(
        `SELECT
           COUNT(*) AS total,
           COUNT(DISTINCT ${IDENT}) AS uniqueUsers,
           COUNT(DISTINCT CASE WHEN strftime('%w', ts) NOT IN ('0','6') THEN date(ts) END) AS activeDays
         FROM usage_log ${where}`,
        args
      ),
      statement(
        `SELECT COUNT(*) AS returningUsers
         FROM (
           SELECT ${IDENT} AS ident
           FROM usage_log ${where}
           GROUP BY ident
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
      // Merged people keep the name/email from their most recent row, so a
      // corrected spelling wins over old typos in the tables and dropdown.
      statement(
        `SELECT g.ident, ul.user_name, ul.email, g.count, g.last_used
         FROM (
           SELECT ${IDENT} AS ident, COUNT(*) AS count, MAX(ts) AS last_used, MAX(id) AS last_id
           FROM usage_log ${where}
           GROUP BY ident
         ) g JOIN usage_log ul ON ul.id = g.last_id
         ORDER BY g.count DESC, ul.user_name COLLATE NOCASE ASC
         LIMIT 50`,
        args
      ),
      statement(
        `SELECT ts, user_name, email, booking, erd, lrd
         FROM usage_log ${where}
         ORDER BY id DESC
         LIMIT 50`,
        args
      ),
      statement(
        `SELECT g.ident, ul.user_name, ul.email, g.count
         FROM (
           SELECT ${IDENT} AS ident, COUNT(*) AS count, MAX(id) AS last_id
           FROM usage_log
           GROUP BY ident
         ) g JOIN usage_log ul ON ul.id = g.last_id
         ORDER BY ul.user_name COLLATE NOCASE ASC`
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
      byUser: byUserResult.rows.map(r => ({ ident: r.ident, user_name: r.user_name, email: r.email || '', count: Number(r.count), last_used: r.last_used })),
      recent: recentResult.rows.map(r => ({ ts: r.ts, user_name: r.user_name, email: r.email || '', booking: r.booking || '', erd: r.erd, lrd: r.lrd })),
      users: usersResult.rows.map(r => ({ ident: r.ident, user_name: r.user_name, email: r.email || '', count: Number(r.count) })),
      filter: { rangeDays: rangeDays || 'all', periodLabel, user },
    });
  } catch (err) {
    console.error('[stats] failed:', err.message);
    return res.status(500).json({ error: 'Could not load usage stats.' });
  }
};
