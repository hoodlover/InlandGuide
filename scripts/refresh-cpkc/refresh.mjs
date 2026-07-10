// Downloads each configured CPKC port-schedule PDF, parses the table by text
// x/y coordinates, and writes a JSON snapshot the frontend bundles at build time.
//
// The layout is an Excel->PDF export: every table cell is emitted as a single
// text run, columns sit at stable x-positions, and the header row gives us the
// column anchors. We bucket each data cell to its nearest header anchor. Blank
// cells therefore surface as MISSING values, which the validation step rejects
// (better to fail the refresh loudly than ship a mis-aligned schedule).
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

// x below this is the left margin (row-group labels like "Route 2"/"Med A" and
// stray spreadsheet junk) — never a real column.
const LEFT_FLOOR = 70;
const ROW_TOL = 3;               // items within this many y-units share a row
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// A cutoff cell looks like "Mon 29-Jun 18:30"; ETA/ETD/Rail-Port cells like "Tue 7-Jul".
const DATETIME_RE = /^[A-Z][a-z]{2}\s+\d{1,2}-[A-Z][a-z]{2}\s+\d{1,2}:\d{2}$/;
const ROUTE_RE = /^(Route\s*\d+|Med\s+[A-Z])$/i;

async function loadItems(data) {
  const doc = await getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .filter(it => it.str && it.str.trim())
    .map(it => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() }));
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

// Assign a data item to the header anchor whose x is nearest.
function nearestAnchor(x, anchors) {
  let best = anchors[0], bestD = Infinity;
  for (const a of anchors) {
    const d = Math.abs(a.x - x);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

function parse(data, slug, name) {
  return loadItems(data).then(items => {
    const rows = toRows(items);

    // --- Run date + generated timestamp (top of sheet) -----------------------
    // e.g. row: "Wed 8-Jul"  "Run Date:"  "Jul 08 2026 10:47"
    let runDate = '', generatedAt = '';
    const stamp = items.find(it => /^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}\s+\d{1,2}:\d{2}$/.test(it.s));
    if (stamp) {
      const [mon, day, year] = stamp.s.split(/\s+/);
      generatedAt = `${year}-${String(MONTHS[mon] + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
    }
    const runRow = rows.find(r => r.items.some(it => /^Run Date:?$/i.test(it.s)));
    if (runRow) {
      const rd = runRow.items.find(it => /^[A-Z][a-z]{2}\s+\d{1,2}-[A-Z][a-z]{2}$/.test(it.s));
      if (rd) runDate = rd.s;
    }

    // --- Header row -> column anchors ---------------------------------------
    const headerRow = rows.find(r => r.items.some(it => /^Vessel Name$/i.test(it.s)));
    if (!headerRow) throw new Error(`[${slug}] could not find the header row ("Vessel Name")`);
    const anchors = headerRow.items.filter(it => it.x >= LEFT_FLOOR).map(it => ({ label: it.s, x: it.x }));
    const commentsAnchor = anchors.find(a => /^Comments$/i.test(a.label));
    if (!commentsAnchor) throw new Error(`[${slug}] header is missing the "Comments" column`);
    // Everything to the right of Comments is an inland rail-city cutoff column.
    const cityAnchors = anchors.filter(a => a.x > commentsAnchor.x);
    const cities = cityAnchors.map(a => a.label);
    if (cities.length === 0) throw new Error(`[${slug}] no rail-city columns found right of "Comments"`);

    const labelOf = {
      vessel: anchors.find(a => /^Vessel Name$/i.test(a.label)),
      terminal: anchors.find(a => /^Terminal$/i.test(a.label)),
      eta: anchors.find(a => /^Vessel ETA$/i.test(a.label)),
      etd: anchors.find(a => /^Vessel ETD$/i.test(a.label)),
      railPortCutoff: anchors.find(a => /Rail Port/i.test(a.label)),
      comments: commentsAnchor
    };

    // --- Notes (bullet lines above the table) --------------------------------
    const notes = [];
    for (const r of rows) {
      if (r.y <= headerRow.y) continue;
      const line = r.items.map(it => it.s).join(' ').replace(/\s+/g, ' ').trim();
      // Split the merged "• A • B" runs into separate bullets.
      if (!line.includes('•')) continue;
      line.split(/\s*•\s*/).map(s => s.trim().replace(/^NOTES:\s*/i, '').trim())
        .filter(s => s && !/^NOTES:?$/i.test(s))
        .forEach(s => notes.push(s));
    }

    // --- Data rows -----------------------------------------------------------
    const vessels = [];
    const errors = [];
    for (const r of rows) {
      if (r.y >= headerRow.y) continue; // header + everything above it
      const cells = r.items.filter(it => it.x >= LEFT_FLOOR && !ROUTE_RE.test(it.s));
      // A data row is one that carries city cutoff datetimes.
      const cutoffItems = cells.filter(it => DATETIME_RE.test(it.s) && it.x > commentsAnchor.x);
      if (cutoffItems.length === 0) continue;

      // Bucket every cell to its nearest header anchor.
      const bucket = new Map(); // label -> [strings]
      for (const it of cells) {
        const a = nearestAnchor(it.x, anchors);
        if (!bucket.has(a.label)) bucket.set(a.label, []);
        bucket.get(a.label).push(it.s);
      }
      const val = (anchor) => (anchor && bucket.get(anchor.label) || []).join(' ').trim();

      const vessel = val(labelOf.vessel);
      if (!vessel) continue; // group-label-only or spacer row

      const cutoffs = {};
      for (const ca of cityAnchors) cutoffs[ca.label] = (bucket.get(ca.label) || []).join(' ').trim();

      // Validation: every city must have exactly one datetime value.
      const missing = cities.filter(c => !cutoffs[c] || !DATETIME_RE.test(cutoffs[c]));
      if (missing.length) {
        errors.push(`  ${vessel}: missing/invalid cutoff for [${missing.join(', ')}]`);
      }

      vessels.push({
        vessel,
        terminal: val(labelOf.terminal),
        eta: val(labelOf.eta),
        etd: val(labelOf.etd),
        railPortCutoff: val(labelOf.railPortCutoff),
        comments: val(labelOf.comments),
        cutoffs
      });
    }

    if (!vessels.length) throw new Error(`[${slug}] parsed zero vessel rows`);
    if (errors.length) {
      throw new Error(`[${slug}] validation failed for ${errors.length} row(s):\n${errors.join('\n')}`);
    }

    return { name, runDate, generatedAt, cities, notes, vessels };
  });
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
    const parsed = await parse(data, port.slug, port.name);
    out.ports[port.slug] = parsed;
    if (parsed.generatedAt && parsed.generatedAt > out.generatedAt) out.generatedAt = parsed.generatedAt;
    console.log(`[${port.slug}] OK — ${parsed.vessels.length} vessels, ${parsed.cities.length} cities, run ${parsed.runDate}`);
  }
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
