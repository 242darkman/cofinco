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
