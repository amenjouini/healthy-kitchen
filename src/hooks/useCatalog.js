import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Module-level cache so the landing sections, menu and checkout share one request per resource. */
const cache = new Map();

function load(path, force) {
  if (force || !cache.has(path)) {
    const promise = api.get(path).catch((err) => { cache.delete(path); throw err; });
    cache.set(path, promise);
  }
  return cache.get(path);
}

function useCached(path, select) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    load(path, nonce > 0)
      .then((data) => { if (alive) setState({ data: select(data), error: null, loading: false }); })
      .catch((error) => { if (alive) setState({ data: null, error, loading: false }); });
    return () => { alive = false; };
    // select is a stable module-level function
  }, [path, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

const selectItems = (d) => d.items;
const selectSelf = (d) => d;

/** Customer catalogue meals (no cost data). */
export const useCatalogMeals = () => useCached('/api/catalog/meals', selectItems);
/** Build-your-own ingredients with per-100 g nutrition and portion prices. */
export const useCatalogIngredients = () => useCached('/api/catalog/ingredients', selectItems);
/** Categories, delivery zones, ordering status, bundles. */
export const useCatalogInfo = () => useCached('/api/catalog/info', selectSelf);

export function invalidateCatalog() {
  cache.clear();
}
