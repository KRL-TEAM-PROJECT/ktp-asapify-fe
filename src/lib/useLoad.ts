import { useCallback, useEffect, useState, type DependencyList } from 'react';

interface LoadState<T> { data?: T; error?: Error; loading: boolean }

/** Load data asynchronously; old data stays visible while reloading. */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<LoadState<T>>({ loading: true });
  const [n, setN] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ data: s.data, loading: true }));
    fn().then(
      (data) => { if (alive) setState({ data, loading: false }); },
      (error: Error) => { if (alive) setState({ error, loading: false }); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);

  const reload = useCallback(() => setN((x) => x + 1), []);
  return { ...state, reload };
}
