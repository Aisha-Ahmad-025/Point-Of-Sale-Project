export const localeFor = (lang) => (lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK'); // Latin digits keep SKUs/barcodes/prices consistent

export function formatMoney(value, lang = 'en', currency = 'PKR') {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(localeFor(lang), { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch { return `${currency} ${n.toFixed(2)}`; }
}
export const formatNumber = (value, lang = 'en', max = 3) => new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits: max }).format(Number(value ?? 0));
export const formatPercent = (value, lang = 'en') => (value === null || value === undefined ? '—' : `${formatNumber(value, lang, 1)}%`);

export function formatDate(value, lang = 'en', timeZone) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(localeFor(lang), { year: 'numeric', month: 'short', day: 'numeric', ...(timeZone ? { timeZone } : {}) }).format(new Date(value));
}
export function formatDateTime(value, lang = 'en', timeZone) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(localeFor(lang), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(new Date(value));
}
/** Date-only values (expiry) are stored as UTC midnight: always render them in UTC so they never shift a day. */
export const formatDateOnly = (value, lang = 'en') => formatDate(value, lang, 'UTC');
export const toYmd = (d) => new Date(d).toISOString().slice(0, 10);
