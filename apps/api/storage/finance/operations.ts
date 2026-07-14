/**
 * Point d'entrée des requêtes d'opérations financières.
 * Découpé par responsabilité (limite de 400 lignes) :
 * - operations-caisse.ts      : opérations de caisse (table operations_caisse)
 * - operations-mouvements.ts  : mouvements financiers, décaissements en
 *                               attente, portefeuille client
 */
import { DecaissementInsufficientFundsError, InsufficientFundsError, type InsufficientFundsErrorData } from "../errors";

// Réexportation pour compatibilité
export { DecaissementInsufficientFundsError, InsufficientFundsError, type InsufficientFundsErrorData };

export * from "./operations-caisse";
export * from "./operations-mouvements";
