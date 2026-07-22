// Usage dashboard for the managers hub. Fetches /api/stats with the manager
// passphrase (same guard pattern as /api/refresh and /api/requests).

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

const stamp = () => new Date().toISOString().slice(0, 10);

// One sheet per section of the report, mirroring the on-screen dashboard.
function exportExcel(data) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Inland Cutoff Guide — usage report', ''],
    ['Exported (UTC)', new Date().toISOString().slice(0, 16).replace('T', ' ')],
    [],
    ['Total calculations', data.summary.total],
    ['Unique users', data.summary.uniqueUsers],
    ['Last 30 days', data.summary.last30],
    ['Today', data.summary.today],
  ]), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.daily.map(d => ({ 'Day (UTC)': d.day, 'Calculations': d.count }))
  ), 'Daily trend');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.byUser.map(u => ({ 'Name': u.user_name, 'Calculations': u.count, 'Last used (UTC)': u.last_used }))
  ), 'By user');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.recent.map(r => ({ 'Time (UTC)': r.ts, 'Name': r.user_name, 'ERD': r.erd || '', 'LRD': r.lrd || '' }))
  ), 'Recent activity');
  XLSX.writeFile(wb, `InlandGuide-usage-${stamp()}.xlsx`);
}

// PDF via the browser's print-to-PDF: opens a formatted report window with the
// print dialog ready — the user picks "Save as PDF". No PDF library needed.
function exportPdf(data) {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = (items, cols) => items.map(item =>
    `<tr>${cols.map(c => `<td>${esc(item[c])}</td>`).join('')}</tr>`
  ).join('');
  const html = `<!doctype html><html><head><title>InlandGuide usage — ${stamp()}</title><style>
    body { font-family: Segoe UI, Arial, sans-serif; color: #1e293b; margin: 32px; }
    h1 { font-size: 20px; color: #002D72; margin: 0; }
    .sub { color: #64748b; font-size: 12px; margin: 4px 0 24px; }
    h2 { font-size: 14px; color: #002D72; margin: 24px 0 8px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    th { text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; color: #64748b; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px 6px 0; }
    .cards { display: flex; gap: 24px; margin-bottom: 8px; }
    .card .n { font-size: 22px; font-weight: 600; color: #002D72; }
    .card .l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    @media print { body { margin: 12mm; } }
  </style></head><body>
    <h1>Inland Cutoff Guide — usage report</h1>
    <p class="sub">Exported ${new Date().toLocaleString()} · times shown in UTC</p>
    <div class="cards">
      <div class="card"><div class="n">${esc(data.summary.total)}</div><div class="l">Total calcs</div></div>
      <div class="card"><div class="n">${esc(data.summary.uniqueUsers)}</div><div class="l">Unique users</div></div>
      <div class="card"><div class="n">${esc(data.summary.last30)}</div><div class="l">Last 30 days</div></div>
      <div class="card"><div class="n">${esc(data.summary.today)}</div><div class="l">Today</div></div>
    </div>
    <h2>Calculations per day (last 30 days)</h2>
    <table><thead><tr><th>Day</th><th>Calculations</th></tr></thead><tbody>${rows(data.daily, ['day', 'count'])}</tbody></table>
    <h2>Most active users</h2>
    <table><thead><tr><th>Name</th><th>Calculations</th><th>Last used</th></tr></thead><tbody>${rows(data.byUser, ['user_name', 'count', 'last_used'])}</tbody></table>
    <h2>Recent activity</h2>
    <table><thead><tr><th>Time</th><th>Name</th><th>ERD</th><th>LRD</th></tr></thead><tbody>${rows(data.recent, ['ts', 'user_name', 'erd', 'lrd'])}</tbody></table>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) return; // popup blocked — nothing else to do
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give the new window a beat to lay out before the print dialog opens.
  setTimeout(() => w.print(), 250);
}

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

  const exportBtn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#002D72] shadow-sm transition hover:border-[#EB6608] hover:text-[#EB6608] dark:border-slate-500 dark:bg-slate-700 dark:text-white';

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => exportExcel(data)} className={exportBtn}>
          ⬇ Excel
        </button>
        <button type="button" onClick={() => exportPdf(data)} className={exportBtn}>
          ⬇ PDF
        </button>
      </div>
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
