import React, { useState, useEffect } from 'react';
import Combobox from './Combobox';
import { getPorts, getVessels, getCities, getVesselMeta, getCutoff, getERD, getPortInfo, getCutTime } from '../lib/cpkc';
import { hlLogo } from '../assets/hlLogo';

const EMPTY = { port: '', vessel: '', city: '' };

export default function PortScheduleLookup() {
  const ports = getPorts();
  // Auto-select when there's only one port (today: Montreal).
  const [sel, setSel] = useState({ ...EMPTY, port: ports.length === 1 ? ports[0].slug : '' });
  const [copyMessage, setCopyMessage] = useState('');

  const vessels = sel.port ? getVessels(sel.port) : [];
  const cities = sel.port ? getCities(sel.port) : [];
  const info = sel.port ? getPortInfo(sel.port) : null;

  // Reset downstream picks when an upstream selection changes.
  const pick = (field, value) => {
    setSel(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'port') { next.vessel = ''; next.city = ''; }
      return next;
    });
    setCopyMessage('');
  };

  const handleReset = () => {
    setSel({ ...EMPTY, port: ports.length === 1 ? ports[0].slug : '' });
    setCopyMessage('');
  };

  const meta = (sel.port && sel.vessel) ? getVesselMeta(sel.port, sel.vessel) : null;
  const ready = sel.port && sel.vessel && sel.city;
  const cutoff = ready ? getCutoff(sel.port, sel.vessel, sel.city) : '';
  const erd = ready ? getERD(sel.port, sel.vessel, sel.city) : '';
  // Some vessels legitimately have no cutoff for a given inland city (they don't serve it).
  const noCutoff = ready && !cutoff;

  const results = ready && cutoff ? {
    city: sel.city,
    vessel: sel.vessel,
    cutoff,
    cutTime: getCutTime(sel.port, sel.city),
    erd,
    rail: info?.rail || '',
    terminal: meta?.terminal || '',
    eta: meta?.eta || '',
    etd: meta?.etd || '',
    railPortCutoff: meta?.railPortCutoff || '',
    comments: meta?.comments || ''
  } : null;

  const writeClipboard = async (text, html, okMsg) => {
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
      setTimeout(() => setCopyMessage(''), 2000);
    } catch {
      setCopyMessage('Failed to copy');
    }
  };

  // Plain-text note, mirroring the "Copy Kind Text Note" style of the calculator.
  const handleCopyText = () => {
    if (!results) return;
    const railTerminal = `${results.rail || 'Rail'}${results.terminal ? ' / ' + results.terminal : ''}`;
    const top = `${results.city}    ${railTerminal}`;
    const divider = '─'.repeat(Math.max(24, top.length));
    const text = [
      top,
      divider,
      `Vessel: ${results.vessel}`,
      `Inland Cut-Off (LRD): ${results.cutoff}`,
      results.cutTime ? `Cut-Off Time: ${results.cutTime}` : null,
      `Earliest Receiving (ERD): ${results.erd}`,
      results.comments ? `Note: ${results.comments}` : null,
      '',
      `${info.name} — as published ${info.runDate}`,
      divider,
      '',
      ''
    ].filter(v => v !== null).join('\n');

    const html = `<div style="font-family:'Times New Roman',Times,serif">` + [
      `<b>${results.city}</b>&nbsp;&nbsp;&nbsp;&nbsp;<b>${railTerminal}</b>`,
      divider,
      `Vessel: <b>${results.vessel}</b>`,
      `Inland Cut-Off (LRD): <b>${results.cutoff}</b>`,
      results.cutTime ? `Cut-Off Time: <b>${results.cutTime}</b>` : null,
      `Earliest Receiving (ERD): <b>${results.erd}</b>`,
      results.comments ? `Note: ${results.comments}` : null,
      '',
      `${info.name} — as published ${info.runDate}`,
      divider,
      '',
      ''
    ].filter(v => v !== null).join('<br>') + `</div>`;

    writeClipboard(text, html, '✓ Copied to clipboard!');
  };

  // Rich "pretty note" card, matching the calculator's styled box.
  const handleCopyPretty = () => {
    if (!results) return;
    const railTerminal = `${results.rail || 'Rail'}${results.terminal ? ' / ' + results.terminal : ''}`;
    const titlePlain = `${results.city}    ${railTerminal}`;
    const titleHtml = `${results.city}&nbsp;&nbsp;&nbsp;&nbsp;${railTerminal}`;
    const titleSize = titlePlain.length > 34 ? 15 : (titlePlain.length > 26 ? 17 : 20);

    // Tables (Outlook Online strips float/background from divs) with an explicit
    // border on every cell — three sides match the cell background (invisible),
    // the bottom is grey. Full borders stop Salesforce's dashed cell "guides"
    // while leaving only the grey horizontal separators visible. bgcolor attrs
    // keep the orange/white in Outlook.
    const cell = 'padding:9px 16px;border:1px solid #ffffff;border-bottom:1px solid #e2e8f0';
    const rowLabel = `${cell};font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#000000;text-align:left`;
    const rowVal = `${cell};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#000000;text-align:right`;
    const row = (label, value) => `<tr><td bgcolor="#ffffff" style="${rowLabel}">${label}</td><td bgcolor="#ffffff" style="${rowVal}">${value}</td></tr>`;

    const html =
      `<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#EB6608" style="border-collapse:separate;background-color:#EB6608;border:5px solid #002D72;border-radius:12px;max-width:470px">` +
        `<tr><td bgcolor="#EB6608" style="background-color:#EB6608;padding:22px;border:1px solid #EB6608">` +
          `<div style="font-family:Arial,sans-serif;color:#ffffff;font-size:${titleSize}px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;text-shadow:0 2px 5px rgba(0,0,0,0.45);border-bottom:2px solid #ffffff;padding-bottom:8px;margin-bottom:16px">${titleHtml}</div>` +
          `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff" style="border-collapse:separate;background-color:#ffffff;border-radius:8px">` +
            row('Vessel', results.vessel) +
            row('Inland Cut-Off (LRD)', results.cutoff) +
            (results.cutTime ? row('Cut-Off Time', results.cutTime) : '') +
            row('Earliest Receiving (ERD)', results.erd) +
            (results.comments ? row('Note', results.comments) : '') +
          `</table>` +
          `<div style="font-family:Arial,sans-serif;color:#ffffff;font-size:11px;margin-top:10px">${info.name} — as published ${info.runDate}</div>` +
          `<div style="text-align:right;margin-top:8px"><img src="${hlLogo}" width="150" alt="Hapag-Lloyd" style="display:inline-block;width:150px;height:auto" /></div>` +
        `</td></tr>` +
      `</table>`;

    const text = [
      titlePlain,
      `Vessel: ${results.vessel}`,
      `Inland Cut-Off (LRD): ${results.cutoff}`,
      results.cutTime ? `Cut-Off Time: ${results.cutTime}` : null,
      `Earliest Receiving (ERD): ${results.erd}`,
      results.comments ? `Note: ${results.comments}` : null,
      '',
      ''
    ].filter(v => v !== null).join('\n');

    writeClipboard(text, html, '✨ Pretty note copied!');
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-[#EB6608] rounded-lg border border-[#EB6608] shadow-sm p-6">
        <h2 className="text-xl font-extrabold tracking-wide uppercase mb-1 pb-2 border-b-2 border-white/60 text-white txt-shadow-heavy">Port Cut-Off Schedule</h2>
        {info && (
          <p className="text-xs text-white/90 mb-4 txt-shadow-soft">Schedule as published: <span className="font-semibold">{info.runDate}</span></p>
        )}

        <div className="space-y-3">
          {ports.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">Port *</label>
              <Combobox
                value={sel.port}
                onSelect={(v) => pick('port', v)}
                options={ports.map(p => ({ value: p.slug, label: p.rail ? `${p.name} (${p.rail})` : p.name }))}
                placeholder="Type or select a port…"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">Vessel *</label>
            <Combobox
              value={sel.vessel}
              onSelect={(v) => pick('vessel', v)}
              options={vessels.map(v => ({ value: v, label: v }))}
              placeholder={sel.port ? 'Type or select a vessel…' : 'Select a port first'}
              disabled={!sel.port}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white mb-1 txt-shadow-soft">Rail City *</label>
            <Combobox
              value={sel.city}
              onSelect={(v) => pick('city', v)}
              options={cities.map(c => ({ value: c, label: c }))}
              placeholder={sel.vessel ? 'Type or select a city…' : 'Select a vessel first'}
              disabled={!sel.vessel}
              required
            />
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-1 text-sm bg-white/10 border border-white/50 text-white rounded-full hover:bg-white/20 transition font-semibold shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
            >
              Reset
            </button>
          </div>

          {info?.notes?.length > 0 && (
            <details className="mt-3 text-white/90 text-xs">
              <summary className="cursor-pointer font-semibold txt-shadow-soft">Schedule notes</summary>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                {info.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </details>
          )}
        </div>
      </div>

      <div>
        {results ? (
          <div className="bg-[#002D72] rounded-lg border border-[#002D72] shadow-sm p-6">
            <h3 className="text-xl font-extrabold tracking-wide uppercase mb-4 pb-2 border-b-2 border-[#EB6608] text-white txt-shadow-heavy">{results.city}</h3>

            <div className="bg-white divide-y divide-slate-200 rounded-lg px-4 shadow-md">
              <Row label="Vessel" value={results.vessel} />
              <Row label="Inland Cut-Off (LRD)" value={results.cutoff} strong />
              {results.cutTime && <Row label="Cut-Off Time" value={results.cutTime} />}
              <Row label="Earliest Receiving (ERD)" value={results.erd} strong />
              {results.rail && <Row label="Rail" value={results.rail} />}
              {results.terminal && <Row label="Terminal" value={results.terminal} />}
              {results.eta && <Row label="Vessel ETA" value={results.eta} />}
              {results.etd && <Row label="Vessel ETD" value={results.etd} />}
              {results.railPortCutoff && <Row label="Rail Port Cut-Off" value={results.railPortCutoff} />}
              {results.comments && <Row label="Note" value={results.comments} />}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleCopyText}
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
        ) : noCutoff ? (
          <div className="bg-[#002D72] border border-[#002D72] rounded-lg p-6 text-center shadow-sm">
            <p className="text-white font-semibold">No published cut-off</p>
            <p className="text-white/80 text-sm mt-1">{sel.vessel} has no listed cut-off for {sel.city} on this schedule — try another rail city.</p>
          </div>
        ) : (
          <div className="bg-[#002D72] border border-[#002D72] rounded-lg p-6 text-center shadow-sm">
            <p className="text-white">Pick a vessel and rail city to see the cut-off</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }) {
  // Stack label/value on narrow widths (keeps the value next to its label instead
  // of stranded on the far right of a wide single-column card); inline on md+.
  return (
    <div className="flex flex-col gap-0.5 md:flex-row md:items-center md:justify-between md:gap-3 py-2">
      <p className="text-sm font-bold text-slate-600 md:text-black">{label}</p>
      <p className={`${strong ? 'text-lg text-[#002D72]' : 'text-base text-black'} font-bold md:text-right`}>{value || 'N/A'}</p>
    </div>
  );
}
