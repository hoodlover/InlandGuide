import React, { useState, useEffect, useRef } from 'react';
import { getPortGroups, getPortSearchDetails, getCities, getCitySearchDetails, getPortServices, calculateERDLRD, cityLabel, getRailTerminal, getRail, cityNeedsExtraDays, defaultExtraDays, getTerminals, getTerminalOptions, ssyForTerminal, terminalLabel, terminalForSSY, getPortNote, masterUpdatedAt } from '../lib/cutoff';
import { IDT_TITLE, formatStamp } from '../lib/idt';
import trainMark from '../assets/idt-train-mark.webp';
import { hlLogo } from '../assets/hlLogo';
import { hlLogoOrange } from '../assets/hlLogoOrange';
import Combobox from './Combobox';
import { SalesforceIcon, OutlookIcon, TeamsIcon, TextIcon } from './BrandIcons';
import ObieThinking from './ObieThinking';
import { renderPasteCardImage } from '../lib/pasteCardImage';
import { getUserName } from './NamePrompt';

// Fire-and-forget usage log — must never affect the calculator, so errors are
// swallowed (also covers the offline double-click build, where /api is absent).
// Re-submitting the same result within 15s (double-clicks, nervous re-clicks)
// is suppressed so user error doesn't inflate the stats; a genuinely different
// lookup still logs immediately.
const DUPLICATE_WINDOW_MS = 15 * 1000;
let lastLogged = { key: '', at: 0 };

function logUsage(res) {
  const key = `${res.erd}|${res.lrd}`;
  const now = Date.now();
  if (key === lastLogged.key && now - lastLogged.at < DUPLICATE_WINDOW_MS) return;
  lastLogged = { key, at: now };
  try {
    fetch('/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: getUserName(), erd: res.erd, lrd: res.lrd }),
    }).catch(() => {});
  } catch { /* ignore */ }
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

const EMPTY_FORM = { pol: '', startCity: '', ssy: '', terminal: '', portCutDate: '', reefer: 'N', extraDays: '5' };

// Canadian ports are served by the separate published-schedule tool (the Canada
// Rail Ramp Cuts tab), not the US calculator. Listing all four here lets a user
// pick one from the US port dropdown and get handed off to the right tool with
// the port preselected. Codes map to the CPKC/CN schedule slugs.
const CANADA_PORTS = [
  { code: 'CAMTR', slug: 'montreal' },
  { code: 'CAVAN', slug: 'metro-vancouver' },
  { code: 'CAPRR', slug: 'prince-rupert' },
  { code: 'CASJB', slug: 'saint-john' },
];
const CANADA_SLUG = Object.fromEntries(CANADA_PORTS.map(p => [p.code, p.slug]));

// Today, as { iso: 'YYYY-MM-DD', mdy: 'M/D/YYYY' } — used to prefill Port Cut Date.
function today() {
  const d = new Date();
  const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { iso, mdy: `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` };
}

// The city picker sometimes includes the rail terminal to distinguish two ramps
// in the same city (for example "COLUMBUS, OH Discovery Park"). The copied card
// already prints "NS / Discovery Park", so remove that repeated suffix there
// while leaving the authoritative picker value untouched.
function cityForResultTitle(city, railTerminal) {
  const terminal = String(railTerminal || '').split('/').slice(1).join('/').trim();
  if (!terminal) return city;
  const cityText = String(city || '');
  const suffix = ` ${terminal}`;
  return cityText.toUpperCase().endsWith(suffix.toUpperCase())
    ? cityText.slice(0, -suffix.length).trim()
    : cityText;
}

function railTerminalForResultTitle(city, railTerminal) {
  const parts = String(railTerminal || '').split('/').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return railTerminal;
  const cityName = String(city || '').split(',')[0].trim();
  const normalized = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized(parts.slice(1).join(' / ')) === normalized(cityName) ? parts[0] : railTerminal;
}

