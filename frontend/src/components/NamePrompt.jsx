// Name capture and editing, remembered in localStorage. If the user clears
// browsing data the welcome prompt simply reappears; old log rows keep the
// name they were recorded under.

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'inlandguide.userName';

export function getUserName() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

export default function NamePrompt({ open, initialName = '', onSave, onClose }) {
  const [draft, setDraft] = useState(initialName);

  useEffect(() => {
    if (open) setDraft(initialName);
  }, [initialName, open]);

  if (!open) return null;

  const save = () => {
    const clean = draft.trim().slice(0, 80);
    if (!clean) return;
    try { localStorage.setItem(STORAGE_KEY, clean); } catch { /* private mode */ }
    onSave(clean);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="name-prompt-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && initialName) onClose?.();
      }}
    >
      <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
        {initialName && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close name editor"
            title="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
          >
            &times;
          </button>
        )}
        <h2 className="text-lg font-semibold text-[#002D72] dark:text-white">
          <span id="name-prompt-title">
            {initialName ? 'Change your name' : 'Welcome to the Inland Cutoff Guide'}
          </span>
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {initialName
            ? 'Future calculations will be recorded under this name.'
            : <>Enter your name so your calculations are recorded. You&apos;ll only be asked once on this computer.</>}
        </p>
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="First and last name"
          maxLength={80}
          aria-label="Your name"
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        />
        <button
          type="button"
          onClick={save}
          disabled={!draft.trim()}
          className="mt-4 w-full rounded-lg bg-[#002D72] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#01245c] disabled:opacity-40"
        >
          {initialName ? 'Save name' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
