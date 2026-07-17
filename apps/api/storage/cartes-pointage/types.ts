/**
 * Types et constantes du storage cartes de pointage.
 */

import type { CartePointage, TransactionPointage } from "@shared/schema";

/** Types d'événements GL du module (doivent exister dans les règles comptables seedées). */
export const GL_EVENT_DEPOT = "CARTE_POINTAGE_DEPOT";
export const GL_EVENT_RETRAIT = "CARTE_POINTAGE_RETRAIT";
export const GL_EVENT_COMMISSION = "CARTE_POINTAGE_COMMISSION";

/** Carte enrichie des informations client utiles à l'affichage. */
export interface CartePointageAvecClient extends CartePointage {
  clientNom: string | null;
  clientPrenom: string | null;
}

/** Paramètres d'un versement (pointage d'une case). */
export interface VersementCartePointageParams {
  cardId: string;
  paymentMethod: "CASH" | "MOBILE_MONEY";
  idempotencyKey: string;
  /** Session de caisse active de l'agent — obligatoire pour les espèces. */
  sessionCaisseId?: string;
  userId: string;
}

/** Paramètres d'un retrait (clôture de la carte). */
export interface RetraitCartePointageParams {
  cardId: string;
  paymentMethod: "CASH" | "MOBILE_MONEY";
  idempotencyKey: string;
  sessionCaisseId?: string;
  userId: string;
}

/** Résultat d'un retrait : la transaction créée et la répartition des fonds. */
export interface RetraitCartePointageResult {
  transaction: TransactionPointage;
  montantClient: string;
  commission: string;
  totalCollecte: string;
}
