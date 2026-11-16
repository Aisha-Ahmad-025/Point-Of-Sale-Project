import { useEffect, useRef, useState } from 'react';

const REDUCED = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Welcome screen shown every time the app is opened: the brand reveal leads into the sign-in page.
 * Click, tap or press any key to skip.
 */
export default function Splash({ onLeave, onDone, duration = 2800 }) {
  const ms = REDUCED() ? 700 : duration;
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const leave = () => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    onLeave?.(); // the page underneath mounts now, so its entrance animation plays while the curtain lifts
    setTimeout(onDone, REDUCED() ? 50 : 750); // wait for the slide-up transition
  };

  useEffect(() => {
    const t = setTimeout(leave, ms);
    const key = () => leave();
    window.addEventListener('keydown', key);
    return () => { clearTimeout(t); window.removeEventListener('keydown', key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`splash${leaving ? ' leaving' : ''}`} role="status" aria-label="SwiftShelf POS is loading" onClick={leave} data-testid="splash">
      <div className="splash-mark-wrap" aria-hidden="true">
        <span className="splash-halo" />
        <svg className="splash-logo relative" width="120" height="120" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <linearGradient id="splashGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F8D582" />
              <stop offset="52%" stopColor="#F2A93B" />
              <stop offset="100%" stopColor="#D88A22" />
            </linearGradient>
          </defs>
          <rect x=".75" y=".75" width="62.5" height="62.5" rx="16" fill="url(#splashGold)" stroke="#FFE6AC" strokeOpacity=".5" strokeWidth="1.5" />
          <g fill="#2B1B12">
            <rect x="12" y="20" width="9" height="12" rx="2" /><rect x="24" y="15" width="9" height="17" rx="2" /><rect x="36" y="22" width="9" height="10" rx="2" />
            <rect x="9" y="33" width="46" height="4" rx="2" />
            <rect x="14" y="41" width="12" height="9" rx="2" /><rect x="29" y="43" width="8" height="7" rx="2" /><rect x="40" y="39" width="10" height="11" rx="2" />
            <rect x="9" y="51" width="46" height="4" rx="2" />
          </g>
          <path d="M47 12l-4 8h5l-3 7" fill="none" stroke="#2B1B12" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="splash-eyebrow">Point of sale · Made simple</p>
      <h1 className="splash-word relative mt-3 text-4xl font-extrabold tracking-tight text-[#FBF6EC] sm:text-5xl">SwiftShelf<span className="text-gradient"> POS</span></h1>
      <span className="splash-divider" aria-hidden="true" />
      <p className="splash-tag relative mt-3 px-6 text-center text-base font-medium text-[#FBF6EC]/70 sm:text-lg">Small store. Smarter business.</p>
      <div className="splash-prompt" aria-hidden="true">
        <span className="splash-prompt-dot" />
        <span>Tap anywhere to continue</span>
      </div>
    </div>
  );
}
