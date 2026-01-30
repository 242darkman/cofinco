import { ReactNode, Suspense, useEffect, useState } from 'react';
import { Redirect } from 'wouter';
import { authService } from '@/lib/auth';
import { canAccessRoute, type RouteConfig } from '@/lib/routes-config';
import { SystemRole } from '@shared/types/roles';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { useSession, useIsSessionValid } from '@/contexts/SessionContext';

interface ProtectedRouteProps {
  route: RouteConfig;
  children: ReactNode;
}

/**
 * Route protégée avec vérification RBAC ET validation session serveur
 *
 * Workflow de sécurité:
 * 1. Vérifie que le contexte de session est valide (sync serveur)
 * 2. Vérifie que l'utilisateur existe en mémoire locale
 * 3. Vérifie les permissions RBAC pour la route
 * 4. Redirige vers /login si session invalide
 * 5. Redirige vers /dashboard si permissions insuffisantes
 */
export function ProtectedRoute({ route, children }: ProtectedRouteProps) {
  const sessionValid = useIsSessionValid();
  const { isChecking } = useSession();
  const user = authService.getCurrentUser();

  // Pendant la vérification initiale, afficher un loader
  if (sessionValid === null || isChecking) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingScreen message="Vérification de la session..." fullScreen={false} />
      </div>
    );
  }

  // Session invalide côté serveur → redirection login
  if (!sessionValid) {
    return <Redirect to="/login" />;
  }

  // Pas d'utilisateur en mémoire (incohérence) → redirection login
  if (!user) {
    return <Redirect to="/login" />;
  }

  // Vérification RBAC de la route
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
 * Route protégée simplifiée (sans config de route)
 * Utilisée pour les routes qui nécessitent juste une authentification
 */
interface SimpleProtectedRouteProps {
  children: ReactNode;
  /** Rôles requis pour accéder à la route */
  requiredRoles?: SystemRole[];
  /** Nécessite un rôle admin */
  requireAdmin?: boolean;
  /** Route de redirection si non autorisé */
  fallbackRoute?: string;
}

export function SimpleProtectedRoute({
  children,
  requiredRoles,
  requireAdmin,
  fallbackRoute = '/dashboard',
}: SimpleProtectedRouteProps) {
  const sessionValid = useIsSessionValid();
  const { isChecking } = useSession();
  const user = authService.getCurrentUser();

  // Pendant la vérification, afficher un loader
  if (sessionValid === null || isChecking) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingScreen message="Vérification..." fullScreen={false} />
      </div>
    );
  }

  // Session invalide → login
  if (!sessionValid || !user) {
    return <Redirect to="/login" />;
  }

  // Vérification admin
  if (requireAdmin && !authService.isAdmin()) {
    return <Redirect to={fallbackRoute} />;
  }

  // Vérification des rôles requis
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

  return {
    canAccess: (requiredRoles?: SystemRole[], requireAdmin?: boolean) => {
      // Session invalide = pas d'accès
      if (!sessionValid || !user) return false;

      if (requireAdmin) {
        return authService.isAdmin();
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
