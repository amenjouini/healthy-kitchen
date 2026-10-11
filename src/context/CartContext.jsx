/* eslint-disable react-refresh/only-export-components */
/**
 * Cart (persisted in localStorage). Holds only ids + quantities and display snapshots;
 * prices shown are previews — the server recomputes everything when the order is placed.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CartCtx = createContext(null);
const STORAGE_KEY = 'hk_cart_v1';
const MAX_QTY = 50;

function load() {
  try {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(items) ? items.filter((i) => i && i.key && i.quantity > 0) : [];
  } catch {
    return [];
  }
}

/** Stable key: meals by id, custom bowls by their exact composition. */
export function cartKey(item) {
  if (item.mealId) return `meal:${item.mealId}`;
  return `custom:${item.custom.map((c) => `${c.ingredientId}x${c.portions}`).sort().join(',')}`;
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
  }, [items]);

  /** @param {{ mealId?: number, custom?: Array<{ingredientId:number, portions:number}>, name: object|string, unitPriceMillimes: number, kcal?: number, imageUrl?: string }} item */
  const add = useCallback((item, quantity = 1, { openCart = true } = {}) => {
    const key = cartKey(item);
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) return prev.map((i) => (i.key === key ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + quantity) } : i));
      return [...prev, { ...item, key, quantity: Math.min(MAX_QTY, quantity) }];
    });
    if (openCart) setOpen(true);
  }, []);

  const setQuantity = useCallback((key, quantity) => {
    setItems((prev) => (quantity <= 0 ? prev.filter((i) => i.key !== key) : prev.map((i) => (i.key === key ? { ...i, quantity: Math.min(MAX_QTY, quantity) } : i))));
  }, []);

  const remove = useCallback((key) => setItems((prev) => prev.filter((i) => i.key !== key)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({
    items, add, setQuantity, remove, clear, open, setOpen,
    count: items.reduce((s, i) => s + i.quantity, 0),
    subtotalMillimes: items.reduce((s, i) => s + i.unitPriceMillimes * i.quantity, 0),
  }), [items, add, setQuantity, remove, clear, open]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export const useCart = () => useContext(CartCtx);
