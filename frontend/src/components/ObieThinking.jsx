import React, { useState, useEffect, useRef } from 'react';
import { obBot } from '../assets/banners';
import sammieBot from '../assets/obie-copilot-robot-sammie-bot.png';

// Obie's idle thoughts — cargo/ops humor + encouragement. Rotate every 15s.
const THOUGHTS = [
  "Hi, I'm Obie — your IDT Mascot & Assistant. 👋",
  "Obie here — IDT Mascot and Assistant, at your service.",
  "Name's Obie. Mascot, assistant, and professional box enthusiast.",
  "Where's that container headed? The suspense is unreal.",
  "Hope it didn't miss the cut… nah, you've got this.",
  "Wow, you might have to roll that one — am I right?",
  "You're doing a great job today. Seriously.",
  "I can't wait to see where these boxes are going.",
  "You've got such a nice smile today. Or, well… you could have one.",
  "Is it just me, or is that vessel running hot?",
  "Another cutoff cracked. Chef's kiss.",
  "If I had thumbs, I'd give you two up.",
  "Reefer or dry? The eternal question.",
  "Somewhere, a container is proud of you.",
  "Rolling a box builds character. And backlog.",
  "I did the math. You're crushing it.",
  "That ramp cut time is looking spicy.",
  "Beep boop — that means 'nice work' in robot.",
  "Coffee break? You've earned it. I run on electrons.",
  "I bet that one makes the train. Circuits crossed.",
  "Ports open, spirits high. Let's move some steel.",
  "You + this tool = unstoppable.",
  "Detroit, Chicago, Calgary… the box world tour.",
  "Cutoffs fear you. As they should.",
  "Every container has a story. This one's a page-turner.",
  "Smooth move. Very smooth.",
  "I'd high-five you, but… no hands.",
  "Is that an LRD I see? Beautiful.",
  "Keep 'em rolling, captain.",
  "That's a clean lookup. Museum quality.",
  "Somewhere a dispatcher just smiled. That was you.",
  "The ocean's big, but your planning is bigger.",
  "One more box closer to Friday.",
];

// Sleepy rail rambling — shown briefly every few minutes once Obie dozes off.
const SLEEP_MUMBLES = [
  "zzz… did that box make the train…",
  "mmf… reefer plug's loose… zzz",
  "…ramp cut at noon… zzz…",
  "zzz… double-stack to Chicago…",
  "…intermodal… choo choo… zzz",
  "mmm… don't roll the container… zzz",
  "zzz… ERD's looking good… mmf…",
  "…Calgary ramp… right on time… zzz",
  "mmf… stack train's rolling… zzz",
  "…last free day… tomorrow… zzz",
];

