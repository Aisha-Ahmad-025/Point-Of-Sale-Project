import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Banknote, BookUser, HandCoins, Plus, Users } from 'lucide-react';
import { api } from '../services/api';
import { useFormat } from '../contexts/SettingsContext';
import { useDebounce, useFetch } from '../hooks/useFetch';
import { reminderMessage } from '../utils/whatsapp';
import { useSettings } from '../contexts/SettingsContext';
import { Badge, Button, Card, EmptyState, ErrorState, Ltr, PageHeader, Pagination, StatCard, Table, TableSkeleton, THead, SearchInput } from '../components/ui';
import { CustomerForm, PaymentModal } from '../components/CustomerModals';
import WhatsAppShare from '../components/WhatsAppShare';

export const BalanceBadge = ({ value }) => {
  const { t } = useTranslation(); const f = useFormat();
  if (value > 0) return <Badge tone="warn">{t('customers.owes')} {f.money(value)}</Badge>;
  if (value < 0) return <Badge tone="info">{t('customers.advance')} {f.money(-value)}</Badge>;
  return <Badge tone="ok">{t('customers.settled')}</Badge>;
};

export default function Customers() {
  const { t } = useTranslation();
  const f = useFormat();
  const { settings } = useSettings();
  const [q, setQ] = useState(''); const [owing, setOwing] = useState(false); const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(null); const [pay, setPay] = useState(null);
  const [params, setParams] = useSearchParams();
  useEffect(() => { if (params.get('new')) { setEdit({}); const p = new URLSearchParams(params); p.delete('new'); setParams(p, { replace: true }); } }, []); // opened from the command palette
  const dq = useDebounce(q, 300);
  useEffect(() => { setPage(1); }, [dq, owing]);
  const list = useFetch(() => api.get('/customers', { q: dq, owing: owing || undefined, page, limit: 15 }), [dq, owing, page]);
  const sum = list.meta?.summary;

  return (
    <>
      <PageHeader title={t('customers.title')} subtitle={t('customers.subtitle')} actions={<Button onClick={() => setEdit({})}><Plus className="h-4 w-4" />{t('customers.add')}</Button>} />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={HandCoins} tone="warn" label={t('customers.outstanding')} value={sum ? f.money(sum.outstanding) : '—'} />
        <StatCard icon={Users} tone="info" label={t('customers.owing')} value={sum ? f.num(sum.customersOwing) : '—'} />
        <StatCard icon={BookUser} label={t('customers.total')} value={list.meta ? f.num(list.meta.total) : '—'} />
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <SearchInput className="min-w-[220px] flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('customers.searchPlaceholder')} aria-label={t('customers.searchPlaceholder')} />
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-[#D6452B]" checked={owing} onChange={(e) => setOwing(e.target.checked)} />{t('customers.onlyOwing')}</label>
        </div>
        {list.loading && !list.data ? <TableSkeleton cols={6} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.length === 0 ? <EmptyState art="people" title={t('customers.empty')} hint={t('customers.emptyHint')} action={<Button onClick={() => setEdit({})}>{t('customers.add')}</Button>} /> : (
          <Table>
            <THead cols={[t('customers.name'), t('customers.balance'), t('customers.limit'), t('customers.available'), t('customers.lastPayment'), '']} />
            <tbody>
              {list.data.map((c) => (
                <tr key={c._id}>
                  <td className="td">
                    <Link to={`/customers/${c._id}`} className="flex items-center gap-3">
                      <span className="icon-brand icon-tile h-10 w-10 shrink-0 text-sm font-extrabold">{c.name.slice(0, 1).toUpperCase()}</span>
                      <span><span className="block font-bold hover:underline">{c.name}{!c.isActive && <Badge className="ms-2">{t('customers.inactiveBadge')}</Badge>}</span><span className="text-xs text-muted">{c.phone ? <Ltr>{c.phone}</Ltr> : '—'}</span></span>
                    </Link>
                  </td>
                  <td className="td"><BalanceBadge value={c.balance} /></td>
                  <td className="td tabular text-muted">{f.money(c.creditLimit)}</td>
                  <td className="td tabular">{f.money(c.available)}</td>
                  <td className="td whitespace-nowrap text-muted">{c.lastPaymentAt ? f.date(c.lastPaymentAt) : t('customers.never')}</td>
                  <td className="td"><div className="flex flex-wrap justify-end gap-1.5">
                    {c.balance > 0 && <Button size="sm" onClick={() => setPay(c)}><Banknote className="h-3.5 w-3.5" />{t('customers.recordPayment')}</Button>}
                    {c.balance > 0 && <WhatsAppShare size="sm" label={t('customers.sendReminder')} phone={c.phone} text={reminderMessage({ store: settings, customer: c, fmt: f })} />}
                    <Link to={`/customers/${c._id}`} className="btn btn-secondary btn-sm">{t('actions.view')}</Link>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
      {edit && <CustomerForm customer={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
      {pay && <PaymentModal customer={pay} onClose={() => setPay(null)} onDone={list.reload} />}
    </>
  );
}
