import { Route, Routes } from 'react-router-dom';
import { ChefHat, ClipboardList, MessageCircle, Package, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import DashboardShell from '@/components/dashboard/Dashboard';
import { P } from '@shared/permissions';
import { msg } from '@/components/domain/labels';
import KitchenBoard from './KitchenBoard';
import OrdersPage from './OrdersPage';
import OrderDetail from './OrderDetail';
import NewOrder from './NewOrder';
import InventoryPage from './InventoryPage';
import WhatsAppInbox from './WhatsAppInbox';

/** Staff area: a deliberately small toolset for the kitchen floor. */
export default function StaffApp() {
  return (
    <Routes>
      <Route element={<StaffShell />}>
        <Route index element={<KitchenBoard />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="new-order" element={<NewOrder />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="whatsapp" element={<WhatsAppInbox />} />
        <Route path="whatsapp/:id" element={<WhatsAppInbox />} />
      </Route>
    </Routes>
  );
}

const NAV = [
  { to: '/staff', end: true, label: msg('Today'), icon: ChefHat, primary: true, perm: P.ORDERS_VIEW },
  { to: '/staff/orders', label: msg('Orders'), icon: ClipboardList, primary: true, perm: P.ORDERS_VIEW },
  { to: '/staff/new-order', label: msg('New order'), short: msg('New'), icon: Plus, primary: true, perm: P.ORDERS_CREATE },
  { to: '/staff/inventory', label: msg('Stock'), icon: Package, primary: true, perm: P.INVENTORY_VIEW },
  { to: '/staff/whatsapp', label: msg('WhatsApp'), icon: MessageCircle, perm: P.WHATSAPP_USE },
];

function StaffShell() {
  const auth = useAuth();
  return (
    <DashboardShell
      base="/staff"
      title={msg('Kitchen')}
      allowed={(a) => a.can(P.ORDERS_VIEW)}
      items={NAV.filter((i) => auth.can(i.perm))}
      switchTo={auth.hasAdminArea ? { to: '/admin', label: msg('Admin dashboard') } : undefined}
    />
  );
}
