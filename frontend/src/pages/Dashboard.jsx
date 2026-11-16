import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, Banknote, BookUser, CalendarClock, Flame, HandCoins, Hourglass, PackagePlus, Plus, Receipt, ShoppingBag, TrendingUp, TriangleAlert } from 'lucide-react';
import { AnimatedNumber, Reveal, Trend } from '../components/motion';
import Highlights from '../components/Highlights';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { useFormat } from '../contexts/SettingsContext';
import { useFetch } from '../hooks/useFetch';
import { productName, toYmdLocal } from '../utils/misc';
import { Badge, Card, EmptyState, ErrorState, Ltr, PageHeader, Skeleton, StatCard } from '../components/ui';

const RANGES = [{ id: '7', days: 7 }, { id: '14', days: 14 }, { id: '30', days: 30 }];

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('dashboard.greetingMorning') : hour < 17 ? t('dashboard.greetingAfternoon') : t('dashboard.greetingEvening');
  const [range, setRange] = useState('7');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const params = range === 'custom' ? custom : { from: toYmdLocal(-(Number(range) - 1)), to: toYmdLocal(0) };
  const ready = range !== 'custom' || (custom.from && custom.to);
  const d = useFetch(() => api.get('/reports/dashboard', params), [range, custom.from, custom.to], { enabled: !!ready });
  const data = d.data;
  const series = (k) => (data ? data.trend.map((x) => x[k]) : []);
  const cards = data ? [
    { key: 'best', icon: Flame, tone: 'brand', label: t('highlights.bestSeller'), value: data.bestSellers[0] ? productName(data.bestSellers[0]) : t('highlights.noneYet'), sub: data.bestSellers[0] ? t('highlights.units', { count: f.num(data.bestSellers[0].units) }) : '', to: '/reports' },
    { key: 'low', icon: TriangleAlert, tone: data.outOfStockCount > 0 ? 'danger' : 'warn', label: t('highlights.lowStock'), value: f.num(data.lowStockCount + data.outOfStockCount), sub: t('highlights.items', { count: f.num(data.lowStockCount + data.outOfStockCount) }), to: '/inventory?status=low' },
    { key: 'exp', icon: CalendarClock, tone: data.expiredCount > 0 ? 'danger' : 'warn', label: t('highlights.expiring'), value: f.num(data.nearExpiryCount + data.expiredCount), sub: t('highlights.batches', { count: f.num(data.nearExpiryCount + data.expiredCount) }), to: '/expiry' },
    { key: 'owing', icon: HandCoins, tone: 'info', label: t('highlights.owing'), value: f.money(data.credit.outstanding), sub: t('highlights.customers', { count: f.num(data.credit.customersOwing) }), to: '/customers' },
    { key: 'collected', icon: BookUser, tone: 'ok', label: t('highlights.collected'), value: f.money(data.credit.collected), sub: t('highlights.payments', { count: f.num(data.credit.collections) }), to: '/customers' },
    { key: 'slow', icon: Hourglass, tone: 'brand', label: t('highlights.slow'), value: data.slowMoving[0] ? productName(data.slowMoving[0]) : t('highlights.noneYet'), sub: data.slowMoving[0] ? t(`movementClass.${data.slowMoving[0].class}`) : '', to: '/reports' },
  ] : [];
  const axis = { stroke: 'rgb(var(--muted))', fontSize: 12 };
  const tip = { contentStyle: { background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12, color: 'rgb(var(--ink))' } };

  return (
    <>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')}
        actions={<div className="flex flex-wrap items-center gap-2">
          <select className="input !w-auto" value={range} onChange={(e) => setRange(e.target.value)} aria-label={t('dashboard.range')}>{RANGES.map((r) => <option key={r.id} value={r.id}>{t('dashboard.lastDays', { count: r.days })}</option>)}<option value="custom">{t('dashboard.custom')}</option></select>
          {range === 'custom' && <><input className="input !w-auto" dir="ltr" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label={t('common.from')} /><input className="input !w-auto" dir="ltr" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label={t('common.to')} /></>}
        </div>} />
      {d.error ? <Card><ErrorState error={d.error} onRetry={d.reload} /></Card> : (
        <div className="space-y-4">
          <section className="hero rounded-3xl p-6 shadow-lift sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="text-sm font-semibold text-[#F8EAF0]/80">{greeting}, {user.name.split(' ')[0]}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#F0A7C0]">{t('dashboard.todayRevenue')}</p>
                <p className="tabular text-4xl font-extrabold tracking-tight sm:text-5xl"><span className="text-gradient">{data ? <AnimatedNumber value={data.today.total} format={f.money} /> : '—'}</span></p>
                <p className="mt-1 text-sm text-[#F8EAF0]/80">{data ? `${t('dashboard.transactions')}: ${f.num(data.today.transactions)} · ${t('dashboard.grossProfit')}: ${f.money(data.today.grossProfit)}` : t('dashboard.heroSub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/pos" className="btn btn-primary"><Plus className="h-4 w-4" />{t('dashboard.newSale')}</Link>
                <Link to="/products" className="btn border border-white/20 bg-white/10 text-white hover:bg-white/20"><Plus className="h-4 w-4" />{t('dashboard.addProduct')}</Link>
                <Link to="/inventory" className="btn border border-white/20 bg-white/10 text-white hover:bg-white/20"><PackagePlus className="h-4 w-4" />{t('dashboard.receiveStock')}</Link>
              </div>
            </div>
          </section>
          {data ? <Highlights cards={cards} /> : <Skeleton className="h-44" />}
          <section aria-label={t('dashboard.today')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {!data ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />) : <>
              <StatCard icon={Banknote} spark={series('revenue')} label={t('dashboard.todayRevenue')} value={<AnimatedNumber value={data.today.total} format={f.money} />} sub={t('dashboard.netExTax', { value: f.money(data.today.netRevenue) })} />
              <StatCard icon={Receipt} tone="info" spark={series('transactions')} label={t('dashboard.transactions')} value={<AnimatedNumber value={data.today.transactions} format={(v) => f.num(Math.round(v))} />} sub={t('dashboard.today')} />
              <StatCard icon={ShoppingBag} tone="ok" label={t('dashboard.unitsSold')} value={<AnimatedNumber value={data.today.units} format={(v) => f.num(Math.round(v))} />} sub={t('dashboard.today')} />
              <StatCard icon={TrendingUp} tone="ok" spark={series('grossProfit')} label={t('dashboard.grossProfit')} value={<AnimatedNumber value={data.today.grossProfit} format={f.money} />} sub={`${t('reports.margin')}: ${f.pct(data.today.marginPct)}`} />
            </>}
          </section>
          <Reveal delay={0}>
          <section aria-label={t('nav.customers')} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {!data ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />) : <>
              <StatCard to="/customers" icon={HandCoins} tone="warn" label={t('dashboard.outstandingCredit')} value={<AnimatedNumber value={data.credit.outstanding} format={f.money} />} sub={t('dashboard.customersOwing', { count: data.credit.customersOwing })} />
              <StatCard to="/customers" icon={BookUser} tone="ok" label={t('dashboard.collected')} value={<AnimatedNumber value={data.credit.collected} format={f.money} />} sub={t('dashboard.collections', { count: data.credit.collections })} />
              <Card className="flex items-center justify-between gap-3 p-4"><div><p className="text-[11px] font-bold uppercase tracking-wider text-muted">{t('nav.customers')}</p><p className="text-sm text-muted">{t('customers.subtitle')}</p></div><Link to="/customers" className="btn btn-dark btn-sm">{t('dashboard.viewKhata')}<ArrowRight className="h-3.5 w-3.5" /></Link></Card>
            </>}
          </section>
          </Reveal>
          <Reveal delay={40}>
          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card className="p-4">
              <div className="mb-2 flex items-start justify-between gap-2"><div><h2 className="font-bold">{t('dashboard.trend')}</h2>{data && <p className="text-xs text-muted">{f.dateOnly(data.range.from)} – {f.dateOnly(data.range.to)} · {t('dashboard.rangeTotals', { revenue: f.money(data.rangeTotals.total), profit: f.money(data.rangeTotals.grossProfit) })}</p>}
                {data?.change && <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted"><Trend value={data.change.revenuePct} /> {t('dashboard.revenue')} <Trend value={data.change.profitPct} /> {t('dashboard.grossProfit')} <Trend value={data.change.transactionsPct} /> {t('dashboard.transactions')} <span>{t('dashboard.vsPrevious')}</span></p>}</div></div>
              {!data ? <Skeleton className="h-64" /> : data.trend.length === 0 ? <EmptyState art="chart" title={t('dashboard.noSales')} hint={t('dashboard.noSalesHint')} /> : (
                <div className="h-64 w-full" dir="ltr"><ResponsiveContainer><AreaChart data={data.trend} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F2A93B" stopOpacity={0.55} /><stop offset="100%" stopColor="#F2A93B" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => f.dateOnly(v).replace(/,?\s?\d{4}/, '')} {...axis} />
                  <YAxis tickFormatter={(v) => f.num(v, 0)} {...axis} width={56} />
                  <RTooltip {...tip} formatter={(v, n) => [f.money(v), n]} labelFormatter={(v) => f.dateOnly(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" name={t('dashboard.revenue')} stroke="rgb(var(--accent))" strokeWidth={2.5} fill="url(#rev)" />
                  <Area type="monotone" dataKey="grossProfit" name={t('dashboard.grossProfit')} stroke="#D6452B" strokeWidth={2} strokeDasharray="5 4" fill="none" />
                </AreaChart></ResponsiveContainer></div>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="mb-2 font-bold">{t('dashboard.payments')}</h2>
              {!data ? <Skeleton className="h-40" /> : data.payments.length === 0 ? <EmptyState art="chart" title={t('dashboard.noSales')} /> : (
                <ul className="space-y-3">{data.payments.map((p) => <li key={p.method} className="flex items-center justify-between rounded-xl bg-raised p-3"><span className="font-semibold">{p.method === 'cash' ? t('payment.cash') : t('dashboard.creditExtended')}</span><span className="text-end"><span className="tabular block font-extrabold">{f.money(p.total)}</span><span className="text-xs text-muted">{t('dashboard.txCount', { count: p.count })}</span></span></li>)}</ul>
              )}
              {data && <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs"><div className="rounded-xl bg-raised p-2"><p className="text-muted">{t('dashboard.avgBasket')}</p><p className="tabular font-bold">{f.money(data.rangeTotals.transactions ? data.rangeTotals.total / data.rangeTotals.transactions : 0)}</p></div><div className="rounded-xl bg-raised p-2"><p className="text-muted">{t('reports.margin')}</p><p className="tabular font-bold">{f.pct(data.rangeTotals.marginPct)}</p></div></div>}
            </Card>
          </section>
          </Reveal>
          <Reveal delay={80}>
          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4">
              <h2 className="mb-2 font-bold">{t('dashboard.bestSellers')}</h2>
              {!data ? <Skeleton className="h-52" /> : data.bestSellers.length === 0 ? <EmptyState art="chart" title={t('dashboard.noSales')} /> : (
                <div className="h-56" dir="ltr"><ResponsiveContainer><BarChart data={data.bestSellers.map((b) => ({ ...b, label: productName(b) }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" {...axis} /><YAxis type="category" dataKey="label" width={110} {...axis} tickFormatter={(v) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
                  <RTooltip {...tip} formatter={(v) => [f.num(v), t('dashboard.unitsSold')]} /><Bar dataKey="units" fill="#F2A93B" radius={[0, 6, 6, 0]} />
                </BarChart></ResponsiveContainer></div>
              )}
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">{t('dashboard.slowMoving')}</h2><Link to="/reports" className="text-xs font-semibold text-accent hover:underline">{t('actions.viewAll')}</Link></div>
              {!data ? <Skeleton className="h-52" /> : data.slowMoving.length === 0 ? <EmptyState title={t('dashboard.noSlow')} /> : (
                <ul className="space-y-2">{data.slowMoving.map((s) => <li key={s.productId} className="rounded-xl bg-raised p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{productName(s)}</span><Badge tone={s.class === 'dead' ? 'danger' : 'warn'}>{t(`movementClass.${s.class}`)}</Badge></div><p className="mt-1 text-xs text-muted">{t(`movementReason.${s.reasonKey}`, { days: s.windowDays, idle: s.daysSinceLastSale ?? '—', velocity: s.velocity })}</p></li>)}</ul>
              )}
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">{t('dashboard.lowStock')}</h2><Link to="/inventory?status=low" className="text-xs font-semibold text-accent hover:underline">{t('actions.viewAll')}</Link></div>
              {!data ? <Skeleton className="h-52" /> : data.lowStock.length === 0 ? <EmptyState title={t('dashboard.noLow')} /> : (
                <ul className="space-y-2">{data.lowStock.map((p) => <li key={p._id} className="flex items-center justify-between gap-2 rounded-xl bg-raised p-3 text-sm"><span className="truncate font-semibold">{productName(p)}</span><span className="tabular whitespace-nowrap text-xs"><strong className={p.sellable <= 0 ? 'text-danger' : 'text-warn'}>{f.num(p.sellable)}</strong> / {f.num(p.threshold)}</span></li>)}</ul>
              )}
            </Card>
          </section>
          </Reveal>
          <Reveal delay={120}>
          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><CalendarClock className="h-4 w-4 text-warn" />{t('dashboard.nearExpiry')}</h2><Link to="/expiry" className="text-xs font-semibold text-accent hover:underline">{t('actions.viewAll')}</Link></div>
              {!data ? <Skeleton className="h-40" /> : data.nearExpiry.length === 0 ? <EmptyState title={t('dashboard.noExpiry')} /> : (
                <ul className="space-y-2">{data.nearExpiry.map((b) => <li key={b._id} className="flex items-center justify-between gap-2 rounded-xl bg-raised p-3 text-sm"><span className="min-w-0"><span className="block truncate font-semibold">{productName(b.product)}</span><Ltr className="text-xs text-muted">{b.lotNumber}</Ltr></span><span className="text-end text-xs"><strong className="text-warn">{t('expiry.inDays', { count: b.daysToExpiry })}</strong><br />{f.num(b.remainingQuantity)} {t('inventory.units').toLowerCase()}</span></li>)}</ul>
              )}
            </Card>
            <Card className="p-0">
              <h2 className="border-b border-line px-4 py-3 font-bold">{t('dashboard.recent')}</h2>
              {!data ? <Skeleton className="m-4 h-40" /> : data.recent.length === 0 ? <EmptyState art="chart" title={t('dashboard.noSales')} /> : (
                <ul className="divide-y divide-line">{data.recent.map((s) => <li key={s._id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm"><span><Ltr className="font-semibold">{s.receiptNumber}</Ltr><span className="block text-xs text-muted">{f.dateTime(s.createdAt)} · {s.cashierName}</span></span><span className="tabular font-bold">{f.money(s.total)}</span></li>)}</ul>
              )}
            </Card>
          </section>
          </Reveal>
          {data && (data.outOfStockCount > 0 || data.expiredCount > 0) && <p role="status" className="flex items-center gap-2 rounded-xl bg-warn/10 p-3 text-sm text-warn"><TriangleAlert className="h-4 w-4" />{t('dashboard.attention', { out: data.outOfStockCount, expired: data.expiredCount })}</p>}
        </div>
      )}
    </>
  );
}
