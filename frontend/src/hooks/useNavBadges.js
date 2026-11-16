import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveStats } from '../contexts/LiveStatsContext';
import { useFormat } from '../contexts/SettingsContext';

/** Pure mapping from live stats to per-menu-item badges (exported for tests). */
export function buildBadges(stats, t, f) {
  if (!stats) return {};
  const out = {};
  const stock = (stats.lowStock || 0) + (stats.outOfStock || 0);
  if (stock > 0) out.inventory = { n: stock, tone: stats.outOfStock > 0 ? 'danger' : 'warn', hint: t('dock.hintInventory', { low: stats.lowStock, out: stats.outOfStock }) };
  const exp = (stats.expired || 0) + (stats.nearExpiry || 0);
  if (exp > 0) out.expiry = { n: exp, tone: stats.expired > 0 ? 'danger' : 'warn', hint: t('dock.hintExpiry', { expired: stats.expired, near: stats.nearExpiry }) };
  if (stats.owing > 0) out.customers = { n: stats.owing, tone: 'warn', hint: t('dock.hintCustomers', { amount: f.money(stats.outstanding) }) };
  if (stats.todaySales > 0) out.sales = { n: stats.todaySales, tone: 'info', hint: t('dock.hintSales', { count: stats.todaySales }) };
  return out;
}

export function useNavBadges() {
  const { stats } = useLiveStats();
  const { t } = useTranslation();
  const f = useFormat();
  return useMemo(() => buildBadges(stats, t, f), [stats, t, f]);
}
