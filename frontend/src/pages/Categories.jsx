import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useFetch } from '../hooks/useFetch';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Table, TableSkeleton, THead, apiMessage } from '../components/ui';

export default function Categories() {
  const { t } = useTranslation();
  const list = useFetch(() => api.get('/categories'), []);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [delErr, setDelErr] = useState(null);

  const remove = async () => {
    setBusy(true); setDelErr(null);
    try { await api.del(`/categories/${del._id}`); toast.success(t('categories.deleted')); setDel(null); list.reload(); }
    catch (e) { setDelErr(e); } finally { setBusy(false); }
  };
  const toggleActive = async (c) => { try { await api.patch(`/categories/${c._id}`, { isActive: !c.isActive }); list.reload(); } catch (e) { toast.error(apiMessage(t, e)); } };

  return (
    <>
      <PageHeader title={t('categories.title')} subtitle={t('categories.subtitle')} actions={<Button onClick={() => setEdit({})}><Plus className="h-4 w-4" />{t('categories.add')}</Button>} />
      <Card>
        {list.loading && !list.data ? <TableSkeleton cols={5} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.length === 0 ? <EmptyState art="box" title={t('categories.empty')} action={<Button onClick={() => setEdit({})}>{t('categories.add')}</Button>} /> : (
          <Table>
            <THead cols={[t('categories.name'), t('categories.products'), t('common.status'), '']} />
            <tbody>
              {list.data.map((c) => (
                <tr key={c._id} className="border-b border-line last:border-0">
                  <td className="td font-semibold">{c.name}</td>
                  <td className="td tabular">{c.productCount}</td>
                  <td className="td"><button onClick={() => toggleActive(c)} aria-label={t('categories.toggle')}><Badge tone={c.isActive ? 'ok' : 'neutral'}>{c.isActive ? t('status.active') : t('status.inactive')}</Badge></button></td>
                  <td className="td"><div className="flex justify-end gap-1">
                    <button className="btn btn-ghost !p-1.5" onClick={() => setEdit(c)} aria-label={t('actions.edit')}><Pencil className="h-4 w-4" /></button>
                    <button className="btn btn-ghost !p-1.5 text-danger" onClick={() => { setDelErr(null); setDel(c); }} aria-label={t('actions.delete')}><Trash2 className="h-4 w-4" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {edit && <CategoryForm cat={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
      <ConfirmDialog open={!!del} danger loading={busy} onClose={() => setDel(null)} onConfirm={remove} title={t('categories.delete')} message={t('categories.deleteMsg', { name: del?.name })} confirmLabel={t('actions.delete')}>
        {delErr && <p role="alert" className="rounded-xl bg-danger/10 p-2.5 text-danger">{apiMessage(t, delErr)}</p>}
      </ConfirmDialog>
    </>
  );
}

function CategoryForm({ cat, onClose, onSaved }) {
  const { t } = useTranslation();
  const isNew = !cat._id;
  const schema = z.object({ name: z.string().trim().min(1, t('validation.required')).max(60), description: z.string().trim().max(300).optional() });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { name: cat.name || '', description: cat.description || '' } });
  const [err, setErr] = useState(null);
  const submit = async (v) => { setErr(null); try { if (isNew) await api.post('/categories', v); else await api.patch(`/categories/${cat._id}`, v); toast.success(t('categories.saved')); onSaved(); } catch (e) { setErr(e); } };
  return (
    <Modal open onClose={onClose} title={isNew ? t('categories.add') : t('categories.edit')} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button><Button loading={isSubmitting} onClick={handleSubmit(submit)}>{t('actions.save')}</Button></>}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-3">
        {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{apiMessage(t, err)}</p>}
        <Field label={t('categories.name')} error={errors.name?.message} required><input className="input" data-autofocus {...register('name')} /></Field>
        <Field label={t('products.description')}><textarea className="input" rows={2} {...register('description')} /></Field>
      </form>
    </Modal>
  );
}
