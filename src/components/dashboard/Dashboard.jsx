import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Menu as MenuIcon, X, ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLang, useT } from '@/i18n/LangContext';
import { Spinner } from '@/components/ui/Feedback';
import { cn } from '@/utils/cn';
import NotificationBell from './NotificationBell';
import { DashboardCtx } from './DashboardContext';

function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="inline-flex rounded-lg bg-moss/8 p-0.5 text-xs font-bold">
      {['fr', 'en'].map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} className={cn('min-h-8 cursor-pointer rounded-md px-2.5 uppercase', (lang === l || (l === 'fr' && lang === 'ar')) ? 'bg-forest text-linen' : 'text-olive')}>{l}</button>
      ))}
    </div>
  );
}

function NavItems({ items, onNavigate, t }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) => cn(
            'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold',
            isActive ? 'bg-forest text-linen' : 'text-olive hover:bg-moss/8',
          )}
        >
          <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="flex-1">{t(item.label)}</span>
          {item.badge ? <span className="rounded-full bg-clay px-1.5 text-[11px] text-white">{item.badge}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Back-office shell shared by the staff and admin areas.
 * Desktop: sidebar. Phone/tablet: top bar + bottom tab bar (primary items) + drawer for the rest.
 * @param {{ base: string, title: string, items: Array<{to,label,icon,end?,primary?}>, allowed: (auth) => boolean, switchTo?: {to,label} }} props
 */
export default function DashboardShell({ base, title, items, allowed, switchTo }) {
  const auth = useAuth();
  const t = useT({ dashboard: true });
  const location = useLocation();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);

  if (!auth.ready) return <Spinner className="min-h-dvh" />;
  if (!auth.user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!allowed(auth)) return <Navigate to="/dashboard" replace />;

  const primary = items.filter((i) => i.primary).slice(0, 4);
  const logout = async () => { await auth.logout(); navigate('/'); };

  const footer = (
    <div className="mt-auto flex flex-col gap-2 border-t border-sage/20 pt-3">
      {switchTo && <Link to={switchTo.to} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-moss hover:bg-moss/8"><ExternalLink className="h-4 w-4" /> {t(switchTo.label)}</Link>}
      <Link to="/" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-olive hover:bg-moss/8"><ExternalLink className="h-4 w-4" /> {t('View website')}</Link>
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{auth.user.name}</p>
          <p className="truncate text-xs text-stone">{auth.user.roleName}</p>
        </div>
        <LangToggle />
      </div>
      <button type="button" onClick={logout} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold text-clay hover:bg-clay/8"><LogOut className="h-4 w-4" /> {t('Sign out')}</button>
    </div>
  );

  return (
    <DashboardCtx.Provider value={{ base, t }}>
      <div dir="ltr" className="min-h-dvh bg-cream font-sans text-forest lg:flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 border-e border-sage/20 bg-linen/60 p-4 lg:flex">
          <Link to={base} className="flex items-center gap-2 px-2">
            <img src="/logo_png.png" alt="Healthy Kitchen" className="h-10 w-auto" />
          </Link>
          <p className="px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-stone">{t(title)}</p>
          <div className="flex-1 overflow-y-auto"><NavItems items={items} t={t} /></div>
          {footer}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-[150] flex h-16 items-center justify-between gap-3 border-b border-sage/20 bg-cream/95 px-3 backdrop-blur sm:px-5" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="flex items-center gap-2 lg:hidden">
              <button type="button" onClick={() => setDrawer(true)} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl hover:bg-moss/8" aria-label={t('Open menu')}><MenuIcon className="h-5 w-5" /></button>
              <img src="/logo_png.png" alt="Healthy Kitchen" className="h-8 w-auto" />
            </div>
            <p className="hidden text-sm text-stone lg:block">{t(title)}</p>
            <div className="flex items-center gap-1"><NotificationBell /></div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-28 pt-4 sm:px-5 sm:pt-6 lg:pb-10">
            <Outlet />
          </main>

          {/* Bottom tabs (phones & tablets) */}
          {primary.length > 0 && (
            <nav className="fixed inset-x-0 bottom-0 z-[150] grid border-t border-sage/20 bg-cream/95 backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, 1fr)`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
              {primary.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn('flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-forest' : 'text-stone')}>
                  {({ isActive }) => (
                    <>
                      <motion.span animate={{ scale: isActive ? 1.1 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}><item.icon className="h-5 w-5" /></motion.span>
                      {t(item.short ?? item.label)}
                    </>
                  )}
                </NavLink>
              ))}
              <button type="button" onClick={() => setDrawer(true)} className="flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-stone"><MenuIcon className="h-5 w-5" />{t('More')}</button>
            </nav>
          )}
        </div>

        {/* Mobile drawer */}
        <AnimatePresence>
          {drawer && (
            <div className="fixed inset-0 z-[350] lg:hidden">
              <motion.div className="absolute inset-0 bg-forest/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
              <motion.aside
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                className="absolute inset-y-0 start-0 flex w-[82%] max-w-xs flex-col gap-4 overflow-y-auto bg-cream p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
              >
                <div className="flex items-center justify-between">
                  <img src="/logo_png.png" alt="Healthy Kitchen" className="h-9 w-auto" />
                  <button type="button" onClick={() => setDrawer(false)} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl hover:bg-moss/8" aria-label={t('Close')}><X className="h-5 w-5" /></button>
                </div>
                <NavItems items={items} t={t} onNavigate={() => setDrawer(false)} />
                {footer}
              </motion.aside>
            </div>
          )}
        </AnimatePresence>
      </div>
    </DashboardCtx.Provider>
  );
}
