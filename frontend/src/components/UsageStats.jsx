// Usage dashboard for the managers hub. Fetches /api/stats with the manager
// passphrase (same guard pattern as /api/refresh and /api/requests).

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

const stamp = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Estimated savings vs. the old downtime-prone guide. Every assumption lives
// here — tune a number and the dashboard banner plus both exports recompute.
// Basis: ~60 staff; the previous online tool went down ~4×/month.
// ---------------------------------------------------------------------------
const SAVINGS = {
  ratePerHour: 45,       // fully loaded ops labor, $/hr
  minutesPerCalc: 4,     // manual lookup/verify time each calculation replaces
  outagesPerMonth: 4,    // how often the old tool went down
  staffPerOutage: 20,    // people scrambling per outage
  minutesPerOutage: 20,  // scramble time per person
  callsPerMonth: 240,    // 60 staff fielding ~4 cutoff calls each
  minutesPerCall: 6,
  incidentsPerMonth: 2,  // wrong/outdated-guide corrections avoided
  costPerIncident: 250,  // labor + recovery per incident
};
const SAVINGS_FIXED_MONTHLY =
  (SAVINGS.outagesPerMonth * SAVINGS.staffPerOutage * SAVINGS.minutesPerOutage / 60) * SAVINGS.ratePerHour +
  (SAVINGS.callsPerMonth * SAVINGS.minutesPerCall / 60) * SAVINGS.ratePerHour +
  SAVINGS.incidentsPerMonth * SAVINGS.costPerIncident;

// Period + annualized savings. A single-user view counts only that person's
// lookup time — the shared avoidance buckets belong to the whole team.
function estimateSavings(summary, filter) {
  const days = filter.rangeDays === 'all'
    ? Math.max(1, (Date.now() - new Date(String(summary.firstTs || '').replace(' ', 'T') + 'Z').getTime()) / 86400000)
    : Number(filter.rangeDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  const perCalc = (SAVINGS.minutesPerCalc / 60) * SAVINGS.ratePerHour;
  const lookupPart = summary.total * perCalc;
  const fixedPart = filter.user ? 0 : SAVINGS_FIXED_MONTHLY * (days / 30.44);
  const dailyRate = summary.total / days;
  const annual = dailyRate * 365 * perCalc + (filter.user ? 0 : SAVINGS_FIXED_MONTHLY * 12);
  return { period: Math.round(lookupPart + fixedPart), annual: Math.round(annual) };
}

const money = (n) => '$' + Math.round(n).toLocaleString();

// One sheet per section of the report, mirroring the on-screen dashboard.
function exportExcel(data) {
  const filterUser = data.filter.user || 'All users';
  const savings = estimateSavings(data.summary, data.filter);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Inland Cutoff Guide — usage report', ''],
    ['Exported (UTC)', new Date().toISOString().slice(0, 16).replace('T', ' ')],
    ['Period', data.filter.periodLabel],
    ['User', filterUser],
    [],
    ['Calculations', data.summary.total],
    ['Active users', data.summary.uniqueUsers],
    ['Calculations per user', data.summary.avgPerUser],
    ['Calculations per active weekday', data.summary.avgPerActiveDay],
    ['Repeat users', data.summary.returningUsers],
    ['Repeat-user rate', `${data.summary.repeatRate}%`],
    ...(savings ? [
      [],
      ['Estimated savings (period)', money(savings.period)],
      ['Estimated savings (annualized)', money(savings.annual)],
      ['Savings basis', `${SAVINGS.minutesPerCalc} min saved/calc at $${SAVINGS.ratePerHour}/hr loaded; avoided: ${SAVINGS.outagesPerMonth} outages/mo, ~${SAVINGS.callsPerMonth} cutoff calls/mo, ${SAVINGS.incidentsPerMonth} wrong-guide corrections/mo`],
    ] : []),
  ]), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.daily.map(d => ({ 'Day (UTC)': d.day, 'Calculations': d.count }))
  ), 'Daily trend');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.byUser.map(u => ({ 'Name': u.user_name, 'Email': u.email || '', 'Calculations': u.count, 'Last used (UTC)': u.last_used }))
  ), 'By user');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.recent.map(r => ({ 'Time (UTC)': r.ts, 'Name': r.user_name, 'Email': r.email || '', 'Booking': r.booking || '', 'ERD': r.erd || '', 'LRD': r.lrd || '' }))
  ), 'Recent activity');
  XLSX.writeFile(wb, `InlandGuide-usage-${stamp()}.xlsx`);
}

