import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const KEY = 'ss_theme';

function readStored() { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; } }
const systemTheme = () => (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStored() || systemTheme());

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  // Follow the OS only until the user makes an explicit choice.
  useEffect(() => {
    if (readStored() || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = (e) => { if (!readStored()) setThemeState(e.matches ? 'dark' : 'light'); };
    mq.addEventListener?.('change', fn);
    return () => mq.removeEventListener?.('change', fn);
  }, []);

  const setTheme = useCallback((t) => { try { localStorage.setItem(KEY, t); } catch { /* ignore */ } setThemeState(t); }, []);
  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);
  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
