import { Children, cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Art from './illustrations';
import { Sparkline, Trend } from './motion';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, Search, X } from 'lucide-react';

export const cx = (...a) => a.filter(Boolean).join(' ');

/** Translate an API error by its code, falling back to the server message. */
export const apiMessage = (t, e) => (e ? t(`errors.${e.code}`, { defaultValue: e.message || t('errors.UNKNOWN'), ...(e.details && !Array.isArray(e.details) ? e.details : {}) }) : '');

export function Button({ variant = 'primary', size, loading, className, children, ...rest }) {
  return (
    <button type="button" className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)} disabled={loading || rest.disabled} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Search box with the icon inset on the left and a clear (x) button. Accepts every normal <input> prop. */
export function SearchInput({ className, inputRef, value, onChange, ...rest }) {
  const { t } = useTranslation();
  const own = useRef(null);
  const ref = inputRef || own;
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input ref={ref} type="text" inputMode="search" enterKeyHint="search" autoComplete="off" spellCheck={false} className="input ps-10 pe-9" value={value} onChange={onChange} {...rest} />
      {value ? <button type="button" onClick={() => { onChange({ target: { value: '' } }); ref.current?.focus(); }} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted transition hover:bg-raised hover:text-ink" aria-label={t('actions.clear')}><X className="h-3.5 w-3.5" /></button> : null}
    </div>
  );
}

export const Spinner = ({ className }) => <Loader2 className={cx('h-5 w-5 animate-spin text-accent', className)} role="status" aria-label="loading" />;
export const Skeleton = ({ className }) => <div className={cx('skeleton', className)} aria-hidden="true" />;
export const Ltr = ({ children, className }) => <bdi dir="ltr" className={cx('ltr-id', className)}>{children}</bdi>;
export const Card = ({ className, children, ...r }) => <div className={cx('card', className)} {...r}>{children}</div>;

const TONES = { neutral: 'bg-raised text-muted ring-line', ok: 'bg-ok/10 text-ok ring-ok/25', warn: 'bg-warn/10 text-warn ring-warn/30', danger: 'bg-danger/10 text-danger ring-danger/25', info: 'bg-info/10 text-info ring-info/25', brand: 'bg-brand/30 text-forest ring-brand-deep/40' };
export const Badge = ({ tone = 'neutral', children, className }) => <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', TONES[tone], className)}>{children}</span>;

export function Field({ label, error, hint, required, children, className }) {
  const id = useId();
  const addControlProps = (node) => {
    if (!isValidElement(node)) return node;
    const tag = typeof node.type === 'string' ? node.type.toLowerCase() : '';
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      return cloneElement(node, {
        id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': error ? `${id}-e` : hint ? `${id}-h` : undefined,
      });
    }
    const nested = Children.toArray(node.props?.children).filter((child) => child !== null && child !== undefined && child !== false);
    if (!nested.length) return node;
    const remapped = nested.map((child) => addControlProps(child));
    return cloneElement(node, { children: remapped });
  };
  const content = Children.toArray(children).filter((child) => child !== null && child !== undefined && child !== false).map((child) => addControlProps(child));
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-muted">{label}{required && <span className="text-danger"> *</span>}</label>
      {content}
      {error ? <p id={`${id}-e`} role="alert" className="mt-1 text-xs text-danger">{error}</p> : hint ? <p id={`${id}-h`} className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const modalStack = []; // nested dialogs: only the top-most one handles Escape/Tab

export function Modal({ open, title, onClose, children, footer, size = 'md', dismissible = true }) {
  const ref = useRef(null);
  const labelId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const root = ref.current;
    const me = Symbol('modal'); modalStack.push(me);
    const focusables = () => root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
    (root.querySelector('[data-autofocus]') || focusables()[0] || root).focus();
    const onKey = (e) => {
      if (modalStack[modalStack.length - 1] !== me) return;
      if (e.key === 'Escape' && dismissible) { e.stopPropagation(); onClose?.(); }
      if (e.key === 'Tab') {
        const f = [...focusables()]; if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); const i = modalStack.indexOf(me); if (i >= 0) modalStack.splice(i, 1); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open, onClose, dismissible]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose?.(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1} className={cx('modal-in flex max-h-[92vh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-pop outline-none sm:rounded-3xl', widths[size])}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 no-print">
          <h2 id={labelId} className="text-base font-bold">{title}</h2>
          {dismissible && <button type="button" onClick={onClose} className="btn btn-ghost !p-1.5" aria-label="Close"><X className="h-4 w-4" /></button>}
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 no-print">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, loading, onConfirm, onClose, children }) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm} data-autofocus>{confirmLabel || t('actions.confirm')}</Button></>}>
      <div className="flex gap-3">
        {danger && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />}
        <div className="space-y-3 text-sm">{message && <p>{message}</p>}{children}</div>
      </div>
    </Modal>
  );
}

