import { ReactNode, Suspense } from 'react';
import { Route, Redirect } from 'wouter';
import { authService } from '@/lib/auth';
import { canAccessRoute, type RouteConfig } from '@/lib/routes-config';
import LoadingScreen from '@/components/ui/LoadingScreen';

interface ProtectedRouteProps {
  route: RouteConfig;
  children: ReactNode;
}

/**
 * Route protégée avec vérification RBAC
 * Redirige vers dashboard si accès non autorisé
 */
export function ProtectedRoute({ route, children }: ProtectedRouteProps) {
  const user = authService.getCurrentUser();

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (!canAccessRoute(route, user.role)) {
    // Redirection vers dashboard si accès non autorisé
    return <Redirect to="/dashboard" />;
  }

  // Lazy loading avec suspense
  return (
    <Suspense fallback={<LoadingScreen message="Chargement du module..." fullScreen={false} />}>
      {children}
    </Suspense>
  );
}

/**
 * Hook pour vérifier l'accès à une route
 */
export function useRouteAccess(moduleKey: string) {
  const user = authService.getCurrentUser();
  
  return {
    canAccess: (requiredRoles?: string[], requireAdmin?: boolean) => {
      if (!user) return false;
      
      if (requireAdmin) {
        return authService.isAdmin();
      }
      
      if (requiredRoles && requiredRoles.length > 0) {
        return requiredRoles.includes(user.role);
      }
      
      return true;
    },
    user,
  };
}
