// Usage dashboard for the managers hub. Fetches /api/stats with the manager
// passphrase (same guard pattern as /api/refresh and /api/requests).

import { useEffect, useState } from 'react';

function StatCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-700">
      <div className="text-2xl font-semibold text-[#002D72] dark:text-white">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-300">{label}</div>
    </div>
  );
}

function TrendBars({ daily }) {
  if (!daily.length) return <p className="text-sm text-slate-500 dark:text-slate-300">No activity yet.</p>;
  const max = Math.max(...daily.map((d) => d.count));
  return (
    <div className="flex h-28 items-end gap-1">
      {daily.map((d) => (
        <div key={d.day} className="group relative flex-1">
          <div
            className="w-full rounded-t bg-[#0a4b9b] transition-colors group-hover:bg-[#EB6608]"
            style={{ height: `${Math.max((d.count / max) * 100, 4)}%` }}
          />
          <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
            {d.day}: {d.count}
          </div>
        </div>
      ))}
    </div>
  );
}

const TH = 'py-2 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-300';

export default function UsageStats({ passphrase, onAuthExpired }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    })
      .then(async (r) => {
        if (r.status === 401) { if (!cancelled) onAuthExpired?.(); return null; }
        const body = await r.json().catch(() => ({}));
        if (!r.ok || !body.ok) throw new Error(body.error || `Stats service returned HTTP ${r.status}.`);
        return body;
      })
      .then((body) => { if (!cancelled && body) setData(body); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Could not load usage stats.'); });
    return () => { cancelled = true; };
    // onAuthExpired is intentionally not a dependency — parents pass inline
    // arrows, and refetching on every parent render would hammer the API.
  }, [passphrase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!data) return <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-300">Loading usage stats…</p>;

  const { summary, daily, byUser, recent } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total calcs" value={summary.total} />
        <StatCard label="Unique users" value={summary.uniqueUsers} />
        <StatCard label="Last 30 days" value={summary.last30} />
        <StatCard label="Today" value={summary.today} />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-[#002D72] dark:text-white">Calculations per day (last 30 days)</h3>
        <TrendBars daily={daily} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-[#002D72] dark:text-white">Most active users</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-600">
              <th className={TH}>Name</th>
              <th className={TH}>Calcs</th>
              <th className={TH}>Last used (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {byUser.map((u) => (
              <tr key={u.user_name} className="border-b border-slate-100 dark:border-slate-700">
                <td className="py-2 text-slate-900 dark:text-white">{u.user_name}</td>
                <td className="py-2 text-slate-700 dark:text-slate-200">{u.count}</td>
                <td className="py-2 text-slate-500 dark:text-slate-300">{u.last_used}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-[#002D72] dark:text-white">Recent activity</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-600">
              <th className={TH}>Time (UTC)</th>
              <th className={TH}>Name</th>
              <th className={TH}>ERD</th>
              <th className={TH}>LRD</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 dark:border-slate-700">
                <td className="py-2 text-slate-500 dark:text-slate-300">{r.ts}</td>
                <td className="py-2 text-slate-900 dark:text-white">{r.user_name}</td>
                <td className="py-2 text-slate-700 dark:text-slate-200">{r.erd || '—'}</td>
                <td className="py-2 text-slate-700 dark:text-slate-200">{r.lrd || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
