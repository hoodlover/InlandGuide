// New-version watcher for long-lived open sessions (people keep the guide
// open for days). Polls the deployed version.json every 10 minutes and on
// window focus; when it differs from the version baked into this bundle,
// shows a refresh toast. Clicking it clears caches and reloads — the same
// steps as the managers-hub "Refresh Updated Data" button.

import { useEffect, useState } from 'react';
import versionData from '../version.json';

const POLL_MS = 10 * 60 * 1000;
const FOCUS_THROTTLE_MS = 60 * 1000;

export default function UpdateToast() {
  const [newVersion, setNewVersion] = useState('');

  useEffect(() => {
    // The offline double-click build (file://) and localhost dev have no
    // deployed version.json worth comparing against.
    if (!location.protocol.startsWith('http')) return undefined;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return undefined;

    let stopped = false;
    let lastCheck = 0;

    const check = async () => {
      const now = Date.now();
      if (now - lastCheck < FOCUS_THROTTLE_MS) return;
      lastCheck = now;
      try {
        // Query string busts the pre-v8 service worker's cache-first handling.
        const r = await fetch(`./version.json?_=${now}`, { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        if (!stopped && data.version && data.version !== versionData.version) {
          setNewVersion(data.version);
        }
      } catch { /* offline or blocked — try again next round */ }
    };

    const timer = setInterval(check, POLL_MS);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  if (!newVersion) return null;

  const refresh = async () => {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      }
    } catch { /* a normal network-first reload still runs below */ }
    window.location.reload();
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-xl bg-[#002D72] px-4 py-3 text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
        <span className="text-xl" aria-hidden="true">✨</span>
        <span className="text-sm">
          A new version of the guide is ready
          <span className="ml-1 font-mono text-xs text-white/60">v {newVersion}</span>
        </span>
        <button
          type="button"
          onClick={refresh}
          className="rounded-full bg-[#EB6608] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#cf5a07]"
        >
          Refresh now
        </button>
        <button
          type="button"
          onClick={() => setNewVersion('')}
          aria-label="Dismiss update notice"
          title="Dismiss"
          className="text-white/60 transition hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