export function EmptyState({ title, hint, action, art = 'box' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <Art name={art} />
      <p className="mt-1 text-base font-extrabold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-danger" aria-hidden="true" />
      <p className="text-sm">{apiMessage(t, error)}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{t('actions.retry')}</Button>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>{Array.from({ length: cols }, (_, j) => <Skeleton key={j} className="h-6" />)}</div>)}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  const { t } = useTranslation();
  if (!meta || meta.pages <= 1) return meta ? <p className="px-4 py-3 text-xs text-muted">{t('table.total', { count: meta.total })}</p> : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm">
      <span className="text-xs text-muted">{t('table.total', { count: meta.total })} · {t('table.pageOf', { page: meta.page, pages: meta.pages })}</span>
      <div className="flex gap-1">
        <button className="btn btn-secondary btn-sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label={t('table.prev')}><ChevronLeft className="h-4 w-4" /></button>
        <button className="btn btn-secondary btn-sm" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)} aria-label={t('table.next')}><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'brand', to, spark, trend }) {
  const tones = { brand: 'icon-brand', ok: 'bg-ok/15 text-ok', warn: 'bg-warn/15 text-warn', danger: 'bg-danger/15 text-danger', info: 'bg-info/15 text-info' };
  const inner = (
    <>
      <span className="pointer-events-none absolute -end-6 -top-6 h-24 w-24 rounded-full bg-brand/15 blur-2xl" aria-hidden="true" />
      {Icon && <span className={cx('icon-tile h-11 w-11 shrink-0', tones[tone])}><Icon className="h-5 w-5" aria-hidden="true" /></span>}
      <div className="relative min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
        <p className="tabular truncate text-[22px] font-extrabold leading-tight">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
        {trend}
      </div>
      {spark && spark.length > 1 && <Sparkline data={spark} className="absolute bottom-3 end-3 opacity-90" />}
    </>
  );
  const cls = 'card card-hover relative flex items-start gap-3 overflow-hidden p-4';
  return to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 shadow-sm">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" aria-selected={value === tab.id} onClick={() => onChange(tab.id)}
          className={cx('whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all', value === tab.id ? 'bg-forest text-white shadow-sm' : 'text-muted hover:bg-raised hover:text-ink')}>{tab.label}</button>
      ))}
    </div>
  );
}

export function Tooltip({ text, children }) {
  return <span className="group relative inline-flex">{children}<span role="tooltip" className="pointer-events-none absolute -top-8 start-1/2 z-40 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-forest px-2 py-1 text-xs text-white shadow-pop group-hover:block group-focus-within:block">{text}</span></span>;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-[26px] font-extrabold tracking-tight">{title}</h1>{subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export const Table = ({ children }) => <div className="max-h-[calc(100vh-14rem)] min-h-[160px] overflow-auto"><table className="w-full min-w-[640px] border-collapse [&_tbody_tr:hover]:bg-raised/50 [&_tbody_tr]:border-b [&_tbody_tr]:border-line/70">{children}</table></div>;
export const THead = ({ cols }) => <thead><tr className="border-b border-line bg-raised/60">{cols.map((c, i) => <th key={i} scope="col" className="th sticky-th bg-raised">{c}</th>)}</tr></thead>;
