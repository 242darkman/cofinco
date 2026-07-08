import { z } from "zod";

export const tenantFeatureFlagsSchema = z.object({
  enableSms: z.boolean(),
  enableTontine: z.boolean(),
  enableMobileMoney: z.boolean(),
  enableFieldAgents: z.boolean(),
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
    logoUrl: "/microflex-logo.png",
  },
  features: {
    enableSms: true,
    enableTontine: true,
    enableMobileMoney: true,
    enableFieldAgents: true,
  },
};

export function isTenantFeatureEnabled(
  config: TenantConfig,
  feature: TenantFeatureKey,
): boolean {
  return config.features[feature] === true;
}