// PDF via the browser's print-to-PDF: opens a formatted report window with the
// print dialog ready — the user picks "Save as PDF". No PDF library needed.
function exportPdf(data) {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const filterUser = data.filter.user || 'All users';
  const savings = estimateSavings(data.summary, data.filter);
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
    <p class="sub">${esc(data.filter.periodLabel)} · ${esc(filterUser)} · exported ${new Date().toLocaleString()} · times shown in UTC</p>
    <div class="cards">
      <div class="card"><div class="n">${esc(data.summary.total)}</div><div class="l">Calculations</div></div>
      <div class="card"><div class="n">${esc(data.summary.uniqueUsers)}</div><div class="l">Active users</div></div>
      <div class="card"><div class="n">${esc(data.summary.avgPerUser)}</div><div class="l">Calcs / user</div></div>
      <div class="card"><div class="n">${esc(data.summary.repeatRate)}%</div><div class="l">Repeat-user rate</div></div>
      ${savings ? `<div class="card"><div class="n" style="color:#047857">${esc(money(savings.period))}</div><div class="l">Est. savings (period)</div></div>
      <div class="card"><div class="n" style="color:#047857">${esc(money(savings.annual))}</div><div class="l">Est. savings / year</div></div>` : ''}
    </div>
    ${savings ? `<p class="sub">Savings basis: ${SAVINGS.minutesPerCalc} min saved per calculation at $${SAVINGS.ratePerHour}/hr loaded labor; avoided vs the old guide: ${SAVINGS.outagesPerMonth} outages/mo, ~${SAVINGS.callsPerMonth} cutoff calls/mo, ${SAVINGS.incidentsPerMonth} wrong-guide corrections/mo.</p>` : ''}
    <h2>Calculations per day (${esc(data.filter.periodLabel.toLowerCase())})</h2>
    <table><thead><tr><th>Day</th><th>Calculations</th></tr></thead><tbody>${rows(data.daily, ['day', 'count'])}</tbody></table>
    <h2>Most active users</h2>
    <table><thead><tr><th>Name</th><th>Email</th><th>Calculations</th><th>Last used</th></tr></thead><tbody>${rows(data.byUser, ['user_name', 'email', 'count', 'last_used'])}</tbody></table>
    <h2>Recent activity</h2>
    <table><thead><tr><th>Time</th><th>Name</th><th>Email</th><th>Booking</th><th>ERD</th><th>LRD</th></tr></thead><tbody>${rows(data.recent, ['ts', 'user_name', 'email', 'booking', 'erd', 'lrd'])}</tbody></table>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) return; // popup blocked — nothing else to do
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give the new window a beat to lay out before the print dialog opens.
  setTimeout(() => w.print(), 250);
}

function StatCard({ label, value, detail }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-700">
      <div className="text-2xl font-semibold text-[#002D72] dark:text-white">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-300">{label}</div>
      {detail && <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-300">{detail}</div>}
    </div>
  );
}

// Weekends are skipped unless they actually saw activity — the guide is a
// business-week tool, and empty Sat/Sun bars just dilute the trend.
function fillDailyGaps(daily, rangeDays) {
  if (!rangeDays || rangeDays === 'all') return daily;
  const counts = new Map(daily.map((item) => [item.day, item.count]));
  const result = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = Number(rangeDays) - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - offset);
    const key = day.toISOString().slice(0, 10);
    const count = counts.get(key) || 0;
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    if (weekend && !count) continue;
    result.push({ day: key, count });
  }
  return result;
}

