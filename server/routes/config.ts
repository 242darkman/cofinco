import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";
import { requireAuth } from "../auth";

const logger = createLogger('Routes:Config');
import { addSnakeCaseAliasesDeep } from "./utils";
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
        durees: addSnakeCaseAliasesDeep(dureesWithLabels),
        recommandee: recommandee ? addSnakeCaseAliasesDeep(recommandee) : null,
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
        const montantNum = Number(montant);
        const tauxNum = Number(taux);
        montantTotal = montantNum * (1 + tauxNum / 100);
        montantEcheance = nombreEcheances > 0 ? montantTotal / nombreEcheances : 0;
      }

      res.json({
        nombreEcheances,
        montantEcheance: montantEcheance ? Math.round(montantEcheance) : null,
        montantTotal: montantTotal ? Math.round(montantTotal) : null
      });
    } catch (error) {
      logger.error({ err: error }, 'Error calculating echeances');
      res.status(500).json({ message: "Erreur lors du calcul" });
    }
  });
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
