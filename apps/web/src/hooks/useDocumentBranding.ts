import { defaultTenantConfig } from '@shared/tenant-config';
import { useTenantBranding } from '@/components/branding/TenantLogo';
import { useCompanyInfo, type CompanyInfo } from './useCompanyInfo';

export interface DocumentBranding {
  appName: string;
  logoUrl: string | null;
  companyInfo: CompanyInfo | null;
}

/**
 * Identité documentaire (barre latérale, écran de connexion, reçus, rapports,
 * PDF, notifications). Le nom et le logo proviennent de la configuration tenant
 * (source unique de vérité), les informations société de /api/company-info.
 *
 * Remplace l'ancien `useBranding()` (BrandingContext supprimé), sans exposer de
 * couleur : la charte graphique est dérivée des couleurs du tenant par
 * `tenant-theme.ts`.
 */
export function useDocumentBranding(): DocumentBranding {
  const { name, logoUrl } = useTenantBranding();
  const companyInfo = useCompanyInfo();
  return {
    appName: name || defaultTenantConfig.name,
    logoUrl: logoUrl ?? defaultTenantConfig.theme.logoUrl ?? null,
    companyInfo,
  };
}