function shortDay(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function TrendBars({ daily, rangeDays }) {
  if (!daily.length) return <p className="text-sm text-slate-500 dark:text-slate-300">No activity yet.</p>;
  const series = fillDailyGaps(daily, rangeDays);
  const max = Math.max(...series.map((d) => d.count), 1);
  const middle = series[Math.floor((series.length - 1) / 2)]?.day;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 pb-2 pt-3 dark:border-slate-600 dark:bg-slate-700/50">
      <div className="flex h-24 items-end gap-1 border-b border-slate-300 dark:border-slate-500">
        {series.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className={`w-full rounded-t transition-colors ${d.count ? 'min-h-[4px] bg-[#0a4b9b] group-hover:bg-[#EB6608]' : 'h-px bg-slate-300 dark:bg-slate-600'}`}
              style={d.count ? { height: `${(d.count / max) * 100}%` } : undefined}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
              {shortDay(d.day)}: {d.count}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400 dark:text-slate-300">
        <span>{shortDay(series[0].day)}</span>
        {series.length > 2 && <span>{shortDay(middle)}</span>}
        {series.length > 1 && <span>{shortDay(series[series.length - 1].day)}</span>}
      </div>
    </div>
  );
}

const TH = 'py-2 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-300';

export default function UsageStats({ passphrase, onAuthExpired }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [rangeDays, setRangeDays] = useState(30);
  const [selectedUser, setSelectedUser] = useState('');
  const [loading, setLoading] = useState(true);
  // Most-active-users column sort. Clicking a header toggles its direction;
  // switching columns starts from that column's natural direction.
  const [sort, setSort] = useState({ key: 'count', dir: -1 });
  const sortBy = (key, naturalDir) => setSort(current =>
    current.key === key ? { key, dir: -current.dir } : { key, dir: naturalDir }
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch('/api/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase, rangeDays, user: selectedUser }),
    })
      .then(async (r) => {
        if (r.status === 401) { if (!cancelled) onAuthExpired?.(); return null; }
        const body = await r.json().catch(() => ({}));
        if (!r.ok || !body.ok) throw new Error(body.error || `Stats service returned HTTP ${r.status}.`);
        return body;
      })
      .then((body) => { if (!cancelled && body) setData(body); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Could not load usage stats.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // onAuthExpired is intentionally not a dependency — parents pass inline
    // arrows, and refetching on every parent render would hammer the API.
  }, [passphrase, rangeDays, selectedUser]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!data) return <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-300">Loading usage stats…</p>;

  const { summary, daily, byUser, recent, users, filter } = data;
  const changeDetail = summary.changePct === null
    ? 'All recorded activity'
    : `${summary.changePct >= 0 ? '+' : ''}${summary.changePct}% vs prior period`;

  const exportBtn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#002D72] shadow-sm transition hover:border-[#EB6608] hover:text-[#EB6608] dark:border-slate-500 dark:bg-slate-700 dark:text-white';
  const filterClass = 'min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[#0a4b9b] focus:outline-none focus:ring-2 focus:ring-[#0a4b9b]/20 dark:border-slate-500 dark:bg-slate-700 dark:text-white';

  return (
    <div className={`space-y-5 transition-opacity ${loading ? 'opacity-70' : ''}`} aria-busy={loading}>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/50">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[9rem] flex-1">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Period</span>
            <select
              value={rangeDays}
              onChange={(event) => setRangeDays(event.target.value === 'all' ? 'all' : Number(event.target.value))}
              className={`${filterClass} w-full`}
            >
              <option value={1}>Today</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </label>
          <label className="min-w-[12rem] flex-[1.4]">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">User</span>
            <select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)} className={`${filterClass} w-full`}>
              <option value="">All users</option>
              {users.map((user) => (
                <option key={user.ident} value={user.ident}>
                  {user.user_name}{user.email ? ` — ${user.email}` : ''}
                </option>
              ))}
            </select>
          </label>
          {(rangeDays !== 30 || selectedUser) && (
            <button
              type="button"
              onClick={() => { setRangeDays(30); setSelectedUser(''); }}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-[#0a4b9b] hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-slate-700"
            >
              Reset
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => exportExcel(data)} className={exportBtn}>
              ↓ Excel
            </button>
            <button type="button" onClick={() => exportPdf(data)} className={exportBtn}>
              ↓ PDF
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">
          Showing {filter.periodLabel.toLowerCase()} · {filter.user || 'all users'}{loading ? ' · updating…' : ''}
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Calculations" value={summary.total} detail={changeDetail} />
        <StatCard label="Active users" value={summary.uniqueUsers} detail={`${summary.avgPerUser} calcs / user`} />
        <StatCard label="Daily use" value={summary.avgPerActiveDay} detail={`${summary.activeDays} active ${summary.activeDays === 1 ? 'weekday' : 'weekdays'}`} />
        <StatCard label="Repeat users" value={summary.returningUsers} detail={`${summary.repeatRate}% used it more than once`} />
      </div>

      {(() => {
        const savings = estimateSavings(summary, filter);
        if (!savings) return null;
        return (
          <div className="rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 dark:border-emerald-700 dark:from-emerald-900/25 dark:to-teal-900/25">
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
              <div>
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{money(savings.period)}</div>
                <div className="text-[11px] uppercase tracking-wide text-emerald-800/70 dark:text-emerald-200/70">Estimated savings · {filter.periodLabel.toLowerCase()}</div>
              </div>
              <div>
                <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">≈ {money(savings.annual)} / year</div>
                <div className="text-[11px] uppercase tracking-wide text-emerald-800/70 dark:text-emerald-200/70">Annualized at the current pace</div>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-emerald-900/70 dark:text-emerald-100/60">
              {filter.user
                ? `Lookup time only for this user (${SAVINGS.minutesPerCalc} min saved per calculation at $${SAVINGS.ratePerHour}/hr loaded).`
                : `Vs. the old downtime-prone guide: ${SAVINGS.minutesPerCalc} min saved per calculation, ${SAVINGS.outagesPerMonth} outage scrambles/mo avoided, ~${SAVINGS.callsPerMonth} cutoff calls/mo avoided, and ${SAVINGS.incidentsPerMonth} wrong-guide corrections/mo — at $${SAVINGS.ratePerHour}/hr loaded labor.`}
            </p>
          </div>
        );
      })()}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-[#002D72] dark:text-white">Calculations per day</h3>
        <TrendBars daily={daily} rangeDays={filter.rangeDays} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-[#002D72] dark:text-white">Most active users</h3>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-600">
              {[
                { key: 'name', label: 'Name', naturalDir: 1 },
                { key: 'count', label: 'Calcs', naturalDir: -1 },
                { key: 'last', label: 'Last used (UTC)', naturalDir: -1 },
              ].map(col => (
                <th key={col.key} className={TH}>
                  <button
                    type="button"
                    onClick={() => sortBy(col.key, col.naturalDir)}
                    className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-[#002D72] dark:hover:text-white"
                    title={`Sort by ${col.label}`}
                  >
                    {col.label}
                    <span aria-hidden="true" className="text-[9px]">{sort.key === col.key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...byUser].sort((a, b) => {
              if (sort.key === 'name') return sort.dir * a.user_name.localeCompare(b.user_name, undefined, { sensitivity: 'base' });
              if (sort.key === 'count') return sort.dir * (a.count - b.count);
              return sort.dir * String(a.last_used).localeCompare(String(b.last_used));
            }).map((u) => (
              <tr key={u.ident || u.user_name} className="border-b border-slate-100 dark:border-slate-700">
                <td className="py-2 text-slate-900 dark:text-white">
                  {u.user_name}
                  {u.email && <span className="block text-[11px] text-slate-400 dark:text-slate-400">{u.email}</span>}
                </td>
                <td className="py-2 text-slate-700 dark:text-slate-200">{u.count}</td>
                <td className="py-2 text-slate-500 dark:text-slate-300">{u.last_used}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-[#002D72] dark:text-white">Recent activity</h3>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-600">
              <th className={TH}>Time (UTC)</th>
              <th className={TH}>Name</th>
              <th className={TH}>Booking</th>
              <th className={TH}>ERD</th>
              <th className={TH}>LRD</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 dark:border-slate-700">
                <td className="py-2 text-slate-500 dark:text-slate-300">{r.ts}</td>
                <td className="py-2 text-slate-900 dark:text-white">
                  {r.user_name}
                  {r.email && <span className="block text-[11px] text-slate-400 dark:text-slate-400">{r.email}</span>}
                </td>
                <td className="py-2 font-mono text-xs text-slate-700 dark:text-slate-200">{r.booking || '—'}</td>
                <td className="py-2 text-slate-700 dark:text-slate-200">{r.erd || '—'}</td>
                <td className="py-2 text-slate-700 dark:text-slate-200">{r.lrd || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
