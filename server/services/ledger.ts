import { db } from "../db";
import {
  mouvementsFinanciers,
  evenementsOutbox,
  comptes,
  credits,
  sessionsCaisse,
  tontines,
  caisses,
  users,
  clients,
  membresTontine
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { TypeCompte } from "@shared/enum/status-constants";
import accountingPostingService from "./accounting-posting-service";

// Infer MouvementFinancier type from table
export type MouvementFinancier = typeof mouvementsFinanciers.$inferSelect;

// Types for the ledger service
export type SourceModule = "CAISSE" | "EPARGNE" | "CREDIT" | "TONTINE" | "TERRAIN" | "TRANSFERT" | "SYSTEME" | "CAISSE_AGENT" | "VERSEMENT_AUTO" | "DECAISSEMENT_PROGRAMME" | "COMPTE" | "COFFRE" | "MOBILE_MONEY";
export type SensMouvement = "DEBIT" | "CREDIT";
export type TypeEvenement =
  | "MOUVEMENT_CREE"
  | "MOUVEMENT_STATUT_CHANGE"
  | "SOLDE_COMPTE_CHANGE"
  | "CREDIT_SOLDE_CHANGE"
  | "SESSION_CAISSE_CHANGE"
  | "TRANSFERT_CAISSE_CHANGE"
  | "COMPTE_CREE"
  | "COMPTE_BLOQUE"
  | "COMPTE_DEBLOQUE"
  | "COMPTE_TRANSFERE_AGENCE";

export interface MouvementData {
  montant: string;
  sens: SensMouvement;
  sourceModule: SourceModule;
  typePaiement?: string;
  methodePaiement?: string;
  clientId?: string;
  compteId?: string;
  creditId?: string;
  tontineId?: string;
  sessionCaisseId?: string;
  agenceId?: string;
  agentId?: string;
  referenceExterne?: string;
  sourceId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface OutboxEventData {
  type: TypeEvenement;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, any>;
}

/**
 * Generate a unique reference for a movement
 */
export function generateReference(sourceModule: SourceModule | "TIC"): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const time = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  
  const prefixes: Record<SourceModule | "TIC", string> = {
    CAISSE: "CAI",
    EPARGNE: "EPG",
    CREDIT: "CRD",
    TONTINE: "TON",
    TERRAIN: "TER",
    TRANSFERT: "TRF",
    SYSTEME: "SYS",
    CAISSE_AGENT: "CAG",
    VERSEMENT_AUTO: "VAU",
    DECAISSEMENT_PROGRAMME: "DCP",
    COMPTE: "CPT",
    TIC: "TIC",
    COFFRE: "COF",
    MOBILE_MONEY: "MMO",
  };
  
  return `${prefixes[sourceModule]}-${year}${month}${day}-${time}${random}`;
}

/**
 * Validate that a user ID exists in the database
 * Returns the user ID if valid, undefined if not found
 * This prevents foreign key constraint violations
 */
export async function validateUserId(
  tx: PgTransaction<any, any, any>,
  userId?: string
): Promise<string | undefined> {
  if (!userId) return undefined;
  
  const [userExists] = await tx.select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  if (!userExists) {
    console.warn(`Warning: User ID ${userId} does not exist. Will use null for created_by`);
    return undefined;
  }
  
  return userId;
}

/**
 * Create a mouvement financier within a transaction
 */
export async function createMouvementFinancier(
  tx: PgTransaction<any, any, any>,
  data: MouvementData,
  createdBy?: string
): Promise<MouvementFinancier> {
  const reference = generateReference(data.sourceModule);
  
  // Validate user existence if createdBy is provided
  const validatedUserId = await validateUserId(tx, createdBy);
  
  const [mouvement] = await tx.insert(mouvementsFinanciers).values({
    montant: data.montant,
    sens: data.sens,
    sourceModule: data.sourceModule,
    typePaiement: data.typePaiement as any,
    methodePaiement: data.methodePaiement as any,
    clientId: data.clientId,
    compteId: data.compteId,
    creditId: data.creditId,
    tontineId: data.tontineId,
    sessionCaisseId: data.sessionCaisseId,
    agenceId: data.agenceId,
    agentId: data.agentId,
    reference,
    referenceExterne: data.referenceExterne || null,
    idempotencyKey: data.idempotencyKey || null,
    metadata: data.metadata,
    createdBy: validatedUserId,
    dateOperation: new Date(),
  }).returning();
  
  return mouvement;
}

/**
 * Create an outbox event within a transaction
 */
export async function createOutboxEvent(
  tx: PgTransaction<any, any, any>,
  event: OutboxEventData
): Promise<void> {
  await tx.insert(evenementsOutbox).values({
    type: event.type as any,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
  });
}

/**
 * Publish events for a mouvement to all relevant channels
 * Following the user's channel structure:
 * - client:{clientId} - portfolio + global alerts
 * - compte:{compteId} - balance + movements
 * - credit:{creditId} - remaining balance + schedule + payments
 * - tontine:{tontineId} - contributions + rounds
 * - session_caisse:{sessionId} - theoretical balance + operations
 * - agent:{agentId} - day/month stats + remises
 */
export async function createMouvementEvents(
  tx: PgTransaction<any, any, any>,
  mouvement: MouvementFinancier,
  additionalData?: {
    agentId?: string;
    nouveauSoldeCompte?: string;
    nouveauSoldeCredit?: string;
    nouveauSoldeSession?: string;
    nouveauSoldeCoffre?: string;
  }
): Promise<void> {
  const payload = {
    mouvementId: mouvement.id,
    reference: mouvement.reference,
    montant: mouvement.montant,
    sens: mouvement.sens,
    typePaiement: mouvement.typePaiement,
    sourceModule: mouvement.sourceModule,
    dateOperation: mouvement.dateOperation,
  };

  // Always emit MOUVEMENT_CREE
  // Publish to client channel if clientId is known
  if (mouvement.clientId) {
    await createOutboxEvent(tx, {
      type: "MOUVEMENT_CREE",
      aggregateType: "client",
      aggregateId: mouvement.clientId,
      payload: { ...payload, clientId: mouvement.clientId },
    });
  }

  // Publish to compte channel if compteId is set
  if (mouvement.compteId) {
    await createOutboxEvent(tx, {
      type: "MOUVEMENT_CREE",
      aggregateType: "compte",
      aggregateId: mouvement.compteId,
      payload: { ...payload, compteId: mouvement.compteId },
    });

    // Also emit SOLDE_COMPTE_CHANGE if we have the new balance
    if (additionalData?.nouveauSoldeCompte) {
      await createOutboxEvent(tx, {
        type: "SOLDE_COMPTE_CHANGE",
        aggregateType: "compte",
        aggregateId: mouvement.compteId,
        payload: {
          compteId: mouvement.compteId,
          nouveauSolde: additionalData.nouveauSoldeCompte,
          mouvementId: mouvement.id,
        },
      });
    }
  }

  // Publish to credit channel if creditId is set
  if (mouvement.creditId) {
    await createOutboxEvent(tx, {
      type: "MOUVEMENT_CREE",
      aggregateType: "credit",
      aggregateId: mouvement.creditId,
      payload: { ...payload, creditId: mouvement.creditId },
    });

    // Also emit CREDIT_SOLDE_CHANGE if we have the new balance
    if (additionalData?.nouveauSoldeCredit) {
      await createOutboxEvent(tx, {
        type: "CREDIT_SOLDE_CHANGE",
        aggregateType: "credit",
        aggregateId: mouvement.creditId,
        payload: {
          creditId: mouvement.creditId,
          nouveauSolde: additionalData.nouveauSoldeCredit,
          mouvementId: mouvement.id,
        },
      });
    }
  }

  // Publish to tontine channel if tontineId is set
  if (mouvement.tontineId) {
    await createOutboxEvent(tx, {
      type: "MOUVEMENT_CREE",
      aggregateType: "tontine",
      aggregateId: mouvement.tontineId,
      payload: { ...payload, tontineId: mouvement.tontineId },
    });
  }

  // Publish to session_caisse channel if sessionCaisseId is set
  if (mouvement.sessionCaisseId) {
    await createOutboxEvent(tx, {
      type: "MOUVEMENT_CREE",
      aggregateType: "session_caisse",
      aggregateId: mouvement.sessionCaisseId,
      payload: { ...payload, sessionCaisseId: mouvement.sessionCaisseId },
    });

    // Also emit SESSION_CAISSE_CHANGE if we have the new balance
    if (additionalData?.nouveauSoldeSession) {
      await createOutboxEvent(tx, {
        type: "SESSION_CAISSE_CHANGE",
        aggregateType: "session_caisse",
        aggregateId: mouvement.sessionCaisseId,
        payload: {
          sessionCaisseId: mouvement.sessionCaisseId,
          nouveauSoldeTheorique: additionalData.nouveauSoldeSession,
          mouvementId: mouvement.id,
        },
      });
    }
  }

  // Publish to agent channel for TERRAIN source
  if (mouvement.sourceModule === "TERRAIN" && additionalData?.agentId) {
    await createOutboxEvent(tx, {
      type: "MOUVEMENT_CREE",
      aggregateType: "agent",
      aggregateId: additionalData.agentId,
      payload: { ...payload, agentId: additionalData.agentId },
    });
  }

  // Recalculate Total Savings for Client
  if (mouvement.clientId) {
      await recalculateClientSavings(tx, mouvement.clientId);
  }
}

/**
 * Recalculate Total Savings (Epargne + Bloqué + Tontine Contributions)
 */
async function recalculateClientSavings(tx: PgTransaction<any, any, any>, clientId: string) {
    try {
        const { inArray, eq, and, sql } = await import("drizzle-orm");
        
        // Sum accounts (Epargne + Bloqué)
        const [accountsSum] = await tx.select({ total: sql<string>`sum(${comptes.soldeCourant})` })
            .from(comptes)
            .where(and(
                eq(comptes.clientId, clientId),
                inArray(comptes.typeCompte, [TypeCompte.SAVINGS, TypeCompte.BLOCKED])
            ));

        // Sum tontine contributions
        const [tontineSum] = await tx.select({ total: sql<string>`sum(${membresTontine.totalCotisations})` })
            .from(membresTontine)
            .where(eq(membresTontine.clientId, clientId));

        const total = (Number(accountsSum?.total) || 0) + (Number(tontineSum?.total) || 0);

        // Update client
        await tx.update(clients)
            .set({ 
                epargneTotal: total.toString(),
                updatedAt: new Date()
            })
            .where(eq(clients.id, clientId));
    } catch (error) {
        console.error(`Error calculating savings for client ${clientId}:`, error);
        // Do not block the transaction for this
    }
}

/**
 * Update compte solde within a transaction
 */
/**
 * Update compte solde within a transaction (Atomic Update)
 */
export async function updateCompteSolde(
  tx: PgTransaction<any, any, any>,
  compteId: string,
  delta: number
): Promise<string> {
  // Pessimistic Lock (SELECT ... FOR UPDATE) to prevent race conditions
  await tx
    .select({ id: comptes.id })
    .from(comptes)
    .where(eq(comptes.id, compteId))
    .for("update");

  // Atomic update to handle concurrency
  const [updated] = await tx.update(comptes)
    .set({ 
      soldeCourant: sql`${comptes.soldeCourant} + ${delta}`,
      updatedAt: new Date() 
    })
    .where(eq(comptes.id, compteId))
    .returning({ solde: comptes.soldeCourant });

  if (!updated) throw new Error(`Compte ${compteId} not found`);
  return updated.solde;
}

/**
 * Update credit solde restant within a transaction (Atomic Update)
 */
export async function updateCreditSolde(
  tx: PgTransaction<any, any, any>,
  creditId: string,
  delta: number
): Promise<string> {
  // Pessimistic Lock
  await tx
    .select({ id: credits.id })
    .from(credits)
    .where(eq(credits.id, creditId))
    .for("update");

  // Atomic update
  // Note: GREATEST(0, ...) check might differ between DBs, but works in Postgres
  const [updated] = await tx.update(credits)
    .set({ 
      soldeRestant: sql`GREATEST(0, ${credits.soldeRestant} + ${delta})`, 
      updatedAt: new Date() 
    })
    .where(eq(credits.id, creditId))
    .returning({ solde: credits.soldeRestant });
  
  if (!updated) throw new Error(`Credit ${creditId} not found`);
  return updated.solde || "0";
}

/**
 * Update session caisse solde theorique within a transaction (Atomic Update)
 * IMPORTANT: Synchronise aussi le solde de la caisse physique pour garantir la cohérence
 *            en cas de fermeture inattendue de la session
 *
 * @param tx - Transaction PostgreSQL
 * @param sessionId - ID de la session caisse
 * @param delta - Montant à ajouter (positif = entrée, négatif = sortie)
 * @param syncCaisseBalance - Si true, synchronise aussi caisses.solde (défaut: true)
 *                            Mettre à false pour les transferts de clôture où le solde
 *                            caisse est déjà géré par finalizeClose
 */
export async function updateSessionSolde(
  tx: PgTransaction<any, any, any>,
  sessionId: string,
  delta: number,
  syncCaisseBalance: boolean = true
): Promise<string> {
  // Pessimistic Lock on session
  const [session] = await tx
    .select({ id: sessionsCaisse.id, caisseId: sessionsCaisse.caisseId })
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.id, sessionId))
    .for("update");

  if (!session) throw new Error(`Session ${sessionId} not found`);

  // 1. Mettre à jour le solde théorique de la session (montantFermetureTheorique)
  const [updated] = await tx.update(sessionsCaisse)
    .set({
      montantFermetureTheorique: sql`COALESCE(${sessionsCaisse.montantFermetureTheorique}, 0) + ${delta}`,
      lastActivity: new Date(),
      updatedAt: new Date()
    })
    .where(eq(sessionsCaisse.id, sessionId))
    .returning({ solde: sessionsCaisse.montantFermetureTheorique });

  // 2. Synchroniser le solde de la caisse physique pour cohérence en cas de crash
  //    Cela garantit que caisses.solde reflète toujours le solde temps réel
  //    Note: Désactivé pour les transferts de clôture où le solde est géré séparément
  if (syncCaisseBalance && session.caisseId) {
    await tx.update(caisses)
      .set({
        solde: sql`COALESCE(${caisses.solde}, 0) + ${delta}`,
        updatedAt: new Date()
      })
      .where(eq(caisses.id, session.caisseId));
  }

  return updated?.solde || "0";
}

