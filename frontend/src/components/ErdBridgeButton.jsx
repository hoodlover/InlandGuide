import React, { useEffect, useState } from 'react';
import { calculateFromLiveMaster, loadLiveMaster } from '../lib/liveMaster';
import { hapagLogoDataUri } from '../assets/hapag-logo-clipboard';

const BRIDGE_URL = 'http://127.0.0.1:47832/s8100-summary';
const LAST_RESULT_KEY = 'erd_tool_last_result_v1';

function toIsoDate(value) {
  const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function resultText(data, result) {
  return [
    `Booking ${data.bookingNumber}`,
    `ERD: ${result.erd}`,
    `LRD: ${result.lrd} · ${result.rampCutTime}`,
    '',
    `${data.startCity} → ${data.polCity}`,
    `Return Terminal: ${result.returnTerminal || 'N/A'}`,
    `Vessel: ${data.vessel}`,
    `Departure Terminal: ${data.departureTerminal || 'N/A'}`,
    `Port Cutoff: ${data.relevantCutoffDate} ${data.relevantCutoffTime}`.trim(),
  ].join('\n');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function formattedResult(data, result) {
  const row = (label, value) => `<div style="padding:4px 6px;border-bottom:1px solid #dbe2ea;background:#fff;font-size:9px;line-height:1.25;white-space:nowrap"><strong>${label}:</strong>&nbsp;${escapeHtml(value)}</div>`;
  return `<div style="font-family:Arial,sans-serif;width:255px;max-width:100%;box-sizing:border-box;border:3px solid #002d72;border-radius:9px;background:#eb6608;padding:8px;color:#10233f">` +
    `<div style="color:white;margin-bottom:7px;line-height:1.25">` +
    `<div style="font-size:9px;font-weight:800;white-space:nowrap">${escapeHtml(data.startCity)}&nbsp;&rarr;&nbsp;${escapeHtml(data.polCity)}</div>` +
    `<div style="font-size:6.5px;margin-top:2px;white-space:nowrap">${escapeHtml(result.returnTerminal || '')}&nbsp;&rarr;&nbsp;${escapeHtml(data.departureTerminal || '')}</div>` +
    `</div><div style="overflow:hidden;border-radius:7px;background:white">` +
    row('Booking', data.bookingNumber) + row('ERD', result.erd) +
    row('LRD', `${result.lrd} · ${result.rampCutTime}`) + row('Vessel', data.vessel || 'N/A') +
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

  const readAndCalculate = async () => {
    setState({ loading: true, error: '', data: null, result: null, copied: false, previewFormat: '' });
    try {
      const response = await fetch(BRIDGE_URL, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'The local ERD bridge did not respond.');

      const pol = String(data.polLocode || '').trim().toUpperCase();
      const cutoffDate = toIsoDate(data.relevantCutoffDate);
      if (!cutoffDate) throw new Error(`FIS returned an unreadable cutoff date: ${data.relevantCutoffDate || 'blank'}.`);
      const live = await loadLiveMaster();
      const { startCity, result } = calculateFromLiveMaster(live, data, cutoffDate);
      const saved = { data: { ...data, startCity, liveSource: live.source, liveModified: live.modified }, result, savedAt: new Date().toISOString() };
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
      if (!open) window.resizeTo(250, 230);
      else if (state.previewFormat) window.resizeTo(460, 720);
      else if (state.loading) window.resizeTo(420, 330);
      else window.resizeTo(440, 540);
    } catch { /* Some managed browsers may keep their current window size. */ }
  }, [open, standalone, state.loading, state.previewFormat]);

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
      {standalone ? <button type="button" onClick={showLastResult} className="fixed left-1/2 top-[calc(50%+77px)] z-[80] -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-orange-200 hover:text-white">Reopen last result</button> : null}

      {open ? (
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
                    <span className="font-bold text-slate-500">Vessel</span><span className="text-right font-bold">{state.data.vessel || 'N/A'}</span>
                    <span className="font-bold text-slate-500">Equipment</span><span className="text-right font-bold">{state.result.equipmentType || 'Not detected'}{state.result.isReefer ? ' · Reefer' : ''}</span>
                    <span className="font-bold text-slate-500">Port cutoff</span><span className="text-right font-bold">{state.data.relevantCutoffDate} {state.data.relevantCutoffTime}</span>
                    <span className="font-bold text-slate-500">Data</span><span className="text-right text-[11px] font-bold">Live master updated{state.data.liveModified ? ` ${state.data.liveModified}` : ''}</span>
                  </div>
                  <div className="rounded-lg bg-[#EB6608] px-3 py-2.5 text-sm text-white shadow-inner">
                    <div className="flex justify-between gap-3"><span className="font-bold">ERD</span><strong>{state.result.erd}</strong></div>
                    <div className="mt-1.5 flex justify-between gap-3"><span className="font-bold">LRD</span><strong>{state.result.lrd} · {state.result.rampCutTime}</strong></div>
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
