import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package, UserRound } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useFormat } from '../contexts/SettingsContext';
import { useDebounce } from '../hooks/useFetch';
import { Ltr, SearchInput, Spinner, cx } from '../components/ui';

/** Top-bar search with live suggestions (products and customers). Arrow keys + Enter, Esc to close, "/" to focus. */
export default function GlobalSearch() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const f = useFormat();
  const { isAdmin } = useAuth();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]); // [{kind:'product'|'customer', ...}]
  const [active, setActive] = useState(-1);
  const box = useRef(null); const input = useRef(null);
  const dq = useDebounce(q.trim(), 250);
  const productPage = isAdmin ? '/products' : '/pos';

  useEffect(() => {
    if (dq.length < 2) { setItems([]); setBusy(false); return undefined; }
    let live = true; setBusy(true);
    Promise.all([api.get('/products', { q: dq, status: 'active', limit: 5 }), api.get('/customers', { q: dq, limit: 3 })])
      .then(([p, c]) => { if (!live) return; setItems([...p.data.map((x) => ({ kind: 'product', ...x })), ...c.data.map((x) => ({ kind: 'customer', ...x }))]); setActive(-1); })
      .catch(() => { if (live) setItems([]); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [dq]);

  useEffect(() => { const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  useEffect(() => {
    const k = (e) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); input.current?.focus(); setOpen(true); } };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, []);

  const go = (item) => {
    setOpen(false);
    if (item.kind === 'customer') nav(`/customers/${item._id}`); else nav(`${productPage}?q=${encodeURIComponent(item.name)}`);
    setQ('');
  };
  const submit = (e) => {
    e.preventDefault();
    if (active >= 0 && items[active]) { go(items[active]); return; }
    if (q.trim()) { nav(`${productPage}?q=${encodeURIComponent(q.trim())}`); setOpen(false); }
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => (items.length ? (a + 1) % items.length : -1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (items.length ? (a <= 0 ? items.length - 1 : a - 1) : -1)); }
  };
  const showPanel = open && q.trim().length >= 2;
  const products = items.filter((i) => i.kind === 'product'); const customers = items.filter((i) => i.kind === 'customer');
  const idx = (it) => items.indexOf(it);

  return (
    <div ref={box} className="relative ms-auto w-full max-w-sm">
      <form role="search" onSubmit={submit}>
        <SearchInput inputRef={input} className="[&_input]:!rounded-full" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          placeholder={t('topbar.search')} aria-label={t('topbar.search')} role="combobox" aria-expanded={showPanel} aria-controls="global-search-results" />
        {!q && <span className="kbd pointer-events-none absolute end-3.5 top-1/2 hidden -translate-y-1/2 sm:block" aria-hidden="true">/</span>}
      </form>
      {showPanel && (
        <div id="global-search-results" role="listbox" className="modal-in absolute end-0 z-40 mt-2 w-[min(92vw,26rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          {busy && items.length === 0 ? <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted"><Spinner className="h-4 w-4" />{t('common.loading')}</div>
            : items.length === 0 ? <p className="px-4 py-5 text-sm text-muted">{t('topbar.noResults', { query: q.trim() })}</p> : (
              <div className="max-h-[70vh] overflow-y-auto p-1.5">
                {products.length > 0 && <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t('nav.products')}</p>}
                {products.map((p) => (
                  <button key={p._id} type="button" role="option" aria-selected={active === idx(p)} onMouseEnter={() => setActive(idx(p))} onClick={() => go(p)}
                    className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start', active === idx(p) ? 'bg-raised' : 'hover:bg-raised')}>
                    <span className="icon-tile h-9 w-9 shrink-0 bg-brand/30 text-forest"><Package className="h-4 w-4" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{p.name}</span><Ltr className="text-xs text-muted">{p.sku}</Ltr></span>
                    <span className="text-end text-xs"><span className="tabular block font-bold">{f.money(p.sellingPrice)}</span><span className={p.stock.sellable <= 0 ? 'text-danger' : 'text-muted'}>{p.stock.sellable <= 0 ? t('status.outOfStock') : t('pos.inStock', { count: f.num(p.stock.sellable) })}</span></span>
                  </button>
                ))}
                {customers.length > 0 && <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t('nav.customers')}</p>}
                {customers.map((c) => (
                  <button key={c._id} type="button" role="option" aria-selected={active === idx(c)} onMouseEnter={() => setActive(idx(c))} onClick={() => go(c)}
                    className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start', active === idx(c) ? 'bg-raised' : 'hover:bg-raised')}>
                    <span className="icon-tile h-9 w-9 shrink-0 bg-info/15 text-info"><UserRound className="h-4 w-4" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{c.name}</span><span className="text-xs text-muted">{c.phone ? <Ltr>{c.phone}</Ltr> : '—'}</span></span>
                    {c.balance > 0 && <span className="tabular text-xs font-bold text-warn">{f.money(c.balance)}</span>}
                  </button>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
