import { ReactNode } from 'react';
import { authService } from '@/lib/auth';
import { usePermissionsContext, usePermissionsContextOptional } from '@/contexts/PermissionsContext';
import { useAbility, useIsFeatureLocked } from '@/contexts/AbilityContext';
import { SystemRole } from '@shared/types/roles';
import { Action, Subject } from '@/lib/casl';

interface ProtectedFeatureProps {
  // Legacy props (backwards compatible)
  requiredRoles?: SystemRole[];
  requiredPermission?: { module: string; action: string };
  requireAdmin?: boolean;

  // New CASL props (preferred)
  requiredAbility?: { action: Action; subject: Subject };
  requiredAnyAbility?: Array<{ action: Action; subject: Subject }>;
  requiredAllAbilities?: Array<{ action: Action; subject: Subject }>;

  // Feature lock (module lock)
  featureKey?: string;

  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Composant pour protéger l'affichage de fonctionnalités selon les rôles/permissions
 *
 * Supports both legacy permission checks and new CASL ability checks.
 * CASL checks take priority when provided.
 *
 * @example
 * // Using CASL (preferred)
 * <ProtectedFeature requiredAbility={{ action: 'create', subject: 'Credit' }}>
 *   <Button>Nouveau Crédit</Button>
 * </ProtectedFeature>
 *
 * @example
 * // Check multiple abilities (any)
 * <ProtectedFeature requiredAnyAbility={[
 *   { action: 'edit', subject: 'Credit' },
 *   { action: 'manage', subject: 'Credit' }
 * ]}>
 *   <Button>Modifier</Button>
 * </ProtectedFeature>
 *
 * @example
 * // Legacy: Afficher uniquement pour les admins
 * <ProtectedFeature requireAdmin>
 *   <Button>Supprimer</Button>
 * </ProtectedFeature>
 *
 * @example
 * // Legacy: Afficher pour plusieurs rôles
 * <ProtectedFeature requiredRoles={[SystemRole.ADMIN, SystemRole.GESTIONNAIRE_CREDIT]}>
 *   <Button>Créer Crédit</Button>
 * </ProtectedFeature>
 *
 * @example
 * // Legacy: Vérifier permission spécifique
 * <ProtectedFeature requiredPermission={{ module: 'credits', action: 'create' }}>
 *   <Button>Nouveau Crédit</Button>
 * </ProtectedFeature>
 *
 * @example
 * // With feature lock check
 * <ProtectedFeature featureKey="credits" requiredAbility={{ action: 'view', subject: 'Credit' }}>
 *   <CreditModule />
 * </ProtectedFeature>
 */
export function ProtectedFeature({
  requiredRoles,
  requiredPermission,
  requireAdmin,
  requiredAbility,
  requiredAnyAbility,
  requiredAllAbilities,
  featureKey,
  children,
  fallback = null,
}: ProtectedFeatureProps) {

  // Subscribe to permission updates (non-throwing)
  usePermissionsContextOptional();

  // Get CASL ability
  const ability = useAbility();

  // Check feature lock
  const isFeatureLocked = featureKey ? useIsFeatureLocked(featureKey) : false;

  const user = authService.getCurrentUser();

  if (!user) {
    return <>{fallback}</>;
  }

  // Check feature lock first
  if (isFeatureLocked) {
    return <>{fallback}</>;
  }

  // Priority 1: CASL ability checks (new system)
  if (requiredAbility) {
    if (!ability.can(requiredAbility.action, requiredAbility.subject)) {
      return <>{fallback}</>;
    }
    // Passed CASL check - render children
    return <>{children}</>;
  }

  if (requiredAnyAbility && requiredAnyAbility.length > 0) {
    const hasAny = requiredAnyAbility.some(
      ({ action, subject }) => ability.can(action, subject)
    );
    if (!hasAny) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  if (requiredAllAbilities && requiredAllAbilities.length > 0) {
    const hasAll = requiredAllAbilities.every(
      ({ action, subject }) => ability.can(action, subject)
    );
    if (!hasAll) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // Priority 2: Legacy checks (backwards compatibility)

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
  // Subscribe to permission updates (non-throwing: graceful during HMR or provider absence)
  usePermissionsContextOptional();

  const user = authService.getCurrentUser();
  const ability = useAbility();

  return {
    user,
    ability,
    isAdmin: authService.isAdmin(),
    isAgentCaisse: authService.isAgentCaisse(),
    isManager: authService.isManager(),
    hasRole: (role: SystemRole | string) => authService.hasRole(role),
    hasPermission: (module: string, action: string) =>
      authService.hasPermission(module, action),
    canAccessModule: (module: string) => authService.canAccessModule(module),
    // New CASL methods
    can: (action: Action, subject: Subject) => ability.can(action, subject),
    cannot: (action: Action, subject: Subject) => ability.cannot(action, subject),
  };
}

/**
 * Component that renders only if user can perform action on subject
 * Simpler alternative to ProtectedFeature for CASL-only checks
 */
export function Can({
  I: action,
  a: subject,
  children,
  fallback = null,
}: {
  I: Action;
  a: Subject;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const ability = useAbility();

  if (ability.can(action, subject)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * Component that renders only if user cannot perform action on subject
 */
export function Cannot({
  I: action,
  a: subject,
  children,
}: {
  I: Action;
  a: Subject;
  children: ReactNode;
}) {
  const ability = useAbility();

  if (ability.cannot(action, subject)) {
    return <>{children}</>;
  }

  return null;
}
