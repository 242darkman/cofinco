import type { Express } from "express";
import { defaultTenantConfig, type TenantConfig } from "@shared/tenant-config";
import { createLogger } from "../lib/logger";

const logger = createLogger("Routes:Tenant");

export function registerTenantRoutes(app: Express) {
  /**
   * GET /api/tenant/config — public
   * Renvoie la configuration du locataire (Tenant) actuel basée sur VITE_APP_CLIENT
   * ou sur le domaine. Utile pour les Feature Flags et les overrides stricts.
   */
  app.get("/api/tenant/config", (req, res) => {
    try {
      // Dans le futur, on pourrait lire ça d'une table "tenants" ou déterminer
      // le tenant selon req.hostname. Pour l'instant, c'est basé sur env.
      const clientId = process.env.VITE_APP_CLIENT || "microflex";
      
      const config: TenantConfig = {
        ...defaultTenantConfig,
        id: clientId,
        // Override example based on tenant
        ...(clientId === "client-b" && {
          name: "Client B Finance",
          theme: {
            primaryColor: "hsl(340, 100%, 45%)",
            logoUrl: "/client-b-logo.png",
          },
          features: {
            enableSms: false,
            enableTontine: false,
            enableMobileMoney: false,
            enableFieldAgents: true,
          }
        }),
      };

      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(config);
    } catch (error) {
      logger.error({ err: error }, "Erreur lors du chargement de la config tenant");
      res.json(defaultTenantConfig);
    }
  });
}
