const S = { stroke: 'rgb(var(--accent))', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
const BRAND = (o) => `rgb(var(--brand) / ${o})`;
const Sparkle = ({ x, y, s = 5 }) => <path d={`M${x} ${y - s} V${y + s} M${x - s} ${y} H${x + s}`} {...S} strokeWidth="2" />;

const ART = {
  box: (<>
    <ellipse cx="70" cy="100" rx="36" ry="5" fill="rgb(var(--ink) / .08)" />
    <path d="M30 46 L70 28 L110 46 L70 64 Z" fill="rgb(var(--surface))" {...S} />
    <path d="M30 46 L70 64 V100 L30 82 Z" fill={BRAND('.4')} {...S} />
    <path d="M110 46 L70 64 V100 L110 82 Z" fill={BRAND('.75')} {...S} />
    <path d="M54 56 L54 70" {...S} strokeWidth="2" /><Sparkle x={24} y={26} /><Sparkle x={118} y={24} s={4} /><circle cx="102" cy="14" r="2.5" fill={BRAND('.9')} />
  </>),
  cart: (<>
    <ellipse cx="70" cy="100" rx="38" ry="5" fill="rgb(var(--ink) / .08)" />
    <path d="M16 26 H32 L42 70 H100 L110 40 H36" fill={BRAND('.3')} {...S} />
    <rect x="52" y="48" width="12" height="16" rx="3" fill={BRAND('.9')} {...S} /><rect x="68" y="42" width="12" height="22" rx="3" fill="rgb(var(--surface))" {...S} /><rect x="84" y="52" width="12" height="12" rx="3" fill={BRAND('.6')} {...S} />
    <circle cx="54" cy="84" r="7" fill="rgb(var(--surface))" {...S} /><circle cx="92" cy="84" r="7" fill="rgb(var(--surface))" {...S} /><Sparkle x={118} y={24} s={4} />
  </>),
  receipt: (<>
    <ellipse cx="70" cy="102" rx="34" ry="4" fill="rgb(var(--ink) / .08)" />
    <path d="M38 14 H102 V90 L95 84 L88 90 L81 84 L74 90 L67 84 L60 90 L53 84 L46 90 L38 84 Z" fill="rgb(var(--surface))" {...S} />
    <path d="M50 30 H90 M50 42 H78 M50 54 H84" {...S} strokeWidth="2.2" /><rect x="50" y="64" width="40" height="10" rx="4" fill={BRAND('.8')} stroke="none" />
    <Sparkle x={24} y={30} s={4} /><Sparkle x={118} y={44} />
  </>),
  people: (<>
    <ellipse cx="70" cy="100" rx="40" ry="5" fill="rgb(var(--ink) / .08)" />
    <circle cx="86" cy="44" r="11" fill={BRAND('.45')} {...S} /><path d="M66 92 q0-24 20-24 q20 0 20 24" fill={BRAND('.45')} {...S} />
    <circle cx="52" cy="48" r="13" fill="rgb(var(--surface))" {...S} /><path d="M28 94 q0-26 24-26 q24 0 24 26 Z" fill={BRAND('.9')} {...S} /><Sparkle x={118} y={26} s={4} />
  </>),
  search: (<>
    <ellipse cx="70" cy="102" rx="36" ry="4" fill="rgb(var(--ink) / .08)" />
    <rect x="22" y="22" width="52" height="64" rx="8" fill="rgb(var(--surface))" {...S} /><path d="M32 38 H62 M32 50 H54 M32 62 H58" {...S} strokeWidth="2" />
    <circle cx="82" cy="58" r="22" fill={BRAND('.35')} {...S} /><path d="M98 74 L118 94" {...S} strokeWidth="5" /><path d="M72 50 q4-6 12-4" {...S} strokeWidth="2" />
  </>),
  chart: (<>
    <ellipse cx="70" cy="102" rx="42" ry="4" fill="rgb(var(--ink) / .08)" />
    <path d="M22 18 V90 H122" {...S} />
    <rect x="34" y="62" width="14" height="28" rx="3" fill={BRAND('.45')} {...S} /><rect x="56" y="46" width="14" height="44" rx="3" fill={BRAND('.9')} {...S} /><rect x="78" y="70" width="14" height="20" rx="3" fill={BRAND('.45')} {...S} /><rect x="100" y="34" width="14" height="56" rx="3" fill="rgb(var(--surface))" {...S} />
    <path d="M30 50 L58 34 L84 52 L112 20" {...S} strokeWidth="2" strokeDasharray="1 5" /><Sparkle x={118} y={14} s={4} />
  </>),
};

/** Friendly line-art for empty screens. Colours come from the theme tokens, so it works in light and dark mode. */
export default function Art({ name = 'box', className = 'h-28 w-auto' }) {
  return <svg viewBox="0 0 140 110" className={`${className} floaty`} role="img" aria-hidden="true" data-art={name}>{ART[name] || ART.box}</svg>;
}
export const ART_NAMES = Object.keys(ART);
