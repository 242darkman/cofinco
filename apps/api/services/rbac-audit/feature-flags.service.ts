import { db } from '../../db';
import { systemFeatureFlags, RBAC_FEATURE_FLAGS } from '@shared/schema';
import { createLogger } from '../../lib/logger';

const logger = createLogger('RbacAudit:FeatureFlags');

/**
 * Cache des feature flags (rafraîchi toutes les 60 secondes)
 */
let featureFlagsCache: Map<string, boolean> = new Map();
let featureFlagsCacheTime: number = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Récupère la valeur d'un feature flag (avec cache)
 */
export async function getFeatureFlag(flagKey: string): Promise<boolean> {
  const now = Date.now();

  // Rafraîchir le cache s'il est expiré
  if (now - featureFlagsCacheTime > CACHE_TTL_MS) {
    await refreshFeatureFlagsCache();
  }

  return featureFlagsCache.get(flagKey) ?? false;
}

/**
 * Rafraîchit le cache des feature flags
 */
async function refreshFeatureFlagsCache(): Promise<void> {
  try {
    const flags = await db
      .select({ key: systemFeatureFlags.flagKey, value: systemFeatureFlags.flagValue })
      .from(systemFeatureFlags);

    featureFlagsCache = new Map(flags.map(f => [f.key, f.value]));
    featureFlagsCacheTime = Date.now();
  } catch (err) {
    logger.error({ err }, 'Échec du rafraîchissement du cache des feature flags');
  }
}

/**
 * Vérifie si les surcharges (overrides) avec portée sont activées
 */
export async function isScopedOverridesEnabled(): Promise<boolean> {
  return getFeatureFlag(RBAC_FEATURE_FLAGS.SCOPED_OVERRIDES);
}

/**
 * Vérifie si la journalisation d'audit est activée
 */
export async function isAuditLogEnabled(): Promise<boolean> {
  return getFeatureFlag(RBAC_FEATURE_FLAGS.AUDIT_LOG_ENABLED);
}

/**
 * Vérifie si la justification est requise pour les permissions critiques
 */
export async function isReasonRequiredForCritical(): Promise<boolean> {
  return getFeatureFlag(RBAC_FEATURE_FLAGS.REQUIRE_REASON_CRITICAL);
}
