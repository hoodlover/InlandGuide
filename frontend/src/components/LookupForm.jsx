import React, { useState, useEffect, useRef } from 'react';
import { getPortGroups, getPortSearchDetails, getCities, getCitySearchDetails, getPortServices, calculateERDLRD, cityLabel, getRailTerminal, getRail, cityNeedsExtraDays, defaultExtraDays, getTerminals, getTerminalOptions, ssyForTerminal, terminalLabel, terminalForSSY, getPortNote, masterUpdatedAt, portLabel } from '../lib/cutoff';
import { IDT_TITLE, formatStamp } from '../lib/idt';
import trainMark from '../assets/idt-train-mark.webp';
import { hlLogo } from '../assets/hlLogo';
import { hlLogoOrange } from '../assets/hlLogoOrange';
import Combobox from './Combobox';
import { SalesforceIcon, OutlookIcon, TeamsIcon, TextIcon } from './BrandIcons';
import ObieThinking, { SAMMIE_SURPRISE_EVENT } from './ObieThinking';
import railOperationsPhoto from '../assets/rail-operations-professional.jpg';
import { renderPasteCardImage } from '../lib/pasteCardImage';
import { cardTitleFloat, cardTitleTable } from '../lib/pasteCardHtml';
import { getUserName, getUserEmail } from './NamePrompt';

// Fire-and-forget usage log — must never affect the calculator, so errors are
// swallowed (also covers the offline double-click build, where /api is absent).
// Re-submitting the same result within 15s (double-clicks, nervous re-clicks)
// is suppressed so user error doesn't inflate the stats; a genuinely different
// lookup still logs immediately.
const DUPLICATE_WINDOW_MS = 15 * 1000;
let lastLogged = { key: '', at: 0 };
const RAIL_EMAIL_DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
let lastRailEmail = { key: '', at: 0 };

