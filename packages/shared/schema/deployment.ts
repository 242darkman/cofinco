import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

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

/**
 * Surcharges dynamiques des feature flags tenant.
 *
 * La configuration statique (fichier + env) reste la source par défaut ;
 * une ligne ici la surcharge à chaud, sans redémarrage. En cas d'erreur de
 * lecture ou si TENANT_FEATURES_STATIC_ONLY=true (kill switch), seule la
 * configuration statique fait foi.
 */
export const tenantFeatureOverrides = pgTable("tenant_feature_overrides", {
  /** Clé du flag — une des clés de tenantFeatureFlagsSchema (ex: enableSms). */
  feature: text("feature").primaryKey(),
  enabled: boolean("enabled").notNull(),
  reason: text("reason"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type TenantFeatureOverride = typeof tenantFeatureOverrides.$inferSelect;

/**
 * Surcharges dynamiques du branding tenant (nom, couleurs, logos).
 * Même modèle que tenant_feature_overrides : la config statique (fichier +
 * env) est le défaut de démarrage, la base surcharge à chaud. L'identifiant
 * du tenant n'est jamais surchargeable (voir deployment_identity).
 */
export const tenantBrandingOverrides = pgTable("tenant_branding_overrides", {
  /** Une des clés de tenantBrandingKeys (ex: primaryColor). */
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  reason: text("reason"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type TenantBrandingOverride = typeof tenantBrandingOverrides.$inferSelect;
