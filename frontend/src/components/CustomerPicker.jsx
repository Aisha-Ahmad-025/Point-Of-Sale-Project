import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, UserRound } from 'lucide-react';
import { api } from '../services/api';
import { useFormat } from '../contexts/SettingsContext';
import { useDebounce, useFetch } from '../hooks/useFetch';
import { Badge, Button, EmptyState, Field, Ltr, Modal, SearchInput, Spinner, apiMessage } from './ui';

/** Modal to find a customer (name/phone) or add a new one on the spot. Calls onSelect(customer). */
export default function CustomerPicker({ open, onClose, onSelect }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const dq = useDebounce(q, 250);
  const list = useFetch(() => api.get('/customers', { q: dq, status: 'active', limit: 8 }), [dq], { enabled: open });
  useEffect(() => { if (!open) { setQ(''); setAdding(false); } }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={adding ? t('credit.addTitle') : t('credit.searchTitle')} size="md">
      {adding ? <NewCustomer onCancel={() => setAdding(false)} onCreated={(c) => { onSelect(c); }} defaultName={q} /> : (
        <div className="space-y-3">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('credit.searchPlaceholder')} data-autofocus aria-label={t('credit.searchPlaceholder')} />
          {list.loading && !list.data ? <div className="flex justify-center py-8"><Spinner /></div> : list.data?.length === 0 ? <EmptyState title={t('credit.noMatch')} /> : (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-2xl border border-line">
              {list.data?.map((c) => (
                <li key={c._id}>
                  <button type="button" onClick={() => onSelect(c)} className="flex w-full items-center gap-3 px-3.5 py-3 text-start transition hover:bg-raised">
                    <span className="icon-brand icon-tile h-10 w-10 shrink-0 text-sm font-extrabold">{c.name.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold">{c.name}</span><span className="text-xs text-muted">{c.phone ? <Ltr>{c.phone}</Ltr> : '—'}</span></span>
                    <span className="text-end text-xs">{c.balance > 0 ? <Badge tone="warn">{t('credit.owes', { value: f.money(c.balance) })}</Badge> : <Badge tone="ok">{t('customers.settled')}</Badge>}<span className="mt-1 block text-muted">{t('credit.available', { value: f.money(c.available) })}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" className="w-full" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{t('credit.addNew')}</Button>
        </div>
      )}
    </Modal>
  );
}

function NewCustomer({ onCancel, onCreated, defaultName }) {
  const { t } = useTranslation();
  const [err, setErr] = useState(null);
  const schema = z.object({ name: z.string().trim().min(2, t('validation.minChars', { count: 2 })).max(80), phone: z.string().trim().regex(/^([0-9+\-\s()]{7,20})?$/, t('validation.phone')).optional() });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { name: /\d/.test(defaultName) ? '' : defaultName, phone: /\d/.test(defaultName) ? defaultName : '' } });
  const submit = async (v) => { setErr(null); try { const { data } = await api.post('/customers', { name: v.name, phone: v.phone || '' }); onCreated(data); } catch (e) { setErr(e); } };
  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-3">
      {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{apiMessage(t, err)}</p>}
      <Field label={t('customers.name')} error={errors.name?.message} required><input className="input" data-autofocus {...register('name')} /></Field>
      <Field label={t('customers.phone')} error={errors.phone?.message} hint={t('customers.phoneHint')}><input className="input" dir="ltr" inputMode="tel" {...register('phone')} /></Field>
      <p className="flex items-center gap-2 rounded-xl bg-raised p-2.5 text-xs text-muted"><UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />{t('customers.defaultLimitNote')}</p>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>{t('actions.cancel')}</Button><Button type="submit" loading={isSubmitting}>{t('credit.create')}</Button></div>
    </form>
  );
}
