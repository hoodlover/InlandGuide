// The Managers Hub as a standard full page (hash route #managers) instead of
// the old pop-out modal. Same passphrase gate and tools as before, plus the
// "Rename ports & terminals" editor. The verified passphrase is kept in
// sessionStorage for this tab only, so refreshing the page doesn't re-ask.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { gzipSync, strFromU8, strToU8, unzipSync } from 'fflate';
import UsageStats from './UsageStats';
import { masterUpdatedAt, getRenameCatalog } from '../lib/cutoff';
import { pulledAt as railPulledAt, getCanadaRenameCatalog } from '../lib/cpkc';
import nameOverridesJson from '../data/name-overrides.json';
import { obBot } from '../assets/banners';

const PASS_SESSION_KEY = 'icg-manager-pass';

const MASTER_DB_SHEETS = ['LOOKUP', 'DATABASE', 'RAILTERMINALS', 'PORTMC', 'PORTSERVICES', 'HOLIDAYS', 'CONFIG'];

function xmlDocument(bytes, label) {
  if (!bytes) throw new Error(`${label} is missing from the workbook.`);
  const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`${label} is not valid XML.`);
  return doc;
}

function xmlElements(doc, localName) {
  return Array.from(doc.getElementsByTagNameNS('*', localName));
}

function workbookPartPath(target) {
  const raw = target.replace(/\\/g, '/').replace(/^\//, '');
  const parts = (raw.startsWith('xl/') ? raw : `xl/${raw}`).split('/');
  const clean = [];
  parts.forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') clean.pop();
    else clean.push(part);
  });
  return clean.join('/');
}

