import { useTenant } from '@/contexts/TenantContext';
import { defaultTenantConfig } from '@shared/tenant-config';

interface TenantLogoProps {
  className?: string;
  /** Complément d'alt éventuel (ex: "Logo connexion"). Par défaut: "<nom du tenant> Logo". */
  alt?: string;
  'data-testid'?: string;
}

/**
 * Logo du tenant courant — source unique de vérité pour l'affichage du logo.
 *
 * Toujours utiliser ce composant (ou `useTenantBranding`) plutôt qu'un chemin
 * d'image codé en dur : le logo provient de la configuration tenant effective
 * (fichier client + surcharges dynamiques en base) et change sans redéploiement.
 */
export function TenantLogo({ className, alt, ...rest }: Readonly<TenantLogoProps>) {
  const { config } = useTenant();

  return (
    <img
      src={config.theme.logoUrl ?? defaultTenantConfig.theme.logoUrl}
      alt={alt ?? `${config.name} Logo`}
      className={className}
      data-testid={rest['data-testid'] ?? 'img-tenant-logo'}
    />
  );
}

/**
 * Accès direct aux valeurs de branding effectives (nom, logo, couleurs)
 * pour les usages hors <img> (PDF côté client, impression, e-mails de test…).
 */
export function useTenantBranding() {
  const { config } = useTenant();
  return {
    name: config.name,
    logoUrl: config.theme.logoUrl,
    faviconUrl: config.theme.faviconUrl,
    primaryColor: config.theme.primaryColor,
    secondaryColor: config.theme.secondaryColor,
  };
}
