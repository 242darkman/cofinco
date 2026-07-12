import type { Express } from "express";
import { requireAuth } from "../auth";
import { createLogger } from "../lib/logger";
import { D, roundFCFA } from "../lib/money";
import { storage } from "../storage";
import {
  DEFAULT_DURATIONS_CONFIG,
  calculerNombreEcheances,
  validerCoherenceFrequenceDuree,
  type DureeUnite,
  type FrequenceRemboursement,
} from "@shared/config/credit-durations";

const logger = createLogger("Routes:ConfigCreditDurations");

type DecimalInput = string | number | null | undefined;

/**
 * Enregistre les routes de configuration des fréquences et durées de crédit.
 *
 * @param app - Application Express MicroFlex.
 */
export function registerCreditDurationConfigRoutes(app: Express): void {
  /**
   * GET /api/config/durees-suggerees
   * Retourne les durées suggérées pour une fréquence donnée.
   */
  app.get("/api/config/durees-suggerees", requireAuth, async (req, res) => {
    try {
      const frequence = req.query.frequence as string | undefined;
      const durees = await storage.getDureesSuggerees(frequence);

      if (durees.length === 0) {
        return res.json(buildDefaultDurationsResponse(frequence));
      }

      const dureesWithLabels = durees.map(d => ({
        ...d,
        label: formatDureeLabel(d.dureeValeur, d.dureeUnite),
      }));

      res.json({
        durees: dureesWithLabels,
        recommandee: dureesWithLabels.find(d => d.estRecommandee === true) || dureesWithLabels[0] || null,
        source: "database",
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching durees suggerees");
      res.status(500).json({ message: "Erreur lors de la recuperation des durees suggerees" });
    }
  });

  /**
   * GET /api/config/frequences
   * Retourne les fréquences de remboursement supportées.
   */
  app.get("/api/config/frequences", requireAuth, async (_req, res) => {
    try {
      const frequences = DEFAULT_DURATIONS_CONFIG.map(config => ({
        value: config.frequence,
        label: getFrequenceLabel(config.frequence),
        uniteParDefaut: config.uniteParDefaut,
      }));

      res.json({ frequences });
    } catch (error) {
      logger.error({ err: error }, "Error fetching frequences");
      res.status(500).json({ message: "Erreur lors de la recuperation des frequences" });
    }
  });

  /**
   * POST /api/config/valider-duree
   * Valide la cohérence entre fréquence et durée de crédit.
   */
  app.post("/api/config/valider-duree", requireAuth, async (req, res) => {
    try {
      const { frequence, dureeValeur, dureeUnite } = req.body;

      if (!frequence || !dureeValeur || !dureeUnite) {
        return res.status(400).json({
          valide: false,
          message: "frequence, dureeValeur et dureeUnite sont requis",
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
          code: resultatValidation.errorCode,
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
        message: `${nombreEcheances} echeance${nombreEcheances > 1 ? "s" : ""}`,
      });
    } catch (error) {
      logger.error({ err: error }, "Error validating duree");
      res.status(500).json({ message: "Erreur lors de la validation" });
    }
  });

  /**
   * POST /api/config/calculer-echeances
   * Calcule le nombre d'échéances et, si possible, le montant d'échéance.
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

      const amounts = calculateInstallmentAmounts(montant, taux, nombreEcheances);

      res.json({
        nombreEcheances,
        montantEcheance: amounts.montantEcheance,
        montantTotal: amounts.montantTotal,
      });
    } catch (error) {
      logger.error({ err: error }, "Error calculating echeances");
      res.status(500).json({ message: "Erreur lors du calcul" });
    }
  });
}

function buildDefaultDurationsResponse(frequence?: string) {
  const defaultConfig = frequence
    ? DEFAULT_DURATIONS_CONFIG.find(c => c.frequence === frequence)
    : null;

  if (frequence && defaultConfig) {
    const durees = formatDefaultDurations(defaultConfig.frequence, defaultConfig.dureesSuggerees);
    return {
      durees,
      recommandee: durees.find(d => d.estRecommandee === 1) || durees[0] || null,
      source: "default",
    };
  }

  return {
    durees: DEFAULT_DURATIONS_CONFIG.flatMap(config =>
      formatDefaultDurations(config.frequence, config.dureesSuggerees)
    ),
    recommandee: null,
    source: "default",
  };
}

function formatDefaultDurations(
  frequence: FrequenceRemboursement,
  dureesSuggerees: Array<{ valeur: number; unite: DureeUnite; estRecommandee?: boolean; label: string }>
) {
  return dureesSuggerees.map((duree, index) => ({
    id: `default-${frequence}-${index}`,
    frequence,
    dureeValeur: duree.valeur,
    dureeUnite: duree.unite,
    estRecommandee: duree.estRecommandee ? 1 : 0,
    ordre: index,
    actif: 1,
    label: duree.label,
    createdAt: null,
  }));
}

function calculateInstallmentAmounts(
  montant: DecimalInput,
  taux: DecimalInput,
  nombreEcheances: number
): { montantEcheance: number | null; montantTotal: number | null } {
  if (!montant || !taux) {
    return { montantEcheance: null, montantTotal: null };
  }

  const dMontant = D(montant);
  const dTaux = D(taux);
  const dTotal = dMontant.times(D(1).plus(dTaux.div(100)));
  return {
    montantTotal: Number(roundFCFA(dTotal)),
    montantEcheance: nombreEcheances > 0 ? Number(roundFCFA(dTotal.div(nombreEcheances))) : 0,
  };
}

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
