import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useFormat } from '../contexts/SettingsContext';
import { useDebounce, useFetch } from '../hooks/useFetch';
import { undoToast } from '../utils/undo';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Ltr, Modal, PageHeader, Pagination, Table, TableSkeleton, THead, apiMessage, SearchInput } from '../components/ui';

export default function Employees() {
  const { t } = useTranslation();
  const f = useFormat();
  const { user: me } = useAuth();
  const [q, setQ] = useState(''); const [role, setRole] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const dq = useDebounce(q, 300);
  useEffect(() => { setPage(1); }, [dq, role, status]);
  const list = useFetch(() => api.get('/employees', { q: dq, role, status, page, limit: 15 }), [dq, role, status, page]);

  // Deactivating is instant and reversible with Undo (the server still protects the last admin and your own account).
  const flip = async (u) => {
    const id = u._id || u.id;
    try {
      await api.patch(`/employees/${id}/status`, { isActive: !u.isActive }); list.reload();
      if (u.isActive) undoToast(t('employees.deactivated'), async () => { try { await api.patch(`/employees/${id}/status`, { isActive: true }); list.reload(); } catch (e) { toast.error(apiMessage(t, e)); } }, { label: t('undo.button') });
      else toast.success(t('employees.activated'));
    } catch (e) { toast.error(apiMessage(t, e)); }
  };
  return (
    <>
      <PageHeader title={t('employees.title')} subtitle={t('employees.subtitle')} actions={<Button onClick={() => setEdit({})}><Plus className="h-4 w-4" />{t('employees.add')}</Button>} />
      <Card>
        <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-3">
          <SearchInput className="" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('employees.search')} aria-label={t('employees.search')} />
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)} aria-label={t('employees.role')}><option value="">{t('employees.allRoles')}</option><option value="admin">{t('roles.admin')}</option><option value="cashier">{t('roles.cashier')}</option></select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('common.status')}><option value="">{t('common.allStatuses')}</option><option value="active">{t('status.active')}</option><option value="inactive">{t('status.inactive')}</option></select>
        </div>
        {list.loading && !list.data ? <TableSkeleton cols={6} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.length === 0 ? <EmptyState art="people" title={t('employees.empty')} /> : (
          <Table><THead cols={[t('employees.name'), t('auth.email'), t('employees.role'), t('employees.lastLogin'), t('common.status'), '']} /><tbody>
            {list.data.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="td font-semibold">{u.name}{u.id === me.id && <Badge tone="brand" className="ms-2">{t('employees.you')}</Badge>}</td>
                <td className="td"><Ltr>{u.email}</Ltr></td>
                <td className="td"><Badge tone={u.role === 'admin' ? 'info' : 'neutral'}>{t(`roles.${u.role}`)}</Badge></td>
                <td className="td whitespace-nowrap text-muted">{u.lastLoginAt ? f.dateTime(u.lastLoginAt) : t('employees.never')}</td>
                <td className="td"><Badge tone={u.isActive ? 'ok' : 'neutral'}>{u.isActive ? t('status.active') : t('status.inactive')}</Badge></td>
                <td className="td"><div className="flex justify-end gap-1"><button className="btn btn-ghost !p-1.5" onClick={() => setEdit(u)} aria-label={t('actions.edit')}><Pencil className="h-4 w-4" /></button>
                  <button className="btn btn-ghost !p-1.5" disabled={u.id === me.id} onClick={() => flip(u)} aria-label={u.isActive ? t('employees.deactivate') : t('employees.activate')} title={u.isActive ? t('employees.deactivate') : t('employees.activate')}><Power className="h-4 w-4" /></button></div></td>
              </tr>
            ))}
          </tbody></Table>
        )}
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
      {edit && <EmployeeForm emp={edit} self={edit.id === me.id} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </>
  );
}

function EmployeeForm({ emp, self, onClose, onSaved }) {
  const { t } = useTranslation();
  const isNew = !emp.id;
  const pw = z.string().min(8, t('validation.password')).regex(/[A-Za-z]/, t('validation.password')).regex(/\d/, t('validation.password'));
  const schema = z.object({ name: z.string().trim().min(2, t('validation.minChars', { count: 2 })), email: z.string().trim().email(t('validation.email')), role: z.enum(['admin', 'cashier']), password: isNew ? pw : pw.optional().or(z.literal('')) });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { name: emp.name || '', email: emp.email || '', role: emp.role || 'cashier', password: '' } });
  const [err, setErr] = useState(null);
  const submit = async (v) => {
    setErr(null);
    const body = { ...v }; if (!body.password) delete body.password;
    if (!isNew) { if (body.role === emp.role) delete body.role; }
    try { if (isNew) await api.post('/employees', body); else await api.patch(`/employees/${emp.id}`, body); toast.success(t('employees.saved')); onSaved(); } catch (e) { setErr(e); }
  };
  return (
    <Modal open onClose={onClose} title={isNew ? t('employees.add') : t('employees.edit')} size="sm" footer={<><Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button><Button loading={isSubmitting} onClick={handleSubmit(submit)}>{t('actions.save')}</Button></>}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-3">
        {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{apiMessage(t, err)}</p>}
        <Field label={t('employees.name')} error={errors.name?.message} required><input className="input" data-autofocus {...register('name')} /></Field>
        <Field label={t('auth.email')} error={errors.email?.message} required><input className="input ltr-id" dir="ltr" type="email" {...register('email')} /></Field>
        <Field label={t('employees.role')} hint={self ? t('employees.selfRole') : undefined}><select className="input" disabled={self} {...register('role')}><option value="cashier">{t('roles.cashier')}</option><option value="admin">{t('roles.admin')}</option></select></Field>
        <Field label={isNew ? t('auth.password') : t('employees.newPassword')} error={errors.password?.message} hint={t('employees.passwordHint')} required={isNew}><input className="input" dir="ltr" type="password" autoComplete="new-password" {...register('password')} /></Field>
      </form>
    </Modal>
  );
}
