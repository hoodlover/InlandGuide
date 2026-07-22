import React, { useState, useEffect, useRef } from 'react';
import { gzipSync, strFromU8, strToU8, unzipSync } from 'fflate';
import LookupForm from './components/LookupForm';
import PortScheduleLookup from './components/PortScheduleLookup';
import HlMockup from './components/HlMockup';
import NamePrompt from './components/NamePrompt';
import UpdateToast from './components/UpdateToast';
import UsageStats from './components/UsageStats';
import { bannerBottom, obBot } from './assets/banners';
import heroTop from './assets/hero-top.webp';
import darkModeBadge from './assets/dark-mode.webp';
import lightModeBadge from './assets/light-mode.webp';
import opsHubBadge from './assets/ops-hub.webp';
import railTeamAHead from './assets/rail-team-a-head.webp';
import railTeamAThumb from './assets/rail-team-a-thumb.webp';
import railTeamAWave from './assets/rail-team-a-wave.webp';
import railTeamBHead from './assets/rail-team-b-head.webp';
import railTeamBThumb from './assets/rail-team-b-thumb.webp';
import railTeamBWave from './assets/rail-team-b-wave.webp';
import railTeamCHead from './assets/rail-team-c-head.webp';
import railTeamCThumb from './assets/rail-team-c-thumb.webp';
import railTeamCWave from './assets/rail-team-c-wave.webp';
import doviberLanceWalk from './assets/doviber-lance-walk.webp';
import doviberLanceHighfive from './assets/doviber-lance-highfive.webp';
import doviberLancePoint from './assets/doviber-lance-point.webp';
import doviberDavisWalk from './assets/doviber-davis-walk-smile-v2.webp';
import doviberDavisHighfive from './assets/doviber-davis-highfive.webp';
import doviberDavisPoint from './assets/doviber-davis-point.webp';
import guideMe from './assets/guide-me.webp';
import vintageErd from './assets/vintage-erd.webp';
import './index.css';

import versionData from './version.json'; // committed; regenerate with `node gen-version.mjs`
const APP_VERSION = versionData.version;

const MOBILE_DEMO_MS = 30 * 60 * 1000;

