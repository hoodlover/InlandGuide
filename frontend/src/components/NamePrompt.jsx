// Name + email capture and editing, remembered in localStorage. If the user
// clears browsing data the welcome prompt simply reappears; old log rows keep
// the values they were recorded under. Email is the stable identity for usage
// stats — it merges people who type their name differently between visits.

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'inlandguide.userName';
const EMAIL_STORAGE_KEY = 'inlandguide.userEmail';

export function getUserName() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

export function getUserEmail() {
  try { return localStorage.getItem(EMAIL_STORAGE_KEY) || ''; } catch { return ''; }
}

// Loose shape check only — the goal is a usable merge key, not RFC validation.
function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export default function NamePrompt({ open, initialName = '', initialEmail = '', onSave, onClose }) {
  const [draft, setDraft] = useState(initialName);
  const [emailDraft, setEmailDraft] = useState(initialEmail);

  // Returning users get both fields prefilled so an edit is one keystroke away.
  useEffect(() => {
    if (open) {
      setDraft(initialName);
      setEmailDraft(initialEmail);
    }
  }, [initialName, initialEmail, open]);

  if (!open) return null;

  const editing = Boolean(initialName);
  const cleanName = draft.trim().slice(0, 80);
  const cleanEmail = emailDraft.trim().toLowerCase().slice(0, 120);
  const canSave = Boolean(cleanName) && looksLikeEmail(cleanEmail);

  const save = () => {
    if (!canSave) return;
    try {
      localStorage.setItem(STORAGE_KEY, cleanName);
      localStorage.setItem(EMAIL_STORAGE_KEY, cleanEmail);
    } catch { /* private mode */ }
    onSave(cleanName, cleanEmail);
  };

  const onEnter = (e) => { if (e.key === 'Enter') save(); };
  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="name-prompt-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && editing) onClose?.();
      }}
    >
      <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
        {editing && (
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
            {editing ? 'Your name & email' : 'Welcome to the Inland Rail Cutoff Guide'}
          </span>
        </h2>
        {editing && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Update your name or work email.</p>
        )}
        <label className="mt-4 block text-xs font-semibold text-slate-500 dark:text-slate-300">
          Name
          <input
            autoFocus={!initialName}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onEnter}
            placeholder="First and last name"
            maxLength={80}
            aria-label="Your name"
            className={inputClass}
          />
        </label>
        <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-300">
          Work email
          <input
            autoFocus={Boolean(initialName) && !initialEmail}
            type="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            onKeyDown={onEnter}
            placeholder="you@hlag.com"
            maxLength={120}
            autoComplete="email"
            aria-label="Your work email"
            className={inputClass}
          />
        </label>
        {emailDraft.trim() && !looksLikeEmail(cleanEmail) && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">That doesn&apos;t look like a full email address yet.</p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="mt-4 w-full rounded-lg bg-[#002D72] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#01245c] disabled:opacity-40"
        >
          {editing ? 'Save' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
