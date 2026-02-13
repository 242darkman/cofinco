/**
 * Offline Treasury Management Service
 *
 * Manages the three-layer separation for offline cash operations:
 * - Layer 1: Physical cash (billetage, actual count)
 * - Layer 2: Application state (journal entries, computed balances)
 * - Layer 3: Accounting (GL entries — generated server-side only)
 *
 * Responsibilities:
 * - Agent day session lifecycle (open, track, close)
 * - Offline limits enforcement (server-signed, tamper-proof)
 * - Local reconciliation before sync
 * - Cash balance tracking in real-time
 *
 * @module offline-treasury
 */

import {
  db,
  type AgentDaySession,
  type OfflineLimits,
  type JournalEventType,
} from './offline-db';
import { verifyHmac } from './offline-crypto';
import {
  appendJournalEntry,
  generateOperationRef,
  type AppendEntryOptions,
} from './journal-service';

// ========== CASH IMPACT CALCULATION ==========

/**
 * Determine the cash impact of a journal event type.
 * Positive = cash inflow (agent receives), Negative = cash outflow (agent gives).
 */
function getCashImpact(type: JournalEventType, amount: number): number {
  switch (type) {
    case 'DEPOSIT':          return amount;   // Client gives cash to agent
    case 'LOAN_REPAYMENT':   return amount;   // Client pays back in cash
    case 'TONTINE_CONTRIBUTION': return amount; // Member contributes cash
    case 'WITHDRAWAL':       return -amount;  // Agent gives cash to client
    case 'LOAN_DISBURSEMENT': return -amount; // Agent disburses loan in cash
    case 'TONTINE_DISTRIBUTION': return -amount; // Agent distributes pot
    case 'SETTLEMENT':       return -amount;  // Agent hands cash to caisse/coffre
    default:                 return 0;        // Non-cash operations
  }
}

// ========== SESSION MANAGEMENT ==========

/**
 * Open a new agent day session.
 * Must be called at the start of each working day before any operation.
 */
export async function openDaySession(params: {
  agentId: number;
  deviceId: string;
  openingBalance: number;
  billetage: Record<string, number>; // { "10000": 5, "5000": 10, ... }
  agenceId: string;
}): Promise<AgentDaySession> {
  const today = new Date().toISOString().slice(0, 10);

  // Check if session already exists for today
  const existing = await db.agentDaySessions
    .where('[agentId+date]')
    .equals([params.agentId, today])
    .first();

  if (existing && existing.syncStatus !== 'reconciled') {
    throw new Error(`Session already open for ${today}. Close the previous session first.`);
  }

  const session: AgentDaySession = {
    date: today,
    agentId: params.agentId,
    deviceId: params.deviceId,
    openedAt: Date.now(),
    openingBalance: params.openingBalance,
    openingBilletage: JSON.stringify(params.billetage),
    currentCashBalance: params.openingBalance,
    operationCount: 0,
    dailyVolume: 0,
    totalCollected: 0,
    totalDisbursed: 0,
    syncStatus: 'open',
    lastSyncTimestamp: Date.now(),
  };

  const id = await db.agentDaySessions.add(session);

  // Record opening in the journal
  await appendJournalEntry({
    type: 'CAISSE_OPEN',
    agentId: params.agentId,
    agenceId: params.agenceId,
    sessionId: today,
    operationRef: generateOperationRef('CAISSE_OPEN'),
    payload: {
      openingBalance: params.openingBalance,
      billetage: params.billetage,
    },
  });

  return { ...session, id };
}

/**
 * Get the current open session for an agent.
 */
export async function getCurrentSession(agentId: number): Promise<AgentDaySession | null> {
  const today = new Date().toISOString().slice(0, 10);
  return db.agentDaySessions
    .where('[agentId+date]')
    .equals([agentId, today])
    .first() || null;
}

/**
 * Close the day session with physical cash count.
 */
export async function closeDaySession(params: {
  agentId: number;
  closingBalance: number;
  billetage: Record<string, number>;
  agenceId: string;
  justification?: string;
}): Promise<{ discrepancy: number; session: AgentDaySession }> {
  const session = await getCurrentSession(params.agentId);
  if (!session || !session.id) {
    throw new Error('No open session found for today.');
  }

  if (session.syncStatus !== 'open') {
    throw new Error(`Session is not open (status: ${session.syncStatus}).`);
  }

  const discrepancy = params.closingBalance - session.currentCashBalance;

  await db.agentDaySessions.update(session.id, {
    closedAt: Date.now(),
    closingBalance: params.closingBalance,
    closingBilletage: JSON.stringify(params.billetage),
    discrepancy,
    discrepancyJustification: params.justification,
    syncStatus: 'closed',
    lastJournalSequence: undefined, // Will be set by journal
  });

  // Record closing in the journal
  await appendJournalEntry({
    type: 'CAISSE_CLOSE',
    agentId: params.agentId,
    agenceId: params.agenceId,
    sessionId: session.date,
    operationRef: generateOperationRef('CAISSE_CLOSE'),
    payload: {
      closingBalance: params.closingBalance,
      expectedBalance: session.currentCashBalance,
      discrepancy,
      billetage: params.billetage,
      justification: params.justification,
    },
  });

  const updated = await db.agentDaySessions.get(session.id);
  return { discrepancy, session: updated! };
}

