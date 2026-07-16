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

export default function ObieThinking() {
  const [i, setI] = useState(() => Math.floor(Math.random() * THOUGHTS.length));
  const [sammiePhase, setSammiePhase] = useState('idle');
  const clickCountRef = useRef(0);
  const lastClickRef = useRef(0);
  const sammieActiveRef = useRef(false);
  const sammieTimersRef = useRef([]);

  useEffect(() => {
    const id = setInterval(() => setI(n => (n + 1) % THOUGHTS.length), 15000);
    return () => clearInterval(id);
  }, []);

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

  return (
    <div className="flex flex-col items-center justify-center select-none">
      <div key={i} className="joke-fade thought-bubble relative mb-5 max-w-[17rem] bg-white text-slate-800 rounded-2xl px-4 py-3 shadow-lg text-center text-sm font-semibold leading-snug">
        {THOUGHTS[i]}
      </div>
      <button
        type="button"
        onClick={handleObieClick}
        aria-label="Obie, the Ops-Base Bot"
        title="Obie is listening"
        className="rounded-full bg-transparent p-0 transition hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#EB6608]/70"
      >
        <img src={obBot} alt="OB the Ops-Base Bot" className="obie-float w-[21.5rem] max-w-full h-auto drop-shadow-2xl" />
      </button>

      {sammiePhase !== 'idle' && (
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
