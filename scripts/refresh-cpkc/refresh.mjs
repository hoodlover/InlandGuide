// Downloads each configured CPKC port-schedule PDF, parses the table by text
// x/y coordinates, and writes a JSON snapshot the frontend bundles at build time.
//
// The layout is an Excel->PDF export: every table cell is emitted as a single
// text run and columns sit at stable x-positions. Each page repeats a header row
// whose labels give us the column anchors; we assign every data cell to its
// nearest anchor. Column positions differ per port (Montreal vs Vancouver have
// different cities, and Vancouver has no "Vessel ETD"), so nothing is hardcoded.
//
// A city cell may be legitimately blank (a vessel that doesn't serve that inland
// point), so blanks are allowed. What we DO reject as a parse error: two values
// colliding in one city column, or a non-datetime landing in a city column —
// those signal a real misalignment, and we fail the refresh loudly.
//
// Local runs behind a TLS-intercepting corporate proxy can point at pre-saved
// PDFs instead of fetching: set CPKC_PDF_DIR=/path (files named "<slug>.pdf").

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../../frontend/src/data/cpkc-schedules.json');
const ports = JSON.parse(readFileSync(join(__dirname, 'ports.json'), 'utf8'));

const ROW_TOL = 3;               // items within this many y-units share a row
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A cutoff cell looks like "Mon 29-Jun 18:30"; ETA/ETD/Rail-Port cells like "Tue 7-Jul".
const DATETIME_RE = /^[A-Z][a-z]{2}\s+\d{1,2}-[A-Z][a-z]{2}\s+\d{1,2}:\d{2}$/;

async function loadPages(data) {
  const doc = await getDocument({ data }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(content.items
      .filter(it => it.str && it.str.trim())
      .map(it => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() })));
  }
  return pages;
}

