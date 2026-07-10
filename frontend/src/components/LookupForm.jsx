import React, { useState, useEffect, useRef } from 'react';
import { getPortGroups, getCities, getSSY, calculateERDLRD, cityLabel, getRailTerminal, getRail } from '../lib/cutoff';
import { hlLogo } from '../assets/hlLogo';

// Type-to-filter dropdown (combobox). Filters options by substring as you type;
// pick with mouse, Arrow keys + Enter, and close on Esc / click-away. Keeps a
// hidden underlying value so the calculation still gets the exact port/city.
function Combobox({ value, onSelect, options, placeholder, disabled, required }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  // Keep the box showing the current selection unless the user is actively typing.
  useEffect(() => { setQuery(selectedLabel); }, [selectedLabel]);

  // Untouched (query still equals the selection) shows the full list; typing filters.
  const typing = query !== selectedLabel;
  const q = query.trim().toLowerCase();
  const filtered = (typing && q)
    ? options.filter(o => o.label.toLowerCase().includes(q))
    : options;

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery(selectedLabel); // discard any half-typed text
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [selectedLabel]);

  const choose = (opt) => { onSelect(opt.value); setQuery(opt.label); setOpen(false); };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        disabled={disabled}
        required={required && !value}
        value={query}
        placeholder={placeholder}
        onFocus={(e) => { setOpen(true); setActiveIdx(0); e.target.select(); }}
        onBlur={() => { setOpen(false); setQuery(selectedLabel); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIdx(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter' && open && filtered[activeIdx]) { e.preventDefault(); choose(filtered[activeIdx]); }
          else if (e.key === 'Escape') { setOpen(false); setQuery(selectedLabel); }
        }}
        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-slate-400 bg-white disabled:bg-slate-100"
      />
      {open && !disabled && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg text-left">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">No matches</li>
          )}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              className={`px-3 py-2 text-sm cursor-pointer ${i === activeIdx ? 'bg-slate-100' : ''} ${o.value === value ? 'font-semibold text-[#002D72]' : 'text-slate-800'}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
    mdy: String(month).padStart(2, '0') + '/' + String(day).padStart(2, '0') + '/' + year,
    display: d.toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric' })
  };
}

// ISO date (2026-08-06) -> short "M/D" (8/6), no leading zeros. Falls back to input.
function formatShortDate(iso) {
  if (!iso) return '';
  const parts = String(iso).split('-');
  if (parts.length !== 3) return iso;
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!m || !d) return iso;
  return `${m}/${d}`;
}

const EMPTY_FORM = { pol: '', startCity: '', ssy: '', portCutDate: '', reefer: 'N' };

export default function LookupForm() {
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  // Raw text the user types for the date; starts empty on load.
  const [dateInput, setDateInput] = useState('');
  const resolvedDate = parseFlexibleDate(dateInput);

  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  // All options are derived locally from the bundled data snapshot — no network.
  const portGroups = getPortGroups();
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

  // On click-away / tab-off, expand the box to the full date so it's never confusing.
  const handleDateBlur = () => {
    const parsed = parseFlexibleDate(dateInput);
    if (parsed) setDateInput(parsed.mdy);
  };

  const handleReset = () => {
    setFormData({ ...EMPTY_FORM });
    setDateInput('');
    setResults(null);
    setError('');
    setCopyMessage('');
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
    // Normalize the box to the full date on submit (covers pressing Enter).
    if (resolvedDate) setDateInput(resolvedDate.mdy);

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

    // Compact top line: "City, ST    RR / terminal" (4 spaces between the two).
    const railTerminal = getRailTerminal(results.rampMC, formData.startCity);
    const cityST = formData.startCity;
    const topPlain = `${cityST}    ${railTerminal}`;
    const topHtml = `<b>${cityST}</b>&nbsp;&nbsp;&nbsp;&nbsp;<b>${railTerminal}</b>`;
    const divider = '─'.repeat(Math.max(24, topPlain.length));
    // Port Cut Date shown short (e.g. 8/6) to match the rest of the result.
    const cutDate = formatShortDate(formData.portCutDate);

    // Plain-text version (used when pasting into plain fields like Notepad).
    // Ramp Cuts (ERD/LRD) come first — they're the important part — then the port info.
    // Two trailing blank lines leave the cursor ready to type a goodbye.
    const text = [
      topPlain,
      divider,
      'Ramp Cuts:',
      `- Earliest Return Date (ERD): ${results.erd}`,
      `- Latest Return Date (LRD): ${results.lrd}`,
      `- Ramp Cut Time: ${results.rampCutTime}`,
      '',
      `Port of Loading: ${formData.pol}`,
      `Port Cut Date: ${cutDate}`,
      divider,
      '',
      ''
    ].join('\n');

    // Rich version (Outlook/Gmail/Teams/Salesforce) — serif to match their system,
    // <br> so line breaks survive rich editors, and bolds the city, rail name, and
    // the ERD/LRD dates. Two trailing <br> for the goodbye line.
    const html = `<div style="font-family:'Times New Roman',Times,serif">` + [
      topHtml,
      divider,
      'Ramp Cuts:',
      `- Earliest Return Date (ERD): <b>${results.erd}</b>`,
      `- Latest Return Date (LRD): <b>${results.lrd}</b>`,
      `- Ramp Cut Time: <b>${results.rampCutTime}</b>`,
      '',
      `Port of Loading: <b>${formData.pol}</b>`,
      `Port Cut Date: <b>${cutDate}</b>`,
      divider,
      '',
      ''
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

  // "Pretty note" — copies the styled RESULTS card as rich HTML so it pastes with
  // colors/formatting into Outlook/Gmail. Uses table + inline styles for email
  // client compatibility. Omits the small ramp-MC (loccode) line by design.
  const handleCopyPretty = async () => {
    if (!results) return;
    const rail = getRail(results.rampMC, formData.startCity); // abbreviation (NS, UP, …)
    // Title = "City, ST    RR / terminal" (4 spaces). Wraps + auto-shrinks to fit.
    const cityST = formData.startCity || '';
    const railTerminal = getRailTerminal(results.rampMC, formData.startCity);
    const titlePlain = `${cityST}    ${railTerminal}`;
    const titleHtml = `${cityST}&nbsp;&nbsp;&nbsp;&nbsp;${railTerminal}`;
    // Long labels get a smaller title so the box never overflows.
    const titleSize = titlePlain.length > 34 ? 15 : (titlePlain.length > 26 ? 17 : 20);

    const rowLabel = 'padding:9px 16px;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#000000;text-align:left';
    const rowVal = 'padding:9px 16px;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#000000;text-align:right';
    const row = (label, value, valStyle = rowVal) =>
      `<tr><td style="${rowLabel}">${label}</td><td style="${valStyle}">${value}</td></tr>`;

    // HL-orange box, thick HL-blue border, "Ramp Cut in <City>" title, and the
    // Hapag-Lloyd logo tucked in the lower-right on a transparent background.
    const html =
      `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#EB6608;border:5px solid #002D72;border-radius:12px;max-width:470px">` +
        `<tr><td style="padding:22px">` +
          `<div style="font-family:Arial,sans-serif;color:#ffffff;font-size:${titleSize}px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;text-shadow:0 2px 5px rgba(0,0,0,0.45);border-bottom:2px solid #ffffff;padding-bottom:8px;margin-bottom:16px">${titleHtml}</div>` +
          `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;background:#ffffff;border-radius:8px">` +
            row('Earliest Return Date (ERD)', results.erd) +
            row('Latest Return Date (LRD)', results.lrd) +
            row('Ramp Cut Time', results.rampCutTime) +
            row('Rail', `<span style="color:#002D72;font-weight:800;font-size:16px;font-variant:small-caps">${rail}</span>`,
              'padding:9px 16px;font-family:Arial,sans-serif;text-align:right') +
          `</table>` +
          `<div style="text-align:right;margin-top:14px"><img src="${hlLogo}" width="150" alt="Hapag-Lloyd" style="display:inline-block;width:150px;height:auto" /></div>` +
        `</td></tr>` +
      `</table>`;

    // Plain-text fallback mirrors the box (for plain editors / Notepad).
    const text = [
      titlePlain,
      `Earliest Return Date (ERD): ${results.erd}`,
      `Latest Return Date (LRD): ${results.lrd}`,
      `Ramp Cut Time: ${results.rampCutTime}`,
      `Rail: ${rail}`,
      '',
      ''
    ].join('\n');

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
      setCopyMessage('✓ Pretty note copied!');
      setTimeout(() => setCopyMessage(''), 2000);
    } catch {
      setCopyMessage('Failed to copy');
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-[#EB6608] rounded-lg border border-[#EB6608] shadow-sm p-6">
        <h2 className="text-xl font-extrabold tracking-wide uppercase mb-4 pb-2 border-b-2 border-white/60 text-white txt-shadow-heavy">Rail Cutoff Lookup</h2>
        
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">Port of Loading *</label>
            <Combobox
              value={formData.pol}
              onSelect={(value) => handleChange({ target: { name: 'pol', value } })}
              options={portGroups.flatMap(g => g.ports.map(p => ({ value: p, label: p })))}
              placeholder="Type or select a port…"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">Start City (Rail Ramp) *</label>
            <Combobox
              value={formData.startCity}
              onSelect={(value) => handleChange({ target: { name: 'startCity', value } })}
              options={cities.map(c => ({ value: c, label: cityLabel(c) }))}
              placeholder={formData.pol ? 'Type or select a city…' : 'Select a port first'}
              disabled={!formData.pol}
              required
            />
          </div>

          {showSSYField && (
            <div>
              <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">SSY (Service Code) *</label>
              <select
                name="ssy"
                value={formData.ssy}
                onChange={handleChange}
                required
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-slate-400 bg-white disabled:bg-slate-100"
              >
                <option value="">-- Select SSY --</option>
                {ssyList.map(ssy => (
                  <option key={ssy} value={ssy}>{ssy}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">Port Cut Date *</label>
            <input
              type="text"
              inputMode="numeric"
              value={dateInput}
              onChange={handleDateInput}
              onFocus={(e) => e.target.select()}
              onBlur={handleDateBlur}
              placeholder="Day (9), or 8/9, or 8/9/2026"
              required
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            />
            {resolvedDate && (
              <p className="text-xs mt-1 text-white/90">
                → <span className="font-semibold">{resolvedDate.display}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">Reefer Service</label>
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
                <span className="text-white txt-shadow-soft">Dry Container</span>
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
                <span className="text-white txt-shadow-soft">Reefer</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-4 px-4 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition font-semibold shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
          >
            Calculate Cutoff Dates
          </button>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-1 text-sm bg-white/10 border border-white/50 text-white rounded-full hover:bg-white/20 transition font-semibold shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
            >
              Reset
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </form>
      </div>

      <div>
        {results ? (
          <div className="bg-[#002D72] rounded-lg border border-[#002D72] shadow-sm p-6">
            <h3 className="text-xl font-extrabold tracking-wide uppercase mb-4 pb-2 border-b-2 border-[#EB6608] text-white txt-shadow-heavy">Results</h3>

            <div className="bg-white divide-y divide-slate-200 rounded-lg px-4 shadow-md">
              <ResultCard label="Earliest Return Date (ERD)" value={results.erd} />
              <ResultCard label="Latest Return Date (LRD)" value={results.lrd} />
              <ResultCard label="Ramp Cut Time" value={results.rampCutTime} />
              <RailCard railroad={getRail(results.rampMC, formData.startCity)} rampMC={results.rampMC} />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleCopyResults}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-[#EB6608] text-white rounded-full hover:bg-[#cf5a07] transition font-semibold shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
              >
                📝 Copy Kind Text Note
              </button>
              <button
                onClick={handleCopyPretty}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-white/10 border border-white/40 text-white rounded-full hover:bg-white/20 transition font-semibold shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
              >
                ✨ Copy Pretty Note
              </button>
            </div>

            {copyMessage && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-center text-sm">
                {copyMessage}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#002D72] border border-[#002D72] rounded-lg p-6 text-center shadow-sm">
            <p className="text-white">Fill in the form and click Calculate to see results</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2">
      <p className="text-sm font-bold text-black">{label}</p>
      <p className="text-base font-bold text-black">{value || 'N/A'}</p>
    </div>
  );
}

// Rail row: railroad name big, ramp MC code small underneath.
function RailCard({ railroad, rampMC }) {
  const rail = railroad || rampMC || 'N/A';
  return (
    <div className="flex items-center justify-between py-2">
      <p className="text-sm font-bold text-black">Rail</p>
      <div className="text-right leading-tight">
        <p className="text-lg font-extrabold text-[#002D72] smallcaps">{rail}</p>
        {railroad && rampMC && (
          <p className="text-xs font-semibold text-slate-500 mt-0.5">{rampMC}</p>
        )}
      </div>
    </div>
  );
}