// Outlook is sensitive to inline-image line boxes. A fixed-height presentation
// cell gives the baked-orange logo enough top room and prevents it being clipped.
function outlookLogoBlock() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#EB6608" style="border-collapse:collapse;background-color:#EB6608;margin-top:12px">` +
    `<tr><td height="34" valign="middle" align="right" bgcolor="#EB6608" style="height:34px;padding:6px 0 4px;line-height:24px;mso-line-height-rule:exactly">` +
      `<img src="${hlLogoOrange}" width="150" height="24" alt="Hapag-Lloyd" style="display:block;width:150px;height:24px;max-height:24px;border:0;outline:none;text-decoration:none;margin-left:auto" />` +
    `</td></tr></table>`;
}

export default function LookupForm({ onCanadaPort }) {
  const [formData, setFormData] = useState(() => ({ ...EMPTY_FORM, portCutDate: today().iso }));
  const resultsRef = useRef(null);

  // Date box prefilled to today so users can just tweak the day.
  const [dateInput, setDateInput] = useState(() => today().mdy);
  const resolvedDate = parseFlexibleDate(dateInput);

  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [pasteProof, setPasteProof] = useState(null);

  useEffect(() => {
    if (!results || !window.matchMedia('(max-width: 767px)').matches) return undefined;
    const frame = window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [results]);

  // All options are derived locally from the bundled data snapshot — no network.
  const portGroups = getPortGroups();
  const cities = formData.pol ? getCities(formData.pol) : [];
  const ssyList = formData.pol ? getPortServices(formData.pol) : [];
  const allPol = ssyList.length === 1 && ssyList[0] === 'ALL';
  const requiresSSY = ssyList.length > 0 && !allPol;
  // PORTSERVICES decides whether a choice is required. PORTMC then decides
  // whether that choice is presented as friendly terminals or raw SSY codes.
  const terminals = formData.pol && requiresSSY ? getTerminals(formData.pol) : null;
  const showSSYField = requiresSSY && !terminals;
  // Loading terminal to show in the result: for terminal ports it's the chosen
  // terminal; for SSY ports it's the terminal the chosen service code maps to.
  // Include the POL so the terminal is never shown without its port context.
  const selTerminalName = allPol
    ? 'ALL'
    : (terminals
      ? (formData.terminal ? terminalLabel(formData.terminal) : '')
      : terminalForSSY(formData.pol, formData.ssy));
  const selTerminalLabel = selTerminalName
    ? (selTerminalName === 'ALL' ? formData.pol : `${formData.pol} / ${selTerminalName}`)
    : '';

  // Auto-select a sole POL service (normally ALL); explicit lists require a pick.
  useEffect(() => {
    const list = formData.pol ? getPortServices(formData.pol) : [];
    setFormData(prev => ({ ...prev, ssy: list.length === 1 ? list[0] : '' }));
  }, [formData.pol]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Canadian port picked here → hand off to the Canada Rail Ramp tab.
    if (name === 'pol' && CANADA_SLUG[value]) { onCanadaPort(CANADA_SLUG[value]); return; }
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      // Reset downstream picks when an upstream selection changes.
      if (name === 'pol') { next.startCity = ''; next.ssy = ''; next.terminal = ''; }
      // SSY/terminal choices are POL-level, so selecting a city must preserve a
      // choice the user may already have made immediately after selecting POL.
      if (name === 'startCity') { next.extraDays = defaultExtraDays(value); }
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

  // Calendar picker → keep the text box and the resolved ISO date in sync.
  const handleDatePick = (e) => {
    const iso = e.target.value; // "yyyy-mm-dd" (or "" when cleared)
    setFormData(prev => ({ ...prev, portCutDate: iso }));
    if (iso) {
      const [y, m, d] = iso.split('-');
      setDateInput(`${Number(m)}/${Number(d)}/${y}`);
    } else {
      setDateInput('');
    }
  };

  const handleReset = () => {
    setFormData({ ...EMPTY_FORM, portCutDate: today().iso });
    setDateInput(today().mdy);
    setResults(null);
    setError('');
    setCopyMessage('');
    setPasteProof(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setResults(null);
    setCopyMessage('');
    setPasteProof(null);

    if (!formData.portCutDate) {
      setError('Enter a valid Port Cut Date — e.g. 9, or 8/9, or 8/9/2026');
      return;
    }
    if (terminals && !formData.terminal) {
      setError('Please choose a Terminal.');
      return;
    }
    // Normalize the box to the full date on submit (covers pressing Enter).
    if (resolvedDate) setDateInput(resolvedDate.mdy);

    // Terminal ports resolve the SSY from the chosen terminal (which selects the
    // right transit lane for functional ports; a no-op for info-only ports).
    const ssyArg = terminals
      ? ssyForTerminal(formData.pol, formData.startCity, formData.terminal)
      : formData.ssy;
    const res = calculateERDLRD(
      formData.pol, formData.startCity, ssyArg, formData.portCutDate, formData.reefer,
      cityNeedsExtraDays(formData.startCity) ? formData.extraDays : 0
    );
    if (res.error) {
      setError(res.error);
    } else {
      setResults(res);
      logUsage(res);
    }
  };

  const handleCopyResults = async () => {
    if (!results) return;

    // Compact top line: "City, ST    RR / terminal" (4 spaces between the two).
    const railTerminal = getRailTerminal(results.rampMC, formData.startCity);
    const cityST = cityForResultTitle(formData.startCity, railTerminal);
    const topPlain = `${cityST}    ${railTerminal}`;
    const topHtml = `<b>${cityST}</b>&nbsp;&nbsp;&nbsp;&nbsp;<b>${railTerminal}</b>`;
    const divider = '─'.repeat(Math.max(24, topPlain.length));
    // Port Cut Date shown short (e.g. 8/6) to match the rest of the result.
    const cutDate = formatShortDate(formData.portCutDate);
    const polTerm = selTerminalLabel;

    // Plain-text version (used when pasting into plain fields like Notepad).
    // Ramp Cuts (ERD/LRD) come first — they're the important part — then the port info.
    // Two trailing blank lines leave the cursor ready to type a goodbye.
    const text = [
      'Here are the ramp cuts you requested:',
      '',
      topPlain,
      divider,
      'Ramp Cuts:',
      `- Earliest Return Date (ERD): ${results.erd}`,
      `- Latest Return Date (LRD): ${results.lrd}`,
      `- Ramp Cut Time: ${results.rampCutTime}`,
      '',
      `Port of Loading: ${formData.pol}`,
      polTerm ? `POL Terminal: ${polTerm}` : null,
      `Port Cut Date: ${cutDate}`,
      divider,
      '',
      ''
    ].filter(v => v !== null).join('\n');

    // Rich version (Outlook/Gmail/Teams/Salesforce) — serif to match their system,
    // <br> so line breaks survive rich editors, and bolds the city, rail name, and
    // the ERD/LRD dates. Two trailing <br> for the goodbye line.
    const html = `<div style="font-family:'Times New Roman',Times,serif">` + [
      'Here are the ramp cuts you requested:',
      '',
      topHtml,
      divider,
      'Ramp Cuts:',
      `- Earliest Return Date (ERD): <b>${results.erd}</b>`,
      `- Latest Return Date (LRD): <b>${results.lrd}</b>`,
      `- Ramp Cut Time: <b>${results.rampCutTime}</b>`,
      '',
      `Port of Loading: <b>${formData.pol}</b>`,
      polTerm ? `POL Terminal: <b>${polTerm}</b>` : null,
      `Port Cut Date: <b>${cutDate}</b>`,
      divider,
      '',
      ''
    ].filter(v => v !== null).join('<br>') + `</div>`;

    setPasteProof({
      heading: 'Plain copy ready to paste anywhere',
      format: 'text',
      content: text,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage('✓ Plain copy ready!');
      setTimeout(() => setCopyMessage(''), 2000);
    } catch {
      setCopyMessage('Failed to copy');
    }
  };

  const writeClip = async (text, html, okMsg, proofHeading) => {
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
      setCopyMessage(okMsg);
      setPasteProof({ heading: proofHeading, format: 'html', content: html });
      setTimeout(() => setCopyMessage(''), 2000);
    } catch {
      setCopyMessage('Failed to copy');
    }
  };

  // Shared title + plain-text body for both card variants. Title = "City, ST    RR
  // / terminal"; a smaller size for long titles so the box never overflows.
  const cardParts = () => {
    const fullRailTerminal = getRailTerminal(results.rampMC, formData.startCity);
    const cityST = cityForResultTitle(formData.startCity, fullRailTerminal);
    const railTerminal = railTerminalForResultTitle(cityST, fullRailTerminal);
    const titlePlain = `${cityST}    ${railTerminal}`;
    const titleHtml = `${cityST}&nbsp;&nbsp;&nbsp;&nbsp;${railTerminal}`;
    const titleSize = titlePlain.length > 34 ? 15 : (titlePlain.length > 26 ? 17 : 20);
    const polTerm = selTerminalLabel;
    const text = [
      'Here are the ramp cuts you requested:', '',
      titlePlain,
      `Earliest Return Date (ERD): ${results.erd}`,
      `Latest Return Date (LRD): ${results.lrd}`,
      `Ramp Cut Time: ${results.rampCutTime}`,
      polTerm ? `POL Terminal: ${polTerm}` : null,
      '', ''
    ].filter(v => v !== null).join('\n');
    return { titlePlain, titleHtml, titleSize, titleLeft: cityST, titleRight: railTerminal, text, polTerm };
  };

  // Salesforce card — div layout (SF shows no dashed cell guides; transparent
  // logo sits clean on the orange). Rail omitted (title already shows it).
  const handleCopySalesforce = () => {
    if (!results) return;
    const { titleHtml, titleSize, text, polTerm } = cardParts();
    const rowStyle = 'padding:9px 16px;border-bottom:1px solid #e2e8f0;overflow:hidden';
    const rowStyleLast = 'padding:9px 16px;overflow:hidden';
    const labelStyle = 'float:left;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#000000';
    const valStyle = 'float:right;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#000000';
    const row = (label, value, rs = rowStyle) =>
      `<div style="${rs}"><span style="${labelStyle}">${label}</span><span style="${valStyle}">${value}</span></div>`;
    const html =
      `Here are the ramp cuts you requested:<br><br>` +
      `<div style="background:#EB6608;border:5px solid #002D72;border-radius:12px;max-width:470px;padding:22px;font-family:Arial,sans-serif">` +
        `<div style="color:#ffffff;font-size:${titleSize}px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;text-shadow:0 2px 5px rgba(0,0,0,0.45);border-bottom:2px solid #ffffff;padding-bottom:8px;margin-bottom:16px">${titleHtml}</div>` +
        `<div style="background:#ffffff;border-radius:8px;overflow:hidden">` +
          row('Earliest Return Date (ERD)', results.erd) +
          row('Latest Return Date (LRD)', results.lrd) +
          row('Ramp Cut Time', results.rampCutTime, polTerm ? rowStyle : rowStyleLast) +
          (polTerm ? row('POL Terminal', polTerm, rowStyleLast) : '') +
        `</div>` +
        `<div style="text-align:right;margin-top:14px"><img src="${hlLogo}" width="150" alt="Hapag-Lloyd" style="display:inline-block;width:150px;height:auto" /></div>` +
      `</div>` +
      `<br><br>`;
    writeClip(text, html, '✓ Copied for Salesforce!', 'Ready to paste into Salesforce');
  };

  // Outlook & Teams card — table layout with bgcolor attrs (they strip div
  // float/background) and the orange-baked logo (avoids a white box).
  const handleCopyOutlook = () => {
    if (!results) return;
    const { titleHtml, titleSize, text, polTerm } = cardParts();
    const rowLabel = 'padding:9px 16px;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#000000;text-align:left';
    const rowVal = 'padding:9px 16px;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#000000;text-align:right';
    const row = (label, value) => `<tr><td bgcolor="#ffffff" style="${rowLabel}">${label}</td><td bgcolor="#ffffff" style="${rowVal}">${value}</td></tr>`;
    const html =
      `Here are the ramp cuts you requested:<br><br>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#EB6608" style="border-collapse:separate;background-color:#EB6608;border:5px solid #002D72;border-radius:12px;max-width:470px">` +
        `<tr><td bgcolor="#EB6608" style="background-color:#EB6608;padding:22px">` +
          `<div style="font-family:Arial,sans-serif;color:#ffffff;font-size:${titleSize}px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;border-bottom:2px solid #ffffff;padding-bottom:8px;margin-bottom:16px">${titleHtml}</div>` +
          `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff" style="border-collapse:separate;background-color:#ffffff;border-radius:8px">` +
            row('Earliest Return Date (ERD)', results.erd) +
            row('Latest Return Date (LRD)', results.lrd) +
            row('Ramp Cut Time', results.rampCutTime) +
            (polTerm ? row('POL Terminal', polTerm) : '') +
          `</table>` +
          outlookLogoBlock() +
        `</td></tr>` +
      `</table>` +
      `<br><br>`;
    writeClip(text, html, '✓ Copied for Outlook!', 'Ready to paste into Outlook');
  };

  // Teams strips pasted HTML styling and prefers text when an item exposes both
  // text and image flavors, so publish the finished branded card as image-only.
  const handleCopyImage = async () => {
    if (!results) return;
    const { titlePlain, titleLeft, titleRight, text, polTerm } = cardParts();
    const rows = [
      ['Earliest Return Date (ERD)', results.erd],
      ['Latest Return Date (LRD)', results.lrd],
      ['Ramp Cut Time', results.rampCutTime],
      ...(polTerm ? [['POL Terminal', polTerm]] : []),
    ];
    try {
      const image = await renderPasteCardImage({ title: titlePlain, titleLeft, titleRight, rows, logo: hlLogo });
      setPasteProof({ heading: 'Image copy ready to paste anywhere', format: 'image', content: image.dataUrl });
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'image/png': image.blob,
        })]);
      } else {
        await navigator.clipboard.writeText(text);
        setPasteProof({ heading: 'Image copy unavailable — plain copy ready', format: 'text', content: text });
      }
      setCopyMessage('✓ Image copy ready!');
      setTimeout(() => setCopyMessage(''), 2000);
    } catch {
      setCopyMessage('Failed to copy');
    }
  };

  return (
    <div className="grid items-start md:grid-cols-2 gap-6">
      <div className="self-start bg-[#EB6608] rounded-lg border border-[#EB6608] shadow-sm p-6">
        <div className="mb-4 border-b-2 border-white/60 pb-2 text-white">
          <h2 className="whitespace-nowrap text-lg font-extrabold uppercase tracking-wide txt-shadow-heavy sm:text-xl">Inland Guide Rail Tool</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">Port of Loading *</label>
            <Combobox
              value={formData.pol}
              onSelect={(value) => handleChange({ target: { name: 'pol', value } })}
              options={[
                // US ports first (no header), then all four Canada ports (which
                // route to the Canada tab), then any remaining groups (Mexico…).
                ...(portGroups.find(g => g.label === 'United States')?.ports || []).map(p => ({ value: p, label: p, search: getPortSearchDetails(p) })),
                { header: 'Canada Ports' },
                ...CANADA_PORTS.map(p => ({ value: p.code, label: p.code, search: getPortSearchDetails(p.code) })),
                ...portGroups
                  .filter(g => g.label !== 'United States' && g.label !== 'Canada')
                  .flatMap(g => [{ header: `${g.label} Ports` }, ...g.ports.map(p => ({ value: p, label: p, search: getPortSearchDetails(p) }))]),
              ]}
              placeholder="Type or select a port…"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">Start City (Rail Ramp) *</label>
            <Combobox
              value={formData.startCity}
              onSelect={(value) => handleChange({ target: { name: 'startCity', value } })}
              options={cities.map(c => ({ value: c, label: cityLabel(c), search: getCitySearchDetails(formData.pol, c) }))}
              placeholder={formData.pol ? 'Type or select a city…' : 'Select a port first'}
              disabled={!formData.pol}
              required
            />
          </div>

          {cityNeedsExtraDays(formData.startCity) && (
            <div>
              <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">Extra Transit Days *</label>
              <select
                name="extraDays"
                value={formData.extraDays}
                onChange={handleChange}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-slate-400 bg-white"
              >
                <option value="0">None</option>
                {[3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}

          {terminals && (
            <div>
              <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">SSY / Terminal (POL) *</label>
              <Combobox
                value={formData.terminal}
                onSelect={(value) => handleChange({ target: { name: 'terminal', value } })}
                options={getTerminalOptions(formData.pol)}
                placeholder="Type your SSY or the terminal…"
                required
              />
            </div>
          )}

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
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={dateInput}
                onChange={handleDateInput}
                onFocus={(e) => e.target.select()}
                onBlur={handleDateBlur}
                placeholder="Day (9), or 8/9, or 8/9/2026"
                required
                className="w-full min-w-0 pl-3 pr-11 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <span className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-700" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M16 3v4M8 3v4M3 11h18" />
                </svg>
              </span>
              <input
                type="date"
                aria-label="Pick date from calendar"
                title="Pick from calendar"
                value={formData.portCutDate || ''}
                onChange={handleDatePick}
                className="absolute inset-y-0 right-0 w-10 cursor-pointer opacity-0"
              />
            </div>
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

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-1 text-sm bg-white/10 border border-white/50 text-white rounded-full hover:bg-white/20 transition font-semibold shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
            >
              Reset
            </button>
            {masterUpdatedAt && (
              <span className="text-[11px] text-white/85 txt-shadow-soft ml-1">rail data updated: <span className="font-semibold">{formatStamp(masterUpdatedAt)}</span></span>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </form>

        <img src={trainMark} alt="" title={IDT_TITLE} className="mt-5 h-40 w-full rounded-xl object-cover shadow-[0_8px_18px_rgba(0,0,0,0.35)]" />
      </div>

      <div ref={resultsRef} className={results ? 'pb-32 md:pb-0' : ''}>
        {results ? (
          <div className="bg-[#002D72] rounded-lg border border-[#002D72] shadow-sm p-6">
            <h3 className="text-xl font-extrabold tracking-wide uppercase mb-4 pb-2 border-b-2 border-[#EB6608] text-white txt-shadow-heavy">{pasteProof ? 'Ready to Paste' : 'Results'}</h3>

            {pasteProof ? (
              <section className="rounded-lg border-2 border-emerald-400 bg-white p-4 shadow-lg" aria-live="polite">
                <p className="text-base font-extrabold text-emerald-700">✓ {pasteProof.heading}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">This is exactly what was copied:</p>
                <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white p-3 text-slate-900">
                  {pasteProof.format === 'image' ? (
                    <img src={pasteProof.content} alt="Paste card image preview" className="block max-w-full h-auto" />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{pasteProof.content}</pre>
                  )}
                </div>
              </section>
            ) : (
              <>
                <div className="bg-white divide-y divide-slate-200 rounded-lg px-4 shadow-md">
                  <ResultCard label="Earliest Return Date (ERD)" value={results.erd} />
                  <ResultCard label="Latest Return Date (LRD)" value={results.lrd} />
                  <ResultCard label="Ramp Cut Time" value={results.rampCutTime} />
                  <RailCard railroad={getRail(results.rampMC, formData.startCity)} rampMC={results.rampMC} />
                  {selTerminalLabel && <ResultCard label="POL Terminal" value={selTerminalLabel} />}
                </div>
                {getPortNote(formData.pol) && (
                  <p className="mt-3 text-xs italic text-amber-200/90 leading-snug">⚠ {getPortNote(formData.pol)}</p>
                )}
              </>
            )}

            <p className="mt-4 text-center text-xs text-white/70">Choose a copy style — then paste with Ctrl+V.</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
              <button
                onClick={handleCopyImage}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-sm bg-white text-slate-800 rounded-full hover:bg-slate-100 transition font-semibold shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
              >
                <span aria-hidden="true">✨</span> Image
              </button>
              <button
                onClick={handleCopyResults}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-sm bg-white/10 border border-white/40 text-white rounded-full hover:bg-white/20 transition font-semibold shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
              >
                <TextIcon /> Plain
              </button>
            </div>

            {copyMessage && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-center text-sm">
                {copyMessage}
              </div>
            )}

          </div>
        ) : (
          <div className="rounded-lg p-6 h-full flex flex-col items-center justify-center min-h-[32rem]">
            <ObieThinking />
            <p className="text-slate-500 dark:text-slate-300 text-sm mt-6 text-center">Fill in the form and click Calculate to see results</p>
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
