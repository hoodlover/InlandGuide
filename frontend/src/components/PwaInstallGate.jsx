import { useEffect, useState } from 'react';

const randomBetween = (min, max) => min + Math.random() * (max - min);

function isStandaloneDisplay() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function shouldShowInstallGate() {
  const hosted = window.location.protocol === 'https:' || window.location.protocol === 'http:';
  const local = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const preview = local && new URLSearchParams(window.location.search).has('install-preview');
  return preview || (hosted && !local && !isStandaloneDisplay());
}

function makeObieScene(id) {
  const mode = Math.random() < 0.62 ? 'pass' : 'zoom';
  return {
    id,
    mode,
    delay: randomBetween(2200, 9000),
    duration: mode === 'pass' ? randomBetween(5200, 12800) : randomBetween(3600, 7200),
    top: mode === 'pass' ? randomBetween(8, 72) : randomBetween(22, 72),
    left: randomBetween(14, 86),
    size: mode === 'pass' ? randomBetween(12, 20) : randomBetween(11, 18),
    scale: randomBetween(2.2, 4.2),
  };
}

function InstallGateObie() {
  const [scene, setScene] = useState(() => makeObieScene(1));
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMoving(true), scene.delay);
    return () => window.clearTimeout(timer);
  }, [scene]);

  if (!moving) return null;

  const style = {
    '--obie-duration': `${scene.duration}ms`,
    '--obie-top': `${scene.top}vh`,
    '--obie-left': `${scene.left}vw`,
    '--obie-size': `${scene.size}rem`,
    '--obie-end-scale': scene.scale,
  };

  return (
    <img
      key={scene.id}
      src={scene.mode === 'pass' ? './install-obie-side.webp' : './install-obie-front.webp'}
      alt=""
      aria-hidden="true"
      className={`install-gate-obie install-gate-obie-${scene.mode}`}
      style={style}
      onAnimationEnd={() => {
        setMoving(false);
        setScene(current => makeObieScene(current.id + 1));
      }}
    />
  );
}

export default function PwaInstallGate() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [message, setMessage] = useState('');
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  useEffect(() => {
    const capturePrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setStatus('ready');
    };
    const installed = () => {
      setInstallPrompt(null);
      setStatus('installed');
      try { localStorage.setItem('icg-pwa-installed', '1'); } catch { /* storage unavailable */ }
    };
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      setMessage(
        isiOS
          ? 'In Safari, tap Share, then Add to Home Screen.'
          : 'Use the install icon in the browser address bar, or choose Install app from the browser menu.',
      );
      return;
    }
    setMessage('');
    try {
      const result = await installPrompt.prompt();
      setInstallPrompt(null);
      if (result.outcome === 'accepted') {
        setStatus('installing');
      } else {
        setStatus('waiting');
        setMessage('Installation was canceled. You can try again from the browser install icon.');
      }
    } catch {
      setStatus('waiting');
      setMessage('Use the install icon in the browser address bar to install the app.');
    }
  };

  const installed = status === 'installed';

  return (
    <main className="install-gate">
      <div className="install-gate-blue" aria-hidden="true" />
      <InstallGateObie />

      <section className="install-gate-panel" aria-labelledby="install-gate-title">
        <p className="install-gate-kicker">{installed ? 'Ready to launch' : 'Install the app'}</p>
        <h1 id="install-gate-title">Inland Cutoff Guide</h1>
        <p className="install-gate-copy">
          {installed
            ? 'Installation complete. Close this screen, then open Inland Cutoff Guide from your Start menu.'
            : (
              <>
                Install Inland Cutoff Guide to open the
                <span className="install-gate-copy-emphasis">ERD/LRD Inland Guide.</span>
              </>
            )}
        </p>

        <div className="install-gate-actions">
          {!installed && (
            <button
              type="button"
              className="install-gate-button"
              onClick={install}
              disabled={status === 'installing'}
            >
              <span aria-hidden="true">↓</span>
              {status === 'installing' ? 'Installing...' : 'Install app'}
            </button>
          )}

          <a
            className="install-gate-open"
            href="./?open-app=1"
            target="_blank"
            rel="noopener"
            onClick={() => setMessage('If the app does not open, select Open in app in the browser address bar.')}
          >
            {installed ? 'Open app' : 'Already installed? Open app'}
          </a>
        </div>

        {!installed && status !== 'ready' && status !== 'installing' && !message && (
          <p className="install-gate-help">
            {isiOS
              ? 'In Safari, tap Share, then Add to Home Screen.'
              : 'Select Install app above. If your browser does not open the installer, use its address-bar install icon.'}
          </p>
        )}

        {message && <p className="install-gate-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
