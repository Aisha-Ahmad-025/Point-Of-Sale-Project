import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

const cx = (...a) => a.filter(Boolean).join(' ');
export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fades/slides its children in the first time they scroll into view. Falls back to "visible" without IntersectionObserver. */
export function Reveal({ children, delay = 0, className, as: Tag = 'div', ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined' || prefersReducedMotion());
  useEffect(() => {
    if (shown || !ref.current) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return <Tag ref={ref} className={cx('reveal', shown && 'is-in', className)} style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }} {...rest}>{children}</Tag>;
}

/** Counts from the previous value to `value` (ease-out). `format` turns the in-between number into text. */
export function AnimatedNumber({ value, format = (v) => String(Math.round(v)), duration = 900, className }) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [shown, setShown] = useState(prefersReducedMotion() ? target : 0);
  const last = useRef(prefersReducedMotion() ? target : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(target); last.current = target; return undefined; }
    const from = last.current; const start = performance.now(); let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration); const eased = 1 - (1 - p) ** 3;
      setShown(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick); else last.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return <span className={cx('tabular', className)}>{format(shown)}</span>;
}

/** Builds the SVG path strings for a sparkline (exported for tests). */
export function sparklinePath(data, width = 96, height = 32, pad = 3) {
  const pts = (data || []).map(Number).filter((n) => Number.isFinite(n));
  if (pts.length === 0) return { line: '', area: '', last: null };
  const series = pts.length === 1 ? [pts[0], pts[0]] : pts;
  const min = Math.min(...series); const max = Math.max(...series); const span = max - min || 1;
  const x = (i) => pad + (i * (width - 2 * pad)) / (series.length - 1);
  const y = (v) => (max === min ? height / 2 : height - pad - ((v - min) / span) * (height - 2 * pad));
  const coords = series.map((v, i) => [x(i), y(v)]);
  // smooth curve through the points (Catmull-Rom to cubic Bezier)
  let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] || coords[i]; const p1 = coords[i]; const p2 = coords[i + 1]; const p3 = coords[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]; const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const lastPt = coords[coords.length - 1];
  return { line: d, area: `${d} L ${lastPt[0].toFixed(1)} ${height} L ${coords[0][0].toFixed(1)} ${height} Z`, last: lastPt };
}

/** Tiny trend line for KPI cards. Purely decorative, so it is hidden from assistive tech. */
export function Sparkline({ data, width = 96, height = 32, className, tone = 'accent' }) {
  const id = useId().replace(/:/g, '');
  const { line, area, last } = sparklinePath(data, width, height);
  if (!line) return null;
  const color = tone === 'danger' ? 'rgb(var(--danger))' : 'rgb(var(--accent))';
  return (
    <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" data-testid="sparkline">
      <defs><linearGradient id={`sg${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F2A93B" stopOpacity=".55" /><stop offset="100%" stopColor="#F2A93B" stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#sg${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spark-line" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />}
    </svg>
  );
}

/** ▲ 12.5% / ▼ 4% badge. `inverse` flips the colours for metrics where going up is bad (e.g. debt). */
export function Trend({ value, inverse = false, className, suffix }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return <span className={cx('text-xs text-muted', className)}>—</span>;
  const v = Number(value); const flat = Math.abs(v) < 0.05; const up = v > 0;
  const good = flat ? null : inverse ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold', flat ? 'bg-raised text-muted' : good ? 'bg-ok/12 text-ok' : 'bg-danger/12 text-danger', className)} data-testid="trend">
      <Icon className="h-3 w-3" aria-hidden="true" />{`${Math.abs(v).toFixed(1)}%`}{suffix ? <span className="ms-1 font-medium opacity-70">{suffix}</span> : null}
    </span>
  );
}
