import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { getEffectiveTenantConfig } from "../services/tenant-config-service";
import { defaultTenantConfig, type TenantConfig } from "@shared/tenant-config";
import { buildPwaManifest } from "../services/pwa-manifest-service";

const logger = createLogger("Routes:PWA");

/**
 * Manifeste PWA dynamique par tenant.
 *
 * Nom, couleur de marque, icônes (générées par tenant, cf.
 * `scripts/generate-tenant-icons.ts`) et raccourcis (filtrés par feature flags)
 * proviennent de la configuration tenant effective. La construction est
 * déléguée à `pwa-manifest-service`.
 */
export function registerPwaRoutes(app: Express) {
  app.get("/api/manifest.json", async (_req, res) => {
    let config: TenantConfig = defaultTenantConfig;
    try {
      config = await getEffectiveTenantConfig();
    } catch (error) {
      logger.error({ err: error }, "Config tenant indisponible pour le manifeste, repli sur le défaut");
    }

    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(buildPwaManifest(config));
  });
}
