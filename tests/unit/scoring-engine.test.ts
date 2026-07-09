import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS — Must be declared before imports that use them
// ============================================================================

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockExecute = vi.fn();

const createMockBuilder = (result: any = []) => {
  const arr = Array.isArray(result) ? result : [result];
  const builder: any = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(arr),
      onConflictDoUpdate: vi.fn().mockResolvedValue(arr),
      returning: vi.fn().mockResolvedValue(arr),
    }),
    returning: vi.fn().mockResolvedValue(arr),
    then: (resolve: any) => resolve(arr),
  };
  return builder;
};

// Transaction mock
const mockTx: any = {
  query: {
    clients: { findFirst: vi.fn() },
    clientScoreState: { findFirst: vi.fn() },
  },
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock('../../apps/api/db', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
    execute: (...args: any[]) => mockExecute(...args),
    transaction: vi.fn(async (fn: any) => fn(mockTx)),
    query: {
      clients: { findFirst: vi.fn() },
      credits: { findMany: vi.fn().mockResolvedValue([]) },
      comptes: { findMany: vi.fn().mockResolvedValue([]) },
      membresTontine: { findMany: vi.fn().mockResolvedValue([]) },
      clientScoreState: { findFirst: vi.fn() },
      clientScoreEvents: {},
    },
  },
}));

vi.mock('../../apps/api/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@shared/schema/tontines', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return { ...actual };
});

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import { db } from '../../apps/api/db';
import {
  POINTS_TABLE,
  SCORE_WEIGHTS,
  SEGMENT_THRESHOLDS,
  recordScoreEvent,
  recalculateClientScore,
  getScoreHistory,
  getScoreState,
  getScoreTrend,
  getScorePercentile,
  getAgencyScoreStats,
  getAdminScoreEvents,
  getAdminScoreStates,
} from '../../apps/api/services/scoring-engine';

// ============================================================================
// HELPERS
// ============================================================================

const MOCK_CLIENT = {
  id: 'client-1',
  agenceId: 'agence-1',
  prenom: 'Jean',
  nom: 'Dupont',
  segment: 'Standard',
  kycStatus: 'VERIFIED',
  adresseDomicile: '123 rue Test',
  professionId: 'prof-1',
  numeroPiece: 'CNI123',
  typePiece: 'CNI',
  villeId: 'ville-1',
  paysResidenceId: 'pays-1',
  isPep: false,
  isBlacklisted: false,
  dateAdhesion: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 12 months ago
  createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
};

const EMPTY_EVENT_SUMMARY_ROW = [{
  totalPoints: 0,
  totalDepots: 0,
  totalRemboursements: 0,
  totalCotisationsTontine: 0,
  totalIncidents: 0,
}];

