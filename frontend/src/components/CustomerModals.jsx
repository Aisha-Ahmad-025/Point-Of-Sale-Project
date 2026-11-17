// import { useRef, useState } from 'react';
// import { useTranslation } from 'react-i18next';
// import { useForm } from 'react-hook-form';
// import { zodResolver } from '@hookform/resolvers/zod';
// import { z } from 'zod';
// import { CheckCircle2, Printer } from 'lucide-react';
// import toast from 'react-hot-toast';
// import { api } from '../services/api';
// import { useAuth } from '../contexts/AuthContext';
// import { useFormat, useSettings } from '../contexts/SettingsContext';
// import { useFetch } from '../hooks/useFetch';
// import { toYmdLocal, uuid } from '../utils/misc';
// import { paymentMessage, statementMessage } from '../utils/whatsapp';
// import { Button, EmptyState, ErrorState, Field, Ltr, Modal, Spinner, apiMessage } from './ui';
// import WhatsAppShare from './WhatsAppShare';

// const numField = (t, min = 0) => z.preprocess((v) => (v === '' || v === undefined ? undefined : Number(v)), z.number({ invalid_type_error: t('validation.number') }).min(min, t('validation.nonNegative')).optional());

// export function CustomerForm({ customer, onClose, onSaved }) {
//   const { t } = useTranslation();
//   const { isAdmin } = useAuth();
//   const { settings } = useSettings();
//   const isNew = !customer._id;
//   const schema = z.object({
//     name: z.string().trim().min(2, t('validation.minChars', { count: 2 })).max(80),
//     phone: z.string().trim().regex(/^([0-9+\-\s()]{7,20})?$/, t('validation.phone')).optional(),
//     address: z.string().trim().max(200).optional(), notes: z.string().trim().max(300).optional(), creditLimit: numField(t),
//   });
//   const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
//     resolver: zodResolver(schema),
//     defaultValues: { name: customer.name || '', phone: customer.phone || '', address: customer.address || '', notes: customer.notes || '', creditLimit: customer.creditLimit ?? settings.defaultCreditLimit ?? 5000 },
//   });
//   const [err, setErr] = useState(null);
//   const submit = async (v) => {
//     setErr(null);
//     const body = { name: v.name, phone: v.phone || '', address: v.address || undefined, notes: v.notes || undefined };
//     if (isAdmin && v.creditLimit !== undefined) body.creditLimit = v.creditLimit;
//     try { if (isNew) await api.post('/customers', body); else await api.patch(`/customers/${customer._id}`, body); toast.success(t('customers.saved')); onSaved(); } catch (e) { setErr(e); }
//   };
//   return (
//     <Modal open onClose={onClose} title={isNew ? t('customers.add') : t('customers.edit')} footer={<><Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button><Button loading={isSubmitting} onClick={handleSubmit(submit)}>{t('actions.save')}</Button></>}>
//       <form onSubmit={handleSubmit(submit)} noValidate className="grid gap-3 sm:grid-cols-2">
//         {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger sm:col-span-2">{apiMessage(t, err)}</p>}
//         <Field label={t('customers.name')} error={errors.name?.message} required><input className="input" data-autofocus {...register('name')} /></Field>
//         <Field label={t('customers.phone')} error={errors.phone?.message} hint={t('customers.phoneHint')}><input className="input" dir="ltr" inputMode="tel" {...register('phone')} /></Field>
//         <Field label={t('customers.address')} className="sm:col-span-2"><input className="input" {...register('address')} /></Field>
//         {isAdmin && <Field label={t('customers.limit')} error={errors.creditLimit?.message} hint={t('customers.limitHint')}><input className="input" dir="ltr" inputMode="decimal" {...register('creditLimit')} /></Field>}
//         <Field label={t('customers.notes')} className={isAdmin ? '' : 'sm:col-span-2'}><input className="input" {...register('notes')} /></Field>
//         {!isAdmin && isNew && <p className="rounded-xl bg-raised p-2.5 text-xs text-muted sm:col-span-2">{t('customers.defaultLimitNote')}</p>}
//       </form>
//     </Modal>
//   );
// }

