import React, { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  defaultTenantConfig,
  tenantConfigSchema,
  type TenantConfig,
  type TenantFeatureKey,
} from '@shared/tenant-config';
import { applyTenantTheme } from '@/lib/tenant-theme';
import { Spinner } from '@/components/ui/Spinner';

interface TenantContextType {
  config: TenantConfig;
  isLoading: boolean;
  error: Error | null;
}

const TenantContext = createContext<TenantContextType>({
  config: defaultTenantConfig,
  isLoading: true,
  error: null,
});

function applyTenantBranding(config: TenantConfig) {
  // Charte graphique dérivée du branding (palette :root + .dark)
  applyTenantTheme(config);

  // Titre de l'onglet au nom du tenant
  if (config.name) {
    document.title = config.name;
  }

  // Favicon dynamique
  if (config.theme.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = config.theme.faviconUrl;
  }

  // Couleur de thème (barre navigateur / splash mobile) alignée sur la marque.
  if (config.theme.primaryColor) {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = config.theme.primaryColor;
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { data: config, isLoading, error } = useQuery({
    queryKey: ['/api/tenant/config'],
    queryFn: async () => {
      const res = await fetch('/api/tenant/config');
      if (!res.ok) throw new Error('Failed to fetch tenant config');
      return tenantConfigSchema.parse(await res.json());
    },
    // Branding et flags sont surchargeables à chaud en base (cache serveur 30 s) :
    // on rafraîchit régulièrement pour propager sans rechargement complet.
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    // Toujours re-valider au montage (le QueryClient global est en
    // refetchOnMount: false). Pas d'`initialData` : on ne veut PAS peindre la
    // marque MicroFlex par défaut avant l'arrivée de la vraie config — ça
    // provoquait un flash de branding peu professionnel. Tant que la config
    // réelle n'est pas là, on affiche un écran de bootstrap neutre (ci-dessous).
    refetchOnMount: 'always',
  });

  // Config à appliquer : la vraie config du réseau, ou — uniquement si le
  // réseau/serveur est injoignable — un repli par défaut pour ne pas rester
  // bloqué. Dans le cas nominal, on n'applique jamais de marque avant la vraie.
  const activeConfig: TenantConfig | undefined = config ?? (error ? defaultTenantConfig : undefined);

  // On applique la charte (CSS, titre, favicon, theme-color) seulement quand une
  // config est réellement disponible — jamais pendant le bootstrap neutre.
  React.useEffect(() => {
    if (activeConfig) {
      applyTenantBranding(activeConfig);
    }
  }, [activeConfig]);

  // Bootstrap : pas encore de config (et pas d'erreur) → écran neutre, sans
  // marque, le temps du premier fetch. Évite tout flash d'un branding tiers.
  if (!activeConfig) {
    return <TenantBootstrapScreen />;
  }

  return (
    <TenantContext.Provider value={{ config: activeConfig, isLoading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

/**
 * Écran d'amorçage neutre affiché tant que l'identité du tenant n'est pas
 * chargée. Volontairement sans logo, sans nom et sans couleur de marque, mais
 * utilisant le MÊME `Spinner` premium que le reste de l'application (en ton
 * blanc neutre) pour une expérience de chargement cohérente partout.
 */
function TenantBootstrapScreen() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B0F19',
      }}
    >
      <Spinner size="xl" tone="onAccent" />
    </div>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}

export function useTenantFeature(feature: TenantFeatureKey): boolean {
  return useTenant().config.features[feature] === true;
}
