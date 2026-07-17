/**
 * Cartes de pointage — référence, lectures, création et verrou pessimiste.
 * Le scope agence est appliqué DANS les requêtes (AGENTS.md §8).
 */

import { randomInt } from "node:crypto";
import { db } from "../../db";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  cartesPointage,
  transactionsPointage,
  clients,
  users,
  type CartePointage,
  type TransactionPointage,
} from "@shared/schema";
import type { CartePointageAvecClient } from "./types";

/**
 * Génère une référence de carte lisible et unique (encodée dans le QR).
 * Format : CDP-AAAA-XXXXXX (6 chiffres aléatoires + suffixe temporel court).
 */
export function generateCartePointageReference(): string {
  const year = new Date().getFullYear();
  const random = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const time = Date.now().toString(36).slice(-4).toUpperCase();
  return `CDP-${year}-${random}${time}`;
}

/** Récupère une carte par son identifiant (hors soft delete). */
export async function getCartePointage(id: string): Promise<CartePointage | undefined> {
  const [carte] = await db
    .select()
    .from(cartesPointage)
    .where(and(eq(cartesPointage.id, id), isNull(cartesPointage.deletedAt)));
  return carte || undefined;
}

/** Récupère une carte par sa référence (scan du QR par un agent). */
export async function getCartePointageByReference(reference: string): Promise<CartePointage | undefined> {
  const [carte] = await db
    .select()
    .from(cartesPointage)
    .where(and(eq(cartesPointage.reference, reference), isNull(cartesPointage.deletedAt)));
  return carte || undefined;
}

/**
 * Liste les cartes visibles selon le périmètre demandé.
 * Le scope agence est appliqué DANS la requête (AGENTS.md §8), pas après lecture.
 */
export async function getAllCartesPointage(filter: {
  agenceId?: string;
  clientId?: string;
  status?: "ACTIVE" | "WITHDRAWN";
} = {}): Promise<CartePointageAvecClient[]> {
  const conditions = [isNull(cartesPointage.deletedAt)];
  if (filter.agenceId) conditions.push(eq(cartesPointage.agenceId, filter.agenceId));
  if (filter.clientId) conditions.push(eq(cartesPointage.clientId, filter.clientId));
  if (filter.status) conditions.push(eq(cartesPointage.status, filter.status));

  // L'identité (nom/prénom) est portée par la table `users`, `clients` ne
  // contient que les champs métier : on joint donc clients → users.
  const rows = await db
    .select({
      carte: cartesPointage,
      clientNom: users.nom,
      clientPrenom: users.prenom,
    })
    .from(cartesPointage)
    .innerJoin(clients, eq(cartesPointage.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(cartesPointage.createdAt));

  return rows.map((r) => ({ ...r.carte, clientNom: r.clientNom, clientPrenom: r.clientPrenom }));
}

/** Historique des transactions d'une carte (versements + retrait). */
export async function getTransactionsPointageByCard(cardId: string): Promise<TransactionPointage[]> {
  return db
    .select()
    .from(transactionsPointage)
    .where(eq(transactionsPointage.cardId, cardId))
    .orderBy(desc(transactionsPointage.createdAt));
}

/**
 * Ouvre une nouvelle carte de pointage pour un client.
 * La référence est générée côté serveur ; le montant unitaire est figé.
 */
export async function createCartePointage(data: {
  clientId: string;
  agenceId: string;
  unitAmount: string;
  devise?: string;
  createdBy: string;
}): Promise<CartePointage> {
  const [carte] = await db
    .insert(cartesPointage)
    .values({
      reference: generateCartePointageReference(),
      clientId: data.clientId,
      agenceId: data.agenceId,
      unitAmount: data.unitAmount,
      ...(data.devise ? { devise: data.devise } : {}),
      createdBy: data.createdBy,
    })
    .returning();
  return carte;
}

/**
 * Verrouille la carte (SELECT ... FOR UPDATE) et vérifie qu'elle est active.
 * À appeler exclusivement à l'intérieur d'une transaction PostgreSQL.
 */
export async function lockCarteActive(tx: any, cardId: string): Promise<CartePointage> {
  const [carte] = await tx
    .select()
    .from(cartesPointage)
    .where(and(eq(cartesPointage.id, cardId), isNull(cartesPointage.deletedAt)))
    .for("update");

  if (!carte) throw new Error("Carte de pointage introuvable");
  if (carte.status !== "ACTIVE") {
    throw new Error("Cette carte est clôturée : aucune opération n'est possible");
  }
  return carte;
}
