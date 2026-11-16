import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { api } from '../services/api';
import { useDebounce } from '../hooks/useFetch';
import { Ltr, SearchInput } from './ui';
import { productName } from '../utils/misc';

/** Async product search-and-select (name, Urdu name, SKU or barcode). */
export default function ProductPicker({ value, onChange, placeholder, id, activeOnly = false }) {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const dq = useDebounce(q, 250);
  const box = useRef(null);

  useEffect(() => { if (!open) return; api.get('/products', { q: dq, limit: 8, status: activeOnly ? 'active' : undefined }).then((r) => setRows(r.data)).catch(() => setRows([])); }, [dq, open, activeOnly]);
  useEffect(() => { const f = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);

  if (value) {
    return (
      <div className="input flex items-center justify-between gap-2" id={id}>
        <span className="truncate">{productName(value)} <Ltr className="text-xs text-muted">{value.sku}</Ltr></span>
        <button type="button" onClick={() => onChange(null)} aria-label={t('actions.clear')}><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div ref={box} className="relative">
      <SearchInput id={id} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder || t('common.searchProduct')} role="combobox" aria-expanded={open} />
      {open && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface shadow-pop">
          {rows.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t('common.noResults')}</li>}
          {rows.map((p) => (
            <li key={p._id} role="option" aria-selected="false">
              <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-raised" onClick={() => { onChange(p); setOpen(false); setQ(''); }}>
                <span className="truncate">{productName(p)}</span><Ltr className="text-xs text-muted">{p.sku}</Ltr>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
