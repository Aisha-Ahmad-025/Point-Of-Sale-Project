import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

const LiveStatsContext = createContext({ stats: null, refresh: () => {} });

/** Light polling of the numbers shown as live badges in the navigation (stock alerts, expiry alerts, customers owing). */
export function LiveStatsProvider({ children }) {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState(null);

  const refresh = useCallback(async () => {
    try {
      if (isAdmin) {
        const { data } = await api.get('/reports/dashboard');
        setStats({ lowStock: data.lowStockCount, outOfStock: data.outOfStockCount, nearExpiry: data.nearExpiryCount, expired: data.expiredCount, owing: data.credit.customersOwing, outstanding: data.credit.outstanding, todaySales: data.today.transactions });
      } else {
        const { meta } = await api.get('/customers', { limit: 1 });
        setStats({ owing: meta.summary.customersOwing, outstanding: meta.summary.outstanding });
      }
    } catch { /* badges are a convenience: ignore failures */ }
  }, [isAdmin]);

  useEffect(() => {
    if (!user) return undefined;
    refresh();
    const id = setInterval(refresh, 120000);
    return () => clearInterval(id);
  }, [user, refresh]);

  const value = useMemo(() => ({ stats, refresh }), [stats, refresh]);
  return <LiveStatsContext.Provider value={value}>{children}</LiveStatsContext.Provider>;
}
export const useLiveStats = () => useContext(LiveStatsContext);
