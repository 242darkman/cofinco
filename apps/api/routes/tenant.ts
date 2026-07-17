import type { Express } from "express";
import { z } from "zod";
import { Actions, Subjects } from "@shared/ability";
import { createLogger } from "../lib/logger";
import { getTenantConfig } from "../config/tenant-config";
import { isModuleFeature } from "@shared/tenant-config";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility, requirePlatformOperator } from "../authorization";
import { logAudit } from "../audit";
import {
  clearFeatureOverride,
  describeFeatures,
  isTenantFeatureKey,
  setFeatureOverride,
} from "../services/tenant-feature-service";
import {
  clearBrandingOverride,
  describeBranding,
  getEffectiveTenantConfig,
  isTenantBrandingKey,
  setBrandingOverride,
} from "../services/tenant-config-service";

const logger = createLogger("Routes:Tenant");

const overrideBodySchema = z.object({
  enabled: z.boolean(),
  reason: z.string().min(3).max(500),
}).strict();

const brandingBodySchema = z.object({
  value: z.string().min(1).max(512),
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
      res.json(await getEffectiveTenantConfig());
    } catch (error) {
      logger.error({ err: error }, "Erreur lors du chargement de la config tenant");
      // Repli sûr : configuration statique validée au démarrage.
      try {
        res.json(getTenantConfig());
      } catch {
        res.status(500).json({ code: "TENANT_CONFIG_UNAVAILABLE" });
      }
    }
  });

  // Provisioning & branding tenant = exploitation plateforme : opérateur uniquement.
  const adminGuards = [requireAuth, requirePlatformOperator(), attachAbility, requireAbility(Actions.MANAGE, Subjects.SETTINGS)] as const;

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

    // Plafond de provisioning : un module non provisionné ne peut pas être activé
    // à chaud (seul un re-provisionnement du fichier client le permet).
    if (isModuleFeature(feature) && parsed.data.enabled && !getTenantConfig().features[feature]) {
      res.status(409).json({
        code: "MODULE_NOT_PROVISIONED",
        message: "Module non provisionné : activation impossible sans re-provisionnement du déploiement.",
      });
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
   * GET /api/admin/tenant-branding — état effectif du branding et sa provenance.
   */
  app.get("/api/admin/tenant-branding", ...adminGuards, async (_req, res) => {
    try {
      res.json({ branding: await describeBranding() });
    } catch (error) {
      logger.error({ err: error }, "Erreur lors de la lecture du branding tenant");
      res.status(500).json({ code: "TENANT_BRANDING_UNAVAILABLE" });
    }
  });

  /**
   * PUT /api/admin/tenant-branding/:key — surcharge dynamique du branding
   * (name, primaryColor, secondaryColor, logoUrl, faviconUrl). Auditée,
   * motivée, sans redémarrage (prise en compte ≤ 30 s).
   */
  app.put("/api/admin/tenant-branding/:key", ...adminGuards, async (req, res) => {
    const { key } = req.params;
    if (!isTenantBrandingKey(key)) {
      res.status(400).json({ code: "UNKNOWN_BRANDING_KEY", message: `Clé inconnue: ${key}` });
      return;
    }

    const parsed = brandingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_BODY", issues: parsed.error.issues });
      return;
    }

    try {
      await setBrandingOverride(key, parsed.data.value, parsed.data.reason, req.session?.userId);
      await logAudit(req, "TENANT_BRANDING_OVERRIDE", "tenant_branding_overrides", key, {
        value: parsed.data.value,
        reason: parsed.data.reason,
      }, "success", "medium");
      logger.info({ key }, "Surcharge de branding tenant appliquée");
      res.json({ branding: await describeBranding() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ code: "INVALID_VALUE", issues: error.issues });
        return;
      }
      logger.error({ err: error, key }, "Erreur lors de la surcharge du branding");
      res.status(500).json({ code: "TENANT_BRANDING_UPDATE_FAILED" });
    }
  });

  /**
   * DELETE /api/admin/tenant-branding/:key — retour à la configuration statique.
   */
  app.delete("/api/admin/tenant-branding/:key", ...adminGuards, async (req, res) => {
    const { key } = req.params;
    if (!isTenantBrandingKey(key)) {
      res.status(400).json({ code: "UNKNOWN_BRANDING_KEY", message: `Clé inconnue: ${key}` });
      return;
    }

    try {
      await clearBrandingOverride(key);
      await logAudit(req, "TENANT_BRANDING_OVERRIDE_CLEARED", "tenant_branding_overrides", key, {}, "success", "medium");
      logger.info({ key }, "Surcharge de branding tenant supprimée");
      res.json({ branding: await describeBranding() });
    } catch (error) {
      logger.error({ err: error, key }, "Erreur lors de la suppression de la surcharge de branding");
      res.status(500).json({ code: "TENANT_BRANDING_UPDATE_FAILED" });
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
