import React, { useState } from 'react';
import { calculateERDLRD, getCities, getLoccode, getPortServices } from '../lib/cutoff';

const BRIDGE_URL = 'http://127.0.0.1:47832/s8100-summary';
const BRIDGE_CLIPBOARD_URL = 'http://127.0.0.1:47832/erd-clipboard';

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

function resolveStartCity(pol, bridgeData) {
  const cities = getCities(pol);
  const wantedName = String(bridgeData.startCity || '').trim().toUpperCase();
  const wantedCode = String(bridgeData.startLocode || '').trim().toUpperCase();
  return cities.find(city => String(city).trim().toUpperCase() === wantedName)
    || cities.find(city => String(getLoccode(city)).trim().toUpperCase() === wantedCode)
    || '';
}

function resultText(data, result) {
  return [
    `Booking ${data.bookingNumber}`,
    `${data.startCity} → ${data.polCity}`,
    `POL: ${data.polLocode}`,
    `MoT Service: ${data.motService}`,
    `Vessel: ${data.vessel}`,
    `Relevant Cutoff: ${data.relevantCutoffDate} ${data.relevantCutoffTime}`.trim(),
    '',
    `ERD: ${result.erd}`,
    `LRD: ${result.lrd}`,
    `Ramp Cut Time: ${result.rampCutTime}`,
  ].join('\n');
}

export default function ErdBridgeButton() {
  const [state, setState] = useState({ loading: false, error: '', data: null, result: null, copied: false });

  const readAndCalculate = async () => {
    setState({ loading: true, error: '', data: null, result: null, copied: false });
    try {
      const response = await fetch(BRIDGE_URL, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'The local ERD bridge did not respond.');

      const pol = String(data.polLocode || '').trim().toUpperCase();
      const startCity = resolveStartCity(pol, data);
      if (!startCity) throw new Error(`The live cutoff data has no ${data.startCity || data.startLocode} → ${pol} lane.`);
      const services = getPortServices(pol);
      const service = services.length === 1 && services[0] === 'ALL' ? 'ALL' : data.motService;
      const cutoffDate = toIsoDate(data.relevantCutoffDate);
      if (!cutoffDate) throw new Error(`FIS returned an unreadable cutoff date: ${data.relevantCutoffDate || 'blank'}.`);

      const result = calculateERDLRD(pol, startCity, service, cutoffDate, 'N', 0);
      if (result.error) throw new Error(`${result.error}: ${startCity} → ${pol} (${service || 'no service'}).`);
      const text = resultText({ ...data, startCity }, result);
      let copied = false;
      try {
        await copyThroughBridge(text);
        copied = true;
      } catch { /* The confirmation remains available with a manual Copy button. */ }
      setState({ loading: false, error: '', data: { ...data, startCity }, result, copied });
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

  const close = () => setState({ loading: false, error: '', data: null, result: null, copied: false });
  const open = state.loading || state.error || state.result;

  return (
    <>
      <button
        type="button"
        onClick={readAndCalculate}
        disabled={state.loading}
        className="fixed bottom-5 right-5 z-[80] flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-[#EB6608] text-base font-black text-white shadow-[0_10px_28px_rgba(0,45,114,0.45)] transition hover:scale-105 hover:bg-orange-600 disabled:cursor-wait disabled:opacity-70"
        aria-label="Read the open S8100 booking and calculate ERD and LRD"
        title="Read open S8100 booking"
      >
        {state.loading ? '···' : 'ERD?'}
      </button>

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
                    <span className="font-bold text-slate-500">Service</span><span className="text-right font-bold">{state.data.motService || 'N/A'}</span>
                    <span className="font-bold text-slate-500">Vessel</span><span className="text-right font-bold">{state.data.vessel || 'N/A'}</span>
                    <span className="font-bold text-slate-500">POL cutoff</span><span className="text-right font-bold">{state.data.relevantCutoffDate} {state.data.relevantCutoffTime}</span>
                  </div>
                  <div className="rounded-xl bg-[#EB6608] p-4 text-white shadow-inner">
                    <div className="flex justify-between gap-4"><span className="font-bold">ERD</span><strong className="text-lg">{state.result.erd}</strong></div>
                    <div className="mt-2 flex justify-between gap-4"><span className="font-bold">LRD</span><strong className="text-lg">{state.result.lrd}</strong></div>
                    <div className="mt-2 flex justify-between gap-4"><span className="font-bold">Ramp cut</span><strong>{state.result.rampCutTime}</strong></div>
                  </div>
                  <p className="text-center text-sm font-bold text-emerald-700">{state.copied ? '✓ Already copied to your clipboard' : 'Ready to copy'}</p>
                  <button type="button" onClick={copyAgain} className="w-full rounded-xl bg-[#002D72] px-4 py-3 font-bold text-white hover:bg-blue-950">Copy result</button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
