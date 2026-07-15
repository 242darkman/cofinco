import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { getEffectiveTenantConfig } from "../services/tenant-config-service";
import { defaultTenantConfig } from "@shared/tenant-config";

const logger = createLogger("Routes:PWA");

/**
 * Manifeste PWA dynamique. Le nom de l'application provient de la configuration
 * tenant effective (source unique de vérité : fichier client + surcharges), et
 * non plus d'un champ de branding legacy.
 */
export function registerPwaRoutes(app: Express) {
  app.get("/api/manifest.json", async (_req, res) => {
    let appName = defaultTenantConfig.name;
    try {
      appName = (await getEffectiveTenantConfig()).name || defaultTenantConfig.name;
    } catch (error) {
      logger.error({ err: error }, "Nom tenant indisponible pour le manifeste, repli sur le défaut");
    }

    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({
      name: `${appName} - Plateforme Microfinance`,
      short_name: appName,
      description:
        "Application de gestion microfinance - Caisse, Epargne, Crédit, Tontine",
      start_url: "/",
      display: "standalone",
      background_color: "#0f172a",
      theme_color: "#0ea5e9",
      orientation: "portrait-primary",
      scope: "/",
      lang: "fr",
      dir: "ltr",
      categories: ["finance", "business"],
      icons: [
        { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png", purpose: "maskable any" },
        { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png", purpose: "maskable any" },
        { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png", purpose: "maskable any" },
        { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png", purpose: "maskable any" },
        { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png", purpose: "maskable any" },
        { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable any" },
        { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png", purpose: "maskable any" },
        { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable any" },
      ],
      shortcuts: [
        {
          name: "Caisse",
          short_name: "Caisse",
          description: "Accéder à la gestion de caisse",
          url: "/caisse",
          icons: [{ src: "/icons/shortcut-caisse.png", sizes: "96x96" }],
        },
        {
          name: "Clients",
          short_name: "Clients",
          description: "Gérer les clients",
          url: "/clients",
          icons: [{ src: "/icons/shortcut-clients.png", sizes: "96x96" }],
        },
        {
          name: "Terrain",
          short_name: "Terrain",
          description: "Mode agent terrain",
          url: "/agent-terrain",
          icons: [{ src: "/icons/shortcut-terrain.png", sizes: "96x96" }],
        },
      ],
      screenshots: [
        {
          src: "/screenshots/dashboard.png",
          sizes: "1280x720",
          type: "image/png",
          form_factor: "wide",
          label: "Tableau de bord principal",
        },
        {
          src: "/screenshots/mobile-caisse.png",
          sizes: "390x844",
          type: "image/png",
          form_factor: "narrow",
          label: "Gestion de caisse mobile",
        },
      ],
      related_applications: [],
      prefer_related_applications: false,
      share_target: {
        action: "/share-target",
        method: "POST",
        enctype: "multipart/form-data",
        params: {
          title: "title",
          text: "text",
          url: "url",
          files: [{ name: "documents", accept: ["application/pdf", "image/*"] }],
        },
      },
    });
  });
}
