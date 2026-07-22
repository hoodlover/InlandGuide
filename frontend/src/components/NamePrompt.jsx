// First-visit name capture, remembered in localStorage. If the user clears
// browsing data the prompt simply reappears; old log rows keep the name they
// were recorded under.

import { useState } from 'react';

const STORAGE_KEY = 'inlandguide.userName';

export function getUserName() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

export default function NamePrompt() {
  const [userName, setUserName] = useState(getUserName);
  const [draft, setDraft] = useState('');

  if (userName) return null;

  const save = () => {
    const clean = draft.trim();
    if (!clean) return;
    try { localStorage.setItem(STORAGE_KEY, clean); } catch { /* private mode */ }
    setUserName(clean);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
        <h2 className="text-lg font-semibold text-[#002D72] dark:text-white">
          Welcome to the Inland Cutoff Guide
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Enter your name so your calculations are recorded. You&apos;ll only be
          asked once on this computer.
        </p>
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="First and last name"
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        />
        <button
          type="button"
          onClick={save}
          disabled={!draft.trim()}
          className="mt-4 w-full rounded-lg bg-[#002D72] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#01245c] disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
