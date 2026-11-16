import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useFetch } from '../hooks/useFetch';
import { useFormat } from '../contexts/SettingsContext';
import { uuid, productName } from '../utils/misc';
import { Button, Field, Ltr, Modal, apiMessage } from './ui';
import ProductPicker from './ProductPicker';

function BatchSelect({ productId, value, onChange, error }) {
  const { t } = useTranslation();
  const f = useFormat();
  const batches = useFetch(() => api.get('/expiry/batches', { product: productId, limit: 100 }), [productId], { enabled: !!productId });
  return (
    <Field label={t('inventory.batch')} error={error} required>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value, batches.data?.find((b) => b._id === e.target.value))} disabled={!productId}>
        <option value="">{batches.loading ? t('common.loading') : t('common.select')}</option>
        {batches.data?.map((b) => <option key={b._id} value={b._id}>{b.lotNumber} · {f.num(b.remainingQuantity)} {b.expiryDate ? `· ${t('inventory.exp')} ${f.dateOnly(b.expiryDate)}` : ''}{b.status === 'expired' ? ` · ${t('status.expired')}` : ''}</option>)}
      </select>
    </Field>
  );
}

function useSubmit(onDone) {
  const { t } = useTranslation();
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const rid = useRef(uuid()); // same key for retries of the SAME submission => duplicates are ignored by the server
  const run = async (fn, okMsg) => {
    setErr(null); setBusy(true);
    try { const r = await fn(rid.current); toast.success(r.data?.duplicate ? t('inventory.duplicateIgnored') : t(okMsg)); onDone(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return { err, busy, run };
}

export function ReceiveModal({ product: preset, onClose, onDone }) {
  const { t } = useTranslation();
  const [product, setProduct] = useState(preset || null);
  const [v, setV] = useState({ quantity: '', costPrice: '', lotNumber: '', expiryDate: '', note: '' });
  const [errs, setErrs] = useState({});
  const { err, busy, run } = useSubmit(onDone);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const submit = () => {
    const e = {};
    if (!product) e.product = t('validation.required');
    if (!(Number(v.quantity) > 0)) e.quantity = t('validation.positive');
    if (v.costPrice !== '' && Number(v.costPrice) < 0) e.costPrice = t('validation.nonNegative');
    if (product?.trackExpiry && !v.expiryDate) e.expiryDate = t('validation.expiryRequired');
    setErrs(e); if (Object.keys(e).length) return;
    run((requestId) => api.post('/inventory/receipts', { productId: product._id, quantity: Number(v.quantity), costPrice: v.costPrice === '' ? undefined : Number(v.costPrice), lotNumber: v.lotNumber || undefined, expiryDate: product.trackExpiry ? v.expiryDate : undefined, note: v.note || undefined, requestId }), 'inventory.received');
  };
  return (
    <Modal open onClose={onClose} title={t('inventory.receive')} footer={<><Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button><Button loading={busy} onClick={submit}>{t('actions.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger sm:col-span-2">{apiMessage(t, err)}</p>}
        <Field label={t('inventory.product')} error={errs.product} required className="sm:col-span-2">{preset ? <div className="input">{productName(preset, 'en')} <Ltr className="text-xs text-muted">{preset.sku}</Ltr></div> : <ProductPicker value={product} onChange={setProduct} />}</Field>
        <Field label={t('inventory.quantity')} error={errs.quantity} required><input className="input" dir="ltr" inputMode="decimal" value={v.quantity} onChange={set('quantity')} data-autofocus /></Field>
        <Field label={t('inventory.unitCost')} error={errs.costPrice} hint={product ? t('inventory.defaultCost', { value: product.costPrice }) : undefined}><input className="input" dir="ltr" inputMode="decimal" value={v.costPrice} onChange={set('costPrice')} /></Field>
        <Field label={t('inventory.lot')} hint={t('inventory.lotHint')}><input className="input ltr-id" dir="ltr" value={v.lotNumber} onChange={set('lotNumber')} /></Field>
        {product?.trackExpiry && <Field label={t('products.expiryDate')} error={errs.expiryDate} required><input className="input" dir="ltr" type="date" value={v.expiryDate} onChange={set('expiryDate')} /></Field>}
        <Field label={t('inventory.note')} className="sm:col-span-2"><input className="input" value={v.note} onChange={set('note')} /></Field>
      </div>
    </Modal>
  );
}

export function AdjustModal({ product: preset, onClose, onDone }) {
  const { t } = useTranslation();
  const [product, setProduct] = useState(preset || null);
  const [batchId, setBatchId] = useState('');
  const [v, setV] = useState({ mode: 'delta', quantity: '', reason: '' });
  const [errs, setErrs] = useState({});
  const { err, busy, run } = useSubmit(onDone);
  const submit = () => {
    const e = {};
    if (!batchId) e.batch = t('validation.required');
    if (v.quantity === '' || Number.isNaN(Number(v.quantity))) e.quantity = t('validation.number');
    else if (v.mode === 'set' && Number(v.quantity) < 0) e.quantity = t('validation.nonNegative');
    if (v.reason.trim().length < 3) e.reason = t('validation.reasonRequired');
    setErrs(e); if (Object.keys(e).length) return;
    run((requestId) => api.post('/inventory/adjustments', { batchId, mode: v.mode, quantity: Number(v.quantity), reason: v.reason.trim(), requestId }), 'inventory.adjusted');
  };
  return (
    <Modal open onClose={onClose} title={t('inventory.adjust')} footer={<><Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button><Button loading={busy} onClick={submit}>{t('actions.save')}</Button></>}>
      <div className="space-y-3">
        {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{apiMessage(t, err)}</p>}
        <Field label={t('inventory.product')} required>{preset ? <div className="input">{preset.name} <Ltr className="text-xs text-muted">{preset.sku}</Ltr></div> : <ProductPicker value={product} onChange={(p) => { setProduct(p); setBatchId(''); }} />}</Field>
        <BatchSelect productId={product?._id} value={batchId} onChange={setBatchId} error={errs.batch} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('inventory.mode')}><select className="input" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}><option value="delta">{t('inventory.modeDelta')}</option><option value="set">{t('inventory.modeSet')}</option></select></Field>
          <Field label={v.mode === 'set' ? t('inventory.counted') : t('inventory.change')} error={errs.quantity} hint={v.mode === 'delta' ? t('inventory.changeHint') : undefined}><input className="input" dir="ltr" inputMode="decimal" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} /></Field>
        </div>
        <Field label={t('inventory.reason')} error={errs.reason} required><input className="input" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export function WastageModal({ product: preset, batch: presetBatch, onClose, onDone }) {
  const { t } = useTranslation();
  const [product, setProduct] = useState(preset || null);
  const [batchId, setBatchId] = useState(presetBatch?._id || '');
  const [batch, setBatch] = useState(presetBatch || null);
  const [v, setV] = useState({ quantity: presetBatch ? String(presetBatch.remainingQuantity) : '', reason: presetBatch?.status === 'expired' ? 'expired' : 'damaged', note: '' });
  const [errs, setErrs] = useState({});
  const { err, busy, run } = useSubmit(onDone);
  const f = useFormat();
  const submit = () => {
    const e = {};
    if (!batchId) e.batch = t('validation.required');
    if (!(Number(v.quantity) > 0)) e.quantity = t('validation.positive');
    else if (batch && Number(v.quantity) > batch.remainingQuantity) e.quantity = t('validation.exceedsStock', { count: batch.remainingQuantity });
    setErrs(e); if (Object.keys(e).length) return;
    run((requestId) => api.post('/inventory/wastage', { batchId, quantity: Number(v.quantity), reason: v.reason, note: v.note || undefined, requestId }), 'inventory.wasted');
  };
  const cost = batch && Number(v.quantity) > 0 ? Number(v.quantity) * batch.costPrice : 0;
  return (
    <Modal open onClose={onClose} title={t('expiry.recordWastage')} footer={<><Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button><Button variant="danger" loading={busy} onClick={submit}>{t('expiry.recordWastage')}</Button></>}>
      <div className="space-y-3">
        {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{apiMessage(t, err)}</p>}
        {presetBatch ? (
          <div className="rounded-xl bg-raised p-3 text-sm"><p className="font-bold">{productName(presetBatch.product, 'en')}</p><p className="text-muted"><Ltr>{presetBatch.lotNumber}</Ltr> · {t('inventory.remaining')}: {f.num(presetBatch.remainingQuantity)}</p></div>
        ) : (
          <>
            <Field label={t('inventory.product')} required>{preset ? <div className="input">{preset.name}</div> : <ProductPicker value={product} onChange={(p) => { setProduct(p); setBatchId(''); setBatch(null); }} />}</Field>
            <BatchSelect productId={product?._id} value={batchId} onChange={(id, b) => { setBatchId(id); setBatch(b || null); }} error={errs.batch} />
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('inventory.quantity')} error={errs.quantity} required><input className="input" dir="ltr" inputMode="decimal" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} data-autofocus /></Field>
          <Field label={t('inventory.reason')}><select className="input" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })}>{['expired', 'damaged', 'spoiled', 'other'].map((r) => <option key={r} value={r}>{t(`wastage.${r}`)}</option>)}</select></Field>
        </div>
        <Field label={t('inventory.note')}><input className="input" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field>
        {cost > 0 && <p className="rounded-xl bg-warn/15 p-3 text-sm font-semibold text-warn">{t('expiry.financialImpact')}: {f.money(cost)}</p>}
      </div>
    </Modal>
  );
}
