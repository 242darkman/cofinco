import { z } from "zod";

export const tenantFeatureFlagsSchema = z.object({
  // Toutes les features sont ACTIVES PAR DÉFAUT (`default(true)`) : une config
  // qui omet une clé conserve donc le comportement standard « tout actif »
  // (opt-out par tenant, AGENTS.md §5). Chaque flag est consommé côté nav
  // (routes-config), onglets admin (admin-constants) et garde serveur
  // (middleware/tenant-features) — voir la recette dans tenant-config.ts.
  enableSms: z.boolean().default(true),
  enableTontine: z.boolean().default(true),
  enableMobileMoney: z.boolean().default(true),
  enableFieldAgents: z.boolean().default(true),
  enableCredits: z.boolean().default(true),
  enableComptes: z.boolean().default(true),
  enableCaisse: z.boolean().default(true),
  enableCoffreFort: z.boolean().default(true),
  enableTresorerie: z.boolean().default(true),
  enableTransfert: z.boolean().default(true),
  enableVirementsProgrammes: z.boolean().default(true),
  enableComptabilite: z.boolean().default(true),
  enableRapports: z.boolean().default(true),
  enableKpi: z.boolean().default(true),
  enableRH: z.boolean().default(true),
  /** Cartes de pointage (épargne libre par cases, 31 slots). */
  enableCartesPointage: z.boolean().default(true),
}).strict();

export const tenantThemeConfigSchema = z.object({
  primaryColor: z.string().min(1).max(64),
  secondaryColor: z.string().min(1).max(64).optional(),
  logoUrl: z.string().min(1).max(512).optional(),
  faviconUrl: z.string().min(1).max(512).optional(),
}).strict();

export const tenantConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/),
  name: z.string().min(1).max(120),
  theme: tenantThemeConfigSchema,
  features: tenantFeatureFlagsSchema,
}).strict();

export type TenantThemeConfig = z.infer<typeof tenantThemeConfigSchema>;
export type TenantFeatureFlags = z.infer<typeof tenantFeatureFlagsSchema>;
export type TenantFeatureKey = keyof TenantFeatureFlags;
export type TenantConfig = z.infer<typeof tenantConfigSchema>;

/**
 * Clés de branding surchargeables dynamiquement (base de données).
 * L'identifiant du tenant (id) n'en fait volontairement PAS partie :
 * c'est l'ancre d'identité du déploiement, jamais modifiable à chaud.
 */
export const tenantBrandingKeys = [
  "name",
  "primaryColor",
  "secondaryColor",
  "logoUrl",
  "faviconUrl",
] as const;

export type TenantBrandingKey = (typeof tenantBrandingKeys)[number];

/** Validation par clé des valeurs de surcharge de branding. */
export const tenantBrandingValueSchemas: Record<TenantBrandingKey, z.ZodString> = {
  name: z.string().min(1).max(120),
  primaryColor: z.string().min(1).max(64),
  secondaryColor: z.string().min(1).max(64),
  logoUrl: z.string().min(1).max(512),
  faviconUrl: z.string().min(1).max(512),
};

export function isTenantBrandingKey(value: string): value is TenantBrandingKey {
  return (tenantBrandingKeys as readonly string[]).includes(value);
}

/** Applique des surcharges de branding validées sur une config statique. */
export function applyBrandingOverrides(
  config: TenantConfig,
  overrides: Array<{ key: string; value: string }>,
): TenantConfig {
  const result: TenantConfig = {
    ...config,
    theme: { ...config.theme },
  };
  for (const { key, value } of overrides) {
    if (!isTenantBrandingKey(key)) continue;
    const parsed = tenantBrandingValueSchemas[key].safeParse(value);
    if (!parsed.success) continue;
    if (key === "name") {
      result.name = parsed.data;
    } else {
      result.theme[key] = parsed.data;
    }
  }
  return result;
}

// Default configuration for MicroFlex (Core)
export const defaultTenantConfig: TenantConfig = {
  id: "microflex",
  name: "MicroFlex",
  theme: {
    primaryColor: "hsl(210, 100%, 45%)", // A generic blue
    logoUrl: "/brand/microflex/logo.png",
  },
  features: {
    enableSms: true,
    enableTontine: true,
    enableMobileMoney: true,
    enableFieldAgents: true,
    enableCredits: true,
    enableComptes: true,
    enableCaisse: true,
    enableCoffreFort: true,
    enableTresorerie: true,
    enableTransfert: true,
    enableVirementsProgrammes: true,
    enableComptabilite: true,
    enableRapports: true,
    enableKpi: true,
    enableRH: true,
    enableCartesPointage: true,
  },
};

export function isTenantFeatureEnabled(
  config: TenantConfig,
  feature: TenantFeatureKey,
): boolean {
  return config.features[feature] === true;
}

/**
 * Nature d'un flag tenant :
 * - `module` : capacité provisionnée au déploiement (fichier config = plafond).
 *   Une surcharge en base ne peut que **désactiver** un module provisionné,
 *   jamais **activer** un module non provisionné (pas d'auto-provisioning).
 * - `integration` : intégration opérationnelle, librement basculable à chaud
 *   par l'administrateur du tenant (aucun plafond).
 */
export type TenantFeatureKind = "module" | "integration";

export const TENANT_FEATURE_KIND: Record<TenantFeatureKey, TenantFeatureKind> = {
  // Intégrations opérationnelles (bascule libre à chaud)
  enableSms: "integration",
  enableMobileMoney: "integration",
  // Modules (provisionnés au déploiement — plafond)
  enableTontine: "module",
  enableFieldAgents: "module",
  enableCredits: "module",
  enableComptes: "module",
  enableCaisse: "module",
  enableCoffreFort: "module",
  enableTresorerie: "module",
  enableTransfert: "module",
  enableVirementsProgrammes: "module",
  enableComptabilite: "module",
  enableRapports: "module",
  enableKpi: "module",
  enableRH: "module",
  enableCartesPointage: "module",
};

export function isModuleFeature(feature: TenantFeatureKey): boolean {
  return TENANT_FEATURE_KIND[feature] === "module";
}
