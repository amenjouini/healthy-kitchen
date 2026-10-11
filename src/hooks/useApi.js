import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * Load JSON from the API.
 * @param {string|null} path null = don't load yet
 * @param {{ poll?: number }} [opts] poll: refresh interval in ms (paused while the tab is hidden)
 */
export function useApi(path, { poll } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path), path });
  const [version, setVersion] = useState(0);
  // Reset synchronously during render when the path changes (avoids stale data flashes).
  if (state.path !== path) setState({ data: null, error: null, loading: Boolean(path), path });

  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    api.get(path, { signal: controller.signal })
      .then((data) => setState((s) => (s.path === path ? { data, error: null, loading: false, path } : s)))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState((s) => (s.path === path ? { ...s, error, loading: false } : s));
      });
    return () => controller.abort();
  }, [path, version]);

  useEffect(() => {
    if (!poll || !path) return undefined;
    const id = setInterval(() => { if (document.visibilityState === 'visible') setVersion((v) => v + 1); }, poll);
    return () => clearInterval(id);
  }, [poll, path]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { data: state.data, error: state.error, loading: state.loading, reload, setData };
}
