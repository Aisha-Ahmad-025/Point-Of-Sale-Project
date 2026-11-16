import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { formatMoney, formatNumber, formatDate, formatDateTime, formatDateOnly, formatPercent } from '../utils/format';

const SettingsContext = createContext(null);
const FALLBACK = { storeName: 'SwiftShelf Mini Mart', currency: 'PKR', timezone: 'Asia/Karachi', taxRate: 0, cashierMaxDiscountPercent: 5, nearExpiryDays: 7 };

export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(FALLBACK);
  const refresh = useCallback(() => api.get('/settings').then(({ data }) => setSettings({ ...FALLBACK, ...data })).catch(() => {}), []);
  useEffect(() => { if (user) refresh(); }, [user, refresh]);
  const value = useMemo(() => ({ settings, refresh }), [settings, refresh]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
export const useSettings = () => useContext(SettingsContext);

/** Locale-aware formatters bound to the active language, currency and store timezone. */
export function useFormat() {
  const { settings } = useSettings();
  const lang = 'en'; const tz = settings.timezone;
  return useMemo(() => ({
    lang,
    money: (v) => formatMoney(v, lang, settings.currency),
    num: (v, max) => formatNumber(v, lang, max),
    pct: (v) => formatPercent(v, lang),
    date: (v) => formatDate(v, lang, tz),
    dateTime: (v) => formatDateTime(v, lang, tz),
    dateOnly: (v) => formatDateOnly(v, lang),
  }), [lang, tz, settings.currency]);
}
