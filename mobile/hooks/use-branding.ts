import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/constants/query-keys';
import type { BrandingSettings } from '@/stores/settings-store';

export function useBranding() {
  return useQuery({
    queryKey: queryKeys.branding,
    queryFn: () => api.get<BrandingSettings>('/api/branding'),
    staleTime: 5 * 60_000,
  });
}
