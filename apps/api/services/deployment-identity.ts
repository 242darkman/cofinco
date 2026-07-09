import { eq, sql } from "drizzle-orm";
import { deploymentIdentity } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { getTenantConfig } from "../config/tenant-config";

const logger = createLogger("DeploymentIdentity");

export type IdentityDecision = "claim" | "match" | "rebind" | "mismatch";

/**
 * Décide l'action à effectuer au démarrage selon l'identité inscrite en base.
 *
 * - `claim`    : base vierge → l'instance revendique la base (premier démarrage) ;
 * - `match`    : l'identité correspond → démarrage normal ;
 * - `rebind`   : identité différente mais réassignation explicitement autorisée ;
 * - `mismatch` : identité différente → refus de démarrer (protection anti-mélange).
 */
export function decideIdentityAction(
  storedTenantId: string | undefined,
  configuredTenantId: string,
  rebindAllowed: boolean,
): IdentityDecision {
  if (storedTenantId === undefined) return "claim";
  if (storedTenantId === configuredTenantId) return "match";
  return rebindAllowed ? "rebind" : "mismatch";
}

export class DeploymentIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentIdentityError";
  }
}

/**
 * Vérifie l'identité du déploiement au démarrage (modèle 1 instance = 1 client).
 *
 * Refuse de démarrer si la base appartient à un autre tenant, sauf si la
 * réassignation est explicitement demandée via TENANT_IDENTITY_REBIND=true
 * (opération exceptionnelle, tracée dans les logs).
 *
 * @throws DeploymentIdentityError si l'identité ne correspond pas ou si la
 *         table est absente (migrations non appliquées).
 */
export async function verifyDeploymentIdentity(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const configuredTenantId = getTenantConfig().id;
  const rebindAllowed = env.TENANT_IDENTITY_REBIND === "true";
  // Import paresseux : évite d'exiger DATABASE_URL pour les tests unitaires purs.
  const { db } = await import("../db");

  let rows: Array<{ tenantId: string }>;
  try {
    rows = await db
      .select({ tenantId: deploymentIdentity.tenantId })
      .from(deploymentIdentity)
      .where(eq(deploymentIdentity.id, 1));
  } catch (error) {
    throw new DeploymentIdentityError(
      "Impossible de lire l'identité du déploiement (table deployment_identity). " +
        "Exécuter les migrations (npm run db:migrate) avant de démarrer. " +
        `Cause: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const decision = decideIdentityAction(rows[0]?.tenantId, configuredTenantId, rebindAllowed);

  switch (decision) {
    case "claim":
      await db
        .insert(deploymentIdentity)
        .values({ id: 1, tenantId: configuredTenantId, lastVerifiedAt: sql`now()` })
        .onConflictDoNothing();
      logger.info(
        { tenantId: configuredTenantId },
        "Base revendiquée par ce déploiement (premier démarrage)",
      );
      return;

    case "match":
      await db
        .update(deploymentIdentity)
        .set({ lastVerifiedAt: sql`now()` })
        .where(eq(deploymentIdentity.id, 1));
      logger.info({ tenantId: configuredTenantId }, "Identité du déploiement vérifiée");
      return;

    case "rebind":
      await db
        .update(deploymentIdentity)
        .set({ tenantId: configuredTenantId, claimedAt: sql`now()`, lastVerifiedAt: sql`now()` })
        .where(eq(deploymentIdentity.id, 1));
      logger.warn(
        { previousTenantId: rows[0]?.tenantId, tenantId: configuredTenantId },
        "⚠️  RÉASSIGNATION D'IDENTITÉ — la base a été réassignée à un autre tenant " +
          "(TENANT_IDENTITY_REBIND=true). Retirer cette variable après ce démarrage.",
      );
      return;

    case "mismatch":
      throw new DeploymentIdentityError(
        `Cette base de données appartient au tenant "${rows[0]?.tenantId}" mais l'instance ` +
          `est configurée pour "${configuredTenantId}". Démarrage refusé pour empêcher un ` +
          "mélange de données entre clients. Si cette réassignation est intentionnelle, " +
          "définir TENANT_IDENTITY_REBIND=true pour un seul démarrage.",
      );
  }
}
