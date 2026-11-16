import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { Download, Info } from 'lucide-react';
import { api } from '../services/api';
import { useFormat } from '../contexts/SettingsContext';
import { useFetch } from '../hooks/useFetch';
import { downloadCsv, productName, toYmdLocal } from '../utils/misc';
import { Badge, Button, Card, EmptyState, ErrorState, Ltr, PageHeader, StatCard, Table, TableSkeleton, Tabs, THead } from '../components/ui';

const axis = { stroke: 'rgb(var(--muted))', fontSize: 12 };
const tip = { contentStyle: { background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12, color: 'rgb(var(--ink))' } };
const CLASS_TONE = { new: 'info', no_stock: 'neutral', dead: 'danger', slow: 'warn', normal: 'ok' };
const RISK_TONE = { out: 'danger', high: 'danger', medium: 'warn', low: 'ok' };

export default function Reports() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('sales');
  const [range, setRange] = useState({ from: toYmdLocal(-29), to: toYmdLocal(0) });
  const showRange = ['sales', 'profit', 'products'].includes(tab);
  return (
    <>
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')}
        actions={showRange && <div className="flex flex-wrap items-center gap-2">
          <input className="input !w-auto" dir="ltr" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label={t('common.from')} />
          <input className="input !w-auto" dir="ltr" type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label={t('common.to')} />
        </div>} />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'sales', label: t('reports.tabSales') }, { id: 'profit', label: t('reports.tabProfit') }, { id: 'products', label: t('reports.tabProducts') }, { id: 'stock', label: t('reports.tabStock') }, { id: 'forecast', label: t('reports.tabForecast') }]} /></div>
      {tab === 'sales' && <SalesTab range={range} />}
      {tab === 'profit' && <ProfitTab range={range} />}
      {tab === 'products' && <ProductsTab range={range} />}
      {tab === 'stock' && <StockTab />}
      {tab === 'forecast' && <ForecastTab />}
    </>
  );
}

const Change = ({ v }) => { const f = useFormat(); if (v === null || v === undefined) return <span className="text-muted">—</span>; return <span className={v >= 0 ? 'text-ok' : 'text-danger'}>{v >= 0 ? '▲' : '▼'} {f.pct(Math.abs(v))}</span>; };