// Group items into rows (by y) then order each row left-to-right.
function toRows(items) {
  const sorted = [...items].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const rows = [];
  let cur = null;
  for (const it of sorted) {
    if (!cur || Math.abs(it.y - cur.y) > ROW_TOL) {
      cur = { y: it.y, items: [] };
      rows.push(cur);
    }
    cur.items.push(it);
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

function nearestAnchor(x, anchors) {
  let best = anchors[0], bestD = Infinity;
  for (const a of anchors) {
    const d = Math.abs(a.x - x);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

// Derive the column anchors from a page's header row.
function headerAnchors(rows) {
  const headerRow = rows.find(r => r.items.some(it => /^Vessel Name$/i.test(it.s)));
  if (!headerRow) return null;
  const anchors = headerRow.items.map(it => ({ label: it.s, x: it.x }));
  const comments = anchors.find(a => /^Comments$/i.test(a.label));
  if (!comments) return null;
  const cityAnchors = anchors.filter(a => a.x > comments.x);
  return {
    headerY: headerRow.y,
    anchors,
    comments,
    cityAnchors,
    cities: cityAnchors.map(a => a.label),
    labelOf: {
      vessel: anchors.find(a => /^Vessel Name$/i.test(a.label)),
      terminal: anchors.find(a => /^Terminal$/i.test(a.label)),
      eta: anchors.find(a => /^Vessel ETA$/i.test(a.label)),
      etd: anchors.find(a => /^Vessel ETD$/i.test(a.label)),
      railPortCutoff: anchors.find(a => /Rail Port/i.test(a.label)),
      comments
    }
  };
}

// Parse the vessel rows below the header on one page.
function parseVessels(rows, h, slug, errors) {
  const out = [];
  for (const r of rows) {
    if (r.y >= h.headerY) continue; // header + anything above it
    const cutoffItems = r.items.filter(it => DATETIME_RE.test(it.s) && it.x > h.comments.x);
    if (cutoffItems.length === 0) continue; // not a data row

    const bucket = new Map(); // label -> [{x,s}]
    for (const it of r.items) {
      const a = nearestAnchor(it.x, h.anchors);
      if (!bucket.has(a.label)) bucket.set(a.label, []);
      bucket.get(a.label).push(it);
    }
    // The vessel column also catches far-left service codes / junk; the real
    // vessel is the item nearest the rest of the row (rightmost in its bucket).
    const vesselItems = (h.labelOf.vessel && bucket.get(h.labelOf.vessel.label)) || [];
    const vessel = vesselItems.length ? vesselItems.reduce((a, b) => (b.x > a.x ? b : a)).s : '';
    if (!vessel) continue;

    const val = (anchor) => {
      const items = (anchor && bucket.get(anchor.label)) || [];
      return items.map(i => i.s).join(' ').trim();
    };

    const cutoffs = {};
    for (const ca of h.cityAnchors) {
      const items = bucket.get(ca.label) || [];
      if (items.length > 1) {
        errors.push(`  ${vessel}: ${items.length} values collided in "${ca.label}" [${items.map(i => i.s).join(' | ')}]`);
      }
      const v = items.map(i => i.s).join(' ').trim();
      if (v && !DATETIME_RE.test(v)) {
        errors.push(`  ${vessel}: non-date value "${v}" in "${ca.label}"`);
      }
      cutoffs[ca.label] = DATETIME_RE.test(v) ? v : '';
    }

    out.push({
      vessel,
      terminal: val(h.labelOf.terminal),
      eta: val(h.labelOf.eta),
      etd: val(h.labelOf.etd),
      railPortCutoff: val(h.labelOf.railPortCutoff),
      comments: val(h.labelOf.comments),
      cutoffs
    });
  }
  return out;
}

// "2026-07-08" -> "Wed 8-Jul"
function isoToRunDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y) return '';
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]} ${d}-${MONTH_NAMES[m - 1]}`;
}

function parse(pages, slug, name) {
  const pageRows = pages.map(toRows);

  // Header/notes/run-date come from the first page that has a header.
  let head = null, headPageIdx = 0;
  for (let i = 0; i < pageRows.length; i++) {
    const h = headerAnchors(pageRows[i]);
    if (h) { head = h; headPageIdx = i; break; }
  }
  if (!head) throw new Error(`[${slug}] could not find a header row ("Vessel Name")`);
  if (head.cities.length === 0) throw new Error(`[${slug}] no rail-city columns right of "Comments"`);

  // Run timestamp -> generatedAt (ISO). Search all pages' raw items.
  let generatedAt = '';
  for (const items of pages) {
    const stamp = items.find(it => /^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}\s+\d{1,2}:\d{2}$/.test(it.s));
    if (stamp) {
      const [mon, day, year] = stamp.s.split(/\s+/);
      generatedAt = `${year}-${String(MONTHS[mon] + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
      break;
    }
  }

  // Run date: prefer an explicit "Www D-Mon" near "Run Date:", else derive it.
  let runDate = '';
  const runRow = pageRows[headPageIdx].find(r => r.items.some(it => /^Run Date:?$/i.test(it.s)));
  if (runRow) {
    const rd = runRow.items.find(it => /^[A-Z][a-z]{2}\s+\d{1,2}-[A-Z][a-z]{2}$/.test(it.s));
    if (rd) runDate = rd.s;
  }
  if (!runDate) runDate = isoToRunDate(generatedAt);

  // Notes (bullet lines above the header) from the header page.
  const notes = [];
  for (const r of pageRows[headPageIdx]) {
    if (r.y <= head.headerY) continue;
    const line = r.items.map(it => it.s).join(' ').replace(/\s+/g, ' ').trim();
    if (!line.includes('•')) continue;
    line.split(/\s*•\s*/).map(s => s.trim().replace(/^NOTES:\s*/i, '').trim())
      .filter(s => s && !/^NOTES:?$/i.test(s))
      .forEach(s => notes.push(s));
  }

  // Data rows from every page (each page repeats the header; re-anchor per page
  // so slight x drift between pages doesn't matter).
  const errors = [];
  const vessels = [];
  for (const rows of pageRows) {
    const h = headerAnchors(rows) || head;
    vessels.push(...parseVessels(rows, h, slug, errors));
  }

  if (!vessels.length) throw new Error(`[${slug}] parsed zero vessel rows`);
  if (errors.length) {
    throw new Error(`[${slug}] validation failed for ${errors.length} row(s):\n${errors.join('\n')}`);
  }

  return { name, runDate, generatedAt, cities: head.cities, notes, vessels };
}

async function fetchPdf(port) {
  if (process.env.CPKC_PDF_DIR) {
    const p = join(process.env.CPKC_PDF_DIR, `${port.slug}.pdf`);
    console.log(`[${port.slug}] reading local ${p}`);
    return new Uint8Array(readFileSync(p));
  }
  console.log(`[${port.slug}] fetching ${port.url}`);
  const res = await fetch(port.url);
  if (!res.ok) throw new Error(`[${port.slug}] HTTP ${res.status} fetching ${port.url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main() {
  const out = { generatedAt: '', ports: {} };
  for (const port of ports) {
    const data = await fetchPdf(port);
    const pages = await loadPages(data);
    const parsed = parse(pages, port.slug, port.name);
    out.ports[port.slug] = parsed;
    if (parsed.generatedAt && parsed.generatedAt > out.generatedAt) out.generatedAt = parsed.generatedAt;
    console.log(`[${port.slug}] OK — ${parsed.vessels.length} vessels, ${parsed.cities.length} cities, run ${parsed.runDate}`);
  }
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
