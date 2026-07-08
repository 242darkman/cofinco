import React, { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  defaultTenantConfig,
  tenantConfigSchema,
  type TenantConfig,
  type TenantFeatureKey,
} from '@shared/tenant-config';

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

/**
 * Compute a derived color (lighter or darker) for hover states.
 */
function adjustColor(hex: string | undefined, amount: number): string | undefined {
  if (!hex || !hex.startsWith('#')) return undefined; // Simplistic approach: only hex
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const nr = clamp(r + amount);
    const ng = clamp(g + amount);
    const nb = clamp(b + amount);

    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
  } catch (e) {
    return hex;
  }
}

function applyTenantTheme(config: TenantConfig) {
  const root = document.documentElement;
  
  if (config.theme.primaryColor) {
    // We expect primaryColor to be a valid CSS value (HSL, RGB or Hex)
    root.style.setProperty('--accent-primary', config.theme.primaryColor);
    
    // Attempt hover color if hex
    const hoverColor = adjustColor(config.theme.primaryColor, -20);
    if (hoverColor) {
      root.style.setProperty('--accent-primary-hover', hoverColor);
    }
  }
  
  if (config.theme.secondaryColor) {
    root.style.setProperty('--accent-secondary', config.theme.secondaryColor);
  }

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
    initialData: defaultTenantConfig,
    initialDataUpdatedAt: 0,
  });

  // Apply CSS variables whenever config changes
  React.useEffect(() => {
    if (config) {
      applyTenantTheme(config);
    }
  }, [config]);

  return (
    <TenantContext.Provider value={{ config: config || defaultTenantConfig, isLoading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}

export function useTenantFeature(feature: TenantFeatureKey): boolean {
  return useTenant().config.features[feature] === true;
}
