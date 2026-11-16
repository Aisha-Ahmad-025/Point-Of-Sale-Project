import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react';
import Logo from '../components/Logo';
import { cx } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNavBadges } from '../hooks/useNavBadges';
import { GROUPS, NAV } from './nav';
import { prefetchRoute } from '../utils/routes';

const TONE = { danger: 'bg-[#D6452B] text-white', warn: 'bg-[#F2A93B] text-[#2B1B12]', info: 'bg-[#F2A93B]/20 text-[#FBF6EC]' };

/**
 * "Liquid dock" navigation: a floating glass rail that never scrolls (item size adapts to the screen height) with
 *  - a liquid highlight that glides (with a springy overshoot) to the active page,
 *  - a magnetic hover: icons swell toward the pointer like a dock,
 *  - a cursor-following light,
 *  - live badges (stock / expiry alerts, customers owing, today's sales) and hover flyouts with details.
 */
export default function Dock({ expanded, onToggle }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const loc = useLocation();
  const badges = useNavBadges();
  const rail = useRef(null); const nav = useRef(null); const frame = useRef(0);
  const [pill, setPill] = useState({ top: 0, height: 0, show: false });
  const items = NAV.filter((n) => n.roles.includes(user.role));

  // Position the liquid highlight over the active item (also when the layout resizes).
  const place = useCallback(() => {
    const el = nav.current?.querySelector('[aria-current="page"]');
    if (!el) { setPill((p) => (p.show ? { ...p, show: false } : p)); return; }
    setPill({ top: el.offsetTop, height: el.offsetHeight, show: true });
  }, []);
  useLayoutEffect(() => { place(); }, [place, loc.pathname, expanded, user.role]);
  useEffect(() => {
    if (!nav.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(place); ro.observe(nav.current);
    window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); };
  }, [place]);

  // Magnetic icons + cursor light (direct DOM updates so hovering never re-renders React).
  const onMove = (e) => {
    cancelAnimationFrame(frame.current);
    const { clientX, clientY } = e;
    frame.current = requestAnimationFrame(() => {
      const r = rail.current; if (r) { const b = r.getBoundingClientRect(); r.style.setProperty('--mx', `${clientX - b.left}px`); r.style.setProperty('--my', `${clientY - b.top}px`); }
      nav.current?.querySelectorAll('.dock-icon').forEach((icon) => {
        const b = icon.getBoundingClientRect(); const d = Math.abs(clientY - (b.top + b.height / 2));
        const k = Math.max(0, 1 - d / 84); icon.style.setProperty('--s', (1 + 0.22 * k).toFixed(3)); icon.style.setProperty('--x', `${(k * 4).toFixed(1)}px`);
      });
    });
  };
  const onLeave = () => { cancelAnimationFrame(frame.current); nav.current?.querySelectorAll('.dock-icon').forEach((i) => { i.style.setProperty('--s', '1'); i.style.setProperty('--x', '0px'); }); };

  return (
    <aside ref={rail} onMouseMove={onMove} onMouseLeave={onLeave} aria-label={t('nav.main')}
      className="dock fixed inset-y-3 start-3 z-30 hidden flex-col lg:flex" style={{ width: expanded ? 252 : 72, transition: 'width .35s cubic-bezier(.22,1,.36,1)' }}>
      {/* glass body + decorations (clipped separately so flyouts can overflow the rail) */}
      <div className="dock-body pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]" aria-hidden="true">
        <div className="dock-light absolute inset-0" />
        <div className="absolute -top-24 start-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[#F2A93B]/20 blur-3xl" />
        <div className="absolute -bottom-24 -end-16 h-56 w-56 rounded-full bg-[#D6452B]/10 blur-3xl" />
      </div>

      <button onClick={onToggle} className="absolute -end-3.5 top-9 z-10 rounded-full border border-line bg-surface p-1.5 text-ink shadow-card transition hover:bg-raised" aria-label={expanded ? t('dock.unpin') : t('dock.pin')} title={expanded ? t('dock.unpin') : t('dock.pin')}>
        {expanded ? <ChevronsLeft className="h-3.5 w-3.5" /> : <ChevronsRight className="h-3.5 w-3.5" />}
      </button>

      <div className={cx('relative flex h-[68px] shrink-0 items-center px-[18px]', !expanded && 'justify-center px-0')}>
        <Logo size={36} withText={expanded} className="[&_span]:text-white [&_span_span]:!text-[#F2A93B]" />
      </div>

      <nav ref={nav} className="relative flex flex-1 flex-col justify-start px-3 pb-2" style={{ '--dock-item': 'clamp(34px, 5.3vh, 44px)', gap: 'clamp(4px, 1.1vh, 14px)' }}>
        <span aria-hidden="true" className="dock-pill pointer-events-none absolute inset-x-3 top-0 z-0 rounded-2xl"
          style={{ height: pill.height, transform: `translateY(${pill.top}px)`, opacity: pill.show ? 1 : 0 }} />
        {GROUPS.map((g) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="flex flex-col" style={{ gap: 'clamp(1px, .35vh, 4px)' }}>
              {expanded
                ? <p className="px-3 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#F2A93B]/70 [@media(max-height:700px)]:hidden">{t(`navGroup.${g}`)}</p>
                : g !== GROUPS[0] && <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />}
              {list.map(({ path, key, icon: Icon }) => {
                const b = badges[key];
                return (
                  <NavLink key={path} to={path} style={{ height: 'var(--dock-item)' }} onMouseEnter={() => prefetchRoute(path)} onFocus={() => prefetchRoute(path)} onTouchStart={() => prefetchRoute(path)}
                    className={({ isActive }) => cx('group relative z-10 flex items-center rounded-2xl text-sm font-semibold outline-none transition-colors', expanded ? 'gap-3 px-3.5' : 'justify-center', isActive ? 'text-white' : 'text-[#F8EAF0]/75 hover:text-white focus-visible:text-white')}>
                    <span className="dock-icon relative flex h-[22px] w-[22px] shrink-0 items-center justify-center">
                      <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
                      {b && !expanded && <span className={cx('absolute -end-2 -top-2 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[9px] font-extrabold ring-2 ring-[#2B1B12]', TONE[b.tone])}>{b.n > 99 ? '99+' : b.n}</span>}
                    </span>
                    {expanded && <span className="truncate">{t(`nav.${key}`)}</span>}
                    {expanded && b && <span className={cx('ms-auto rounded-full px-2 py-0.5 text-[10px] font-extrabold', TONE[b.tone])}>{b.n > 99 ? '99+' : b.n}</span>}
                    {!expanded && (
                      <span role="tooltip" className="dock-flyout pointer-events-none absolute start-full ms-5 z-50 whitespace-nowrap rounded-xl border border-white/10 bg-[#2B1B12]/95 px-3 py-2 text-xs text-white shadow-pop backdrop-blur">
                      <span className="block text-[13px] font-bold">{t(`nav.${key}`)}</span>{b && <span className="mt-0.5 block text-[11px] text-[#F2A93B]">{b.hint}</span>}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="relative shrink-0 p-3 [@media(max-height:620px)]:hidden">
        <div className={cx('flex items-center rounded-2xl border border-white/10 bg-white/[.06] p-2', expanded ? 'gap-2.5' : 'flex-col gap-2')}>
          <span className="icon-brand relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold" title={`${user.name} · ${t(`roles.${user.role}`)}`}>
            {user.name.slice(0, 1).toUpperCase()}<span className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full bg-[#2fd36b] ring-2 ring-[#2B1B12]" aria-hidden="true" />
          </span>
          {expanded && <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{user.name}</p><p className="truncate text-[11px] text-[#F8EAF0]/65">{t(`roles.${user.role}`)} · {settings.storeName}</p></div>}
          <button onClick={logout} className="rounded-xl p-2 text-[#ffb4b4] transition hover:bg-red-500/20" aria-label={t('auth.logout')} title={t('auth.logout')}><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </aside>
  );
}
