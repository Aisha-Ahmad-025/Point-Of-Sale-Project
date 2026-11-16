import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookUser, CornerDownLeft, LogOut, Mic, MoonStar, Package, PackagePlus, Plus, Search, ShoppingCart, UserPlus } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFormat } from '../contexts/SettingsContext';
import { useDebounce } from '../hooks/useFetch';
import { NAV } from '../layouts/nav';
import { prefetchRoute } from '../utils/routes';
import { cx } from './ui';

/** Every query word must appear in the command's label/keywords. Commands starting with the query come first. */
export function filterCommands(commands, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  return commands
    .map((c) => ({ c, hay: `${c.label} ${c.keywords || ''}`.toLowerCase() }))
    .filter(({ hay }) => words.every((w) => hay.includes(w)))
    .sort((a, b) => Number(b.hay.startsWith(words[0])) - Number(a.hay.startsWith(words[0])))
    .map(({ c }) => c);
}

/** Ctrl/Cmd + K command palette: jump to pages, run actions, find products and customers. */
export default function CommandPalette({ open, onClose, onVoice }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const f = useFormat();
  const { user, isAdmin, logout } = useAuth();
  const { toggle } = useTheme();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState({ products: [], customers: [] });
  const input = useRef(null); const list = useRef(null);
  const dq = useDebounce(q.trim(), 220);

  const commands = useMemo(() => {
    const go = (to) => () => nav(to);
    const actions = [
      { id: 'new-sale', group: 'actions', label: t('palette.newSale'), keywords: 'sell checkout pos', icon: ShoppingCart, run: go('/pos') },
      ...(isAdmin ? [
        { id: 'add-product', group: 'actions', label: t('palette.addProduct'), keywords: 'create new item', icon: Plus, run: go('/products?new=1') },
        { id: 'receive', group: 'actions', label: t('palette.receiveStock'), keywords: 'restock inventory delivery', icon: PackagePlus, run: go('/inventory?receive=1') },
      ] : []),
      { id: 'add-customer', group: 'actions', label: t('palette.addCustomer'), keywords: 'khata credit new', icon: UserPlus, run: go('/customers?new=1') },
      ...(onVoice ? [{ id: 'voice', group: 'actions', label: t('palette.voice'), keywords: 'microphone speak talk assistant listen', icon: Mic, run: onVoice }] : []),
      { id: 'theme', group: 'actions', label: t('palette.theme'), keywords: 'dark light mode appearance', icon: MoonStar, run: toggle },
      { id: 'logout', group: 'actions', label: t('auth.logout'), keywords: 'sign out exit', icon: LogOut, run: logout },
    ];
    const pages = NAV.filter((n) => n.roles.includes(user.role)).map((n) => ({ id: `go-${n.key}`, group: 'pages', label: t('palette.go', { page: t(`nav.${n.key}`) }), keywords: `${n.key} ${n.path}`, icon: n.icon, run: go(n.path), prefetch: n.path }));
    return [...actions, ...pages];
  }, [t, nav, isAdmin, user.role, toggle, logout, onVoice]);

  useEffect(() => { if (open) { setQ(''); setActive(0); setRemote({ products: [], customers: [] }); setTimeout(() => input.current?.focus(), 30); } }, [open]);
  useEffect(() => {
    if (!open || dq.length < 2) { setRemote({ products: [], customers: [] }); return undefined; }
    let live = true;
    Promise.all([api.get('/products', { q: dq, status: 'active', limit: 5 }), api.get('/customers', { q: dq, limit: 4 })])
      .then(([p, c]) => { if (live) setRemote({ products: p.data, customers: c.data }); }).catch(() => {});
    return () => { live = false; };
  }, [dq, open]);

  const items = useMemo(() => {
    const local = filterCommands(commands, q);
    const products = remote.products.map((p) => ({ id: `p-${p._id}`, group: 'products', label: p.name, sub: `${p.sku} · ${f.money(p.sellingPrice)}`, icon: Package, run: () => nav(`${isAdmin ? '/products' : '/pos'}?q=${encodeURIComponent(p.name)}`) }));
    const customers = remote.customers.map((c) => ({ id: `c-${c._id}`, group: 'customers', label: c.name, sub: c.phone || (c.balance > 0 ? f.money(c.balance) : ''), icon: BookUser, run: () => nav(`/customers/${c._id}`) }));
    return [...local, ...products, ...customers];
  }, [commands, q, remote, nav, isAdmin, f]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, items.length]);
  useEffect(() => { const it = items[active]; if (it?.prefetch) prefetchRoute(it.prefetch); }, [active, items]);

  if (!open) return null;
  const run = (it) => { if (!it) return; onClose(); setTimeout(it.run, 0); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (items.length ? (a + 1) % items.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(items[active]); }
  };
  let lastGroup = null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-forest/50 px-4 pt-[11vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={t('palette.title')} className="modal-in w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-[18px] w-[18px] shrink-0 text-muted" aria-hidden="true" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={t('palette.placeholder')} aria-label={t('palette.placeholder')} role="combobox" aria-expanded="true" aria-controls="palette-list" autoComplete="off" spellCheck={false}
            className="h-14 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-muted/70" />
          <span className="kbd">Esc</span>
        </div>
        <div ref={list} id="palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">{t('palette.empty', { query: q })}</p>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <p key={`h-${it.group}`} className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-muted">{t(`palette.group.${it.group}`)}</p> : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header}
                <button type="button" role="option" aria-selected={i === active} data-active={i === active} onMouseMove={() => setActive(i)} onClick={() => run(it)}
                  className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors', i === active ? 'bg-brand/25' : 'hover:bg-raised')}>
                  <span className={cx('icon-tile h-8 w-8 shrink-0', i === active ? 'icon-brand' : 'bg-raised text-accent')}><it.icon className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{it.label}</span>{it.sub && <span className="block truncate text-xs text-muted">{it.sub}</span>}</span>
                  {i === active && <CornerDownLeft className="h-4 w-4 text-muted" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-line bg-raised/50 px-4 py-2 text-[11px] text-muted"><span><span className="kbd">↑</span> <span className="kbd">↓</span> {t('palette.navigate')}</span><span><span className="kbd">↵</span> {t('palette.select')}</span></div>
      </div>
    </div>,
    document.body,
  );
}