const AWAKE_MS = 180_000;   // dozes off after 3 minutes on screen
const SETTLE_MS = 3_000;    // matches the 3s CSS shrink-to-corner transition
const MUMBLE_MS = 240_000;  // sleep-talks about rail every 4 minutes
const MUMBLE_HOLD_MS = 6_000;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export default function ObieThinking() {
  const [i, setI] = useState(() => Math.floor(Math.random() * THOUGHTS.length));
  const [asleep, setAsleep] = useState(false);
  const [settled, setSettled] = useState(false);   // true once the shrink finishes
  const [mumble, setMumble] = useState('');
  const [sammiePhase, setSammiePhase] = useState('idle');
  const clickCountRef = useRef(0);
  const lastClickRef = useRef(0);
  const sammieActiveRef = useRef(false);
  const sammieTimersRef = useRef([]);

  // Rotate thoughts while awake; the interval is torn down the moment he sleeps.
  useEffect(() => {
    if (asleep) return undefined;
    const id = setInterval(() => setI(n => (n + 1) % THOUGHTS.length), 15000);
    return () => clearInterval(id);
  }, [asleep]);

  // Left alone for three minutes, Obie nods off. Waking resets the clock.
  useEffect(() => {
    if (asleep) return undefined;
    const id = setTimeout(() => setAsleep(true), AWAKE_MS);
    return () => clearTimeout(id);
  }, [asleep]);

  // Hold the Z's / mumbles until the 3s shrink-to-corner has actually finished.
  useEffect(() => {
    if (!asleep) { setSettled(false); return undefined; }
    const id = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(id);
  }, [asleep]);

  // Once settled, he mutters something rail-related every four minutes.
  useEffect(() => {
    if (!settled) { setMumble(''); return undefined; }
    let holdTimer;
    const talk = () => {
      setMumble(pick(SLEEP_MUMBLES));
      holdTimer = window.setTimeout(() => setMumble(''), MUMBLE_HOLD_MS);
    };
    const id = window.setInterval(talk, MUMBLE_MS);
    return () => { window.clearInterval(id); window.clearTimeout(holdTimer); };
  }, [settled]);

  useEffect(() => () => {
    sammieTimersRef.current.forEach(window.clearTimeout);
  }, []);

  const startSammieRun = () => {
    if (sammieActiveRef.current) return;
    sammieActiveRef.current = true;
    setSammiePhase('roll-in');

    const phases = [
      ['greet', 2400],
      ['beep', 4000],
      ['wheelie', 5300],
      ['exit', 6500],
      ['offscreen', 9800],
      ['idle', 11900],
    ];

    sammieTimersRef.current = phases.map(([phase, delay]) => window.setTimeout(() => {
      setSammiePhase(phase);
      if (phase === 'idle') sammieActiveRef.current = false;
    }, delay));
  };

  const handleObieClick = () => {
    const now = Date.now();
    if (now - lastClickRef.current > 1200) clickCountRef.current = 0;
    lastClickRef.current = now;
    clickCountRef.current += 1;

    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0;
      startSammieRun();
    }
  };

  const wake = () => {
    setAsleep(false);
    setMumble('');
    clickCountRef.current = 0;
  };

  return (
    <div className="obie-stage relative w-full min-h-[26rem]">
      <div
        key={i}
        className={`thought-bubble joke-fade absolute left-1/2 top-1 max-w-[17rem] -translate-x-1/2 rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold leading-snug text-slate-800 shadow-lg transition-opacity duration-500 ${asleep ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      >
        {THOUGHTS[i]}
      </div>

      <button
        type="button"
        onClick={asleep ? wake : handleObieClick}
        aria-label="Obie, the Ops-Base Bot"
        title={asleep ? undefined : 'Obie is listening'}
        className={`obie-avatar ${asleep ? 'is-asleep' : 'is-awake'} cursor-pointer rounded-full bg-transparent p-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#EB6608]/70`}
      >
        {settled && (
          <>
            <span className="obie-sleep-z obie-sleep-z-behind" aria-hidden="true">
              <span>Z</span><span>Z</span><span>Z</span><span>Z</span><span>Z</span>
            </span>
            <span className="obie-sleep-z obie-sleep-z-front" aria-hidden="true">
              <span>Z</span><span>Z</span><span>Z</span>
            </span>
          </>
        )}
        {settled && mumble && (
          <span className="obie-sleep-mumble" role="status">{mumble}</span>
        )}
        <img
          src={obBot}
          alt="OB the Ops-Base Bot"
          className={`relative z-10 h-auto w-full drop-shadow-2xl ${settled ? 'obie-sleep-bob' : 'obie-float'}`}
        />
      </button>

      {!asleep && sammiePhase !== 'idle' && (
        <div className={`sammie-stage sammie-stage-${sammiePhase}`} aria-live="polite">
          {sammiePhase !== 'offscreen' && (
            <div className={`sammie-bot sammie-bot-${sammiePhase}`}>
              {(sammiePhase === 'greet' || sammiePhase === 'beep') && (
                <div className="sammie-speech" role="status">
                  {sammiePhase === 'greet' ? 'Hi Obie!!' : 'Beep Beep!'}
                </div>
              )}
              {(sammiePhase === 'wheelie' || sammiePhase === 'exit') && (
                <>
                  <div className="sammie-smoke" aria-hidden="true">
                    {Array.from({ length: 14 }, (_, smokeIndex) => (
                      <i key={smokeIndex} style={{
                        '--smoke-index': smokeIndex,
                        '--smoke-size': `${42 + (smokeIndex % 5) * 10}px`,
                        '--smoke-y': `${(smokeIndex % 4) * 7}px`,
                      }} />
                    ))}
                  </div>
                  <div className="sammie-skid" aria-hidden="true"><i /><i /><i /></div>
                </>
              )}
              <img src={sammieBot} alt="Sammie Bot, smiling and winking from his robot body" />
            </div>
          )}
          {sammiePhase === 'offscreen' && (
            <>
              <div className="sammie-offscreen-smoke" aria-hidden="true">
                {Array.from({ length: 18 }, (_, smokeIndex) => (
                  <i key={smokeIndex} style={{
                    '--smoke-index': smokeIndex,
                    '--smoke-size': `${48 + (smokeIndex % 5) * 11}px`,
                    '--smoke-y': `${(smokeIndex % 5) * 8}px`,
                  }} />
                ))}
              </div>
              <div className="sammie-final-line" role="status">Eat my dust Maersk!</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
