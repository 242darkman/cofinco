import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { D, roundFCFA } from "../lib/money";
import {
  getActiveCurrency,
  setPresetsCache,
  getPresetsCache,
  type CurrencyConfig,
} from "@shared/config/currency";
import { currencyPresets } from "@shared/schema/settings";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getWsInstance } from "../ws-server";

const logger = createLogger('Routes:Config');
import {
  DEFAULT_DURATIONS_CONFIG,
  calculerNombreEcheances,
  validerCoherenceFrequenceDuree,
  type FrequenceRemboursement,
  type DureeUnite
} from "@shared/config/credit-durations";
import {
  SECURITY_CONFIG,
  requiresAccountHolderPresence,
  isOtpRequired
} from "@shared/config/security";

export function registerConfigRoutes(app: Express) {
  /**
   * GET /api/config/durees-suggerees
   * Retourne les durees suggerees pour une frequence donnee
   * Si la DB est vide, retourne les valeurs par defaut
   *
   * Query params:
   *   - frequence: "Journalier" | "Hebdomadaire" | "Mensuel" | "Bimensuel" | "Trimestriel"
   */
  app.get("/api/config/durees-suggerees", requireAuth, async (req, res) => {
    try {
      const frequence = req.query.frequence as string | undefined;

      // Fetch from DB
      const durees = await storage.getDureesSuggerees(frequence);

      // If no durees in DB, fallback to default config
      if (durees.length === 0) {
        const defaultConfig = frequence
          ? DEFAULT_DURATIONS_CONFIG.find(c => c.frequence === frequence)
          : null;

        if (frequence && defaultConfig) {
          // Format default config to match DB structure
          const formattedDurees = defaultConfig.dureesSuggerees.map((d, index) => ({
            id: `default-${frequence}-${index}`,
            frequence: defaultConfig.frequence,
            dureeValeur: d.valeur,
            dureeUnite: d.unite,
            estRecommandee: d.estRecommandee ? 1 : 0,
            ordre: index,
            actif: 1,
            label: d.label,
            createdAt: null
          }));

          return res.json({
            durees: formattedDurees,
            recommandee: formattedDurees.find(d => d.estRecommandee === 1) || formattedDurees[0] || null,
            source: "default"
          });
        }

        // Return all default configs
        const allDefaults = DEFAULT_DURATIONS_CONFIG.flatMap(config =>
          config.dureesSuggerees.map((d, index) => ({
            id: `default-${config.frequence}-${index}`,
            frequence: config.frequence,
            dureeValeur: d.valeur,
            dureeUnite: d.unite,
            estRecommandee: d.estRecommandee ? 1 : 0,
            ordre: index,
            actif: 1,
            label: d.label,
            createdAt: null
          }))
        );

        return res.json({
          durees: allDefaults,
          recommandee: null,
          source: "default"
        });
      }

      // Add label to each duree from DB
      const dureesWithLabels = durees.map(d => ({
        ...d,
        label: formatDureeLabel(d.dureeValeur, d.dureeUnite)
      }));

      // Find recommended
      const recommandee = dureesWithLabels.find(d => d.estRecommandee === true) || dureesWithLabels[0] || null;

      res.json({
        durees: dureesWithLabels,
        recommandee: recommandee ? recommandee : null,
        source: "database"
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching durees suggerees');
      res.status(500).json({ message: "Erreur lors de la recuperation des durees suggerees" });
    }
  });

  /**
   * GET /api/config/frequences
   * Retourne toutes les frequences disponibles avec leurs configurations
   */
  app.get("/api/config/frequences", requireAuth, async (req, res) => {
    try {
      const frequences = DEFAULT_DURATIONS_CONFIG.map(config => ({
        value: config.frequence,
        label: getFrequenceLabel(config.frequence),
        uniteParDefaut: config.uniteParDefaut
      }));

      res.json({ frequences });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching frequences');
      res.status(500).json({ message: "Erreur lors de la recuperation des frequences" });
    }
  });

  /**
   * POST /api/config/valider-duree
   * Valide la coherence entre frequence et duree
   */
  app.post("/api/config/valider-duree", requireAuth, async (req, res) => {
    try {
      const { frequence, dureeValeur, dureeUnite } = req.body;

      if (!frequence || !dureeValeur || !dureeUnite) {
        return res.status(400).json({
          valide: false,
          message: "frequence, dureeValeur et dureeUnite sont requis"
        });
      }

      const resultatValidation = validerCoherenceFrequenceDuree(
        frequence as FrequenceRemboursement,
        Number(dureeValeur),
        dureeUnite as DureeUnite
      );

      if (!resultatValidation.isValid) {
        return res.json({
          valide: false,
          message: resultatValidation.debugMessage || "Durée invalide",
          code: resultatValidation.errorCode
        });
      }

      const nombreEcheances = calculerNombreEcheances(
        frequence as FrequenceRemboursement,
        Number(dureeValeur),
        dureeUnite as DureeUnite
      );

      res.json({
        valide: true,
        nombreEcheances,
        message: `${nombreEcheances} echeance${nombreEcheances > 1 ? 's' : ''}`
      });
    } catch (error) {
      logger.error({ err: error }, 'Error validating duree');
      res.status(500).json({ message: "Erreur lors de la validation" });
    }
  });

  /**
   * POST /api/config/calculer-echeances
   * Calcule le nombre d'echeances pour une combinaison frequence/duree
   */
  app.post("/api/config/calculer-echeances", requireAuth, async (req, res) => {
    try {
      const { frequence, dureeValeur, dureeUnite, montant, taux } = req.body;

      if (!frequence || !dureeValeur || !dureeUnite) {
        return res.status(400).json({ message: "Parametres manquants" });
      }

      const nombreEcheances = calculerNombreEcheances(
        frequence as FrequenceRemboursement,
        Number(dureeValeur),
        dureeUnite as DureeUnite
      );

      let montantEcheance = null;
      let montantTotal = null;

      if (montant && taux) {
        const dMontant = D(montant);
        const dTaux = D(taux);
        const dTotal = dMontant.times(D(1).plus(dTaux.div(100)));
        montantTotal = Number(roundFCFA(dTotal));
        montantEcheance = nombreEcheances > 0 ? Number(roundFCFA(dTotal.div(nombreEcheances))) : 0;
      }

      res.json({
        nombreEcheances,
        montantEcheance: montantEcheance || null,
        montantTotal: montantTotal || null
      });
    } catch (error) {
      logger.error({ err: error }, 'Error calculating echeances');
      res.status(500).json({ message: "Erreur lors du calcul" });
    }
  });

  // ============================================================
  // CURRENCY CONFIGURATION
  // ============================================================

  /** GET /api/config/currency — active currency (public, needed before auth) */
  app.get("/api/config/currency", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(getActiveCurrency());
  });

  /** GET /api/config/currency/presets — all active presets from DB */
  app.get("/api/config/currency/presets", requireAuth, async (_req, res) => {
    try {
      const rows = await db.select().from(currencyPresets)
        .where(eq(currencyPresets.actif, true))
        .orderBy(currencyPresets.ordre);

      const presets: (CurrencyConfig & { id: string })[] = rows.map(r => ({
        id: r.id,
        code: r.code,
        symbol: r.symbol,
        symbolPosition: r.symbolPosition as "before" | "after",
        locale: r.locale,
        decimals: r.decimals,
      }));

      res.json(presets);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching currency presets');
      // Fallback to in-memory cache
      res.json(getPresetsCache());
    }
  });

  const currencyPresetSchema = z.object({
    code: z.string().min(2).max(5).transform(v => v.toUpperCase()),
    symbol: z.string().min(1).max(10),
    symbolPosition: z.enum(["before", "after"]).default("after"),
    locale: z.string().min(2).max(10).default("fr-FR"),
    decimals: z.number().int().min(0).max(4).default(0),
    ordre: z.number().int().min(0).optional(),
  });

  /** POST /api/config/currency/presets — create a new preset */
  app.post("/api/config/currency/presets", requireAuth, async (req, res) => {
    try {
      const data = currencyPresetSchema.parse(req.body);

      // Check uniqueness
      const existing = await db.select({ id: currencyPresets.id })
        .from(currencyPresets).where(eq(currencyPresets.code, data.code));
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
      logger.error({ err: error }, 'Error creating currency preset');
      res.status(500).json({ message: "Erreur lors de la creation" });
    }
  });

  /** PUT /api/config/currency/presets/:id — update a preset */
  app.put("/api/config/currency/presets/:id", requireAuth, async (req, res) => {
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
      logger.error({ err: error }, 'Error updating currency preset');
      res.status(500).json({ message: "Erreur lors de la mise a jour" });
    }
  });

  /** DELETE /api/config/currency/presets/:id — delete a preset (not the active one) */
  app.delete("/api/config/currency/presets/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Find the preset
      const [preset] = await db.select().from(currencyPresets).where(eq(currencyPresets.id, id));
      if (!preset) {
        return res.status(404).json({ message: "Preset non trouve" });
      }

      // Prevent deleting the active currency
      const active = getActiveCurrency();
      if (preset.code === active.code) {
        return res.status(400).json({ message: "Impossible de supprimer la devise active" });
      }

      await db.delete(currencyPresets).where(eq(currencyPresets.id, id));
      await refreshPresetsCache();
      res.json({ message: "Preset supprime" });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting currency preset');
      res.status(500).json({ message: "Erreur lors de la suppression" });
    }
  });
}

