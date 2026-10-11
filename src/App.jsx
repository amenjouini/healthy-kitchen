import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import CustomerLayout from '@/components/layout/CustomerLayout';
import HealthyKitchenApp from '@/components/hero/HealthyKitchenApp';
import Menu from '@/pages/Menu';
import Checkout from '@/pages/Checkout';
import Track from '@/pages/Track';
import Account from '@/pages/Account';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import { Spinner } from '@/components/ui/Feedback';
import { useT } from '@/i18n/LangContext';

// Back-office bundles are only downloaded by staff.
const StaffApp = lazy(() => import('@/pages/staff/StaffApp'));
const AdminApp = lazy(() => import('@/pages/admin/AdminApp'));

function NotFound() {
  const t = useT();
  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-32 text-center">
      <p className="font-serif text-7xl font-bold text-sage">404</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold">{t('Page not found')}</h1>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-forest px-5 text-sm font-semibold text-linen">{t('Back to home')}</Link>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Spinner className="min-h-dvh" />}>
      <Routes>
        <Route element={<CustomerLayout />}>
          <Route index element={<HealthyKitchenApp />} />
          <Route path="menu" element={<Menu />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="track/:number" element={<Track />} />
          <Route path="account" element={<Account />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Login />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="staff/*" element={<StaffApp />} />
        <Route path="admin/*" element={<AdminApp />} />
      </Routes>
    </Suspense>
  );
}
