/**
 * Barrel file de compatibilité — le fichier original est découpé en sous-modules
 * dans le répertoire ./workflows/.
 *
 * Tous les consommateurs existants continuent de fonctionner
 * via ces réexportations.
 */
export { DecaissementInsufficientFundsError, InsufficientFundsError, type InsufficientFundsErrorData } from "../errors";
export * from "./workflows/shared";
export * from "./workflows/transactions";
export * from "./workflows/factures-credits";
export * from "./workflows/factures-comptes";
export * from "./workflows/coffre";
export * from "./workflows/caisse-workflows";