import { db } from "../db";
import {
  mouvementsFinanciers,
  evenementsOutbox,
  comptes,
  credits,
  sessionsCaisse
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

// Infer MouvementFinancier type from table
export type MouvementFinancier = typeof mouvementsFinanciers.$inferSelect;

// Types for the ledger service
export type SourceModule = "CAISSE" | "EPARGNE" | "CREDIT" | "TONTINE" | "TERRAIN" | "TRANSFERT" | "SYSTEME";
export type SensMouvement = "Débit" | "Crédit";
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
export function generateReference(sourceModule: SourceModule): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const time = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  
  const prefixes: Record<SourceModule, string> = {
    CAISSE: "CAI",
    EPARGNE: "EPG",
    CREDIT: "CRD",
    TONTINE: "TON",
    TERRAIN: "TER",
    TRANSFERT: "TRF",
    SYSTEME: "SYS"
  };
  
  return `${prefixes[sourceModule]}-${year}${month}${day}-${time}${random}`;
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
    referenceExterne: data.referenceExterne,
    idempotencyKey: data.idempotencyKey,
    metadata: data.metadata,
    createdBy,
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
 */
export async function updateSessionSolde(
  tx: PgTransaction<any, any, any>,
  sessionId: string,
  delta: number
): Promise<string> {
  const [updated] = await tx.update(sessionsCaisse)
    .set({ 
      soldeTheorique: sql`${sessionsCaisse.soldeTheorique} + ${delta}` 
    })
    .where(eq(sessionsCaisse.id, sessionId))
    .returning({ solde: sessionsCaisse.soldeTheorique });
  
  if (!updated) throw new Error(`Session ${sessionId} not found`);
  return updated.solde;
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

  return await db.transaction(async (tx) => {
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

    return { result, mouvement };
  });
}

export default {
  generateReference,
  createMouvementFinancier,
  createOutboxEvent,
  createMouvementEvents,
  updateCompteSolde,
  updateCreditSolde,
  updateSessionSolde,
  checkIdempotencyKey,
  executeWithLedger,
};
