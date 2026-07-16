/**
 * Storage — Cartes de pointage (épargne libre par cases).
 *
 * Isole la persistance Drizzle et les opérations financières transactionnelles
 * du module. Les invariants critiques (verrou pessimiste sur la carte, ACID,
 * idempotence, lien ledger/GL) sont garantis ici ; les règles de calcul pures
 * vivent dans `@shared/utils/carte-pointage`.
 */

import { randomInt } from "node:crypto";
import { db } from "../db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  cartesPointage,
  transactionsPointage,
  clients,
  users,
  operationsCaisse,
  type CartePointage,
  type TransactionPointage,
} from "@shared/schema";
import {
  NOMBRE_CASES_CARTE_POINTAGE,
  calculerRetraitCartePointage,
  peutPointer,
  peutRetirer,
  MIN_VERSEMENTS_POUR_RETRAIT,
} from "@shared/utils/carte-pointage";
import {
  executeWithLedger,
  createMouvementFinancier,
  createMouvementEvents,
  updateSessionSolde,
  validateUserId,
  type MouvementFinancier,
} from "../services/ledger";
import { postGlForMouvement } from "../services/accounting-posting-service";
import { validateAccountingRule, isGLStrictMode } from "../services/accounting-validation";
import { createLogger } from "../lib/logger";

const logger = createLogger("Storage:CartesPointage");