function SalesTab({ range }) {
  const { t } = useTranslation(); const f = useFormat();
  const [groupBy, setGroupBy] = useState('day');
  const r = useFetch(() => api.get('/reports/sales', { ...range, groupBy }), [range.from, range.to, groupBy]);
  const d = r.data;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><select className="input !w-auto" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} aria-label={t('reports.groupBy')}><option value="day">{t('reports.byDay')}</option><option value="week">{t('reports.byWeek')}</option><option value="month">{t('reports.byMonth')}</option></select></div>
      {r.error ? <Card><ErrorState error={r.error} onRetry={r.reload} /></Card> : !d ? <Card><TableSkeleton /></Card> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t('reports.netRevenue')} value={f.money(d.totals.netRevenue)} sub={<>{t('reports.vsPrevious')} <Change v={d.change.revenuePct} /></>} />
            <StatCard label={t('reports.grossProfit')} value={f.money(d.totals.grossProfit)} sub={<>{t('reports.vsPrevious')} <Change v={d.change.profitPct} /></>} />
            <StatCard label={t('dashboard.transactions')} value={f.num(d.totals.transactions)} sub={<>{t('reports.vsPrevious')} <Change v={d.change.transactionsPct} /></>} />
            <StatCard label={t('reports.margin')} value={f.pct(d.totals.marginPct)} />
          </div>
          {d.rows.length === 0 ? <Card><EmptyState art="chart" title={t('reports.noData')} /></Card> : (
            <>
              <Card className="p-4"><div className="h-72" dir="ltr"><ResponsiveContainer><BarChart data={d.rows}><CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" {...axis} /><YAxis tickFormatter={(v) => f.num(v, 0)} width={60} {...axis} /><RTooltip {...tip} formatter={(v, n) => [f.money(v), n]} /><Legend />
                <Bar dataKey="netRevenue" name={t('reports.netRevenue')} fill="#F2A93B" radius={[6, 6, 0, 0]} /><Bar dataKey="grossProfit" name={t('reports.grossProfit')} fill="#D6452B" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
              <Card>
                <div className="flex justify-end p-3"><Button variant="secondary" size="sm" onClick={() => downloadCsv('sales-report.csv', [[t('reports.period'), t('dashboard.transactions'), t('pos.subtotal'), t('pos.discount'), t('pos.tax'), t('pos.total'), t('reports.netRevenue'), 'COGS', t('reports.grossProfit')], ...d.rows.map((x) => [x.period, x.transactions, x.subtotal, x.discount, x.tax, x.total, x.netRevenue, x.cogs, x.grossProfit])])}><Download className="h-3.5 w-3.5" />{t('actions.exportCsv')}</Button></div>
                <Table><THead cols={[t('reports.period'), t('dashboard.transactions'), t('pos.discount'), t('pos.tax'), t('pos.total'), t('reports.netRevenue'), 'COGS', t('reports.grossProfit')]} /><tbody>
                  {d.rows.map((x) => <tr key={x.period} className="border-b border-line last:border-0"><td className="td"><Ltr>{x.period}</Ltr></td><td className="td tabular">{f.num(x.transactions)}</td><td className="td tabular">{f.money(x.discount)}</td><td className="td tabular">{f.money(x.tax)}</td><td className="td tabular">{f.money(x.total)}</td><td className="td tabular">{f.money(x.netRevenue)}</td><td className="td tabular text-muted">{f.money(x.cogs)}</td><td className="td tabular font-bold">{f.money(x.grossProfit)}</td></tr>)}
                </tbody></Table>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ProfitTab({ range }) {
  const { t, i18n } = useTranslation(); const f = useFormat();
  const r = useFetch(() => api.get('/reports/profit', range), [range.from, range.to]);
  const d = r.data;
  if (r.error) return <Card><ErrorState error={r.error} onRetry={r.reload} /></Card>;
  if (!d) return <Card><TableSkeleton /></Card>;
  const tt = d.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('reports.netRevenue')} value={f.money(tt.netRevenue)} sub={t('reports.exTax')} />
        <StatCard tone="info" label={t('reports.cogs')} value={f.money(tt.cogs)} sub={t('reports.cogsHint')} />
        <StatCard tone="ok" label={t('reports.grossProfit')} value={f.money(tt.grossProfit)} sub={`${t('reports.margin')}: ${f.pct(tt.marginPct)}`} />
        <StatCard tone="danger" label={t('reports.wastageCost')} value={f.money(d.wastage.cost)} sub={t('reports.wastageSeparate')} />
      </div>
      <Card className="p-4 text-sm">
        <h2 className="mb-2 flex items-center gap-2 font-bold"><Info className="h-4 w-4 text-info" />{t('reports.howCalculated')}</h2>
        <ul className="list-disc space-y-1 ps-5 text-muted">
          <li>{t('reports.defGross')}</li><li>{t('reports.defMargin')}</li><li>{t('reports.defDiscounts')}</li><li>{t('reports.defTax')}</li><li>{t('reports.defVoids')}</li><li>{t('reports.defWastage')}</li>
        </ul>
        <p className="mt-3 rounded-xl bg-raised p-3 font-semibold">{t('reports.afterWastage')}: <span className={d.grossProfitAfterWastage < 0 ? 'text-danger' : 'text-ok'}>{f.money(d.grossProfitAfterWastage)}</span></p>
      </Card>
      <Card>
        {d.products.length === 0 ? <EmptyState art="chart" title={t('reports.noData')} /> : (
          <Table><THead cols={[t('inventory.product'), t('inventory.quantity'), t('reports.netRevenue'), 'COGS', t('reports.grossProfit'), t('reports.margin')]} /><tbody>
            {d.products.map((p) => <tr key={p.productId} className="border-b border-line last:border-0"><td className="td font-semibold">{productName(p)} <Ltr className="text-xs text-muted">{p.sku}</Ltr></td><td className="td tabular">{f.num(p.units)}</td><td className="td tabular">{f.money(p.revenue)}</td><td className="td tabular text-muted">{f.money(p.cogs)}</td><td className="td tabular font-bold">{f.money(p.grossProfit)}</td><td className="td tabular">{f.pct(p.marginPct)}</td></tr>)}
          </tbody></Table>
        )}
      </Card>
    </div>
  );
}

