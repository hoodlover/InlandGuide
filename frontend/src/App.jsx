import React, { useState, useEffect } from 'react';
import LookupForm from './components/LookupForm';
import { bannerTop, bannerBottom, obBot } from './assets/banners';
import './index.css';

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

function ObieWalkOn() {
  const [visible, setVisible] = useState(false);
  const [joke, setJoke] = useState(() => OB_JOKES[Math.floor(Math.random() * OB_JOKES.length)]);

  useEffect(() => {
    let showT, hideT;
    const enter = () => {
      setJoke(OB_JOKES[Math.floor(Math.random() * OB_JOKES.length)]);
      setVisible(true);
      hideT = setTimeout(() => {
        setVisible(false);
        showT = setTimeout(enter, OBIE_HIDE_MS);
      }, OBIE_SHOW_MS);
    };
    showT = setTimeout(enter, OBIE_FIRST_MS);
    return () => { clearTimeout(showT); clearTimeout(hideT); };
  }, []);

  return (
    <div className={`obie-walkon ${visible ? 'obie-in' : 'obie-out'}`} aria-hidden={!visible}>
      <div className="relative max-w-[240px] bg-white border-2 border-[#002D72] rounded-2xl px-4 py-3 shadow-xl">
        <p className="text-[10px] uppercase tracking-widest text-[#EB6608] font-bold mb-1">OB says…</p>
        <p className="text-sm font-semibold text-slate-800 leading-snug">{joke}</p>
      </div>
      <img src={obBot} alt="OB the Ops-Base Bot" className="w-24 h-auto drop-shadow-xl" />
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

      <ObieWalkOn />

      <img
        src={bannerBottom}
        alt="Hapag-Lloyd IDT Ops Base"
        className="w-full h-auto block mt-8"
      />
    </div>
  );
}