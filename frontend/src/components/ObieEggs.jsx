// FIRE + BOOM easter eggs, ported from the OPS-BASE project.
//  - Type "fire" outside a text field: OB flies in from the top-left, fires
//    two missiles, and exits (~6.5s).
//  - Type "boom" outside a text field: OB walks in from the right, places
//    dynamite by a rusty Maersk container, yells "FIRE IN THE HOLE!", and the
//    container blows into slow-mo debris (~9.2s).
// Animations live in index.css (bot-egg-* / bombbot-*). The debris pieces get
// their background via inline style so the imported asset URL works in both
// the live build and the offline single-file build.

import React, { useEffect, useRef, useState } from 'react';
import obBotEgg from '../assets/obie-egg-bot.png';
import maerskStack from '../assets/maersk-rusty-stack.webp';
import dynamite from '../assets/dynamite.png';

function ObieRockets({ playKey, onDone }) {
  useEffect(() => {
    if (!playKey) return undefined;
    const t = setTimeout(onDone, 6500);
    return () => clearTimeout(t);
  }, [playKey, onDone]);
  if (!playKey) return null;
  return (
    <div className="bot-egg-stage" key={playKey} aria-hidden="true">
      <img className="bot-egg" src={obBotEgg} alt="" />
      <span className="bot-rocket bot-rocket-direct" />
      <span className="bot-rocket bot-rocket-arc" />
      <span className="bot-boom bot-boom-1" />
      <span className="bot-boom bot-boom-2" />
      <span className="bot-egg-trail" />
      <span className="bot-bubble">FIRE THE MISSILES!</span>
    </div>
  );
}

function ObieBomb({ playKey, onDone }) {
  useEffect(() => {
    if (!playKey) return undefined;
    const t = setTimeout(onDone, 9200);
    return () => clearTimeout(t);
  }, [playKey, onDone]);
  if (!playKey) return null;
  const debris = { backgroundImage: `url(${maerskStack})` };
  return (
    <div className="bombbot-stage" key={playKey} aria-hidden="true">
      <div className="bombbot-ctr">
        <img src={maerskStack} alt="" className="bombbot-ctr-img" />
      </div>
      {/* Debris pieces — appear at boom time and fly outward */}
      <span className="bombbot-ctr-piece p1" style={debris} />
      <span className="bombbot-ctr-piece p2" style={debris} />
      <span className="bombbot-ctr-piece p3" style={debris} />
      <span className="bombbot-ctr-piece p4" style={debris} />
      <span className="bombbot-ctr-piece p5" style={debris} />
      <span className="bombbot-ctr-piece p6" style={debris} />
      <span className="bombbot-ctr-piece p7" style={debris} />
      <span className="bombbot-ctr-piece p8" style={debris} />

      <img className="bombbot" src={obBotEgg} alt="" />
      <span className="bombbot-dyno">
        <img src={dynamite} alt="" className="bombbot-dyno-img" />
        <span className="bombbot-dyno-spark" />
      </span>
      <span className="bombbot-yell">FIRE IN THE HOLE!</span>
      <span className="bombbot-flash" />
      <span className="bombbot-boom" />
      <span className="bombbot-shock" />
    </div>
  );
}

export default function ObieEggs() {
  const [rocketsKey, setRocketsKey] = useState(0);
  const [bombKey, setBombKey] = useState(0);
  const keyBuf = useRef('');

  useEffect(() => {
    const onKey = (e) => {
      const inField = e.target instanceof HTMLElement && (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable
      );
      if (inField || e.ctrlKey || e.altKey || e.metaKey) return;
      if (!/^[a-z]$/i.test(e.key)) return;
      keyBuf.current = (keyBuf.current + e.key.toLowerCase()).slice(-8);
      if (keyBuf.current.endsWith('fire')) {
        keyBuf.current = '';
        setRocketsKey(n => n + 1);
      } else if (keyBuf.current.endsWith('boom')) {
        keyBuf.current = '';
        setBombKey(n => n + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <ObieRockets playKey={rocketsKey} onDone={() => setRocketsKey(0)} />
      <ObieBomb playKey={bombKey} onDone={() => setBombKey(0)} />
    </>
  );
}
