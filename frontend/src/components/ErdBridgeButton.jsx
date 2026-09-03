import React, { useEffect, useState } from 'react';
import { calculateFromLiveMaster, loadLiveMaster } from '../lib/liveMaster';

const BRIDGE_URL = 'http://127.0.0.1:47832/s8100-summary';
const BRIDGE_CLIPBOARD_URL = 'http://127.0.0.1:47832/erd-clipboard';
const LAST_RESULT_KEY = 'erd_tool_last_result_v1';

async function copyThroughBridge(text) {
  const response = await fetch(BRIDGE_CLIPBOARD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: text,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'The local bridge could not update the clipboard.');
}

function toIsoDate(value) {
  const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function resultText(data, result) {
  return [
    `Booking ${data.bookingNumber}`,
    `${data.startCity} → ${data.polCity}`,
    `POL: ${data.polLocode}`,
    `SSY: ${data.motService}`,
    `Vessel: ${data.vessel}`,
    `Relevant Cutoff: ${data.relevantCutoffDate} ${data.relevantCutoffTime}`.trim(),
    `Departure Terminal: ${data.departureTerminal || 'N/A'}`,
    '',
    `ERD: ${result.erd}`,
    `LRD: ${result.lrd}`,
    `Ramp Cut Time: ${result.rampCutTime}`,
  ].join('\n');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function formattedResult(data, result) {
  return `<div style="font-family:Arial,sans-serif;color:#10233f">` +
    `<div style="font-size:18px;font-weight:700;color:#002d72">Booking ${escapeHtml(data.bookingNumber)}</div>` +
    `<div style="margin:6px 0 12px">${escapeHtml(data.startCity)} &rarr; ${escapeHtml(data.polCity)}</div>` +
    `<div style="border-left:5px solid #eb6608;padding:8px 12px;background:#f5f7fb">` +
    `<b>ERD:</b> ${escapeHtml(result.erd)}<br><b>LRD:</b> ${escapeHtml(result.lrd)}<br>` +
    `<b>Ramp Cut Time:</b> ${escapeHtml(result.rampCutTime)}<br><b>POL Cutoff:</b> ${escapeHtml(data.relevantCutoffDate)} ${escapeHtml(data.relevantCutoffTime)}<br>` +
    `<b>Departure Terminal:</b> ${escapeHtml(data.departureTerminal || 'N/A')}</div></div>`;
}

export default function ErdBridgeButton({ standalone = false }) {
  const [state, setState] = useState({ loading: false, error: '', data: null, result: null, copied: false });

  const readAndCalculate = async () => {
    setState({ loading: true, error: '', data: null, result: null, copied: false });
    try {
      const response = await fetch(BRIDGE_URL, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'The local ERD bridge did not respond.');

      const pol = String(data.polLocode || '').trim().toUpperCase();
      const cutoffDate = toIsoDate(data.relevantCutoffDate);
      if (!cutoffDate) throw new Error(`FIS returned an unreadable cutoff date: ${data.relevantCutoffDate || 'blank'}.`);
      const live = await loadLiveMaster();
      const { startCity, result } = calculateFromLiveMaster(live, data, cutoffDate);
      const text = resultText({ ...data, startCity }, result);
      let copied = false;
      try {
        await copyThroughBridge(text);
        copied = true;
      } catch { /* The confirmation remains available with a manual Copy button. */ }
      const saved = { data: { ...data, startCity, liveSource: live.source, liveModified: live.modified }, result, savedAt: new Date().toISOString() };
      try { localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(saved)); } catch { /* Last-result convenience is optional. */ }
      setState({ loading: false, error: '', data: saved.data, result, copied });
    } catch (error) {
      const offline = error instanceof TypeError;
      setState({
        loading: false,
        error: offline ? 'Start ERD Screen Bridge V5, open the S8100 Routing tab, and try again.' : error.message,
        data: null,
        result: null,
        copied: false,
      });
    }
  };

  const copyAgain = async () => {
    if (!state.data || !state.result) return;
    try {
      await copyThroughBridge(resultText(state.data, state.result));
      setState(current => ({ ...current, copied: true }));
    } catch {
      setState(current => ({ ...current, error: 'The local bridge could not update the clipboard. Restart V5.3 and try again.' }));
    }
  };

  const copyFormatted = async () => {
    if (!state.data || !state.result) return;
    try {
      const text = resultText(state.data, state.result);
      const html = formattedResult(state.data, state.result);
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]);
      setState(current => ({ ...current, copied: true }));
    } catch {
      setState(current => ({ ...current, error: 'Formatted copy needs clipboard permission. Choose Allow once, then click Copy formatted again.' }));
    }
  };

  const close = () => setState({ loading: false, error: '', data: null, result: null, copied: false });
  const showLastResult = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_RESULT_KEY) || 'null');
      if (!saved?.data || !saved?.result) throw new Error();
      setState({ loading: false, error: '', data: saved.data, result: saved.result, copied: true });
    } catch {
      setState({ loading: false, error: 'No previous ERD result has been saved on this computer yet.', data: null, result: null, copied: false });
    }
  };
  const open = state.loading || state.error || state.result;

  useEffect(() => {
    if (!standalone) return;
    try {
      window.resizeTo(open ? 540 : 250, open ? 720 : 230);
    } catch { /* Some managed browsers may keep their current window size. */ }
  }, [open, standalone]);

  return (
    <>
      {standalone ? <p className="fixed left-1/2 top-[calc(50%-78px)] z-[80] -translate-x-1/2 whitespace-nowrap text-xs font-extrabold text-white">1. Open booking in S8100</p> : null}
      <button
        type="button"
        onClick={readAndCalculate}
        disabled={state.loading}
        className={`${standalone ? 'fixed left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2' : 'fixed bottom-5 right-5 h-20 w-20'} z-[80] flex items-center justify-center rounded-full bg-transparent p-0 shadow-[0_10px_28px_rgba(0,45,114,0.45)] transition hover:scale-105 disabled:cursor-wait disabled:opacity-70`}
        aria-label="Read the open S8100 booking and calculate ERD and LRD"
        title="Read open S8100 booking"
      >
        {state.loading ? <span className="text-2xl font-black text-white">···</span> : <img src="./got-erd-button.webp" alt="Got ERD?" className="h-full w-full object-contain" />}
      </button>
      {standalone ? <p className="fixed left-1/2 top-[calc(50%+62px)] z-[80] -translate-x-1/2 whitespace-nowrap text-xs font-extrabold text-white">2. Click the ERD button</p> : null}
      {standalone ? <button type="button" onClick={showLastResult} className="fixed left-1/2 top-[calc(50%+83px)] z-[80] -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-orange-200 underline underline-offset-2 hover:text-white">Reopen last result</button> : null}

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !state.loading) close(); }}>
          <section className="w-full max-w-md overflow-hidden rounded-2xl border-4 border-[#002D72] bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="erd-bridge-title">
            <header className="flex items-center justify-between bg-[#002D72] px-5 py-4 text-white">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">Live S8100</p>
                <h2 id="erd-bridge-title" className="text-xl font-black">ERD / LRD Confirmation</h2>
              </div>
              {!state.loading ? <button type="button" onClick={close} className="rounded-full px-3 py-1 text-2xl leading-none hover:bg-white/15" aria-label="Close">×</button> : null}
            </header>

            <div className="p-5">
              {state.loading ? <p className="py-10 text-center font-bold text-[#002D72]">Reading the open S8100 booking…</p> : null}
              {state.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {state.error}
                </div>
              ) : null}
              {state.data && state.result ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <span className="font-bold text-slate-500">Booking</span><span className="text-right font-black text-[#002D72]">{state.data.bookingNumber}</span>
                    <span className="font-bold text-slate-500">Route</span><span className="text-right font-bold">{state.data.startCity} → {state.data.polCity}</span>
                    <span className="font-bold text-slate-500">SSY</span><span className="text-right font-bold">{state.data.motService || 'N/A'}</span>
                    <span className="font-bold text-slate-500">Vessel</span><span className="text-right font-bold">{state.data.vessel || 'N/A'}</span>
                    <span className="font-bold text-slate-500">POL cutoff</span><span className="text-right font-bold">{state.data.relevantCutoffDate} {state.data.relevantCutoffTime}</span>
                    <span className="font-bold text-slate-500">Departure terminal</span><span className="text-right font-bold">{state.data.departureTerminal || 'N/A'}</span>
                    <span className="font-bold text-slate-500">Data</span><span className="text-right text-xs font-bold">Live Z: master{state.data.liveModified ? ` · ${state.data.liveModified}` : ''}</span>
                  </div>
                  <div className="rounded-xl bg-[#EB6608] p-4 text-white shadow-inner">
                    <div className="flex justify-between gap-4"><span className="font-bold">ERD</span><strong className="text-lg">{state.result.erd}</strong></div>
                    <div className="mt-2 flex justify-between gap-4"><span className="font-bold">LRD</span><strong className="text-lg">{state.result.lrd}</strong></div>
                    <div className="mt-2 flex justify-between gap-4"><span className="font-bold">Ramp cut</span><strong>{state.result.rampCutTime}</strong></div>
                  </div>
                  <p className="text-center text-sm font-bold text-emerald-700">{state.copied ? '✓ Already copied to your clipboard' : 'Ready to copy'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={copyFormatted} className="rounded-xl bg-[#EB6608] px-3 py-3 text-sm font-bold text-white hover:bg-orange-600">✨ Copy formatted</button>
                    <button type="button" onClick={copyAgain} className="rounded-xl bg-[#002D72] px-3 py-3 text-sm font-bold text-white hover:bg-blue-950">Copy text</button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
