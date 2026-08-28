import React, { useState, useEffect, useRef } from 'react';
import LookupForm from './components/LookupForm';
import PortScheduleLookup from './components/PortScheduleLookup';
import HlMockup from './components/HlMockup';
import ManagersPage from './components/ManagersPage';
import NamePrompt, { getUserName, getUserEmail } from './components/NamePrompt';
import ObieEggs from './components/ObieEggs';
import UpdateToast from './components/UpdateToast';
import { obBot } from './assets/banners';
import { IDT_TITLE } from './lib/idt';
import truckScene from './assets/idt-truck-scene.webp';
import heroShipBanner from './assets/hero-ship-banner.webp';
import heroShipOverlay from './assets/hero-ship-overlay.png';
import heroTop from './assets/hero-top.webp';
import heroTrainCleanPlate from './assets/hero-train-clean-plate.png';
import heroNsTrainOverlay from './assets/hero-ns-train-overlay.png';
import heroCpTrainOverlay from './assets/hero-cp-train-overlay.png';
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
import hapagLloydLogo from './assets/hapag-lloyd-logo.png';
import './index.css';

import versionData from './version.json'; // committed; regenerate with `node gen-version.mjs`
const APP_VERSION = versionData.version;

const MOBILE_DEMO_MS = 30 * 60 * 1000;
const MOBILE_OWNER_ACCESS_KEY = 'hapagidt:mobile-owner-access';

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
const OBIE_FIRST_MS = 420_000;  // original page: first appearance after 7 min
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
    const gesture = { count: 0, last: 0 };
    let running = false;

    const resetGesture = () => {
      gesture.count = 0;
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

    const isInteractiveTarget = (target) => target instanceof HTMLElement && (
      ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName) || target.isContentEditable
    );

    const onKeyDown = (event) => {
      if (event.code !== 'Space' || event.repeat || isInteractiveTarget(event.target)) return;
      const now = Date.now();
      if (now - gesture.last > 2500) resetGesture();

      event.preventDefault();
      gesture.count += 1;
      gesture.last = now;
      if (gesture.count >= 4) {
        resetGesture();
        startSurprise();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
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

function ObieWalkOn({ firstDelay = OBIE_FIRST_MS }) {
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
    push(enter, scheduleKey === 0 ? firstDelay : OBIE_HIDE_MS);
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

// Keep secondary desktop actions available without turning the toolbar into a
// row of equally prominent pills.
const OFFICIAL_ERD_URL = 'https://www.hapag-lloyd.com/en/services-information/offices-localinfo/north-america/usa/local-info/erd-cutoff-request-form.html';
const CUSTOMER_INLAND_GUIDE_URL = 'https://webguide.hapagidt.com/';

function DesktopToolsMenu({ compact, onToggleCompact, onChangeName, onRefresh, onRequest }) {
  const [open, setOpen] = useState(false);
  const [erdCopyStatus, setErdCopyStatus] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const run = (action) => {
    setOpen(false);
    action();
  };

  const copyErdLink = async () => {
    try {
      await navigator.clipboard.writeText(OFFICIAL_ERD_URL);
      setErdCopyStatus('Copied');
    } catch {
      setErdCopyStatus('Retry');
    }
    setTimeout(() => setErdCopyStatus(''), 1800);
  };

  return (
    <div ref={menuRef} className="relative sm:ml-auto">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="toolbar-pill-shadow inline-flex items-center justify-center gap-2 rounded-full bg-[#F8F3EA] px-3.5 py-1.5 text-xs font-semibold text-[#002D72] transition hover:bg-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <span aria-hidden="true">⚙</span>
        Tools
        <span aria-hidden="true" className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Guide tools"
          className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-800"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onChangeName)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span aria-hidden="true">✎</span>
            Change name / email
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onToggleCompact)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span aria-hidden="true">{compact ? '⤢' : '⤡'}</span>
            {compact ? 'Switch to full view' : 'Switch to compact view'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onRefresh)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span aria-hidden="true">↻</span>
            Refresh updated data
          </button>
          <div className="flex items-center gap-1 rounded-lg pr-1 transition hover:bg-slate-100 dark:hover:bg-slate-700">
            <a
              href={OFFICIAL_ERD_URL}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
            >
              <span aria-hidden="true">↗</span>
              <span>Official ERD tool</span>
            </a>
            <button
              type="button"
              onClick={copyErdLink}
              className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600"
              aria-label="Copy official Hapag-Lloyd ERD tool link"
            >
              {erdCopyStatus || 'Copy'}
            </button>
          </div>
          <a
            href={CUSTOMER_INLAND_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span aria-hidden="true">↗</span>
            Customer Facing Inland Guide
          </a>
          <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onRequest)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-[#c95200] transition hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-slate-700"
          >
            <span aria-hidden="true">💡</span>
            <span className="text-center leading-tight">
              Request a feature<br />
              or any change
            </span>
          </button>
        </div>
      )}
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
// `onBack` puts a ← beside the × so every admin page can step back one level
// without hunting for a link at the bottom of the panel.
function ModalShell({ title, onClose, onBack, children }) {
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
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Back"
                title="Back"
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-2xl leading-none"
              >
                ←
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>
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
    'Enter a Booking Number to add it to the result and send a copy to the Rail Box email.',
    'Choose Dry Container or Reefer.',
    'Click Calculate, then choose Copy formatted or Copy text.',
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
      <img src={truckScene} alt="" title={IDT_TITLE} className="mb-4 h-36 w-full rounded-xl object-cover shadow-md" />
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

function ProfessionalPreview({ userName, userEmail, mobileDevice, onManagerAccess, onChangeName, nameEditorOpen, onCloseNameEditor, jokerOn, installOpen, onCloseInstall, onSaveIdentity }) {
  const [tab, setTab] = useState('calculator');
  const [canadaPort, setCanadaPort] = useState('');
  const [dark, toggleTheme] = useTheme();
  const goCanada = (slug) => { setCanadaPort(slug); setTab('cpkc'); };

  return (
    <div className="professional-preview min-h-screen">
      <header className="professional-header">
        <div className="professional-header-inner">
          <button type="button" onClick={() => { window.location.hash = ''; }} className="professional-wordmark" aria-label="Return to the current Inland Cutoff Guide">
            <img src={hapagLloydLogo} alt="Hapag-Lloyd" className="professional-brand-logo" />
            <span className="professional-product-name"><strong>Inland Cutoff Guide</strong><small>Rail Operations</small></span>
          </button>
          <div className="professional-header-actions">
            <span className="professional-status"><i /> Operational</span>
            <button type="button" onClick={onManagerAccess} className="professional-header-link">Managers</button>
            <button type="button" onClick={toggleTheme} className="professional-header-link" aria-label={dark ? 'Use light appearance' : 'Use semi-dark appearance'}>
              {dark ? '☀ Light' : '◐ Dusk'}
            </button>
            <button type="button" onClick={() => { window.location.hash = ''; }} className="professional-back-button">← Current design</button>
          </div>
        </div>
      </header>

      <main className="professional-shell">
        <section className="professional-intro">
          <div>
            <p className="professional-eyebrow">Inland operations workspace</p>
            <h1>Rail cutoff planning, made clear.</h1>
            <p className="professional-subtitle">Reliable return dates and ramp cutoffs in one focused workflow.</p>
          </div>
          {userName && (
            <button type="button" onClick={onChangeName} className="professional-user" title="Change name or email" aria-label="Change name or email">
              <span className="professional-avatar">{userName.trim().charAt(0).toUpperCase()}</span>
              <span><small>Signed in as</small><strong>{userName}</strong></span>
            </button>
          )}
        </section>

        <section className="professional-workspace">
          <div className="professional-tabs" role="tablist" aria-label="Cutoff tools">
            {[
              { id: 'calculator', label: 'US Rail Ramp Cuts', short: 'US Rail Cuts' },
              { id: 'cpkc', label: 'Canada Rail Ramp Cuts', short: 'Canada Rail Cuts' },
            ].map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => { setCanadaPort(''); setTab(item.id); }} className={tab === item.id ? 'is-active' : ''}>
                <span className="professional-tab-dot" />
                {mobileDevice ? item.short : item.label}
              </button>
            ))}
          </div>
          <div className="professional-form-surface">
            {tab === 'calculator'
              ? <LookupForm onCanadaPort={goCanada} professional />
              : <PortScheduleLookup onUpdateRamps={onManagerAccess} initialPort={canadaPort} professional />}
          </div>
        </section>

        <footer className="professional-footer"><span>Inland Cutoff Guide</span><span>Preview concept · v {APP_VERSION}</span></footer>
      </main>
      <NamePrompt
        open={!userName || !userEmail || nameEditorOpen}
        initialName={userName}
        initialEmail={userEmail}
        onSave={onSaveIdentity}
        onClose={onCloseNameEditor}
      />
      {installOpen && <InstallModal onClose={onCloseInstall} />}
      {jokerOn && <ObieWalkOn firstDelay={120_000} />}
    </div>
  );
}

export default function App() {
  const [installOpen, setInstallOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [userName, setUserName] = useState(getUserName);
  const [userEmail, setUserEmail] = useState(getUserEmail);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const pwaInstalled = usePwaInstallStatus();
  const mobileDevice = isMobileDevice();
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
    if (c.n >= 5) { c.n = 0; window.location.hash = '#managers'; }
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
    if (pwaInstalled || !userName || !userEmail) return undefined;
    const timer = window.setTimeout(() => setInstallOpen(true), 3 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [pwaInstalled, userName, userEmail]);

  if (hash === '#vintage-ERD-tool') {
    return <HlMockup />;
  }
  // The Managers Hub is a standard full page now (was a pop-out modal).
  if (hash === '#managers') {
    return <ManagersPage />;
  }
  if (hash === '#professional') {
    return (
      <ProfessionalPreview
        userName={userName}
        userEmail={userEmail}
        mobileDevice={mobileDevice}
        onManagerAccess={() => { window.location.hash = '#managers'; }}
        onChangeName={() => setNameEditorOpen(true)}
        nameEditorOpen={nameEditorOpen}
        onCloseNameEditor={() => setNameEditorOpen(false)}
        jokerOn={jokerOn}
        installOpen={installOpen}
        onCloseInstall={() => setInstallOpen(false)}
        onSaveIdentity={(name, email) => { setUserName(name); setUserEmail(email); }}
      />
    );
  }
  return (
    <div className="min-h-screen bg-[#EDE6D6] dark:bg-slate-900 flex flex-col">
      {/* Banner constrained to just past the content edges (~5% wider each side). */}
      {!compactView && (
        <div className="w-full max-w-[70rem] mx-auto px-4 pt-4">
          <div className="hero-train-stage" data-doviber-trigger>
            <img
              src={heroTop}
              alt="IDT Inland Cutoff Rail Guide"
              className="hero-train-banner"
            />
            <img
              src={heroTrainCleanPlate}
              alt=""
              aria-hidden="true"
              className="hero-train-clean-plate"
            />
            <img
              src={heroNsTrainOverlay}
              alt=""
              aria-hidden="true"
              className="hero-train-overlay hero-train-overlay--ns"
            />
            <img
              src={heroCpTrainOverlay}
              alt=""
              aria-hidden="true"
              className="hero-train-overlay hero-train-overlay--cp"
            />
            <img
              src={heroNsTrainOverlay}
              alt=""
              aria-hidden="true"
              className="hero-train-overlay hero-train-overlay--ns hero-train-resting hero-train-resting--ns"
            />
            <img
              src={heroCpTrainOverlay}
              alt=""
              aria-hidden="true"
              className="hero-train-overlay hero-train-overlay--cp hero-train-resting hero-train-resting--cp"
            />
          </div>
        </div>
      )}

      {/* Header constrained to the hero width so it no longer draws a full-width line. */}
      <div className={`w-full max-w-[70rem] mx-auto px-4 ${compactView ? 'pt-3' : 'mt-3'}`}>
        <header className={`bg-[#F8F3EA] dark:bg-slate-800 border border-[#E0D8C5] dark:border-slate-700 rounded-xl flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-3 ${compactView ? 'px-4 py-2' : 'px-4 py-3 sm:px-5'}`}>
          {!mobileDevice && (
            <div>
              <h1 onClick={secretTap} className={`${compactView ? 'text-[1.15rem]' : 'text-[1.5rem]'} font-bold text-[#002D72] dark:text-white smallcaps txt-shadow-heavy select-none`}>
                <span data-doviber-word="inland">The</span>{' '}
                <span data-doviber-word="cutoff">Premier</span>{' '}
                <span data-doviber-word="rail">Rail Cutoff</span>{' '}
                <span data-doviber-word="guide">Tool</span>
              </h1>
              {!compactView && <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Built for Cutoffs. Built for Speed. Built by the Rail Team.</p>}
              {userName && (
                <p className={`${compactView ? 'mt-0.5 text-xs' : 'mt-1 text-sm'} text-slate-600 dark:text-slate-300`}>
                  Welcome, <span className="font-semibold text-[#002D72] dark:text-white">{userName}</span>
                </p>
              )}
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
          <TopControls compact={compactView} mobile={mobileDevice} showInstall={!pwaInstalled && !mobileDevice} onManagerAccess={() => { window.location.hash = '#managers'; }} />
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
            <DesktopToolsMenu
              compact={compact}
              onToggleCompact={toggleCompact}
              onChangeName={() => setNameEditorOpen(true)}
              onRefresh={refreshUpdatedData}
              onRequest={() => setRequestOpen(true)}
            />
          )}
        </div>
        {tab === 'calculator'
          ? <LookupForm onCanadaPort={goCanada} />
          : <PortScheduleLookup onUpdateRamps={() => { window.location.hash = '#managers'; }} initialPort={canadaPort} />}
      </main>

      {/* Missing email also reopens the prompt once, so existing name-only
          users get their email captured for the merged usage stats. */}
      <NamePrompt
        open={!userName || !userEmail || nameEditorOpen}
        initialName={userName}
        initialEmail={userEmail}
        onSave={(name, email) => {
          setUserName(name);
          setUserEmail(email);
          setNameEditorOpen(false);
        }}
        onClose={() => setNameEditorOpen(false)}
      />
      <UpdateToast />
      {installOpen && <InstallModal onClose={() => setInstallOpen(false)} />}
      {requestOpen && <FeatureRequestModal onClose={() => setRequestOpen(false)} />}

      {jokerOn && !compactView && <ObieWalkOn />}
      {!mobileDevice && <RailTeamSurprise />}
      <DoviberSurprise />
      <ObieEggs />

      <div className={`w-full max-w-[70rem] mx-auto px-4 text-right ${compactView ? 'mt-3' : 'mt-8'}`}>
        <a href="#professional" className="mr-3 text-[10px] font-semibold text-slate-400/70 transition hover:text-[#EB6608] dark:text-slate-600 dark:hover:text-orange-300">preview</a>
        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">v {APP_VERSION}</span>
      </div>
      {!compactView && (
      <div className="w-full max-w-[70rem] mx-auto px-4 mt-1 mb-4">
        <div className="hero-ship-stage">
          <img
            src={heroShipBanner}
            alt="Hapag-Lloyd IDT Inland Cutoff Rail Guide"
            className="hero-ship-banner"
          />
          <img
            src={heroShipOverlay}
            alt=""
            aria-hidden="true"
            className="hero-ship-overlay"
          />
        </div>
      </div>
      )}
    </div>
  );
}