function ProductsTab({ range }) {
  const { t, i18n } = useTranslation(); const f = useFormat();
  const [cls, setCls] = useState('');
  const r = useFetch(() => api.get('/reports/products', { ...range, class: cls }), [range.from, range.to, cls]);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
        <p className="text-sm text-muted">{t('reports.classHint')}</p>
        <select className="input !w-auto" value={cls} onChange={(e) => setCls(e.target.value)} aria-label={t('reports.classification')}><option value="">{t('common.all')}</option>{['slow', 'dead', 'new', 'no_stock', 'normal'].map((c) => <option key={c} value={c}>{t(`movementClass.${c}`)}</option>)}</select>
      </div>
      {r.loading && !r.data ? <TableSkeleton cols={7} /> : r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : r.data.rows.length === 0 ? <EmptyState art="chart" title={t('reports.noData')} /> : (
        <Table><THead cols={[t('inventory.product'), t('dashboard.unitsSold'), t('reports.netRevenue'), t('reports.margin'), t('inventory.sellable'), t('reports.classification'), t('reports.why')]} /><tbody>
          {r.data.rows.map((p) => <tr key={p.productId} className="border-b border-line last:border-0"><td className="td font-semibold">{productName(p)} <Ltr className="text-xs text-muted">{p.sku}</Ltr></td><td className="td tabular">{f.num(p.units)}</td><td className="td tabular">{f.money(p.revenue)}</td><td className="td tabular">{f.pct(p.marginPct)}</td><td className="td tabular">{f.num(p.available)}</td><td className="td"><Badge tone={CLASS_TONE[p.class]}>{t(`movementClass.${p.class}`)}</Badge></td><td className="td max-w-xs text-xs text-muted">{t(`movementReason.${p.reasonKey}`, { days: p.windowDays, idle: p.daysSinceLastSale ?? '—', velocity: p.velocity })}</td></tr>)}
        </tbody></Table>
      )}
    </Card>
  );
}

function StockTab() {
  const { t, i18n } = useTranslation(); const f = useFormat();
  const r = useFetch(() => api.get('/reports/stock'), []);
  if (r.error) return <Card><ErrorState error={r.error} onRetry={r.reload} /></Card>;
  if (!r.data) return <Card><TableSkeleton /></Card>;
  const { summary: s, rows } = r.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('inventory.units')} value={f.num(s.units)} /><StatCard tone="info" label={t('inventory.costValue')} value={f.money(s.costValue)} /><StatCard tone="ok" label={t('inventory.retailValue')} value={f.money(s.retailValue)} /><StatCard tone="warn" label={t('status.lowStock')} value={f.num(s.low + s.out)} />
      </div>
      <Card>
        <div className="flex justify-end p-3"><Button variant="secondary" size="sm" onClick={() => downloadCsv('stock-report.csv', [[t('inventory.product'), t('products.sku'), t('inventory.sellable'), t('inventory.expiredQty'), t('inventory.costValue'), t('inventory.retailValue')], ...rows.map((x) => [x.name, x.sku, x.sellable, x.expired, x.costValue, x.retailValue])])}><Download className="h-3.5 w-3.5" />{t('actions.exportCsv')}</Button></div>
        <Table><THead cols={[t('inventory.product'), t('inventory.sellable'), t('inventory.expiredQty'), t('inventory.costValue'), t('inventory.retailValue'), t('common.status')]} /><tbody>
          {rows.map((x) => <tr key={x._id} className="border-b border-line last:border-0"><td className="td font-semibold">{productName(x)} <Ltr className="text-xs text-muted">{x.sku}</Ltr></td><td className="td tabular">{f.num(x.sellable)}</td><td className="td tabular">{x.expired ? <span className="font-bold text-danger">{f.num(x.expired)}</span> : '—'}</td><td className="td tabular">{f.money(x.costValue)}</td><td className="td tabular">{f.money(x.retailValue)}</td><td className="td"><Badge tone={{ ok: 'ok', low: 'warn', out: 'danger' }[x.stockStatus]}>{t(`stockStatus.${x.stockStatus}`)}</Badge></td></tr>)}
        </tbody></Table>
      </Card>
    </div>
  );
}

