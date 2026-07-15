import React, { useState, useEffect, useRef } from 'react';

// Type-to-filter dropdown (combobox). Filters options by substring as you type;
// pick with mouse, Arrow keys + Enter, and close on Esc / click-away. Keeps a
// hidden underlying value so callers still get the exact selected value.
// Options may include group headers: { header: 'Canada Ports' } — non-selectable,
// skipped by keyboard nav, and hidden when their section has no matches.
const isHeader = (o) => o && o.header !== undefined;

export default function Combobox({ value, onSelect, options, placeholder, disabled, required }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selectedLabel = options.find(o => !isHeader(o) && o.value === value)?.label || '';

  // Keep the box showing the current selection unless the user is actively typing.
  useEffect(() => { setQuery(selectedLabel); }, [selectedLabel]);

  // Searchable text can include a visible sub-line and/or hidden search aliases.
  // Hidden aliases keep wide search useful without cluttering ordinary results.
  const searchText = (o) => `${o.label} ${o.sub || ''} ${o.search || ''}`.toLowerCase();

  // Match on any substring of the label/sub — so "nyc" finds "USNYC" and "york"
  // finds "NEW YORK, NY - USNYC" — every space-separated term must appear. Keep a
  // header only when its section still has a visible item under it.
  const computeFiltered = (q) => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (q === selectedLabel || !terms.length) return options;
    const matches = new Set(options.filter(o => !isHeader(o) && terms.every(t => searchText(o).includes(t))));
    const out = [];
    for (let i = 0; i < options.length; i++) {
      const o = options[i];
      if (isHeader(o)) {
        let has = false;
        for (let j = i + 1; j < options.length && !isHeader(options[j]); j++) {
          if (matches.has(options[j])) { has = true; break; }
        }
        if (has) out.push(o);
      } else if (matches.has(o)) {
        out.push(o);
      }
    }
    return out;
  };
  const filtered = computeFiltered(query);
  const firstSelectable = () => filtered.findIndex(o => !isHeader(o));

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery(selectedLabel); // discard any half-typed text
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [selectedLabel]);

  const choose = (opt) => { if (isHeader(opt)) return; onSelect(opt.value); setQuery(opt.label); setOpen(false); };
  // Move the highlight to the next selectable (non-header) row.
  const step = (dir) => setActiveIdx(cur => {
    let i = cur;
    for (let n = 0; n < filtered.length; n++) {
      i += dir;
      if (i < 0 || i >= filtered.length) return cur;
      if (!isHeader(filtered[i])) return i;
    }
    return cur;
  });

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        disabled={disabled}
        required={required && !value}
        value={query}
        placeholder={placeholder}
        onFocus={(e) => { setOpen(true); const f = firstSelectable(); setActiveIdx(f < 0 ? 0 : f); e.target.select(); }}
        // Selecting an option leaves this input focused, so a second click does
        // not fire onFocus again. Reopen the full list on that repeat click.
        onClick={(e) => {
          if (!open) {
            setQuery(selectedLabel);
            setOpen(true);
            const selectedIdx = options.findIndex(o => !isHeader(o) && o.value === value);
            setActiveIdx(selectedIdx >= 0 ? selectedIdx : Math.max(0, firstSelectable()));
          }
          e.target.select();
        }}
        onBlur={() => { setOpen(false); setQuery(selectedLabel); }}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v); setOpen(true);
          const f = computeFiltered(v).findIndex(o => !isHeader(o));
          setActiveIdx(f < 0 ? 0 : f);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); step(1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
          else if (e.key === 'Enter' && open && filtered[activeIdx] && !isHeader(filtered[activeIdx])) { e.preventDefault(); choose(filtered[activeIdx]); }
          else if (e.key === 'Escape') { setOpen(false); setQuery(selectedLabel); }
        }}
        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-slate-400 bg-white disabled:bg-slate-400 disabled:border-slate-500 disabled:text-slate-600 disabled:placeholder-slate-600 disabled:cursor-not-allowed"
      />
      {open && !disabled && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg text-left">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">No matches</li>
          )}
          {filtered.map((o, i) => (
            isHeader(o) ? (
              <li key={'h' + i} className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 border-t border-slate-100 first:border-t-0 select-none">
                {o.header}
              </li>
            ) : (
              <li
                key={o.value}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                className={`px-3 py-2 text-sm cursor-pointer ${i === activeIdx ? 'bg-slate-100' : ''} ${o.value === value ? 'font-semibold text-[#002D72]' : 'text-slate-800'}`}
              >
                <div>{o.label}</div>
                {o.sub && <div className="text-[11px] text-slate-400 leading-tight mt-0.5">{o.sub}</div>}
              </li>
            )
          ))}
        </ul>
      )}
    </div>
  );
}