/** Reload presets from DB into runtime cache + notify clients */
async function refreshPresetsCache() {
  const rows = await db.select().from(currencyPresets)
    .where(eq(currencyPresets.actif, true))
    .orderBy(currencyPresets.ordre);

  setPresetsCache(rows.map(r => ({
    code: r.code,
    symbol: r.symbol,
    symbolPosition: r.symbolPosition as "before" | "after",
    locale: r.locale,
    decimals: r.decimals,
  })));

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({ type: "PRESETS_CHANGED" as any, payload: getPresetsCache() });
  }
}

// Helper functions
function formatDureeLabel(valeur: number, unite: string): string {
  const pluriel = valeur > 1;
  switch (unite) {
    case "Jour":
      return `${valeur} jour${pluriel ? "s" : ""}`;
    case "Semaine":
      return `${valeur} semaine${pluriel ? "s" : ""}`;
    case "Mois":
      return `${valeur} mois`;
    default:
      return `${valeur} ${unite}`;
  }
}

function getFrequenceLabel(frequence: string): string {
  switch (frequence) {
    case "Journalier":
      return "Journalier (chaque jour)";
    case "Hebdomadaire":
      return "Hebdomadaire (chaque semaine)";
    case "Mensuel":
      return "Mensuel (chaque mois)";
    case "Bimensuel":
      return "Bimensuel (2 fois par mois)";
    case "Trimestriel":
      return "Trimestriel (tous les 3 mois)";
    default:
      return frequence;
  }
}

