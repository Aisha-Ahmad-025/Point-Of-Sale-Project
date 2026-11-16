import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setCsrfToken, setUnauthorizedHandler } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(() => { setCsrfToken(null); setUser(null); }, []);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    api.get('/auth/me').then(({ data }) => { setCsrfToken(data.csrfToken); setUser(data.user); }).catch(() => clear()).finally(() => setLoading(false));
  }, [clear]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setCsrfToken(data.csrfToken); setUser(data.user); return data.user;
  }, []);
  const logout = useCallback(async () => { try { await api.post('/auth/logout'); } finally { clear(); } }, [clear]);

  const value = useMemo(() => ({ user, loading, login, logout, isAdmin: user?.role === 'admin' }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