/**
 * Update tontine solde within a transaction (Atomic Update)
 */
export async function updateTontineSolde(
  tx: PgTransaction<any, any, any>,
  tontineId: string,
  delta: number
): Promise<string> {
  // Pessimistic Lock
  await tx
    .select({ id: tontines.id })
    .from(tontines)
    .where(eq(tontines.id, tontineId))
    .for("update");

  const [updated] = await tx.update(tontines)
    .set({ 
      solde: sql`${tontines.solde} + ${delta}`,
      updatedAt: new Date()
    })
    .where(eq(tontines.id, tontineId))
    .returning({ solde: tontines.solde });
  
  if (!updated) throw new Error(`Tontine ${tontineId} not found`);
  return updated.solde || "0";
}

/**
 * Update caisse solde within a transaction (Atomic Update)
 */
export async function updateCaisseSolde(
  tx: PgTransaction<any, any, any>,
  caisseId: string,
  delta: number
): Promise<string> {
  // Pessimistic Lock
  await tx
    .select({ id: caisses.id })
    .from(caisses)
    .where(eq(caisses.id, caisseId))
    .for("update");

  const [updated] = await tx.update(caisses)
    .set({ 
      solde: sql`${caisses.solde} + ${delta}`,
      updatedAt: new Date()
    })
    .where(eq(caisses.id, caisseId))
    .returning({ solde: caisses.solde });
  
  if (!updated) throw new Error(`Caisse ${caisseId} not found`);
  return updated.solde || "0";
}

