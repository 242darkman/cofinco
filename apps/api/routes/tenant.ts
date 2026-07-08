import type { Express } from "express";
import { z } from "zod";
import { Actions, Subjects } from "@shared/ability";
import { createLogger } from "../lib/logger";
import { getTenantConfig } from "../config/tenant-config";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { logAudit } from "../audit";
import {
  clearFeatureOverride,
  describeFeatures,
  getEffectiveFeatures,
  isTenantFeatureKey,
  setFeatureOverride,
} from "../services/tenant-feature-service";

const logger = createLogger("Routes:Tenant");

const overrideBodySchema = z.object({
  enabled: z.boolean(),
  reason: z.string().min(3).max(500),
}).strict();

export function registerTenantRoutes(app: Express) {
  /**
   * GET /api/tenant/config — public
   * Renvoie la configuration publique du déploiement courant,
   * avec les feature flags effectifs (statique + surcharges dynamiques).
   */
  app.get("/api/tenant/config", async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "private, max-age=60");
      res.setHeader("Vary", "Host");
      const config = getTenantConfig();
      const features = await getEffectiveFeatures();
      res.json({ ...config, features });
    } catch (error) {
      logger.error({ err: error }, "Erreur lors du chargement de la config tenant");
      res.status(500).json({ code: "TENANT_CONFIG_UNAVAILABLE" });
    }
  });

  const adminGuards = [requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS)] as const;

  /**
   * GET /api/admin/tenant-features — état effectif de chaque flag et sa provenance.
   */
  app.get("/api/admin/tenant-features", ...adminGuards, async (_req, res) => {
    try {
      res.json({ features: await describeFeatures() });
    } catch (error) {
      logger.error({ err: error }, "Erreur lors de la lecture des flags tenant");
      res.status(500).json({ code: "TENANT_FEATURES_UNAVAILABLE" });
    }
  });

  /**
   * PUT /api/admin/tenant-features/:feature — surcharge dynamique d'un flag.
   * Auditée, motivée, sans redémarrage (prise en compte ≤ 30 s).
   */
  app.put("/api/admin/tenant-features/:feature", ...adminGuards, async (req, res) => {
    const { feature } = req.params;
    if (!isTenantFeatureKey(feature)) {
      res.status(400).json({ code: "UNKNOWN_FEATURE", message: `Flag inconnu: ${feature}` });
      return;
    }

    const parsed = overrideBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_BODY", issues: parsed.error.issues });
      return;
    }

    try {
      await setFeatureOverride(feature, parsed.data.enabled, parsed.data.reason, req.session?.userId);
      await logAudit(req, "TENANT_FEATURE_OVERRIDE", "tenant_feature_overrides", feature, {
        enabled: parsed.data.enabled,
        reason: parsed.data.reason,
      }, "success", "high");
      logger.info({ feature, enabled: parsed.data.enabled }, "Surcharge de flag tenant appliquée");
      res.json({ features: await describeFeatures() });
    } catch (error) {
      logger.error({ err: error, feature }, "Erreur lors de la surcharge du flag");
      res.status(500).json({ code: "TENANT_FEATURE_UPDATE_FAILED" });
    }
  });

  /**
   * DELETE /api/admin/tenant-features/:feature — retour à la configuration statique.
   */
  app.delete("/api/admin/tenant-features/:feature", ...adminGuards, async (req, res) => {
    const { feature } = req.params;
    if (!isTenantFeatureKey(feature)) {
      res.status(400).json({ code: "UNKNOWN_FEATURE", message: `Flag inconnu: ${feature}` });
      return;
    }

    try {
      await clearFeatureOverride(feature);
      await logAudit(req, "TENANT_FEATURE_OVERRIDE_CLEARED", "tenant_feature_overrides", feature, {}, "success", "high");
      logger.info({ feature }, "Surcharge de flag tenant supprimée");
      res.json({ features: await describeFeatures() });
    } catch (error) {
      logger.error({ err: error, feature }, "Erreur lors de la suppression de la surcharge");
      res.status(500).json({ code: "TENANT_FEATURE_UPDATE_FAILED" });
    }
  });
}
