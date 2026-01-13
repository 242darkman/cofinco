import { ReactNode } from 'react';
import { authService } from '@/lib/auth';
import { usePermissionsContext } from '@/contexts/PermissionsContext';

interface ProtectedFeatureProps {
  requiredRoles?: string[];
  requiredPermission?: { module: string; action: string };
  requireAdmin?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Composant pour protéger l'affichage de fonctionnalités selon les rôles/permissions
 * 
 * @example
 * // Afficher uniquement pour les admins
 * <ProtectedFeature requireAdmin>
 *   <Button>Supprimer</Button>
 * </ProtectedFeature>
 * 
 * @example
 * // Afficher pour plusieurs rôles
 * <ProtectedFeature requiredRoles={['Administrateur', 'Gestionnaire Crédit']}>
 *   <Button>Créer Crédit</Button>
 * </ProtectedFeature>
 * 
 * @example
 * // Vérifier permission spécifique
 * <ProtectedFeature requiredPermission={{ module: 'credits', action: 'create' }}>
 *   <Button>Nouveau Crédit</Button>
 * </ProtectedFeature>
 */
export function ProtectedFeature({
  requiredRoles,
  requiredPermission,
  requireAdmin,
  children,
  fallback = null,
}: ProtectedFeatureProps) {

  // Subscribe to permission updates
  usePermissionsContext(); 
  
  const user = authService.getCurrentUser();

  if (!user) {
    return <>{fallback}</>;
  }

  // Vérifier si admin requis
  if (requireAdmin && !authService.isAdmin()) {
    return <>{fallback}</>;
  }

  // Vérifier rôle spécifique
  if (requiredRoles && requiredRoles.length > 0) {
    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      return <>{fallback}</>;
    }
  }

  // Vérifier permission
  if (requiredPermission) {
    const hasPermission = authService.hasPermission(
      requiredPermission.module,
      requiredPermission.action
    );
    if (!hasPermission) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}

/**
 * Hook pour vérifier les permissions
 */

export function usePermissions() {
  // Subscribe to updates to force re-render
  usePermissionsContext();
  
  const user = authService.getCurrentUser();

  return {
    user,
    isAdmin: authService.isAdmin(),
    isAgentCaisse: authService.isAgentCaisse(),
    isManager: authService.isManager(),
    hasRole: (role: string) => authService.hasRole(role),
    hasPermission: (module: string, action: string) =>
      authService.hasPermission(module, action),
    canAccessModule: (module: string) => authService.canAccessModule(module),
  };
}
