import React, { useState, useEffect } from 'react';
import { getPortGroups, getCities, getSSY, calculateERDLRD, cityLabel, getRailTerminal, getRail } from '../lib/cutoff';
import { hlLogo } from '../assets/hlLogo';

// Non-functional site chrome to match hapag-lloyd.com for a management mockup.
const TOP_NAV = ['Home', 'Services & Information', 'Our Company', 'Online Business Suite'];
const SIDE_MENU = [
  ['📰', 'NEWS Portal'],
  ['📍', 'Offices & Local Info', true],
  ['🧭', 'Routes & Trades', true],
  ['🔗', 'Gemini Cooperation'],
  ['🏭', 'Cargo & Fleet', true],
  ['🚂', 'Inland', true],
  ['📱', 'Mobile App'],
  ['📶', 'API, EDI & Portals', true],
  ['🛡️', 'Security Information', true],
  ['⚙️', 'Operational Updates'],
  ['🤝', 'Procurement & Supplier', true],
];
const SUB_TABS = ['USA', 'Export', 'Import', 'Vendor', 'Local News'];

const fmtShort = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
};

export default function HlMockup() {
  const portGroups = getPortGroups();
  const [pol, setPol] = useState('');
  const [startCity, setStartCity] = useState('');
  const [ssy, setSsy] = useState('');
  const [date, setDate] = useState('');
  const [office, setOffice] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const cities = pol ? getCities(pol) : [];
  const ssyList = (pol && startCity) ? getSSY(pol, startCity) : [];
  const showSSY = ssyList.length > 1;

  useEffect(() => {
    const list = (pol && startCity) ? getSSY(pol, startCity) : [];
    setSsy(list.length === 1 ? list[0] : '');
  }, [pol, startCity]);

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!pol || !startCity || !date) {
      setError('Please choose a Port of Loading, Start City, and Port Cut Date.');
      return;
    }
    const res = calculateERDLRD(pol, startCity, ssy || ssyList[0] || 'ALL', date, 'N');
    if (res.error) { setError(res.error); return; }
    const rail = getRail(res.rampMC, startCity);
    const railTerminal = getRailTerminal(res.rampMC, startCity);
    const text = [
      `${startCity}    ${railTerminal}`,
      `Earliest Return Date (ERD): ${res.erd}`,
      `Latest Return Date (LRD): ${res.lrd}`,
      `Ramp Cut Time: ${res.rampCutTime}`,
      `Rail: ${rail}`,
      '',
      `Port of Loading: ${pol}`,
      `Port Cut Date: ${fmtShort(date)}`,
    ].join('\n');
    setResult({ text });
    setCopied(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  const field = 'w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EB6608]/40 focus:border-[#EB6608]';

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans">
      {/* Top white header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-200">
        <div className="flex items-center gap-5">
          <img src={hlLogo} alt="Hapag-Lloyd" className="h-7 w-auto" />
          <span className="text-[#EB6608] font-semibold text-sm hidden sm:inline">Your cargo, our promise.</span>
        </div>
        <button className="bg-[#EB6608] text-white text-sm font-semibold px-4 py-2 rounded flex items-center gap-1.5" disabled>👤 Log in</button>
      </header>

      {/* Dark secondary nav */}
      <nav className="bg-[#2f3e4e] text-white text-sm">
        <div className="flex items-center justify-between px-6">
          <div className="flex">
            {TOP_NAV.map((t, i) => (
              <span key={t} className={`px-4 py-3 ${i === 1 ? 'font-semibold border-b-2 border-[#EB6608]' : 'text-white/85'}`}>{t}</span>
            ))}
          </div>
          <div className="flex items-center gap-4 text-white/85"><span>🔍</span><span>EN</span></div>
        </div>
      </nav>

      <div className="flex">
        {/* Left sidebar */}
        <aside className="w-60 bg-[#26313c] text-white/85 shrink-0 hidden md:block">
          {SIDE_MENU.map(([icon, label, caret], i) => (
            <div key={label} className={`flex items-center justify-between px-4 py-3 text-sm border-l-4 ${i === 1 ? 'border-[#EB6608] bg-white/5 text-white' : 'border-transparent'}`}>
              <span className="flex items-center gap-3"><span className="opacity-90">{icon}</span>{label}</span>
              {caret && <span className="opacity-60 text-xs">▾</span>}
            </div>
          ))}
        </aside>

        {/* Main content */}
        <main className="flex-1 bg-[#eef1f4] px-4 sm:px-10 py-8">
          <div className="bg-white max-w-4xl mx-auto p-6 sm:p-10 shadow-sm">
            {/* Sub tabs */}
            <div className="flex gap-6 border-b border-slate-200 pb-3 mb-6 text-sm">
              {SUB_TABS.map((t, i) => (
                <span key={t} className={i === 0 ? 'font-semibold text-slate-800' : 'text-slate-500'}>{t}</span>
              ))}
            </div>

            <h1 className="text-2xl font-bold text-slate-800 mb-4">ERD Cutoff Request</h1>
            <p className="text-sm text-slate-600 mb-2">
              Disclaimer: ERD/LRD and cut off times provided via this application are valid at time of request and are subject to change without notice.
            </p>
            <p className="text-sm text-[#EB6608] mb-8">
              This tool is intended for bookings with an export rail move within USA. For cross-border and other bookings no data will populate in the result.
            </p>

            <form onSubmit={submit} className="max-w-2xl">
              {/* Tool inputs replace the Shipment No. line */}
              <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 mb-1"><span className="text-red-600">*</span> Port of Loading</label>
                <select className={field} value={pol} onChange={(e) => { setPol(e.target.value); setStartCity(''); }}>
                  <option value="">— Select a port —</option>
                  {portGroups.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.ports.map(p => <option key={p} value={p}>{p}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 mb-1"><span className="text-red-600">*</span> Start City (Rail Ramp)</label>
                <select className={field} value={startCity} onChange={(e) => setStartCity(e.target.value)} disabled={!pol}>
                  <option value="">{pol ? '— Select a city —' : 'Select a port first'}</option>
                  {cities.map(c => <option key={c} value={c}>{cityLabel(c)}</option>)}
                </select>
              </div>

              {showSSY && (
                <div className="mb-6">
                  <label className="block text-sm font-bold text-slate-700 mb-1"><span className="text-red-600">*</span> SSY (Service Code)</label>
                  <select className={field} value={ssy} onChange={(e) => setSsy(e.target.value)}>
                    <option value="">— Select SSY —</option>
                    {ssyList.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div className="mb-8">
                <label className="block text-sm font-bold text-slate-700 mb-1"><span className="text-red-600">*</span> Port Cut Date</label>
                <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              {/* Office radios — decorative, matches the real form */}
              <div className="mb-8">
                <p className="text-sm font-bold text-slate-700 mb-2"><span className="text-red-600">*</span> Hapag-Lloyd Office:</p>
                <label className="flex items-center gap-2 text-sm text-slate-700 mb-1">
                  <input type="radio" name="office" checked={office === 'atl'} onChange={() => setOffice('atl')} /> Hapag-Lloyd Atlanta Office (HAPAG 150)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="radio" name="office" checked={office === 'lgb'} onChange={() => setOffice('lgb')} /> Hapag-Lloyd Long Beach Office (HAPAG 11)
                </label>
              </div>

              {/* Email — left as-is, not usable */}
              <div className="mb-8">
                <label className="block text-sm font-bold text-slate-700 mb-1"><span className="text-red-600">*</span> Email Address</label>
                <input type="email" className={`${field} bg-slate-100`} placeholder="name@example.com" disabled />
              </div>

              {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

              <button type="submit" className="bg-[#EB6608] hover:bg-[#cf5a07] text-white font-semibold px-6 py-2.5 rounded">Submit</button>
            </form>
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-[#dfe4ea] text-slate-600 text-xs px-6 sm:px-10 py-10">
        <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-5 gap-6">
          <div><p className="font-bold text-slate-700 mb-2">Services &amp; Information</p>Local Offices<br />NEWS Portal<br />Service Explorer<br />Containers</div>
          <div><p className="font-bold text-slate-700 mb-2">Online Business Suite</p>Quotes<br />Schedule<br />Booking<br />Tracking</div>
          <div><p className="font-bold text-slate-700 mb-2">Career</p>Working Ashore<br />Working on Board<br />Vacancies<br />Apprenticeship</div>
          <div><p className="font-bold text-slate-700 mb-2">Press</p>Press Releases<br />Photos &amp; Videos</div>
          <div><p className="font-bold text-slate-700 mb-2">Please find us on</p><span className="text-lg">📘 ▶️ 📷 🎵 in 💬</span></div>
        </div>
      </footer>

      {/* Result popup — blurred backdrop, plain text, copy button */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4" onClick={() => setResult(null)}>
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setResult(null)} aria-label="Close" className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
            <h3 className="text-lg font-bold text-[#002D72] mb-3">ERD / LRD Result</h3>
            <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed bg-slate-50 border border-slate-200 rounded p-4 text-slate-800">{result.text}</pre>
            <div className="mt-4 flex justify-end">
              <button onClick={copy} className="bg-[#EB6608] hover:bg-[#cf5a07] text-white font-semibold px-4 py-2 rounded">
                {copied ? '✓ Copied' : 'Copy to Clipboard'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back to the live tool (not part of the mockup chrome) */}
      <a href="#" className="fixed bottom-4 left-4 z-40 bg-[#002D72] text-white text-xs font-semibold px-3 py-2 rounded-full shadow-lg hover:bg-[#01245c]">← Back to the live tool</a>
    </div>
  );
}
