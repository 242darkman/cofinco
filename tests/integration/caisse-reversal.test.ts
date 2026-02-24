import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Integration tests for caisse transaction reversal flow.
// Tests the reverseOperation service function with mocked DB layer.
// ============================================================================

// Use vi.hoisted to declare mocks that are referenced in vi.mock factories
const {
  mockTx,
  mockEmitBalanceUpdates,
  mockCreateMouvementEvents,
  mockUpdateCompteSolde,
  mockUpdateSessionSolde,
  mockGenerateReference,
} = vi.hoisted(() => ({
  mockTx: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
  mockEmitBalanceUpdates: vi.fn(),
  mockCreateMouvementEvents: vi.fn(),
  mockUpdateCompteSolde: vi.fn(),
  mockUpdateSessionSolde: vi.fn(),
  mockGenerateReference: vi.fn().mockReturnValue('REV-2026-001'),
}));

vi.mock('server/db', () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(async (fn: any) => fn(mockTx)),
  },
}));

vi.mock('server/services/ledger', () => ({
  createMouvementFinancier: vi.fn(),
  createOutboxEvent: vi.fn(),
  createMouvementEvents: mockCreateMouvementEvents,
  updateCompteSolde: mockUpdateCompteSolde,
  updateSessionSolde: mockUpdateSessionSolde,
  generateReference: mockGenerateReference,
  emitBalanceUpdates: mockEmitBalanceUpdates,
}));

vi.mock('server/services/notifications/domain-events/event-registry', () => ({
  dispatchDomainEvent: vi.fn(),
}));

vi.mock('server/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()
  })
}));

vi.mock('server/services/accounting-posting-service', () => ({
  postGlForMouvement: vi.fn().mockResolvedValue(null),
  AccountingRuleNotFoundError: class extends Error {},
}));

import { db } from 'server/db';
import { reverseOperation, ReversalError, canReverseOperation } from 'server/services/caisse/transaction-reversal-service';

