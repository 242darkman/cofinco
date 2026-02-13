import { describe, it, expect, vi } from 'vitest';

// Mock heavy dependencies so the module can load without a real DB / ledger.
vi.mock('server/db', () => ({
  db: { query: {}, select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
}));
vi.mock('server/services/ledger', () => ({
  executeWithLedger: vi.fn(),
  updateCompteSolde: vi.fn(),
  updateSessionSolde: vi.fn(),
  createOutboxEvent: vi.fn(),
  generateReference: vi.fn(),
}));
vi.mock('server/services/accounting-posting-service', () => ({
  postGlForMouvement: vi.fn(),
}));
vi.mock('server/storage/finance', () => ({
  createFactureForDepot: vi.fn(),
  createFactureForRetrait: vi.fn(),
  createFactureForDepotInitial: vi.fn(),
}));

import {
  recomputeAccountStatus,
  allocateOpeningPayment,
  type OpeningSnapshot,
} from 'server/services/comptes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an OpeningSnapshot with sensible defaults, overridable per-test. */
function makeSnapshot(overrides: Partial<OpeningSnapshot> = {}): OpeningSnapshot {
  return {
    openingFee: 0,
    minInitialDeposit: 0,
    initialDepositRequired: false,
    requiresApproval: false,
    maintenanceFee: 0,
    closingFee: 0,
    produitCode: 'CE',
    produitNom: 'Compte Epargne',
    ...overrides,
  };
}

/** Shorthand to call recomputeAccountStatus with explicit fields. */
function computeStatus(
  snapshot: OpeningSnapshot | null,
  paidFee: number,
  paidDeposit: number,
  isApproved: boolean,
): string {
  return recomputeAccountStatus({
    openingSnapshot: snapshot,
    paidOpeningFee: String(paidFee),
    paidInitialDeposit: String(paidDeposit),
    isApproved,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Account Opening - pure functions', () => {
  // -----------------------------------------------------------------------
  // 1. recomputeAccountStatus: 8-combination matrix
  // -----------------------------------------------------------------------
  describe('recomputeAccountStatus - status matrix (8 combinations)', () => {
    it('#1 fee=0, deposit=false, approval=false -> ACTIVE', () => {
      const snap = makeSnapshot({
        openingFee: 0,
        initialDepositRequired: false,
        minInitialDeposit: 0,
        requiresApproval: false,
      });
      expect(computeStatus(snap, 0, 0, false)).toBe('ACTIVE');
    });

    it('#2 fee=5000, deposit=false, approval=false -> PENDING_PAYMENT (nothing paid)', () => {
      const snap = makeSnapshot({
        openingFee: 5000,
        initialDepositRequired: false,
        minInitialDeposit: 0,
        requiresApproval: false,
      });
      expect(computeStatus(snap, 0, 0, false)).toBe('PENDING_PAYMENT');
    });

    it('#3 fee=0, deposit=true (2500), approval=false -> PENDING_PAYMENT', () => {
      const snap = makeSnapshot({
        openingFee: 0,
        initialDepositRequired: true,
        minInitialDeposit: 2500,
        requiresApproval: false,
      });
      expect(computeStatus(snap, 0, 0, false)).toBe('PENDING_PAYMENT');
    });

    it('#4 fee=5000, deposit=true (2500), approval=false -> PENDING_PAYMENT', () => {
      const snap = makeSnapshot({
        openingFee: 5000,
        initialDepositRequired: true,
        minInitialDeposit: 2500,
        requiresApproval: false,
      });
      expect(computeStatus(snap, 0, 0, false)).toBe('PENDING_PAYMENT');
    });

    it('#5 fee=0, deposit=false, approval=true -> PENDING_APPROVAL', () => {
      const snap = makeSnapshot({
        openingFee: 0,
        initialDepositRequired: false,
        minInitialDeposit: 0,
        requiresApproval: true,
      });
      expect(computeStatus(snap, 0, 0, false)).toBe('PENDING_APPROVAL');
    });

    it('#6 fee=5000, deposit=false, approval=true -> PENDING_PAYMENT_AND_APPROVAL', () => {
      const snap = makeSnapshot({
        openingFee: 5000,
        initialDepositRequired: false,
        minInitialDeposit: 0,
        requiresApproval: true,
      });
      expect(computeStatus(snap, 0, 0, false)).toBe('PENDING_PAYMENT_AND_APPROVAL');
    });

    it('#7 fee=0, deposit=true (2500), approval=true -> PENDING_PAYMENT_AND_APPROVAL', () => {
      const snap = makeSnapshot({
        openingFee: 0,
        initialDepositRequired: true,
        minInitialDeposit: 2500,
        requiresApproval: true,
      });
      expect(computeStatus(snap, 0, 0, false)).toBe('PENDING_PAYMENT_AND_APPROVAL');
    });

    it('#8 fee=5000, deposit=true (2500), approval=true -> PENDING_PAYMENT_AND_APPROVAL', () => {
      const snap = makeSnapshot({
        openingFee: 5000,
        initialDepositRequired: true,
        minInitialDeposit: 2500,
        requiresApproval: true,
      });
      expect(computeStatus(snap, 0, 0, false)).toBe('PENDING_PAYMENT_AND_APPROVAL');
    });

    // Verify that fully-paid + approved variants of each row yield ACTIVE
    it('#2 fully paid -> ACTIVE', () => {
      const snap = makeSnapshot({ openingFee: 5000 });
      expect(computeStatus(snap, 5000, 0, false)).toBe('ACTIVE');
    });

    it('#4 fully paid -> ACTIVE', () => {
      const snap = makeSnapshot({
        openingFee: 5000,
        initialDepositRequired: true,
        minInitialDeposit: 2500,
      });
      expect(computeStatus(snap, 5000, 2500, false)).toBe('ACTIVE');
    });

    it('#6 fully paid and approved -> ACTIVE', () => {
      const snap = makeSnapshot({ openingFee: 5000, requiresApproval: true });
      expect(computeStatus(snap, 5000, 0, true)).toBe('ACTIVE');
    });

    it('#8 fully paid and approved -> ACTIVE', () => {
      const snap = makeSnapshot({
        openingFee: 5000,
        initialDepositRequired: true,
        minInitialDeposit: 2500,
        requiresApproval: true,
      });
      expect(computeStatus(snap, 5000, 2500, true)).toBe('ACTIVE');
    });
  });

  // -----------------------------------------------------------------------
  // 2. recomputeAccountStatus: partial payment transitions
  // -----------------------------------------------------------------------
  describe('recomputeAccountStatus - partial payment transitions', () => {
    // Scenario: fee=5000, deposit=2500, requiresApproval=true
    const snap = makeSnapshot({
      openingFee: 5000,
      initialDepositRequired: true,
      minInitialDeposit: 2500,
      requiresApproval: true,
    });

    it('starts at PENDING_PAYMENT_AND_APPROVAL with nothing paid', () => {
      expect(computeStatus(snap, 0, 0, false)).toBe('PENDING_PAYMENT_AND_APPROVAL');
    });

    it('partial fee payment (3000) -> still PENDING_PAYMENT_AND_APPROVAL', () => {
      // Paid 3000 towards fee, 0 towards deposit, not approved
      expect(computeStatus(snap, 3000, 0, false)).toBe('PENDING_PAYMENT_AND_APPROVAL');
    });

    it('fee fully paid (5000) but no deposit -> still PENDING_PAYMENT_AND_APPROVAL', () => {
      // Fee done, deposit still 0, not approved
      expect(computeStatus(snap, 5000, 0, false)).toBe('PENDING_PAYMENT_AND_APPROVAL');
    });

    it('fee fully paid + approved but no deposit -> PENDING_PAYMENT', () => {
      // Fee done, approved, but deposit still outstanding
      expect(computeStatus(snap, 5000, 0, true)).toBe('PENDING_PAYMENT');
    });

    it('fee fully paid + deposit fully paid + approved -> ACTIVE', () => {
      expect(computeStatus(snap, 5000, 2500, true)).toBe('ACTIVE');
    });

    it('all paid but not approved -> PENDING_APPROVAL', () => {
      expect(computeStatus(snap, 5000, 2500, false)).toBe('PENDING_APPROVAL');
    });
  });

  // -----------------------------------------------------------------------
  // 3. recomputeAccountStatus: legacy accounts (null snapshot)
  // -----------------------------------------------------------------------
  describe('recomputeAccountStatus - legacy accounts without snapshot', () => {
    it('null snapshot -> ACTIVE', () => {
      expect(computeStatus(null, 0, 0, false)).toBe('ACTIVE');
    });

    it('null snapshot -> ACTIVE regardless of other fields', () => {
      // Even with "unpaid" values and no approval, a null snapshot means legacy -> ACTIVE
      expect(computeStatus(null, 0, 0, true)).toBe('ACTIVE');
      expect(computeStatus(null, 999, 999, false)).toBe('ACTIVE');
    });
  });

  // -----------------------------------------------------------------------
  // 4. allocateOpeningPayment - fee-first allocation
  // -----------------------------------------------------------------------
  describe('allocateOpeningPayment - fee-first allocation', () => {
    it('amount 3000, fee=5000, no prior payments -> all to fee', () => {
      const snap = makeSnapshot({ openingFee: 5000 });
      const result = allocateOpeningPayment(3000, snap, 0, 0);
      expect(result.feePayment).toBe(3000);
      expect(result.depositPayment).toBe(0);
    });

    it('amount 7000, fee=5000, already paid 2000 fee -> 3000 fee + 4000 deposit', () => {
      const snap = makeSnapshot({ openingFee: 5000 });
      const result = allocateOpeningPayment(7000, snap, 2000, 0);
      expect(result.feePayment).toBe(3000);
      expect(result.depositPayment).toBe(4000);
    });

    it('amount 5000, fee=0 -> all to deposit', () => {
      const snap = makeSnapshot({ openingFee: 0 });
      const result = allocateOpeningPayment(5000, snap, 0, 0);
      expect(result.feePayment).toBe(0);
      expect(result.depositPayment).toBe(5000);
    });

    it('amount exactly covers remaining fee -> feePayment=amount, deposit=0', () => {
      const snap = makeSnapshot({ openingFee: 5000 });
      const result = allocateOpeningPayment(5000, snap, 0, 0);
      expect(result.feePayment).toBe(5000);
      expect(result.depositPayment).toBe(0);
    });

    it('fee already fully paid -> entire amount goes to deposit', () => {
      const snap = makeSnapshot({ openingFee: 5000 });
      const result = allocateOpeningPayment(3000, snap, 5000, 0);
      expect(result.feePayment).toBe(0);
      expect(result.depositPayment).toBe(3000);
    });

    it('overpaid fee scenario -> no negative fee, excess to deposit', () => {
      const snap = makeSnapshot({ openingFee: 5000 });
      // Already paid 6000 in fee (overpaid) - remaining fee should clamp to 0
      const result = allocateOpeningPayment(2000, snap, 6000, 0);
      expect(result.feePayment).toBe(0);
      expect(result.depositPayment).toBe(2000);
    });
  });

  // -----------------------------------------------------------------------
  // 5. recomputeAccountStatus: approval before payment
  // -----------------------------------------------------------------------
  describe('recomputeAccountStatus - approval granted before full payment', () => {
    it('fee=5000, approval required, approved but unpaid -> PENDING_PAYMENT', () => {
      const snap = makeSnapshot({ openingFee: 5000, requiresApproval: true });
      expect(computeStatus(snap, 0, 0, true)).toBe('PENDING_PAYMENT');
    });

    it('fee=5000, approval required, approved and fully paid -> ACTIVE', () => {
      const snap = makeSnapshot({ openingFee: 5000, requiresApproval: true });
      expect(computeStatus(snap, 5000, 0, true)).toBe('ACTIVE');
    });

    it('fee=5000 + deposit=2500, approved but only fee paid -> PENDING_PAYMENT', () => {
      const snap = makeSnapshot({
        openingFee: 5000,
        initialDepositRequired: true,
        minInitialDeposit: 2500,
        requiresApproval: true,
      });
      expect(computeStatus(snap, 5000, 0, true)).toBe('PENDING_PAYMENT');
    });

    it('fee=5000 + deposit=2500, approved and fully paid -> ACTIVE', () => {
      const snap = makeSnapshot({
        openingFee: 5000,
        initialDepositRequired: true,
        minInitialDeposit: 2500,
        requiresApproval: true,
      });
      expect(computeStatus(snap, 5000, 2500, true)).toBe('ACTIVE');
    });
  });
});