// ========== OFFLINE LIMITS ENFORCEMENT ==========

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  details?: string;
}

/**
 * Check if an operation can be executed offline within configured limits.
 * Limits are signed by the server to prevent tampering.
 */
export async function canExecuteOffline(
  type: JournalEventType,
  amount: number,
  agentId: number
): Promise<LimitCheckResult> {
  const limits = await db.offlineLimits.get('current');

  if (!limits) {
    return { allowed: false, reason: 'NO_LIMITS', details: 'Offline limits not configured. Sync required.' };
  }

  // 1. Verify limits integrity (server signature)
  const { serverSignature, ...limitsData } = limits;
  const signatureValid = await verifyHmac(JSON.stringify(limitsData), serverSignature);
  if (!signatureValid) {
    return { allowed: false, reason: 'LIMITS_TAMPERED', details: 'Offline limits signature invalid. Sync required.' };
  }

  // 2. Check allowed operation types
  if (!limits.allowedOperationTypes.includes(type)) {
    return { allowed: false, reason: 'TYPE_NOT_ALLOWED', details: `Operation type ${type} not allowed offline.` };
  }

  // 3. Get current session
  const session = await getCurrentSession(agentId);
  if (!session) {
    return { allowed: false, reason: 'NO_SESSION', details: 'No open day session. Open a session first.' };
  }

  // 4. Check caisse balance ceiling/floor
  const cashImpact = getCashImpact(type, amount);
  const projectedBalance = session.currentCashBalance + cashImpact;
  if (projectedBalance > limits.maxCaisseBalance) {
    return {
      allowed: false,
      reason: 'CAISSE_CEILING',
      details: `Projected balance ${projectedBalance} exceeds max ${limits.maxCaisseBalance} XAF.`,
    };
  }
  if (projectedBalance < 0) {
    return {
      allowed: false,
      reason: 'INSUFFICIENT_CASH',
      details: `Insufficient cash. Current: ${session.currentCashBalance}, needed: ${amount}.`,
    };
  }

  // 5. Check single operation limit
  if (amount > limits.maxSingleOperation) {
    return {
      allowed: false,
      reason: 'SINGLE_OP_LIMIT',
      details: `Amount ${amount} exceeds max single operation ${limits.maxSingleOperation} XAF.`,
    };
  }

  // 6. Check daily limits
  if (session.operationCount >= limits.maxDailyOperations) {
    return {
      allowed: false,
      reason: 'DAILY_OPS_LIMIT',
      details: `Daily operation limit (${limits.maxDailyOperations}) reached.`,
    };
  }
  if (session.dailyVolume + amount > limits.maxDailyVolume) {
    return {
      allowed: false,
      reason: 'DAILY_VOLUME_LIMIT',
      details: `Daily volume limit (${limits.maxDailyVolume} XAF) would be exceeded.`,
    };
  }

  // 7. Check offline duration
  const offlineDays = (Date.now() - session.lastSyncTimestamp) / (24 * 3600 * 1000);
  if (offlineDays > limits.maxOfflineDays) {
    return {
      allowed: false,
      reason: 'OFFLINE_TOO_LONG',
      details: `Offline for ${Math.floor(offlineDays)} days. Max allowed: ${limits.maxOfflineDays}. Sync required.`,
    };
  }

  // 8. Check pending sync backlog
  const pendingCount = await db.journalEntries
    .where('syncStatus')
    .equals('local')
    .count();
  if (pendingCount >= limits.maxPendingSync) {
    return {
      allowed: false,
      reason: 'SYNC_BACKLOG',
      details: `${pendingCount} operations pending sync (max ${limits.maxPendingSync}). Sync required.`,
    };
  }

  return { allowed: true };
}

// ========== OPERATION EXECUTION WITH TREASURY TRACKING ==========

/**
 * Execute a financial operation offline with full treasury tracking.
 * This is the main entry point for all offline financial operations.
 *
 * 1. Validates against offline limits
 * 2. Appends to immutable journal
 * 3. Updates day session cash tracking
 */
