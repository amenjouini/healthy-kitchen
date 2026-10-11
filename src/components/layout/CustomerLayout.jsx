import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Nav, Footer, Grain } from '@/components/hero/HealthyKitchenApp';
import CartDrawer from '@/components/cart/CartDrawer';
import { useLang } from '@/i18n/LangContext';

/** Scroll to #hash targets (e.g. /#build-meal from another page) or to top on navigation. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) { window.scrollTo({ top: 0 }); return undefined; }
    // The target section may not be mounted yet right after navigation.
    let tries = 0;
    const id = setInterval(() => {
      const el = document.getElementById(hash.slice(1));
      if (el || tries++ > 20) {
        clearInterval(id);
        el?.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
    return () => clearInterval(id);
  }, [pathname, hash]);
  return null;
}

export default function CustomerLayout() {
  const { dir } = useLang();
  return (
    <div dir={dir} className="min-h-dvh overflow-x-hidden bg-cream font-sans">
      <ScrollManager />
      <Grain />
      <Nav />
      <main id="main" className="min-h-[70vh]"><Outlet /></main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
