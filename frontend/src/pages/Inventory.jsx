import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Boxes, Coins, PackageMinus, PackagePlus, SlidersHorizontal, Trash2, TriangleAlert } from 'lucide-react';
import { api } from '../services/api';
import { useFormat } from '../contexts/SettingsContext';
import { useDebounce, useFetch } from '../hooks/useFetch';
import { productName } from '../utils/misc';
import { Badge, Button, Card, EmptyState, ErrorState, Ltr, PageHeader, Pagination, StatCard, Table, TableSkeleton, THead, Tooltip, SearchInput } from '../components/ui';
import { AdjustModal, ReceiveModal, WastageModal } from '../components/StockModals';

const TONE = { ok: 'ok', low: 'warn', out: 'danger' };

export default function Inventory() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(params.get('status') || '');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(params.get('receive') ? { type: 'receive' } : null); // {type, product}
  useEffect(() => { if (params.get('receive')) { const p = new URLSearchParams(params); p.delete('receive'); setParams(p, { replace: true }); } }, []); // opened from the command palette
  const dq = useDebounce(q, 300);
  useEffect(() => { setPage(1); }, [dq, status]);
  const list = useFetch(() => api.get('/inventory/stock', { q: dq, status, page, limit: 20 }), [dq, status, page]);
  const s = list.meta?.summary;
  const done = () => { setModal(null); list.reload(); };

  return (
    <>
      <PageHeader title={t('inventory.title')} subtitle={t('inventory.subtitle')}
        actions={<><Button variant="secondary" onClick={() => setModal({ type: 'adjust' })}><SlidersHorizontal className="h-4 w-4" />{t('inventory.adjust')}</Button><Button onClick={() => setModal({ type: 'receive' })}><PackagePlus className="h-4 w-4" />{t('inventory.receive')}</Button></>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Boxes} label={t('inventory.units')} value={s ? f.num(s.units) : '—'} sub={s && t('inventory.productsCount', { count: s.products })} />
        <StatCard icon={Coins} tone="info" label={t('inventory.costValue')} value={s ? f.money(s.costValue) : '—'} sub={s && `${t('inventory.retailValue')}: ${f.money(s.retailValue)}`} />
        <StatCard icon={TriangleAlert} tone="warn" label={t('status.lowStock')} value={s ? f.num(s.low) : '—'} />
        <StatCard icon={PackageMinus} tone="danger" label={t('status.outOfStock')} value={s ? f.num(s.out) : '—'} />
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput className="min-w-[220px] flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('products.searchPlaceholder')} aria-label={t('products.searchPlaceholder')} />
          <select className="input !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setParams(e.target.value ? { status: e.target.value } : {}); }} aria-label={t('common.status')}>
            <option value="">{t('common.allStock')}</option><option value="low">{t('status.lowStock')}</option><option value="out">{t('status.outOfStock')}</option><option value="near">{t('status.nearExpiry')}</option><option value="expired">{t('status.hasExpired')}</option>
          </select>
        </div>
        {list.loading && !list.data ? <TableSkeleton cols={7} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.length === 0 ? <EmptyState art="box" title={t('inventory.empty')} hint={t('inventory.emptyHint')} /> : (
          <Table>
            <THead cols={[t('inventory.product'), t('products.sku'), t('inventory.sellable'), t('inventory.expiredQty'), t('inventory.reorderAt'), t('inventory.nextExpiry'), t('inventory.costValue'), t('common.status'), '']} />
            <tbody>
              {list.data.map((r) => (
                <tr key={r._id} className="border-b border-line last:border-0 hover:bg-raised/40">
                  <td className="td font-semibold">{productName(r)}{!r.isActive && <Badge className="ms-2">{t('status.archived')}</Badge>}</td>
                  <td className="td"><Ltr>{r.sku}</Ltr></td>
                  <td className="td tabular font-bold">{f.num(r.stock.sellable)} <span className="text-xs font-normal text-muted">{t(`units.${r.unit}`)}</span></td>
                  <td className="td tabular">{r.stock.expired > 0 ? <span className="font-bold text-danger">{f.num(r.stock.expired)}</span> : '—'}</td>
                  <td className="td tabular text-muted">{f.num(r.reorderThreshold)}</td>
                  <td className="td tabular">{r.stock.nextExpiry ? <span className={r.nearExpiry ? 'font-bold text-warn' : ''}>{f.dateOnly(r.stock.nextExpiry)}</span> : '—'}</td>
                  <td className="td tabular">{f.money(r.stock.value)}</td>
                  <td className="td"><Badge tone={TONE[r.stockStatus]}>{t(`stockStatus.${r.stockStatus}`)}</Badge></td>
                  <td className="td"><div className="flex justify-end gap-1">
                    <Tooltip text={t('inventory.receive')}><button className="btn btn-ghost !p-1.5" onClick={() => setModal({ type: 'receive', product: r })} aria-label={t('inventory.receive')}><PackagePlus className="h-4 w-4" /></button></Tooltip>
                    <Tooltip text={t('inventory.adjust')}><button className="btn btn-ghost !p-1.5" onClick={() => setModal({ type: 'adjust', product: r })} aria-label={t('inventory.adjust')}><SlidersHorizontal className="h-4 w-4" /></button></Tooltip>
                    <Tooltip text={t('expiry.recordWastage')}><button className="btn btn-ghost !p-1.5 text-danger" onClick={() => setModal({ type: 'waste', product: r })} aria-label={t('expiry.recordWastage')}><Trash2 className="h-4 w-4" /></button></Tooltip>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
      {modal?.type === 'receive' && <ReceiveModal product={modal.product} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'adjust' && <AdjustModal product={modal.product} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'waste' && <WastageModal product={modal.product} onClose={() => setModal(null)} onDone={done} />}
    </>
  );
}
