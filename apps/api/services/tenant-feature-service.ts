import {
  tenantFeatureFlagsSchema,
  type TenantFeatureFlags,
  type TenantFeatureKey,
} from "@shared/tenant-config";
import type { TenantFeatureOverride } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { getTenantConfig } from "../config/tenant-config";

const logger = createLogger("TenantFeatures");

/** Durée de vie du cache des surcharges (ms). */
const CACHE_TTL_MS = 30_000;

export const TENANT_FEATURE_KEYS = Object.keys(
  tenantFeatureFlagsSchema.shape,
) as TenantFeatureKey[];

export function isTenantFeatureKey(value: string): value is TenantFeatureKey {
  return (TENANT_FEATURE_KEYS as string[]).includes(value);
}

/**
 * Fusionne la configuration statique avec les surcharges dynamiques.
 * Une surcharge dont la clé n'est pas un flag connu est ignorée (et signalée).
 */
export function mergeFeatureOverrides(
  staticFeatures: TenantFeatureFlags,
  overrides: Array<Pick<TenantFeatureOverride, "feature" | "enabled">>,
): TenantFeatureFlags {
  const merged = { ...staticFeatures };
  for (const override of overrides) {
    if (isTenantFeatureKey(override.feature)) {
      merged[override.feature] = override.enabled;
    } else {
      logger.warn({ feature: override.feature }, "Surcharge de flag inconnue ignorée");
    }
  }
  return merged;
}

interface FeatureCache {
  features: TenantFeatureFlags;
  expiresAt: number;
}

let cache: FeatureCache | undefined;

export function resetTenantFeatureCacheForTests(): void {
  cache = undefined;
}

/**
 * Kill switch commun aux surcharges dynamiques (flags + branding) :
 * TENANT_OVERRIDES_STATIC_ONLY=true fige la configuration statique seule.
 */
export function staticOnly(env: NodeJS.ProcessEnv): boolean {
  return env.TENANT_OVERRIDES_STATIC_ONLY === "true";
}

/**
 * Retourne les feature flags effectifs : configuration statique surchargée
 * par les valeurs en base (cache 30 s).
 *
 * Comportement sûr par défaut : en cas d'erreur de lecture des surcharges
 * (base indisponible, migration absente), la configuration statique validée
 * au démarrage fait foi — jamais de blocage du serveur pour un flag.
 * Kill switch : TENANT_OVERRIDES_STATIC_ONLY=true ignore la base.
 */
export async function getEffectiveFeatures(
  env: NodeJS.ProcessEnv = process.env,
): Promise<TenantFeatureFlags> {
  const staticFeatures = getTenantConfig().features;
  if (staticOnly(env)) return staticFeatures;

  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.features;

  try {
    const { db } = await import("../db");
    const { tenantFeatureOverrides } = await import("@shared/schema");
    const overrides = await db
      .select({
        feature: tenantFeatureOverrides.feature,
        enabled: tenantFeatureOverrides.enabled,
      })
      .from(tenantFeatureOverrides);

    const features = mergeFeatureOverrides(staticFeatures, overrides);
    cache = { features, expiresAt: now + CACHE_TTL_MS };
    return features;
  } catch (error) {
    logger.warn(
      { err: error },
      "Lecture des surcharges de flags impossible — repli sur la configuration statique",
    );
    return staticFeatures;
  }
}

/** Liste l'état effectif de chaque flag avec sa provenance. */
export async function describeFeatures(env: NodeJS.ProcessEnv = process.env): Promise<
  Array<{
    feature: TenantFeatureKey;
    effective: boolean;
    static: boolean;
    overridden: boolean;
  }>
> {
  const staticFeatures = getTenantConfig().features;
  const effective = await getEffectiveFeatures(env);
  return TENANT_FEATURE_KEYS.map((feature) => ({
    feature,
    effective: effective[feature],
    static: staticFeatures[feature],
    overridden: effective[feature] !== staticFeatures[feature],
  }));
}

/** Crée ou met à jour une surcharge, puis invalide le cache. */
export async function setFeatureOverride(
  feature: TenantFeatureKey,
  enabled: boolean,
  reason: string | undefined,
  updatedBy: string | undefined,
): Promise<void> {
  const { db } = await import("../db");
  const { tenantFeatureOverrides } = await import("@shared/schema");
  await db
    .insert(tenantFeatureOverrides)
    .values({ feature, enabled, reason, updatedBy })
    .onConflictDoUpdate({
      target: tenantFeatureOverrides.feature,
      set: { enabled, reason, updatedBy, updatedAt: new Date() },
    });
  cache = undefined;
}

/** Supprime une surcharge (retour à la configuration statique), puis invalide le cache. */
export async function clearFeatureOverride(feature: TenantFeatureKey): Promise<void> {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../db");
  const { tenantFeatureOverrides } = await import("@shared/schema");
  await db.delete(tenantFeatureOverrides).where(eq(tenantFeatureOverrides.feature, feature));
  cache = undefined;
}
