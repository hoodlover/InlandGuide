import React, { useState, useEffect } from 'react';
import LookupForm from './components/LookupForm';
import { bannerTop, bannerBottom, obBot } from './assets/banners';
import './index.css';

// Proof-of-concept block for phones/tablets (soft — can be bypassed via "desktop site").
function isMobileDevice() {
  const ua = navigator.userAgent || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i.test(ua);
}

// OB the OPS-BASE BOT keeps the mobile crowd entertained while denying access.
const OB_JOKES = [
  "Why did the container break up with the ship? It just needed more space.",
  "I'd tell you a joke about rail schedules, but it might not arrive on time.",
  "Why don't cargo ports ever feel lonely? They're always full of vessels.",
  "I tried to catch fog at the terminal once. Mist.",
  "Why did the train conductor get the promotion? He had all the right connections.",
  "What do you call a shipping box that sings? A container tenor.",
  "Why did the freight go to therapy? Too much baggage.",
  "What did the dock say to the departing ship? 'Long time no sea.'",
  "How does a locomotive stay in shape? It just chugs along.",
  "Why don't you ever trust a cutoff date? It changes at the last minute.",
  "I told my boss I'd ship the report by rail. He said quit stalling on the tracks.",
  "Why was the forklift so confident? It could really lift the mood.",
  "What's a pirate's favorite part of the port? The ARRR-rival.",
  "Why did the crane get an award? It was truly outstanding in its field.",
  "I wanted a career in reefer cargo, but it was too cool for me.",
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

export default function App() {
  if (isMobileDevice()) {
    return <MobileBlock />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <img
        src={bannerTop}
        alt="Hapag-Lloyd IDT Ops Base"
        className="w-full h-auto block"
      />

      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-slate-900">Inland Cutoff Guide</h1>
          <p className="text-slate-500 text-sm mt-1">Rail cutoff &amp; delivery date calculator</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 w-full flex-1">
        <LookupForm />
      </main>

      <img
        src={bannerBottom}
        alt="Hapag-Lloyd IDT Ops Base"
        className="w-full h-auto block mt-8"
      />
    </div>
  );
}