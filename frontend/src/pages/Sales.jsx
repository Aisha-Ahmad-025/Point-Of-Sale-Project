import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, Download, Eye, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useFormat } from '../contexts/SettingsContext';
import { useDebounce, useFetch } from '../hooks/useFetch';
import { downloadCsv } from '../utils/misc';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Ltr, Modal, PageHeader, Pagination, Spinner, Table, TableSkeleton, THead, apiMessage, SearchInput } from '../components/ui';
import Receipt from '../components/Receipt';
import ReceiptWhatsApp from '../components/ReceiptWhatsApp';

export default function Sales() {
  const { t } = useTranslation();
  const f = useFormat();
  const { isAdmin } = useAuth();
  const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [creditOnly, setCreditOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [view, setView] = useState(null);
  const dq = useDebounce(q, 300);
  useEffect(() => { setPage(1); }, [dq, status, from, to, creditOnly]);
  const list = useFetch(() => api.get('/sales', { q: dq, status, from, to, credit: creditOnly || undefined, page, limit: 20 }), [dq, status, from, to, creditOnly, page]);
  const sum = list.meta?.summary;

  const exportCsv = async () => {
    const r = await api.get('/sales', { q: dq, status, from, to, credit: creditOnly || undefined, page: 1, limit: 100 });
    downloadCsv('sales.csv', [[t('receipt.number'), t('receipt.date'), t('receipt.cashier'), t('pos.total'), t('common.status')], ...r.data.map((s) => [s.receiptNumber, s.createdAt, s.cashierName, s.total, s.status])]);
  };

  return (
    <>
      <PageHeader title={t('sales.title')} subtitle={isAdmin ? t('sales.subtitleAdmin') : t('sales.subtitleCashier')} actions={<Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" />{t('actions.exportCsv')}</Button>} />
      <Card>
        <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput className="" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('sales.searchReceipt')} aria-label={t('sales.searchReceipt')} dir="ltr" />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('common.status')}><option value="">{t('common.allStatuses')}</option><option value="completed">{t('status.completed')}</option><option value="voided">{t('status.voided')}</option></select>
          <input className="input" dir="ltr" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('common.from')} />
          <input className="input" dir="ltr" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('common.to')} />
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-[#D6452B]" checked={creditOnly} onChange={(e) => setCreditOnly(e.target.checked)} />{t('sales.creditOnly')}</label>
        </div>
        {sum && <p className="border-b border-line px-4 py-2 text-sm text-muted">{t('sales.summary', { count: sum.completedCount })} <strong className="text-ink">{f.money(sum.completedTotal)}</strong></p>}
        {list.loading && !list.data ? <TableSkeleton cols={6} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.length === 0 ? <EmptyState art="receipt" title={t('sales.empty')} hint={t('sales.emptyHint')} /> : (
          <Table>
            <THead cols={[t('receipt.number'), t('receipt.date'), t('sales.customer'), ...(isAdmin ? [t('receipt.cashier')] : []), t('pos.total'), t('sales.payment'), t('common.status'), '']} />
            <tbody>
              {list.data.map((s) => (
                <tr key={s._id} className="border-b border-line last:border-0 hover:bg-raised/40">
                  <td className="td font-semibold"><Ltr>{s.receiptNumber}</Ltr></td>
                  <td className="td whitespace-nowrap text-muted">{f.dateTime(s.createdAt)}</td>
                  <td className="td">{s.customerName || <span className="text-muted">{t('sales.walkIn')}</span>}</td>
                  {isAdmin && <td className="td">{s.cashierName}</td>}
                  <td className="td tabular font-bold">{f.money(s.total)}</td>
                  <td className="td"><Badge tone={{ paid: 'ok', partial: 'warn', unpaid: 'danger', refunded: 'neutral' }[s.paymentStatus || 'paid']}>{t(`status.${s.paymentStatus === 'refunded' ? 'voided' : s.paymentStatus || 'paid'}`)}</Badge>{s.payment?.creditAmount > 0 && <span className="mt-0.5 block text-xs text-muted">{t('receipt.onCredit')}: {f.money(s.payment.creditAmount)}</span>}</td>
                  <td className="td"><Badge tone={s.status === 'completed' ? 'ok' : 'danger'}>{t(`status.${s.status}`)}</Badge></td>
                  <td className="td text-end"><button className="btn btn-ghost btn-sm" onClick={() => setView(s)}><Eye className="h-4 w-4" />{t('actions.view')}</button></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
      {view && <SaleDetail id={view._id} onClose={() => setView(null)} onChanged={() => { list.reload(); }} />}
    </>
  );
}

function SaleDetail({ id, onClose, onChanged }) {
  const { t } = useTranslation();
  const f = useFormat();
  const { isAdmin } = useAuth();
  const r = useFetch(() => api.get(`/sales/${id}/receipt`), [id]);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const sale = r.data?.sale;

  const doVoid = async () => {
    if (reason.trim().length < 3) { setErr({ code: 'VALIDATION_ERROR', message: t('validation.reasonRequired') }); return; }
    setBusy(true); setErr(null);
    try { await api.post(`/sales/${id}/void`, { reason: reason.trim() }); toast.success(t('sales.voided')); setVoiding(false); r.reload(); onChanged(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={sale ? sale.receiptNumber : t('sales.details')} size="md"
      footer={sale && <><ReceiptWhatsApp store={r.data.store} sale={sale} />{isAdmin && sale.status === 'completed' && <Button variant="danger" onClick={() => setVoiding(true)}><Ban className="h-4 w-4" />{t('sales.void')}</Button>}<Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('pos.print')}</Button><Button onClick={onClose}>{t('actions.close')}</Button></>}>
      {r.loading && !r.data ? <div className="flex justify-center py-10"><Spinner /></div> : r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : (
        <div className="space-y-4">
          {sale.status === 'voided' && <div role="status" className="rounded-xl bg-danger/10 p-3 text-sm text-danger"><strong>{t('status.voided')}</strong> · {f.dateTime(sale.voidedAt)} · {sale.voidReason}</div>}
          {isAdmin && <div className="grid grid-cols-3 gap-2 text-center text-xs">{[[t('reports.netRevenue'), sale.netRevenue], ['COGS', sale.cogs], [t('reports.grossProfit'), sale.grossProfit]].map(([l, v]) => <div key={l} className="rounded-xl bg-raised p-2"><p className="text-muted">{l}</p><p className="tabular font-bold">{f.money(v)}</p></div>)}</div>}
          <Receipt store={r.data.store} sale={sale} />
        </div>
      )}
      <Modal open={voiding} onClose={() => setVoiding(false)} title={t('sales.void')} size="sm" footer={<><Button variant="secondary" onClick={() => setVoiding(false)}>{t('actions.cancel')}</Button><Button variant="danger" loading={busy} onClick={doVoid}>{t('sales.void')}</Button></>}>
        <p className="mb-3 text-sm">{t('sales.voidMsg')}</p>
        {err && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-2.5 text-sm text-danger">{apiMessage(t, err)}</p>}
        <Field label={t('inventory.reason')} required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus /></Field>
      </Modal>
    </Modal>
  );
}