/**
 * Routes de configuration de sécurité
 */
export function registerSecurityConfigRoutes(app: Express) {
  /**
   * GET /api/config/security
   * Retourne la configuration de sécurité actuelle
   */
  app.get("/api/config/security", requireAuth, async (_req, res) => {
    try {
      res.json({
        otpEnabled: SECURITY_CONFIG.OTP_ENABLED,
        requireAccountHolderPresence: SECURITY_CONFIG.REQUIRE_ACCOUNT_HOLDER_PRESENCE,
        operationsRequiringPresence: SECURITY_CONFIG.OPERATIONS_REQUIRING_PRESENCE,
        presenceVerificationThreshold: SECURITY_CONFIG.PRESENCE_VERIFICATION_THRESHOLD
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching security config');
      res.status(500).json({ message: "Erreur lors de la récupération de la configuration de sécurité" });
    }
  });

  /**
   * POST /api/config/security/check-presence-required
   * Vérifie si une opération nécessite la présence du titulaire
   */
  app.post("/api/config/security/check-presence-required", requireAuth, async (req, res) => {
    try {
      const { operationType, subType, amount } = req.body;

      if (!operationType) {
        return res.status(400).json({ message: "operationType est requis" });
      }

      const presenceRequired = requiresAccountHolderPresence(operationType, subType, amount);
      const otpRequired = isOtpRequired();

      res.json({
        presenceRequired,
        otpRequired,
        message: presenceRequired
          ? "La présence du titulaire du compte est requise pour cette opération"
          : otpRequired
            ? "Validation OTP requise"
            : "Aucune validation supplémentaire requise"
      });
    } catch (error) {
      logger.error({ err: error }, 'Error checking presence requirement');
      res.status(500).json({ message: "Erreur lors de la vérification" });
    }
  });
}
