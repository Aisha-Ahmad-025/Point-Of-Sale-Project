import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { undoToast } from '../utils/undo';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, Pencil, Plus, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useFormat } from '../contexts/SettingsContext';
import { useDebounce, useFetch } from '../hooks/useFetch';
import { productName } from '../utils/misc';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Ltr, Modal, PageHeader, Pagination, Table, TableSkeleton, THead, apiMessage, SearchInput } from '../components/ui';

const UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'dozen'];
const numOpt = (t) => z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number({ invalid_type_error: t('validation.number') }).min(0, t('validation.nonNegative')).optional());
const numReq = (t) => z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number({ required_error: t('validation.required'), invalid_type_error: t('validation.number') }).min(0, t('validation.nonNegative')));

export default function Products() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  useEffect(() => { setQ(params.get('q') || ''); }, [params]);
  useEffect(() => { if (params.get('new')) { setEdit({}); const p = new URLSearchParams(params); p.delete('new'); setParams(p, { replace: true }); } }, []); // opened from the command palette // the top-bar search navigates here with ?q=
  const [filters, setFilters] = useState({ category: '', status: 'all', stock: '', sort: 'name' });
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(null); // null | {} (new) | product
  const dq = useDebounce(q, 300);
  useEffect(() => { setPage(1); }, [dq, filters]);

  const cats = useFetch(() => api.get('/categories'), []);
  const list = useFetch(() => api.get('/products', { q: dq, ...filters, page, limit: 15 }), [dq, filters, page]);

  // Archive happens instantly and can be undone for a few seconds; restoring needs no confirmation.
  const flip = async (p) => {
    try {
      await api.patch(`/products/${p._id}/status`, { isActive: !p.isActive }); list.reload();
      if (p.isActive) undoToast(t('products.archived'), async () => { try { await api.patch(`/products/${p._id}/status`, { isActive: true }); list.reload(); } catch (e) { toast.error(apiMessage(t, e)); } }, { label: t('undo.button') });
      else toast.success(t('products.restored'));
    } catch (e) { toast.error(apiMessage(t, e)); }
  };
  const set = (k) => (e) => setFilters((s) => ({ ...s, [k]: e.target.value }));

  return (
    <>
      <PageHeader title={t('products.title')} subtitle={t('products.subtitle')} actions={<Button onClick={() => setEdit({})}><Plus className="h-4 w-4" />{t('products.add')}</Button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput className="min-w-[220px] flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('products.searchPlaceholder')} aria-label={t('products.searchPlaceholder')} />
          <select className="input !w-auto" value={filters.category} onChange={set('category')} aria-label={t('products.category')}><option value="">{t('common.allCategories')}</option>{cats.data?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
          <select className="input !w-auto" value={filters.status} onChange={set('status')} aria-label={t('common.status')}><option value="all">{t('common.allStatuses')}</option><option value="active">{t('status.active')}</option><option value="inactive">{t('status.archived')}</option></select>
          <select className="input !w-auto" value={filters.stock} onChange={set('stock')} aria-label={t('products.stock')}><option value="">{t('common.allStock')}</option><option value="in">{t('status.inStock')}</option><option value="low">{t('status.lowStock')}</option><option value="out">{t('status.outOfStock')}</option></select>
          <select className="input !w-auto" value={filters.sort} onChange={set('sort')} aria-label={t('common.sort')}><option value="name">{t('sort.nameAsc')}</option><option value="-name">{t('sort.nameDesc')}</option><option value="price">{t('sort.priceAsc')}</option><option value="-price">{t('sort.priceDesc')}</option><option value="newest">{t('sort.newest')}</option></select>
        </div>
        {list.loading && !list.data ? <TableSkeleton cols={7} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.length === 0 ? <EmptyState art="box" title={t('products.empty')} hint={t('products.emptyHint')} action={<Button onClick={() => setEdit({})}>{t('products.add')}</Button>} /> : (
          <Table>
            <THead cols={[t('products.name'), t('products.sku'), t('products.category'), t('products.price'), t('products.cost'), t('products.stock'), t('common.status'), '']} />
            <tbody>
              {list.data.map((p) => (
                <tr key={p._id} className="border-b border-line last:border-0 hover:bg-raised/40">
                  <td className="td"><p className="font-semibold">{productName(p)}</p>{p.barcode && <Ltr className="text-xs text-muted">{p.barcode}</Ltr>}</td>
                  <td className="td"><Ltr>{p.sku}</Ltr></td>
                  <td className="td">{p.category?.name}</td>
                  <td className="td tabular">{f.money(p.sellingPrice)}</td>
                  <td className="td tabular text-muted">{f.money(p.costPrice)}</td>
                  <td className="td tabular">{f.num(p.stock.sellable)} <span className="text-xs text-muted">{t(`units.${p.unit}`)}</span>{p.stock.sellable <= 0 ? <Badge tone="danger" className="ms-1">{t('status.outOfStock')}</Badge> : p.stock.sellable <= p.reorderThreshold ? <Badge tone="warn" className="ms-1">{t('status.lowStock')}</Badge> : null}</td>
                  <td className="td"><Badge tone={p.isActive ? 'ok' : 'neutral'}>{p.isActive ? t('status.active') : t('status.archived')}</Badge></td>
                  <td className="td"><div className="flex justify-end gap-1">
                    <button className="btn btn-ghost !p-1.5" onClick={() => setEdit(p)} aria-label={t('actions.edit')} title={t('actions.edit')}><Pencil className="h-4 w-4" /></button>
                    <button className="btn btn-ghost !p-1.5" onClick={() => flip(p)} aria-label={p.isActive ? t('products.archive') : t('products.restore')} title={p.isActive ? t('products.archive') : t('products.restore')}>{p.isActive ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
      {edit && <ProductForm product={edit} categories={cats.data || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </>
  );
}

function ProductForm({ product, categories, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const isNew = !product._id;
  const schema = z.object({
    name: z.string().trim().min(1, t('validation.required')).max(120),
    sku: z.string().trim().min(1, t('validation.required')).max(40), barcode: z.string().trim().max(40).optional(),
    category: z.string().min(1, t('validation.required')), unit: z.enum(UNITS),
    sellingPrice: numReq(t), costPrice: numReq(t), reorderThreshold: numOpt(t), leadTimeDays: numOpt(t), safetyStock: numOpt(t), taxRate: numOpt(t),
    trackExpiry: z.boolean(), description: z.string().max(500).optional(), openingQty: numOpt(t), openingExpiry: z.string().optional(),
  }).superRefine((v, ctx) => { if (isNew && v.trackExpiry && v.openingQty > 0 && !v.openingExpiry) ctx.addIssue({ code: 'custom', path: ['openingExpiry'], message: t('validation.expiryRequired') }); });
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: product.name || '', sku: product.sku || '', barcode: product.barcode || '', category: product.category?._id || product.category || '', unit: product.unit || 'pcs', sellingPrice: product.sellingPrice ?? '', costPrice: product.costPrice ?? '', reorderThreshold: product.reorderThreshold ?? 0, leadTimeDays: product.leadTimeDays ?? '', safetyStock: product.safetyStock ?? '', taxRate: product.taxRate ?? '', trackExpiry: product.trackExpiry || false, description: product.description || '', openingQty: '', openingExpiry: '' },
  });
  const [err, setErr] = useState(null);
  const trackExpiry = watch('trackExpiry');

  const submit = async (v) => {
    setErr(null);
    const { openingQty, openingExpiry, ...rest } = v;
    const body = { ...rest, barcode: rest.barcode || '', leadTimeDays: rest.leadTimeDays ?? null, safetyStock: rest.safetyStock ?? null, taxRate: rest.taxRate ?? null, reorderThreshold: rest.reorderThreshold ?? 0 };
    if (isNew && openingQty > 0) body.openingStock = { quantity: openingQty, expiryDate: trackExpiry ? openingExpiry : undefined };
    try { if (isNew) await api.post('/products', body); else await api.patch(`/products/${product._id}`, body); toast.success(t('products.saved')); onSaved(); }
    catch (e) { setErr(e); }
  };
  const E = (k) => errors[k]?.message;
  return (
    <Modal open onClose={onClose} size="lg" title={isNew ? t('products.add') : t('products.edit')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button><Button loading={isSubmitting} onClick={handleSubmit(submit)}>{t('actions.save')}</Button></>}>
      <form onSubmit={handleSubmit(submit)} noValidate className="grid gap-3 sm:grid-cols-2">
        {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger sm:col-span-2">{apiMessage(t, err)}</p>}
        <Field label={t('products.name')} error={E('name')} required><input className="input" data-autofocus {...register('name')} /></Field>
        <Field label={t('products.sku')} error={E('sku')} required><input className="input ltr-id uppercase" dir="ltr" {...register('sku')} /></Field>
        <Field label={t('products.barcode')} error={E('barcode')} hint={t('products.barcodeHint')}><input className="input ltr-id" dir="ltr" inputMode="numeric" {...register('barcode')} /></Field>
        <Field label={t('products.category')} error={E('category')} required><select className="input" {...register('category')}><option value="">{t('common.select')}</option>{categories.filter((c) => c.isActive || c._id === product.category?._id).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
        <Field label={t('products.unit')} error={E('unit')}><select className="input" {...register('unit')}>{UNITS.map((u) => <option key={u} value={u}>{t(`units.${u}`)}</option>)}</select></Field>
        <Field label={t('products.price')} error={E('sellingPrice')} required><input className="input" dir="ltr" inputMode="decimal" {...register('sellingPrice')} /></Field>
        <Field label={t('products.cost')} error={E('costPrice')} required><input className="input" dir="ltr" inputMode="decimal" {...register('costPrice')} /></Field>
        <Field label={t('products.reorder')} error={E('reorderThreshold')} hint={t('products.reorderHint')}><input className="input" dir="ltr" inputMode="decimal" {...register('reorderThreshold')} /></Field>
        <Field label={t('products.taxRate')} error={E('taxRate')} hint={t('products.taxHint')}><input className="input" dir="ltr" inputMode="decimal" {...register('taxRate')} /></Field>
        <Field label={t('products.leadTime')} error={E('leadTimeDays')} hint={t('products.optionalDefault')}><input className="input" dir="ltr" inputMode="decimal" {...register('leadTimeDays')} /></Field>
        <Field label={t('products.safetyStock')} error={E('safetyStock')} hint={t('products.optionalDefault')}><input className="input" dir="ltr" inputMode="decimal" {...register('safetyStock')} /></Field>
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[#D6452B]" {...register('trackExpiry')} />{t('products.trackExpiry')}</label>
        <Field label={t('products.description')} className="sm:col-span-2"><textarea className="input" rows={2} {...register('description')} /></Field>
        {isNew && (
          <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:col-span-2 sm:grid-cols-2">
            <legend className="px-1 text-xs font-bold text-muted">{t('products.openingStock')}</legend>
            <Field label={t('products.openingQty')} error={E('openingQty')}><input className="input" dir="ltr" inputMode="decimal" {...register('openingQty')} /></Field>
            {trackExpiry && <Field label={t('products.expiryDate')} error={E('openingExpiry')}><input className="input" dir="ltr" type="date" {...register('openingExpiry')} /></Field>}
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
