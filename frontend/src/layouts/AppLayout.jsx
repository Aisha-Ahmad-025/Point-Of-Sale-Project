import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Bell, CalendarClock, Command, LogOut, Mic, Menu as MenuIcon, Moon, Sun, X } from 'lucide-react';
import Logo from '../components/Logo';
import { cx } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { LiveStatsProvider, useLiveStats } from '../contexts/LiveStatsContext';
import { useNavBadges } from '../hooks/useNavBadges';
import Dock from './Dock';
import { GROUPS, NAV } from './nav';
import GlobalSearch from './GlobalSearch';
import MobileTabBar from './MobileTabBar';
import CommandPalette from '../components/CommandPalette';
import VoiceAssistant from '../components/VoiceAssistant';
import { VoiceProvider, useVoice } from '../contexts/VoiceContext';
import { prefetchLikelyRoutes, prefetchRoute } from '../utils/routes';

function useOutside(ref, fn) {
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) fn(); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [ref, fn]);
}

const sidebarBg = { background: 'linear-gradient(185deg, #2B1B12 0%, #1A120F 45%, #0E0A09 100%)' };
const activeBg = { background: 'linear-gradient(180deg, #F7C66D, #F2A93B 58%, #D8871F)' };

function SidebarBody({ collapsed, onNavigate, mobile = false, open = false, onClose }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { settings } = useSettings();
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const badges = useNavBadges();
  let order = 0; // running index for the staggered entrance of the mobile menu
  return (
    <div className="relative flex h-full flex-col overflow-hidden text-[#F8EAF0]" style={sidebarBg}>
      <div className="pointer-events-none absolute -top-24 start-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[#F2A93B]/25 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-20 -end-16 h-52 w-52 rounded-full bg-[#D6452B]/10 blur-3xl" aria-hidden="true" />

      <div className={cx('relative flex h-16 shrink-0 items-center border-b border-white/10 px-4', collapsed && 'justify-center', mobile && 'justify-between')}>
        <Logo size={36} withText={!collapsed} className="[&_span]:text-white [&_span_span]:!text-[#F2A93B]" />
        {mobile && <button onClick={onClose} className="rounded-xl border border-white/15 bg-white/10 p-2 text-white transition hover:bg-white/20" aria-label={t('actions.close')} data-autofocus><X className="h-[18px] w-[18px]" /></button>}
      </div>

      {mobile && (
        <div className="relative mx-3 mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.07] p-3" style={open ? { animation: 'drawer-item .5s .08s both' } : undefined}>
          <span className="icon-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-extrabold">{user.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{user.name}</p><p className="truncate text-xs text-[#F8EAF0]/60">{settings.storeName}</p></div>
          <span className="ms-auto rounded-full bg-[#F2A93B]/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#FCE7B8]">{t(`roles.${user.role}`)}</span>
        </div>
      )}

      <nav aria-label={t('nav.main')} className="no-scrollbar relative flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {GROUPS.map((g) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              {!collapsed && <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#F2A93B]/70">{t(`navGroup.${g}`)}</p>}
              {collapsed && g !== 'overview' && <div className="mx-3 mb-2 border-t border-white/10" />}
              <div className="space-y-1">
                {list.map(({ path, key, icon: Icon }) => {
                  const delay = 140 + (order += 1) * 45;
                  return (
                    <NavLink key={path} to={path} onClick={onNavigate} onTouchStart={() => prefetchRoute(path)} title={collapsed ? t(`nav.${key}`) : undefined}
                      className={({ isActive }) => cx('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all', collapsed && 'justify-center px-0', isActive ? 'text-white shadow-glow' : 'text-[#F8EAF0]/75 hover:bg-white/10 hover:text-white')}
                      style={({ isActive }) => ({ ...(isActive ? activeBg : {}), ...(mobile && open ? { animation: `drawer-item .45s ${delay}ms both` } : {}) })}>
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="truncate">{t(`nav.${key}`)}</span>}
                      {collapsed && <span className="sr-only">{t(`nav.${key}`)}</span>}
                      {badges[key] && <span className={cx('ms-auto rounded-full px-2 py-0.5 text-[10px] font-extrabold', { danger: 'bg-[#D6452B] text-white', warn: 'bg-[#F2A93B] text-[#2B1B12]', info: 'bg-[#F2A93B]/20 text-[#FBF6EC]' }[badges[key].tone])}>{badges[key].n > 99 ? '99+' : badges[key].n}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {mobile ? (
        <div className="relative grid grid-cols-2 gap-2 border-t border-white/10 p-3" style={open ? { animation: 'drawer-item .5s .55s both' } : undefined}>
          <button onClick={toggle} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{theme === 'dark' ? t('topbar.light') : t('topbar.dark')}
          </button>
          <button onClick={() => { onClose?.(); logout(); }} className="flex items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-[#ffb4b4] transition hover:bg-red-500/25"><LogOut className="h-4 w-4" />{t('auth.logout')}</button>
        </div>
      ) : !collapsed && (
        <div className="relative m-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="truncate text-xs font-bold text-white">{settings.storeName}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#F8EAF0]/60"><span className="h-1.5 w-1.5 rounded-full bg-[#F2A93B] shadow-[0_0_8px_#F2A93B]" />{t(`roles.${user.role}`)} · {user.name}</p>
        </div>
      )}
    </div>
  );
}

/** Mobile menu: slides in from the left over a blurred backdrop, items cascade in, swipe left / tap outside / Esc to close. */
function MobileDrawer({ open, onClose }) {
  const { t } = useTranslation();
  const panel = useRef(null);
  const touch = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => panel.current?.querySelector('[data-autofocus]')?.focus(), 120);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', key); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open, onClose]);
  const EASE = 'cubic-bezier(.22, 1, .36, 1)';
  return (
    <div className={cx('fixed inset-0 z-40 lg:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!open}>
      <div onClick={onClose} className={cx('absolute inset-0 bg-forest/70 backdrop-blur-sm transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')} />
      <aside ref={panel} role="dialog" aria-modal="true" aria-label={t('nav.main')}
        className="absolute inset-y-0 start-0 w-[84vw] max-w-[330px] overflow-hidden rounded-e-[28px] shadow-pop"
        style={{ transform: open ? 'translateX(0)' : 'translateX(-104%)', visibility: open ? 'visible' : 'hidden', transition: `transform .42s ${EASE}, visibility 0s linear ${open ? '0s' : '.42s'}` }}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchMove={(e) => { if (touch.current !== null && e.touches[0].clientX - touch.current < -70) { touch.current = null; onClose(); } }}
        onTouchEnd={() => { touch.current = null; }}>
        <SidebarBody mobile open={open} collapsed={false} onNavigate={onClose} onClose={onClose} />
      </aside>
    </div>
  );
}

function Sidebar({ collapsed, onToggle, mobileOpen, onClose }) {
  return (
    <>
      <Dock expanded={!collapsed} onToggle={onToggle} />
      <MobileDrawer open={mobileOpen} onClose={onClose} />
    </>
  );
}

function Notifications() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutside(ref, () => setOpen(false));
  const { stats, refresh } = useLiveStats();
  const nav = useNavigate();
  const items = stats ? [
    { n: stats.outOfStock, label: t('notify.out'), icon: AlertTriangle, to: '/inventory?status=out' },
    { n: stats.lowStock, label: t('notify.low'), icon: AlertTriangle, to: '/inventory?status=low' },
    { n: stats.nearExpiry, label: t('notify.near'), icon: CalendarClock, to: '/expiry' },
    { n: stats.expired, label: t('notify.expired'), icon: CalendarClock, to: '/expiry' },
  ].filter((i) => i.n > 0) : [];
  const total = items.reduce((a, i) => a + i.n, 0);
  return (
    <div ref={ref} className="relative">
      <button className="btn btn-secondary relative !p-2.5" onClick={() => { setOpen((o) => !o); refresh(); }} aria-label={t('notify.title')} aria-expanded={open}>
        <Bell className="h-[18px] w-[18px]" />
        {total > 0 && <span className="absolute -end-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-bg">{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (
        <div className="modal-in absolute end-0 z-40 mt-2 w-80 rounded-2xl border border-line bg-surface p-2 shadow-pop">
          <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t('notify.title')}</p>
          {items.length === 0 && <p className="px-3 py-4 text-sm text-muted">{t('notify.none')}</p>}
          {items.map((i) => (
            <button key={i.label} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm hover:bg-raised" onClick={() => { setOpen(false); nav(i.to); }}>
              <span className="icon-tile h-8 w-8 bg-warn/15 text-warn"><i.icon className="h-4 w-4" aria-hidden="true" /></span><span className="flex-1">{i.label}</span><span className="font-extrabold">{i.n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenu, onPalette }) {
  const { t } = useTranslation();
  const { user, logout, isAdmin } = useAuth();
  const { theme, toggle } = useTheme();
  const voice = useVoice();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  useOutside(ref, () => setMenu(false));
  const current = NAV.find((n) => loc.pathname.startsWith(n.path));
  return (
    <header className="glass sticky top-0 z-20 flex h-16 items-center gap-2.5 border-b border-line/80 px-3 sm:px-6 no-print">
      <button className="btn btn-ghost !p-2 lg:hidden" onClick={onMenu} aria-label={t('nav.open')}><MenuIcon className="h-5 w-5" /></button>
      <h2 className="hidden truncate text-lg font-extrabold sm:block">{current ? t(`nav.${current.key}`) : ''}</h2>
      <GlobalSearch />
      <button className="btn btn-secondary !rounded-full !p-2.5" onClick={voice.toggle} aria-label={t('voice.open')} title={t('voice.open')} aria-pressed={voice.open}><Mic className="h-[18px] w-[18px] text-accent" /></button>
      <button className="btn btn-secondary hidden !gap-1.5 !rounded-full !px-3 !py-2 text-xs sm:inline-flex" onClick={onPalette} aria-label={t('palette.title')} title={t('palette.title')}><Command className="h-3.5 w-3.5" aria-hidden="true" /><span className="font-bold">K</span></button>
      <button className="btn btn-secondary hidden !p-2.5 sm:inline-flex" onClick={toggle} aria-label={t('topbar.theme')} title={t('topbar.theme')}>{theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}</button>
      {isAdmin && <Notifications />}
      <div ref={ref} className="relative">
        <button className="flex items-center gap-2 rounded-full p-0.5 ring-2 ring-brand/60 transition hover:ring-brand" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label={t('topbar.profile')}>
          <span className="icon-brand flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold">{user.name.slice(0, 1).toUpperCase()}</span>
        </button>
        {menu && (
          <div className="modal-in absolute end-0 z-40 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 shadow-pop">
            <div className="px-3 py-2.5"><p className="truncate font-bold">{user.name}</p><p className="ltr-id truncate text-xs text-muted">{user.email}</p><p className="mt-1.5 inline-block rounded-full bg-brand/30 px-2 py-0.5 text-[11px] font-bold text-forest">{t(`roles.${user.role}`)}</p></div>
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-raised" onClick={logout}><LogOut className="h-4 w-4" />{t('auth.logout')}</button>
          </div>
        )}
      </div>
    </header>
  );
}

/** The palette lives inside VoiceProvider so its "Voice assistant" action can open the panel. */
function PaletteHost({ open, onClose }) {
  const voice = useVoice();
  return <CommandPalette open={open} onClose={onClose} onVoice={voice.openPanel} />;
}

function ScrollProgress() {
  const bar = useRef(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const h = document.documentElement; const max = h.scrollHeight - h.clientHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.min(1, h.scrollTop / max) : 0})`;
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll); update();
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, []);
  return   <div className="no-print pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]" aria-hidden="true"><div ref={bar} className="h-full origin-left scale-x-0 bg-gradient-to-r from-[#F2A93B] via-[#D6452B] to-[#F7C66D] shadow-[0_0_10px_#F2A93B]" /></div>;}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('ss_sidebar') === '1'; } catch { return false; } });
  const [mobile, setMobile] = useState(false);
  const [palette, setPalette] = useState(false);
  const loc = useLocation();
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('ss_sidebar', c ? '0' : '1'); } catch { /* ignore */ } return !c; });
  useEffect(() => { prefetchLikelyRoutes(); }, []);
  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); } };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, []);
  return (
    <LiveStatsProvider>
    <VoiceProvider>
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-forest">Skip to content</a>
      <ScrollProgress />
      <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobile} onClose={() => setMobile(false)} />
      <div className={cx('transition-[padding] duration-200', collapsed ? 'lg:ps-[96px]' : 'lg:ps-[276px]')}>
        <Topbar onMenu={() => setMobile(true)} onPalette={() => setPalette(true)} />
        <main id="main" className="mx-auto max-w-[1500px] p-3 pb-28 sm:p-6 sm:pb-28 lg:pb-6"><div key={loc.pathname} className="page-enter"><Outlet /></div></main>
      </div>
      <MobileTabBar onMenu={() => setMobile(true)} />
      <PaletteHost open={palette} onClose={() => setPalette(false)} />
      <VoiceAssistant />
    </div>
    </VoiceProvider>
    </LiveStatsProvider>
  );
}
