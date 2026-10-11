import { Route, Routes } from 'react-router-dom';
import {
  BarChart3, ChefHat, ClipboardList, LayoutDashboard, Leaf, MessageCircle, Package, ScrollText, Settings, UserCog, Users, UtensilsCrossed, Wallet,
} from 'lucide-react';
import DashboardShell from '@/components/dashboard/Dashboard';
import { useAuth } from '@/context/AuthContext';
import { P } from '@shared/permissions';
import { msg } from '@/components/domain/labels';
import OrdersPage from '@/pages/staff/OrdersPage';
import OrderDetail from '@/pages/staff/OrderDetail';
import NewOrder from '@/pages/staff/NewOrder';
import InventoryPage from '@/pages/staff/InventoryPage';
import WhatsAppInbox from '@/pages/staff/WhatsAppInbox';
import AdminOverview from './AdminOverview';
import MealsPage from './MealsPage';
import MealEditor from './MealEditor';
import IngredientsPage from './IngredientsPage';
import { CustomersList, CustomerDetail } from './CustomersPage';
import StaffPage from './StaffPage';
import FinancePage from './FinancePage';
import AnalyticsPage from './AnalyticsPage';
import SettingsPage from './SettingsPage';
import AuditPage from './AuditPage';

/** Admin area: the whole operation. Each page is also protected by the API. */
export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route index element={<AdminOverview />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="new-order" element={<NewOrder />} />
        <Route path="meals" element={<MealsPage />} />
        <Route path="meals/:id" element={<MealEditor />} />
        <Route path="ingredients" element={<IngredientsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="customers" element={<CustomersList />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="team" element={<StaffPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="whatsapp" element={<WhatsAppInbox />} />
        <Route path="whatsapp/:id" element={<WhatsAppInbox />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>
    </Routes>
  );
}

const NAV = [
  { to: '/admin', end: true, label: msg('Overview'), icon: LayoutDashboard, primary: true, any: [] },
  { to: '/admin/orders', label: msg('Orders'), icon: ClipboardList, primary: true, any: [P.ORDERS_VIEW] },
  { to: '/admin/meals', label: msg('Meals'), icon: UtensilsCrossed, primary: true, any: [P.MEALS_EDIT, P.MEALS_CREATE] },
  { to: '/admin/ingredients', label: msg('Ingredients'), icon: Leaf, any: [P.INGREDIENTS_MANAGE, P.MEALS_CREATE] },
  { to: '/admin/inventory', label: msg('Stock'), icon: Package, any: [P.INVENTORY_VIEW] },
  { to: '/admin/customers', label: msg('Customers'), icon: Users, any: [P.CUSTOMERS_VIEW] },
  { to: '/admin/finance', label: msg('Finance'), icon: Wallet, primary: true, any: [P.FINANCE_VIEW] },
  { to: '/admin/analytics', label: msg('Analytics'), icon: BarChart3, any: [P.ANALYTICS_VIEW] },
  { to: '/admin/team', label: msg('Team'), icon: UserCog, any: [P.STAFF_VIEW] },
  { to: '/admin/whatsapp', label: msg('WhatsApp'), icon: MessageCircle, any: [P.WHATSAPP_USE] },
  { to: '/admin/settings', label: msg('Settings'), icon: Settings, any: [P.SETTINGS_MANAGE, P.MEALS_EDIT] },
  { to: '/admin/audit', label: msg('Audit log'), icon: ScrollText, any: [P.AUDIT_VIEW] },
];

function AdminShell() {
  const auth = useAuth();
  const items = NAV.filter((i) => !i.any.length || auth.canAny(i.any));
  return (
    <DashboardShell
      base="/admin"
      title={msg('Administration')}
      allowed={(a) => a.hasAdminArea}
      items={items}
      switchTo={auth.hasStaffArea ? { to: '/staff', label: msg('Kitchen view'), icon: ChefHat } : undefined}
    />
  );
}
