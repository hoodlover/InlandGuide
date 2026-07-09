import React, { useState, useEffect } from 'react';
import { getPorts, getCities, getSSY, calculateERDLRD } from '../lib/cutoff';

function todayLocalISO() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

// Flexible date entry:  "9" = 9th of THIS month · "8/9" = Aug 9 · "8/9/26" or "8/9/2026" = full.
function parseFlexibleDate(input) {
  const s = String(input).trim();
  if (!s) return null;
  const parts = s.split(/[/\-.]/).map(p => p.trim()).filter(Boolean);
  const now = new Date();
  let month, day, year;
  if (parts.length === 1) { month = now.getMonth() + 1; day = Number(parts[0]); year = now.getFullYear(); }
  else if (parts.length === 2) { month = Number(parts[0]); day = Number(parts[1]); year = now.getFullYear(); }
  else if (parts.length === 3) { month = Number(parts[0]); day = Number(parts[1]); year = Number(parts[2]); if (year < 100) year += 2000; }
  else return null;
  if (![month, day, year].every(Number.isInteger)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null; // reject overflow like 2/30
  return {
    iso: year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
    display: d.toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric' })
  };
}

export default function LookupForm() {
  const [formData, setFormData] = useState({
    pol: '',
    startCity: '',
    ssy: '',
    portCutDate: todayLocalISO(),
    reefer: 'N'
  });

  // Raw text the user types for the date; defaults to today's day number.
  const [dateInput, setDateInput] = useState(() => String(new Date().getDate()));
  const resolvedDate = parseFlexibleDate(dateInput);

  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  // All options are derived locally from the bundled data snapshot — no network.
  const ports = getPorts();
  const cities = formData.pol ? getCities(formData.pol) : [];
  const ssyList = (formData.pol && formData.startCity) ? getSSY(formData.pol, formData.startCity) : [];
  // Only prompt for an SSY when the port+city actually offers more than one.
  const showSSYField = ssyList.length > 1;

  // Auto-select when there's nothing to choose (e.g. only "ALL"); otherwise make the user pick.
  useEffect(() => {
    const list = (formData.pol && formData.startCity) ? getSSY(formData.pol, formData.startCity) : [];
    setFormData(prev => ({ ...prev, ssy: list.length === 1 ? list[0] : '' }));
  }, [formData.pol, formData.startCity]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      // Reset downstream picks when an upstream selection changes.
      if (name === 'pol') { next.startCity = ''; next.ssy = ''; }
      if (name === 'startCity') { next.ssy = ''; }
      return next;
    });
  };

  const handleDateInput = (e) => {
    const v = e.target.value;
    setDateInput(v);
    const parsed = parseFlexibleDate(v);
    setFormData(prev => ({ ...prev, portCutDate: parsed ? parsed.iso : '' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setResults(null);
    setCopyMessage('');

    if (!formData.portCutDate) {
      setError('Enter a valid Port Cut Date — e.g. 9, or 8/9, or 8/9/2026');
      return;
    }

    const res = calculateERDLRD(
      formData.pol, formData.startCity, formData.ssy, formData.portCutDate, formData.reefer
    );
    if (res.error) {
      setError(res.error);
    } else {
      setResults(res);
    }
  };

  const handleCopyResults = async () => {
    if (!results) return;

    const railroad = results.railroad || results.rampMC;
    const header = `Here are the ramp cuts in ${formData.startCity} on ${railroad}`;
    // Divider tracks the header length, trimmed a bit so it doesn't overshoot the text.
    const divider = '─'.repeat(Math.max(0, header.length - 14));

    // Plain-text version (used when pasting into plain fields like Notepad).
    const text = `${header}
${divider}
Port of Loading: ${formData.pol}
Port Cut Date: ${formData.portCutDate}

Ramp Cuts:
- Earliest Return Date (ERD): ${results.erd}
- Latest Return Date (LRD): ${results.lrd}
- Ramp Cut Time: ${results.rampCutTime}
${divider}`;

    // Rich version (Outlook/Gmail/Teams/Salesforce) — uses <br> so line breaks survive
    // rich-text editors that collapse plain newlines; bolds the Port and Port Cut Date.
    const html = `<div style="font-family:Arial,sans-serif">` + [
      header,
      divider,
      `Port of Loading: <b>${formData.pol}</b>`,
      `Port Cut Date: <b>${formData.portCutDate}</b>`,
      '',
      'Ramp Cuts:',
      `- Earliest Return Date (ERD): ${results.erd}`,
      `- Latest Return Date (LRD): ${results.lrd}`,
      `- Ramp Cut Time: ${results.rampCutTime}`,
      divider
    ].join('<br>') + `</div>`;

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' })
          })
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopyMessage('✓ Copied to clipboard!');
      setTimeout(() => setCopyMessage(''), 2000);
    } catch {
      setCopyMessage('Failed to copy');
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div className="bg-[#EB6608] rounded-lg border border-[#EB6608] shadow-sm p-8">
        <h2 className="text-2xl font-extrabold tracking-wide uppercase mb-6 pb-3 border-b-2 border-white/60 text-white">Rail Cutoff Lookup</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-white mb-2">Port of Loading *</label>
            <select
              name="pol"
              value={formData.pol}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-slate-400 bg-white"
            >
              <option value="">-- Select Port --</option>
              {ports.map(port => (
                <option key={port} value={port}>{port}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">Start City (Rail Ramp) *</label>
            <select
              name="startCity"
              value={formData.startCity}
              onChange={handleChange}
              required
              disabled={!formData.pol}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-slate-400 bg-white disabled:bg-slate-100"
            >
              <option value="">-- Select City --</option>
              {cities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          {showSSYField && (
            <div>
              <label className="block text-sm font-semibold text-white mb-2">SSY (Service Code) *</label>
              <select
                name="ssy"
                value={formData.ssy}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-slate-400 bg-white disabled:bg-slate-100"
              >
                <option value="">-- Select SSY --</option>
                {ssyList.map(ssy => (
                  <option key={ssy} value={ssy}>{ssy}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-white mb-2">Port Cut Date *</label>
            <input
              type="text"
              inputMode="numeric"
              value={dateInput}
              onChange={handleDateInput}
              onFocus={(e) => e.target.select()}
              placeholder="Day (9), or 8/9, or 8/9/2026"
              required
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            />
            <p className="text-xs mt-1 text-white/90">
              {resolvedDate
                ? <>→ <span className="font-semibold">{resolvedDate.display}</span></>
                : <span className="text-yellow-200">Type a day (9), or 8/9, or 8/9/2026</span>}
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">Reefer Service</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="reefer"
                  value="N"
                  checked={formData.reefer === 'N'}
                  onChange={handleChange}
                  className="mr-2"
                />
                <span className="text-white">Dry Container</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="reefer"
                  value="Y"
                  checked={formData.reefer === 'Y'}
                  onChange={handleChange}
                  className="mr-2"
                />
                <span className="text-white">Reefer</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-6 px-4 py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition font-semibold"
          >
            Calculate Cutoff Dates
          </button>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </form>
      </div>

      <div>
        {results ? (
          <div className="bg-[#002D72] rounded-lg border border-[#002D72] shadow-sm p-8">
            <h3 className="text-2xl font-extrabold tracking-wide uppercase mb-6 pb-3 border-b-2 border-[#EB6608] text-white">Results</h3>

            <div className="bg-white divide-y divide-slate-200 rounded-lg px-4 shadow-md">
              <ResultCard label="Earliest Return Date (ERD)" value={results.erd} />
              <ResultCard label="Latest Return Date (LRD)" value={results.lrd} />
              <ResultCard label="Ramp Cut Time" value={results.rampCutTime} />
              <ResultCard label="Ramp MC Code" value={results.rampMC} />
            </div>

            <button
              onClick={handleCopyResults}
              className="w-full mt-6 px-4 py-3 bg-[#EB6608] text-white rounded-lg hover:bg-[#cf5a07] transition font-semibold"
            >
              Copy to Clipboard
            </button>

            {copyMessage && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-center text-sm">
                {copyMessage}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#002D72] border border-[#002D72] rounded-lg p-8 text-center shadow-sm">
            <p className="text-white">Fill in the form and click Calculate to see results</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({ label, value }) {
  return (
    <div className="flex items-center justify-between py-3">
      <p className="text-sm font-bold text-black">{label}</p>
      <p className="text-lg font-bold text-black">{value || 'N/A'}</p>
    </div>
  );
}