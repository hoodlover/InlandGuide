import React, { useEffect, useState } from 'react';
import { calculateFromLiveMaster, loadLiveMaster } from '../lib/liveMaster';
import { calculateCanadaBooking } from '../lib/canadaBooking';
import { hapagLogoDataUri } from '../assets/hapag-logo-clipboard';

const BRIDGE_URL = 'http://127.0.0.1:47832/s8100-summary?equipment=skip';
const LAST_RESULT_KEY = 'erd_tool_last_result_v1';
const withTime = (date, time) => [date, time].filter(Boolean).join(' · ');

function toIsoDate(value) {
  const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function resultText(data, result) {
  return [
    `Booking ${data.bookingNumber}`,
    `ERD: ${result.erd}`,
    `LRD: ${withTime(result.lrd, result.rampCutTime)}`,
    '',
    `${data.startCity} → ${data.polCity}`,
    `Return Terminal: ${result.returnTerminal || 'N/A'}`,
    data.canadianRail ? `Rail: ${data.canadianRail}` : '',
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
    `<div style="font-size:6.5px;margin-top:2px;white-space:nowrap">${escapeHtml(result.returnTerminal || '')}${data.departureTerminal ? `&nbsp;&rarr;&nbsp;${escapeHtml(data.departureTerminal)}` : ''}</div>` +
    `</div><div style="overflow:hidden;border-radius:7px;background:white">` +
    row('Booking', data.bookingNumber) + row('ERD', result.erd) +
    row('LRD', withTime(result.lrd, result.rampCutTime)) + (data.vessel ? row('Vessel', data.vessel) : '') +
    (data.canadianRail ? row('Rail', data.canadianRail) : '') +
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
  const [manual, setManual] = useState({ pol: '', lane: '', cutoffDate: '', bookingNumber: '', isReefer: false });
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
    const lane = manualMaster?.lanes?.[Number(manual.lane)];
    if (!lane || !manual.pol || !manual.cutoffDate) {
      setState(current => ({ ...current, error: 'Choose a port, starting city, and port-cut date.' }));
      return;
    }
    try {
      const bridgeData = {
        bookingNumber: manual.bookingNumber.trim() || 'Manual check',
        polLocode: manual.pol,
        polCity: manual.pol,
        startLocode: lane.loccode,
        startCity: lane.name,
        motService: String(lane.ssy || 'ALL').split(',')[0].trim(),
        vessel: '',
        departureTerminal: '',
        relevantCutoffDate: new Date(`${manual.cutoffDate}T12:00:00`).toLocaleDateString('en-US'),
        relevantCutoffTime: '',
        equipmentType: manual.isReefer ? 'Reefer' : 'Dry',
        isReefer: manual.isReefer,
      };
      const { startCity, result } = calculateFromLiveMaster(manualMaster, bridgeData, manual.cutoffDate);
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
  const open = state.loading || state.error || state.result;

  useEffect(() => {
    if (!standalone) return;
    try {
      if (!open && !manualOpen) window.resizeTo(250, 275);
      else if (manualOpen) window.resizeTo(430, 610);
      else if (state.previewFormat) window.resizeTo(460, 720);
      else if (state.loading) window.resizeTo(420, 330);
      else window.resizeTo(440, 540);
    } catch { /* Some managed browsers may keep their current window size. */ }
  }, [open, manualOpen, standalone, state.loading, state.previewFormat]);

  const manualPorts = manualMaster ? [...new Set(manualMaster.lanes.map(lane => lane.pol))].sort() : [];
  const manualLanes = manualMaster ? manualMaster.lanes
    .map((lane, index) => ({ lane, index }))
    .filter(item => item.lane.pol === manual.pol)
    .sort((a, b) => a.lane.name.localeCompare(b.lane.name)) : [];

  return (
    <>
      {standalone ? <p className="fixed left-1/2 top-[calc(50%-84px)] z-[80] -translate-x-1/2 whitespace-nowrap text-xs font-extrabold text-white">1. Open booking in S8100</p> : null}
      <button
        type="button"
        onClick={readAndCalculate}
        disabled={state.loading}
        className={`${standalone ? 'fixed left-1/2 top-[calc(50%-6px)] h-24 w-24 -translate-x-1/2 -translate-y-1/2' : 'fixed bottom-5 right-5 h-20 w-20'} z-[80] flex items-center justify-center rounded-full bg-transparent p-0 shadow-[0_10px_28px_rgba(0,45,114,0.45)] transition hover:scale-105 disabled:cursor-wait disabled:opacity-70`}
        aria-label="Read the open S8100 booking and calculate ERD and LRD"
        title="Read open S8100 booking"
      >
        {state.loading ? <span className="text-2xl font-black text-white">···</span> : <img src="./got-erd-button.webp" alt="Got ERD?" className="h-full w-full object-contain" />}
      </button>
      {standalone ? <p className="fixed left-1/2 top-[calc(50%+56px)] z-[80] -translate-x-1/2 whitespace-nowrap text-xs font-extrabold text-white">2. Click the ERD button</p> : null}
      {standalone ? <div className="fixed left-1/2 top-[calc(50%+77px)] z-[80] flex -translate-x-1/2 overflow-hidden rounded-full border border-white/25 text-[10px] font-black"><button type="button" onClick={() => setReefer(false)} className={`px-3 py-1 ${!reefer ? 'bg-white text-slate-950' : 'bg-transparent text-slate-300'}`}>Dry</button><button type="button" onClick={() => setReefer(true)} className={`px-3 py-1 ${reefer ? 'bg-[#EB6608] text-white' : 'bg-transparent text-slate-300'}`}>Reefer</button></div> : null}
      {standalone ? <button type="button" onClick={showLastResult} className="fixed left-1/2 top-[calc(50%+108px)] z-[80] -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-orange-200 hover:text-white">Reopen last result</button> : null}
      {standalone ? <button type="button" onClick={openManual} className="fixed left-1/2 top-[calc(50%+127px)] z-[80] -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-slate-300 hover:text-white">Manual check</button> : null}

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
                  <select value={manual.pol} onChange={event => setManual(current => ({ ...current, pol: event.target.value, lane: '' }))} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm" required>
                    <option value="">Choose port</option>{manualPorts.map(pol => <option key={pol} value={pol}>{pol}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold">Starting city / rail ramp
                  <select value={manual.lane} onChange={event => setManual(current => ({ ...current, lane: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm" required disabled={!manual.pol}>
                    <option value="">Choose starting city</option>{manualLanes.map(({ lane, index }) => <option key={`${index}-${lane.name}`} value={index}>{lane.name}{lane.rampMC ? ` — ${lane.rampMC}` : ''}{lane.ssy && lane.ssy !== 'ALL' ? ` (${lane.ssy})` : ''}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold">Port-cut date
                  <input type="date" value={manual.cutoffDate} onChange={event => setManual(current => ({ ...current, cutoffDate: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm" required />
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
                    <span className="font-bold text-slate-500">Route</span><span className="text-right font-bold">{state.data.startCity} → {state.data.polCity}<small className="mt-0.5 block text-[10px] font-semibold text-slate-500">{state.result.returnTerminal || 'N/A'} → {state.data.departureTerminal || 'N/A'}</small></span>
                    {state.data.vessel ? <><span className="font-bold text-slate-500">Vessel</span><span className="text-right font-bold">{state.data.vessel}</span></> : null}
                    {state.data.canadianRail ? <><span className="font-bold text-slate-500">Rail</span><span className="text-right font-bold">{state.data.canadianRail}<small className="mt-0.5 block text-[10px] font-semibold text-slate-500">{state.data.customerPlace}</small></span></> : null}
                    <span className="font-bold text-slate-500">Equipment</span><span className="text-right font-bold">{state.result.equipmentType || 'Not detected'}{state.result.isReefer ? ' · Reefer' : ''}</span>
                    <span className="font-bold text-slate-500">Port cutoff</span><span className="text-right font-bold">{state.data.relevantCutoffDate} {state.data.relevantCutoffTime}</span>
                    <span className="font-bold text-slate-500">Data</span><span className="text-right text-[11px] font-bold">Live master updated{state.data.liveModified ? ` ${state.data.liveModified}` : ''}</span>
                  </div>
                  <div className="rounded-lg bg-[#EB6608] px-3 py-2.5 text-sm text-white shadow-inner">
                    <div className="flex justify-between gap-3"><span className="font-bold">ERD</span><strong>{state.result.erd}</strong></div>
                    <div className="mt-1.5 flex justify-between gap-3"><span className="font-bold">LRD</span><strong>{withTime(state.result.lrd, state.result.rampCutTime)}</strong></div>
                  </div>
                  <p className={`text-center text-xs font-bold ${state.copied ? 'text-emerald-700' : 'text-amber-700'}`}>{state.copied ? '✓ Already copied to your clipboard — ready to paste' : 'Clipboard permission is needed. Choose Allow, then click ERD again.'}</p>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