export async function executeOfflineOperation(params: {
  type: JournalEventType;
  amount: number;
  agentId: number;
  agenceId: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<{
  journalUuid: string;
  operationRef: string;
  newCashBalance: number;
}> {
  // 1. Check limits
  const check = await canExecuteOffline(params.type, params.amount, params.agentId);
  if (!check.allowed) {
    throw new Error(`Operation blocked: ${check.reason} — ${check.details}`);
  }

  // 2. Get current session
  const session = await getCurrentSession(params.agentId);
  if (!session || !session.id) {
    throw new Error('No open day session.');
  }

  const operationRef = generateOperationRef(params.type);

  // 3. Append to journal (atomic, signed, hash-chained)
  const entry = await appendJournalEntry({
    type: params.type,
    agentId: params.agentId,
    agenceId: params.agenceId,
    sessionId: session.date,
    operationRef,
    payload: { ...params.payload, amount: params.amount },
    metadata: params.metadata,
  });

  // 4. Update session cash tracking
  const cashImpact = getCashImpact(params.type, params.amount);
  const newCashBalance = session.currentCashBalance + cashImpact;

  const isCollection = cashImpact > 0;
  await db.agentDaySessions.update(session.id, {
    currentCashBalance: newCashBalance,
    operationCount: session.operationCount + 1,
    dailyVolume: session.dailyVolume + Math.abs(params.amount),
    totalCollected: session.totalCollected + (isCollection ? params.amount : 0),
    totalDisbursed: session.totalDisbursed + (isCollection ? 0 : params.amount),
    lastJournalSequence: entry.sequence,
    firstJournalSequence: session.firstJournalSequence ?? entry.sequence,
  });

  return {
    journalUuid: entry.uuid,
    operationRef,
    newCashBalance,
  };
}

// ========== LOCAL RECONCILIATION ==========

/**
 * Get reconciliation summary for the current day.
 * Compares computed cash balance with actual operations.
 */
export async function getReconciliationSummary(agentId: number): Promise<{
  session: AgentDaySession | null;
  computedBalance: number;
  operationCount: number;
  totalCollected: number;
  totalDisbursed: number;
  journalEntryCount: number;
  hasDiscrepancy: boolean;
} | null> {
  const session = await getCurrentSession(agentId);
  if (!session) return null;

  const entries = await db.journalEntries
    .where('sessionId')
    .equals(session.date)
    .toArray();

  // Recompute balance from journal entries
  let computedBalance = session.openingBalance;
  let totalCollected = 0;
  let totalDisbursed = 0;

  for (const entry of entries) {
    if (entry.type === 'CAISSE_OPEN' || entry.type === 'CAISSE_CLOSE' || entry.type === 'CAISSE_RECONCILE') {
      continue; // Non-financial entries
    }

    try {
      const payload = JSON.parse(
        entry.payload.startsWith('enc:') ? entry.payload : entry.payload
      ) as { amount?: number };

      if (payload.amount) {
        const impact = getCashImpact(entry.type, payload.amount);
        computedBalance += impact;
        if (impact > 0) totalCollected += payload.amount;
        else totalDisbursed += payload.amount;
      }
    } catch {
      // Skip entries with unparseable payloads
    }
  }

  return {
    session,
    computedBalance,
    operationCount: entries.filter(
      e => e.type !== 'CAISSE_OPEN' && e.type !== 'CAISSE_CLOSE' && e.type !== 'CAISSE_RECONCILE'
    ).length,
    totalCollected,
    totalDisbursed,
    journalEntryCount: entries.length,
    hasDiscrepancy: Math.abs(computedBalance - session.currentCashBalance) > 0.01,
  };
}

// ========== LIMITS UPDATE ==========

/**
 * Update offline limits from server (during sync handshake).
 * Validates the server signature before storing.
 */
export async function updateOfflineLimits(
  limits: OfflineLimits
): Promise<boolean> {
  // Verify server signature
  const { serverSignature, id, ...limitsData } = limits;
  const signatureValid = await verifyHmac(
    JSON.stringify({ ...limitsData, lastUpdated: limits.lastUpdated }),
    serverSignature
  );

  if (!signatureValid) {
    console.warn('[OfflineTreasury] Invalid server signature on limits. Rejecting update.');
    return false;
  }

  // Store (or update) limits
  await db.offlineLimits.put({ ...limits, id: 'current' });
  return true;
}

/**
 * Get current offline limits.
 */
export async function getOfflineLimits(): Promise<OfflineLimits | null> {
  return db.offlineLimits.get('current') || null;
}

// ========== SESSION HISTORY ==========

/**
 * Get all day sessions for an agent, ordered by date descending.
 */
export async function getSessionHistory(
  agentId: number,
  limit: number = 30
): Promise<AgentDaySession[]> {
  const sessions = await db.agentDaySessions
    .where('agentId')
    .equals(agentId)
    .reverse()
    .sortBy('date');

  return sessions.slice(0, limit);
}

/**
 * Get the last sync timestamp across all sessions.
 */
export async function getLastSyncTimestamp(agentId: number): Promise<number> {
  const sessions = await db.agentDaySessions
    .where('agentId')
    .equals(agentId)
    .toArray();

  if (sessions.length === 0) return 0;
  return Math.max(...sessions.map(s => s.lastSyncTimestamp));
}

/**
 * Mark a session as synced (called after successful journal sync).
 */
export async function markSessionSynced(
  agentId: number,
  date: string
): Promise<void> {
  const session = await db.agentDaySessions
    .where('[agentId+date]')
    .equals([agentId, date])
    .first();

  if (session?.id) {
    await db.agentDaySessions.update(session.id, {
      syncStatus: session.closedAt ? 'synced' : 'open',
      lastSyncTimestamp: Date.now(),
    });
  }
}
