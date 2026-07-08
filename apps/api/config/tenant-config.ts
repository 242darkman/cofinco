import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tenantConfigSchema, defaultTenantConfig, type TenantConfig } from "@shared/tenant-config";

type TenantEnvironment = NodeJS.ProcessEnv;

/**
 * Charge la configuration statique du tenant.
 *
 * La configuration métier (identité, branding, feature flags) ne vit JAMAIS
 * dans des variables d'environnement : elle provient exclusivement du fichier
 * de configuration du client (embarqué dans son image Docker via
 * TENANT_CONFIG_FILE au build, chemin runtime TENANT_CONFIG_PATH), puis des
 * surcharges dynamiques en base (tenant_branding_overrides,
 * tenant_feature_overrides).
 *
 * Sans fichier configuré, le comportement standard MicroFlex s'applique.
 */
export function loadTenantConfig(env: TenantEnvironment = process.env): TenantConfig {
  const path = env.TENANT_CONFIG_PATH;
  if (!path) return defaultTenantConfig;

  const absolutePath = resolve(process.cwd(), path);
  const parsed: unknown = JSON.parse(readFileSync(absolutePath, "utf8"));
  return tenantConfigSchema.parse(parsed);
}

let cachedConfig: TenantConfig | undefined;

export function getTenantConfig(): TenantConfig {
  cachedConfig ??= Object.freeze(loadTenantConfig());
  return cachedConfig;
}

export function resetTenantConfigCacheForTests(): void {
  cachedConfig = undefined;
}