function isMobileDevice() {
  const ua = navigator.userAgent || '';
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i.test(ua);
  const smallTouchScreen = window.matchMedia?.('(max-width: 900px) and (pointer: coarse)').matches;
  return mobileUserAgent || smallTouchScreen;
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

function MobileDemoGate({ onUnlock }) {
  const [jokeIndex, setJokeIndex] = useState(() => Math.floor(Math.random() * OB_JOKES.length));
  const [showForm, setShowForm] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const id = setInterval(() => setJokeIndex(index => (index + 1) % OB_JOKES.length), 6000);
    return () => clearInterval(id);
  }, []);

  const verify = async (event) => {
    event.preventDefault();
    if (!passphrase || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase, action: 'verify' }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.ok && result.verified) {
        onUnlock();
        return;
      }
      setStatus(response.status === 401 ? 'Wrong manager passphrase.' : (result.error || 'Mobile demo access could not be verified.'));
    } catch {
      setStatus('Network error — demo unlock only works on the live app.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#002D72] px-5 py-8 text-center text-white">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center">
        <img src={obBot} alt="OB the Ops-Base Bot" className="w-40 h-auto obbot-in drop-shadow-2xl" />
        <h1 className="mt-3 text-2xl font-extrabold uppercase tracking-wide text-[#EB6608]">Mobile Demo Locked</h1>
        <p className="mt-2 text-base text-white/90">The Inland Cutoff Guide is currently desktop only.</p>
        <p className="mt-1 text-sm text-white/70">A manager can temporarily unlock this phone for a demonstration.</p>

        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-6 w-full rounded-xl bg-[#EB6608] px-4 py-3 font-extrabold text-white shadow-lg transition hover:bg-[#cf5a07]"
          >
            🔓 Unlock 30-Minute Demo
          </button>
        ) : (
          <form onSubmit={verify} className="mt-6 w-full rounded-2xl border border-white/25 bg-white/10 p-4 text-left">
            <label className="block text-sm font-bold text-white">
              Manager passphrase
              <span className="relative mt-1 block">
                <input
                  type={showPassphrase ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  autoFocus
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-white/40 bg-white px-3 py-2 pr-11 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#EB6608]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase(value => !value)}
                  aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                  className="absolute inset-y-0 right-0 px-3 text-slate-500"
                >
                  {showPassphrase ? '🙈' : '👁️'}
                </button>
              </span>
            </label>
            <button
              type="submit"
              disabled={busy || !passphrase}
              className="mt-3 w-full rounded-lg bg-[#EB6608] px-4 py-2.5 font-extrabold text-white disabled:opacity-50"
            >
              {busy ? 'Checking…' : 'Start Mobile Demo'}
            </button>
            <p className="mt-2 text-center text-xs text-white/60">Access ends automatically after 30 minutes.</p>
            {status && <p className="mt-3 rounded-lg border border-red-300/40 bg-red-950/40 p-3 text-sm text-red-100" role="alert">{status}</p>}
          </form>
        )}

        <div className="mt-7 w-full rounded-2xl border border-white/25 bg-white/10 px-5 py-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#EB6608]">OB says…</p>
          <p key={jokeIndex} className="joke-fade flex min-h-[3.5rem] items-center justify-center text-base font-medium text-white">
            {OB_JOKES[jokeIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}

// OB strolls in on the main tool: every ~10 min he slides in from the left,
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

const OBIE_EXIT_MS = 2400;       // long enough for the showiest exit to finish
// Random send-offs. 'wheelie' and 'rocket' kick up smoke.
const EXIT_VARIANTS = ['wheelie', 'rocket', 'spin', 'beam', 'tumble'];

// Shuffle-bag: draw jokes at random but never repeat one until every joke has
// been used, then reshuffle. (Persists for the page session.)
let jokeBag = [];
let lastJoke = null;
function nextJoke() {
  if (jokeBag.length === 0) {
    jokeBag = [...OB_JOKES];
    for (let i = jokeBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [jokeBag[i], jokeBag[j]] = [jokeBag[j], jokeBag[i]];
    }
    // Don't let the last of one bag equal the first of the next.
    if (jokeBag.length > 1 && jokeBag[jokeBag.length - 1] === lastJoke) {
      [jokeBag[jokeBag.length - 1], jokeBag[0]] = [jokeBag[0], jokeBag[jokeBag.length - 1]];
    }
  }
  lastJoke = jokeBag.pop();
  return lastJoke;
}

const RAIL_TEAM_MEMBERS = [
  { head: railTeamAHead, thumb: railTeamAThumb, wave: railTeamAWave, line: 'We love', side: 'left', position: 'one' },
  { head: railTeamBHead, thumb: railTeamBThumb, wave: railTeamBWave, line: 'our export', side: 'right', position: 'two' },
  { head: railTeamCHead, thumb: railTeamCThumb, wave: railTeamCWave, line: 'rail team!', side: 'left', position: 'three' },
];

const RAIL_TEAM_PHASE_RANK = {
  arrive: 0,
  first: 1,
  second: 2,
  third: 3,
  thumbs: 4,
  wave: 5,
};

function RailTeamSurprise() {
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    const timers = [];
    const gesture = { step: 0, last: 0 };
    let running = false;

    const resetGesture = () => {
      gesture.step = 0;
      gesture.last = 0;
    };

    const startSurprise = () => {
      if (running) return;
      running = true;
      setPhase('arrive');

      [
        ['first', 2000],
        ['second', 3000],
        ['third', 4000],
        ['thumbs', 5000],
        ['wave', 6000],
      ].forEach(([nextPhase, delay]) => {
        timers.push(window.setTimeout(() => setPhase(nextPhase), delay));
      });

      timers.push(window.setTimeout(() => {
        setPhase('idle');
        running = false;
      }, 8600));
    };

    const isTypingTarget = (target) => target instanceof HTMLElement && (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
    );

    const onKeyDown = (event) => {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return;
      const now = Date.now();
      if (now - gesture.last > 2500) resetGesture();

      event.preventDefault();
      gesture.step = gesture.step === 0 || gesture.step === 1 ? gesture.step + 1 : 1;
      gesture.last = now;
    };

    const onContextMenu = (event) => {
      const now = Date.now();
      if (now - gesture.last > 2500) resetGesture();

      if (gesture.step === 2 || gesture.step === 3) {
        event.preventDefault();
        gesture.step += 1;
        gesture.last = now;
        if (gesture.step === 4) {
          resetGesture();
          startSurprise();
        }
      } else {
        resetGesture();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('contextmenu', onContextMenu);
      timers.forEach(window.clearTimeout);
    };
  }, []);

  if (phase === 'idle') return null;
  const phaseRank = RAIL_TEAM_PHASE_RANK[phase];

  return (
    <div className={`rail-team-stage rail-team-stage-${phase}`} role="status" aria-live="polite" aria-label="We love our export rail team!">
      {RAIL_TEAM_MEMBERS.map((member, index) => (
        <div key={member.line} className={`rail-team-member rail-team-member-${member.side} rail-team-member-${member.position}`}>
          <div className="rail-team-head-wrap">
            <img
              src={member.head}
              alt={`Rail team member saying ${member.line}`}
              className={`rail-team-head rail-team-head-${member.position}`}
            />
            {phaseRank >= RAIL_TEAM_PHASE_RANK.thumbs && (
              <img
                src={phase === 'wave' ? member.wave : member.thumb}
                alt=""
                className={`rail-team-arm rail-team-arm-${phase === 'wave' ? 'wave' : 'thumb'}`}
                aria-hidden="true"
              />
            )}
          </div>
          {phaseRank >= index + 1 && (
            <div className="rail-team-line">{member.line}</div>
          )}
        </div>
      ))}
    </div>
  );
}

const DOVIBER_PHASE_RANK = {
  davis: 0,
  lance: 1,
  'lance-solo': 1,
  ready: 2,
  impact: 3,
  cross: 4,
  'point-lance': 5,
  'point-davis': 6,
  exit: 7,
};

function DoviberSurprise() {
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    const timers = [];
    let running = false;
    let typed = '';
    const bannerTaps = { count: 0, last: 0 };
    const wordTaps = { counts: {}, last: 0 };

    const startSurprise = () => {
      if (running) return;
      running = true;
      setPhase('davis');

      [
        ['lance', 1500],
        ['lance-solo', 2500],
        // Give each spoken/comic beat one extra second to breathe.
        ['ready', 4000],
        ['impact', 4900],
        ['cross', 8900],
        ['point-lance', 11300],
        ['point-davis', 13700],
        ['exit', 16600],
      ].forEach(([nextPhase, delay]) => {
        timers.push(window.setTimeout(() => setPhase(nextPhase), delay));
      });

      timers.push(window.setTimeout(() => {
        setPhase('idle');
        running = false;
      }, 18400));
    };

    const isTypingTarget = (target) => target instanceof HTMLElement && (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
    );

    const onKeyDown = (event) => {
      if (isTypingTarget(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key.length !== 1) return;
      typed = `${typed}${event.key.toUpperCase()}`.slice(-7);
      if (typed === 'DOVIBER') {
        typed = '';
        startSurprise();
      }
    };

    const onBannerTap = (event) => {
      if (!(event.target instanceof Element)) return;
      const now = Date.now();

      const word = event.target.closest('[data-doviber-word]')?.dataset.doviberWord;
      if (word) {
        if (now - wordTaps.last > 2500) wordTaps.counts = {};
        wordTaps.last = now;
        wordTaps.counts[word] = Math.min(2, (wordTaps.counts[word] || 0) + 1);
        if (['inland', 'cutoff', 'rail', 'guide'].every(key => wordTaps.counts[key] === 2)) {
          wordTaps.counts = {};
          startSurprise();
        }
        return;
      }

      if (event.target.closest('[data-doviber-trigger]')) {
        if (now - bannerTaps.last > 1200) bannerTaps.count = 0;
        bannerTaps.last = now;
        bannerTaps.count += 1;
        if (bannerTaps.count >= 5) {
          bannerTaps.count = 0;
          startSurprise();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', onBannerTap);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onBannerTap);
      timers.forEach(window.clearTimeout);
    };
  }, []);

  if (phase === 'idle') return null;

  const rank = DOVIBER_PHASE_RANK[phase];
  const lancePose = rank < DOVIBER_PHASE_RANK.ready
    ? doviberLanceWalk
    : rank < DOVIBER_PHASE_RANK.cross
      ? doviberLanceHighfive
      : rank < DOVIBER_PHASE_RANK['point-lance']
        ? doviberLanceWalk
        : doviberLancePoint;
  const davisPose = rank < DOVIBER_PHASE_RANK.ready
    ? doviberDavisWalk
    : rank < DOVIBER_PHASE_RANK.cross
      ? doviberDavisHighfive
      : rank < DOVIBER_PHASE_RANK['point-lance']
        ? doviberDavisWalk
        : doviberDavisPoint;

  return (
    <div
      className={`doviber-stage doviber-stage-${phase}`}
      role="status"
      aria-live="polite"
      aria-label="Lance and Davis meet for a high five"
    >
      <div className="doviber-person doviber-davis">
        <img src={davisPose} alt="Davis in Hapag-Lloyd gear" />
        {(phase === 'davis' || phase === 'lance') && <div className="doviber-speech doviber-speech-davis">Hey Hood ..</div>}
        {phase === 'point-davis' && <div className="doviber-speech doviber-speech-exit-davis">Later, old weirdo friend.</div>}
      </div>

      {rank >= DOVIBER_PHASE_RANK.lance && (
        <div className="doviber-person doviber-lance">
          <img src={lancePose} alt="Lance in Hapag-Lloyd gear" />
          {phase === 'point-lance' && <span className="doviber-tooth-glint" aria-hidden="true" />}
          {(phase === 'lance' || phase === 'lance-solo') && <div className="doviber-speech doviber-speech-lance">Wassup DOViber!</div>}
          {phase === 'point-lance' && <div className="doviber-speech doviber-speech-exit-lance">Hoodlove out!</div>}
        </div>
      )}

      {(phase === 'impact' || phase === 'cross') && (
        <div className="doviber-kazoow" aria-label="Kazoow">Kazoow</div>
      )}
    </div>
  );
}

function ObieWalkOn() {
  const [visible, setVisible] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [exit, setExit] = useState('wheelie');
  const [revealed, setRevealed] = useState(false);
  const [joke, setJoke] = useState(() => nextJoke());
  const [scheduleKey, setScheduleKey] = useState(0);

  useEffect(() => {
    let timers = [];
    const push = (fn, ms) => timers.push(setTimeout(fn, ms));
    const enter = () => {
      setJoke(nextJoke());
      setRevealed(false);
      setFlipped(false);                                 // enters facing into the screen
      setLeaving(false);
      setVisible(true);
      push(() => setRevealed(true), 4000);               // punchline lands after 4s
      push(() => setFlipped(true), OBIE_SHOW_MS / 2);    // one flip at the midpoint
      push(() => {
        setExit(EXIT_VARIANTS[Math.floor(Math.random() * EXIT_VARIANTS.length)]);
        setLeaving(true);                                // pick a random showy exit
      }, OBIE_SHOW_MS);
      push(() => {
        setVisible(false);
        setLeaving(false);
        push(enter, OBIE_HIDE_MS);
      }, OBIE_SHOW_MS + OBIE_EXIT_MS);
    };
    // First visit is shortly after load. Clicking Obie restarts this effect and
    // schedules his next normal visit ten minutes later.
    push(enter, scheduleKey === 0 ? OBIE_FIRST_MS : OBIE_HIDE_MS);
    return () => timers.forEach(clearTimeout);
  }, [scheduleKey]);

  const dismissObie = () => {
    setVisible(false);
    setLeaving(false);
    setRevealed(false);
    setScheduleKey(key => key + 1);
  };

  const { q, a } = splitJoke(joke);

  return (
    <div className={`obie-walkon ${leaving ? `obie-leaving obie-exit-${exit}` : visible ? 'obie-in' : 'obie-out'}`} aria-hidden={!visible}>
      <div className="relative max-w-[300px] bg-white border-2 border-[#002D72] rounded-2xl px-5 py-4 shadow-xl">
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-widest text-[#EB6608] font-bold">OB says…</p>
          <p className="whitespace-nowrap text-[9px] font-normal tracking-normal text-slate-400">Click me to dismiss me!</p>
        </div>
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
        {leaving && (exit === 'wheelie' || exit === 'rocket') && (
          <span className="obie-smoke" aria-hidden="true">
            <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          </span>
        )}
        <button
          type="button"
          onClick={dismissObie}
          aria-label="Dismiss Joker Obie for 10 minutes"
          title="Click Obie to send him away for 10 minutes"
          className="block cursor-pointer bg-transparent border-0 p-0"
        >
          <img src={obBot} alt="OB the Ops-Base Bot" className={`obie-jokebot ${leaving && exit === 'wheelie' ? 'obie-jokebot-leaving' : flipped ? 'obie-jokebot-in' : 'obie-jokebot-out'} w-[10.5rem] h-auto drop-shadow-xl`} />
        </button>
      </div>
    </div>
  );
}

// One-time-per-session nudge to pin/install the app (dismissible, auto-hides).
function WebappReminder({ enabled = true }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (!sessionStorage.getItem('icg_webapp_reminder')) {
        sessionStorage.setItem('icg_webapp_reminder', '1');
        setShow(true);
      }
    } catch { /* sessionStorage may be unavailable */ }
  }, [enabled]);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 12000);
    return () => clearTimeout(t);
  }, [show]);

  if (!enabled || !show) return null;
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
        className="w-full max-w-[38rem] max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-light tracking-wide text-[#002D72] dark:text-white">{title}</h2>
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

      <div>
        <p className="font-bold text-[#002D72] dark:text-white mb-1">iPhone / iPad</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the guide in <b>Safari</b>.</li>
          <li>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</li>
          <li>Tap <b>Add</b>.</li>
        </ol>
      </div>

      <div>
        <p className="font-bold text-[#002D72] dark:text-white mb-1">Android</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the guide in <b>Chrome</b>.</li>
          <li>Open the menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</li>
        </ol>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Once installed, launch it any time from your taskbar, Start menu, or desktop — just like a regular app.
      </p>
    </div>
  );
}