// Helper to build mock chain that is both chainable AND thenable (like Drizzle)
function mockChain(result: any) {
  const thenableMixin = {
    then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
  };
  const chain: any = {
    ...thenableMixin,
    from: vi.fn().mockImplementation(() => chain),
    where: vi.fn().mockImplementation(() => chain),
    orderBy: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockResolvedValue(result),
    set: vi.fn().mockImplementation(() => chain),
    values: vi.fn().mockImplementation(() => chain),
    returning: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

describe('Caisse Reversal Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('reverseOperation', () => {
    const validRequest = {
      operationId: 'op-123',
      reason: 'Erreur de saisie',
      userId: 'user-456',
      sessionCaisseId: 'session-789',
    };

    const mockOriginalOperation = {
      id: 'op-123',
      sessionId: 'session-789',
      typeOperation: 'DEPOT',
      statut: 'POSTED',
      montant: '50000',
      mouvementId: 'mvt-001',
      methodePaiement: 'ESPECES',
      reference: 'REF-2026-001',
      description: 'Dépôt espèces',
      clientId: 'client-1',
      reversalOfId: null,
    };

    const mockOriginalMouvement = {
      id: 'mvt-001',
      montant: '50000',
      sens: 'CREDIT',
      sourceModule: 'CAISSE',
      typePaiement: 'DEPOT',
      methodePaiement: 'ESPECES',
      clientId: 'client-1',
      compteId: 'compte-1',
      creditId: null,
      tontineId: null,
      sessionCaisseId: 'session-789',
      agenceId: 'agence-1',
      agentId: 'agent-1',
      reference: 'REF-2026-001',
    };

    it('should reject if reason is too short', async () => {
      await expect(
        reverseOperation({ ...validRequest, reason: 'ab' })
      ).rejects.toThrow(ReversalError);

      await expect(
        reverseOperation({ ...validRequest, reason: '' })
      ).rejects.toThrow(ReversalError);
    });

    it('should reject if operation not found', async () => {
      (db.select as any).mockReturnValue(mockChain([]));

      await expect(reverseOperation(validRequest)).rejects.toThrow('Operation introuvable');
    });

    it('should reject if operation is already REVERSED', async () => {
      (db.select as any).mockReturnValueOnce(
        mockChain([{ ...mockOriginalOperation, statut: 'REVERSED' }])
      );

      await expect(reverseOperation(validRequest)).rejects.toThrow('deja ete annulee');
    });

    it('should reject if operation is already CANCELLED', async () => {
      (db.select as any).mockReturnValueOnce(
        mockChain([{ ...mockOriginalOperation, statut: 'CANCELLED' }])
      );

      await expect(reverseOperation(validRequest)).rejects.toThrow('deja ete annulee');
    });

    it('should reject if operation is not POSTED', async () => {
      (db.select as any).mockReturnValueOnce(
        mockChain([{ ...mockOriginalOperation, statut: 'PENDING' }])
      );

      await expect(reverseOperation(validRequest)).rejects.toThrow('Seules les operations POSTED');
    });

    it('should reject if a reversal already exists', async () => {
      // First call: find original operation
      (db.select as any)
        .mockReturnValueOnce(mockChain([mockOriginalOperation]))
        // Second call: check for existing reversal - found one
        .mockReturnValueOnce(mockChain([{ id: 'existing-reversal' }]));

      await expect(reverseOperation(validRequest)).rejects.toThrow('contre-passation existe deja');
    });

    it('should reject if original mouvement not found', async () => {
      // Original operation found
      (db.select as any)
        .mockReturnValueOnce(mockChain([mockOriginalOperation]))
        // No existing reversal
        .mockReturnValueOnce(mockChain([]))
        // Original mouvement not found
        .mockReturnValueOnce(mockChain([]));

      await expect(reverseOperation(validRequest)).rejects.toThrow('Mouvement financier original introuvable');
    });

    it('should reject if session is not OPEN', async () => {
      (db.select as any)
        .mockReturnValueOnce(mockChain([mockOriginalOperation]))
        .mockReturnValueOnce(mockChain([]))  // no existing reversal
        .mockReturnValueOnce(mockChain([mockOriginalMouvement]))  // mouvement found
        .mockReturnValueOnce(mockChain([{ id: 'session-789', statut: 'PENDING_CLOSE' }]));  // session not open

      await expect(reverseOperation(validRequest)).rejects.toThrow('session de caisse doit etre ouverte');
    });

    it('should execute full reversal when all validations pass', async () => {
      const reversalMvt = { ...mockOriginalMouvement, id: 'mvt-rev-001', sens: 'DEBIT' };
      const reversalOp = { ...mockOriginalOperation, id: 'op-rev-001', statut: 'POSTED' };
      const updatedOriginal = { ...mockOriginalOperation, statut: 'REVERSED' };

      // Main DB selects (5 calls before transaction)
      (db.select as any)
        .mockReturnValueOnce(mockChain([mockOriginalOperation]))
        .mockReturnValueOnce(mockChain([]))  // no existing reversal
        .mockReturnValueOnce(mockChain([mockOriginalMouvement]))
        .mockReturnValueOnce(mockChain([{ id: 'session-789', statut: 'OPEN' }]))  // original session check (CLOSED?)
        .mockReturnValueOnce(mockChain([{ id: 'session-789', statut: 'OPEN' }]));  // reversal session check (must be OPEN)

      // Transaction mocks
      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn()
            .mockResolvedValueOnce([reversalMvt])    // mouvement insert
            .mockResolvedValueOnce([reversalOp]),     // operation insert
        }),
      });
      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockTx.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn()
            .mockResolvedValueOnce([])               // linked transaction (none)
            .mockResolvedValueOnce([updatedOriginal]), // reload original
        }),
      });

      const result = await reverseOperation(validRequest);

      expect(result.reversalMouvement.sens).toBe('DEBIT');
      expect(result.reversalOperation.statut).toBe('POSTED');
      expect(result.originalOperation.statut).toBe('REVERSED');
      expect(mockEmitBalanceUpdates).toHaveBeenCalled();
    });
  });

  describe('canReverseOperation', () => {
    it('should return reversible:true for POSTED operation with no existing reversal', async () => {
      (db.select as any)
        .mockReturnValueOnce(mockChain([{ id: 'op-1', statut: 'POSTED', mouvementId: 'mvt-1' }]))
        .mockReturnValueOnce(mockChain([]));

      const result = await canReverseOperation('op-1');
      expect(result.reversible).toBe(true);
    });

    it('should return reversible:false for non-POSTED operation', async () => {
      (db.select as any).mockReturnValueOnce(mockChain([{ id: 'op-1', statut: 'CLOSED', mouvementId: 'mvt-1' }]));

      const result = await canReverseOperation('op-1');
      expect(result.reversible).toBe(false);
      expect(result.reason).toContain('CLOSED');
    });

    it('should return reversible:false for operation without mouvement', async () => {
      (db.select as any).mockReturnValueOnce(mockChain([{ id: 'op-1', statut: 'POSTED', mouvementId: null }]));

      const result = await canReverseOperation('op-1');
      expect(result.reversible).toBe(false);
    });

    it('should return reversible:false when already reversed', async () => {
      (db.select as any)
        .mockReturnValueOnce(mockChain([{ id: 'op-1', statut: 'POSTED', mouvementId: 'mvt-1' }]))
        .mockReturnValueOnce(mockChain([{ id: 'existing-rev' }]));

      const result = await canReverseOperation('op-1');
      expect(result.reversible).toBe(false);
      expect(result.reason).toContain('annulee');
    });

    it('should return reversible:false for unknown operation', async () => {
      (db.select as any).mockReturnValueOnce(mockChain([]));

      const result = await canReverseOperation('nonexistent');
      expect(result.reversible).toBe(false);
      expect(result.reason).toContain('introuvable');
    });
  });
});
