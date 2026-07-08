import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Identité du déploiement — table à ligne unique (id = 1).
 *
 * Modèle « 1 instance = 1 client » : au premier démarrage, l'instance
 * revendique la base en y inscrivant son identifiant de tenant. À chaque
 * démarrage suivant, l'identifiant configuré (TENANT_ID / config tenant)
 * doit correspondre à celui inscrit, sinon le serveur refuse de démarrer.
 * Cela empêche de pointer le livrable d'un client vers la base d'un autre.
 */
export const deploymentIdentity = pgTable("deployment_identity", {
  /** Toujours 1 — ligne unique garantie par la clé primaire. */
  id: integer("id").primaryKey().default(1),
  tenantId: text("tenant_id").notNull(),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
  lastVerifiedAt: timestamp("last_verified_at"),
});

export type DeploymentIdentity = typeof deploymentIdentity.$inferSelect;
