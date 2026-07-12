/**
 * Constantes et utilitaires partagés par les sous-modules de workflows financiers.
 */
import { TypeOperationCaisse } from "@shared/enum/status-constants";
import { createLogger } from "../../../lib/logger";

/** Logger partagé pour le module Finance */
export const logger = createLogger('Finance');

/** Statuts terminaux des sessions — alignés avec les contraintes uniques DB sur sessions_caisse */
export const SESSION_TERMINAL_STATUSES = ["CLOSED", "RECONCILIATION_PENDING", "RECONCILIATION_COMPLETE"] as const;

/** Types de retrait depuis typePaiementTerrainEnum */
export const WITHDRAWAL_TYPES = [
  TypeOperationCaisse.WITHDRAWAL_SAVINGS,
  TypeOperationCaisse.WITHDRAWAL_CURRENT,
  TypeOperationCaisse.WITHDRAWAL_BLOCKED,
  TypeOperationCaisse.TONTINE_WITHDRAWAL,
] as const;

/** Types de dépôt depuis typePaiementTerrainEnum */
export const DEPOSIT_TYPES = [
  TypeOperationCaisse.DEPOSIT_SAVINGS,
  TypeOperationCaisse.DEPOSIT_CURRENT,
  TypeOperationCaisse.DEPOSIT_BLOCKED,
  TypeOperationCaisse.TONTINE_CONTRIBUTION,
] as const;
