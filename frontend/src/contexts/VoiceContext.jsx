import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const VoiceContext = createContext({ open: false, toggle: () => {}, close: () => {}, openPanel: () => {} });

/** Open/close state of the voice assistant panel, plus the Alt+V shortcut. */
export function VoiceProvider({ children }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  const openPanel = useCallback(() => setOpen(true), []);
  useEffect(() => {
    const k = (e) => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'v') { e.preventDefault(); setOpen((o) => !o); } };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, []);
  const value = useMemo(() => ({ open, toggle, close, openPanel }), [open, toggle, close, openPanel]);
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
export const useVoice = () => useContext(VoiceContext);
