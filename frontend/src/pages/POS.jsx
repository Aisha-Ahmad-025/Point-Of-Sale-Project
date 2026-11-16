import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Barcode, BookUser, Mic, Minus, Plus, Printer, ScanLine, ShoppingBasket, Trash2, UserRound, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useFormat, useSettings } from '../contexts/SettingsContext';
import { useDebounce, useFetch } from '../hooks/useFetch';
import { computeCart } from '../utils/pricing';
import { productName, uuid } from '../utils/misc';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Ltr, Modal, Skeleton, apiMessage, cx, SearchInput } from '../components/ui';
import Receipt from '../components/Receipt';
import BarcodeScanner from '../components/BarcodeScanner';
import CustomerPicker from '../components/CustomerPicker';
import ReceiptWhatsApp from '../components/ReceiptWhatsApp';
import { undoToast } from '../utils/undo';
import { useVoice } from '../contexts/VoiceContext';
import { registerPos } from '../utils/posVoice';
import { rank, speakMoney } from '../utils/voiceCommands';

// Soft monogram colours built only from the brand palette's tints, picked deterministically from the name.
const TILES = ['bg-brand/35 text-forest', 'bg-ok/15 text-ok', 'bg-info/15 text-info', 'bg-warn/15 text-warn', 'bg-accent/15 text-accent'];
const tileFor = (name = '') => TILES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TILES.length];
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default function POS() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const { isAdmin } = useAuth();
  const { settings } = useSettings();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  useEffect(() => { setQ(params.get('q') || ''); }, [params]); // the top-bar search navigates here with ?q=
  const [category, setCategory] = useState('');
  const [cart, setCart] = useState([]); // [{ product, quantity, discountPercent }]
  const [received, setReceived] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null); // { sale, store }
  const [scan, setScan] = useState(false);
  const [customer, setCustomer] = useState(null); // khata customer for this sale (null = walk-in)
  const [pickCustomer, setPickCustomer] = useState(false);
  const requestId = useRef(null); // idempotency key for the current cart, kept across retries
  const search = useRef(null);
  const dq = useDebounce(q, 250);

  const cats = useFetch(() => api.get('/categories'), []);
  const products = useFetch(() => api.get('/products', { q: dq, category, status: 'active', limit: 100, sort: 'name' }), [dq, category]);
  useEffect(() => { search.current?.focus(); }, [done]);

  const maxDiscount = isAdmin ? 100 : settings.cashierMaxDiscountPercent;
  const totals = useMemo(() => computeCart(cart, settings.taxRate), [cart, settings.taxRate]);
  const receivedNum = Number(received || 0);
  const credit = customer ? Math.max(0, Math.round((totals.total - receivedNum) * 100) / 100) : 0; // what goes on the khata
  const overLimit = customer && credit > customer.available + 1e-9;
  const change = credit > 0 ? 0 : receivedNum - totals.total;

  const touchCart = () => { if (!requestId.current) requestId.current = uuid(); };
  const add = useCallback((product, qty = 1) => {
    const sellable = product.stock?.sellable ?? 0;
    setCart((c) => {
      const i = c.findIndex((l) => l.product._id === product._id);
      const have = i >= 0 ? c[i].quantity : 0;
      if (have + qty > sellable) { toast.error(t('pos.notEnough', { name: productName(product), count: sellable })); return c; }
      touchCart();
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantity: Math.round((l.quantity + qty) * 1000) / 1000 } : l));
      return [...c, { product, quantity: qty, discountPercent: 0 }];
    });
  }, [t]);

  const step = (p) => (['kg', 'l'].includes(p.unit) ? 0.5 : 1);
  const setQty = (id, qty) => setCart((c) => c.map((l) => {
    if (l.product._id !== id) return l;
    const max = l.product.stock?.sellable ?? 0;
    const whole = !['kg', 'l', 'g', 'ml'].includes(l.product.unit);
    let n = Number(qty); if (!Number.isFinite(n) || n <= 0) n = step(l.product); if (whole) n = Math.round(n);
    if (n > max) { toast.error(t('pos.notEnough', { name: productName(l.product), count: max })); n = max; }
    return { ...l, quantity: n };
  }));
  const setDiscount = (id, v) => setCart((c) => c.map((l) => (l.product._id === id ? { ...l, discountPercent: Math.min(maxDiscount, Math.max(0, Number(v) || 0)) } : l)));
  const remove = (id) => {
    const idx = cart.findIndex((l) => l.product._id === id); if (idx < 0) return;
    const removed = cart[idx];
    setCart((c) => { const n = c.filter((l) => l.product._id !== id); if (!n.length) requestId.current = null; return n; });
    undoToast(t('undo.itemRemoved', { name: productName(removed.product) }), () => { touchCart(); setCart((c) => (c.some((l) => l.product._id === id) ? c : [...c.slice(0, idx), removed, ...c.slice(idx)])); }, { label: t('undo.button') });
  };
  const clear = () => { setCart([]); setReceived(''); setCustomer(null); requestId.current = null; setError(null); };
  const clearWithUndo = () => {
    const snap = { cart, received, customer };
    clear();
    undoToast(t('undo.cartCleared'), () => { touchCart(); setCart(snap.cart); setReceived(snap.received); setCustomer(snap.customer); }, { label: t('undo.button') });
  };

  const lookupBarcode = useCallback(async (code, quiet = false) => {
    try { const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`); add(data); setQ(''); return true; }
    catch (e) { if (!quiet || e.code !== 'BARCODE_NOT_FOUND') toast.error(apiMessage(t, e)); return false; }
  }, [add, t]);

  // USB scanners type the code quickly and press Enter: an all-digit entry is treated as a barcode.
  const onSearchKey = async (e) => {
    if (e.key !== 'Enter' || !q.trim()) return;
    e.preventDefault();
    const code = q.trim();
    // Looks like a barcode/SKU (has a digit, no spaces)? Try an exact lookup first, otherwise fall back to the text search below.
    if (/^[0-9A-Za-z-]{6,}$/.test(code) && /\d/.test(code) && (await lookupBarcode(code, !/^\d+$/.test(code)))) return;
    if (products.data?.length === 1) { add(products.data[0]); setQ(''); }
  };

  const checkout = async () => {
    setBusy(true); setError(null);
    try {
      const { data } = await api.post('/sales', {
        clientRequestId: requestId.current,
        items: cart.map((l) => ({ productId: l.product._id, quantity: l.quantity, discountPercent: l.discountPercent || undefined })),
        amountReceived: receivedNum,
        ...(customer ? { customerId: customer._id } : {}),
      });
      const r = await api.get(`/sales/${data.sale._id}/receipt`);
      setDone(r.data); setConfirm(false);
      toast.success(data.duplicate ? t('pos.duplicate') : t('pos.saleDone'));
      clear(); products.reload();
    } catch (e) {
      setError(e); setConfirm(false);
      if (['INSUFFICIENT_STOCK', 'STOCK_CHANGED', 'PRODUCT_INACTIVE'].includes(e.code)) products.reload();
      if (['CREDIT_LIMIT_EXCEEDED', 'CUSTOMER_INACTIVE'].includes(e.code) && customer) api.get(`/customers/${customer._id}`).then((r) => setCustomer(r.data)).catch(() => {});
    } finally { setBusy(false); }
  };

  const quick = [Math.ceil(totals.total), Math.ceil(totals.total / 100) * 100, Math.ceil(totals.total / 500) * 500, Math.ceil(totals.total / 1000) * 1000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4);
  const canPay = cart.length > 0 && (receivedNum >= totals.total - 1e-9 || (customer && customer.isActive && !overLimit));

  // Keyboard shortcuts (ignored while a dialog is open): F2 search, F4 checkout, Esc clears the search text.
  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'F2') { e.preventDefault(); search.current?.focus(); search.current?.select?.(); }
      else if (e.key === 'F4') { e.preventDefault(); if (canPay) setConfirm(true); }
      else if (e.key === 'Escape' && q) setQ('');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canPay, q]);
  const itemCount = cart.reduce((a, l) => a + l.quantity, 0);

  // Voice assistant: commands arrive here because the cart lives on this screen. Checkout only opens the confirmation.
  const voice = useVoice();
  const vlive = useRef({}); vlive.current = { cart, customer, canPay, totals, add, remove, clearWithUndo, setCustomer, setReceived, setConfirm, t, f };
  useEffect(() => registerPos((cmd) => {
    const L = vlive.current; const tt = L.t; const ff = L.f;
    switch (cmd.type) {
      case 'add': {
        const have = L.cart.find((l) => l.product._id === cmd.product._id)?.quantity || 0;
        const sellable = cmd.product.stock?.sellable ?? 0;
        if (have + cmd.qty > sellable + 1e-9) return { tone: 'warn', message: tt('pos.notEnough', { name: cmd.product.name, count: sellable }) };
        L.add(cmd.product, cmd.qty); return { message: tt('voice.adding', { qty: ff.num(cmd.qty), name: cmd.product.name }) };
      }
      case 'remove': {
        const best = rank(L.cart, cmd.name, (l) => l.product.name, 0.7)[0];
        if (!best) return { tone: 'warn', message: tt('voice.removeNotFound', { name: cmd.name }) };
        L.remove(best.item.product._id); return { message: tt('voice.removed', { name: best.item.product.name }) };
      }
      case 'clear': if (!L.cart.length) return { tone: 'warn', message: tt('voice.cartAlreadyEmpty') }; L.clearWithUndo(); return { message: tt('voice.cartCleared') };
      case 'customer': L.setCustomer(cmd.customer); return { message: tt('voice.customerSet', { name: cmd.customer.name }) };
      case 'cash': {
        L.setReceived(String(cmd.amount));
        if (!L.cart.length) return { message: tt('voice.cashSet', { amount: ff.money(cmd.amount) }) };
        const diff = Math.round((cmd.amount - L.totals.total) * 100) / 100;
        if (diff >= 0) return { message: tt('voice.cashChange', { amount: ff.money(cmd.amount), change: ff.money(diff) }), say: tt('voice.cashChange', { amount: speakMoney(cmd.amount), change: speakMoney(diff) }) };
        if (L.customer) return { message: tt('voice.cashCredit', { amount: ff.money(cmd.amount), credit: ff.money(-diff) }), say: tt('voice.cashCredit', { amount: speakMoney(cmd.amount), credit: speakMoney(-diff) }) };
        return { tone: 'warn', message: tt('voice.cashShort', { amount: ff.money(cmd.amount), short: ff.money(-diff) }) };
      }
      case 'credit': if (!L.customer) return { tone: 'warn', message: tt('voice.creditNeedsCustomer') }; L.setReceived('0'); return { message: tt('voice.creditSet') };
      case 'checkout':
        if (!L.cart.length) return { tone: 'warn', message: tt('voice.checkoutEmpty') };
        if (!L.canPay) return { tone: 'warn', message: tt('voice.checkoutShort') };
        L.setConfirm(true); return { message: tt('voice.checkoutReady') };
      default: return null;
    }
  }), []);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
      <section aria-label={t('pos.products')} className="min-w-0 space-y-3">
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <SearchInput inputRef={search} className="min-w-[200px] flex-1" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder={t('pos.searchPlaceholder')} aria-label={t('pos.searchPlaceholder')} autoFocus />
          <Button variant="secondary" onClick={() => setScan(true)}><ScanLine className="h-4 w-4" />{t('pos.scan')}</Button>
          <Button variant="secondary" onClick={voice.toggle} aria-pressed={voice.open}><Mic className="h-4 w-4 text-accent" />{t('voice.button')}</Button>
        </Card>
        <p className="hidden flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted sm:flex" aria-label={t('pos.shortcuts')}>
          <span><span className="kbd">F2</span> {t('pos.shortcutSearch')}</span><span><span className="kbd">F4</span> {t('pos.shortcutCheckout')}</span><span><span className="kbd">Esc</span> {t('pos.shortcutClear')}</span>
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t('pos.categories')}>
          {[{ _id: '', name: t('common.all') }, ...(cats.data || [])].map((c) => (
            <button key={c._id} onClick={() => setCategory(c._id)} aria-pressed={category === c._id} className={cx('whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold', category === c._id ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-muted hover:text-ink')}>{c.name}</button>
          ))}
        </div>
        {products.loading && !products.data ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
          : products.error ? <Card><ErrorState error={products.error} onRetry={products.reload} /></Card>
          : products.data?.length === 0 ? <Card><EmptyState art="search" title={t('pos.noProducts')} hint={t('pos.noProductsHint')} /></Card>
          : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {products.data.map((p) => {
                const out = p.stock.sellable <= 0;
                return (
                  <button key={p._id} disabled={out} onClick={() => add(p, step(p))} className="card card-hover group flex flex-col items-start gap-2 p-3.5 text-start disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-card">
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className={cx('icon-tile h-11 w-11 shrink-0 text-sm font-extrabold', tileFor(p.name))}>{initials(productName(p))}</span>
                      <span className="icon-tile h-7 w-7 bg-raised text-accent opacity-0 transition group-hover:opacity-100 group-disabled:hidden"><Plus className="h-4 w-4" aria-hidden="true" /></span>
                    </span>
                    <span className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug">{productName(p)}</span>
                    <Ltr className="text-[11px] text-muted">{p.sku}</Ltr>
                    <span className="mt-auto flex w-full items-center justify-between gap-2">
                      <span className="tabular text-base font-extrabold">{f.money(p.sellingPrice)}</span>
                      {out ? <Badge tone="danger">{t('status.outOfStock')}</Badge> : <Badge tone={p.stock.sellable <= p.reorderThreshold ? 'warn' : 'ok'}>{f.num(p.stock.sellable)}</Badge>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
      </section>

      <aside id="pos-cart" aria-label={t('pos.cart')} className="scroll-mt-20 xl:sticky xl:top-20 xl:self-start">
        <Card className="flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden shadow-lift">
          <div className="flex items-center justify-between border-b border-line bg-raised/50 px-4 py-3.5">
            <h2 className="flex items-center gap-2 font-extrabold"><ShoppingBasket className="h-5 w-5 text-accent" aria-hidden="true" />{t('pos.cart')}{cart.length > 0 && <Badge tone="brand">{cart.length}</Badge>}</h2>
            {cart.length > 0 && <button className="text-xs font-semibold text-danger hover:underline" onClick={clearWithUndo}>{t('pos.clear')}</button>}
          </div>
          <div className="min-h-[120px] flex-1 overflow-y-auto">
            {cart.length === 0 ? <EmptyState art="cart" title={t('pos.cartEmpty')} hint={t('pos.cartEmptyHint')} /> : (
              <ul className="divide-y divide-line">
                {cart.map((l) => (
                  <li key={l.product._id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate text-sm font-bold">{productName(l.product)}</p><p className="text-xs text-muted">{f.money(l.product.sellingPrice)} / {t(`units.${l.product.unit}`)}</p></div>
                      <button onClick={() => remove(l.product._id)} className="btn btn-ghost !p-1.5 text-danger" aria-label={t('actions.remove')}><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button className="btn btn-secondary !p-1.5" onClick={() => setQty(l.product._id, l.quantity - step(l.product))} aria-label={t('pos.decrease')}><Minus className="h-4 w-4" /></button>
                        <input className="input !w-16 !px-1 !py-1 text-center" dir="ltr" inputMode="decimal" value={l.quantity} onChange={(e) => setQty(l.product._id, e.target.value)} aria-label={t('pos.quantity')} />
                        <button className="btn btn-secondary !p-1.5" onClick={() => setQty(l.product._id, l.quantity + step(l.product))} aria-label={t('pos.increase')}><Plus className="h-4 w-4" /></button>
                      </div>
                      {maxDiscount > 0 && (
                        <label className="flex items-center gap-1 text-xs text-muted">{t('pos.discountPct')}
                          <input className="input !w-14 !px-1 !py-1 text-center" dir="ltr" type="number" min="0" max={maxDiscount} step="1" value={l.discountPercent || ''} placeholder="0" onChange={(e) => setDiscount(l.product._id, e.target.value)} />
                        </label>
                      )}
                      <span className="tabular text-sm font-extrabold">{f.money(l.quantity * l.product.sellingPrice * (1 - (l.discountPercent || 0) / 100))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2.5 overflow-y-auto border-t border-line bg-surface p-4">
            <Line label={t('pos.subtotal')} value={f.money(totals.gross)} />
            {totals.discount > 0 && <Line label={t('pos.discount')} value={`-${f.money(totals.discount)}`} />}
            <Line label={t('pos.tax')} value={f.money(totals.tax)} />
            <div className="flex items-center justify-between rounded-xl bg-forest px-4 py-3 text-lg font-extrabold text-white"><span>{t('pos.total')}</span><span className="tabular text-gradient">{f.money(totals.total)}</span></div>
            <p className="text-[11px] text-muted">{t('pos.serverNote')}</p>
            <div className="rounded-2xl border border-line bg-raised/60 p-3">
              {customer ? (
                <div className="flex items-center gap-3">
                  <span className="icon-brand icon-tile h-10 w-10 shrink-0 text-sm font-extrabold">{customer.name.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{customer.name}</p>
                    <p className="text-xs text-muted">{customer.balance > 0 ? t('credit.owes', { value: f.money(customer.balance) }) : t('customers.settled')} · {t('credit.available', { value: f.money(customer.available) })}</p>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPickCustomer(true)}>{t('credit.change')}</button>
                  <button className="btn btn-ghost !p-1.5" onClick={() => setCustomer(null)} aria-label={t('credit.remove')}><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setPickCustomer(true)} className="flex w-full items-center gap-3 text-start">
                  <span className="icon-tile h-10 w-10 shrink-0 bg-surface text-accent ring-1 ring-line"><UserRound className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="flex-1"><span className="block text-sm font-bold">{t('credit.walkIn')}</span><span className="text-xs text-muted">{t('credit.select')} · {t('credit.onCredit')}</span></span>
                  <BookUser className="h-4 w-4 text-muted" aria-hidden="true" />
                </button>
              )}
            </div>
            <Field label={customer ? t('credit.cashNow') : t('pos.received')}>
              <input className="input text-lg font-bold" dir="ltr" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" disabled={!cart.length} />
            </Field>
            {cart.length > 0 && <div className="flex flex-wrap gap-1.5">{quick.map((v) => <button key={v} className="btn btn-secondary btn-sm" onClick={() => setReceived(String(v))}>{f.money(v)}</button>)}{customer && <button className="btn btn-dark btn-sm" onClick={() => setReceived('0')}>{t('credit.payLater')}</button>}</div>}
            {credit > 0 ? (
              <div className={cx('space-y-1 rounded-xl p-3 text-sm', overLimit ? 'bg-danger/10' : 'bg-warn/10')}>
                <div className="flex justify-between font-extrabold"><span>{t('credit.onCredit')}</span><span className="tabular">{f.money(credit)}</span></div>
                <div className="flex justify-between text-xs text-muted"><span>{t('credit.balanceAfter')}</span><span className="tabular">{f.money(customer.balance + credit)}</span></div>
                {overLimit && <p role="alert" className="text-xs font-semibold text-danger">{t('credit.exceeds', { value: f.money(customer.available) })}</p>}
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm"><span className="font-semibold text-muted">{t('pos.change')}</span><span className={cx('tabular font-extrabold', change < 0 ? 'text-danger' : 'text-ok')}>{f.money(Math.max(change, 0))}</span></div>
            )}
            <p className="text-xs text-muted">{t('pos.method')}: <strong>{credit > 0 ? t(receivedNum > 0 ? 'payment.partial' : 'payment.credit') : t('payment.cash')}</strong></p>
            {error && <p role="alert" className="rounded-xl bg-danger/10 p-2.5 text-sm text-danger">{apiMessage(t, error)}</p>}
            <Button className="w-full !py-3 text-base" disabled={!canPay} onClick={() => setConfirm(true)}><Barcode className="h-4 w-4" />{credit > 0 ? t('credit.completeCredit') : t('pos.checkout')}</Button>
          </div>
        </Card>
      </aside>

      <Modal open={confirm} onClose={() => !busy && setConfirm(false)} title={t('pos.confirmTitle')} size="sm" dismissible={!busy}
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>{t('actions.cancel')}</Button><Button loading={busy} onClick={checkout} data-autofocus>{t('pos.completeSale')}</Button></>}>
        <div className="space-y-2 text-sm">
          <Line label={t('pos.items')} value={f.num(cart.reduce((a, l) => a + l.quantity, 0))} />
          <Line label={t('pos.total')} value={f.money(totals.total)} />
          {customer && <Line label={t('receipt.customer')} value={customer.name} />}
          <Line label={customer ? t('receipt.paidNow') : t('pos.received')} value={f.money(receivedNum)} />
          {credit > 0 ? <Line label={t('receipt.onCredit')} value={f.money(credit)} /> : <Line label={t('pos.change')} value={f.money(Math.max(change, 0))} />}
        </div>
      </Modal>

      <Modal open={!!done} onClose={() => setDone(null)} title={t('pos.saleComplete')} size="sm"
        footer={done && <><ReceiptWhatsApp store={done.store} sale={done.sale} /><Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('pos.print')}</Button><Button onClick={() => setDone(null)} data-autofocus>{t('pos.newSale')}</Button></>}>
        {done && <Receipt store={done.store} sale={done.sale} />}
      </Modal>

      <CustomerPicker open={pickCustomer} onClose={() => setPickCustomer(false)} onSelect={(c) => { setCustomer(c); setPickCustomer(false); }} />
      {cart.length > 0 && (
        <div className="no-print fixed inset-x-3 bottom-[92px] z-20 lg:bottom-4 xl:hidden">
          <button type="button" onClick={() => document.getElementById('pos-cart')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex w-full items-center justify-between gap-3 rounded-2xl bg-forest px-4 py-3 text-white shadow-pop transition active:scale-[.98]">
            <span className="flex items-center gap-2 text-sm font-bold"><ShoppingBasket className="h-4 w-4 text-[#F2A93B]" aria-hidden="true" />{f.num(itemCount)} {t('pos.items').toLowerCase()}</span>
            <span className="tabular text-lg font-extrabold text-gradient">{f.money(totals.total)}</span>
            <span className="rounded-full bg-[#F2A93B] px-3 py-1 text-xs font-extrabold text-[#2B1B12]">{t('pos.viewCart')}</span>
          </button>
        </div>
      )}
      <BarcodeScanner open={scan} onClose={() => setScan(false)} onDetect={async (code) => { if (await lookupBarcode(code)) setScan(false); }} />
    </div>
  );
}
const Line = ({ label, value }) => <div className="flex items-center justify-between text-sm"><span className="text-muted">{label}</span><span className="tabular font-semibold">{value}</span></div>;