function validateMasterWorkbook(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const workbook = xmlDocument(files['xl/workbook.xml'], 'Workbook definition');
  const relationships = xmlDocument(files['xl/_rels/workbook.xml.rels'], 'Workbook relationships');
  const relationshipMap = new Map(xmlElements(relationships, 'Relationship').map(rel => [
    rel.getAttribute('Id'),
    workbookPartPath(rel.getAttribute('Target') || ''),
  ]));

  const sheets = xmlElements(workbook, 'sheet').map(sheet => ({
    name: sheet.getAttribute('name') || '',
    relationId: sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'),
  }));
  const sheetNames = sheets.map(sheet => sheet.name);
  const missing = MASTER_DB_SHEETS.filter(name => !sheetNames.includes(name));
  if (missing.length) throw new Error(`Missing required sheet${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);

  const database = sheets.find(sheet => sheet.name === 'DATABASE');
  const databasePath = relationshipMap.get(database.relationId);
  const databaseXml = xmlDocument(files[databasePath], 'DATABASE sheet');
  const databaseRows = xmlElements(databaseXml, 'row').length;
  if (databaseRows < 50) throw new Error('The DATABASE sheet does not contain the expected data rows.');

  const sharedStringsXml = files['xl/sharedStrings.xml']
    ? xmlDocument(files['xl/sharedStrings.xml'], 'Shared strings')
    : null;
  const sharedStrings = sharedStringsXml
    ? xmlElements(sharedStringsXml, 'si').map(si => xmlElements(si, 't').map(t => t.textContent || '').join(''))
    : [];
  const columnAValues = xmlElements(databaseXml, 'c')
    .filter(cell => /^A\d+$/i.test(cell.getAttribute('r') || ''))
    .map((cell) => {
      const type = cell.getAttribute('t');
      if (type === 'inlineStr') return xmlElements(cell, 't').map(t => t.textContent || '').join('');
      const value = xmlElements(cell, 'v')[0]?.textContent || '';
      return type === 's' ? (sharedStrings[Number(value)] || '') : value;
    });
  if (!columnAValues.includes('STARTDATA') || !columnAValues.includes('ENDDATA')) {
    throw new Error('The DATABASE sheet is missing its STARTDATA or ENDDATA marker.');
  }

  return { sheetNames, databaseRows };
}

function columnIndex(cellReference) {
  const letters = String(cellReference || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
  return [...letters].reduce((index, letter) => (index * 26) + letter.charCodeAt(0) - 64, 0) - 1;
}

function readMasterRows(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const workbook = xmlDocument(files['xl/workbook.xml'], 'Workbook definition');
  const relationships = xmlDocument(files['xl/_rels/workbook.xml.rels'], 'Workbook relationships');
  const relationshipMap = new Map(xmlElements(relationships, 'Relationship').map(rel => [
    rel.getAttribute('Id'),
    workbookPartPath(rel.getAttribute('Target') || ''),
  ]));
  const sharedStringsXml = files['xl/sharedStrings.xml']
    ? xmlDocument(files['xl/sharedStrings.xml'], 'Shared strings')
    : null;
  const sharedStrings = sharedStringsXml
    ? xmlElements(sharedStringsXml, 'si').map(si => xmlElements(si, 't').map(t => t.textContent || '').join(''))
    : [];
  const sheets = new Map(xmlElements(workbook, 'sheet').map(sheet => {
    const relationId = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    return [sheet.getAttribute('name') || '', relationshipMap.get(relationId)];
  }));

  const readCell = (cell) => {
    const type = cell.getAttribute('t');
    if (type === 'inlineStr') return xmlElements(cell, 't').map(t => t.textContent || '').join('');
    const raw = xmlElements(cell, 'v')[0]?.textContent || '';
    if (type === 's') return sharedStrings[Number(raw)] || '';
    if (type === 'str') return raw;
    if (type === 'b') return raw === '1';
    if (raw === '') return '';
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : raw;
  };

  return Object.fromEntries(MASTER_DB_SHEETS.map((name) => {
    const path = sheets.get(name);
    const sheet = xmlDocument(files[path], `${name} sheet`);
    const rows = xmlElements(sheet, 'row').map(rowElement => {
      const row = [];
      xmlElements(rowElement, 'c').forEach((cell) => {
        const index = columnIndex(cell.getAttribute('r'));
        if (index >= 0) row[index] = readCell(cell);
      });
      return row.map(value => value ?? '');
    });
    return [name, rows];
  }));
}

function excelSerialToIso(serial) {
  if (!Number.isFinite(Number(serial))) return '';
  return new Date(Date.UTC(1899, 11, 30) + (Number(serial) * 86400000)).toISOString().slice(0, 10);
}

function buildMasterPayload(buffer, sourceHash) {
  const sheets = readMasterRows(buffer);
  const lanes = [];
  let inData = false;
  for (const row of sheets.DATABASE) {
    if (row[0] === 'STARTDATA') { inData = true; continue; }
    if (row[0] === 'ENDDATA') break;
    if (!inData || !row[0] || row[0] === 'POL LOCCODE') continue;
    lanes.push({
      pol: row[0], ssy: row[1], name: row[2], loccode: row[3], rampMC: row[4], rampCutTime: row[5],
      transit: parseFloat(row[6]) || 0, window: parseFloat(row[7]) || 0,
      ssyAdjustment: parseFloat(row[8]) || 0, reefer: row[9], windowReefer: parseFloat(row[10]) || 0,
    });
  }
  if (lanes.length < 100) throw new Error('The master did not produce enough calculator lanes to publish.');

  const holidays = {};
  for (const row of sheets.HOLIDAYS) {
    const country = String(row[0] || '').trim();
    const iso = excelSerialToIso(row[2]);
    if ((country === 'US' || country === 'CA' || country === 'MX') && iso) (holidays[country] ||= []).push(iso);
  }
  Object.values(holidays).forEach(list => list.sort());

  const terminalMap = {};
  for (const row of sheets.PORTMC) {
    const pol = String(row[0] || '').trim();
    const terminal = String(row[2] || '').trim();
    if (!/^(US|CA|MX)[A-Z]{3}$/.test(pol) || !terminal) continue;
    terminalMap[pol] ||= new Map();
    if (!terminalMap[pol].has(terminal)) terminalMap[pol].set(terminal, new Set());
    String(row[1] || '').split(',').forEach(service => {
      const value = service.trim();
      if (value) terminalMap[pol].get(terminal).add(value);
    });
  }
  const terminalForService = (pol, service) => {
    for (const [terminal, services] of terminalMap[pol] || []) if (services.has(service)) return terminal;
    return null;
  };
  const portmc = {};
  for (const pol of Object.keys(terminalMap).sort()) {
    const terminals = terminalMap[pol];
    if (terminals.size < 2) continue;
    const polLanes = lanes.filter(lane => lane.pol === pol);
    if (!polLanes.length) continue;
    const services = new Set();
    polLanes.forEach(lane => String(lane.ssy || '').split(',').forEach(service => {
      const value = service.trim();
      if (value && value !== 'ALL') services.add(value);
    }));
    portmc[pol] = {
      mode: [...services].every(service => terminalForService(pol, service)) ? 'terminal' : 'ssy',
      terminals: [...terminals].map(([code, values]) => ({ code, ssys: [...values] })),
    };
  }

  const portServices = {};
  for (const row of sheets.PORTSERVICES) {
    const pol = String(row[0] || '').trim();
    if (!/^(US|CA|MX)[A-Z]{3}$/.test(pol)) continue;
    portServices[pol] ||= [];
    String(row[1] || '').split(',').forEach(service => {
      const value = service.trim();
      if (value && !portServices[pol].includes(value)) portServices[pol].push(value);
    });
  }

  return { schema: 1, sourceHash, lanes, holidays, portmc, portServices };
}

// gzip + base64 — the transport format both publish workflows expect.
function encodePayload(payload) {
  const compressed = gzipSync(strToU8(JSON.stringify(payload)), { level: 9 });
  let binary = '';
  for (let index = 0; index < compressed.length; index += 0x8000) {
    binary += String.fromCharCode(...compressed.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Crisp stroke icons (no emoji — they render inconsistently across Windows
// builds and read as unprofessional) plus one uniform card.
const HUB_ICONS = {
  requests: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8" /><path d="M8 13h5" /></>,
  stats: <><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M8 16H3v5" /></>,
  publish: <><path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2" /><path d="M12 12v9" /><path d="m16 16-4-4-4 4" /></>,
  toggle: <><rect x="2" y="6" width="20" height="12" rx="6" /><circle cx="16" cy="12" r="2" /></>,
  news: <><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" /><path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" /></>,
  rename: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
};

function HubCard({ icon, title, subtitle, detail, onClick, href }) {
  const className = 'group flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#EB6608]/60 hover:shadow-md dark:border-slate-600 dark:bg-slate-700 dark:hover:border-[#EB6608]/70';
  const body = (
    <>
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#002D72]/[0.06] text-[#002D72] transition group-hover:bg-[#EB6608]/10 group-hover:text-[#EB6608] dark:bg-white/10 dark:text-white" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#002D72] dark:text-white">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-300">{subtitle}</span>
        {detail && <span className="mt-1 block text-[11px] font-medium text-[#0a4b9b] dark:text-blue-200">{detail}</span>}
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#EB6608] dark:text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
    </>
  );
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={className}>{body}</a>
    : <button type="button" onClick={onClick} className={className}>{body}</button>;
}

function formatHubActivity(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not available';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// White content card every tool view lives in, with a back-to-tools button.
function ToolPanel({ title, onBack, children, wide = false }) {
  return (
    <section className={`mx-auto w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800`}>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-600">
        <h2 className="text-lg font-light tracking-wide text-[#002D72] dark:text-white">{title}</h2>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-[#EB6608] hover:text-[#EB6608] dark:border-slate-500 dark:text-slate-300"
          >
            ← All tools
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Rename ports & terminals — display names for everything the guide shows in
// its pickers and results: Ports of Load, loading terminals, US/CA rail ramp
// labels, and the Canada tab's ports and destination cities. Values (codes,
// slugs, published names) never change, so every selection keeps mapping to
// the same rows in the master workbook and schedule snapshots.
// ---------------------------------------------------------------------------
const RENAME_TABS = [
  { id: 'terminals', label: 'Load Terminals' },
  { id: 'ramps', label: 'Rail Ramps' },
  { id: 'canada', label: 'Canada Ramps' },
  { id: 'ports', label: 'Ports of Load' },
];

// Row shape: { key, title, code, def } — def is the standard (non-renamed)
// name; the input holds the name currently shown so edits are a word, not a
// retype. Section ids double as the override-group names in the payload.
function buildRenameSections() {
  const us = getRenameCatalog();
  const ca = getCanadaRenameCatalog();
  const shownGroups = new Set(['United States', 'Mexico']);
  const usPorts = us.ports.filter(p => shownGroups.has(p.group));
  const polSet = new Set(usPorts.map(p => p.pol));

  // One input per matchcode — a code repeated under two ports shares one name.
  const terminalRows = new Map();
  for (const t of us.terminals) {
    if (!polSet.has(t.pol)) continue;
    if (!terminalRows.has(t.code)) {
      terminalRows.set(t.code, { key: t.code, title: t.pol, code: t.code, def: t.defaultName });
    }
  }

  return [
    {
      id: 'ports', tab: 'ports', heading: '',
      hint: 'Shown in the Port of Loading dropdown of the US calculator.',
      rows: usPorts.map(({ pol }) => ({ key: pol, title: pol, code: '', def: pol })),
    },
    {
      id: 'terminals', tab: 'terminals', heading: '',
      hint: 'Shown in the SSY / Terminal dropdown and on the "Port · Terminal · FCL Cut" line.',
      rows: [...terminalRows.values()],
    },
    {
      id: 'ramps', tab: 'ramps', heading: '',
      hint: 'The "RAIL / Terminal" label shown with each result and copied card — keep that format.',
      rows: us.ramps.map(r => ({ key: r.key, title: r.city, code: r.rampMC, def: r.defaultName })),
    },
    {
      id: 'canadaPorts', tab: 'canada', heading: 'Ports',
      hint: 'Shown in the Canada Rail Ramp Cuts port picker.',
      rows: ca.ports.map(p => ({ key: p.slug, title: p.rail || 'Port', code: p.slug, def: p.defaultName })),
    },
    {
      id: 'canadaCities', tab: 'canada', heading: 'Rail destination cities',
      hint: 'Shown in the Canada tab city picker and results.',
      rows: ca.cities.map(c => ({ key: c.city, title: c.city, code: '', def: c.defaultName })),
    },
  ];
}

function RenameEditor({ pass, onAuthExpired }) {
  const sections = useMemo(buildRenameSections, []);

  // Inputs start at the name currently in use: published rename, else standard.
  const [values, setValues] = useState(() => {
    const initial = {};
    for (const section of sections) {
      const saved = nameOverridesJson[section.id] || {};
      initial[section.id] = Object.fromEntries(section.rows.map(row => [row.key, saved[row.key] || row.def]));
    }
    return initial;
  });
  const [tab, setTab] = useState('terminals');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const setValue = (sectionId, key, value) =>
    setValues(current => ({ ...current, [sectionId]: { ...current[sectionId], [key]: value } }));

  // A row counts as changed when its box differs from the standard name;
  // blank falls back to standard, so it can never publish an empty label.
  const overridesFor = (section) => {
    const out = {};
    for (const row of section.rows) {
      const value = String(values[section.id][row.key] ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (value && value !== row.def) out[row.key] = value;
    }
    return out;
  };
  const pending = Object.fromEntries(sections.map(section => [section.id, overridesFor(section)]));
  const changedCount = (ids) => ids.reduce((n, id) => n + Object.keys(pending[id]).length, 0);
  const tabIds = (tabId) => sections.filter(s => s.tab === tabId).map(s => s.id);
  const totalChanges = changedCount(sections.map(s => s.id));
  const dirty = JSON.stringify(pending) !== JSON.stringify(
    Object.fromEntries(sections.map(section => {
      const saved = nameOverridesJson[section.id] || {};
      return [section.id, Object.fromEntries(section.rows.filter(row => saved[row.key]).map(row => [row.key, saved[row.key]]))];
    }))
  );

  const publish = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    setStatus(null);
    try {
      const encoded = encodePayload({ schema: 1, ...pending });
      if (encoded.length > 60000) throw new Error('The rename list is too large for the secure publish service.');
      const response = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: pass, action: 'publish-names', payload: encoded }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { onAuthExpired?.(); return; }
      if (!response.ok || !result.ok) throw new Error(result.error || `Publish service returned HTTP ${response.status}.`);
      setStatus({ ok: true, msg: '✓ Names published — the live guide and offline app rebuild with the new labels in a few minutes.' });
    } catch (error) {
      setStatus({ ok: false, msg: error?.message || 'The names could not be published.' });
    } finally {
      setBusy(false);
    }
  };

  const q = filter.trim().toLowerCase();
  const rowMatches = (section, row) => {
    if (!q) return true;
    const current = values[section.id][row.key] || '';
    return [row.title, row.code, row.def, current].some(text => String(text).toLowerCase().includes(q));
  };

  const activeSections = sections.filter(s => s.tab === tab);

  return (
    <div>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Edit the name shown on screen — the underlying codes never change, so every selection
        still connects to the same lane, terminal, and schedule in the master data.
      </p>

      {/* Side curtain: vertical section rail on the left (sticky below the
          page header), outputs for the chosen section in the main area. */}
      <div className="mt-4 md:grid md:grid-cols-[11.5rem_minmax(0,1fr)] md:items-start md:gap-5">
        <nav aria-label="Rename sections" className="flex flex-wrap gap-2 md:sticky md:top-24 md:flex-col md:gap-1.5">
          {RENAME_TABS.map(t => {
            const count = changedCount(tabIds(t.id));
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition md:w-full md:justify-between md:rounded-lg md:px-3 md:py-2 ${
                  tab === t.id
                    ? 'bg-[#002D72] text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 text-[10px] font-bold ${tab === t.id ? 'bg-[#EB6608] text-white' : 'bg-amber-400/90 text-slate-900'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-4 min-w-0 md:mt-0">
          <div className="relative">
            <input
              type="text"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search…"
              aria-label="Filter list"
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-sm text-slate-900 focus:border-[#EB6608] focus:outline-none focus:ring-2 focus:ring-[#EB6608]/30 dark:border-slate-500 dark:bg-slate-700 dark:text-white"
            />
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            {filter && (
              <button
                type="button"
                onClick={() => setFilter('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700 dark:hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {activeSections.map(section => {
        const rows = section.rows.filter(row => rowMatches(section, row));
        return (
          <section key={section.id} className="mt-4">
            {section.heading && (
              <h3 className="mb-1.5 text-sm font-semibold text-[#002D72] dark:text-white">{section.heading}</h3>
            )}
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{section.hint}</p>
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-600">
              <div className="grid grid-cols-[minmax(0,11rem)_1fr] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400">
                <span>Item</span>
                <span>Name shown on screen</span>
              </div>
              {rows.length === 0 && (
                <p className="p-3 text-sm text-slate-500 dark:text-slate-300">Nothing matches the search.</p>
              )}
              {rows.map((row, index) => {
                const value = values[section.id][row.key] ?? '';
                const changed = value.replace(/\s+/g, ' ').trim() !== row.def && value.trim() !== '';
                return (
                  <div
                    key={row.key}
                    className={`grid grid-cols-[minmax(0,11rem)_1fr] items-center gap-3 px-3 py-1.5 ${index % 2 ? 'bg-slate-50/60 dark:bg-slate-700/25' : ''} ${changed ? 'shadow-[inset_3px_0_0_#EB6608]' : ''}`}
                  >
                    <div className="min-w-0 leading-tight">
                      <span className="block truncate text-[13px] font-semibold text-slate-700 dark:text-slate-200">{row.title}</span>
                      {row.code && <span className="block truncate font-mono text-[11px] text-slate-400 dark:text-slate-400">{row.code}</span>}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={value}
                        maxLength={80}
                        placeholder={row.def}
                        onChange={(event) => setValue(section.id, row.key, event.target.value)}
                        aria-label={`Display name for ${row.title} ${row.code || ''}`}
                        className={`w-full rounded-md border py-1 pl-2.5 pr-8 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#EB6608]/30 dark:bg-slate-700 dark:text-white ${
                          changed ? 'border-[#EB6608]/70 bg-orange-50/40 dark:border-[#EB6608]/70' : 'border-slate-300 bg-white dark:border-slate-500'
                        }`}
                      />
                      {value !== '' && (
                        <button
                          type="button"
                          onClick={() => setValue(section.id, row.key, '')}
                          aria-label={`Clear the name for ${row.title}`}
                          title="Clear (blank = standard name)"
                          className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-xs leading-none text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-600 dark:hover:text-white"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

          <div className="sticky bottom-0 mt-5 border-t border-slate-200 bg-white/95 py-3 backdrop-blur dark:border-slate-600 dark:bg-slate-800/95">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {totalChanges === 0
                  ? 'All names match the standard data.'
                  : `${totalChanges} custom ${totalChanges === 1 ? 'name' : 'names'}${dirty ? ' — not published yet' : ' published'}`}
              </span>
              <button
                type="button"
                onClick={publish}
                disabled={busy || !dirty}
                className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-800 disabled:opacity-50"
              >
                {busy ? 'Publishing…' : 'Publish names'}
              </button>
            </div>
            {status && (
              <div className={`mt-2 rounded-lg border p-2.5 text-sm ${status.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`} role="status">
                {status.msg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManagersPage() {
  const [view, setView] = useState('login');
  const [pass, setPass] = useState(() => {
    try { return sessionStorage.getItem(PASS_SESSION_KEY) || ''; } catch { return ''; }
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [dbResult, setDbResult] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestsStatus, setRequestsStatus] = useState(null);
  const [clearingId, setClearingId] = useState(0);
  const [showPublishObie, setShowPublishObie] = useState(false);
  const [publishObieNudge, setPublishObieNudge] = useState(false);
  const [hubActivity, setHubActivity] = useState({
    railPulledAt,
    masterCheckedAt: masterUpdatedAt,
  });
  const verifiedMasterRef = useRef(null);
  const autoVerifyRef = useRef(false);

  const exitToGuide = () => { window.location.hash = ''; };

  useEffect(() => {
    if (!showPublishObie) return undefined;
    setPublishObieNudge(false);
    const timer = setTimeout(() => setPublishObieNudge(true), 5000);
    return () => clearTimeout(timer);
  }, [showPublishObie]);

  const expireSession = () => {
    try { sessionStorage.removeItem(PASS_SESSION_KEY); } catch { /* ignore */ }
    setStatus({ ok: false, msg: 'Manager session expired. Please sign in again.' });
    setView('login');
  };

  const verifyAccess = async (passphrase = pass) => {
    if (!passphrase || busy) return;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      setStatus({ ok: false, msg: 'Manager verification runs on the live app: inland-guide.vercel.app' });
      return;
    }
    setBusy(true); setStatus(null);
    try {
      const r = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase, action: 'verify' }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok && data.verified) {
        try { sessionStorage.setItem(PASS_SESSION_KEY, passphrase); } catch { /* ignore */ }
        setHubActivity(current => ({
          railPulledAt: data.activity?.railPulledAt || current.railPulledAt,
          masterCheckedAt: data.activity?.masterCheckedAt || current.masterCheckedAt,
        }));
        setStatus(null);
        setView('menu');
      }
      else if (r.status === 401) {
        try { sessionStorage.removeItem(PASS_SESSION_KEY); } catch { /* ignore */ }
        setStatus({ ok: false, msg: 'Wrong passphrase.' });
      }
      else if (r.status === 500) setStatus({ ok: false, msg: data.error || 'Manager access is not configured in Vercel.' });
      else {
        const detail = data.detail ? ` — ${data.detail}` : '';
        setStatus({
          ok: false,
          msg: data.error ? `${data.error}${detail}` : `Refresh service returned HTTP ${r.status}.`,
        });
      }
    } catch {
      setStatus({ ok: false, msg: 'Network error — this only works on the live web app.' });
    } finally {
      setBusy(false);
    }
  };

  // A passphrase remembered from earlier in this tab session skips the login
  // screen (it is still verified against the server before anything shows).
  useEffect(() => {
    if (pass && !autoVerifyRef.current) {
      autoVerifyRef.current = true;
      verifyAccess(pass);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerRefresh = async () => {
    if (busy) return;
    setView('refresh');
    setBusy(true);
    setStatus({ ok: true, msg: 'Starting the rail schedule refresh…' });
    try {
      const r = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: pass }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) setStatus({ ok: true, msg: '✓ Refresh started — new schedules deploy in a few minutes.' });
      else if (r.status === 401) { expireSession(); }
      else {
        const detail = data.detail ? ` — ${data.detail}` : '';
        setStatus({ ok: false, msg: data.error ? `${data.error}${detail}` : `Refresh service returned HTTP ${r.status}.` });
      }
    } catch {
      setStatus({ ok: false, msg: 'Network error — the refresh could not be started.' });
    } finally {
      setBusy(false);
    }
  };

  const loadRequests = async () => {
    if (busy) return;
    setView('requests');
    setBusy(true);
    setRequestsStatus(null);
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', passphrase: pass }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { expireSession(); return; }
      if (!response.ok || !result.ok) throw new Error(result.error || `Request service returned HTTP ${response.status}.`);
      setRequests(result.requests || []);
    } catch (error) {
      setRequestsStatus({ ok: false, message: error?.message || 'The requests could not be loaded.' });
    } finally {
      setBusy(false);
    }
  };

  // Clearing closes the GitHub issue and retires its marker, so the request
  // drops off this log while the thread stays readable in GitHub.
  const clearRequest = async (request) => {
    if (clearingId) return;
    if (!window.confirm(`Clear "${request.title}" from the log?\n\nThe GitHub issue is closed and removed from this list — the conversation stays in GitHub.`)) return;
    setClearingId(request.id);
    setRequestsStatus(null);
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', id: request.id, passphrase: pass }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { expireSession(); return; }
      if (!response.ok || !result.ok) throw new Error(result.error || `Request service returned HTTP ${response.status}.`);
      setRequests(list => list.filter(item => item.id !== request.id));
    } catch (error) {
      setRequestsStatus({ ok: false, message: error?.message || 'That request could not be cleared.' });
    } finally {
      setClearingId(0);
    }
  };

  const verifyMasterDatabase = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy(true);
    setDbResult(null);
    verifiedMasterRef.current = null;
    try {
      if (!/\.xlsm$/i.test(file.name)) throw new Error('Choose the downloaded InlandCutoffGuide .xlsm workbook.');
      const buffer = await file.arrayBuffer();
      const validation = validateMasterWorkbook(buffer);
      const hash = await sha256Hex(buffer);
      const masterPayload = buildMasterPayload(buffer, hash);
      const encodedPayload = encodePayload(masterPayload);
      if (encodedPayload.length > 60000) throw new Error('The calculator data is too large for the secure publish service.');
      let previousHash = '';
      try { previousHash = localStorage.getItem('icg-master-db-hash') || ''; } catch { /* local storage unavailable */ }
      const changed = !previousHash || previousHash !== hash;
      verifiedMasterRef.current = { file, hash, encodedPayload };
      setDbResult({
        ok: true,
        changed,
        fileName: file.name,
        fileSize: file.size,
        fileModified: file.lastModified,
        hash,
        laneCount: masterPayload.lanes.length,
        ...validation,
        message: changed
          ? (previousHash ? 'This workbook is different from the last verified copy.' : 'Valid master workbook. This is the first verified copy in this browser.')
          : 'This workbook matches the last verified copy.',
      });
    } catch (error) {
      setDbResult({ ok: false, message: error?.message || 'The workbook could not be verified.' });
    } finally {
      setBusy(false);
    }
  };

  const saveVerifiedMaster = async () => {
    const verified = verifiedMasterRef.current;
    if (!verified || busy) return;
    setBusy(true);
    try {
      // Saving a local copy is a convenience, not a gate — if the manager
      // cancels the Save dialog we must still publish, otherwise the whole
      // update silently dies with nothing sent to GitHub.
      let savedCopy = false;
      try {
        if (window.showSaveFilePicker) {
          const handle = await window.showSaveFilePicker({
            suggestedName: 'InlandCutoffGuideMASTER.xlsm',
            types: [{
              description: 'Excel Macro-Enabled Workbook',
              accept: { 'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(verified.file);
          await writable.close();
        } else {
          const url = URL.createObjectURL(verified.file);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'InlandCutoffGuideMASTER.xlsm';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        savedCopy = true;
      } catch (saveErr) {
        // A cancelled Save dialog (AbortError) is fine — publish anyway. A real
        // save failure is surfaced by the outer catch.
        if (saveErr?.name !== 'AbortError') throw saveErr;
      }
      setDbResult(current => ({
        ...current,
        saved: savedCopy,
        message: savedCopy
          ? 'Verified copy saved. Publishing the calculator data now…'
          : 'Publishing the calculator data now…',
      }));

      const publishResponse = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: pass, action: 'publish-master', payload: verified.encodedPayload }),
      });
      const publishResult = await publishResponse.json().catch(() => ({}));
      if (!publishResponse.ok || !publishResult.ok) {
        throw new Error(publishResult.error || `Live publish service returned HTTP ${publishResponse.status}.`);
      }
      const publishedAt = new Date().toISOString();
      try {
        localStorage.setItem('icg-master-db-hash', verified.hash);
        localStorage.setItem('icg-master-db-updated-at', publishedAt);
      } catch { /* local storage unavailable */ }
      window.dispatchEvent(new CustomEvent('icg-master-db-updated', { detail: publishedAt }));
      setDbResult(current => ({
        ...current,
        changed: false,
        saved: true,
        published: true,
        message: window.showSaveFilePicker
          ? 'Verified copy saved and the live calculator update started. The new guide will deploy in a few minutes.'
          : 'Verified copy downloaded and the live calculator update started. Move the file to the approved Z: folder if needed.',
      }));
      setShowPublishObie(true);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setDbResult(current => ({ ...current, saveError: error?.message || 'The verified copy could not be saved or published.' }));
      }
    } finally {
      setBusy(false);
    }
  };

  // Every tool steps back here; the reset keeps a half-finished publish from
  // reappearing when the tool is opened again.
  const backToMenu = () => {
    setStatus(null);
    setDbResult(null);
    verifiedMasterRef.current = null;
    setView('menu');
  };

  let content = null;

  if (view === 'login') {
    content = (
      <section className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
        <div className="mb-4 rounded-xl bg-gradient-to-r from-[#002D72] to-[#0a4b9b] px-5 py-4 text-white shadow-md">
          <p className="text-lg font-extrabold">Hapag-Lloyd Managers &amp; Vibe Coders Hub</p>
          <p className="mt-1 text-sm text-white/80">Enter the manager passphrase to continue.</p>
        </div>
        <div className="relative mb-3">
          <input
            type={show ? 'text' : 'password'}
            value={pass}
            autoFocus
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') verifyAccess(); }}
            placeholder="Manager passphrase"
            className="w-full px-3 py-2 pr-11 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400"
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            aria-label={show ? 'Hide passphrase' : 'Show passphrase'}
            title={show ? 'Hide' : 'Show'}
            className="absolute inset-y-0 right-0 px-3 flex items-center text-lg text-slate-500 hover:text-slate-700"
          >
            {show ? '🙈' : '👁️'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => verifyAccess()}
          disabled={busy || !pass}
          className="w-full px-4 py-2 bg-[#002D72] text-white rounded-lg font-semibold hover:bg-[#01245c] transition disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Enter Managers Hub'}
        </button>
        {status && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{status.msg}</div>
        )}
      </section>
    );
  } else if (view === 'menu') {
    content = (
      <section className="mx-auto w-full max-w-3xl">
        <div className="rounded-xl bg-gradient-to-r from-[#002D72] to-[#0a4b9b] px-5 py-4 text-white shadow-md">
          <p className="text-base font-normal">Welcome, Hapag-Lloyd Managers</p>
          <p className="mt-1 text-sm text-white/80">Your shortcuts for keeping the Inland Guide moving.</p>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          <HubCard
            icon={HUB_ICONS.requests}
            title="Feature & change requests"
            subtitle="Review what the team is asking for, newest first"
            onClick={loadRequests}
          />
          <HubCard
            icon={HUB_ICONS.stats}
            title="Usage report"
            subtitle="Who's using the guide, trends & recent activity"
            onClick={() => setView('stats')}
          />
          <HubCard
            icon={HUB_ICONS.refresh}
            title="Update CP Rail & CN Rail ramp cuts"
            subtitle="Pull the latest published Canadian schedules"
            detail={`Last pulled: ${formatHubActivity(hubActivity.railPulledAt)}`}
            onClick={triggerRefresh}
          />
          <HubCard
            icon={HUB_ICONS.publish}
            title="Publish from the SharePoint master"
            subtitle="Verify the workbook & update the live calculator"
            detail={`Last checked: ${formatHubActivity(hubActivity.masterCheckedAt)}`}
            onClick={() => { setStatus(null); setDbResult(null); verifiedMasterRef.current = null; setView('database'); }}
          />
          <HubCard
            icon={HUB_ICONS.rename}
            title="Rename ports & terminals"
            subtitle="Change dropdown display names — codes stay linked to the master"
            onClick={() => setView('names')}
          />
          <HubCard
            icon={HUB_ICONS.toggle}
            title="Turn a lane on or off"
            subtitle="Lane activation stays in the source system"
            onClick={() => setView('lane')}
          />
          <HubCard
            icon={HUB_ICONS.news}
            title="Insider information"
            subtitle="RNA Inland Delivery Team news on SharePoint"
            href="https://hlag.sharepoint.com/sites/RegionNorthAmerica/SitePages/RNA-Inland-Delivery-Team-(IDT).aspx"
          />
        </div>
      </section>
    );
  } else if (view === 'requests') {
    content = (
      <ToolPanel title="Feature & Change Requests" onBack={backToMenu} wide>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={loadRequests}
            disabled={busy}
            className="rounded-lg bg-[#002D72] px-3 py-1.5 text-xs font-normal text-white shadow-md disabled:opacity-60"
          >
            {busy ? 'Loading…' : '↻ Refresh list'}
          </button>
        </div>

        {requestsStatus && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{requestsStatus.message}</div>
        )}

        {!busy && !requestsStatus && requests.length === 0 && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
            No requests have been submitted yet.
          </div>
        )}

        <div className="mt-4 space-y-3">
          {requests.map(request => (
            <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-700">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-orange-800">{request.type || 'Request'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${request.state === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{request.state}</span>
                  </div>
                  <h3 className="mt-2 font-medium tracking-wide text-[#002D72] dark:text-white">{request.title}</h3>
                </div>
                <time className="text-xs font-normal text-slate-500 dark:text-slate-300" dateTime={request.createdAt}>
                  {new Date(request.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{request.details}</p>

              {request.replies?.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-600">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    {request.replies.length === 1 ? '1 reply' : `${request.replies.length} replies`} from GitHub
                  </p>
                  {request.replies.map(reply => (
                    <div key={reply.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-300">
                        <span className="font-medium">{reply.author}</span>
                        <time dateTime={reply.createdAt}>
                          {new Date(reply.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </time>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{reply.body}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-600">
                <span className="font-normal text-slate-500 dark:text-slate-300">From: {request.submittedBy || 'Anonymous'}</span>
                <div className="flex flex-wrap items-center gap-3">
                  <a href={request.url} target="_blank" rel="noreferrer" className="font-normal text-[#EB6608] hover:underline">Open / reply in GitHub →</a>
                  <button
                    type="button"
                    onClick={() => clearRequest(request)}
                    disabled={clearingId === request.id}
                    className="rounded-lg border border-slate-300 px-2 py-1 font-normal text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-red-900/30"
                  >
                    {clearingId === request.id ? 'Clearing…' : '✕ Clear'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </ToolPanel>
    );
  } else if (view === 'stats') {
    content = (
      <ToolPanel title="Guide Usage" onBack={backToMenu} wide>
        <UsageStats passphrase={pass} onAuthExpired={expireSession} />
      </ToolPanel>
    );
  } else if (view === 'names') {
    content = (
      <ToolPanel title="Rename Ports & Terminals" onBack={backToMenu} wide>
        <RenameEditor pass={pass} onAuthExpired={expireSession} />
      </ToolPanel>
    );
  } else if (view === 'lane') {
    content = (
      <ToolPanel title="Lane Control" onBack={backToMenu}>
        <div className="rounded-xl border-2 border-[#EB6608] bg-orange-50 p-6 text-center shadow-inner dark:bg-slate-700">
          <div className="text-4xl" aria-hidden="true">🛠️</div>
          <p className="mt-3 text-lg font-normal text-[#002D72] dark:text-white">Please open up T9400 and make it happen.</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Lane activation and deactivation remain controlled in the source system.</p>
        </div>
      </ToolPanel>
    );
  } else if (view === 'database') {
    content = (
      <>
      <ToolPanel title="Master Database Check" onBack={backToMenu}>
        <div className="rounded-xl border-2 border-[#002D72] bg-blue-50 p-5 dark:bg-slate-700">
          <p className="text-lg font-normal text-[#002D72] dark:text-white">Secure live database update</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            No scripts or installers. The workbook stays on this computer while the browser validates its sheets and compares its fingerprint.
          </p>
        </div>

        <a
          href="https://hlag.sharepoint.com/sites/RegionNorthAmerica/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FRegionNorthAmerica%2FShared%20Documents%2FInland"
          target="_blank"
          rel="noreferrer"
          className="mt-4 block w-full rounded-lg bg-[#002D72] px-4 py-3 text-center font-normal text-white shadow-md transition hover:bg-[#01245c]"
        >
          1. Open the Inland SharePoint Folder
        </a>
        <p className="mt-2 text-center text-xs font-normal text-slate-500 dark:text-slate-400">
          Right-click InlandCutoffGuide.xlsm and select Download, then come back here to verify and save. Clicking the file itself opens it in Excel.
        </p>

        <label className={`mt-3 block w-full cursor-pointer rounded-lg bg-[#EB6608] px-4 py-3 text-center font-normal text-white shadow-md transition hover:bg-[#cf5a07] ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          {busy ? 'Verifying…' : '2. Verify Downloaded Master'}
          <input type="file" accept=".xlsm,application/vnd.ms-excel.sheet.macroEnabled.12" onChange={verifyMasterDatabase} className="sr-only" />
        </label>
        <p className="mt-2 text-center text-xs font-normal text-slate-500 dark:text-slate-400">
          Look for the file in your Downloads folder and double-click it to start the verify process.
        </p>

        {dbResult && (
          <div className={`mt-3 rounded-xl border p-4 text-sm ${dbResult.ok ? (dbResult.changed ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-800') : 'border-red-300 bg-red-50 text-red-700'}`}>
            <p className="font-extrabold">{dbResult.ok ? (dbResult.published ? '✓ Live update started' : dbResult.saved ? '✓ Verified copy saved' : dbResult.changed ? '✓ Valid — new or changed master' : '✓ Valid — matches last verified master') : 'Verification failed'}</p>
            <p className="mt-1">{dbResult.message}</p>
            {dbResult.ok && (
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="font-bold">File</dt><dd className="break-all">{dbResult.fileName}</dd>
                <dt className="font-bold">Modified</dt><dd>{new Date(dbResult.fileModified).toLocaleString()}</dd>
                <dt className="font-bold">Size</dt><dd>{Math.round(dbResult.fileSize / 1024).toLocaleString()} KB</dd>
                <dt className="font-bold">Database</dt><dd>{dbResult.databaseRows.toLocaleString()} rows / {dbResult.laneCount.toLocaleString()} live lanes</dd>
                <dt className="font-bold">Fingerprint</dt><dd className="break-all font-mono">{dbResult.hash.slice(0, 20)}…</dd>
              </dl>
            )}
            {dbResult.saveError && <p className="mt-2 font-semibold text-red-700">{dbResult.saveError}</p>}
          </div>
        )}

        {dbResult?.ok && (
          <button
            type="button"
            onClick={saveVerifiedMaster}
            disabled={busy}
            className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-3 font-normal text-white shadow-md transition hover:bg-emerald-800 disabled:opacity-60"
          >
            3. Save to Z: &amp; Publish Live Data
          </button>
        )}

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Download the workbook from SharePoint first. The workbook itself stays on this computer; only validated calculator rows are sent to the secure deployment workflow. When saving, choose Z:\InlandCutoffGuide-DontTouch.
        </p>
      </ToolPanel>
      {showPublishObie && (
        <div className="fixed inset-0 z-[140] flex flex-col items-center justify-center bg-black/55 p-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Live update complete">
          <div key={publishObieNudge ? 'nudge' : 'done'} className="joke-fade thought-bubble relative mb-6 max-w-sm rounded-2xl bg-white px-5 py-4 text-center text-base font-extrabold leading-snug text-[#002D72] shadow-2xl" role="status">
            {publishObieNudge
              ? 'Hey, click me to do more manager stuff.'
              : 'All done! Your live guide update is on the way. Have a nice day!'}
          </div>
          <button
            type="button"
            onClick={() => { setShowPublishObie(false); backToMenu(); }}
            className="rounded-full bg-transparent p-0 transition hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#EB6608]"
            aria-label="Click Obie to return to the Managers Hub"
          >
            <img src={obBot} alt="Obie" className="obie-confirm-pop obie-float w-56 max-w-[70vw] drop-shadow-2xl" />
          </button>
        </div>
      )}
      </>
    );
  } else {
    content = (
      <ToolPanel title="Update Rail Ramp Cuts" onBack={backToMenu}>
        <div className="rounded-xl border-2 border-[#002D72] bg-slate-50 p-6 text-center dark:bg-slate-700">
          <div className="text-4xl" aria-hidden="true">🚆</div>
          <p className="mt-3 font-normal text-[#002D72] dark:text-white">CP Rail &amp; CN Rail ramp cuts</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{busy ? 'Contacting GitHub…' : 'Refresh request submitted.'}</p>
        </div>
        {status && (
          <div className={`mt-3 p-3 rounded-lg text-sm border ${status.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {status.msg}
          </div>
        )}
      </ToolPanel>
    );
  }

  return (
    <div className="min-h-screen bg-[#EDE6D6] px-4 py-6 dark:bg-slate-900">
      <div className="mx-auto w-full max-w-4xl">
        <header className="sticky top-2 z-40 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E0D8C5] bg-[#F8F3EA]/95 px-4 py-3 shadow-md backdrop-blur dark:border-slate-700 dark:bg-slate-800/95 sm:px-5">
          <div>
            <h1 className="text-xl font-bold text-[#002D72] smallcaps txt-shadow-heavy dark:text-white">Managers Hub</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Inland Cutoff Guide administration</p>
          </div>
          <button
            type="button"
            onClick={exitToGuide}
            className="rounded-full bg-[#002D72] px-4 py-1.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#01245c]"
          >
            ← Back to the guide
          </button>
        </header>
        {content}
      </div>
    </div>
  );
}
