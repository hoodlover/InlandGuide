import React, { useState, useEffect, useRef } from 'react';

// Type-to-filter dropdown (combobox). Filters options by substring as you type;
// pick with mouse, Arrow keys + Enter, and close on Esc / click-away. Keeps a
// hidden underlying value so callers still get the exact selected value.
export default function Combobox({ value, onSelect, options, placeholder, disabled, required }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  // Keep the box showing the current selection unless the user is actively typing.
  useEffect(() => { setQuery(selectedLabel); }, [selectedLabel]);

  // Untouched (query still equals the selection) shows the full list; typing filters.
  // Match on any substring of the label — so "nyc" finds "USNYC" and "york" finds
  // "NEW YORK, NY - USNYC" — and require every space-separated term to appear.
  const typing = query !== selectedLabel;
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = (typing && terms.length)
    ? options.filter(o => { const l = o.label.toLowerCase(); return terms.every(t => l.includes(t)); })
    : options;

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

  const choose = (opt) => { onSelect(opt.value); setQuery(opt.label); setOpen(false); };

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
        onFocus={(e) => { setOpen(true); setActiveIdx(0); e.target.select(); }}
        onBlur={() => { setOpen(false); setQuery(selectedLabel); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIdx(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter' && open && filtered[activeIdx]) { e.preventDefault(); choose(filtered[activeIdx]); }
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
            <li
              key={o.value}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              className={`px-3 py-2 text-sm cursor-pointer ${i === activeIdx ? 'bg-slate-100' : ''} ${o.value === value ? 'font-semibold text-[#002D72]' : 'text-slate-800'}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
