import React, { useState, useEffect } from 'react';
import { obBot } from '../assets/banners';
import obieCopilot from '../assets/obie-copilot-robot.png';

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
  const [showCopilot, setShowCopilot] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setI(n => (n + 1) % THOUGHTS.length), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!showCopilot) return;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setShowCopilot(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showCopilot]);

  return (
    <div className="flex flex-col items-center justify-center select-none">
      <div key={i} className="joke-fade thought-bubble relative mb-5 max-w-[17rem] bg-white text-slate-800 rounded-2xl px-4 py-3 shadow-lg text-center text-sm font-semibold leading-snug">
        {THOUGHTS[i]}
      </div>
      <button
        type="button"
        onClick={() => setShowCopilot(true)}
        aria-label="Meet Obie's robot co-pilot"
        title="Click Obie to call in backup"
        className="rounded-full bg-transparent p-0 transition hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#EB6608]/70"
      >
        <img src={obBot} alt="OB the Ops-Base Bot" className="obie-float w-[21.5rem] max-w-full h-auto drop-shadow-2xl" />
      </button>

      {showCopilot && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCopilot(false); }}
        >
          <section role="dialog" aria-modal="true" aria-label="Obie's robot co-pilot" className="relative w-full max-w-md overflow-hidden rounded-2xl border-4 border-[#EB6608] bg-[#002D72] shadow-2xl">
            <button
              type="button"
              onClick={() => setShowCopilot(false)}
              aria-label="Close robot co-pilot"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/70 text-xl font-bold text-white shadow-lg transition hover:bg-[#EB6608]"
            >
              ×
            </button>
            <img src={obieCopilot} alt="Smiling, winking robot co-pilot" className="block aspect-square w-full object-cover" />
            <div className="border-t-2 border-[#EB6608] px-5 py-4 text-center text-white">
              <p className="text-lg font-extrabold">Obie called in backup.</p>
              <p className="mt-1 text-sm text-white/80">Your robot co-pilot is ready for the next cutoff.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