/**
 * Check idempotency key uniqueness
 */
export async function checkIdempotencyKey(idempotencyKey: string): Promise<boolean> {
  const [existing] = await db.select()
    .from(mouvementsFinanciers)
    .where(eq(mouvementsFinanciers.idempotencyKey, idempotencyKey));
  return !existing;
}

/**
 * Execute an operation with full ledger flow
 * This is the main entry point for all financial operations
 */
export async function executeWithLedger<T>(
  sourceModule: SourceModule,
  mouvementData: Omit<MouvementData, "sourceModule">,
  operation: (
    tx: PgTransaction<any, any, any>,
    mouvement: MouvementFinancier
  ) => Promise<{ result: T; additionalEventData?: Parameters<typeof createMouvementEvents>[2] }>,
  userId?: string
): Promise<{ result: T; mouvement: MouvementFinancier }> {
  // Check idempotency before starting transaction
  if (mouvementData.idempotencyKey) {
    const isUnique = await checkIdempotencyKey(mouvementData.idempotencyKey);
    if (!isUnique) {
      throw new Error(`Duplicate idempotency key: ${mouvementData.idempotencyKey}`);
    }
  }

  const transactionResult = await db.transaction(async (tx) => {
    // 1. Create mouvement financier
    const mouvement = await createMouvementFinancier(
      tx,
      { ...mouvementData, sourceModule },
      userId
    );

    // 2. Execute the business operation
    const { result, additionalEventData } = await operation(tx, mouvement);

    // 3. Create outbox events for all relevant channels
    await createMouvementEvents(tx, mouvement, additionalEventData);

    return { result, mouvement, additionalEventData };
  });

  // 4. Post to GL asynchronously (fire-and-forget, non-blocking)
  // This ensures the business transaction succeeds even if GL posting fails
  // GL posting has its own idempotency, so retries are safe
  if (mouvementData.agenceId && transactionResult.mouvement) {
    postToGeneralLedger(transactionResult.mouvement, mouvementData.agenceId, userId, transactionResult.additionalEventData)
      .catch(err => console.warn(`[Ledger] GL posting deferred for ${transactionResult.mouvement.id}: ${err.message}`));
  }

  return { result: transactionResult.result, mouvement: transactionResult.mouvement };
}

