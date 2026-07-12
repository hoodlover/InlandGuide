import React, { useState, useEffect, useRef } from 'react';
import LookupForm from './components/LookupForm';
import PortScheduleLookup from './components/PortScheduleLookup';
import { bannerBottom, obBot } from './assets/banners';
import heroTop from './assets/hero-top.webp';
import themeSunset from './assets/theme-sunset.webp';
import themeShip from './assets/theme-ship.webp';
import themeHelp from './assets/theme-help.webp';
import './index.css';

import versionData from './version.json'; // committed; regenerate with `node gen-version.mjs`
const APP_VERSION = versionData.version;

// Proof-of-concept block for phones/tablets (soft — can be bypassed via "desktop site").
function isMobileDevice() {
  const ua = navigator.userAgent || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i.test(ua);
}

// OB the OPS-BASE BOT keeps the crowd entertained. A mix of on-brand cargo puns
// and real dad jokes (courtesy of icanhazdadjoke.com).
const OB_JOKES = [
  // On-brand cargo / rail
  "Why did the container break up with the ship? It just needed more space.",
  "I'd tell you a joke about rail schedules, but it might not arrive on time.",
  "Why don't cargo ports ever feel lonely? They're always full of vessels.",
  "Why did the train conductor get the promotion? He had all the right connections.",
  "What did the dock say to the departing ship? 'Long time no sea.'",
  "How does a locomotive stay in shape? It just chugs along.",
  "Why don't you ever trust a cutoff date? It changes at the last minute.",
  "What's a pirate's favorite part of the port? The ARRR-rival.",
  "I wanted a career in reefer cargo, but it was too cool for me.",
  "Why did the crane get an award? It was truly outstanding in its field.",
  // Real dad jokes
  "I'm tired of following my dreams. I'm just going to ask where they're going and meet up later.",
  "Did you hear about the guy whose whole left side was cut off? He's all right now.",
  "Why didn't the skeleton cross the road? Because he had no guts.",
  "What did one nut say as he chased another nut? I'm a cashew!",
  "Where do fish keep their money? In the riverbank.",
  "Dermatologists are always in a hurry — they spend all day making rash decisions.",
  "I knew I shouldn't steal a mixer from work, but it was a whisk I was willing to take.",
  "How come the stadium got hot after the game? All the fans left.",
  "Why do seagulls fly over the ocean? If they flew over the bay, we'd call them bagels.",
  "Why was it called the Dark Ages? Because of all the knights.",
  "A steak pun is a rare medium well done.",
  "Why did the tomato blush? It saw the salad dressing.",
  "What's smarter than a talking parrot? A spelling bee.",
  "My first time using an elevator was uplifting. The second time let me down.",
  "Why do birds fly south for the winter? Because it's too far to walk.",
  // 50 more dad jokes
  "I only know 25 letters of the alphabet. I don't know y.",
  "What do you call a fish with no eyes? A fsh.",
  "I'm reading a book about anti-gravity. It's impossible to put down.",
  "Did you hear about the restaurant on the moon? Great food, no atmosphere.",
  "Why don't scientists trust atoms? They make up everything.",
  "I used to hate facial hair, but then it grew on me.",
  "What do you call cheese that isn't yours? Nacho cheese.",
  "I'm on a seafood diet. I see food and I eat it.",
  "What did the ocean say to the beach? Nothing, it just waved.",
  "Why can't your nose be 12 inches long? Because then it'd be a foot.",
  "I would tell you a construction joke, but I'm still working on it.",
  "What do you call a bear with no teeth? A gummy bear.",
  "How do you organize a space party? You planet.",
  "What do you call a factory that makes okay products? A satisfactory.",
  "I don't trust stairs. They're always up to something.",
  "What's brown and sticky? A stick.",
  "Why did the coffee file a police report? It got mugged.",
  "How do you make a tissue dance? You put a little boogie in it.",
  "I bought some shoes from a drug dealer. I don't know what he laced them with, but I was tripping all day.",
  "What do you call a pile of cats? A meow-tain.",
  "Why did the golfer bring two pairs of pants? In case he got a hole in one.",
  "What's orange and sounds like a parrot? A carrot.",
  "I used to play piano by ear, but now I use my hands.",
  "Why did the math book look sad? It had too many problems.",
  "What did the buffalo say to his son when he left? Bison.",
  "Why don't eggs tell jokes? They'd crack each other up.",
  "I made a pencil with two erasers. It was pointless.",
  "What do you call a dinosaur that crashes his car? Tyrannosaurus wrecks.",
  "How does the moon cut his hair? Eclipse it.",
  "Why did the picture go to jail? It was framed.",
  "What do you call a sleeping bull? A bulldozer.",
  "I told my suitcase there'd be no vacation this year. Now I'm dealing with emotional baggage.",
  "What do you call fake spaghetti? An impasta.",
  "Why did the cookie go to the doctor? It was feeling crummy.",
  "How do you catch a squirrel? Climb a tree and act like a nut.",
  "What kind of shoes do ninjas wear? Sneakers.",
  "Why was the broom late? It over-swept.",
  "What do you call a belt made of watches? A waist of time.",
  "Why don't skeletons ever fight each other? They don't have the guts.",
  "What did the grape do when it got stepped on? Nothing, it just let out a little wine.",
  "Why did the banana go to the doctor? It wasn't peeling well.",
  "How do you fix a broken tomato? Tomato paste.",
  "What do you call a boomerang that won't come back? A stick.",
  "Why do cows wear bells? Because their horns don't work.",
  "What's a skeleton's least favorite room? The living room.",
  "I ordered a chicken and an egg online. I'll let you know.",
  "What do you call a can opener that doesn't work? A can't opener.",
  "Why did the scarecrow keep getting promoted? He was head and shoulders above everyone.",
  "I couldn't figure out why the baseball kept getting bigger. Then it hit me.",
  "What do you call a fake noodle? An impasta. (Worth saying twice.)",
];