function logUsage(res, bookingNumber) {
  const key = `${res.erd}|${res.lrd}`;
  const now = Date.now();
  if (key === lastLogged.key && now - lastLogged.at < DUPLICATE_WINDOW_MS) return;
  lastLogged = { key, at: now };
  try {
    fetch('/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: getUserName(),
        userEmail: getUserEmail(),
        bookingNumber: String(bookingNumber || '').trim(),
        erd: res.erd,
        lrd: res.lrd,
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
}

// A booking number turns the normal calculator submit into a silent QS Rail
// submission. There is deliberately no second button or recipient-facing UI.
// Suppress nervous re-clicks of the exact same booking/result combination.
function emailRailCuts(bookingNumber, text) {
  const booking = String(bookingNumber || '').trim();
  if (!booking) return;
  const key = `${booking.toUpperCase()}|${text}`;
  const now = Date.now();
  if (key === lastRailEmail.key && now - lastRailEmail.at < RAIL_EMAIL_DUPLICATE_WINDOW_MS) return;
  lastRailEmail = { key, at: now };
  try {
    fetch('/api/rail-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingNumber: booking, text }),
    }).then(response => {
      if (!response.ok) console.warn('[rail-email] submission was not accepted');
    }).catch(() => {});
  } catch { /* the offline build has no API */ }
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

// Terminal names like "Maher Terminal" / "APM Terminal / 174" already sit under a
// row labelled Port, so the word "Terminal" is noise on screen. Drop it (and any
// separator or punctuation it leaves behind), and close up an internal slash so
// the name reads as one field ("APM/174") beside the dash-separated port and date.
// Display only — the authoritative names in terminal-info.json are untouched.
function stripTerminalWord(name) {
  const cleaned = String(name || '')
    .replace(/\bterminals?\b/gi, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+([,;])/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/^[\s/,;-]+|[\s/,;-]+$/g, '')
    .trim();
  return cleaned || String(name || '');
}

// A booking number is optional for calculation. When present, a successful
// submit also sends the plain-text result to the server-side rail email route.
const EMPTY_FORM = { pol: '', startCity: '', ssy: '', terminal: '', portCutDate: '', bookingNumber: '', reefer: 'N', extraDays: '5' };
// Temporarily keep this adjustment out of both the UI and the calculation.
// Set to true to restore the existing city-specific field and logic.
const EXTRA_TRANSIT_DAYS_ENABLED = false;

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

export default function LookupForm({ onCanadaPort, professional = false }) {
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
  // 'ALL' means the port has one terminal set, so there's nothing to name.
  const selTerminalName = allPol
    ? 'ALL'
    : (terminals
      ? (formData.terminal ? terminalLabel(formData.terminal) : '')
      : terminalForSSY(formData.pol, formData.ssy));
  // Both the results panel and every copied card close with one combined line:
  // "Port · Terminal · FCL Cut" → "USNYC · Maher · 7/27". Middle dots keep each
  // field distinct without reading like a hyphenated name or date range.
  // Label and value always match each other.
  const portCutTerminal = selTerminalName && selTerminalName !== 'ALL'
    ? stripTerminalWord(selTerminalName)
    : '';
  const portCutJoin = ' · ';
  const portCutLabel = ['Port', portCutTerminal && 'Terminal', 'FCL Cut']
    .filter(Boolean).join(portCutJoin);
  const portCutValue = [formData.pol, portCutTerminal, formatShortDate(formData.portCutDate)]
    .filter(Boolean).join(portCutJoin);
  const bookingNumber = String(formData.bookingNumber || '').trim();
  const bookingLabel = bookingNumber ? `Booking ${bookingNumber}` : '';

  const buildPlainResultsText = (result) => {
    const railTerminal = getRailTerminal(result.rampMC, formData.startCity);
    const cityST = cityForResultTitle(formData.startCity, railTerminal);
    const topPlain = `${cityST}    ${railTerminal}`;
    const divider = '─'.repeat(Math.max(24, topPlain.length));
    return [
      'Here are the ramp cuts you requested:',
      '',
      topPlain,
      divider,
      'Ramp Cuts:',
      `- Earliest Return Date (ERD): ${result.erd}`,
      `- Latest Return Date (LRD): ${result.lrd}`,
      `- Ramp Cut Time: ${result.rampCutTime}`,
      '',
      `${portCutLabel}: ${portCutValue}`,
      bookingLabel || null,
      divider,
      '',
      ''
    ].filter(value => value !== null).join('\n');
  };

  // Auto-select a sole POL service (normally ALL); explicit lists require a pick.
  useEffect(() => {
    const list = formData.pol ? getPortServices(formData.pol) : [];
    setFormData(prev => ({ ...prev, ssy: list.length === 1 ? list[0] : '' }));
  }, [formData.pol]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      // Reset downstream picks when an upstream selection changes.
      if (name === 'pol') { next.startCity = ''; next.ssy = ''; next.terminal = ''; }
      // SSY/terminal choices are POL-level, so selecting a city must preserve a
      // choice the user may already have made immediately after selecting POL.
      if (EXTRA_TRANSIT_DAYS_ENABLED && name === 'startCity') { next.extraDays = defaultExtraDays(value); }
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
    // Full hard reset: reload the page so every bit of state (form, results,
    // Obie, any lingering UI) returns to a pristine first-load condition.
    window.location.reload();
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
    // Normalize the box to the full date when the Calculate button submits.
    if (resolvedDate) setDateInput(resolvedDate.mdy);

    // Terminal ports resolve the SSY from the chosen terminal (which selects the
    // right transit lane for functional ports; a no-op for info-only ports).
    const ssyArg = terminals
      ? ssyForTerminal(formData.pol, formData.startCity, formData.terminal)
      : formData.ssy;
    const res = calculateERDLRD(
      formData.pol, formData.startCity, ssyArg, formData.portCutDate, formData.reefer,
      EXTRA_TRANSIT_DAYS_ENABLED && cityNeedsExtraDays(formData.startCity) ? formData.extraDays : 0
    );
    if (res.error) {
      setError(res.error);
    } else {
      setResults(res);
      logUsage(res, formData.bookingNumber);
      emailRailCuts(formData.bookingNumber, buildPlainResultsText(res));
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

    // Plain-text version (used when pasting into plain fields like Notepad).
    // Ramp Cuts (ERD/LRD) come first — they're the important part — then the port info.
    // Two trailing blank lines leave the cursor ready to type a goodbye.
    const text = buildPlainResultsText(results);

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
      `${portCutLabel}: <b>${portCutValue}</b>`,
      divider,
      '',
      ''
    ].filter(v => v !== null).join('<br>') + `</div>`;

    setPasteProof({
      heading: 'Text copy ready to paste anywhere',
      format: 'text',
      content: text,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage('✓ Text copy ready!');
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
    const titleSize = titlePlain.length > 34 ? 15 : (titlePlain.length > 26 ? 17 : 20);
    const text = [
      'Here are the ramp cuts you requested:', '',
      titlePlain,
      `Earliest Return Date (ERD): ${results.erd}`,
      `Latest Return Date (LRD): ${results.lrd}`,
      `Ramp Cut Time: ${results.rampCutTime}`,
      `${portCutLabel}: ${portCutValue}`,
      bookingLabel || null,
      '', ''
    ].filter(value => value !== null).join('\n');
    return { titlePlain, titleSize, titleLeft: cityST, titleRight: railTerminal, text };
  };

  // Salesforce card — div layout (SF shows no dashed cell guides; transparent
  // logo sits clean on the orange). Rail omitted (title already shows it).
  const handleCopySalesforce = () => {
    if (!results) return;
    const { titleLeft, titleRight, titleSize, text } = cardParts();
    const rowStyle = 'padding:9px 16px;border-bottom:1px solid #e2e8f0;overflow:hidden';
    const rowStyleLast = 'padding:9px 16px;overflow:hidden';
    const labelStyle = 'float:left;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#000000';
    const valStyle = 'float:right;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#000000';
    const row = (label, value, rs = rowStyle) =>
      `<div style="${rs}"><span style="${labelStyle}">${label}</span><span style="${valStyle}">${value}</span></div>`;
    const html =
      `Here are the ramp cuts you requested:<br><br>` +
      `<div style="background:#EB6608;border:5px solid #002D72;border-radius:12px;max-width:470px;padding:22px;font-family:Arial,sans-serif">` +
        cardTitleFloat(titleLeft, titleRight, titleSize) +
        `<div style="background:#ffffff;border-radius:8px;overflow:hidden">` +
          row('Earliest Return Date (ERD)', results.erd) +
          row('Latest Return Date (LRD)', results.lrd) +
          row('Ramp Cut Time', results.rampCutTime) +
          row(portCutLabel, portCutValue, rowStyleLast) +
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
    const { titleLeft, titleRight, titleSize, text } = cardParts();
    const rowLabel = 'padding:9px 16px;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#000000;text-align:left';
    const rowVal = 'padding:9px 16px;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#000000;text-align:right';
    const row = (label, value) => `<tr><td bgcolor="#ffffff" style="${rowLabel}">${label}</td><td bgcolor="#ffffff" style="${rowVal}">${value}</td></tr>`;
    const html =
      `Here are the ramp cuts you requested:<br><br>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#EB6608" style="border-collapse:separate;background-color:#EB6608;border:5px solid #002D72;border-radius:12px;max-width:470px">` +
        `<tr><td bgcolor="#EB6608" style="background-color:#EB6608;padding:22px">` +
          cardTitleTable(titleLeft, titleRight, titleSize) +
          `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff" style="border-collapse:separate;background-color:#ffffff;border-radius:8px">` +
            row('Earliest Return Date (ERD)', results.erd) +
            row('Latest Return Date (LRD)', results.lrd) +
            row('Ramp Cut Time', results.rampCutTime) +
            row(portCutLabel, portCutValue) +
          `</table>` +
          outlookLogoBlock() +
        `</td></tr>` +
      `</table>` +
      `<br><br>`;
    writeClip(text, html, '✓ Copied for Outlook!', 'Ready to paste into Outlook');
  };

  // Teams strips pasted HTML styling and prefers text when an item exposes both
  // text and image flavors, so publish the finished branded card as image-only.
  const handleCopyPretty = async () => {
    if (!results) return;
    const { titlePlain, titleLeft, titleRight, text } = cardParts();
    const rows = [
      ['Earliest Return Date (ERD)', results.erd],
      ['Latest Return Date (LRD)', results.lrd],
      ['Ramp Cut Time', results.rampCutTime],
      [portCutLabel, portCutValue],
    ];
    try {
      const image = await renderPasteCardImage({
        title: titlePlain,
        titleLeft,
        titleRight,
        rows,
        logo: hlLogo,
        footerLeft: bookingLabel,
      });
      setPasteProof({ heading: 'Formatted copy ready to paste anywhere', format: 'image', content: image.dataUrl });
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'image/png': image.blob,
        })]);
      } else {
        await navigator.clipboard.writeText(text);
        setPasteProof({ heading: 'Formatted copy unavailable — text copy ready', format: 'text', content: text });
      }
      setCopyMessage('✓ Formatted copy ready!');
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
                // The US calculator lists only United States and Mexico ports.
                // Canadian ports remain available on the Canada Rail Ramp tab.
                // Labels honor manager renames; the raw loccode stays in the
                // search text so typing "USNYC" still finds a renamed port.
                ...(portGroups.find(g => g.label === 'United States')?.ports || []).map(p => ({ value: p, label: portLabel(p), search: `${p} ${getPortSearchDetails(p)}` })),
                ...portGroups
                  .filter(g => g.label === 'Mexico')
                  .flatMap(g => [{ header: `${g.label} Ports` }, ...g.ports.map(p => ({ value: p, label: portLabel(p), search: `${p} ${getPortSearchDetails(p)}` }))]),
              ]}
              placeholder="Select the Port of Load first"
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

          {EXTRA_TRANSIT_DAYS_ENABLED && cityNeedsExtraDays(formData.startCity) && (
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                    e.preventDefault();
                    e.currentTarget.form?.elements.namedItem('bookingNumber')?.focus();
                  }
                }}
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
                tabIndex={-1}
                className="absolute inset-y-0 right-0 w-10 cursor-pointer opacity-0"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">Booking Number <span className="font-normal normal-case opacity-90">(optional but helpful)</span></label>
            <input
              type="text"
              name="bookingNumber"
              value={formData.bookingNumber}
              onChange={handleChange}
              autoComplete="off"
              placeholder="e.g. 86753090"
              className="w-full min-w-0 px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            />
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
              <span className="text-[11px] text-white/85 txt-shadow-soft ml-1">Rail data updated: <span className="font-semibold">{formatStamp(masterUpdatedAt)}</span></span>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </form>

        {!results && (
          <img
            src={trainMark}
            alt="Hapag-Lloyd train"
            title={IDT_TITLE}
            onDoubleClick={() => window.dispatchEvent(new Event(SAMMIE_SURPRISE_EVENT))}
            className="mt-5 h-40 w-full rounded-xl object-cover object-[center_35%] shadow-[0_8px_18px_rgba(0,0,0,0.35)]"
          />
        )}
      </div>

      <div ref={resultsRef} className={results ? 'pb-32 md:pb-0' : ''}>
        {results ? (
          <div className="bg-[#002D72] rounded-lg border border-[#002D72] shadow-sm p-6">
            <div className="mb-4 flex items-center justify-between gap-3 pb-2 border-b-2 border-[#EB6608]">
              <h3 className="text-xl font-extrabold tracking-wide uppercase text-white txt-shadow-heavy">{pasteProof ? 'Ready to Paste' : 'Results'}</h3>
              {/* Back to the result the copy came from. Only clears the paste proof —
                  no recalculation, so the lookup isn't counted twice in the stats. */}
              {pasteProof && (
                <button
                  type="button"
                  onClick={() => setPasteProof(null)}
                  className="shrink-0 whitespace-nowrap rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/20 shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
                >
                  ← Results
                </button>
              )}
            </div>

            {pasteProof ? (
              <section className="rounded-lg border-2 border-emerald-400 bg-white p-4 shadow-lg" aria-live="polite">
                <p className="text-base font-extrabold text-emerald-700">✓ {pasteProof.heading}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">This is exactly what was copied:</p>
                <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white p-3 text-slate-900">
                  {pasteProof.format === 'image' ? (
                    <img src={pasteProof.content} alt="Pretty paste card preview" className="block max-w-full h-auto" />
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
                  <ResultCard label={portCutLabel} value={portCutValue} />
                </div>
                {getPortNote(formData.pol) && (
                  <p className="mt-3 text-xs italic text-amber-200/90 leading-snug">⚠ {getPortNote(formData.pol)}</p>
                )}
              </>
            )}

            <p className="mt-4 text-center text-xs text-white/70">Choose a copy format — then paste with Ctrl+V.</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
              <button
                onClick={handleCopyPretty}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-sm bg-white text-slate-800 rounded-full hover:bg-slate-100 transition font-semibold shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
              >
                <span aria-hidden="true">✨</span> Copy formatted
              </button>
              <button
                onClick={handleCopyResults}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-sm bg-white/10 border border-white/40 text-white rounded-full hover:bg-white/20 transition font-semibold shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
              >
                <TextIcon /> Copy text
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
            {professional
              ? <img src={railOperationsPhoto} alt="Hapag-Lloyd rail operations professional at the terminal" className="idle-results-photo" />
              : <ObieThinking />}
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
