import React, { Suspense } from 'react';
import { ROUTES, canAccessRoute, isRouteEnabledForTenant, getRouteByKey, type RouteConfig } from '@/lib/routes-config';
import { authService } from '@/lib/auth';
import { SystemRole, getRoleLabel } from '@shared/types/roles';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { useAbility } from '@/contexts/AbilityContext';
import { useTenant } from '@/contexts/TenantContext';

interface AppRouterProps {
  currentModule: string;
  currentSubModule?: string;
  userRole: SystemRole | string;
  onAccessDenied?: () => void;
  componentProps?: Record<string, any>;
}

/**
 * Router centralisé avec support RBAC et sous-routes
 * Remplace le switch/case dans MicroflexPlatform
 */
export default function AppRouter({
  currentModule,
  currentSubModule,
  userRole,
  onAccessDenied,
  componentProps = {},
}: AppRouterProps) {
  const ability = useAbility();
  const { config: tenantConfig } = useTenant();

  // Trouver la route principale
  const route = ROUTES.find(r => r.key === currentModule);

  if (!route) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Module non trouvé</h2>
        <p className="text-content-muted">Le module "{currentModule}" n'existe pas.</p>
      </div>
    );
  }

  // Vérifier l'accès RBAC via CASL
  if (!isRouteEnabledForTenant(route, tenantConfig.features) || !canAccessRoute(route, ability)) {
    if (onAccessDenied) {
      onAccessDenied();
    }
    return (
      <div className="text-center py-20">
        <div className="bg-status-danger-bg border border-status-danger/30 rounded-lg p-6 max-w-md mx-auto">
          <h2 className="text-xl font-bold text-status-danger mb-2">Accès Refusé</h2>
          <p className="text-content-muted">
            Vous n'avez pas les permissions nécessaires pour accéder à ce module.
          </p>
          <p className="text-sm text-content-muted mt-2">
            Rôle requis : {route.requiredRoles?.map(getRoleLabel).join(', ') || getRoleLabel(SystemRole.ADMIN)}
          </p>
        </div>
      </div>
    );
  }

  // Résoudre le composant (sous-route ou route principale)
  let ComponentToRender = route.component;
  let activeRoute: RouteConfig = route;

  if (currentSubModule && route.children) {
    const childRoute = route.children.find(c => c.key === currentSubModule);
    if (childRoute && childRoute.component) {
      if (canAccessRoute(childRoute, ability)) {
        ComponentToRender = childRoute.component;
        activeRoute = childRoute;
      }
    }
  }

  // Fallback si pas de composant
  if (!ComponentToRender) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Module en développement</h2>
        <p className="text-content-muted">
          Cette fonctionnalité ({activeRoute.label}) sera disponible prochainement.
        </p>
      </div>
    );
  }

  // Rendre le composant avec Suspense pour lazy loading
  return (
    <Suspense fallback={<LoadingScreen message="Chargement du module..." fullScreen={false} />}>
      <ComponentToRender {...componentProps} userRole={userRole} />
    </Suspense>
  );
}

/**
 * Hook pour gérer la navigation avec sous-routes
 */
export function useModuleNavigation(initialModule = 'dashboard') {
  const [currentModule, setCurrentModule] = React.useState(initialModule);
  const [currentSubModule, setCurrentSubModule] = React.useState<string | undefined>();
  const [moduleHistory, setModuleHistory] = React.useState<string[]>([initialModule]);

  const navigateTo = React.useCallback((moduleKey: string, subModuleKey?: string) => {
    setCurrentModule(moduleKey);
    setCurrentSubModule(subModuleKey);
    setModuleHistory(prev => [...prev.slice(-9), moduleKey]);
  }, []);

  const goBack = React.useCallback(() => {
    if (moduleHistory.length > 1) {
      const newHistory = [...moduleHistory];
      newHistory.pop();
      const previousModule = newHistory[newHistory.length - 1];
      setCurrentModule(previousModule);
      setCurrentSubModule(undefined);
      setModuleHistory(newHistory);
    }
  }, [moduleHistory]);

  const getCurrentRoute = React.useCallback(() => {
    return getRouteByKey(currentSubModule || currentModule);
  }, [currentModule, currentSubModule]);

  return {
    currentModule,
    currentSubModule,
    navigateTo,
    goBack,
    getCurrentRoute,
    canGoBack: moduleHistory.length > 1,
  };
}