function MobileBlock() {
  const [i, setI] = useState(() => Math.floor(Math.random() * OB_JOKES.length));

  useEffect(() => {
    const id = setInterval(() => setI(n => (n + 1) % OB_JOKES.length), 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-[#002D72] text-white flex flex-col items-center px-5 py-10 text-center">
      <div className="w-full max-w-sm flex flex-col items-center">
        <img src={obBot} alt="OB the Ops-Base Bot" className="w-44 h-auto obbot-in drop-shadow-2xl" />

        <h1 className="text-2xl font-extrabold uppercase tracking-wide mt-4 text-[#EB6608]">Access Denied</h1>
        <p className="text-white/90 text-base mt-2">
          OB here. The Inland Cutoff Guide is <b>desktop only</b>.
        </p>
        <p className="text-white/70 text-sm mt-1">Hop on your Hapag-Lloyd computer to run a lookup.</p>

        <div className="mt-8 w-full bg-white/10 border border-white/25 rounded-2xl px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-[#EB6608] font-bold mb-2">OB says…</p>
          <p key={i} className="joke-fade text-white text-base font-medium min-h-[3.5rem] flex items-center justify-center">
            {OB_JOKES[i]}
          </p>
        </div>
        <p className="text-white/40 text-xs mt-4">(OB has plenty more where that came from.)</p>
      </div>
    </div>
  );
}

// OB strolls in on the desktop tool: every ~10 min he slides in from the left,
// tells a joke for ~30s, then leaves again.
const OBIE_FIRST_MS = 15_000;   // first appearance shortly after load
const OBIE_SHOW_MS = 30_000;    // stays on screen 30s
const OBIE_HIDE_MS = 600_000;   // hidden 10 min between visits

// Split a joke into the setup and the punchline at the first sentence break —
// a "?", "!", "." followed by a space, or a spaced dash ("—"/"–"/"-"). One-liners
// with no such break come back whole (empty punchline).
function splitJoke(joke) {
  const sentence = joke.match(/[?!.]\s+/);          // "…? " / "…. " / "…! "
  const dash = joke.match(/\s+[—–-]\s+/);            // "… — …"
  let end, next;
  if (sentence && (!dash || sentence.index <= dash.index)) {
    end = sentence.index + 1;                        // keep the . ? !
    next = sentence.index + sentence[0].length;
  } else if (dash) {
    end = dash.index;                                // drop the dash + spaces
    next = dash.index + dash[0].length;
  } else {
    return { q: joke, a: '' };
  }
  const q = joke.slice(0, end).trim();
  const a = joke.slice(next).trim();
  return a ? { q, a } : { q: joke, a: '' };
}

const OBIE_EXIT_MS = 2200;       // slow, showy exit (spin-up then rocket off)

function ObieWalkOn() {
  const [visible, setVisible] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [joke, setJoke] = useState(() => OB_JOKES[Math.floor(Math.random() * OB_JOKES.length)]);

  useEffect(() => {
    let timers = [];
    const push = (fn, ms) => timers.push(setTimeout(fn, ms));
    const enter = () => {
      setJoke(OB_JOKES[Math.floor(Math.random() * OB_JOKES.length)]);
      setRevealed(false);
      setFlipped(false);                                 // enters facing into the screen
      setLeaving(false);
      setVisible(true);
      push(() => setRevealed(true), 4000);               // punchline lands after 4s
      push(() => setFlipped(true), OBIE_SHOW_MS / 2);    // one flip at the midpoint
      push(() => setLeaving(true), OBIE_SHOW_MS);        // exit: wheelie + smoke + slow slide off left
      push(() => {
        setVisible(false);
        setLeaving(false);
        push(enter, OBIE_HIDE_MS);
      }, OBIE_SHOW_MS + OBIE_EXIT_MS);
    };
    push(enter, OBIE_FIRST_MS);
    return () => timers.forEach(clearTimeout);
  }, []);

  const { q, a } = splitJoke(joke);

  return (
    <div className={`obie-walkon ${leaving ? 'obie-leaving' : visible ? 'obie-in' : 'obie-out'}`} aria-hidden={!visible}>
      <div className="relative max-w-[300px] bg-white border-2 border-[#002D72] rounded-2xl px-5 py-4 shadow-xl">
        <p className="text-[11px] uppercase tracking-widest text-[#EB6608] font-bold mb-1">OB says…</p>
        <p className="text-base font-semibold text-slate-800 leading-snug">{q}</p>
        {a && (
          <p
            className="text-base font-semibold text-slate-800 leading-snug mt-1"
            style={{ opacity: revealed ? 1 : 0, transition: 'opacity 0.6s ease' }}
          >
            {a}
          </p>
        )}
      </div>
      <div className="relative">
        {leaving && (
          <span className="obie-smoke" aria-hidden="true">
            <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          </span>
        )}
        <img src={obBot} alt="OB the Ops-Base Bot" className={`obie-jokebot ${leaving ? 'obie-jokebot-leaving' : flipped ? 'obie-jokebot-in' : 'obie-jokebot-out'} w-[10.5rem] h-auto drop-shadow-xl`} />
      </div>
    </div>
  );
}

// One-time-per-session nudge to pin/install the app (dismissible, auto-hides).
function WebappReminder() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!sessionStorage.getItem('icg_webapp_reminder')) {
        sessionStorage.setItem('icg_webapp_reminder', '1');
        setShow(true);
      }
    } catch { /* sessionStorage may be unavailable */ }
  }, []);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 12000);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;
  return (
    <div className="webapp-reminder">
      <button className="wr-close" onClick={() => setShow(false)} aria-label="Dismiss">×</button>
      <p className="wr-text">
        <span>💡</span>
        <span><b>Make it an app.</b> Pin this page (or use your browser&apos;s Install button) for one-click access.</span>
      </p>
    </div>
  );
}

