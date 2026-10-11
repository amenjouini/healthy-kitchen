import { createContext, useContext } from 'react';

/** Back-office context: base path ('/staff' | '/admin') and the dashboard translator. */
export const DashboardCtx = createContext({ base: '/staff', t: (s) => s });
export const useDash = () => useContext(DashboardCtx);
