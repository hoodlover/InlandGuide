# InlandGuide usage tracking — how it's wired

Usage tracking runs on the **live Vercel site** and stores data in **Turso**
(hosted SQLite — the free plan is plenty; each log row is ~100 bytes, so years
of team usage fits in a few megabytes).

> The original drop-in package assumed an Express backend with a local SQLite
> file. The live app calculates client-side and Vercel's filesystem is
> ephemeral, so the storage moved to Turso; same SQLite schema and queries,
> same stats views and name prompt.

## Pieces

| File | Role |
| --- | --- |
| `api/usage.js` | Serverless POST endpoint that logs one calculation (name, ERD, LRD, IP). Creates the `usage_log` table on first use. |
| `api/stats.js` | Serverless POST endpoint returning summary / daily trend / per-user / recent rows. Guarded by the manager passphrase (`REFRESH_PASSPHRASE`), same as `/api/refresh`. |
| `frontend/src/components/NamePrompt.jsx` | First-visit name capture, remembered in `localStorage` (`inlandguide.userName`). Rendered in `App.jsx`. |
| `frontend/src/components/UsageStats.jsx` | Manager dashboard: headline numbers, 30-day trend bars, most-active-users table, recent-activity audit trail. Rendered in the Managers Hub ("See who's using the guide"). |
| `frontend/src/components/LookupForm.jsx` | Calls `logUsage()` (fire-and-forget fetch to `/api/usage`) after each successful calculation. A failed log can never break the calculator. |
| `package.json` (repo root) | Holds `@libsql/client` for the api functions. `vercel.json`'s installCommand runs `npm install` at the root too. |

## One-time setup

1. In Vercel → Project → Settings → Environment Variables, add
   `TURSO_DATABASE_URL` (the `libsql://<db>-<org>.turso.io` URL) and
   `TURSO_AUTH_TOKEN` (Production).
2. Deploy. The `usage_log` table is created automatically on the first
   logged calculation — no migration step.

## Notes

- Logging is fire-and-forget — if the DB or endpoint is down, the calculator
  still works, including in the offline double-click build (no `/api` there,
  so nothing is logged from it).
- Clearing browser data just re-triggers the name prompt; old rows keep the
  name they were recorded under.
- Timestamps are stored/shown in UTC.
- When the customer-facing version comes later, extend the same table with
  booking/container columns (or a related table); the logging pattern stays
  identical.
