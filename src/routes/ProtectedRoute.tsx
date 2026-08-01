import { Navigate, Outlet } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { useAuth } from '@/hooks/useAuth';

/**
 * Route gate.
 *
 * Authentication is currently bypassed, so this passes straight through. The
 * component stays in the tree deliberately: restoring the gate is a matter of
 * this file alone, with no change to the route table.
 */
export const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return <Navigate to={PATHS.branding} replace />;

  return <Outlet />;
};