// export function PaymentModal({ customer, onClose, onDone }) {
//   const { t } = useTranslation();
//   const f = useFormat();
//   const { settings } = useSettings();
//   const [amount, setAmount] = useState('');
//   const [note, setNote] = useState('');
//   const [err, setErr] = useState(null);
//   const [busy, setBusy] = useState(false);
//   const [result, setResult] = useState(null);
//   const rid = useRef(uuid());
//   const n = Number(amount);

//   const submit = async () => {
//     if (!(n > 0)) { setErr({ code: 'VALIDATION_ERROR', message: t('validation.positive') }); return; }
//     setBusy(true); setErr(null);
//     try { const { data } = await api.post(`/customers/${customer._id}/payments`, { amount: n, note: note || undefined, requestId: rid.current }); setResult(data); toast.success(t('payments.recorded')); onDone?.(); }
//     catch (e) { setErr(e); } finally { setBusy(false); }
//   };

//   if (result) {
//     const msg = paymentMessage({ store: settings, customer: result.customer, amount: n, balance: result.customer.balance, fmt: f });
//     return (
//       <Modal open onClose={onClose} title={t('payments.title')} size="sm" footer={<><WhatsAppShare text={msg} phone={result.customer.phone} /><Button onClick={onClose}>{t('payments.done')}</Button></>}>
//         <div className="flex flex-col items-center gap-2 py-4 text-center">
//           <span className="icon-tile h-14 w-14 bg-ok/15 text-ok"><CheckCircle2 className="h-7 w-7" aria-hidden="true" /></span>
//           <p className="text-lg font-extrabold">{f.money(n)}</p><p className="text-sm text-muted">{t('payments.recorded')}</p>
//           <p className="mt-2 rounded-xl bg-raised px-4 py-2 text-sm">{t('payments.after')}: <strong className="tabular">{f.money(result.customer.balance)}</strong></p>
//         </div>
//       </Modal>
//     );
//   }
//   return (
//     <Modal open onClose={onClose} title={`${t('payments.title')} · ${customer.name}`} size="sm" footer={<><Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button><Button loading={busy} disabled={customer.balance <= 0} onClick={submit}>{t('payments.title')}</Button></>}>
//       <div className="space-y-3">
//         {customer.balance <= 0 ? <p className="rounded-xl bg-raised p-3 text-sm">{t('payments.noBalance')}</p> : <p className="rounded-xl bg-warn/10 p-3 text-sm font-semibold text-warn">{t('payments.outstanding', { value: f.money(customer.balance) })}</p>}
//         {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{apiMessage(t, err)}</p>}
//         <Field label={t('payments.amount')} required>
//           <input className="input !text-lg font-bold" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" data-autofocus onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
//         </Field>
//         {customer.balance > 0 && <button type="button" className="text-xs font-bold text-accent hover:underline" onClick={() => setAmount(String(customer.balance))}>{t('payments.full')}: {f.money(customer.balance)}</button>}
//         <Field label={t('payments.note')}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
//       </div>
//     </Modal>
//   );
// }

// export function AdjustModal({ customer, onClose, onDone }) {
//   const { t } = useTranslation();
//   const f = useFormat();
//   const [amount, setAmount] = useState(''); const [reason, setReason] = useState('');
//   const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
//   const rid = useRef(uuid());
//   const submit = async () => {
//     const n = Number(amount);
//     if (!amount || Number.isNaN(n) || n === 0) { setErr({ code: 'VALIDATION_ERROR', message: t('validation.number') }); return; }
//     if (reason.trim().length < 3) { setErr({ code: 'VALIDATION_ERROR', message: t('validation.reasonRequired') }); return; }
//     setBusy(true); setErr(null);
//     try { await api.post(`/customers/${customer._id}/adjustments`, { amount: n, reason: reason.trim(), requestId: rid.current }); toast.success(t('adjust.saved')); onDone(); }
//     catch (e) { setErr(e); } finally { setBusy(false); }
//   };
//   return (
//     <Modal open onClose={onClose} title={`${t('adjust.title')} · ${customer.name}`} size="sm" footer={<><Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button><Button loading={busy} onClick={submit}>{t('actions.save')}</Button></>}>
//       <div className="space-y-3">
//         <p className="text-sm text-muted">{t('adjust.hint')}</p>
//         <p className="rounded-xl bg-raised p-3 text-sm">{t('customers.balance')}: <strong className="tabular">{f.money(customer.balance)}</strong></p>
//         {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{apiMessage(t, err)}</p>}
//         <Field label={t('adjust.amount')} required><input className="input" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.\-]/g, ''))} data-autofocus /></Field>
//         <Field label={t('adjust.reason')} required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
//       </div>
//     </Modal>
//   );
// }

