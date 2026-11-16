import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Coins, Trash2, TriangleAlert } from 'lucide-react';
import { api } from '../services/api';
import { useFormat } from '../contexts/SettingsContext';
import { useFetch } from '../hooks/useFetch';
import { productName } from '../utils/misc';
import { Badge, Button, Card, EmptyState, ErrorState, Ltr, PageHeader, Pagination, StatCard, Table, TableSkeleton, Tabs, THead } from '../components/ui';
import { WastageModal } from '../components/StockModals';

function BatchTable({ rows, onWaste }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  return (
    <Table>
      <THead cols={[t('inventory.product'), t('inventory.lot'), t('inventory.remaining'), t('products.expiryDate'), t('expiry.daysLeft'), t('inventory.costValue'), t('common.status'), '']} />
      <tbody>
        {rows.map((b) => (
          <tr key={b._id} className="border-b border-line last:border-0">
            <td className="td font-semibold">{productName(b.product)} <Ltr className="text-xs text-muted">{b.product?.sku}</Ltr></td>
            <td className="td"><Ltr>{b.lotNumber}</Ltr></td>
            <td className="td tabular">{f.num(b.remainingQuantity)}</td>
            <td className="td tabular">{b.expiryDate ? f.dateOnly(b.expiryDate) : t('expiry.noExpiry')}</td>
            <td className="td tabular">{b.daysToExpiry === null ? '—' : b.daysToExpiry < 0 ? t('expiry.expiredAgo', { count: Math.abs(b.daysToExpiry) }) : t('expiry.inDays', { count: b.daysToExpiry })}</td>
            <td className="td tabular">{f.money(b.value)}</td>
            <td className="td"><Badge tone={{ expired: 'danger', near_expiry: 'warn', ok: 'ok', no_expiry: 'neutral' }[b.status]}>{t(`batchStatus.${b.status}`)}</Badge></td>
            <td className="td text-end">{b.remainingQuantity > 0 && <Button size="sm" variant={b.status === 'expired' ? 'danger' : 'secondary'} onClick={() => onWaste(b)}><Trash2 className="h-3.5 w-3.5" />{t('expiry.writeOff')}</Button>}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function Expiry() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const [tab, setTab] = useState('alerts');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [waste, setWaste] = useState(null); // batch | {} for blank
  useEffect(() => { setPage(1); }, [status, tab]);
  const alerts = useFetch(() => api.get('/expiry/alerts'), []);
  const batches = useFetch(() => api.get('/expiry/batches', { status, page, limit: 20 }), [status, page], { enabled: tab === 'batches' });
  const history = useFetch(() => api.get('/inventory/movements', { type: 'wastage', page, limit: 20 }), [page, tab], { enabled: tab === 'history' });
  const a = alerts.data;
  const done = () => { setWaste(null); alerts.reload(); batches.reload(); history.reload(); };

  return (
    <>
      <PageHeader title={t('expiry.title')} subtitle={t('expiry.subtitle')} actions={<Button variant="danger" onClick={() => setWaste({})}><Trash2 className="h-4 w-4" />{t('expiry.recordWastage')}</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={TriangleAlert} tone="danger" label={t('expiry.expiredBatches')} value={a ? f.num(a.expired.length) : '—'} sub={a && `${t('expiry.valueAtRisk')}: ${f.money(a.expiredValue)}`} />
        <StatCard icon={CalendarClock} tone="warn" label={t('expiry.nearBatches', { days: a?.nearExpiryDays ?? '' })} value={a ? f.num(a.near.length) : '—'} sub={a && `${t('expiry.valueAtRisk')}: ${f.money(a.nearValue)}`} />
        <StatCard icon={Coins} tone="info" label={t('expiry.totalAtRisk')} value={a ? f.money(a.expiredValue + a.nearValue) : '—'} />
      </div>
      <div className="mb-3"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'alerts', label: t('expiry.alerts') }, { id: 'batches', label: t('expiry.allBatches') }, { id: 'history', label: t('expiry.history') }]} /></div>
      <Card>
        {tab === 'alerts' && (alerts.loading && !a ? <TableSkeleton cols={7} /> : alerts.error ? <ErrorState error={alerts.error} onRetry={alerts.reload} /> : a.expired.length + a.near.length === 0 ? <EmptyState art="box" title={t('expiry.noAlerts')} hint={t('expiry.noAlertsHint')} /> : (
          <>
            {a.expired.length > 0 && <><h2 className="border-b border-line px-4 py-3 text-sm font-bold text-danger">{t('expiry.expiredSection')}</h2><BatchTable rows={a.expired} onWaste={setWaste} /></>}
            {a.near.length > 0 && <><h2 className="border-y border-line px-4 py-3 text-sm font-bold text-warn">{t('expiry.nearSection', { days: a.nearExpiryDays })}</h2><BatchTable rows={a.near} onWaste={setWaste} /></>}
          </>
        ))}
        {tab === 'batches' && (
          <>
            <div className="border-b border-line p-3"><select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('common.status')}><option value="">{t('common.allStatuses')}</option><option value="expired">{t('batchStatus.expired')}</option><option value="near">{t('batchStatus.near_expiry')}</option><option value="ok">{t('batchStatus.ok')}</option></select></div>
            {batches.loading && !batches.data ? <TableSkeleton cols={7} /> : batches.error ? <ErrorState error={batches.error} onRetry={batches.reload} /> : batches.data.length === 0 ? <EmptyState title={t('expiry.noBatches')} /> : <BatchTable rows={batches.data} onWaste={setWaste} />}
            <Pagination meta={batches.meta} onPage={setPage} />
          </>
        )}
        {tab === 'history' && (history.loading && !history.data ? <TableSkeleton cols={6} /> : history.error ? <ErrorState error={history.error} onRetry={history.reload} /> : history.data.length === 0 ? <EmptyState title={t('expiry.noHistory')} /> : (
          <>
            <Table>
              <THead cols={[t('movements.date'), t('inventory.product'), t('inventory.lot'), t('inventory.quantity'), t('inventory.reason'), t('expiry.financialImpact'), t('movements.employee')]} />
              <tbody>
                {history.data.map((m) => (
                  <tr key={m._id} className="border-b border-line last:border-0">
                    <td className="td whitespace-nowrap text-muted">{f.dateTime(m.createdAt)}</td>
                    <td className="td font-semibold">{productName(m.product)}</td>
                    <td className="td"><Ltr>{m.lotNumber}</Ltr></td>
                    <td className="td tabular">{f.num(Math.abs(m.quantity))}</td>
                    <td className="td">{t(`wastage.${m.wastageReason || 'other'}`)}</td>
                    <td className="td tabular font-bold text-danger">{f.money(Math.abs(m.quantity) * m.unitCost)}</td>
                    <td className="td">{m.userName}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination meta={history.meta} onPage={setPage} />
          </>
        ))}
      </Card>
      {waste && <WastageModal batch={waste._id ? waste : null} onClose={() => setWaste(null)} onDone={done} />}
    </>
  );
}
