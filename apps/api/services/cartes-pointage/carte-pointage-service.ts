/**
 * Service — Cartes de pointage.
 *
 * Orchestration métier au-dessus du storage transactionnel :
 * - ouverture d'une carte (contrôle du client et du périmètre agence) ;
 * - versement (résolution de la session de caisse de l'agent) ;
 * - retrait (règle N ≥ 2, répartition M×N − M / commission M).
 *
 * Les routes restent minces (validation zod + CASL) et délèguent ici.
 * Toute la persistance et l'atomicité vivent dans `storage/cartes-pointage`.
 */

import { storage } from "../../storage";
import {
  createCartePointage,
  createVersementCartePointage,
  createRetraitCartePointage,
  getCartePointage,
  getCartePointageByReference,
  getAllCartesPointage,
  getTransactionsPointageByCard,
  type CartePointageAvecClient,
  type RetraitCartePointageResult,
} from "../../storage/cartes-pointage";
import type { CartePointage, TransactionPointage } from "@shared/schema";
import { createLogger } from "../../lib/logger";

const logger = createLogger("Service:CartesPointage");

/** Erreur métier explicite, transformée en 400 par les routes. */
export class CartePointageError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CartePointageError";
  }
}

/**
 * Résout la session de caisse active de l'agent pour un paiement en espèces.
 * @throws CartePointageError si l'agent n'a pas de caisse ouverte.
 */
async function resolveSessionCaisse(
  paymentMethod: "CASH" | "MOBILE_MONEY",
  userId: string,
): Promise<string | undefined> {
  if (paymentMethod !== "CASH") return undefined;
  const session = await storage.getActiveSessionForUser(userId);
  if (!session) {
    throw new CartePointageError(
      "Vous devez avoir une caisse ouverte pour valider une opération en espèces",
      "CAISSE_REQUISE",
    );
  }
  return session.id as string;
}

/**
 * Ouvre une carte de pointage pour un client de l'agence.
 * Le montant unitaire M est défini par le client et figé à l'ouverture.
 * Un client peut détenir plusieurs cartes actives en parallèle.
 */
export async function ouvrirCarte(params: {
  clientId: string;
  unitAmount: string;
  agenceId: string;
  userId: string;
}): Promise<CartePointage> {
  const client = await storage.getClient(params.clientId);
  if (!client) {
    throw new CartePointageError("Client introuvable", "CLIENT_INTROUVABLE");
  }
  // Isolation agence : la carte est rattachée à l'agence de l'opération,
  // qui doit correspondre à celle du client (pas de rattachement croisé).
  if (client.agenceId && client.agenceId !== params.agenceId) {
    throw new CartePointageError(
      "Ce client n'appartient pas à votre agence",
      "AGENCE_INTERDITE",
    );
  }

  const carte = await createCartePointage({
    clientId: params.clientId,
    agenceId: params.agenceId,
    unitAmount: params.unitAmount,
    createdBy: params.userId,
  });
  logger.info(
    { cardId: carte.id, reference: carte.reference, unitAmount: carte.unitAmount },
    "Carte de pointage ouverte",
  );
  return carte;
}

/**
 * Enregistre un versement : coche la case suivante (max 31).
 * Espèces → exige la caisse ouverte de l'agent et la crédite de M.
 */
export async function effectuerVersement(params: {
  cardId: string;
  paymentMethod: "CASH" | "MOBILE_MONEY";
  idempotencyKey: string;
  userId: string;
}): Promise<TransactionPointage> {
  const sessionCaisseId = await resolveSessionCaisse(params.paymentMethod, params.userId);
  return createVersementCartePointage({ ...params, sessionCaisseId });
}

/**
 * Exécute le retrait : verse `M×N − M` au client (espèces ou Mobile Money),
 * transfère la commission `M` vers la caisse de l'agent validateur (produit
 * comptable 708300), puis clôture la carte.
 */
export async function effectuerRetrait(params: {
  cardId: string;
  paymentMethod: "CASH" | "MOBILE_MONEY";
  idempotencyKey: string;
  userId: string;
}): Promise<RetraitCartePointageResult> {
  const sessionCaisseId = await resolveSessionCaisse(params.paymentMethod, params.userId);
  return createRetraitCartePointage({ ...params, sessionCaisseId });
}

/** Détail d'une carte + son historique, avec contrôle de périmètre agence. */
export async function getCarteDetail(
  cardId: string,
  agenceId?: string,
): Promise<{ carte: CartePointage; transactions: TransactionPointage[] } | undefined> {
  const carte = await getCartePointage(cardId);
  if (!carte) return undefined;
  if (agenceId && carte.agenceId !== agenceId) return undefined;
  const transactions = await getTransactionsPointageByCard(cardId);
  return { carte, transactions };
}

/** Recherche par référence (scan du QR). Contrôle de périmètre identique. */
export async function getCarteParReference(
  reference: string,
  agenceId?: string,
): Promise<CartePointage | undefined> {
  const carte = await getCartePointageByReference(reference);
  if (!carte) return undefined;
  if (agenceId && carte.agenceId !== agenceId) return undefined;
  return carte;
}

/** Liste des cartes du périmètre (agence et/ou client). */
export async function listerCartes(filter: {
  agenceId?: string;
  clientId?: string;
  status?: "ACTIVE" | "WITHDRAWN";
}): Promise<CartePointageAvecClient[]> {
  return getAllCartesPointage(filter);
}
