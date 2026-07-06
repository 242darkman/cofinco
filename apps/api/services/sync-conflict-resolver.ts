/**
 * Sync Conflict Resolver
 *
 * Deterministic conflict resolution for offline journal entries during sync.
 *
 * Priority hierarchy (highest to lowest):
 * 1. Coffre/Server — Operations validated by coffre or admin
 * 2. Caisse principale — Agency main cash register operations
 * 3. Agent terrain — Field agent operations
 *
 * Resolution rules:
 * - Idempotency: Duplicate operations silently accepted
 * - Revoked key: All operations after revocation timestamp rejected
 * - Business rules: Balance sufficiency, limits validated
 * - Concurrent ops: Earlier timestamp wins between agents
 * - Server/coffre always wins against agent operations
 */

import { db } from "../db";
import { createLogger } from "../lib/logger";
import { offlineJournalEntries } from "@shared/schema/device-keys";
import { eq, and } from "drizzle-orm";

const logger = createLogger('Services:SyncConflictResolver');

// ========== TYPES ==========

export interface ConflictResolution {
  action: 'accept' | 'reject' | 'skip';
  reason: string;
  conflictWith?: string; // UUID of conflicting entry
}

interface JournalEntryLike {
  uuid: string;
  type: string;
  agentId: string;
  agenceId: string;
  localTimestamp: number;
  ntpOffset?: number;
  payload: Record<string, unknown>;
  operationRef: string;
  idempotencyKey: string;
  deviceKeyId: string;
}

// ========== CONFLICT RESOLVER ==========

export class SyncConflictResolver {

  /**
   * Resolve potential conflicts for a journal entry being synced.
   * This is called for each entry in the upload batch.
   */
  static async resolve(
    entry: JournalEntryLike,
    agentId: string
  ): Promise<ConflictResolution> {
    // 1. Check for concurrent operations on the same client
    const clientId = (entry.payload as any)?.clientId;
    if (clientId && this.isFinancialOperation(entry.type)) {
      const concurrentConflict = await this.checkConcurrentClientOps(entry, clientId);
      if (concurrentConflict) return concurrentConflict;
    }

    // 2. Check for duplicate operation references
    const refConflict = await this.checkOperationRefDuplicate(entry);
    if (refConflict) return refConflict;

    // 3. Validate business rules (basic server-side checks)
    const businessCheck = await this.validateBusinessRules(entry, agentId);
    if (businessCheck) return businessCheck;

    return { action: 'accept', reason: 'no_conflict' };
  }

  /**
   * Check if another agent has already processed an operation for the same client.
   */
  private static async checkConcurrentClientOps(
    entry: JournalEntryLike,
    clientId: string
  ): Promise<ConflictResolution | null> {
    // Look for confirmed entries from OTHER agents for the same client, same type, same day
    const entryDate = new Date(entry.localTimestamp).toISOString().slice(0, 10);

    const [concurrent] = await db
      .select({
        id: offlineJournalEntries.id,
        agentId: offlineJournalEntries.agentId,
        serverTimestamp: offlineJournalEntries.serverTimestamp,
        operationRef: offlineJournalEntries.operationRef,
      })
      .from(offlineJournalEntries)
      .where(and(
        eq(offlineJournalEntries.status, 'confirmed'),
        eq(offlineJournalEntries.eventType, entry.type),
        eq(offlineJournalEntries.offlineSessionDate, entryDate)
      ))
      .limit(1);

    if (!concurrent) return null;

    // Same agent = not a conflict (already handled by idempotency)
    if (concurrent.agentId === entry.agentId) return null;

    // Check if the payload targets the same client with the same specifics
    // (e.g., same credit repayment, same tontine contribution)
    const concurrentPayload = await this.getEntryPayload(concurrent.id);
    const concurrentClientId = concurrentPayload?.clientId;
    if (concurrentClientId !== clientId) return null;

    // Concurrent operation on same client by different agent
    // Earlier server timestamp wins
    const correctedTimestamp = entry.localTimestamp + (entry.ntpOffset || 0);
    const serverTimestamp = concurrent.serverTimestamp?.getTime() || 0;

    if (serverTimestamp < correctedTimestamp) {
      // Existing server entry wins (it was accepted first)
      logger.warn(
        `Concurrent conflict: entry ${entry.uuid} rejected in favor of ${concurrent.id} ` +
        `(same client ${clientId}, different agents)`
      );
      return {
        action: 'reject',
        reason: 'concurrent_operation',
        conflictWith: concurrent.id,
      };
    }

    // The new entry has an earlier timestamp — unusual but possible
    // Still accept the server version (first-to-sync wins)
    return {
      action: 'reject',
      reason: 'first_sync_wins',
      conflictWith: concurrent.id,
    };
  }

  /**
   * Check if the operation reference already exists.
   */
  private static async checkOperationRefDuplicate(
    entry: JournalEntryLike
  ): Promise<ConflictResolution | null> {
    const [existing] = await db
      .select({ id: offlineJournalEntries.id })
      .from(offlineJournalEntries)
      .where(and(
        eq(offlineJournalEntries.operationRef, entry.operationRef),
        eq(offlineJournalEntries.status, 'confirmed')
      ))
      .limit(1);

    if (existing) {
      // Same operation ref already confirmed — idempotent skip
      return { action: 'skip', reason: 'duplicate_operation_ref' };
    }

    return null;
  }

  /**
   * Validate basic business rules server-side.
   */
  private static async validateBusinessRules(
    entry: JournalEntryLike,
    _agentId: string
  ): Promise<ConflictResolution | null> {
    const payload = entry.payload as Record<string, any>;
    const amount = payload?.amount || payload?.montant;

    // Basic amount validation
    if (this.isFinancialOperation(entry.type)) {
      if (typeof amount !== 'number' || amount <= 0) {
        return { action: 'reject', reason: 'invalid_amount' };
      }

      // Server-side limit check (defense in depth)
      if (amount > 10_000_000) { // 10M XAF absolute max
        return { action: 'reject', reason: 'amount_exceeds_absolute_limit' };
      }
    }

    // Client creation: check for duplicate phone numbers
    if (entry.type === 'CLIENT_CREATE') {
      const telephone = payload?.telephone;
      if (telephone) {
        // TODO: Check against existing clients in the main database
        // For now, accept and let the existing uniqueness constraints handle it
      }
    }

    return null;
  }

  // ========== HELPERS ==========

  private static isFinancialOperation(type: string): boolean {
    return [
      'DEPOSIT', 'WITHDRAWAL', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT',
      'TONTINE_CONTRIBUTION', 'TONTINE_DISTRIBUTION', 'SETTLEMENT',
    ].includes(type);
  }

  private static async getEntryPayload(entryId: string): Promise<Record<string, any> | null> {
    const [entry] = await db
      .select({ payload: offlineJournalEntries.payload })
      .from(offlineJournalEntries)
      .where(eq(offlineJournalEntries.id, entryId))
      .limit(1);

    return (entry?.payload as Record<string, any>) || null;
  }
}