// Full help: how-to steps + the install section.
function HelpModal({ onClose, showInstall = true }) {
  const steps = [
    'Select the Port of Loading.',
    'Choose the Start City (rail ramp).',
    'If prompted, pick the SSY service code.',
    'Enter the Port Cut Date — e.g. 9, 8/9, or 8/9/2026.',
    'Choose Dry Container or Reefer.',
    'Click Calculate, then Copy to Clipboard to paste into your email.',
  ];

  const [joker, setJoker] = useState(() => {
    try { return localStorage.getItem('icg_joker') !== 'off'; } catch { return true; }
  });
  const toggleJoker = () => {
    setJoker(prev => {
      const next = !prev;
      try { localStorage.setItem('icg_joker', next ? 'on' : 'off'); } catch { /* ignore */ }
      window.dispatchEvent(new Event('icg-joker'));
      return next;
    });
  };

  return (
    <ModalShell title="How to use it" onClose={onClose}>
      <ol className="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-200 text-sm">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Tip: the copied result drops straight into a reply — dates and all.
      </p>
      <div className="mt-4">
        <button
          onClick={toggleJoker}
          className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-bold rounded-full bg-[#EB6608] text-white hover:bg-[#cf5a07] transition shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
        >
          🤖 Joker Obie: {joker ? 'On' : 'Off'}
        </button>
      </div>
      {showInstall && (
        <>
          <hr className="my-5 border-slate-200 dark:border-slate-600" />
          <h3 className="text-base font-extrabold text-[#002D72] dark:text-white smallcaps mb-2">Install as an app</h3>
          <PwaInstallInfo />
        </>
      )}
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

function FeatureRequestModal({ onClose }) {
  const [form, setForm] = useState({ type: 'Feature', title: '', details: '', submittedBy: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, page: `${location.pathname}${location.hash}` }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || `Request service returned HTTP ${response.status}.`);
      setStatus({ ok: true, message: 'Thanks — your request is now on the manager list.' });
      setForm(current => ({ ...current, title: '', details: '', website: '' }));
    } catch (error) {
      setStatus({ ok: false, message: error?.message || 'The request could not be sent. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#EB6608] focus:outline-none focus:ring-2 focus:ring-[#EB6608]/30';
  return (
    <ModalShell title="Request a Feature or Change" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Tell us what would make the Inland Guide more useful. No email is needed.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
          Request type
          <select value={form.type} onChange={(event) => update('type', event.target.value)} className={inputClass}>
            <option>Feature</option>
            <option>Change</option>
            <option>Problem</option>
            <option>Other</option>
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
          Short title *
          <input
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            maxLength={120}
            required
            placeholder="Example: Add a favorite rail ramp"
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
          What would you like to see? *
          <textarea
            value={form.details}
            onChange={(event) => update('details', event.target.value)}
            minLength={10}
            maxLength={4000}
            required
            rows={6}
            placeholder="Describe the idea, change, or problem and how it would help."
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
          Your name or team <span className="font-normal text-slate-400">(optional)</span>
          <input
            value={form.submittedBy}
            onChange={(event) => update('submittedBy', event.target.value)}
            maxLength={100}
            placeholder="So the manager knows who suggested it"
            className={inputClass}
          />
        </label>
        <label className="hidden" aria-hidden="true">
          Website
          <input value={form.website} onChange={(event) => update('website', event.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[#EB6608] px-4 py-3 font-extrabold text-white shadow-md transition hover:bg-[#cf5a07] disabled:opacity-60"
        >
          {busy ? 'Sending…' : 'Send Request'}
        </button>
      </form>
      {status && (
        <div className={`mt-4 rounded-lg border p-3 text-sm font-semibold ${status.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`} role="status">
          {status.message}
        </div>
      )}
    </ModalShell>
  );
}

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

function isStandalonePwa() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Browsers expose the current display mode and the appinstalled event. They do
// not provide a dependable cross-browser inventory of every installed PWA, so
// remember installs observed by this browser and always detect standalone mode.
function usePwaInstallStatus() {
  const [installed, setInstalled] = useState(() => {
    if (isStandalonePwa()) return true;
    try { return localStorage.getItem('icg-pwa-installed') === '1'; } catch { return false; }
  });

  useEffect(() => {
    const media = window.matchMedia?.('(display-mode: standalone)');
    const syncDisplayMode = () => { if (isStandalonePwa()) setInstalled(true); };
    const rememberInstall = () => {
      setInstalled(true);
      try { localStorage.setItem('icg-pwa-installed', '1'); } catch { /* storage unavailable */ }
    };
    if (typeof navigator.getInstalledRelatedApps === 'function') {
      navigator.getInstalledRelatedApps().then((apps) => {
        const detected = apps.some(app => app.platform === 'webapp');
        if (detected) rememberInstall();
        else if (!isStandalonePwa()) {
          setInstalled(false);
          try { localStorage.removeItem('icg-pwa-installed'); } catch { /* storage unavailable */ }
        }
      }).catch(() => { /* fall back to display mode and the install event */ });
    }
    media?.addEventListener?.('change', syncDisplayMode);
    window.addEventListener('appinstalled', rememberInstall);
    return () => {
      media?.removeEventListener?.('change', syncDisplayMode);
      window.removeEventListener('appinstalled', rememberInstall);
    };
  }, []);

  return installed;
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

function encodeMasterPayload(payload) {
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

// Managers-hub menu: crisp stroke icons (no emoji — they render inconsistently
// across Windows builds and read as unprofessional) plus one uniform card.
const HUB_ICONS = {
  requests: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8" /><path d="M8 13h5" /></>,
  stats: <><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M8 16H3v5" /></>,
  publish: <><path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2" /><path d="M12 12v9" /><path d="m16 16-4-4-4 4" /></>,
  toggle: <><rect x="2" y="6" width="20" height="12" rx="6" /><circle cx="16" cy="12" r="2" /></>,
  news: <><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" /><path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" /></>,
};

function HubCard({ icon, title, subtitle, onClick, href }) {
  const className = 'group flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#EB6608]/60 hover:shadow-md dark:border-slate-600 dark:bg-slate-700 dark:hover:border-[#EB6608]/70';
  const body = (
    <>
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#002D72]/[0.06] text-[#002D72] transition group-hover:bg-[#EB6608]/10 group-hover:text-[#EB6608] dark:bg-white/10 dark:text-white" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#002D72] dark:text-white">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-300">{subtitle}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#EB6608] dark:text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
    </>
  );
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={className}>{body}</a>
    : <button type="button" onClick={onClick} className={className}>{body}</button>;
}

// Hidden managers hub — revealed by a secret gesture (tap the title 5×).
function RefreshModal({ onClose }) {
  const [view, setView] = useState('login');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [dbResult, setDbResult] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestsStatus, setRequestsStatus] = useState(null);
  const [showPublishObie, setShowPublishObie] = useState(false);
  const [publishObieNudge, setPublishObieNudge] = useState(false);
  const verifiedMasterRef = useRef(null);

  useEffect(() => {
    if (!showPublishObie) return undefined;
    setPublishObieNudge(false);
    const timer = setTimeout(() => setPublishObieNudge(true), 5000);
    return () => clearTimeout(timer);
  }, [showPublishObie]);

  const verifyAccess = async () => {
    if (!pass || busy) return;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      setStatus({ ok: false, msg: 'Manager verification runs on the live app: inland-guide.vercel.app' });
      return;
    }
    setBusy(true); setStatus(null);
    try {
      const r = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: pass, action: 'verify' }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok && data.verified) {
        setStatus(null);
        setView('menu');
      }
      else if (r.status === 401) setStatus({ ok: false, msg: 'Wrong passphrase.' });
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
      else if (r.status === 401) { setStatus({ ok: false, msg: 'Manager session expired. Please sign in again.' }); setView('login'); }
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
      if (response.status === 401) {
        setView('login');
        setStatus({ ok: false, msg: 'Manager session expired. Please sign in again.' });
        return;
      }
      if (!response.ok || !result.ok) throw new Error(result.error || `Request service returned HTTP ${response.status}.`);
      setRequests(result.requests || []);
    } catch (error) {
      setRequestsStatus({ ok: false, message: error?.message || 'The requests could not be loaded.' });
    } finally {
      setBusy(false);
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
      const encodedPayload = encodeMasterPayload(masterPayload);
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
      setDbResult(current => ({
        ...current,
        saved: true,
        message: 'Verified copy saved. Publishing the calculator data now…',
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

  if (view === 'login') {
    return (
      <ModalShell title="Managers Only" onClose={onClose}>
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
          onClick={verifyAccess}
          disabled={busy || !pass}
          className="w-full px-4 py-2 bg-[#002D72] text-white rounded-lg font-semibold hover:bg-[#01245c] transition disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Enter Managers Hub'}
        </button>
        {status && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{status.msg}</div>
        )}
      </ModalShell>
    );
  }

  if (view === 'menu') {
    return (
      <ModalShell title="Hapag-Lloyd Managers" onClose={onClose}>
        <div className="rounded-xl bg-gradient-to-r from-[#002D72] to-[#0a4b9b] px-5 py-4 text-white shadow-md">
          <p className="text-base font-normal">Welcome, Hapag-Lloyd Managers</p>
          <p className="mt-1 text-sm text-white/80">Your shortcuts for keeping the Inland Guide moving.</p>
        </div>

        <div className="mt-4 space-y-2.5">
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
            onClick={triggerRefresh}
          />
          <HubCard
            icon={HUB_ICONS.publish}
            title="Publish from the SharePoint master"
            subtitle="Verify the workbook & update the live calculator"
            onClick={() => { setStatus(null); setDbResult(null); verifiedMasterRef.current = null; setView('database'); }}
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
      </ModalShell>
    );
  }

  if (view === 'requests') {
    return (
      <ModalShell title="Feature & Change Requests" onClose={onClose}>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setView('menu')} className="text-sm font-normal text-[#002D72] hover:underline dark:text-white">← Back to Managers Hub</button>
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-600">
                <span className="font-normal text-slate-500 dark:text-slate-300">From: {request.submittedBy || 'Anonymous'}</span>
                <a href={request.url} target="_blank" rel="noreferrer" className="font-normal text-[#EB6608] hover:underline">Open / close in GitHub →</a>
              </div>
            </article>
          ))}
        </div>
      </ModalShell>
    );
  }

  if (view === 'stats') {
    return (
      <ModalShell title="Guide Usage" onClose={onClose}>
        <button type="button" onClick={() => setView('menu')} className="mb-4 text-sm font-normal text-[#002D72] hover:underline dark:text-white">← Back to Managers Hub</button>
        <UsageStats
          passphrase={pass}
          onAuthExpired={() => { setStatus({ ok: false, msg: 'Manager session expired. Please sign in again.' }); setView('login'); }}
        />
      </ModalShell>
    );
  }

  if (view === 'lane') {
    return (
      <ModalShell title="Lane Control" onClose={onClose}>
        <div className="rounded-xl border-2 border-[#EB6608] bg-orange-50 p-6 text-center shadow-inner dark:bg-slate-700">
          <div className="text-4xl" aria-hidden="true">🛠️</div>
          <p className="mt-3 text-lg font-normal text-[#002D72] dark:text-white">Please open up T9400 and make it happen.</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Lane activation and deactivation remain controlled in the source system.</p>
        </div>
        <button type="button" onClick={() => setView('menu')} className="mt-4 text-sm font-normal text-[#002D72] hover:underline dark:text-white">← Back to Managers Hub</button>
      </ModalShell>
    );
  }

  if (view === 'database') {
    return (
      <>
      <ModalShell title="Master Database Check" onClose={onClose}>
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
        <button type="button" onClick={() => { setStatus(null); setDbResult(null); verifiedMasterRef.current = null; setView('menu'); }} className="mt-4 text-sm font-normal text-[#002D72] hover:underline dark:text-white">← Back to Managers Hub</button>
      </ModalShell>
      {showPublishObie && (
        <div className="fixed inset-0 z-[140] flex flex-col items-center justify-center bg-black/55 p-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Live update complete">
          <div key={publishObieNudge ? 'nudge' : 'done'} className="joke-fade thought-bubble relative mb-6 max-w-sm rounded-2xl bg-white px-5 py-4 text-center text-base font-extrabold leading-snug text-[#002D72] shadow-2xl" role="status">
            {publishObieNudge
              ? 'Hey, click me to do more manager stuff.'
              : 'All done! Your live guide update is on the way. Have a nice day!'}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowPublishObie(false);
              setStatus(null);
              setDbResult(null);
              verifiedMasterRef.current = null;
              setView('menu');
            }}
            className="rounded-full bg-transparent p-0 transition hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#EB6608]"
            aria-label="Click Obie to return to the Managers Hub"
          >
            <img src={obBot} alt="Obie" className="obie-confirm-pop obie-float w-56 max-w-[70vw] drop-shadow-2xl" />
          </button>
        </div>
      )}
      </>
    );
  }

  return (
    <ModalShell title="Update Rail Ramp Cuts" onClose={onClose}>
      <button type="button" onClick={() => { setStatus(null); setView('menu'); }} className="mb-3 text-sm font-normal text-[#002D72] hover:underline dark:text-white">← Back to Managers Hub</button>
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
    </ModalShell>
  );
}

// Manager access, help, light/dark toggle, and the vintage tool use matching
// round photo buttons. The theme toggle shows the mode you'll switch TO.
function TopControls({ compact, onManagerAccess, showInstall, mobile = false }) {
  const [dark, toggle] = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);
  const circleBtn = `${compact ? 'w-11 h-11' : 'w-12 h-12 sm:w-20 sm:h-20'} shrink-0 rounded-full overflow-hidden shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {!mobile && (
          <button
            type="button"
            onClick={onManagerAccess}
            className={circleBtn}
            aria-label="Open Hapag-Lloyd Ops Hub"
            title="Hapag-Lloyd Ops Hub"
          >
            <img src={opsHubBadge} alt="Ops Hub" className="h-full w-full object-cover" />
          </button>
        )}
        <button
          className={circleBtn}
          onClick={() => setHelpOpen(true)}
          aria-label="Help"
          title="Help"
        >
          <img src={guideMe} alt="Guide Me" className="w-full h-full object-cover" />
        </button>
        <button
          className={circleBtn}
          onClick={toggle}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <img src={dark ? lightModeBadge : darkModeBadge} alt="" className="w-full h-full object-cover" />
        </button>
        <a
          href="#vintage-ERD-tool"
          className={circleBtn}
          aria-label="The old school ERD Tool"
          title="The old school ERD Tool"
        >
          <img src={vintageErd} alt="Vintage ERD Tool" className="w-full h-full object-cover" />
        </a>
      </div>
      {helpOpen && <HelpModal showInstall={showInstall} onClose={() => setHelpOpen(false)} />}
    </>
  );
}

export default function App() {
  const [installOpen, setInstallOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const pwaInstalled = usePwaInstallStatus();
  const mobileDevice = isMobileDevice();
  const [mobileDemoUntil, setMobileDemoUntil] = useState(() => {
    try {
      const expires = Number(sessionStorage.getItem('icg-mobile-demo-until') || 0);
      return expires > Date.now() ? expires : 0;
    } catch { return 0; }
  });
  const mobileDemoUnlocked = mobileDemoUntil > Date.now();
  const unlockMobileDemo = () => {
    const expires = Date.now() + MOBILE_DEMO_MS;
    try { sessionStorage.setItem('icg-mobile-demo-until', String(expires)); } catch { /* storage unavailable */ }
    setMobileDemoUntil(expires);
  };
  const lockMobileDemo = () => {
    try { sessionStorage.removeItem('icg-mobile-demo-until'); } catch { /* storage unavailable */ }
    setMobileDemoUntil(0);
  };
  const [tab, setTab] = useState('calculator');
  // Picking a Canadian port in the US calculator hands off to the Canada Rail
  // Ramp tab, preselecting that port in the published-schedule tool.
  const [canadaPort, setCanadaPort] = useState('');
  const goCanada = (slug) => { setCanadaPort(slug); setTab('cpkc'); };

  // Compact view — strips the PWA chrome (hero/bottom banners, extra padding,
  // large badges) for a tight installed-app layout. Persisted across launches.
  const [compact, setCompact] = useState(() => {
    try { return localStorage.getItem('icg-compact') === '1'; } catch { return false; }
  });
  const toggleCompact = () => setCompact(prev => {
    const next = !prev;
    try { localStorage.setItem('icg-compact', next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });
  // The unlocked phone demo always uses the banner-led full layout. Compact
  // remains a desktop preference and is intentionally hidden on mobile.
  const compactView = compact && !mobileDevice;

  const refreshUpdatedData = async () => {
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

  // Secret gesture: tap the title 5× within ~1.2s each to open the managers hub.
  const tapRef = useRef({ n: 0, t: 0, key: '' });
  const secretTap = (event) => {
    const now = Date.now();
    const c = tapRef.current;
    const key = event?.target instanceof Element
      ? event.target.closest('[data-doviber-word]')?.dataset.doviberWord || 'title'
      : 'title';
    if (now - c.t > 1200 || c.key !== key) c.n = 0;
    c.t = now;
    c.key = key;
    c.n += 1;
    if (c.n >= 5) { c.n = 0; setRefreshOpen(true); }
  };

  // Joker Obie on/off (toggled in the Help modal, persisted in localStorage).
  const [jokerOn, setJokerOn] = useState(() => {
    try { return localStorage.getItem('icg_joker') !== 'off'; } catch { return true; }
  });
  useEffect(() => {
    const sync = () => { try { setJokerOn(localStorage.getItem('icg_joker') !== 'off'); } catch { /* ignore */ } };
    window.addEventListener('icg-joker', sync);
    return () => window.removeEventListener('icg-joker', sync);
  }, []);

  // Simple hash route to the Hapag-Lloyd website mock-up.
  const [hash, setHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''));
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (pwaInstalled) setInstallOpen(false);
  }, [pwaInstalled]);

  useEffect(() => {
    if (!mobileDemoUntil) return undefined;
    const remaining = mobileDemoUntil - Date.now();
    if (remaining <= 0) {
      lockMobileDemo();
      return undefined;
    }
    const timer = setTimeout(lockMobileDemo, remaining);
    return () => clearTimeout(timer);
  }, [mobileDemoUntil]);

  if (mobileDevice && !mobileDemoUnlocked) {
    return <MobileDemoGate onUnlock={unlockMobileDemo} />;
  }

  if (hash === '#vintage-ERD-tool') {
    return <HlMockup />;
  }
  return (
    <div className="min-h-screen bg-[#EDE6D6] dark:bg-slate-900 flex flex-col">
      {/* Banner constrained to just past the content edges (~5% wider each side). */}
      {!compactView && (
        <div className="w-full max-w-[70rem] mx-auto px-4 pt-4">
          <img
            src={heroTop}
            alt="IDT Inland Cutoff Rail Guide"
            data-doviber-trigger
            className="w-full h-auto block rounded-xl"
          />
        </div>
      )}

      {/* Header constrained to the hero width so it no longer draws a full-width line. */}
      <div className={`w-full max-w-[70rem] mx-auto px-4 ${compactView ? 'pt-3' : 'mt-3'}`}>
        <header className={`bg-[#F8F3EA] dark:bg-slate-800 border border-[#E0D8C5] dark:border-slate-700 rounded-xl flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-3 ${compactView ? 'px-4 py-2' : 'px-4 py-3 sm:px-5'}`}>
          {!mobileDevice && (
            <div>
              <h1 onClick={secretTap} className={`${compactView ? 'text-[1.15rem]' : 'text-[1.5rem]'} font-bold text-[#002D72] dark:text-white smallcaps txt-shadow-heavy select-none`}>
                <span data-doviber-word="inland">Inland</span>{' '}
                <span data-doviber-word="cutoff">Cutoff</span>{' '}
                <span data-doviber-word="rail">Rail</span>{' '}
                <span data-doviber-word="guide">Guide</span>
              </h1>
              {!compactView && <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Rail cutoff &amp; delivery date calculator</p>}
              {!compactView && !pwaInstalled && (
                <button
                  onClick={() => setInstallOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-[#002D72] text-white hover:bg-[#01245c] transition shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
                >
                  ⬇ Install as an App
                </button>
              )}
            </div>
          )}
          <TopControls compact={compactView} mobile={mobileDevice} showInstall={!pwaInstalled && !mobileDevice} onManagerAccess={() => setRefreshOpen(true)} />
        </header>
      </div>

      <main className={`max-w-5xl mx-auto w-full ${compactView ? 'px-3 py-3 sm:px-4' : 'flex-1 px-3 py-4 sm:px-5 sm:py-6'}`}>
        <div className={`grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap ${compactView ? 'mb-3' : 'mb-5'}`}>
          {[
            { id: 'calculator', label: 'US Rail Ramp Cuts' },
            { id: 'cpkc', label: 'Canada Rail Ramp Cuts', mobileLabel: 'Canada Rail Cuts' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setCanadaPort(''); setTab(t.id); }}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition shadow-[0_4px_10px_rgba(0,0,0,0.25)] ${
                tab === t.id
                  ? 'bg-[#002D72] text-white'
                  : 'bg-[#F8F3EA] dark:bg-slate-800 text-[#002D72] dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700'
              }`}
            >
              {mobileDevice && t.mobileLabel ? t.mobileLabel : t.label}
            </button>
          ))}
          {!mobileDevice && (
            <>
              <button
                onClick={toggleCompact}
                title={compact ? 'Switch to full view' : 'Switch to compact view'}
                aria-label={compact ? 'Switch to full view' : 'Switch to compact view'}
                className="px-2.5 py-1.5 text-xs font-normal rounded-full transition shadow-[0_7px_0_rgba(0,0,0,0.75),0_13px_22px_rgba(0,0,0,0.8)] bg-[#F8F3EA] dark:bg-slate-800 text-[#002D72] dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 sm:ml-auto"
              >
                {compact ? '⤢ Full view' : '⤡ Compact'}
              </button>
              <button
                type="button"
                onClick={refreshUpdatedData}
                title="Reload the guide with the newest published database"
                className="px-2.5 py-1.5 text-xs font-normal rounded-full transition shadow-[0_7px_0_rgba(0,0,0,0.75),0_13px_22px_rgba(0,0,0,0.8)] bg-emerald-700 text-white hover:bg-emerald-800"
              >
                ↻ Refresh Updated Data
              </button>
              <button
                type="button"
                onClick={() => setRequestOpen(true)}
                className="col-span-2 rounded-full bg-[#EB6608] px-2.5 py-1.5 text-xs font-normal text-white shadow-[0_7px_0_rgba(0,0,0,0.75),0_13px_22px_rgba(0,0,0,0.8)] transition hover:bg-[#cf5a07] sm:col-auto"
              >
                💡 Request a Feature / Change
              </button>
            </>
          )}
          {mobileDevice && (
            <button
              type="button"
              onClick={lockMobileDemo}
              className="col-span-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-extrabold text-red-700 shadow-[0_4px_10px_rgba(0,0,0,0.2)] transition hover:bg-red-100 sm:col-auto"
            >
              🔒 End Mobile Demo
            </button>
          )}
        </div>
        {tab === 'calculator'
          ? <LookupForm onCanadaPort={goCanada} />
          : <PortScheduleLookup onUpdateRamps={() => setRefreshOpen(true)} initialPort={canadaPort} />}
      </main>

      <NamePrompt />
      <UpdateToast />
      {installOpen && <InstallModal onClose={() => setInstallOpen(false)} />}
      {requestOpen && <FeatureRequestModal onClose={() => setRequestOpen(false)} />}
      {refreshOpen && <RefreshModal onClose={() => setRefreshOpen(false)} />}

      <WebappReminder enabled={!pwaInstalled && !mobileDevice} />
      {jokerOn && !compactView && <ObieWalkOn />}
      {!mobileDevice && <RailTeamSurprise />}
      <DoviberSurprise />

      <div className={`w-full max-w-[70rem] mx-auto px-4 text-right ${compactView ? 'mt-3' : 'mt-8'}`}>
        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">v {APP_VERSION}</span>
      </div>
      {!compactView && (
      <div className="w-full max-w-[70rem] mx-auto px-4 mt-1 mb-4">
        <img
          src={bannerBottom}
          alt="Hapag-Lloyd IDT Ops Base"
          className="w-full h-auto block rounded-xl"
        />
      </div>
      )}
    </div>
  );
}