/** Types d'événements GL du module (doivent exister dans les règles comptables seedées). */
const GL_EVENT_DEPOT = "CARTE_POINTAGE_DEPOT";
const GL_EVENT_RETRAIT = "CARTE_POINTAGE_RETRAIT";
const GL_EVENT_COMMISSION = "CARTE_POINTAGE_COMMISSION";

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
async function lockCarteActive(tx: any, cardId: string): Promise<CartePointage> {
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

/**
 * Enregistre un versement : coche la case suivante de la carte.
 *
 * Atomique via `executeWithLedger` (mouvement financier + GL + événements +
 * opération métier dans une seule transaction PostgreSQL, rollback complet
 * en cas d'échec). Idempotent par `idempotencyKey` (unicité en base +
 * vérification ledger).
 *
 * Espèces : la caisse ouverte de l'agent est créditée du montant unitaire M
 * et une opération de caisse est tracée (1 mouvement de solde = 1 opération).
 */
export async function createVersementCartePointage(
  params: VersementCartePointageParams,
): Promise<TransactionPointage> {
  const isCash = params.paymentMethod === "CASH";
  if (isCash && !params.sessionCaisseId) {
    throw new Error("Une session de caisse active est requise pour les versements en espèces");
  }

  // Lecture hors transaction uniquement pour le contexte du mouvement (agence, client, montant).
  const carteInfo = await getCartePointage(params.cardId);
  if (!carteInfo) throw new Error("Carte de pointage introuvable");

  const { result } = await executeWithLedger(
    "EPARGNE",
    {
      montant: carteInfo.unitAmount,
      sens: "CREDIT",
      clientId: carteInfo.clientId,
      agenceId: carteInfo.agenceId,
      sessionCaisseId: isCash ? params.sessionCaisseId : undefined,
      typePaiement: GL_EVENT_DEPOT,
      methodePaiement: params.paymentMethod,
      referenceExterne: carteInfo.reference,
      idempotencyKey: params.idempotencyKey,
      metadata: { cardId: carteInfo.id, cardReference: carteInfo.reference },
    },
    async (tx, mouvement) => {
      // 1. Verrou pessimiste + revalidation des invariants sous verrou.
      const carte = await lockCarteActive(tx, params.cardId);
      if (!peutPointer(carte.completedSlots)) {
        throw new Error(
          `Carte pleine : les ${NOMBRE_CASES_CARTE_POINTAGE} cases sont déjà pointées`,
        );
      }
      const slotNumber = carte.completedSlots + 1;

      // 2. Journal immuable du versement, lié au mouvement du ledger.
      const [transaction] = await tx
        .insert(transactionsPointage)
        .values({
          cardId: carte.id,
          type: "DEPOSIT",
          amount: carte.unitAmount,
          commissionAmount: "0",
          slotNumber,
          paymentMethod: params.paymentMethod,
          sessionCaisseId: isCash ? params.sessionCaisseId : null,
          mouvementFinancierId: mouvement.id,
          idempotencyKey: params.idempotencyKey,
          createdBy: params.userId,
        })
        .returning();

      // 3. Progression de la carte (verrouillage optimiste incrémenté).
      await tx
        .update(cartesPointage)
        .set({
          completedSlots: slotNumber,
          updatedAt: new Date(),
          version: sql`${cartesPointage.version} + 1`,
        })
        .where(eq(cartesPointage.id, carte.id));

      // 4. Espèces : créditer la caisse ouverte de l'agent + traçabilité caisse.
      let nouveauSoldeSession: string | undefined;
      if (isCash && params.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(
          tx,
          params.sessionCaisseId,
          Number(carte.unitAmount),
        );
        const validatedUserId = await validateUserId(tx, params.userId);
        await tx.insert(operationsCaisse).values({
          sessionId: params.sessionCaisseId,
          mouvementId: mouvement.id,
          typeOperation: "MISC_COLLECTION",
          montant: carte.unitAmount,
          methodePaiement: "CASH",
          reference: `CDP-IN-${carte.reference}`,
          description: `Versement carte de pointage ${carte.reference} (case ${slotNumber}/${NOMBRE_CASES_CARTE_POINTAGE})`,
          createdBy: validatedUserId,
        });
      }

      return { result: transaction, additionalEventData: { nouveauSoldeSession } };
    },
    params.userId,
  );

  return result;
}

/**
 * Exécute le retrait et clôture la carte.
 *
 * Répartition contractuelle (voir `calculerRetraitCartePointage`) :
 * - le client reçoit `A = M×N − M` (espèces via la caisse, ou Mobile Money) ;
 * - la retenue `M` est comptabilisée en commission (produit 708300) au titre
 *   des frais de gestion, rattachée à la session de caisse de l'agent validateur.
 *
 * Le tout est atomique : mouvement de retrait (via `executeWithLedger`) et
 * mouvement de commission (créé et posté au GL dans la même transaction).
 * Refus si N < MIN_VERSEMENTS_POUR_RETRAIT.
 */
export async function createRetraitCartePointage(
  params: RetraitCartePointageParams,
): Promise<RetraitCartePointageResult> {
  const isCash = params.paymentMethod === "CASH";
  if (isCash && !params.sessionCaisseId) {
    throw new Error("Une session de caisse active est requise pour un retrait en espèces");
  }

  const carteInfo = await getCartePointage(params.cardId);
  if (!carteInfo) throw new Error("Carte de pointage introuvable");
  if (!peutRetirer(carteInfo.completedSlots)) {
    throw new Error(
      `Retrait refusé : au moins ${MIN_VERSEMENTS_POUR_RETRAIT} versements sont requis ` +
      `(actuellement ${carteInfo.completedSlots})`,
    );
  }

  const repartition = calculerRetraitCartePointage(carteInfo.unitAmount, carteInfo.completedSlots);

  // Pré-validation de la règle comptable de commission AVANT la transaction,
  // symétrique à celle qu'executeWithLedger applique au mouvement principal.
  if (isGLStrictMode()) {
    await validateAccountingRule(GL_EVENT_COMMISSION, carteInfo.agenceId);
  }

  const { result } = await executeWithLedger(
    "EPARGNE",
    {
      montant: repartition.montantClient,
      sens: "DEBIT",
      clientId: carteInfo.clientId,
      agenceId: carteInfo.agenceId,
      sessionCaisseId: isCash ? params.sessionCaisseId : undefined,
      typePaiement: GL_EVENT_RETRAIT,
      methodePaiement: params.paymentMethod,
      referenceExterne: carteInfo.reference,
      idempotencyKey: params.idempotencyKey,
      metadata: {
        cardId: carteInfo.id,
        cardReference: carteInfo.reference,
        commission: repartition.commission,
      },
    },
    async (tx, mouvement) => {
      // 1. Verrou pessimiste + revalidation sous verrou (concurrence retrait/versement).
      const carte = await lockCarteActive(tx, params.cardId);
      if (!peutRetirer(carte.completedSlots)) {
        throw new Error(
          `Retrait refusé : au moins ${MIN_VERSEMENTS_POUR_RETRAIT} versements sont requis`,
        );
      }
      // Recalcul sous verrou : le N verrouillé fait foi, pas la lecture initiale.
      const montants = calculerRetraitCartePointage(carte.unitAmount, carte.completedSlots);

      // 2. Mouvement de commission (retenue M), créé dans la MÊME transaction.
      const mouvementCommission: MouvementFinancier = await createMouvementFinancier(
        tx,
        {
          montant: montants.commission,
          sens: "CREDIT",
          sourceModule: "FRAIS",
          clientId: carte.clientId,
          agenceId: carte.agenceId,
          sessionCaisseId: isCash ? params.sessionCaisseId : undefined,
          typePaiement: GL_EVENT_COMMISSION,
          methodePaiement: params.paymentMethod,
          referenceExterne: carte.reference,
          idempotencyKey: `${params.idempotencyKey}:commission`,
          metadata: { cardId: carte.id, cardReference: carte.reference },
        },
        params.userId,
      );
      await createMouvementEvents(tx, mouvementCommission);
      await postGlForMouvement(tx, mouvementCommission, carte.agenceId, params.userId, {
        eventType: GL_EVENT_COMMISSION,
        cardReference: carte.reference,
      });

      // 3. Journal immuable du retrait.
      const [transaction] = await tx
        .insert(transactionsPointage)
        .values({
          cardId: carte.id,
          type: "WITHDRAWAL",
          amount: montants.montantClient,
          commissionAmount: montants.commission,
          slotNumber: null,
          paymentMethod: params.paymentMethod,
          sessionCaisseId: isCash ? params.sessionCaisseId : null,
          mouvementFinancierId: mouvement.id,
          idempotencyKey: params.idempotencyKey,
          createdBy: params.userId,
        })
        .returning();

      // 4. Clôture de la carte (archivage, plus aucune opération possible).
      await tx
        .update(cartesPointage)
        .set({
          status: "WITHDRAWN",
          withdrawnAt: new Date(),
          updatedAt: new Date(),
          version: sql`${cartesPointage.version} + 1`,
        })
        .where(eq(cartesPointage.id, carte.id));

      // 5. Espèces : sortie de caisse du montant restitué au client.
      //    La commission M reste physiquement dans la caisse : elle est
      //    reclassée comptablement en produit (4193 → 708300), sans mouvement d'espèces.
      let nouveauSoldeSession: string | undefined;
      if (isCash && params.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(
          tx,
          params.sessionCaisseId,
          -Number(montants.montantClient),
        );
        const validatedUserId = await validateUserId(tx, params.userId);
        await tx.insert(operationsCaisse).values({
          sessionId: params.sessionCaisseId,
          mouvementId: mouvement.id,
          typeOperation: "MISC_DISBURSEMENT",
          montant: montants.montantClient,
          methodePaiement: "CASH",
          reference: `CDP-OUT-${carte.reference}`,
          description: `Retrait carte de pointage ${carte.reference} (${carte.completedSlots} versements, commission ${montants.commission})`,
          createdBy: validatedUserId,
        });
      }

      logger.info(
        {
          cardId: carte.id,
          reference: carte.reference,
          versements: carte.completedSlots,
          montantClient: montants.montantClient,
          commission: montants.commission,
        },
        "Retrait carte de pointage exécuté",
      );

      return {
        result: {
          transaction,
          montantClient: montants.montantClient,
          commission: montants.commission,
          totalCollecte: montants.totalCollecte,
        },
        additionalEventData: { nouveauSoldeSession },
      };
    },
    params.userId,
  );

  return result;
}
