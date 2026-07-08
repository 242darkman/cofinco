import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../db";
import { systemSettings, uiCustomization } from "@shared/schema/settings";
import { eq } from "drizzle-orm";
import { getWsInstance } from "../ws-server";

const logger = createLogger("Routes:Branding");

export function registerBrandingRoutes(app: Express) {
  /**
   * GET /api/manifest.json — public
   * Serves a dynamic PWA manifest with the app name from branding settings.
   */
  app.get("/api/manifest.json", async (_req, res) => {
    try {
      const [settings] = await db.select().from(systemSettings);

      const appName = settings?.appName || "MicroFlex";

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
          {
            src: "/icons/icon-72x72.png",
            sizes: "72x72",
            type: "image/png",
            purpose: "maskable any",
          },
          {
            src: "/icons/icon-96x96.png",
            sizes: "96x96",
            type: "image/png",
            purpose: "maskable any",
          },
          {
            src: "/icons/icon-128x128.png",
            sizes: "128x128",
            type: "image/png",
            purpose: "maskable any",
          },
          {
            src: "/icons/icon-144x144.png",
            sizes: "144x144",
            type: "image/png",
            purpose: "maskable any",
          },
          {
            src: "/icons/icon-152x152.png",
            sizes: "152x152",
            type: "image/png",
            purpose: "maskable any",
          },
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable any",
          },
          {
            src: "/icons/icon-384x384.png",
            sizes: "384x384",
            type: "image/png",
            purpose: "maskable any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable any",
          },
        ],
        shortcuts: [
          {
            name: "Caisse",
            short_name: "Caisse",
            description: "Accéder à la gestion de caisse",
            url: "/caisse",
            icons: [
              { src: "/icons/shortcut-caisse.png", sizes: "96x96" },
            ],
          },
          {
            name: "Clients",
            short_name: "Clients",
            description: "Gérer les clients",
            url: "/clients",
            icons: [
              { src: "/icons/shortcut-clients.png", sizes: "96x96" },
            ],
          },
          {
            name: "Terrain",
            short_name: "Terrain",
            description: "Mode agent terrain",
            url: "/agent-terrain",
            icons: [
              { src: "/icons/shortcut-terrain.png", sizes: "96x96" },
            ],
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
            files: [
              {
                name: "documents",
                accept: ["application/pdf", "image/*"],
              },
            ],
          },
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error serving dynamic manifest.json");
      // Return defaults on error
      res.setHeader("Content-Type", "application/manifest+json");
      res.json({
        name: "MicroFlex - Plateforme Microfinance",
        short_name: "MicroFlex",
        start_url: "/",
        display: "standalone",
        background_color: "#0f172a",
        theme_color: "#0ea5e9",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable any",
          },
        ],
      });
    }
  });

  /**
   * GET /api/branding — public (needed before auth for login page)
   * Returns app name, logo, theme colors, font, border radius
   */
  app.get("/api/branding", async (_req, res) => {
    try {
      const [settings] = await db.select().from(systemSettings);
      const [ui] = await db.select().from(uiCustomization);

      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({
        appName: settings?.appName || "MicroFlex",
        logoUrl: settings?.logoUrl || null,
        primaryColor: ui?.primaryColor || "#0f766e",
        accentColor: ui?.accentColor || "#c2410c",
        theme: ui?.theme || "DARK",
        fontFamily: ui?.fontFamily || "Inter",
        borderRadius: ui?.borderRadius || "lg",
        // Infos société pour reçus/factures
        companyInfo: {
          adresse: settings?.adresse || null,
          telephone: settings?.telephone || null,
          email: settings?.email || null,
          rccm: settings?.rccm || null,
          nif: (settings as any)?.niu || null,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching branding");
      // Return defaults on error
      res.json({
        appName: "MicroFlex",
        logoUrl: null,
        primaryColor: "#0f766e",
        accentColor: "#c2410c",
        theme: "DARK",
        fontFamily: "Inter",
        borderRadius: "lg",
        companyInfo: null,
      });
    }
  });

  /**
   * PUT /api/branding — admin only
   * Updates app name, logo URL, theme colors
   */
  app.put(
    "/api/branding",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.SETTINGS),
    async (req, res) => {
      try {
        const { appName, logoUrl, primaryColor, accentColor, theme, fontFamily, borderRadius, adresse, telephone, email, rccm, nif } = req.body;

        // Update systemSettings (appName, logoUrl, company info)
        const hasSettingsUpdate = [appName, logoUrl, adresse, telephone, email, rccm, nif].some(v => v !== undefined);
        if (hasSettingsUpdate) {
          const settingsUpdate: Record<string, any> = { updatedAt: new Date() };
          if (appName !== undefined) settingsUpdate.appName = appName;
          if (logoUrl !== undefined) settingsUpdate.logoUrl = logoUrl;
          if (adresse !== undefined) settingsUpdate.adresse = adresse || null;
          if (telephone !== undefined) settingsUpdate.telephone = telephone || null;
          if (email !== undefined) settingsUpdate.email = email || null;
          if (rccm !== undefined) settingsUpdate.rccm = rccm || null;
          if (nif !== undefined) settingsUpdate.niu = nif || null;

          const [existing] = await db.select({ id: systemSettings.id }).from(systemSettings);
          if (existing) {
            await db.update(systemSettings).set(settingsUpdate).where(
              eq(systemSettings.id, existing.id)
            );
          }
        }

        // Update uiCustomization (colors, theme, font, radius)
        if (primaryColor !== undefined || accentColor !== undefined || theme !== undefined || fontFamily !== undefined || borderRadius !== undefined) {
          const uiUpdate: Record<string, any> = { updatedAt: new Date() };
          if (primaryColor !== undefined) uiUpdate.primaryColor = primaryColor;
          if (accentColor !== undefined) uiUpdate.accentColor = accentColor;
          if (theme !== undefined) uiUpdate.theme = theme;
          if (fontFamily !== undefined) uiUpdate.fontFamily = fontFamily;
          if (borderRadius !== undefined) uiUpdate.borderRadius = borderRadius;

          const [existingUi] = await db.select({ id: uiCustomization.id }).from(uiCustomization);
          if (existingUi) {
            await db.update(uiCustomization).set(uiUpdate).where(
              eq(uiCustomization.id, existingUi.id)
            );
          } else {
            await db.insert(uiCustomization).values(uiUpdate);
          }
        }

        // Broadcast branding change
        const wsInstance = getWsInstance();
        if (wsInstance) {
          // Re-fetch to return complete data
          const [settings] = await db.select().from(systemSettings);
          const [ui] = await db.select().from(uiCustomization);
          const payload = {
            appName: settings?.appName || "MicroFlex",
            logoUrl: settings?.logoUrl || null,
            primaryColor: ui?.primaryColor || "#0f766e",
            accentColor: ui?.accentColor || "#c2410c",
            theme: ui?.theme || "DARK",
            fontFamily: ui?.fontFamily || "Inter",
            borderRadius: ui?.borderRadius || "lg",
            companyInfo: {
              adresse: settings?.adresse || null,
              telephone: settings?.telephone || null,
              email: settings?.email || null,
              rccm: settings?.rccm || null,
              nif: (settings as any)?.niu || null,
            },
          };
          wsInstance.broadcast({ type: "BRANDING_CHANGED" as any, payload });
          res.json(payload);
        } else {
          res.json({ success: true });
        }
      } catch (error) {
        logger.error({ err: error }, "Error updating branding");
        res.status(500).json({ message: "Erreur lors de la mise a jour du branding" });
      }
    }
  );
}
