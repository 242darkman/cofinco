import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted to create mockTx before vi.mock factories run
const { mockTx } = vi.hoisted(() => ({
  mockTx: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}));

// Mock the db module
vi.mock('server/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(async (fn: any) => fn(mockTx)),
  }
}));

// Mock logger (imported at module level)
vi.mock('server/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()
  })
}));

// Mock accounting-posting-service (used inside transaction)
vi.mock('server/services/accounting-posting-service', () => ({
  postGlForMouvement: vi.fn().mockResolvedValue(null),
  AccountingRuleNotFoundError: class extends Error {},
}));

import { calculateNextTransferDate, executeAutomaticTransfer } from 'server/services/automatic-transfers-service';
import { db } from 'server/db';

describe('Automatic Transfers Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateNextTransferDate', () => {
    it('should calculate next monthly transfer correctly', () => {
      const baseDate = new Date('2026-01-15');
      const nextDate = calculateNextTransferDate('MONTHLY', 28, baseDate);

      expect(nextDate.getMonth()).toBe(1); // February
      expect(nextDate.getDate()).toBe(28);
    });

    it('should handle end of month correctly for monthly transfers', () => {
      const baseDate = new Date('2026-01-31');
      const nextDate = calculateNextTransferDate('MONTHLY', 28, baseDate);

      // Jan 31 + 1 month -> overflow to March, then setDate(28) -> March 28
      expect(nextDate.getMonth()).toBe(2); // March (0-indexed)
      expect(nextDate.getDate()).toBe(28);
    });

    it('should calculate weekly transfer correctly', () => {
      const baseDate = new Date('2026-01-15'); // Thursday
      const nextDate = calculateNextTransferDate('WEEKLY', 1, baseDate); // Monday

      expect(nextDate.getTime()).toBeGreaterThan(baseDate.getTime());
      expect(nextDate.getDay()).toBe(1); // Monday
    });

    it('should fall back to monthly for BI_MONTHLY frequency (not implemented)', () => {
      const baseDate = new Date('2026-01-15');
      const nextDate = calculateNextTransferDate('BI_MONTHLY', 15, baseDate);

      // BI_MONTHLY falls through to default (monthly behavior)
      expect(nextDate.getMonth()).toBe(1); // February
      expect(nextDate.getDate()).toBe(15);
    });

    it('should fall back to monthly for QUARTERLY frequency (not implemented)', () => {
      const baseDate = new Date('2026-01-15');
      const nextDate = calculateNextTransferDate('QUARTERLY', 15, baseDate);

      // QUARTERLY falls through to default (monthly behavior)
      expect(nextDate.getMonth()).toBe(1); // February
      expect(nextDate.getDate()).toBe(15);
    });

    it('should handle daily transfers', () => {
      const baseDate = new Date('2026-01-15');
      const nextDate = calculateNextTransferDate('DAILY', 1, baseDate);

      const diffDays = Math.floor((nextDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(1);
    });

    it('should use current date if no base date provided', () => {
      const before = new Date();
      const nextDate = calculateNextTransferDate('MONTHLY', 15);
      const after = new Date();

      expect(nextDate.getTime()).toBeGreaterThan(before.getTime());
      expect(nextDate.getTime()).toBeLessThan(after.getTime() + 62 * 24 * 60 * 60 * 1000); // Within ~2 months
    });
  });

  describe('executeAutomaticTransfer - Validation', () => {
    it('should reject if compte destination not found', async () => {
      // Mock db.select to return empty array (not found)
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      } as any);

      const result = await executeAutomaticTransfer('non-existent-id', 'user-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('non trouvé');
    });

    it('should reject if versement auto not active', async () => {
      const mockCompte = {
        id: 'compte-1',
        numeroCompte: 'EPG-001',
        versementAutoActif: false,
        statut: 'ACTIVE',
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockCompte]),
      } as any);

      const result = await executeAutomaticTransfer('compte-1', 'user-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('non actif');
    });

    it('should reject if no source account configured', async () => {
      const mockCompte = {
        id: 'compte-2',
        numeroCompte: 'EPG-002',
        versementAutoActif: true,
        compteSourceId: null,
        statut: 'ACTIVE',
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockCompte]),
      } as any);

      const result = await executeAutomaticTransfer('compte-2', 'user-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('compte source');
    });

    it('should reject if insufficient balance', async () => {
      const mockDest = {
        id: 'dest-1',
        versementAutoActif: true,
        compteSourceId: 'source-1',
        statut: 'ACTIVE',
        versementAutoMontant: '10000',
      };

      const mockSource = {
        id: 'source-1',
        soldeCourant: '5000', // Insufficient
        statut: 'ACTIVE',
      };

      // First select returns dest, second returns source
      const limitFn = vi.fn()
        .mockResolvedValueOnce([mockDest])
        .mockResolvedValueOnce([mockSource]);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: limitFn,
      } as any);

      const result = await executeAutomaticTransfer('dest-1', 'user-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Solde insuffisant');
    });

    it('should reject if source account is not active', async () => {
      const mockDest = {
        id: 'dest-1',
        versementAutoActif: true,
        compteSourceId: 'source-1',
        statut: 'ACTIVE',
      };

      const mockSource = {
        id: 'source-1',
        statut: 'SUSPENDED',
      };

      const limitFn = vi.fn()
        .mockResolvedValueOnce([mockDest])
        .mockResolvedValueOnce([mockSource]);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: limitFn,
      } as any);

      const result = await executeAutomaticTransfer('dest-1', 'user-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('SUSPENDED');
    });

    it('should reject if destination account is not active', async () => {
      const mockDest = {
        id: 'dest-1',
        versementAutoActif: true,
        compteSourceId: 'source-1',
        statut: 'CLOSED',
      };

      const mockSource = {
        id: 'source-1',
        statut: 'ACTIVE',
      };

      const limitFn = vi.fn()
        .mockResolvedValueOnce([mockDest])
        .mockResolvedValueOnce([mockSource]);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: limitFn,
      } as any);

      const result = await executeAutomaticTransfer('dest-1', 'user-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('CLOSED');
    });
  });

  describe('executeAutomaticTransfer - Success Cases', () => {
    const mockDest = {
      id: 'dest-1',
      versementAutoActif: true,
      compteSourceId: 'source-1',
      statut: 'ACTIVE',
      versementAutoMontant: '25000',
      versementAutoFrequence: 'MONTHLY',
      versementAutoJour: 28,
      soldeCourant: '0',
      numeroCompte: 'DST-001',
      agenceId: null,
    };

    const mockSource = {
      id: 'source-1',
      statut: 'ACTIVE',
      soldeCourant: '50000',
      numeroCompte: 'SRC-001',
    };

    function setupSuccessMocks() {
      const limitFn = vi.fn()
        .mockResolvedValueOnce([mockDest])
        .mockResolvedValueOnce([mockSource]);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: limitFn,
      } as any);

      // mockTx.insert for: mouvement (returning), transactionSource, transactionDest, versementsAutomatiques
      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'mvt-001' }]),
        }),
      });

      // mockTx.update for: source balance, dest balance, GL status
      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      });

      // db.update for post-transaction date update
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      } as any);
    }

    it('should create financial movement and update balances on success', async () => {
      setupSuccessMocks();

      const result = await executeAutomaticTransfer('dest-1', 'user-id', 1);

      expect(result.success).toBe(true);
      expect(result.mouvementId).toBe('mvt-001');

      // Verify mockTx.insert was called (mouvement + 2 transactions + history = 4)
      expect(mockTx.insert).toHaveBeenCalled();
    });

    it('should update dernierVersementAuto and prochainVersementAuto', async () => {
      setupSuccessMocks();

      await executeAutomaticTransfer('dest-1', 'user-id', 1);

      // After transaction: db.update is called to update compte dates
      expect(db.update).toHaveBeenCalled();
    });

    it('should record success in versements_automatiques table', async () => {
      setupSuccessMocks();

      await executeAutomaticTransfer('dest-1', 'user-id', 1);

      // Verify insert was called inside transaction
      expect(mockTx.insert).toHaveBeenCalled();
    });
  });

  describe('executeAutomaticTransfer - Error Handling', () => {
    it('should handle error during transaction and retry', async () => {
      const mockDest = {
        id: 'dest-1',
        versementAutoActif: true,
        compteSourceId: 'source-1',
        statut: 'ACTIVE',
        versementAutoMontant: '100000',
        soldeCourant: '0',
        prochainVersementAuto: new Date(),
      };

      const mockSource = {
        id: 'source-1',
        statut: 'ACTIVE',
        soldeCourant: '500000',
      };

      // db.select used before transaction (dest + source) and after failure (for logging)
      const limitFn = vi.fn()
        .mockResolvedValueOnce([mockDest])
        .mockResolvedValueOnce([mockSource])
        // Second retry dest + source
        .mockResolvedValueOnce([mockDest]);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: limitFn,
      } as any);

      // Force transaction to throw
      vi.mocked(db.transaction as any).mockRejectedValue(new Error('Database insert failed'));

      // Mock db.insert for failure logging (after all retries)
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const result = await executeAutomaticTransfer('dest-1', 'user-id', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database insert failed');
    });

    it('should not create mouvement financier on early validation failure', async () => {
      // Trigger error early (dest not found)
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      } as any);

      const result = await executeAutomaticTransfer('dest-1', 'user-id');
      expect(result.success).toBe(false);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(db.select).mockImplementation(() => {
        throw new Error('Connection timeout');
      });

      // db.insert for failure logging
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const result = await executeAutomaticTransfer('dest-1', 'user-id', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });
  });
});
