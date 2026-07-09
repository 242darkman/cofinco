import { ReactNode } from 'react';
import { authService } from '@/lib/auth';
import { useAbility, useAbilityContextOptional, useIsFeatureLocked } from '@/contexts/AbilityContext';
import { Action, Subject, Actions, Subjects, canAccessModule as caslCanAccessModule } from '@/lib/casl';
import { getPermissionMapping } from '@shared/ability/mappings';
import { SystemRole } from '@shared/types/roles';

interface ProtectedFeatureProps {
  // CASL ability check
  requiredAbility?: { action: Action; subject: Subject };
  requiredAnyAbility?: Array<{ action: Action; subject: Subject }>;
  requiredAllAbilities?: Array<{ action: Action; subject: Subject }>;

  // Feature lock (module lock)
  featureKey?: string;

  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Composant pour protéger l'affichage de fonctionnalités selon les permissions CASL
 *
 * @example
 * <ProtectedFeature requiredAbility={{ action: 'create', subject: 'Credit' }}>
 *   <Button>Nouveau Crédit</Button>
 * </ProtectedFeature>
 *
 * @example
 * <ProtectedFeature requiredAnyAbility={[
 *   { action: 'edit', subject: 'Credit' },
 *   { action: 'manage', subject: 'Credit' }
 * ]}>
 *   <Button>Modifier</Button>
 * </ProtectedFeature>
 *
 * @example
 * <ProtectedFeature featureKey="credits" requiredAbility={{ action: 'view', subject: 'Credit' }}>
 *   <CreditModule />
 * </ProtectedFeature>
 */
export function ProtectedFeature({
  requiredAbility,
  requiredAnyAbility,
  requiredAllAbilities,
  featureKey,
  children,
  fallback = null,
}: ProtectedFeatureProps) {
  const ability = useAbility();
  const isFeatureLocked = featureKey ? useIsFeatureLocked(featureKey) : false;
  const user = authService.getCurrentUser();

  if (!user) {
    return <>{fallback}</>;
  }

  // Check feature lock first
  if (isFeatureLocked) {
    return <>{fallback}</>;
  }

  // Single ability check
  if (requiredAbility) {
    if (!ability.can(requiredAbility.action, requiredAbility.subject)) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // Any ability check (OR)
  if (requiredAnyAbility && requiredAnyAbility.length > 0) {
    const hasAny = requiredAnyAbility.some(
      ({ action, subject }) => ability.can(action, subject)
    );
    if (!hasAny) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // All abilities check (AND)
  if (requiredAllAbilities && requiredAllAbilities.length > 0) {
    const hasAll = requiredAllAbilities.every(
      ({ action, subject }) => ability.can(action, subject)
    );
    if (!hasAll) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // No check specified — render children
  return <>{children}</>;
}

/**
 * Bridge function: converts legacy (module, action) to CASL ability.can()
 * Used internally by usePermissions() for backward compatibility with 68+ components.
 */
function hasPermissionViaCasl(
  ability: import('@/lib/casl').AppAbility,
  module: string,
  action: string
): boolean {
  // Admin bypass
  if (ability.can(Actions.MANAGE, Subjects.ALL)) return true;

  const code = `${module}.${action}`;
  const mapping = getPermissionMapping(code);
  if (!mapping) {
    if (import.meta.env.DEV) {
      console.warn(`[CASL] No mapping found for permission code: ${code}`);
    }
    return false;
  }
  return ability.can(mapping.action, mapping.subject);
}

/**
 * Hook pour vérifier les permissions via CASL
 *
 * Fournit `hasPermission(module, action)` qui bridge vers CASL en interne
 * via les mappings de `shared/ability/mappings.ts`.
 */
export function usePermissions() {
  // Subscribe to ability updates (re-renders on permission changes)
  useAbilityContextOptional();

  const user = authService.getCurrentUser();
  const ability = useAbility();

  return {
    user,
    ability,
    isAdmin: ability.can(Actions.MANAGE, Subjects.ALL),
    isAgentCaisse: authService.isAgentCaisse(),
    isManager: authService.isManager(),
    hasRole: (role: SystemRole | string) => authService.hasRole(role),
    // Bridge: legacy (module, action) → CASL
    hasPermission: (module: string, action: string) => {
      if (!user) return false;
      return hasPermissionViaCasl(ability, module, action);
    },
    canAccessModule: (module: string) => caslCanAccessModule(ability, module),
    // Direct CASL access
    can: (action: Action, subject: Subject) => ability.can(action, subject),
    cannot: (action: Action, subject: Subject) => ability.cannot(action, subject),
  };
}

/**
 * Component that renders only if user can perform action on subject
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
