/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { ADMIN_AREA_PERMISSIONS, P } from '@shared/permissions';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.get('/api/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/api/auth/login', { email, password });
    setUser(r.user);
    return r.user;
  }, []);

  const signup = useCallback(async (data) => {
    const r = await api.post('/api/auth/signup', data);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(() => {
    const permissions = user?.permissions ?? [];
    const can = (p) => permissions.includes(p);
    return {
      user, ready, login, signup, logout, setUser, can,
      canAny: (list) => list.some(can),
      isStaff: Boolean(user?.isStaff),
      hasStaffArea: can(P.ORDERS_VIEW),
      hasAdminArea: ADMIN_AREA_PERMISSIONS.some(can),
    };
  }, [user, ready, login, signup, logout]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

/** Where to send a user after login. */
export function homeFor(user) {
  if (!user?.isStaff) return '/account';
  const perms = user.permissions ?? [];
  if (ADMIN_AREA_PERMISSIONS.some((p) => perms.includes(p))) return '/admin';
  if (perms.includes(P.ORDERS_VIEW)) return '/staff';
  return '/account';
}