function ForecastTab() {
  const { t, i18n } = useTranslation(); const f = useFormat();
  const [risk, setRisk] = useState('');
  const r = useFetch(() => api.get('/forecasting/reorder', { risk }), [risk]);
  const d = r.data;
  const explain = (x) => {
    const b = x.basis;
    const parts = [t(`forecastReason.${x.reasonKey}`, { days: x.daysRemaining ?? '—', lead: b.leadTimeDays, rop: x.reorderPoint, stock: b.availableStock })];
    parts.push(t('forecast.basisDemand', { sold: f.num(b.unitsSold), days: b.effectiveDays, avg: x.avgDailyDemand }));
    if (x.insufficientHistory) parts.push(t('forecast.insufficient', { days: b.historyDays }));
    return parts.join(' ');
  };
  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4 text-sm">
        <h2 className="flex items-center gap-2 font-bold"><Info className="h-4 w-4 text-info" />{t('forecast.title')}</h2>
        <p className="text-muted">{t('forecast.disclaimer')}</p>
        <ul className="grid gap-1 text-xs sm:grid-cols-3"><li className="rounded-lg bg-raised p-2"><strong>{t('forecast.reorderPoint')}</strong><br />{t('forecast.fRop')}</li><li className="rounded-lg bg-raised p-2"><strong>{t('forecast.target')}</strong><br />{t('forecast.fTarget')}</li><li className="rounded-lg bg-raised p-2"><strong>{t('forecast.suggested')}</strong><br />{t('forecast.fQty')}</li></ul>
        {d && <p className="text-xs text-muted">{t('forecast.params', { window: d.parameters.windowDays, coverage: d.parameters.coverageDays, lead: d.parameters.defaultLeadTimeDays })}</p>}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <select className="input !w-auto" value={risk} onChange={(e) => setRisk(e.target.value)} aria-label={t('forecast.risk')}><option value="">{t('forecast.allRisk')}</option>{['out', 'high', 'medium', 'low'].map((x) => <option key={x} value={x}>{t(`risk.${x}`)}</option>)}</select>
          {d && <Button variant="secondary" size="sm" onClick={() => downloadCsv('reorder-recommendations.csv', [[t('inventory.product'), t('products.sku'), t('forecast.available'), t('forecast.avgDemand'), t('forecast.daysLeft'), t('forecast.reorderPoint'), t('forecast.suggested'), t('forecast.orderCost'), t('forecast.risk')], ...d.rows.map((x) => [x.name, x.sku, x.available, x.avgDailyDemand, x.daysRemaining ?? '', x.reorderPoint, x.suggestedQty, x.estimatedOrderCost, x.risk])])}><Download className="h-3.5 w-3.5" />{t('actions.exportCsv')}</Button>}
        </div>
        {r.loading && !d ? <TableSkeleton cols={8} /> : r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : d.rows.length === 0 ? <EmptyState art="chart" title={t('reports.noData')} /> : (
          <Table><THead cols={[t('inventory.product'), t('forecast.available'), t('forecast.avgDemand'), t('forecast.daysLeft'), t('forecast.reorderPoint'), t('forecast.suggested'), t('forecast.orderCost'), t('forecast.risk'), t('reports.why')]} /><tbody>
            {d.rows.map((x) => (
              <tr key={x.productId} className="border-b border-line last:border-0 align-top">
                <td className="td font-semibold">{productName(x)} <Ltr className="text-xs text-muted">{x.sku}</Ltr></td>
                <td className="td tabular">{f.num(x.available)}</td><td className="td tabular">{f.num(x.avgDailyDemand, 2)} <span className="text-xs text-muted">/{t('forecast.day')}</span></td>
                <td className="td tabular">{x.daysRemaining === null ? '∞' : f.num(x.daysRemaining, 1)}</td><td className="td tabular">{f.num(x.reorderPoint, 1)}</td>
                <td className="td tabular font-extrabold">{x.suggestedQty > 0 ? f.num(x.suggestedQty) : '—'}</td><td className="td tabular">{x.suggestedQty > 0 ? f.money(x.estimatedOrderCost) : '—'}</td>
                <td className="td"><Badge tone={RISK_TONE[x.risk]}>{t(`risk.${x.risk}`)}</Badge>{x.insufficientHistory && <Badge className="ms-1">{t('forecast.lowHistory')}</Badge>}</td>
                <td className="td min-w-[260px] max-w-sm text-xs text-muted">{explain(x)} <em>({t('forecast.estimate')})</em></td>
              </tr>
            ))}
          </tbody></Table>
        )}
      </Card>
    </div>
  );
}
