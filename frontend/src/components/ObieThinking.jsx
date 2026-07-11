import React, { useState, useEffect } from 'react';
import { obBot } from '../assets/banners';

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

  useEffect(() => {
    const id = setInterval(() => setI(n => (n + 1) % THOUGHTS.length), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center select-none">
      <div key={i} className="joke-fade thought-bubble relative mb-5 max-w-[17rem] bg-white text-slate-800 rounded-2xl px-4 py-3 shadow-lg text-center text-sm font-semibold leading-snug">
        {THOUGHTS[i]}
      </div>
      <img src={obBot} alt="OB the Ops-Base Bot" className="obie-float w-[21.5rem] max-w-full h-auto drop-shadow-2xl" />
    </div>
  );
}
