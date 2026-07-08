import { ReactNode, Suspense, useMemo } from 'react';
import { Redirect, useLocation } from 'wouter';
import { authService } from '@/lib/auth';
import { buildLoginUrl } from '@/lib/navigation';
import { canAccessRoute, isRouteEnabledForTenant, type RouteConfig } from '@/lib/routes-config';
import { SystemRole } from '@shared/types/roles';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { useSession, useIsSessionValid } from '@/contexts/SessionContext';
import { useIsAdmin, useAbility } from '@/contexts/AbilityContext';
import { useTenant } from '@/contexts/TenantContext';

interface ProtectedRouteProps {
  route: RouteConfig;
  children: ReactNode;
}

/**
 * Route protégée avec vérification RBAC ET validation session serveur
 */
export function ProtectedRoute({ route, children }: ProtectedRouteProps) {
  const sessionValid = useIsSessionValid();
  const { isChecking } = useSession();
  const user = authService.getCurrentUser();
  const ability = useAbility();
  const [location] = useLocation();
  const loginUrl = useMemo(() => buildLoginUrl(location), [location]);
  const { config: tenantConfig } = useTenant();

  if (sessionValid === null || isChecking) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingScreen message="Vérification de la session..." fullScreen={false} />
      </div>
    );
  }

  if (!sessionValid) {
    return <Redirect to={loginUrl} replace />;
  }

  if (!user) {
    return <Redirect to={loginUrl} replace />;
  }

  if (!isRouteEnabledForTenant(route, tenantConfig.features) || !canAccessRoute(route, ability)) {
    return <Redirect to="/" replace />;
  }

  return (
    <Suspense fallback={<LoadingScreen message="Chargement du module..." fullScreen={false} />}>
      {children}
    </Suspense>
  );
}

/**
 * Route protégée simplifiée (sans config de route)
 */
interface SimpleProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: SystemRole[];
  requireAdmin?: boolean;
  fallbackRoute?: string;
}

export function SimpleProtectedRoute({
  children,
  requiredRoles,
  requireAdmin,
  fallbackRoute = '/',
}: SimpleProtectedRouteProps) {
  const sessionValid = useIsSessionValid();
  const { isChecking } = useSession();
  const user = authService.getCurrentUser();
  const isAdmin = useIsAdmin();
  const [location] = useLocation();
  const loginUrl = useMemo(() => buildLoginUrl(location), [location]);

  if (sessionValid === null || isChecking) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingScreen message="Vérification..." fullScreen={false} />
      </div>
    );
  }

  if (!sessionValid || !user) {
    return <Redirect to={loginUrl} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Redirect to={fallbackRoute} />;
  }

  if (requiredRoles && requiredRoles.length > 0) {
    if (!requiredRoles.includes(user.role)) {
      return <Redirect to={fallbackRoute} />;
    }
  }

  return <Suspense fallback={<LoadingScreen message="Chargement..." fullScreen={false} />}>{children}</Suspense>;
}

/**
 * Hook pour vérifier l'accès à une route
 */
export function useRouteAccess(moduleKey: string) {
  const sessionValid = useIsSessionValid();
  const user = authService.getCurrentUser();
  const isAdmin = useIsAdmin();

  return {
    canAccess: (requiredRoles?: SystemRole[], requireAdminAccess?: boolean) => {
      if (!sessionValid || !user) return false;

      if (requireAdminAccess) {
        return isAdmin;
      }

      if (requiredRoles && requiredRoles.length > 0) {
        return requiredRoles.includes(user.role);
      }

      return true;
    },
    user,
    isSessionValid: sessionValid,
  };
}

/**
 * HOC pour protéger un composant avec vérification de session
 */
export function withSessionGuard<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: { requireAdmin?: boolean; requiredRoles?: SystemRole[] }
) {
  return function SessionGuardedComponent(props: P) {
    return (
      <SimpleProtectedRoute
        requireAdmin={options?.requireAdmin}
        requiredRoles={options?.requiredRoles}
      >
        <WrappedComponent {...props} />
      </SimpleProtectedRoute>
    );
  };
}

export default ProtectedRoute;
