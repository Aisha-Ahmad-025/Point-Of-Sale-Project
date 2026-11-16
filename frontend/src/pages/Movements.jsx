import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { api } from '../services/api';
import { useFormat } from '../contexts/SettingsContext';
import { useFetch } from '../hooks/useFetch';
import { downloadCsv, productName } from '../utils/misc';
import { Badge, Button, Card, EmptyState, ErrorState, Ltr, PageHeader, Pagination, Table, TableSkeleton, THead } from '../components/ui';
import ProductPicker from '../components/ProductPicker';

const TYPES = ['opening', 'receipt', 'sale', 'void_return', 'adjustment_in', 'adjustment_out', 'wastage'];
const TONE = { opening: 'info', receipt: 'ok', sale: 'neutral', void_return: 'warn', adjustment_in: 'ok', adjustment_out: 'warn', wastage: 'danger' };

export default function Movements() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const [type, setType] = useState('');
  const [product, setProduct] = useState(null);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [type, product, from, to]);
  const list = useFetch(() => api.get('/inventory/movements', { type, product: product?._id, from, to, page, limit: 25 }), [type, product, from, to, page]);

  const exportCsv = async () => {
    const all = await api.get('/inventory/movements', { type, product: product?._id, from, to, page: 1, limit: 100 });
    downloadCsv('stock-movements.csv', [[t('movements.date'), t('movements.type'), t('inventory.product'), t('products.sku'), t('inventory.lot'), t('inventory.quantity'), t('inventory.reason'), t('movements.employee')], ...all.data.map((m) => [m.createdAt, t(`movementType.${m.type}`), m.product?.name, m.product?.sku, m.lotNumber, m.quantity, m.reason, m.userName])]);
  };
  return (
    <>
      <PageHeader title={t('movements.title')} subtitle={t('movements.subtitle')} actions={<Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" />{t('actions.exportCsv')}</Button>} />
      <Card>
        <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProductPicker value={product} onChange={setProduct} placeholder={t('movements.filterProduct')} />
          <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label={t('movements.type')}><option value="">{t('movements.allTypes')}</option>{TYPES.map((x) => <option key={x} value={x}>{t(`movementType.${x}`)}</option>)}</select>
          <input className="input" dir="ltr" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('common.from')} />
          <input className="input" dir="ltr" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('common.to')} />
        </div>
        {list.loading && !list.data ? <TableSkeleton cols={7} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.length === 0 ? <EmptyState art="search" title={t('movements.empty')} /> : (
          <Table>
            <THead cols={[t('movements.date'), t('movements.type'), t('inventory.product'), t('inventory.lot'), t('inventory.quantity'), t('inventory.reason'), t('movements.employee')]} />
            <tbody>
              {list.data.map((m) => (
                <tr key={m._id} className="border-b border-line last:border-0">
                  <td className="td whitespace-nowrap text-muted">{f.dateTime(m.createdAt)}</td>
                  <td className="td"><Badge tone={TONE[m.type]}>{t(`movementType.${m.type}`)}</Badge></td>
                  <td className="td"><span className="font-semibold">{productName(m.product)}</span> <Ltr className="text-xs text-muted">{m.product?.sku}</Ltr></td>
                  <td className="td"><Ltr>{m.lotNumber || '—'}</Ltr></td>
                  <td className={`td tabular font-bold ${m.quantity < 0 ? 'text-danger' : 'text-ok'}`}><Ltr>{m.quantity > 0 ? '+' : ''}{f.num(m.quantity)}</Ltr></td>
                  <td className="td max-w-[220px] truncate text-muted" title={m.reason}>{m.type === 'wastage' && m.wastageReason ? `${t(`wastage.${m.wastageReason}`)}${m.reason && m.reason !== m.wastageReason ? ` · ${m.reason}` : ''}` : m.reason || '—'}</td>
                  <td className="td">{m.userName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
    </>
  );
}
