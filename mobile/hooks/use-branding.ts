import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/constants/query-keys';
import type { BrandingSettings } from '@/stores/settings-store';

interface TenantConfigResponse {
  name?: string;
  theme?: { primaryColor?: string; logoUrl?: string | null };
}

/**
 * Branding mobile dérivé de la configuration tenant (source unique de vérité).
 * Remplace l'ancien endpoint /api/branding (supprimé).
 */
export function useBranding() {
  return useQuery({
    queryKey: queryKeys.branding,
    queryFn: async (): Promise<BrandingSettings> => {
      const config = await api.get<TenantConfigResponse>('/api/tenant/config');
      return {
        appName: config.name || 'MicroFlex',
        primaryColor: config.theme?.primaryColor || '#047857',
        logoUrl: config.theme?.logoUrl ?? null,
        theme: 'DARK',
      };
    },
    staleTime: 5 * 60_000,
  });
}
