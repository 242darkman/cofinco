import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { requireAuth } from "../auth";
import { registerCreditDurationConfigRoutes } from "./config-credit-durations";
import { registerCurrencyConfigRoutes } from "./config-currency";
import {
  SECURITY_CONFIG,
  isOtpRequired,
  requiresAccountHolderPresence,
} from "@shared/config/security";

const logger = createLogger("Routes:Config");

/**
 * Enregistre les routes de configuration métier générales.
 *
 * Les sous-domaines volumineux sont délégués à leurs modules canoniques pour
 * conserver une route d'entrée lisible sans mélanger durées, devises et sécurité.
 *
 * @param app - Application Express MicroFlex.
 */
export function registerConfigRoutes(app: Express): void {
  registerCreditDurationConfigRoutes(app);
  registerCurrencyConfigRoutes(app);
}

/**
 * Enregistre les routes de configuration de sécurité exposées à l'API.
 *
 * @param app - Application Express MicroFlex.
 */
export function registerSecurityConfigRoutes(app: Express): void {
  /**
   * GET /api/config/security
   * Retourne la configuration de sécurité actuellement active.
   */
  app.get("/api/config/security", requireAuth, async (_req, res) => {
    try {
      res.json({
        otpEnabled: SECURITY_CONFIG.OTP_ENABLED,
        requireAccountHolderPresence: SECURITY_CONFIG.REQUIRE_ACCOUNT_HOLDER_PRESENCE,
        operationsRequiringPresence: SECURITY_CONFIG.OPERATIONS_REQUIRING_PRESENCE,
        presenceVerificationThreshold: SECURITY_CONFIG.PRESENCE_VERIFICATION_THRESHOLD,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching security config");
      res.status(500).json({ message: "Erreur lors de la récupération de la configuration de sécurité" });
    }
  });

  /**
   * POST /api/config/security/check-presence-required
   * Vérifie si une opération exige la présence physique du titulaire.
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
            : "Aucune validation supplémentaire requise",
      });
    } catch (error) {
      logger.error({ err: error }, "Error checking presence requirement");
      res.status(500).json({ message: "Erreur lors de la vérification" });
    }
  });
}
