/**
 * Enums Drizzle — domaine « cartes-pointage ».
 *
 * Extrait de l'ancien fichier monolithique enums.ts (façade conservée) :
 * importer via `@shared/enum/enums` reste la voie standard.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================
// CARTES DE POINTAGE (épargne libre par cases)
// ============================================

/**
 * Statut du cycle de vie d'une carte de pointage.
 * ACTIVE : la carte accepte des versements et un retrait.
 * WITHDRAWN : le retrait a été effectué, la carte est clôturée/archivée.
 */
export const statutCartePointageEnum = pgEnum("statut_carte_pointage_enum", [
  "ACTIVE",
  "WITHDRAWN",
]);

/**
 * Type d'une transaction sur carte de pointage.
 * DEPOSIT : versement qui coche une case (montant = montant unitaire M).
 * WITHDRAWAL : retrait de clôture (montant client = M×N − M, commission = M).
 */
export const typeTransactionPointageEnum = pgEnum("type_transaction_pointage_enum", [
  "DEPOSIT",
  "WITHDRAWAL",
]);

export type StatutCartePointageDz = (typeof statutCartePointageEnum.enumValues)[number];
export type TypeTransactionPointageDz = (typeof typeTransactionPointageEnum.enumValues)[number];