// export function StatementModal({ customer, onClose }) {
//   const { t } = useTranslation();
//   const f = useFormat();
//   const [range, setRange] = useState({ from: toYmdLocal(-29), to: toYmdLocal(0) });
//   const r = useFetch(() => api.get(`/customers/${customer._id}/statement`, range), [range.from, range.to]);
//   const s = r.data;
//   return (
//     <Modal open onClose={onClose} title={`${t('statement.title')} · ${customer.name}`} size="xl"
//       footer={s && <><WhatsAppShare text={statementMessage({ store: s.store, statement: s, fmt: f })} phone={customer.phone} /><Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('statement.print')}</Button><Button onClick={onClose}>{t('actions.close')}</Button></>}>
//       <div className="no-print mb-4 flex flex-wrap items-end gap-3">
//         <Field label={t('common.from')}><input className="input" dir="ltr" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
//         <Field label={t('common.to')}><input className="input" dir="ltr" type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
//       </div>
//       {r.loading && !s ? <div className="flex justify-center py-10"><Spinner /></div> : r.error ? <ErrorState error={r.error} onRetry={r.reload} /> : (
//         <div className="print-area">
//           <div className="statement">
//             <h2 style={{ fontSize: 18, fontWeight: 800 }}>{s.store.storeName}</h2>
//             <p>{s.store.address} · <Ltr>{s.store.phone}</Ltr></p>
//             <h3 style={{ margin: '10px 0 2px', fontSize: 15, fontWeight: 800 }}>{t('statement.title')}</h3>
//             <p><strong>{s.customer.name}</strong>{s.customer.phone && <> · <Ltr>{s.customer.phone}</Ltr></>}</p>
//             <p>{t('statement.period')}: {s.range.from} – {s.range.to}</p>
//             <table style={{ margin: '10px 0' }}>
//               <thead><tr><th>{t('customers.date')}</th><th>{t('customers.type')}</th><th>{t('customers.reference')}</th><th style={{ textAlign: 'end' }}>{t('customers.debit')}</th><th style={{ textAlign: 'end' }}>{t('customers.credit')}</th><th style={{ textAlign: 'end' }}>{t('customers.runningBalance')}</th></tr></thead>
//               <tbody>
//                 <tr><td colSpan={5}><em>{t('statement.opening')}</em></td><td style={{ textAlign: 'end' }}>{f.money(s.openingBalance)}</td></tr>
//                 {s.entries.map((e) => (
//                   <tr key={e._id}><td>{f.dateTime(e.createdAt)}</td><td>{t(`ledgerType.${e.type}`)}</td><td>{e.receiptNumber ? <Ltr>{e.receiptNumber}</Ltr> : e.note || ''}</td>
//                     <td style={{ textAlign: 'end' }}>{e.amount > 0 ? f.money(e.amount) : ''}</td><td style={{ textAlign: 'end' }}>{e.amount < 0 ? f.money(-e.amount) : ''}</td><td style={{ textAlign: 'end' }}>{f.money(e.balanceAfter)}</td></tr>
//                 ))}
//                 {s.entries.length === 0 && <tr><td colSpan={6}>{t('statement.empty')}</td></tr>}
//                 <tr><td colSpan={5}><strong>{t('statement.closing')}</strong></td><td style={{ textAlign: 'end' }}><strong>{f.money(s.closingBalance)}</strong></td></tr>
//               </tbody>
//             </table>
//             <p>{t('statement.charges')}: {f.money(s.totals.charges)} · {t('statement.payments')}: {f.money(s.totals.payments)}{s.totals.adjustments !== 0 && <> · {t('statement.adjustments')}: {f.money(s.totals.adjustments)}</>}</p>
//             <p style={{ marginTop: 8, color: '#666', fontSize: 10 }}>{t('statement.generated', { date: f.dateTime(new Date()) })}</p>
//           </div>
//         </div>
//       )}
//       {s && s.entries.length === 0 && <div className="no-print"><EmptyState title={t('statement.empty')} /></div>}
//     </Modal>
//   );
// }


