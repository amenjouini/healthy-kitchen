import { Navigate } from 'react-router-dom';
import { useAuth, homeFor } from '@/context/AuthContext';

/** /dashboard → the right area for the signed-in user. */
export default function Dashboard() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return <Navigate to={user ? homeFor(user) : '/login?next=/dashboard'} replace />;
}
