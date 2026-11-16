import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Banknote, FileText, MapPin, Pencil, Phone, Power, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useFormat, useSettings } from '../contexts/SettingsContext';
import { useFetch } from '../hooks/useFetch';
import { reminderMessage } from '../utils/whatsapp';
import { undoToast } from '../utils/undo';
import { Badge, Button, Card, EmptyState, ErrorState, Ltr, Pagination, Skeleton, Table, TableSkeleton, THead, apiMessage } from '../components/ui';
import { AdjustModal, CustomerForm, PaymentModal, StatementModal } from '../components/CustomerModals';
import WhatsAppShare from '../components/WhatsAppShare';

const TYPE_TONE = { charge: 'warn', payment: 'ok', adjustment: 'info', void_reversal: 'neutral' };

export default function CustomerDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const f = useFormat();
  const { isAdmin } = useAuth();
  const { settings } = useSettings();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [modal, setModal] = useState(null); // pay | adjust | edit | statement | toggle
  useEffect(() => { setPage(1); }, [type, id]);

  const cust = useFetch(() => api.get(`/customers/${id}`), [id]);
  const ledger = useFetch(() => api.get(`/customers/${id}/ledger`, { type, page, limit: 15 }), [id, type, page]);
  const c = cust.data;
  const refresh = () => { cust.reload(); ledger.reload(); };

  const flip = async () => {
    try {
      await api.patch(`/customers/${id}/status`, { isActive: !c.isActive }); refresh();
      if (c.isActive) undoToast(t('customers.deactivated'), async () => { try { await api.patch(`/customers/${id}/status`, { isActive: true }); refresh(); } catch (e) { toast.error(apiMessage(t, e)); } }, { label: t('undo.button') });
      else toast.success(t('customers.activated'));
    } catch (e) { toast.error(apiMessage(t, e)); }
  };

  if (cust.error) return <Card><ErrorState error={cust.error} onRetry={cust.reload} /></Card>;
  if (!c) return <div className="space-y-4"><Skeleton className="h-44" /><Skeleton className="h-72" /></div>;
  const used = c.creditLimit > 0 ? Math.min(100, Math.max(0, (c.balance / c.creditLimit) * 100)) : 0;

  return (
    <div className="space-y-4">
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"><ArrowLeft className="h-4 w-4" />{t('customers.back')}</Link>
      <section className="hero rounded-3xl p-6 shadow-lift">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="icon-brand icon-tile h-16 w-16 text-2xl font-extrabold">{c.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <h1 className="text-2xl font-extrabold">{c.name}{!c.isActive && <Badge className="ms-2">{t('customers.inactiveBadge')}</Badge>}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#F8EAF0]/80">
                {c.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /><Ltr>{c.phone}</Ltr></span>}
                {c.address && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{c.address}</span>}
              </p>
            </div>
          </div>
          <div className="text-end">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#F8EAF0]/75">{c.balance < 0 ? t('customers.advance') : t('customers.owes')}</p>
            <p className="tabular text-4xl font-extrabold text-gradient">{f.money(Math.abs(c.balance))}</p>
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-[#F8EAF0]/80"><span>{t('customers.limit')}: {f.money(c.creditLimit)}</span><span>{t('customers.available')}: {f.money(c.available)}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={Math.round(used)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-gradient-to-r from-[#F2A93B] to-[#D6452B] transition-all" style={{ width: `${used}%` }} /></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => setModal('pay')} disabled={c.balance <= 0}><Banknote className="h-4 w-4" />{t('customers.recordPayment')}</Button>
          {c.balance > 0 && <WhatsAppShare label={t('customers.sendReminder')} phone={c.phone} text={reminderMessage({ store: settings, customer: c, fmt: f })} />}
          <Button variant="secondary" onClick={() => setModal('statement')}><FileText className="h-4 w-4" />{t('customers.statement')}</Button>
          <Button variant="secondary" onClick={() => setModal('edit')}><Pencil className="h-4 w-4" />{t('actions.edit')}</Button>
          {isAdmin && <Button variant="secondary" onClick={() => setModal('adjust')}><SlidersHorizontal className="h-4 w-4" />{t('customers.adjust')}</Button>}
          {isAdmin && <Button variant="secondary" onClick={flip}><Power className="h-4 w-4" />{c.isActive ? t('customers.deactivate') : t('customers.activate')}</Button>}
        </div>
      </section>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <h2 className="px-1 font-extrabold">{t('customers.ledger')}</h2>
          <select className="input !w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label={t('customers.type')}>
            <option value="">{t('movements.allTypes')}</option>{['charge', 'payment', 'adjustment', 'void_reversal'].map((x) => <option key={x} value={x}>{t(`ledgerType.${x}`)}</option>)}
          </select>
        </div>
        {ledger.loading && !ledger.data ? <TableSkeleton cols={5} /> : ledger.error ? <ErrorState error={ledger.error} onRetry={ledger.reload} /> : ledger.data.length === 0 ? <EmptyState art="receipt" title={t('customers.noLedger')} /> : (
          <Table>
            <THead cols={[t('customers.date'), t('customers.type'), t('customers.reference'), t('customers.debit'), t('customers.credit'), t('customers.runningBalance')]} />
            <tbody>
              {ledger.data.map((e) => (
                <tr key={e._id}>
                  <td className="td whitespace-nowrap text-muted">{f.dateTime(e.createdAt)}</td>
                  <td className="td"><Badge tone={TYPE_TONE[e.type]}>{t(`ledgerType.${e.type}`)}</Badge></td>
                  <td className="td">{e.receiptNumber ? <Ltr className="font-semibold">{e.receiptNumber}</Ltr> : <span className="text-muted">{e.note || '—'}</span>}{e.userName && <span className="block text-xs text-muted">{e.userName}</span>}</td>
                  <td className="td tabular font-bold text-warn">{e.amount > 0 ? f.money(e.amount) : ''}</td>
                  <td className="td tabular font-bold text-ok">{e.amount < 0 ? f.money(-e.amount) : ''}</td>
                  <td className="td tabular font-semibold">{f.money(e.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination meta={ledger.meta} onPage={setPage} />
      </Card>

      {modal === 'pay' && <PaymentModal customer={c} onClose={() => setModal(null)} onDone={refresh} />}
      {modal === 'adjust' && <AdjustModal customer={c} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />}
      {modal === 'edit' && <CustomerForm customer={c} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal === 'statement' && <StatementModal customer={c} onClose={() => setModal(null)} />}
    </div>
  );
}
