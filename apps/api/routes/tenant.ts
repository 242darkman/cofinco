import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { getTenantConfig } from "../config/tenant-config";

const logger = createLogger("Routes:Tenant");

export function registerTenantRoutes(app: Express) {
  /**
   * GET /api/tenant/config — public
   * Renvoie la configuration publique et validée du déploiement courant.
   */
  app.get("/api/tenant/config", (req, res) => {
    try {
      res.setHeader("Cache-Control", "private, max-age=60");
      res.setHeader("Vary", "Host");
      res.json(getTenantConfig());
    } catch (error) {
      logger.error({ err: error }, "Erreur lors du chargement de la config tenant");
      res.status(500).json({ code: "TENANT_CONFIG_UNAVAILABLE" });
    }
  });
}