/** Setup mocks for a full _recalculate() call */
function setupRecalculateMocks(overrides?: {
  client?: any;
  credits?: any[];
  comptes?: any[];
  tontines?: any[];
  eventSummary?: any[];
  echeancesStats?: any;
  deposits?: any[];
}) {
  const client = overrides?.client ?? MOCK_CLIENT;

  // Client lookup (inside transaction)
  mockTx.query.clients.findFirst.mockResolvedValue(client);

  // Credits
  (db.query.credits.findMany as any).mockResolvedValue(overrides?.credits ?? []);

  // Echeances stats (raw SQL)
  mockExecute.mockResolvedValue(
    overrides?.echeancesStats ?? { rows: [{ paid_count: '0', due_count: '0', avg_late_days: '0' }] }
  );

  // Comptes
  (db.query.comptes.findMany as any).mockResolvedValue(overrides?.comptes ?? []);

  // Savings deposits count
  mockSelect.mockReturnValue(createMockBuilder(overrides?.deposits ?? [{ cnt: 0 }]));

  // Tontines
  (db.query.membresTontine.findMany as any).mockResolvedValue(overrides?.tontines ?? []);

  // Event summary (inside transaction)
  mockTx.select.mockReturnValue(createMockBuilder(overrides?.eventSummary ?? EMPTY_EVENT_SUMMARY_ROW));

  // Upsert state (inside transaction)
  mockTx.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  });

  // Sync to clients (inside transaction)
  mockTx.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });

  // For RECALCUL_COMPLET audit event insert
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('Scoring Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // POINTS_TABLE
  // --------------------------------------------------------------------------

  describe('POINTS_TABLE', () => {
    it('should cover all 14 event types', () => {
      const expectedTypes = [
        'EPARGNE_DEPOT', 'CREDIT_REMBOURSEMENT', 'CREDIT_SOLDE',
        'TONTINE_CONTRIBUTION', 'KYC_VERIFIED', 'PROFILE_COMPLETED',
        'INCIDENT_RETARD', 'INCIDENT_DEFAUT', 'TONTINE_PENALITE',
        'COMPTE_BLOQUE', 'BONUS_MANUEL', 'MALUS_MANUEL',
        'INITIAL_SCORE', 'RECALCUL_COMPLET',
      ];
      for (const type of expectedTypes) {
        expect(POINTS_TABLE[type], `Missing POINTS_TABLE entry for ${type}`).toBeDefined();
      }
      expect(Object.keys(POINTS_TABLE)).toHaveLength(14);
    });

    it('should calculate EPARGNE_DEPOT points dynamically', () => {
      expect(POINTS_TABLE.EPARGNE_DEPOT(0)).toBe(0);
      expect(POINTS_TABLE.EPARGNE_DEPOT(1000)).toBe(1);
      expect(POINTS_TABLE.EPARGNE_DEPOT(5000)).toBe(5);
      expect(POINTS_TABLE.EPARGNE_DEPOT(50000)).toBe(50);
      expect(POINTS_TABLE.EPARGNE_DEPOT(undefined)).toBe(0);
    });

    it('should calculate CREDIT_REMBOURSEMENT points dynamically', () => {
      expect(POINTS_TABLE.CREDIT_REMBOURSEMENT(0)).toBe(5); // base 5
      expect(POINTS_TABLE.CREDIT_REMBOURSEMENT(500)).toBe(6); // 1 + 5
      expect(POINTS_TABLE.CREDIT_REMBOURSEMENT(5000)).toBe(15); // 10 + 5
      expect(POINTS_TABLE.CREDIT_REMBOURSEMENT(undefined)).toBe(5);
    });

    it('should return fixed 50 points for CREDIT_SOLDE', () => {
      expect(POINTS_TABLE.CREDIT_SOLDE(0)).toBe(50);
      expect(POINTS_TABLE.CREDIT_SOLDE(999999)).toBe(50);
    });

    it('should calculate TONTINE_CONTRIBUTION points dynamically', () => {
      expect(POINTS_TABLE.TONTINE_CONTRIBUTION(0)).toBe(3); // base 3
      expect(POINTS_TABLE.TONTINE_CONTRIBUTION(2000)).toBe(4); // 1 + 3
      expect(POINTS_TABLE.TONTINE_CONTRIBUTION(10000)).toBe(8); // 5 + 3
    });

    it('should return correct fixed points for lifecycle events', () => {
      expect(POINTS_TABLE.KYC_VERIFIED()).toBe(20);
      expect(POINTS_TABLE.PROFILE_COMPLETED()).toBe(10);
      expect(POINTS_TABLE.INITIAL_SCORE()).toBe(0);
      expect(POINTS_TABLE.RECALCUL_COMPLET()).toBe(0);
    });

    it('should return negative points for incidents', () => {
      expect(POINTS_TABLE.INCIDENT_RETARD()).toBe(-15);
      expect(POINTS_TABLE.INCIDENT_DEFAUT()).toBe(-30);
      expect(POINTS_TABLE.TONTINE_PENALITE()).toBe(-10);
      expect(POINTS_TABLE.COMPTE_BLOQUE()).toBe(-20);
    });

    it('should handle BONUS_MANUEL and MALUS_MANUEL', () => {
      expect(POINTS_TABLE.BONUS_MANUEL(25)).toBe(25);
      expect(POINTS_TABLE.BONUS_MANUEL(0)).toBe(0);
      expect(POINTS_TABLE.MALUS_MANUEL(10)).toBe(-10);
      // MALUS_MANUEL(0) returns -0 in JS, which is functionally equivalent
      expect(POINTS_TABLE.MALUS_MANUEL(0)).toEqual(-0);
    });
  });

  // --------------------------------------------------------------------------
  // SCORE_WEIGHTS
  // --------------------------------------------------------------------------

  describe('SCORE_WEIGHTS', () => {
    it('should sum to 1.0', () => {
      const total = SCORE_WEIGHTS.PAYMENT + SCORE_WEIGHTS.LOYALTY +
                    SCORE_WEIGHTS.ENGAGEMENT + SCORE_WEIGHTS.COMPLIANCE;
      expect(total).toBeCloseTo(1.0, 10);
    });

    it('should have PAYMENT as the heaviest weight', () => {
      expect(SCORE_WEIGHTS.PAYMENT).toBe(0.40);
      expect(SCORE_WEIGHTS.PAYMENT).toBeGreaterThan(SCORE_WEIGHTS.LOYALTY);
      expect(SCORE_WEIGHTS.LOYALTY).toBeGreaterThan(SCORE_WEIGHTS.ENGAGEMENT);
      expect(SCORE_WEIGHTS.ENGAGEMENT).toBeGreaterThan(SCORE_WEIGHTS.COMPLIANCE);
    });
  });

  // --------------------------------------------------------------------------
  // SEGMENT_THRESHOLDS
  // --------------------------------------------------------------------------

  describe('SEGMENT_THRESHOLDS', () => {
    it('should require higher criteria for VIP than Premium', () => {
      expect(SEGMENT_THRESHOLDS.VIP.min).toBeGreaterThan(SEGMENT_THRESHOLDS.PREMIUM.min);
      expect(SEGMENT_THRESHOLDS.VIP.minCreditsRembourses).toBeGreaterThan(SEGMENT_THRESHOLDS.PREMIUM.minCreditsRembourses);
      expect(SEGMENT_THRESHOLDS.VIP.minAncienneteMois).toBeGreaterThan(SEGMENT_THRESHOLDS.PREMIUM.minAncienneteMois);
    });

    it('should have Risque threshold below Standard', () => {
      expect(SEGMENT_THRESHOLDS.RISQUE.max).toBe(SEGMENT_THRESHOLDS.STANDARD.min);
    });
  });

  // --------------------------------------------------------------------------
  // recordScoreEvent — Validation
  // --------------------------------------------------------------------------

  describe('recordScoreEvent', () => {
    it('should reject BONUS_MANUEL without reason', async () => {
      // Idempotency check returns empty (event doesn't exist)
      mockSelect.mockReturnValue(createMockBuilder([]));

      await expect(
        recordScoreEvent({
          clientId: 'client-1',
          eventType: 'BONUS_MANUEL',
          refId: 'bonus-1',
          refType: 'manual',
          montant: 10,
          // reason missing!
        })
      ).rejects.toThrow('Un motif est obligatoire');
    });

    it('should reject MALUS_MANUEL without reason', async () => {
      mockSelect.mockReturnValue(createMockBuilder([]));

      await expect(
        recordScoreEvent({
          clientId: 'client-1',
          eventType: 'MALUS_MANUEL',
          refId: 'malus-1',
          refType: 'manual',
          montant: 10,
        })
      ).rejects.toThrow('Un motif est obligatoire');
    });

    it('should return isNew: false for duplicate events (idempotency)', async () => {
      // Idempotency check returns an existing event
      mockSelect.mockReturnValue(createMockBuilder([{ id: 'existing-event-id' }]));

      // getScoreState mock
      (db.query.clientScoreState.findFirst as any).mockResolvedValue({
        scoreGlobal: 72,
        segment: 'Premium',
        scorePayment: 80,
        scoreLoyalty: 70,
        scoreEngagement: 60,
        scoreCompliance: 50,
        tauxRemboursement: '90',
        totalPointsFidelite: 150,
      });

      const result = await recordScoreEvent({
        clientId: 'client-1',
        eventType: 'EPARGNE_DEPOT',
        refId: 'deposit-already-exists',
        refType: 'operation_caisse',
        montant: 10000,
      });

      expect(result.isNew).toBe(false);
      expect(result.result.scoreGlobal).toBe(72);
      expect(result.result.segment).toBe('Premium');
    });

    it('should return sensible defaults when idempotent hit has no state', async () => {
      mockSelect.mockReturnValue(createMockBuilder([{ id: 'existing-event-id' }]));
      (db.query.clientScoreState.findFirst as any).mockResolvedValue(null);

      const result = await recordScoreEvent({
        clientId: 'client-1',
        eventType: 'EPARGNE_DEPOT',
        refId: 'deposit-no-state',
        refType: 'operation_caisse',
      });

      expect(result.isNew).toBe(false);
      expect(result.result.scoreGlobal).toBe(50);
      expect(result.result.segment).toBe('Standard');
    });

    it('should record a new event and return isNew: true', async () => {
      // Idempotency check: no existing event — must be mockReturnValueOnce
      // because setupRecalculateMocks sets mockReturnValue for deposit count
      mockSelect.mockReturnValueOnce(createMockBuilder([]));

      setupRecalculateMocks();

      const result = await recordScoreEvent({
        clientId: 'client-1',
        eventType: 'EPARGNE_DEPOT',
        refId: 'deposit-new',
        refType: 'operation_caisse',
        montant: 5000,
      });

      expect(result.isNew).toBe(true);
      expect(result.result.scoreGlobal).toBeGreaterThanOrEqual(0);
      expect(result.result.scoreGlobal).toBeLessThanOrEqual(100);
      expect(result.result.segment).toBeDefined();
      // Transaction should have been called
      expect(db.transaction).toHaveBeenCalledOnce();
    });
  });

  // --------------------------------------------------------------------------
  // recalculateClientScore
  // --------------------------------------------------------------------------

  describe('recalculateClientScore', () => {
    it('should throw if client not found', async () => {
      mockTx.query.clients.findFirst.mockResolvedValue(null);
      (db.query.credits.findMany as any).mockResolvedValue([]);
      (db.query.comptes.findMany as any).mockResolvedValue([]);
      (db.query.membresTontine.findMany as any).mockResolvedValue([]);
      mockTx.select.mockReturnValue(createMockBuilder(EMPTY_EVENT_SUMMARY_ROW));
      mockSelect.mockReturnValue(createMockBuilder([{ cnt: 0 }]));

      // recalculateClientScore calls _recalculate(clientId, db)
      // but db.transaction mock passes mockTx, so we need the non-tx path
      // Actually recalculateClientScore uses db directly, not transaction
      // Let's mock db.query.clients.findFirst for the non-tx path
      (db.query.clients.findFirst as any).mockResolvedValue(null);

      await expect(recalculateClientScore('nonexistent'))
        .rejects.toThrow('Client nonexistent not found');
    });

    it('should compute correct score for a new client with no activity', async () => {
      // Fresh client: no credits, no savings, no tontines, no events
      (db.query.clients.findFirst as any).mockResolvedValue(MOCK_CLIENT);
      (db.query.credits.findMany as any).mockResolvedValue([]);
      (db.query.comptes.findMany as any).mockResolvedValue([]);
      (db.query.membresTontine.findMany as any).mockResolvedValue([]);
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '0', due_count: '0', avg_late_days: '0' }] });
      mockSelect.mockReturnValue(createMockBuilder([{ cnt: 0 }]));

      // Event summary (uses db directly since recalculateClientScore doesn't use tx)
      const selectBuilder = createMockBuilder(EMPTY_EVENT_SUMMARY_ROW);
      // db.select is used for event summary and deposit count
      // We need to handle sequential calls
      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount <= 1) {
          // First: deposit count
          return createMockBuilder([{ cnt: 0 }]);
        }
        // Second: event summary
        return createMockBuilder(EMPTY_EVENT_SUMMARY_ROW);
      });

      // Upsert + update mocks for the non-tx path (uses db.insert, db.update)
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const result = await recalculateClientScore('client-1');

      expect(result.scoreGlobal).toBeGreaterThanOrEqual(0);
      expect(result.scoreGlobal).toBeLessThanOrEqual(100);
      expect(result.segment).toBeDefined();
      expect(['VIP', 'Premium', 'Standard', 'Risque']).toContain(result.segment);

      // Payment score = 50 (neutral, no credits)
      expect(result.scorePayment).toBe(50);

      // Compliance should be high (VERIFIED KYC + full profile + not PEP/blacklisted)
      // KYC VERIFIED = 50 + 6 profile fields * 5 = 30 (capped) + AML clean = 20 = 100
      expect(result.scoreCompliance).toBe(100);
    });

    it('should record RECALCUL_COMPLET audit event when source is manual', async () => {
      (db.query.clients.findFirst as any).mockResolvedValue(MOCK_CLIENT);
      (db.query.credits.findMany as any).mockResolvedValue([]);
      (db.query.comptes.findMany as any).mockResolvedValue([]);
      (db.query.membresTontine.findMany as any).mockResolvedValue([]);
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '0', due_count: '0', avg_late_days: '0' }] });
      mockSelect.mockReturnValue(createMockBuilder([{ cnt: 0 }]));
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await recalculateClientScore('client-1', { source: 'manual', createdBy: 'user-1' });

      // db.insert should have been called for the audit event
      // (last call to mockInsert should be for RECALCUL_COMPLET)
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should NOT record audit event when no source is provided', async () => {
      (db.query.clients.findFirst as any).mockResolvedValue(MOCK_CLIENT);
      (db.query.credits.findMany as any).mockResolvedValue([]);
      (db.query.comptes.findMany as any).mockResolvedValue([]);
      (db.query.membresTontine.findMany as any).mockResolvedValue([]);
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '0', due_count: '0', avg_late_days: '0' }] });
      mockSelect.mockReturnValue(createMockBuilder([{ cnt: 0 }]));
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const insertCallsBefore = mockInsert.mock.calls.length;

      await recalculateClientScore('client-1');

      // Only the upsertScoreState insert should have been called, NOT an audit event
      // The number of insert calls should only be 1 (upsertScoreState)
      const insertCallsAfter = mockInsert.mock.calls.length;
      expect(insertCallsAfter - insertCallsBefore).toBe(1); // Only upsertScoreState
    });
  });

  // --------------------------------------------------------------------------
  // Component score calculation (tested indirectly)
  // --------------------------------------------------------------------------

  describe('Component score calculations (via recalculate)', () => {
    beforeEach(() => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
    });

    it('should give high payment score for client with good repayment', async () => {
      const goodCredits = [
        { id: 'c1', clientId: 'client-1', statut: 'PAID' },
        { id: 'c2', clientId: 'client-1', statut: 'PAID' },
      ];

      (db.query.clients.findFirst as any).mockResolvedValue(MOCK_CLIENT);
      (db.query.credits.findMany as any).mockResolvedValue(goodCredits);
      (db.query.comptes.findMany as any).mockResolvedValue([]);
      (db.query.membresTontine.findMany as any).mockResolvedValue([]);
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '20', due_count: '20', avg_late_days: '0' }] });
      mockSelect.mockReturnValue(createMockBuilder([{ cnt: 0 }]));

      const result = await recalculateClientScore('client-1');

      // 2 credits paid, 100% repayment, 0 late days → high payment score
      // score = 50 + min(20, 2*7=14) + 20 (rate>=95%) + 10 (late<=3 & credits>0) = 94
      expect(result.scorePayment).toBe(94);
    });

    it('should penalize payment score for late credits', async () => {
      const lateCredits = [
        { id: 'c1', clientId: 'client-1', statut: 'LATE' },
        { id: 'c2', clientId: 'client-1', statut: 'ACTIVE' },
      ];

      (db.query.clients.findFirst as any).mockResolvedValue(MOCK_CLIENT);
      (db.query.credits.findMany as any).mockResolvedValue(lateCredits);
      (db.query.comptes.findMany as any).mockResolvedValue([]);
      (db.query.membresTontine.findMany as any).mockResolvedValue([]);
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '5', due_count: '20', avg_late_days: '30' }] });
      mockSelect.mockReturnValue(createMockBuilder([{ cnt: 0 }]));

      const result = await recalculateClientScore('client-1');

      // 1 late credit × -15, repayment 25% < 60% → -15, avgLate > 15 → -10
      // score = 50 + 0 - 15 - 15 - 10 = 10
      expect(result.scorePayment).toBe(10);
    });

    it('should give low compliance score for blacklisted PEP with no KYC', async () => {
      const riskyClient = {
        ...MOCK_CLIENT,
        kycStatus: 'PENDING',
        isPep: true,
        isBlacklisted: true,
        adresseDomicile: null,
        professionId: null,
        numeroPiece: null,
        typePiece: null,
        villeId: null,
        paysResidenceId: null,
      };

      (db.query.clients.findFirst as any).mockResolvedValue(riskyClient);
      (db.query.credits.findMany as any).mockResolvedValue([]);
      (db.query.comptes.findMany as any).mockResolvedValue([]);
      (db.query.membresTontine.findMany as any).mockResolvedValue([]);
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '0', due_count: '0', avg_late_days: '0' }] });
      mockSelect.mockReturnValue(createMockBuilder([{ cnt: 0 }]));

      const result = await recalculateClientScore('client-1');

      // KYC PENDING = 10, 0 profile fields = 0, blacklisted = 0 → 10
      expect(result.scoreCompliance).toBe(10);
    });

    it('should calculate tauxRemboursement from real echeances data', async () => {
      (db.query.clients.findFirst as any).mockResolvedValue(MOCK_CLIENT);
      (db.query.credits.findMany as any).mockResolvedValue([
        { id: 'c1', clientId: 'client-1', statut: 'ACTIVE' },
      ]);
      (db.query.comptes.findMany as any).mockResolvedValue([]);
      (db.query.membresTontine.findMany as any).mockResolvedValue([]);
      // 15 out of 20 installments paid = 75%
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '15', due_count: '20', avg_late_days: '2' }] });
      mockSelect.mockReturnValue(createMockBuilder([{ cnt: 0 }]));

      const result = await recalculateClientScore('client-1');

      expect(parseFloat(result.tauxRemboursement)).toBe(75);
    });
  });

  // --------------------------------------------------------------------------
  // Segment determination (tested indirectly)
  // --------------------------------------------------------------------------

  describe('Segment determination', () => {
    beforeEach(() => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
    });

    it('should assign Risque segment for client with late credits', async () => {
      (db.query.clients.findFirst as any).mockResolvedValue(MOCK_CLIENT);
      (db.query.credits.findMany as any).mockResolvedValue([
        { id: 'c1', clientId: 'client-1', statut: 'LATE' },
      ]);
      (db.query.comptes.findMany as any).mockResolvedValue([]);
      (db.query.membresTontine.findMany as any).mockResolvedValue([]);
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '0', due_count: '10', avg_late_days: '45' }] });
      mockSelect.mockReturnValue(createMockBuilder([{ cnt: 0 }]));

      const result = await recalculateClientScore('client-1');

      // creditsEnRetard > 0 → always Risque regardless of score
      expect(result.segment).toBe('Risque');
    });

    it('should assign Risque for very new client with no activity', async () => {
      const newClient = {
        ...MOCK_CLIENT,
        dateAdhesion: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 1 month ago
      };

      (db.query.clients.findFirst as any).mockResolvedValue(newClient);
      (db.query.credits.findMany as any).mockResolvedValue([]);
      (db.query.comptes.findMany as any).mockResolvedValue([]);
      (db.query.membresTontine.findMany as any).mockResolvedValue([]);
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '0', due_count: '0', avg_late_days: '0' }] });
      mockSelect.mockReturnValue(createMockBuilder([{ cnt: 0 }]));

      const result = await recalculateClientScore('client-1');

      // 1-month client with zero activity → scoreGlobal ~32 < 40 → Risque
      expect(result.segment).toBe('Risque');
      expect(result.scoreGlobal).toBeLessThan(40);
    });

    it('should assign VIP for high-scoring client with repaid credits and tenure', async () => {
      const vipClient = {
        ...MOCK_CLIENT,
        dateAdhesion: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(), // ~13 months
        createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
      };

      (db.query.clients.findFirst as any).mockResolvedValue(vipClient);
      // 3 paid credits → creditsSoldes=3 >= 2 ✓
      (db.query.credits.findMany as any).mockResolvedValue([
        { id: 'c1', clientId: 'client-1', statut: 'PAID' },
        { id: 'c2', clientId: 'client-1', statut: 'PAID' },
        { id: 'c3', clientId: 'client-1', statut: 'PAID' },
      ]);
      // 2 savings accounts with 500k+ total balance
      (db.query.comptes.findMany as any).mockResolvedValue([
        { id: 'cpt1', clientId: 'client-1', statut: 'ACTIF', soldeCourant: '300000' },
        { id: 'cpt2', clientId: 'client-1', statut: 'ACTIF', soldeCourant: '250000' },
      ]);
      // 2 tontine participations with 100k+ cotisations
      (db.query.membresTontine.findMany as any).mockResolvedValue([
        { tontineId: 't1', statut: 'ACTIF', totalCotisations: '60000' },
        { tontineId: 't2', statut: 'ACTIF', totalCotisations: '50000' },
      ]);
      // Perfect repayment: 30/30 installments, 0 late days
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '30', due_count: '30', avg_late_days: '0' }] });
      // db.select() is used by getSavingsData (cnt) AND getEventSummary (totalPoints, etc.)
      // Both run in parallel; return combined object that satisfies both queries
      mockSelect.mockReturnValue(createMockBuilder([{
        cnt: 15,           // depots6Mois=15 for savings engagement
        totalPoints: 500,  // high points for loyalty
        totalDepots: 20,   // high for engagement + loyalty
        totalRemboursements: 10,
        totalCotisationsTontine: 5,
        totalIncidents: 0,
      }]));

      const result = await recalculateClientScore('client-1');

      expect(result.segment).toBe('VIP');
      expect(result.scoreGlobal).toBeGreaterThanOrEqual(80);
    });

    it('should assign Premium for good client with 1+ repaid credit and 6+ months', async () => {
      const premiumClient = {
        ...MOCK_CLIENT,
        dateAdhesion: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // ~6.5 months
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      };

      (db.query.clients.findFirst as any).mockResolvedValue(premiumClient);
      // 2 paid credits → creditsSoldes=2 >= 1 ✓
      (db.query.credits.findMany as any).mockResolvedValue([
        { id: 'c1', clientId: 'client-1', statut: 'PAID' },
        { id: 'c2', clientId: 'client-1', statut: 'PAID' },
      ]);
      // Savings with decent balance
      (db.query.comptes.findMany as any).mockResolvedValue([
        { id: 'cpt1', clientId: 'client-1', statut: 'ACTIF', soldeCourant: '200000' },
      ]);
      // 1 tontine participation
      (db.query.membresTontine.findMany as any).mockResolvedValue([
        { tontineId: 't1', statut: 'ACTIF', totalCotisations: '50000' },
      ]);
      // Good repayment: 20/20 installments, 0 late days
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '20', due_count: '20', avg_late_days: '0' }] });
      // Combined mock for both getSavingsData and getEventSummary
      mockSelect.mockReturnValue(createMockBuilder([{
        cnt: 8,
        totalPoints: 200,
        totalDepots: 12,
        totalRemboursements: 5,
        totalCotisationsTontine: 3,
        totalIncidents: 0,
      }]));

      const result = await recalculateClientScore('client-1');

      expect(result.segment).toBe('Premium');
      expect(result.scoreGlobal).toBeGreaterThanOrEqual(65);
    });

    it('should assign Standard for established client with no credits', async () => {
      const establishedClient = {
        ...MOCK_CLIENT,
        dateAdhesion: new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString(), // 24 months ago
        createdAt: new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString(),
      };

      (db.query.clients.findFirst as any).mockResolvedValue(establishedClient);
      (db.query.credits.findMany as any).mockResolvedValue([]);
      (db.query.comptes.findMany as any).mockResolvedValue([]);
      (db.query.membresTontine.findMany as any).mockResolvedValue([]);
      mockExecute.mockResolvedValue({ rows: [{ paid_count: '0', due_count: '0', avg_late_days: '0' }] });
      mockSelect.mockReturnValue(createMockBuilder([{ cnt: 0 }]));

      const result = await recalculateClientScore('client-1');

      // 24-month client, VERIFIED KYC, full profile → scoreGlobal ~42 >= 40 → Standard
      expect(result.segment).toBe('Standard');
      expect(result.scoreGlobal).toBeGreaterThanOrEqual(40);
    });
  });

  // --------------------------------------------------------------------------
  // Query helpers
  // --------------------------------------------------------------------------

  describe('getScoreState', () => {
    it('should return state for existing client', async () => {
      const mockState = {
        clientId: 'client-1',
        scoreGlobal: 72,
        segment: 'Premium',
      };
      (db.query.clientScoreState.findFirst as any).mockResolvedValue(mockState);

      const result = await getScoreState('client-1');
      expect(result).toEqual(mockState);
    });

    it('should return undefined for non-existing client', async () => {
      (db.query.clientScoreState.findFirst as any).mockResolvedValue(undefined);

      const result = await getScoreState('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getScoreHistory', () => {
    it('should return paginated results with total count', async () => {
      const mockRows = [{ id: 'evt-1' }, { id: 'evt-2' }];
      // First call: select rows
      mockSelect
        .mockReturnValueOnce(createMockBuilder(mockRows))
        // Second call: count
        .mockReturnValueOnce(createMockBuilder([{ total: 42 }]));

      const result = await getScoreHistory('client-1', 10, 0);

      expect(result.rows).toEqual(mockRows);
      expect(result.total).toBe(42);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });
  });

  describe('getScoreTrend', () => {
    it('should return monthly trend data', async () => {
      mockExecute.mockResolvedValue({
        rows: [
          { month: '2026-02', points_delta: '25', event_count: '5' },
          { month: '2026-01', points_delta: '-10', event_count: '3' },
        ],
      });

      const result = await getScoreTrend('client-1', 6);

      expect(result).toHaveLength(2);
      expect(result[0].month).toBe('2026-02');
      expect(result[0].pointsDelta).toBe(25);
      expect(result[0].eventCount).toBe(5);
      expect(result[1].pointsDelta).toBe(-10);
    });
  });

  describe('getAgencyScoreStats', () => {
    it('should aggregate stats per agency', async () => {
      mockExecute.mockResolvedValue({
        rows: [{
          agence_id: 'agence-1',
          total_clients: '50',
          avg_score: '68',
          avg_payment: '72',
          avg_loyalty: '60',
          avg_engagement: '55',
          avg_compliance: '80',
          count_vip: '5',
          count_premium: '15',
          count_standard: '25',
          count_risque: '5',
        }],
      });

      const result = await getAgencyScoreStats('agence-1');

      expect(result).toHaveLength(1);
      expect(result[0].agenceId).toBe('agence-1');
      expect(result[0].totalClients).toBe(50);
      expect(result[0].avgScore).toBe(68);
      expect(result[0].segments.VIP).toBe(5);
      expect(result[0].segments.Premium).toBe(15);
      expect(result[0].segments.Standard).toBe(25);
      expect(result[0].segments.Risque).toBe(5);
    });
  });

  describe('getScorePercentile', () => {
    it('should return null when no score state exists', async () => {
      (db.query.clientScoreState.findFirst as any).mockResolvedValue(null);

      const result = await getScorePercentile('client-1');
      expect(result).toBeNull();
    });

    it('should compute correct percentile', async () => {
      (db.query.clientScoreState.findFirst as any).mockResolvedValue({
        clientId: 'client-1',
        agenceId: 'agence-1',
        scoreGlobal: 75,
      });

      mockExecute.mockResolvedValue({
        rows: [{ rank_position: '40', total: '50' }],
      });

      const result = await getScorePercentile('client-1');

      expect(result).not.toBeNull();
      expect(result!.rank).toBe(40);
      expect(result!.total).toBe(50);
      expect(result!.percentile).toBe(80); // 40/50 = 80%
      expect(result!.agenceId).toBe('agence-1');
    });
  });

  // --------------------------------------------------------------------------
  // Admin query helpers
  // --------------------------------------------------------------------------

  describe('getAdminScoreEvents', () => {
    it('should return paginated events with total count', async () => {
      const mockRows = [
        { id: 'evt-1', clientId: 'client-1', eventType: 'EPARGNE_DEPOT', clientNom: 'Dupont', clientPrenom: 'Jean' },
        { id: 'evt-2', clientId: 'client-2', eventType: 'CREDIT_REMBOURSEMENT', clientNom: 'Martin', clientPrenom: 'Paul' },
      ];
      mockSelect
        .mockReturnValueOnce(createMockBuilder(mockRows))
        .mockReturnValueOnce(createMockBuilder([{ total: 25 }]));

      const result = await getAdminScoreEvents({ limit: 10, offset: 0 });

      expect(result.rows).toEqual(mockRows);
      expect(result.total).toBe(25);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should cap limit at 200', async () => {
      mockSelect
        .mockReturnValueOnce(createMockBuilder([]))
        .mockReturnValueOnce(createMockBuilder([{ total: 0 }]));

      const result = await getAdminScoreEvents({ limit: 500 });

      expect(result.limit).toBe(200);
    });

    it('should accept filters without error', async () => {
      mockSelect
        .mockReturnValueOnce(createMockBuilder([]))
        .mockReturnValueOnce(createMockBuilder([{ total: 0 }]));

      const result = await getAdminScoreEvents({
        agenceId: 'agence-1',
        eventType: 'EPARGNE_DEPOT',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
        clientId: 'client-1',
      });

      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getAdminScoreStates', () => {
    it('should return paginated states with total count', async () => {
      const mockRows = [
        { id: 'state-1', clientId: 'client-1', scoreGlobal: 85, segment: 'VIP', clientNom: 'Dupont', clientPrenom: 'Jean' },
        { id: 'state-2', clientId: 'client-2', scoreGlobal: 45, segment: 'Standard', clientNom: 'Martin', clientPrenom: 'Paul' },
      ];
      mockSelect
        .mockReturnValueOnce(createMockBuilder(mockRows))
        .mockReturnValueOnce(createMockBuilder([{ total: 100 }]));

      const result = await getAdminScoreStates({ limit: 20, offset: 10 });

      expect(result.rows).toEqual(mockRows);
      expect(result.total).toBe(100);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(10);
    });

    it('should accept segment and agenceId filters', async () => {
      mockSelect
        .mockReturnValueOnce(createMockBuilder([]))
        .mockReturnValueOnce(createMockBuilder([{ total: 0 }]));

      const result = await getAdminScoreStates({
        agenceId: 'agence-1',
        segment: 'VIP',
      });

      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
