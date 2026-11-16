import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from './ui';

const TONES = {
  brand: 'from-[#2B1B12] to-[#0F0B09] text-white', ok: 'from-[#1f4f35] to-[#2c7b52] text-white', warn: 'from-[#7a4d0b] to-[#b5750d] text-white',
  danger: 'from-[#7d2d1e] to-[#d6452b] text-white', info: 'from-[#2d3c5e] to-[#4e7ac2] text-white',
};

/** Swipeable "story" cards (scroll-snap). Arrows on desktop, drag/swipe on touch, dots show the position. */
export default function Highlights({ cards }) {
  const { t } = useTranslation();
  const row = useRef(null);
  const [index, setIndex] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: false });

  const sync = useCallback(() => {
    const el = row.current; if (!el) return;
    const first = el.firstElementChild; const step = first ? first.getBoundingClientRect().width + 12 : 1;
    setIndex(Math.min(cards.length - 1, Math.round(el.scrollLeft / step)));
    setEdges({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, [cards.length]);
  useEffect(() => { sync(); }, [sync, cards.length]);

  const move = (dir) => { const el = row.current; const first = el?.firstElementChild; if (!el || !first) return; el.scrollBy({ left: dir * (first.getBoundingClientRect().width + 12), behavior: 'smooth' }); };
  const goTo = (i) => { const el = row.current; const first = el?.firstElementChild; if (!el || !first) return; el.scrollTo({ left: i * (first.getBoundingClientRect().width + 12), behavior: 'smooth' }); };

  return (
    <section aria-label={t('highlights.title')} className="relative">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">{t('highlights.title')}</h2>
        <div className="hidden gap-1.5 sm:flex">
          <button className="btn btn-secondary !rounded-full !p-2" onClick={() => move(-1)} disabled={edges.start} aria-label={t('table.prev')}><ChevronLeft className="h-4 w-4" /></button>
          <button className="btn btn-secondary !rounded-full !p-2" onClick={() => move(1)} disabled={edges.end} aria-label={t('table.next')}><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div ref={row} onScroll={sync} className="snap-row no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-3" tabIndex={0} role="group" aria-roledescription="carousel">
        {cards.map((c) => (
          <Link key={c.key} to={c.to} className={cx('group relative flex min-h-[148px] w-[78%] shrink-0 flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br p-5 shadow-lift transition-transform duration-300 hover:-translate-y-1 sm:w-[300px]', TONES[c.tone || 'brand'])}>
            <span className="pointer-events-none absolute -end-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
            <span className="pointer-events-none absolute inset-0 opacity-[.08]" style={{ backgroundImage: 'linear-gradient(rgb(255 255 255 / .9) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / .9) 1px, transparent 1px)', backgroundSize: '28px 28px' }} aria-hidden="true" />
            <div className="relative flex items-start justify-between gap-3">
              <span className="icon-tile h-10 w-10 border border-white/20 bg-white/15 backdrop-blur"><c.icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition group-hover:bg-white/30"><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
            </div>
            <div className="relative">
              <p className="text-[11px] font-bold uppercase tracking-[.14em] text-white/70">{c.label}</p>
              <p className="mt-0.5 truncate text-[26px] font-extrabold leading-tight tracking-tight">{c.value}</p>
              {c.sub && <p className="mt-0.5 truncate text-xs text-white/75">{c.sub}</p>}
            </div>
          </Link>
        ))}
      </div>
      <div className="flex justify-center gap-1.5" role="tablist" aria-label={t('highlights.position')}>
        {cards.map((c, i) => <button key={c.key} role="tab" aria-selected={i === index} aria-label={c.label} onClick={() => goTo(i)} className={cx('h-1.5 rounded-full transition-all duration-300', i === index ? 'w-6 bg-accent' : 'w-1.5 bg-line hover:bg-muted')} />)}
      </div>
    </section>
  );
}