/**
 * Post a mouvement to the General Ledger (SYSCOHADA)
 * This is called asynchronously after the business transaction completes
 * It's idempotent - safe to retry
 */
async function postToGeneralLedger(
  mouvement: MouvementFinancier,
  agenceId: string,
  userId?: string,
  additionalEventData?: Record<string, any>
): Promise<void> {
  try {
    // Build additional metadata for the GL entry
    const metadata: Record<string, any> = {
      ...(additionalEventData || {}),
    };

    // Try to get client name if available (nom/prenom are in users table)
    if (mouvement.clientId) {
      try {
        const [clientUser] = await db
          .select({ nom: users.nom, prenom: users.prenom })
          .from(clients)
          .innerJoin(users, eq(clients.userId, users.id))
          .where(eq(clients.id, mouvement.clientId))
          .limit(1);
        if (clientUser) {
          metadata.clientName = `${clientUser.nom} ${clientUser.prenom || ""}`.trim();
        }
      } catch (e) {
        // Ignore - clientName will be "Client"
      }
    }

    // Try to get credit number if available
    if (mouvement.creditId) {
      try {
        const [credit] = await db.select({ numeroCredit: credits.numeroCredit })
          .from(credits)
          .where(eq(credits.id, mouvement.creditId))
          .limit(1);
        if (credit) {
          metadata.creditNumber = credit.numeroCredit;
        }
      } catch (e) {
        // Ignore
      }
    }

    // Try to get tontine name if available
    if (mouvement.tontineId) {
      try {
        const [tontine] = await db.select({ nom: tontines.nom })
          .from(tontines)
          .where(eq(tontines.id, mouvement.tontineId))
          .limit(1);
        if (tontine) {
          metadata.tontineName = tontine.nom;
        }
      } catch (e) {
        // Ignore
      }
    }

    // Determine provider from metadata if Mobile Money
    if (mouvement.methodePaiement === "MOBILE_MONEY" && mouvement.metadata) {
      const mouvMeta = mouvement.metadata as Record<string, any>;
      if (mouvMeta.provider) {
        metadata.provider = mouvMeta.provider;
      }
    }

    // Post to GL using the accounting posting service
    const result = await accountingPostingService.postFromMouvement({
      mouvement,
      agenceId,
      userId,
      additionalMetadata: metadata
    });

    if (result) {
      console.log(`[Ledger] GL posted: ${mouvement.id} -> ${result.numeroPiece}`);
    } else {
      console.log(`[Ledger] GL posting skipped for ${mouvement.id} (no matching rule or already posted)`);
    }
  } catch (error: any) {
    // Log but don't throw - GL posting is async and shouldn't break business flow
    console.error(`[Ledger] GL posting failed for ${mouvement.id}: ${error.message}`);
    // In a production system, we'd queue this for retry
  }
}

export default {
  generateReference,
  createMouvementFinancier,
  createOutboxEvent,
  createMouvementEvents,
  updateCompteSolde,
  updateCreditSolde,
  updateSessionSolde,
  updateTontineSolde,
  updateCaisseSolde,
  checkIdempotencyKey,
  executeWithLedger,
  validateUserId,
};
