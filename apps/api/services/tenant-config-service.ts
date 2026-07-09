import {
  applyBrandingOverrides,
  tenantBrandingKeys,
  tenantBrandingValueSchemas,
  isTenantBrandingKey,
  type TenantBrandingKey,
  type TenantConfig,
} from "@shared/tenant-config";
import { createLogger } from "../lib/logger";
import { getTenantConfig } from "../config/tenant-config";
import { getEffectiveFeatures, staticOnly } from "./tenant-feature-service";

const logger = createLogger("TenantConfigDynamique");

/** Durée de vie du cache des surcharges de branding (ms). */
const CACHE_TTL_MS = 30_000;

export { isTenantBrandingKey, tenantBrandingKeys };

interface BrandingCache {
  overrides: Array<{ key: string; value: string }>;
  expiresAt: number;
}

let cache: BrandingCache | undefined;

export function resetTenantBrandingCacheForTests(): void {
  cache = undefined;
}

async function loadBrandingOverrides(
  env: NodeJS.ProcessEnv,
): Promise<Array<{ key: string; value: string }>> {
  if (staticOnly(env)) return [];

  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.overrides;

  try {
    const { db } = await import("../db");
    const { tenantBrandingOverrides } = await import("@shared/schema");
    const overrides = await db
      .select({ key: tenantBrandingOverrides.key, value: tenantBrandingOverrides.value })
      .from(tenantBrandingOverrides);
    cache = { overrides, expiresAt: now + CACHE_TTL_MS };
    return overrides;
  } catch (error) {
    logger.warn(
      { err: error },
      "Lecture des surcharges de branding impossible — repli sur la configuration statique",
    );
    return [];
  }
}

/**
 * Configuration tenant effective : statique (fichier + env, validée au boot)
 * surchargée par la base (branding + feature flags), sans redémarrage.
 * L'identifiant du tenant reste toujours celui de la configuration statique.
 */
export async function getEffectiveTenantConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<TenantConfig> {
  const staticConfig = getTenantConfig();
  const [overrides, features] = await Promise.all([
    loadBrandingOverrides(env),
    getEffectiveFeatures(env),
  ]);
  return { ...applyBrandingOverrides(staticConfig, overrides), features };
}

/** État de chaque clé de branding avec sa provenance. */
export async function describeBranding(env: NodeJS.ProcessEnv = process.env): Promise<
  Array<{ key: TenantBrandingKey; effective: string | undefined; static: string | undefined; overridden: boolean }>
> {
  const staticConfig = getTenantConfig();
  const effective = await getEffectiveTenantConfig(env);
  const read = (config: TenantConfig, key: TenantBrandingKey): string | undefined =>
    key === "name" ? config.name : config.theme[key];

  return tenantBrandingKeys.map((key) => ({
    key,
    effective: read(effective, key),
    static: read(staticConfig, key),
    overridden: read(effective, key) !== read(staticConfig, key),
  }));
}

/** Crée ou met à jour une surcharge de branding validée, puis invalide le cache. */
export async function setBrandingOverride(
  key: TenantBrandingKey,
  value: string,
  reason: string | undefined,
  updatedBy: string | undefined,
): Promise<void> {
  const parsed = tenantBrandingValueSchemas[key].parse(value);
  const { db } = await import("../db");
  const { tenantBrandingOverrides } = await import("@shared/schema");
  await db
    .insert(tenantBrandingOverrides)
    .values({ key, value: parsed, reason, updatedBy })
    .onConflictDoUpdate({
      target: tenantBrandingOverrides.key,
      set: { value: parsed, reason, updatedBy, updatedAt: new Date() },
    });
  cache = undefined;
}

/** Supprime une surcharge (retour à la configuration statique), puis invalide le cache. */
export async function clearBrandingOverride(key: TenantBrandingKey): Promise<void> {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../db");
  const { tenantBrandingOverrides } = await import("@shared/schema");
  await db.delete(tenantBrandingOverrides).where(eq(tenantBrandingOverrides.key, key));
  cache = undefined;
}
