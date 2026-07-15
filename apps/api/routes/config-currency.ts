import type { Express } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { Actions, Subjects } from "@shared/ability";
import {
  getActiveCurrency,
  getPresetsCache,
  setPresetsCache,
  type CurrencyConfig,
} from "@shared/config/currency";
import { currencyPresets } from "@shared/schema/settings";
import { attachAbility, requireAbility } from "../authorization";
import { requireAuth } from "../auth";
import { db } from "../db";
import { createLogger } from "../lib/logger";
import { getWsInstance } from "../ws-server";

const logger = createLogger("Routes:ConfigCurrency");

const currencyPresetSchema = z.object({
  code: z.string().min(2).max(5).transform(v => v.toUpperCase()),
  symbol: z.string().min(1).max(10),
  symbolPosition: z.enum(["before", "after"]).default("after"),
  locale: z.string().min(2).max(10).default("fr-FR"),
  decimals: z.number().int().min(0).max(4).default(0),
  ordre: z.number().int().min(0).optional(),
});

/**
 * Enregistre les routes de configuration des devises et presets monétaires.
 *
 * @param app - Application Express MicroFlex.
 */
export function registerCurrencyConfigRoutes(app: Express): void {
  /**
   * GET /api/config/currency
   * Retourne la devise active, exposée publiquement avant authentification.
   */
  app.get("/api/config/currency", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(getActiveCurrency());
  });

  /**
   * GET /api/config/currency/presets
   * Retourne tous les presets de devises actifs.
   */
  app.get("/api/config/currency/presets", requireAuth, async (_req, res) => {
    try {
      const rows = await db.select().from(currencyPresets)
        .where(eq(currencyPresets.actif, true))
        .orderBy(currencyPresets.ordre);

      const presets: (CurrencyConfig & { id: string })[] = rows.map(row => ({
        id: row.id,
        code: row.code,
        symbol: row.symbol,
        symbolPosition: row.symbolPosition as "before" | "after",
        locale: row.locale,
        decimals: row.decimals,
      }));

      res.json(presets);
    } catch (error) {
      logger.error({ err: error }, "Error fetching currency presets");
      res.json(getPresetsCache());
    }
  });

  /**
   * POST /api/config/currency/presets
   * Crée un preset de devise.
   */
  app.post(
    "/api/config/currency/presets",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.SETTINGS),
    async (req, res) => {
      try {
        const data = currencyPresetSchema.parse(req.body);

        const existing = await db.select({ id: currencyPresets.id })
          .from(currencyPresets)
          .where(eq(currencyPresets.code, data.code));

        if (existing.length > 0) {
          return res.status(409).json({ message: `La devise ${data.code} existe deja` });
        }

        const [created] = await db.insert(currencyPresets).values({
          code: data.code,
          symbol: data.symbol,
          symbolPosition: data.symbolPosition,
          locale: data.locale,
          decimals: data.decimals,
          ordre: data.ordre ?? 99,
          actif: true,
        }).returning();

        await refreshPresetsCache();
        res.status(201).json(created);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Donnees invalides", errors: error.errors });
        }
        logger.error({ err: error }, "Error creating currency preset");
        res.status(500).json({ message: "Erreur lors de la creation" });
      }
    }
  );

  /**
   * PUT /api/config/currency/presets/:id
   * Met à jour un preset de devise.
   */
  app.put(
    "/api/config/currency/presets/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.SETTINGS),
    async (req, res) => {
      try {
        const { id } = req.params;
        const data = currencyPresetSchema.partial().parse(req.body);

        const [updated] = await db.update(currencyPresets)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(currencyPresets.id, id))
          .returning();

        if (!updated) {
          return res.status(404).json({ message: "Preset non trouve" });
        }

        await refreshPresetsCache();
        res.json(updated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Donnees invalides", errors: error.errors });
        }
        logger.error({ err: error }, "Error updating currency preset");
        res.status(500).json({ message: "Erreur lors de la mise a jour" });
      }
    }
  );

  /**
   * DELETE /api/config/currency/presets/:id
   * Supprime un preset si ce n'est pas la devise active.
   */
  app.delete(
    "/api/config/currency/presets/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.SETTINGS),
    async (req, res) => {
      try {
        const { id } = req.params;
        const [preset] = await db.select().from(currencyPresets).where(eq(currencyPresets.id, id));

        if (!preset) {
          return res.status(404).json({ message: "Preset non trouve" });
        }

        if (preset.code === getActiveCurrency().code) {
          return res.status(400).json({ message: "Impossible de supprimer la devise active" });
        }

        await db.delete(currencyPresets).where(eq(currencyPresets.id, id));
        await refreshPresetsCache();
        res.json({ message: "Preset supprime" });
      } catch (error) {
        logger.error({ err: error }, "Error deleting currency preset");
        res.status(500).json({ message: "Erreur lors de la suppression" });
      }
    }
  );
}

/**
 * Recharge les presets depuis la base, met à jour le cache runtime et notifie les clients.
 */
async function refreshPresetsCache(): Promise<void> {
  const rows = await db.select().from(currencyPresets)
    .where(eq(currencyPresets.actif, true))
    .orderBy(currencyPresets.ordre);

  setPresetsCache(rows.map(row => ({
    code: row.code,
    symbol: row.symbol,
    symbolPosition: row.symbolPosition as "before" | "after",
    locale: row.locale,
    decimals: row.decimals,
  })));

  getWsInstance()?.broadcast({
    type: "PRESETS_CHANGED",
    payload: getPresetsCache(),
  });
}
