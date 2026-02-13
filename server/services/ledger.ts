import { randomInt } from "crypto";
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
import { postGlForMouvement, AccountingRuleNotFoundError } from "./accounting-posting-service";
import { balanceService } from "./balance-service";
import type { BalanceEntityType } from "@shared/types/balances";
import { createLogger } from "../lib/logger";
import { validateAccountingRule, handleGLPostingFailure, isGLStrictMode } from "./accounting-validation";

const logger = createLogger('Ledger');

// Infer MouvementFinancier type from table
export type MouvementFinancier = typeof mouvementsFinanciers.$inferSelect;

// Types for the ledger service
export type SourceModule = "CAISSE" | "EPARGNE" | "CREDIT" | "TONTINE" | "TERRAIN" | "TRANSFERT" | "SYSTEME" | "CAISSE_AGENT" | "VERSEMENT_AUTO" | "DECAISSEMENT_PROGRAMME" | "COMPTE" | "COFFRE" | "MOBILE_MONEY" | "RH_PAYROLL" | "COFFRE_TRANSFER" | "INTER_COFFRE" | "EVACUATION_COFFRE";
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
  | "COMPTE_TRANSFERE_AGENCE"
  | "GL_POSTING_FAILED";

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
  requiresGlPosting?: boolean;
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
export function generateReference(sourceModule: SourceModule | "TIC" | "EVC"): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const time = Date.now().toString().slice(-6);
  const random = randomInt(0, 1000).toString().padStart(3, "0");
  
  const prefixes: Record<SourceModule | "TIC" | "EVC", string> = {
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
    RH_PAYROLL: "RHP",
    COFFRE_TRANSFER: "CTR",
    INTER_COFFRE: "ICF",
    EVACUATION_COFFRE: "EVC",
    EVC: "EVC",
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
    logger.warn({ userId }, 'User ID does not exist, using null for created_by');
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
    requiresGlPosting: data.requiresGlPosting !== false,
    glPostingStatus: "PENDING",
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
        logger.error({ err: error, clientId }, 'Error calculating savings for client');
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
 * Build additional GL metadata within a transaction.
 * Enriches the posting context with client names, credit numbers, etc.
 */
async function buildGlMetadata(
  tx: PgTransaction<any, any, any>,
  mouvement: MouvementFinancier,
  additionalEventData?: Record<string, any>
): Promise<Record<string, any>> {
  const metadata: Record<string, any> = { ...(additionalEventData || {}) };

  if (mouvement.clientId) {
    try {
      const [clientUser] = await tx
        .select({ nom: users.nom, prenom: users.prenom })
        .from(clients)
        .innerJoin(users, eq(clients.userId, users.id))
        .where(eq(clients.id, mouvement.clientId))
        .limit(1);
      if (clientUser) {
        metadata.clientName = `${clientUser.nom} ${clientUser.prenom || ""}`.trim();
      }
    } catch {
      // clientName will fall back to "Client"
    }
  }

  if (mouvement.creditId) {
    try {
      const [credit] = await tx.select({ numeroCredit: credits.numeroCredit })
        .from(credits)
        .where(eq(credits.id, mouvement.creditId))
        .limit(1);
      if (credit) {
        metadata.creditNumber = credit.numeroCredit;
      }
    } catch {
      // Ignore
    }
  }

  if (mouvement.tontineId) {
    try {
      const [tontine] = await tx.select({ nom: tontines.nom })
        .from(tontines)
        .where(eq(tontines.id, mouvement.tontineId))
        .limit(1);
      if (tontine) {
        metadata.tontineName = tontine.nom;
      }
    } catch {
      // Ignore
    }
  }

  if (mouvement.metadata) {
    const mouvMeta = mouvement.metadata as Record<string, any>;
    if (mouvement.methodePaiement === "MOBILE_MONEY" && mouvMeta.provider) {
      metadata.provider = mouvMeta.provider;
    }
    // Support eventType override from mouvement metadata (e.g. closure payout routing by account type)
    if (mouvMeta.glEventType) {
      metadata.eventType = mouvMeta.glEventType;
    }
  }

  return metadata;
}

/**
 * Execute an operation with full ledger flow.
 *
 * This is the main entry point for all financial operations.
 * Flow: mouvement → business op → GL posting (sync) → outbox events.
 *
 * GL posting happens WITHIN the same transaction. If GL posting fails:
 * - requiresGlPosting=true → entire transaction is rolled back
 * - requiresGlPosting=false → mouvement.glPostingStatus set to SKIPPED/FAILED, transaction continues
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

  const requiresGl = mouvementData.requiresGlPosting !== false;

  // PRE-VALIDATION: Vérifier que la règle comptable existe AVANT la transaction
  // En mode STRICT ou si requiresGl=true, cette validation est critique
  if (mouvementData.agenceId && mouvementData.typePaiement && (requiresGl || isGLStrictMode())) {
    try {
      await validateAccountingRule(mouvementData.typePaiement, mouvementData.agenceId);
      logger.debug({
        typePaiement: mouvementData.typePaiement,
        agenceId: mouvementData.agenceId
      }, 'Règle comptable validée avant transaction');
    } catch (error) {
      // En mode STRICT ou requiresGl=true, bloquer l'opération
      if (requiresGl || isGLStrictMode()) {
        logger.error({
          typePaiement: mouvementData.typePaiement,
          agenceId: mouvementData.agenceId,
          error: error instanceof Error ? error.message : 'Unknown'
        }, 'Validation règle comptable échouée - opération bloquée');
        throw error;
      }
      // Sinon, logger un warning et continuer
      logger.warn({
        typePaiement: mouvementData.typePaiement,
        error: error instanceof Error ? error.message : 'Unknown'
      }, 'Règle comptable manquante mais non critique');
    }
  }

  const transactionResult = await db.transaction(async (tx) => {
    // 1. Create mouvement financier (glPostingStatus = 'PENDING')
    const mouvement = await createMouvementFinancier(
      tx,
      { ...mouvementData, sourceModule },
      userId
    );

    // 2. Execute the business operation
    const { result, additionalEventData } = await operation(tx, mouvement);

    // 3. Create outbox events for all relevant channels
    await createMouvementEvents(tx, mouvement, additionalEventData);

    // 4. Synchronous GL posting (within the same transaction)
    let glPostingStatus: string = "PENDING";
    let glPostingError: string | null = null;

    if (mouvementData.agenceId) {
      try {
        const glMetadata = await buildGlMetadata(tx, mouvement, additionalEventData as Record<string, any> | undefined);
        const glResult = await postGlForMouvement(tx, mouvement, mouvementData.agenceId, userId, glMetadata);

        if (glResult) {
          glPostingStatus = "POSTED";
          logger.info({ mouvementId: mouvement.id, numeroPiece: glResult.numeroPiece }, 'GL posted sync');
        } else {
          // null = already posted (idempotent)
          glPostingStatus = "POSTED";
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown GL error";

        if (error instanceof AccountingRuleNotFoundError) {
          if (requiresGl) {
            // Critical: no rule and GL is required → rollback
            throw error;
          }
          // Non-critical: mark as SKIPPED
          glPostingStatus = "SKIPPED";
          glPostingError = message;
          logger.warn({ mouvementId: mouvement.id, error: message }, 'GL skipped (no rule, not required)');
        } else {
          // Utiliser le nouveau système de gestion selon GL_POSTING_MODE
          glPostingStatus = "FAILED";
          glPostingError = message;

          if (requiresGl) {
            // Critical: GL is required → utiliser handleGLPostingFailure
            // En mode STRICT, cela va rethrow et causer un rollback
            // En mode LENIENT, cela va logger et continuer
            logger.error({ mouvementId: mouvement.id, error: message }, 'GL failed (required)');
            handleGLPostingFailure(error, {
              mouvementId: mouvement.id,
              typePaiement: mouvementData.typePaiement,
              montant: mouvementData.montant,
              requiresGl
            });
          } else {
            // Non-critical: juste logger
            logger.warn({ mouvementId: mouvement.id, error: message }, 'GL failed (not required, continuing)');
          }
        }
      }
    } else {
      // No agenceId → cannot post to GL
      glPostingStatus = requiresGl ? "PENDING" : "SKIPPED";
    }

    // 5. Update mouvement with GL posting status
    await tx.update(mouvementsFinanciers)
      .set({ glPostingStatus, glPostingError })
      .where(eq(mouvementsFinanciers.id, mouvement.id));

    return { result, mouvement: { ...mouvement, glPostingStatus, glPostingError }, additionalEventData };
  });

  // 6. Emit BALANCE_UPDATED + ACCOUNTING_UPDATE events via WebSocket (after commit)
  emitBalanceUpdates(transactionResult.mouvement, mouvementData.agenceId, transactionResult.additionalEventData);

  // 7. Emit ACCOUNTING_UPDATE so client accounting screens refresh in real-time
  if (transactionResult.mouvement.glPostingStatus === "POSTED") {
    try {
      const { getWsInstance } = await import("../ws-server");
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "ACCOUNTING_UPDATE",
          payload: {
            type: "gl_entry_posted",
            mouvementId: transactionResult.mouvement.id,
          },
        });
      }
    } catch {
      // Don't let WS failure break business flow
    }
  }

  return { result: transactionResult.result, mouvement: transactionResult.mouvement };
}

/**
 * @deprecated Use postGlForMouvement() within a transaction instead.
 * Kept for standalone retry of FAILED mouvements.
 *
 * Post a mouvement to the General Ledger (SYSCOHADA) — standalone (own transaction).
 * Idempotent — safe to retry.
 */
export async function retryGlPosting(
  mouvement: MouvementFinancier,
  agenceId: string,
  userId?: string
): Promise<void> {
  const result = await accountingPostingService.postFromMouvement({
    mouvement,
    agenceId,
    userId,
  });

  // Update mouvement glPostingStatus
  if (result) {
    await db.update(mouvementsFinanciers)
      .set({ glPostingStatus: "POSTED", glPostingError: null })
      .where(eq(mouvementsFinanciers.id, mouvement.id));
    logger.info({ mouvementId: mouvement.id, numeroPiece: result.numeroPiece }, 'GL retry posted');
  }
  // null means already posted — also mark as POSTED
  else {
    await db.update(mouvementsFinanciers)
      .set({ glPostingStatus: "POSTED", glPostingError: null })
      .where(eq(mouvementsFinanciers.id, mouvement.id));
  }
}

/**
 * Emit BALANCE_UPDATED events via WebSocket for all affected entities
 * Called immediately after transaction commit for real-time updates
 *
 * Calcule automatiquement previousBalance à partir du montant et sens du mouvement
 * si ancienSolde* n'est pas fourni dans additionalEventData.
 */
export function emitBalanceUpdates(
  mouvement: MouvementFinancier,
  agenceId?: string,
  additionalEventData?: {
    agentId?: string;
    nouveauSoldeCompte?: string;
    ancienSoldeCompte?: string;
    nouveauSoldeCredit?: string;
    ancienSoldeCredit?: string;
    nouveauSoldeSession?: string;
    ancienSoldeSession?: string;
    nouveauSoldeCoffre?: string;
    ancienSoldeCoffre?: string;
    nouveauSoldeTontine?: string;
    ancienSoldeTontine?: string;
  }
): void {
  try {
    const sourceModule = mouvement.sourceModule || 'SYSTEME';
    const mouvementRef = mouvement.reference;
    const effectiveAgenceId = agenceId || mouvement.agenceId || 'unknown';
    const montant = Number(mouvement.montant || 0);
    const isCredit = mouvement.sens === 'CREDIT';

    // Helper pour calculer previousBalance si non fourni
    const calculatePrevious = (newBalance: number, ancienSolde?: string): number => {
      if (ancienSolde !== undefined) {
        return Number(ancienSolde);
      }
      // Si pas d'ancien solde fourni, le calculer à partir du nouveau et du mouvement
      // CREDIT = entrée d'argent = previous = new - montant
      // DEBIT = sortie d'argent = previous = new + montant
      return isCredit ? newBalance - montant : newBalance + montant;
    };

    // Emit for compte updates
    if (mouvement.compteId && additionalEventData?.nouveauSoldeCompte) {
      const newBalance = Number(additionalEventData.nouveauSoldeCompte);
      const previousBalance = calculatePrevious(newBalance, additionalEventData.ancienSoldeCompte);

      balanceService.broadcastBalanceUpdate({
        entityType: 'compte' as BalanceEntityType,
        entityId: mouvement.compteId,
        agenceId: effectiveAgenceId,
        newBalance,
        previousBalance,
        mouvementRef,
        sourceModule,
        typePaiement: mouvement.typePaiement || undefined,
      });
    }

    // Emit for credit updates
    if (mouvement.creditId && additionalEventData?.nouveauSoldeCredit) {
      const newBalance = Number(additionalEventData.nouveauSoldeCredit);
      const previousBalance = calculatePrevious(newBalance, additionalEventData.ancienSoldeCredit);

      balanceService.broadcastBalanceUpdate({
        entityType: 'credit' as BalanceEntityType,
        entityId: mouvement.creditId,
        agenceId: effectiveAgenceId,
        newBalance,
        previousBalance,
        mouvementRef,
        sourceModule,
        typePaiement: mouvement.typePaiement || undefined,
      });
    }

    // Emit for session caisse updates
    if (mouvement.sessionCaisseId && additionalEventData?.nouveauSoldeSession) {
      const newBalance = Number(additionalEventData.nouveauSoldeSession);
      const previousBalance = calculatePrevious(newBalance, additionalEventData.ancienSoldeSession);

      balanceService.broadcastBalanceUpdate({
        entityType: 'session_caisse' as BalanceEntityType,
        entityId: mouvement.sessionCaisseId,
        agenceId: effectiveAgenceId,
        newBalance,
        previousBalance,
        mouvementRef,
        sourceModule,
        typePaiement: mouvement.typePaiement || undefined,
      });
    }

    // Emit for tontine updates
    if (mouvement.tontineId && additionalEventData?.nouveauSoldeTontine) {
      const newBalance = Number(additionalEventData.nouveauSoldeTontine);
      const previousBalance = calculatePrevious(newBalance, additionalEventData.ancienSoldeTontine);

      balanceService.broadcastBalanceUpdate({
        entityType: 'tontine' as BalanceEntityType,
        entityId: mouvement.tontineId,
        agenceId: effectiveAgenceId,
        newBalance,
        previousBalance,
        mouvementRef,
        sourceModule,
        typePaiement: mouvement.typePaiement || undefined,
      });
    }

    // Note: Coffre updates are typically handled separately in coffre transfer services
    // as they don't go through the standard mouvement flow

  } catch (error) {
    // Log but don't throw - WS emission shouldn't break business flow
    logger.error({ err: error, mouvementId: mouvement.id }, 'BALANCE_UPDATED emission failed');
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
  emitBalanceUpdates, // Export pour les services qui ne passent pas par executeWithLedger
};