// Light/dark theme. The initial class is set by an inline script in index.html
// (before paint), so we just read/sync it here.
function useTheme() {
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  const toggle = () => {
    setDark(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      try { localStorage.setItem('icg-theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
      return next;
    });
  };
  return [dark, toggle];
}

// Reusable modal shell with a blurred backdrop, Esc-to-close and scroll.
function ModalShell({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold text-[#002D72] dark:text-white smallcaps">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// "Install as an app" instructions — Edge & Chrome on Windows only.
function PwaInstallInfo() {
  return (
    <div className="text-sm text-slate-700 dark:text-slate-200 space-y-4">
      <p>
        <b>What is a PWA?</b> A Progressive Web App lets you install this site like a normal
        desktop program. It opens in its own clean window (no tabs or address bar), gets an
        icon on your taskbar / Start menu, and still works if you briefly lose connection.
        Nothing to download from a store — it installs straight from the browser.
      </p>

      <div>
        <p className="font-bold text-[#002D72] dark:text-white mb-1">Microsoft Edge</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the <b>⋯</b> menu (top-right of Edge).</li>
          <li>Choose <b>Apps</b> → <b>Install this site as an app</b>.</li>
          <li>Click <b>Install</b>, then allow it to pin to the taskbar / Start menu.</li>
        </ol>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Shortcut: the install icon (a monitor with a ↓) also appears at the right end of the address bar.
        </p>
      </div>

      <div>
        <p className="font-bold text-[#002D72] dark:text-white mb-1">Google Chrome</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Click the <b>install icon</b> (a monitor with a ↓) at the right of the address bar.</li>
          <li>Or open the <b>⋮</b> menu → <b>Cast, save, and share</b> → <b>Install page as app…</b></li>
          <li>Click <b>Install</b>.</li>
        </ol>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Once installed, launch it any time from your taskbar, Start menu, or desktop — just like a regular app.
      </p>
    </div>
  );
}

// Full help: how-to steps + the install section.
function HelpModal({ onClose }) {
  const steps = [
    'Select the Port of Loading.',
    'Choose the Start City (rail ramp).',
    'If prompted, pick the SSY service code.',
    'Enter the Port Cut Date — e.g. 9, 8/9, or 8/9/2026.',
    'Choose Dry Container or Reefer.',
    'Click Calculate, then Copy to Clipboard to paste into your email.',
  ];

  return (
    <ModalShell title="How to use it" onClose={onClose}>
      <ol className="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-200 text-sm">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Tip: the copied result drops straight into a reply — dates and all.
      </p>
      <hr className="my-5 border-slate-200 dark:border-slate-600" />
      <h3 className="text-base font-extrabold text-[#002D72] dark:text-white smallcaps mb-2">Install as an app</h3>
      <PwaInstallInfo />
    </ModalShell>
  );
}

// Install-only modal (opened by the "Install as an App" button).
function InstallModal({ onClose }) {
  return (
    <ModalShell title="Install as an App" onClose={onClose}>
      <PwaInstallInfo />
    </ModalShell>
  );
}

// Hidden manual-refresh modal — revealed by a secret gesture (tap the title 5×).
// Posts to /api/refresh, which verifies the passphrase server-side and triggers
// the GitHub Action. Only works on the live web app (needs the serverless function).
function RefreshModal({ onClose }) {
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const submit = async () => {
    if (!pass || busy) return;
    setBusy(true); setStatus(null);
    try {
      const r = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: pass }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) setStatus({ ok: true, msg: '✓ Refresh started — new schedules deploy in a few minutes.' });
      else if (r.status === 401) setStatus({ ok: false, msg: 'Wrong passphrase.' });
      else if (r.status === 500) setStatus({ ok: false, msg: 'Not set up yet — add GH_TOKEN & REFRESH_PASSPHRASE in Vercel.' });
      else setStatus({ ok: false, msg: data.error || 'Could not trigger the refresh.' });
    } catch {
      setStatus({ ok: false, msg: 'Network error — this only works on the live web app.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Manual Refresh" onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
        Pull the latest CPKC &amp; CN schedules right now. Enter the passphrase.
      </p>
      <div className="relative mb-3">
        <input
          type={show ? 'text' : 'password'}
          value={pass}
          autoFocus
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Passphrase"
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
        onClick={submit}
        disabled={busy || !pass}
        className="w-full px-4 py-2 bg-[#002D72] text-white rounded-lg font-semibold hover:bg-[#01245c] transition disabled:opacity-50"
      >
        {busy ? 'Triggering…' : 'Trigger Refresh'}
      </button>
      {status && (
        <div className={`mt-3 p-3 rounded-lg text-sm border ${status.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {status.msg}
        </div>
      )}
    </ModalShell>
  );
}

// Help + light/dark toggle, both as round photo buttons. The theme toggle shows
// the mode you'll switch TO: sunset (evening) in light mode, daylit ship in dark.
function TopControls() {
  const [dark, toggle] = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);
  const circleBtn = 'w-20 h-20 rounded-full overflow-hidden shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition';

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          className={circleBtn}
          onClick={() => setHelpOpen(true)}
          aria-label="Help"
          title="Help"
        >
          <img src={themeHelp} alt="Help" className="w-full h-full object-cover" />
        </button>
        <button
          className={circleBtn}
          onClick={toggle}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <img src={dark ? themeShip : themeSunset} alt="" className="w-full h-full object-cover" />
        </button>
      </div>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </>
  );
}

export default function App() {
  const [installOpen, setInstallOpen] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [tab, setTab] = useState('calculator');

  // Secret gesture: tap the title 5× within ~1.2s each to open the manual refresh.
  const tapRef = useRef({ n: 0, t: 0 });
  const secretTap = () => {
    const now = Date.now();
    const c = tapRef.current;
    if (now - c.t > 1200) c.n = 0;
    c.t = now;
    c.n += 1;
    if (c.n >= 5) { c.n = 0; setRefreshOpen(true); }
  };

  if (isMobileDevice()) {
    return <MobileBlock />;
  }

  return (
    <div className="min-h-screen bg-[#EDE6D6] dark:bg-slate-900 flex flex-col">
      {/* Banner constrained to just past the content edges (~5% wider each side). */}
      <div className="w-full max-w-[70rem] mx-auto px-4 pt-4">
        <img
          src={heroTop}
          alt="IDT Inland Cutoff Rail Guide"
          className="w-full h-auto block rounded-xl"
        />
      </div>

      {/* Header constrained to the hero width so it no longer draws a full-width line. */}
      <div className="w-full max-w-[70rem] mx-auto px-4 mt-3">
        <header className="bg-[#F8F3EA] dark:bg-slate-800 border border-[#E0D8C5] dark:border-slate-700 rounded-xl px-5 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 onClick={secretTap} className="text-[1.5rem] font-bold text-[#002D72] dark:text-white smallcaps txt-shadow-heavy select-none">Inland Cutoff Rail Guide</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Rail cutoff &amp; delivery date calculator</p>
            <button
              onClick={() => setInstallOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-[#002D72] text-white hover:bg-[#01245c] transition shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
            >
              ⬇ Install as an App
            </button>
          </div>
          <TopControls />
        </header>
      </div>

      <main className="max-w-5xl mx-auto px-5 py-6 w-full flex-1">
        <div className="flex gap-2 mb-5">
          {[
            { id: 'calculator', label: 'US Rail Ramp Cuts' },
            { id: 'cpkc', label: 'Canada Rail Ramp Cuts' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition shadow-[0_4px_10px_rgba(0,0,0,0.25)] ${
                tab === t.id
                  ? 'bg-[#002D72] text-white'
                  : 'bg-[#F8F3EA] dark:bg-slate-800 text-[#002D72] dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'calculator' ? <LookupForm /> : <PortScheduleLookup />}
      </main>

      {installOpen && <InstallModal onClose={() => setInstallOpen(false)} />}
      {refreshOpen && <RefreshModal onClose={() => setRefreshOpen(false)} />}

      <WebappReminder />
      <ObieWalkOn />

      <div className="w-full max-w-[70rem] mx-auto px-4 mt-8 text-right">
        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">v {APP_VERSION}</span>
      </div>
      <div className="w-full max-w-[70rem] mx-auto px-4 mt-1 mb-4">
        <img
          src={bannerBottom}
          alt="Hapag-Lloyd IDT Ops Base"
          className="w-full h-auto block rounded-xl"
        />
      </div>
    </div>
  );
}