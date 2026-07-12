import { z } from "zod";
import { db } from "../../db";
import { comptes } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { resolveGlEventType } from "../sync/gl-event-resolver";
import {
  executeWithLedger,
  updateCompteSolde,
  updateCreditSolde,
  updateTontineSolde,
  type SourceModule,
  type SensMouvement,
} from "../ledger";

const logger = createLogger('Services:SyncJournal:BusinessExecution');

/**
 * Map journal event types to ledger source modules and directions.
 */
const EVENT_TYPE_MAPPING: Record<string, {
  sourceModule: SourceModule;
  sens: SensMouvement;
  /**
   * Événement GL seedé (accounting_rules), utilisé aussi comme typePaiement.
   * Pour DEPOSIT/WITHDRAWAL le suffixe dépend du type de compte et est
   * résolu par resolveGlEventType().
   */
  glEventType: string;
  requiresGl: boolean;
} | null> = {
  DEPOSIT: { sourceModule: 'EPARGNE', sens: 'CREDIT', glEventType: 'DEPOSIT', requiresGl: true },
  WITHDRAWAL: { sourceModule: 'EPARGNE', sens: 'DEBIT', glEventType: 'WITHDRAWAL', requiresGl: true },
  LOAN_REPAYMENT: { sourceModule: 'CREDIT', sens: 'CREDIT', glEventType: 'LOAN_REPAYMENT', requiresGl: true },
  LOAN_DISBURSEMENT: { sourceModule: 'CREDIT', sens: 'DEBIT', glEventType: 'LOAN_DISBURSEMENT', requiresGl: true },
  TONTINE_CONTRIBUTION: { sourceModule: 'TONTINE', sens: 'CREDIT', glEventType: 'TONTINE_CONTRIBUTION', requiresGl: true },
  TONTINE_DISTRIBUTION: { sourceModule: 'TONTINE', sens: 'DEBIT', glEventType: 'TONTINE_DISTRIBUTION', requiresGl: true },
  SETTLEMENT: { sourceModule: 'CAISSE_AGENT', sens: 'CREDIT', glEventType: 'SETTLEMENT_CASH', requiresGl: true },
  // Non-financial event types — no ledger operation
  CLIENT_CREATE: null,
  CLIENT_UPDATE: null,
  CAISSE_OPEN: null,
  CAISSE_CLOSE: null,
  CAISSE_RECONCILE: null,
  REMISE_CREATE: null,
};

/**
 * Execute the business operation corresponding to a confirmed journal entry.
 * Creates a mouvement financier, posts to GL, and emits domain events.
 *
 * @returns The mouvement ID if a financial operation was created, null otherwise.
 */
export async function executeJournalBusinessOperation(
  entry: any,
  agentId: string
): Promise<string | null> {
  const mapping = EVENT_TYPE_MAPPING[entry.type];

  // Skip non-financial events
  if (mapping === null || mapping === undefined) {
    return null;
  }

  const payload = entry.payload as Record<string, any>;
  const amount = payload?.amount || payload?.montant;

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    logger.warn(`Skipping business op for entry ${entry.uuid}: no valid amount`);
    return null;
  }

  // Résoudre l'événement GL seedé (suffixe par type de compte pour dépôts/retraits)
  let glEventType = mapping.glEventType;
  if ((glEventType === 'DEPOSIT' || glEventType === 'WITHDRAWAL') && payload.compteId) {
    const [compte] = await db
      .select({ typeCompte: comptes.typeCompte })
      .from(comptes)
      .where(eq(comptes.id, payload.compteId))
      .limit(1);
    glEventType = resolveGlEventType(glEventType, compte?.typeCompte);
  } else {
    glEventType = resolveGlEventType(glEventType, undefined);
  }

  const { result, mouvement } = await executeWithLedger(
    mapping.sourceModule,
    {
      montant: String(amount),
      sens: mapping.sens,
      typePaiement: glEventType,
      methodePaiement: 'ESPECES',
      clientId: payload.clientId || undefined,
      compteId: payload.compteId || undefined,
      creditId: payload.creditId || undefined,
      tontineId: payload.tontineId || undefined,
      agenceId: entry.agenceId,
      agentId: agentId,
      referenceExterne: entry.operationRef,
      idempotencyKey: entry.idempotencyKey,
      requiresGlPosting: mapping.requiresGl,
      metadata: {
        offlineSync: true,
        journalUuid: entry.uuid,
        deviceId: entry.deviceId,
        clientTimestamp: entry.localTimestamp,
        sessionId: entry.sessionId,
      },
    },
    async (tx, mouvement) => {
      // Update account/credit/tontine balances based on entry type
      const delta = mapping.sens === 'CREDIT' ? amount : -amount;

      if (payload.compteId) {
        await updateCompteSolde(tx, payload.compteId, delta);
      }
      if (payload.creditId) {
        await updateCreditSolde(tx, payload.creditId, delta);
      }
      if (payload.tontineId) {
        await updateTontineSolde(tx, payload.tontineId, delta);
      }

      return { result: mouvement.id };
    },
    agentId
  );

  logger.info(`Business operation created for journal entry ${entry.uuid}: mouvement ${mouvement.id}`);
  return mouvement.id;
}
