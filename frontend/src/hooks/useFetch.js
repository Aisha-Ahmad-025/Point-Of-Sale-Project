import { useCallback, useEffect, useRef, useState } from 'react';

/** Runs `fn()` (returns a promise of {data, meta}) whenever deps change; ignores stale responses. */
export function useFetch(fn, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: enabled, error: null });
  const seq = useRef(0);
  const fnRef = useRef(fn); fnRef.current = fn;

  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    return fnRef.current().then(
      (r) => { if (id === seq.current) setState({ data: r.data, meta: r.meta || null, loading: false, error: null }); },
      (e) => { if (id === seq.current) setState((s) => ({ ...s, loading: false, error: e })); },
    );
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (enabled) run(); }, [enabled, ...deps]);
  return { ...state, reload: run };
}

export function useDebounce(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
