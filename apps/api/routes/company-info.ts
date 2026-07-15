import type { Express } from "express";
import { z } from "zod";
import { createLogger } from "../lib/logger";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../db";
import { systemSettings } from "@shared/schema/settings";
import { eq } from "drizzle-orm";

const logger = createLogger("Routes:CompanyInfo");

/**
 * Informations légales de la société, imprimées sur les reçus, factures et
 * documents officiels. Ce sont des données d'exploitation (registre public),
 * distinctes de l'identité visuelle (nom/couleurs/logo) qui, elle, provient
 * exclusivement de la configuration tenant (source unique de vérité).
 */
export interface CompanyInfo {
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  rccm: string | null;
  nif: string | null;
}

const EMPTY_COMPANY_INFO: CompanyInfo = {
  adresse: null,
  telephone: null,
  email: null,
  rccm: null,
  nif: null,
};

const companyInfoBodySchema = z
  .object({
    adresse: z.string().max(255).nullish(),
    telephone: z.string().max(64).nullish(),
    email: z.string().max(255).nullish(),
    rccm: z.string().max(128).nullish(),
    nif: z.string().max(128).nullish(),
  })
  .strict();

function toCompanyInfo(settings: typeof systemSettings.$inferSelect | undefined): CompanyInfo {
  return {
    adresse: settings?.adresse ?? null,
    telephone: settings?.telephone ?? null,
    email: settings?.email ?? null,
    rccm: settings?.rccm ?? null,
    // Le NIF est stocké sous la colonne `niu` (Numéro d'Identification Unique).
    nif: settings?.niu ?? null,
  };
}

export function registerCompanyInfoRoutes(app: Express) {
  /**
   * GET /api/company-info — public (nécessaire avant auth : reçus, pied de page).
   */
  app.get("/api/company-info", async (_req, res) => {
    try {
      const [settings] = await db.select().from(systemSettings);
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(toCompanyInfo(settings));
    } catch (error) {
      logger.error({ err: error }, "Erreur lors de la lecture des informations société");
      res.json(EMPTY_COMPANY_INFO);
    }
  });

  /**
   * PUT /api/company-info — admin uniquement.
   */
  app.put(
    "/api/company-info",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.SETTINGS),
    async (req, res) => {
      const parsed = companyInfoBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ code: "INVALID_BODY", issues: parsed.error.issues });
        return;
      }

      try {
        const { adresse, telephone, email, rccm, nif } = parsed.data;
        const update: Partial<typeof systemSettings.$inferInsert> = { updatedAt: new Date() };
        if (adresse !== undefined) update.adresse = adresse || null;
        if (telephone !== undefined) update.telephone = telephone || null;
        if (email !== undefined) update.email = email || null;
        if (rccm !== undefined) update.rccm = rccm || null;
        if (nif !== undefined) update.niu = nif || null;

        const [existing] = await db.select({ id: systemSettings.id }).from(systemSettings);
        if (existing) {
          await db.update(systemSettings).set(update).where(eq(systemSettings.id, existing.id));
        } else {
          await db.insert(systemSettings).values(update);
        }

        const [settings] = await db.select().from(systemSettings);
        res.json(toCompanyInfo(settings));
      } catch (error) {
        logger.error({ err: error }, "Erreur lors de la mise à jour des informations société");
        res.status(500).json({ message: "Erreur lors de la mise à jour des informations société" });
      }
    },
  );
}
