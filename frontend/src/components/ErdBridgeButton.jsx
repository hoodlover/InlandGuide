import React, { useEffect, useState } from 'react';
import { calculateFromLiveMaster, loadLiveMaster } from '../lib/liveMaster';
import { calculateCanadaBooking } from '../lib/canadaBooking';
import { getTerminalOptions, getTerminals, ssyForTerminal, terminalLabel } from '../lib/cutoff';
import { hapagLogoDataUri } from '../assets/hapag-logo-clipboard';

const BRIDGE_URL = 'http://127.0.0.1:47832/s8100-summary?equipment=skip';
const LAST_RESULT_KEY = 'erd_tool_last_result_v1';
const withTime = (date, time) => [date, time].filter(Boolean).join(' · ');

function compactRailName(value) {
  return String(value || '')
    .replace(/^UNION\s+PACIFIC\b/i, 'UP')
    .replace(/^NORFOLK\s+SOUTHERN\b/i, 'NS')
    .replace(/^BURLINGTON\s+NORTHERN(?:\s+SANTA\s+FE)?\b/i, 'BNSF');
}

function shortModifiedDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return match ? `${Number(match[2])}/${Number(match[3])}/${match[1].slice(-2)}` : String(value || '');
}

function toIsoDate(value) {
  const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function parseManualDate(value) {
  const parts = String(value || '').trim().split(/[/\-.]/).map(part => part.trim()).filter(Boolean);
  if (parts.length < 1 || parts.length > 3) return null;
  const now = new Date();
  let month = parts.length === 1 ? now.getMonth() + 1 : Number(parts[0]);
  const day = Number(parts.length === 1 ? parts[0] : parts[1]);
  let year = parts.length === 3 ? Number(parts[2]) : now.getFullYear();
  if (year < 100) year += 2000;
  // During December, a short Jan/Feb/Mar date means the upcoming year.
  if (parts.length === 2 && now.getMonth() === 11 && month <= 3) year += 1;
  if (![month, day, year].every(Number.isInteger) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return {
    iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    display: `${month}/${day}/${year}`,
  };
}

function resultText(data, result) {
  return [
    `Booking ${data.bookingNumber}`,
    `ERD: ${result.erd}`,
    `LRD: ${withTime(result.lrd, result.rampCutTime)}`,
    '',
    `${data.startCity} → ${data.polCity}`,
    `Return Terminal: ${compactRailName(result.returnTerminal) || 'N/A'}`,
    data.canadianRail ? `Rail: ${data.canadianRail}` : '',
    result.isReefer ? 'Equipment: Reefer' : '',
    data.vessel ? `Vessel: ${data.vessel}` : '',
    data.departureTerminal ? `Departure Terminal: ${data.departureTerminal}` : '',
    `Port Cutoff: ${data.relevantCutoffDate} ${data.relevantCutoffTime}`.trim(),
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join('\n');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function formattedResult(data, result) {
  const row = (label, value) => `<div style="padding:4px 6px;border-bottom:1px solid #dbe2ea;background:#fff;font-size:9px;line-height:1.25;white-space:nowrap"><strong>${label}:</strong>&nbsp;${escapeHtml(value)}</div>`;
  return `<div style="font-family:Arial,sans-serif;width:255px;max-width:100%;box-sizing:border-box;border:3px solid #002d72;border-radius:9px;background:#eb6608;padding:8px;color:#10233f">` +
    `<div style="color:white;margin-bottom:7px;line-height:1.25">` +
    `<div style="font-size:9px;font-weight:800;white-space:nowrap">${escapeHtml(data.startCity)}&nbsp;&rarr;&nbsp;${escapeHtml(data.polCity)}</div>` +
    `<div style="font-size:6.5px;margin-top:2px;white-space:nowrap">${escapeHtml(compactRailName(result.returnTerminal))}${data.departureTerminal ? `&nbsp;&rarr;&nbsp;${escapeHtml(data.departureTerminal)}` : ''}</div>` +
    `</div><div style="overflow:hidden;border-radius:7px;background:white">` +
    row('Booking', data.bookingNumber) + row('ERD', result.erd) +
    row('LRD', withTime(result.lrd, result.rampCutTime)) + (data.vessel ? row('Vessel', data.vessel) : '') +
    (data.canadianRail ? row('Rail', data.canadianRail) : '') +
    (result.isReefer ? row('Equipment', 'Reefer') : '') +
    row('Port Cutoff', `${data.relevantCutoffDate} ${data.relevantCutoffTime}`.trim()) + `</div>` +
    `<div style="margin-top:5px;text-align:right"><img src="${hapagLogoDataUri}" alt="Hapag-Lloyd" style="display:inline-block;width:78px;height:auto"></div></div>`;
}

async function copyFormattedToClipboard(data, result) {
  const text = resultText(data, result);
  const html = formattedResult(data, result);
  await navigator.clipboard.write([new ClipboardItem({
    'text/plain': new Blob([text], { type: 'text/plain' }),
    'text/html': new Blob([html], { type: 'text/html' }),
  })]);
}

export default function ErdBridgeButton({ standalone = false }) {
  const [state, setState] = useState({ loading: false, error: '', data: null, result: null, copied: false, previewFormat: '' });
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMaster, setManualMaster] = useState(null);
  const [manual, setManual] = useState({ pol: '', city: '', terminal: '', ssy: '', cutoffDate: '', bookingNumber: '', isReefer: false });
  const [reefer, setReefer] = useState(false);

  const readAndCalculate = async () => {
    setState({ loading: true, error: '', data: null, result: null, copied: false, previewFormat: '' });
    try {
      const response = await fetch(BRIDGE_URL, { cache: 'no-store' });
      const bridgeData = await response.json().catch(() => ({}));
      if (!response.ok || !bridgeData.ok) throw new Error(bridgeData.error || 'The local ERD bridge did not respond.');
      const data = { ...bridgeData, isReefer: reefer, equipmentType: reefer ? 'Reefer' : 'Dry' };

      const pol = String(data.polLocode || '').trim().toUpperCase();
      const cutoffDate = toIsoDate(data.relevantCutoffDate);
      if (!cutoffDate) throw new Error(`FIS returned an unreadable cutoff date: ${data.relevantCutoffDate || 'blank'}.`);
      const live = await loadLiveMaster();
      const canada = pol.startsWith('CA') && data.canadianRail ? calculateCanadaBooking(data) : null;
      const calculated = canada || calculateFromLiveMaster(live, data, cutoffDate);
      const startCity = calculated.startCity || data.startCity;
      const result = calculated.result;
      const saved = { data: { ...data, startCity, liveSource: canada?.source || live.source, liveModified: canada?.modified || live.modified }, result, savedAt: new Date().toISOString() };
      try { localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(saved)); } catch { /* Last-result convenience is optional. */ }
      let copied = false;
      try { await copyFormattedToClipboard(saved.data, result); copied = true; } catch { /* The browser permission message remains visible. */ }
      setState({ loading: false, error: '', data: saved.data, result, copied, previewFormat: '' });
    } catch (error) {
      const offline = error instanceof TypeError;
      setState({
        loading: false,
        error: offline ? 'Start ERD Screen Bridge V5, open the S8100 Routing tab, and try again.' : error.message,
        data: null,
        result: null,
        copied: false, previewFormat: '',
      });
    }
  };

  const close = () => setState({ loading: false, error: '', data: null, result: null, copied: false, previewFormat: '' });
  const openManual = async () => {
    setManualOpen(true);
    setState({ loading: true, error: '', data: null, result: null, copied: false, previewFormat: '' });
    try {
      const live = await loadLiveMaster();
      setManualMaster(live);
      setState({ loading: false, error: '', data: null, result: null, copied: false, previewFormat: '' });
    } catch (error) {
      setState({ loading: false, error: error.message, data: null, result: null, copied: false, previewFormat: '' });
    }
  };
  const calculateManual = async event => {
    event.preventDefault();
    const cityLanes = manualMaster?.lanes?.filter(lane => lane.pol === manual.pol && lane.name === manual.city) || [];
    const terminalConfig = getTerminals(manual.pol);
    const selectedSsy = terminalConfig
      ? ssyForTerminal(manual.pol, manual.city, manual.terminal)
      : manual.ssy;
    const lane = cityLanes.find(item => String(item.ssy || '').split(',').map(value => value.trim().toUpperCase()).includes(selectedSsy.toUpperCase()))
      || (cityLanes.length === 1 ? cityLanes[0] : null);
    const parsedDate = parseManualDate(manual.cutoffDate);
    if (!lane || !manual.pol || (terminalConfig && !manual.terminal) || !parsedDate) {
      setState(current => ({ ...current, error: 'Choose a port, starting city, and terminal when shown, then enter a valid date such as 5, 7/5, or 7/5/2026.' }));
      return;
    }
    try {
      const bridgeData = {
        bookingNumber: manual.bookingNumber.trim() || 'Manual check',
        polLocode: manual.pol,
        polCity: manual.pol,
        startLocode: lane.loccode,
        startCity: lane.name,
        motService: selectedSsy || String(lane.ssy || 'ALL').split(',')[0].trim(),
        vessel: '',
        departureTerminal: manual.terminal ? terminalLabel(manual.terminal) : '',
        relevantCutoffDate: parsedDate.display,
        relevantCutoffTime: '',
        equipmentType: manual.isReefer ? 'Reefer' : 'Dry',
        isReefer: manual.isReefer,
      };
      const { startCity, result } = calculateFromLiveMaster(manualMaster, bridgeData, parsedDate.iso);
      const data = { ...bridgeData, startCity, liveSource: manualMaster.source, liveModified: manualMaster.modified };
      const saved = { data, result, savedAt: new Date().toISOString() };
      try { localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(saved)); } catch { /* Optional convenience. */ }
      let copied = false;
      try { await copyFormattedToClipboard(data, result); copied = true; } catch { /* Permission guidance is shown below. */ }
      setManualOpen(false);
      setState({ loading: false, error: '', data, result, copied, previewFormat: '' });
    } catch (error) {
      setState(current => ({ ...current, loading: false, error: error.message }));
    }
  };
  const showLastResult = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_RESULT_KEY) || 'null');
      if (!saved?.data || !saved?.result) throw new Error();
      setState({ loading: false, error: '', data: saved.data, result: saved.result, copied: true, previewFormat: '' });
    } catch {
      setState({ loading: false, error: 'No previous ERD result has been saved on this computer yet.', data: null, result: null, copied: false, previewFormat: '' });
    }
  };
  const recopyResult = async () => {
    if (!state.data || !state.result) return;
    try {
      await copyFormattedToClipboard(state.data, state.result);
      setState(current => ({ ...current, copied: true }));
    } catch {
      setState(current => ({ ...current, copied: false }));
    }
  };
  const open = state.loading || state.error || state.result;

  useEffect(() => {
    if (!standalone) return;
    try {
      if (!open && !manualOpen) window.resizeTo(250, 265);
      else if (manualOpen) window.resizeTo(430, 610);
      else if (state.previewFormat) window.resizeTo(460, 720);
      else if (state.loading) window.resizeTo(420, 330);
      else window.resizeTo(440, 540);
    } catch { /* Some managed browsers may keep their current window size. */ }
  }, [open, manualOpen, standalone, state.loading, state.previewFormat]);

  const manualPorts = manualMaster ? [...new Set(manualMaster.lanes.map(lane => lane.pol))].sort() : [];
  const manualCities = manualMaster ? [...new Set(manualMaster.lanes.filter(lane => lane.pol === manual.pol).map(lane => lane.name))].sort() : [];
  const selectedCityLanes = manualMaster ? manualMaster.lanes.filter(lane => lane.pol === manual.pol && lane.name === manual.city) : [];
  const manualSsys = [...new Set(selectedCityLanes.flatMap(lane => String(lane.ssy || '').split(',').map(value => value.trim()).filter(Boolean)))];
  const manualTerminals = manual.pol ? getTerminals(manual.pol) : null;
  const manualTerminalOptions = manualTerminals ? getTerminalOptions(manual.pol) : [];
  const needsSsy = selectedCityLanes.length > 1 && !manualTerminals;

  return (
    <>
      {standalone ? <p className="fixed left-1/2 top-[calc(50%-102px)] z-[80] -translate-x-1/2 whitespace-nowrap text-xs font-extrabold text-white">1. Open booking in S8100</p> : null}
      <button
        type="button"
        onClick={readAndCalculate}
        disabled={state.loading}
        className={`${standalone ? 'fixed left-1/2 top-[calc(50%-24px)] h-24 w-24 -translate-x-1/2 -translate-y-1/2' : 'fixed bottom-5 right-5 h-20 w-20'} z-[80] flex items-center justify-center rounded-full bg-transparent p-0 shadow-[0_10px_28px_rgba(0,45,114,0.45)] transition hover:scale-105 disabled:cursor-wait disabled:opacity-70`}
        aria-label="Read the open S8100 booking and calculate ERD and LRD"
        title="Read open S8100 booking"
      >
        {state.loading ? <span className="text-2xl font-black text-white">···</span> : <img src="./got-erd-button.webp" alt="Got ERD?" className="h-full w-full object-contain" />}
      </button>
      {standalone ? <div className="fixed left-1/2 top-[calc(50%+38px)] z-[80] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap"><span className="text-xs font-extrabold text-white">2. Click the ERD button</span><label className="flex cursor-pointer items-center gap-1 text-[9px] font-bold text-slate-300"><input type="checkbox" checked={reefer} onChange={event => setReefer(event.target.checked)} className="h-3 w-3 accent-[#EB6608]" />Reefer?</label></div> : null}
      {standalone ? <button type="button" onClick={showLastResult} className="fixed left-1/2 top-[calc(50%+59px)] z-[80] -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-orange-200 hover:text-white">Reopen last result</button> : null}
      {standalone ? <button type="button" onClick={openManual} className="fixed left-1/2 top-[calc(50%+78px)] z-[80] -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-slate-300 hover:text-white">Manual check</button> : null}

      {manualOpen ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-3">
          <section className="w-full max-w-sm overflow-hidden rounded-xl border-2 border-orange-500 bg-[#111318] text-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="manual-erd-title">
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">Use any future date</p><h2 id="manual-erd-title" className="text-lg font-black">Manual ERD check</h2></div>
              <button type="button" onClick={() => { setManualOpen(false); close(); }} className="px-2 text-2xl" aria-label="Close">×</button>
            </header>
            {state.loading ? <p className="p-8 text-center text-sm font-bold">Opening the live master…</p> : (
              <form onSubmit={calculateManual} className="space-y-3 p-4">
                <label className="block text-xs font-bold">Port of loading
                  <select value={manual.pol} onChange={event => setManual(current => ({ ...current, pol: event.target.value, city: '', terminal: '', ssy: '' }))} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm" required>
                    <option value="">Choose port</option>{manualPorts.map(pol => <option key={pol} value={pol}>{pol}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold">Starting city / rail ramp
                  <select value={manual.city} onChange={event => setManual(current => ({ ...current, city: event.target.value, terminal: '', ssy: '' }))} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm" required disabled={!manual.pol}>
                    <option value="">Choose starting city</option>{manualCities.map(city => <option key={city} value={city}>{city}</option>)}
                  </select>
                </label>
                {manualTerminals && manual.city ? <label className="block text-xs font-bold">Port terminal
                  <select value={manual.terminal} onChange={event => setManual(current => ({ ...current, terminal: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm" required>
                    <option value="">Choose terminal</option>{manualTerminalOptions.map(option => <option key={option.value} value={option.value}>{option.label} — {option.sub}</option>)}
                  </select>
                </label> : null}
                {needsSsy ? <label className="block text-xs font-bold">SSY / service
                  <select value={manual.ssy} onChange={event => setManual(current => ({ ...current, ssy: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm" required>
                    <option value="">Choose SSY</option>{manualSsys.map(ssy => <option key={ssy} value={ssy}>{ssy.toUpperCase() === 'ALL' ? 'ALL / other services' : ssy}</option>)}
                  </select>
                </label> : null}
                <label className="block text-xs font-bold">Port-cut date <span className="font-normal text-slate-400">(DD, M/D, or full date)</span>
                  <input type="text" value={manual.cutoffDate} onChange={event => setManual(current => ({ ...current, cutoffDate: event.target.value }))} placeholder="5 or 7/5" className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm" inputMode="numeric" required />
                </label>
                <label className="block text-xs font-bold">Booking number <span className="font-normal text-slate-400">(optional)</span>
                  <input value={manual.bookingNumber} onChange={event => setManual(current => ({ ...current, bookingNumber: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm" inputMode="numeric" />
                </label>
                <label className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-bold"><input type="checkbox" checked={manual.isReefer} onChange={event => setManual(current => ({ ...current, isReefer: event.target.checked }))} className="h-4 w-4 accent-orange-500" /> Reefer container</label>
                {state.error ? <p className="rounded-md bg-red-950/70 p-2 text-xs font-semibold text-red-200">{state.error}</p> : null}
                <button type="submit" className="w-full rounded-md bg-[#EB6608] px-4 py-2.5 text-sm font-black text-white hover:bg-orange-500">Calculate and copy</button>
              </form>
            )}
          </section>
        </div>
      ) : null}

      {open && !manualOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !state.loading) close(); }}>
          <section className="max-h-[calc(100vh-1rem)] w-full max-w-sm overflow-y-auto rounded-xl border-[3px] border-[#002D72] bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="erd-bridge-title">
            <header className="flex items-center justify-between bg-[#002D72] px-4 py-3 text-white">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">Live S8100</p>
                <h2 id="erd-bridge-title" className="text-lg font-black">ERD / LRD Confirmation</h2>
              </div>
              {!state.loading ? <button type="button" onClick={close} className="rounded-full px-3 py-1 text-2xl leading-none hover:bg-white/15" aria-label="Close">×</button> : null}
            </header>

            <div className="p-4">
              {state.loading ? <p className="py-7 text-center text-sm font-bold text-[#002D72]">Reading the open S8100 booking…</p> : null}
              {state.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {state.error}
                </div>
              ) : null}
              {state.data && state.result ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                    <span className="font-bold text-slate-500">Booking</span><span className="text-right font-black text-[#002D72]">{state.data.bookingNumber}</span>
                    <span className="font-bold text-slate-500">Route</span><span className="text-right font-bold">{state.data.startCity} → {state.data.polCity}<small className="mt-0.5 block whitespace-nowrap text-[10px] font-semibold text-slate-500">{compactRailName(state.result.returnTerminal) || 'N/A'} → {state.data.departureTerminal || 'N/A'}</small></span>
                    {state.data.vessel ? <><span className="font-bold text-slate-500">Vessel</span><span className="text-right font-bold">{state.data.vessel}</span></> : null}
                    {state.data.canadianRail ? <><span className="font-bold text-slate-500">Rail</span><span className="text-right font-bold">{state.data.canadianRail}<small className="mt-0.5 block text-[10px] font-semibold text-slate-500">{state.data.customerPlace}</small></span></> : null}
                    {state.result.isReefer ? <><span className="font-bold text-slate-500">Equipment</span><span className="text-right font-bold">Reefer</span></> : null}
                    <span className="font-bold text-slate-500">Port cutoff</span><span className="text-right font-bold">{state.data.relevantCutoffDate} {state.data.relevantCutoffTime}</span>
                    <span className="font-bold text-slate-500">Data</span><span className="text-right text-[11px] font-bold">Live master updated{state.data.liveModified ? ` ${shortModifiedDate(state.data.liveModified)}` : ''}</span>
                  </div>
                  <div className="rounded-lg bg-[#EB6608] px-3 py-2.5 text-sm text-white shadow-inner">
                    <div className="flex justify-between gap-3"><span className="font-bold">ERD</span><strong>{state.result.erd}</strong></div>
                    <div className="mt-1.5 flex justify-between gap-3"><span className="font-bold">LRD</span><strong>{withTime(state.result.lrd, state.result.rampCutTime)}</strong></div>
                  </div>
                  {state.copied ? <button type="button" onClick={recopyResult} className="block w-full text-center text-xs font-bold text-emerald-700 hover:text-emerald-800">✓ Already copied to your clipboard — click to copy again</button> : <p className="text-center text-xs font-bold text-amber-700">Clipboard permission is needed. Choose Allow, then click ERD again.</p>}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