import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useFormat, useSettings } from '../contexts/SettingsContext';
import { useFetch } from '../hooks/useFetch';
import { toYmdLocal, uuid } from '../utils/misc';
import { paymentMessage, statementMessage } from '../utils/whatsapp';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Ltr,
  Modal,
  Spinner,
  apiMessage,
} from './ui';
import WhatsAppShare from './WhatsAppShare';

const numField = (t, min = 0) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : Number(v)),
    z
      .number({ invalid_type_error: t('validation.number') })
      .min(min, t('validation.nonNegative'))
      .optional()
  );

export function CustomerForm({ customer, onClose, onSaved }) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { settings } = useSettings();
  const isNew = !customer._id;

  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(2, t('validation.minChars', { count: 2 }))
      .max(80),
    phone: z
      .string()
      .trim()
      .regex(/^([0-9+\-\s()]{7,20})?$/, t('validation.phone'))
      .optional(),
    address: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(300).optional(),
    creditLimit: numField(t),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: customer.name || '',
      phone: customer.phone || '',
      address: customer.address || '',
      notes: customer.notes || '',
      creditLimit:
        customer.creditLimit ?? settings.defaultCreditLimit ?? 5000,
    },
  });

  const [err, setErr] = useState(null);

  const submit = async (v) => {
    setErr(null);

    const body = {
      name: v.name,
      phone: v.phone || '',
      address: v.address || undefined,
      notes: v.notes || undefined,
    };

    if (isAdmin && v.creditLimit !== undefined) {
      body.creditLimit = v.creditLimit;
    }

    try {
      if (isNew) {
        await api.post('/customers', body);
      } else {
        await api.patch(`/customers/${customer._id}`, body);
      }

      toast.success(t('customers.saved'));
      onSaved();
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t('customers.add') : t('customers.edit')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button loading={isSubmitting} onClick={handleSubmit(submit)}>
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={handleSubmit(submit)}
        noValidate
        className="grid gap-3 sm:grid-cols-2"
      >
        {err && (
          <p
            role="alert"
            className="rounded-xl bg-danger/10 p-3 text-sm text-danger sm:col-span-2"
          >
            {apiMessage(t, err)}
          </p>
        )}

        <Field
          label={t('customers.name')}
          error={errors.name?.message}
          required
        >
          <input
            className="input"
            data-autofocus
            {...register('name')}
          />
        </Field>

        <Field
          label={t('customers.phone')}
          error={errors.phone?.message}
          hint={t('customers.phoneHint')}
        >
          <input
            className="input"
            dir="ltr"
            inputMode="tel"
            {...register('phone')}
          />
        </Field>

        <Field
          label={t('customers.address')}
          className="sm:col-span-2"
        >
          <input className="input" {...register('address')} />
        </Field>

        {isAdmin && (
          <Field
            label={t('customers.limit')}
            error={errors.creditLimit?.message}
            hint={t('customers.limitHint')}
          >
            <input
              className="input"
              dir="ltr"
              inputMode="decimal"
              {...register('creditLimit')}
            />
          </Field>
        )}

        <Field
          label={t('customers.notes')}
          className={isAdmin ? '' : 'sm:col-span-2'}
        >
          <input className="input" {...register('notes')} />
        </Field>

        {!isAdmin && isNew && (
          <p className="rounded-xl bg-raised p-2.5 text-xs text-muted sm:col-span-2">
            {t('customers.defaultLimitNote')}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function PaymentModal({ customer, onClose, onDone }) {
  const { t } = useTranslation();
  const f = useFormat();
  const { settings } = useSettings();

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const rid = useRef(uuid());
  const n = Number(amount);

  const submit = async () => {
    if (!(n > 0)) {
      setErr({
        code: 'VALIDATION_ERROR',
        message: t('validation.positive'),
      });
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      const { data } = await api.post(
        `/customers/${customer._id}/payments`,
        {
          amount: n,
          note: note || undefined,
          requestId: rid.current,
        }
      );

      setResult(data);
      toast.success(t('payments.recorded'));
      onDone?.();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const msg = paymentMessage({
      store: settings,
      customer: result.customer,
      amount: n,
      balance: result.customer.balance,
      fmt: f,
    });

    return (
      <Modal
        open
        onClose={onClose}
        title={t('payments.title')}
        size="sm"
        footer={
          <>
            <WhatsAppShare
              text={msg}
              phone={result.customer.phone}
            />
            <Button onClick={onClose}>
              {t('payments.done')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="icon-tile h-14 w-14 bg-ok/15 text-ok">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </span>

          <p className="text-lg font-extrabold">{f.money(n)}</p>
          <p className="text-sm text-muted">{t('payments.recorded')}</p>

          <p className="mt-2 rounded-xl bg-raised px-4 py-2 text-sm">
            {t('payments.after')}:{' '}
            <strong className="tabular">
              {f.money(result.customer.balance)}
            </strong>
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('payments.title')} · ${customer.name}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button
            loading={busy}
            disabled={customer.balance <= 0}
            onClick={submit}
          >
            {t('payments.title')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {customer.balance <= 0 ? (
          <p className="rounded-xl bg-raised p-3 text-sm">
            {t('payments.noBalance')}
          </p>
        ) : (
          <p className="rounded-xl bg-warn/10 p-3 text-sm font-semibold text-warn">
            {t('payments.outstanding', {
              value: f.money(customer.balance),
            })}
          </p>
        )}

        {err && (
          <p
            role="alert"
            className="rounded-xl bg-danger/10 p-3 text-sm text-danger"
          >
            {apiMessage(t, err)}
          </p>
        )}

        <Field label={t('payments.amount')} required>
          <input
            className="input !text-lg font-bold"
            dir="ltr"
            inputMode="decimal"
            value={amount}
            onChange={(e) =>
              setAmount(e.target.value.replace(/[^0-9.]/g, ''))
            }
            placeholder="0.00"
            data-autofocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </Field>

        {customer.balance > 0 && (
          <button
            type="button"
            className="text-xs font-bold text-accent hover:underline"
            onClick={() => setAmount(String(customer.balance))}
          >
            {t('payments.full')}: {f.money(customer.balance)}
          </button>
        )}

        <Field label={t('payments.note')}>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

export function AdjustModal({ customer, onClose, onDone }) {
  const { t } = useTranslation();
  const f = useFormat();

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const rid = useRef(uuid());

  const submit = async () => {
    const n = Number(amount);

    if (!amount || Number.isNaN(n) || n === 0) {
      setErr({
        code: 'VALIDATION_ERROR',
        message: t('validation.number'),
      });
      return;
    }

    if (reason.trim().length < 3) {
      setErr({
        code: 'VALIDATION_ERROR',
        message: t('validation.reasonRequired'),
      });
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      await api.post(`/customers/${customer._id}/adjustments`, {
        amount: n,
        reason: reason.trim(),
        requestId: rid.current,
      });

      toast.success(t('adjust.saved'));
      onDone();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('adjust.title')} · ${customer.name}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button loading={busy} onClick={submit}>
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('adjust.hint')}</p>

        <p className="rounded-xl bg-raised p-3 text-sm">
          {t('customers.balance')}:{' '}
          <strong className="tabular">{f.money(customer.balance)}</strong>
        </p>

        {err && (
          <p
            role="alert"
            className="rounded-xl bg-danger/10 p-3 text-sm text-danger"
          >
            {apiMessage(t, err)}
          </p>
        )}

        <Field label={t('adjust.amount')} required>
          <input
            className="input"
            dir="ltr"
            inputMode="decimal"
            value={amount}
            onChange={(e) =>
              setAmount(e.target.value.replace(/[^0-9.-]/g, ''))
            }
            data-autofocus
          />
        </Field>

        <Field label={t('adjust.reason')} required>
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

export function StatementModal({ customer, onClose }) {
  const { t } = useTranslation();
  const f = useFormat();

  const [range, setRange] = useState({
    from: toYmdLocal(-29),
    to: toYmdLocal(0),
  });

  const r = useFetch(
    () => api.get(`/customers/${customer._id}/statement`, range),
    [range.from, range.to]
  );

  const s = r.data;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('statement.title')} · ${customer.name}`}
      size="xl"
      footer={
        s && (
          <>
            <WhatsAppShare
              text={statementMessage({
                store: s.store,
                statement: s,
                fmt: f,
              })}
              phone={customer.phone}
            />

            <Button
              variant="secondary"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              {t('statement.print')}
            </Button>

            <Button onClick={onClose}>
              {t('actions.close')}
            </Button>
          </>
        )
      }
    >
      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        <Field label={t('common.from')}>
          <input
            className="input"
            dir="ltr"
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) =>
              setRange({ ...range, from: e.target.value })
            }
          />
        </Field>

        <Field label={t('common.to')}>
          <input
            className="input"
            dir="ltr"
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) =>
              setRange({ ...range, to: e.target.value })
            }
          />
        </Field>
      </div>

      {r.loading && !s ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : r.error ? (
        <ErrorState error={r.error} onRetry={r.reload} />
      ) : (
        <div className="print-area">
          <div className="statement">
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>
              {s.store.storeName}
            </h2>

            <p>
              {s.store.address} · <Ltr>{s.store.phone}</Ltr>
            </p>

            <h3
              style={{
                margin: '10px 0 2px',
                fontSize: 15,
                fontWeight: 800,
              }}
            >
              {t('statement.title')}
            </h3>

            <p>
              <strong>{s.customer.name}</strong>
              {s.customer.phone && (
                <>
                  {' · '}
                  <Ltr>{s.customer.phone}</Ltr>
                </>
              )}
            </p>

            <p>
              {t('statement.period')}: {s.range.from} – {s.range.to}
            </p>

            <table style={{ margin: '10px 0' }}>
              <thead>
                <tr>
                  <th>{t('customers.date')}</th>
                  <th>{t('customers.type')}</th>
                  <th>{t('customers.reference')}</th>
                  <th style={{ textAlign: 'end' }}>
                    {t('customers.debit')}
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    {t('customers.credit')}
                  </th>
                  <th style={{ textAlign: 'end' }}>
                    {t('customers.runningBalance')}
                  </th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td colSpan={5}>
                    <em>{t('statement.opening')}</em>
                  </td>
                  <td style={{ textAlign: 'end' }}>
                    {f.money(s.openingBalance)}
                  </td>
                </tr>

                {s.entries.map((e) => (
                  <tr key={e._id}>
                    <td>{f.dateTime(e.createdAt)}</td>
                    <td>{t(`ledgerType.${e.type}`)}</td>
                    <td>
                      {e.receiptNumber ? (
                        <Ltr>{e.receiptNumber}</Ltr>
                      ) : (
                        e.note || ''
                      )}
                    </td>
                    <td style={{ textAlign: 'end' }}>
                      {e.amount > 0 ? f.money(e.amount) : ''}
                    </td>
                    <td style={{ textAlign: 'end' }}>
                      {e.amount < 0 ? f.money(-e.amount) : ''}
                    </td>
                    <td style={{ textAlign: 'end' }}>
                      {f.money(e.balanceAfter)}
                    </td>
                  </tr>
                ))}

                {s.entries.length === 0 && (
                  <tr>
                    <td colSpan={6}>{t('statement.empty')}</td>
                  </tr>
                )}

                <tr>
                  <td colSpan={5}>
                    <strong>{t('statement.closing')}</strong>
                  </td>
                  <td style={{ textAlign: 'end' }}>
                    <strong>{f.money(s.closingBalance)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>

            <p>
              {t('statement.charges')}: {f.money(s.totals.charges)} ·{' '}
              {t('statement.payments')}: {f.money(s.totals.payments)}
              {s.totals.adjustments !== 0 && (
                <>
                  {' · '}
                  {t('statement.adjustments')}:{' '}
                  {f.money(s.totals.adjustments)}
                </>
              )}
            </p>

            <p
              style={{
                marginTop: 8,
                color: '#666',
                fontSize: 10,
              }}
            >
              {t('statement.generated', {
                date: f.dateTime(new Date()),
              })}
            </p>
          </div>
        </div>
      )}

      {s && s.entries.length === 0 && (
        <div className="no-print">
          <EmptyState title={t('statement.empty')} />
        </div>
      )}
    </Modal>
  );
}
