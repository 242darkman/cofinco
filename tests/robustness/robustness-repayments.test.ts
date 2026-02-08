import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { processAutomaticCreditRepayments } from 'server/services/automatic-repayment-service';
import { db } from 'server/db';

// Mock dependencies
vi.mock('server/db', () => ({
  db: {
    query: {
      credits: {
        findMany: vi.fn(),
      }
    },
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn((callback) => callback({
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis() }),
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{}]) }) }),
        select: vi.fn(),
    })),
  }
}));

// Helper to create a chainable, awaitable mock query builder
const createMockQueryBuilder = (result: any[]) => {
    const builder: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve(result),
    };
    return builder;
};

// Mock Ledger functions 
// Check where they are imported from in service. Usually ./ledger or ../storage/finance
vi.mock('server/services/ledger', () => ({
    executeWithLedger: vi.fn(async (module, data, callback) => {
        // Mock implementation that simply executes the callback
        const simpleTx = {
            update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis() }),
            insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{}]) }) }),
        };
        const mockMouvement = { id: 'mock-mvt-id', reference: 'REF-123' };
        return callback(simpleTx, mockMouvement);
    }),
    updateCompteSolde: vi.fn().mockResolvedValue('90000'),
    updateCreditSolde: vi.fn().mockResolvedValue('0'),
    generateReference: vi.fn().mockReturnValue('REF-TEST'),
}));

describe('Automatic Repayment Robustness', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should pay full installment when remaining balance is sufficient', async () => {
        // Setup: Credit 100k, Installment 10k, Balance 100k
        const mockCredit = {
            id: 'cred-1',
            clientId: 'client-1',
            montantEcheance: '10000',
            soldeRestant: '100000',
            remboursementCompteId: 'compte-1',
            prochaineEcheance: new Date('2025-01-01'),
            echeance: 'Mensuel'
        };

        const mockAccount = {
            id: 'compte-1',
            soldeCourant: '500000' // Rich account
        };

        // Mocks
        vi.mocked(db.query.credits.findMany).mockResolvedValue([mockCredit] as any);
        vi.mocked(db.select).mockReturnValue(createMockQueryBuilder([mockAccount]));

        const { updateCreditSolde, updateCompteSolde } = await import('../services/ledger');

        // Execute
        await processAutomaticCreditRepayments();

        // Assert
        expect(updateCompteSolde).toHaveBeenCalledWith(expect.anything(), 'compte-1', -10000);
        expect(updateCreditSolde).toHaveBeenCalledWith(expect.anything(), 'cred-1', -10000);
    });

    it('should CLAMP payment to remaining balance if installment > remaining', async () => {
        // Setup: Credit almost paid off. Remaining 500. Installment 1000.
        const mockCredit = {
            id: 'cred-final',
            clientId: 'client-1',
            montantEcheance: '1000',
            soldeRestant: '500', // < Installment
            remboursementCompteId: 'compte-1',
            prochaineEcheance: new Date('2025-01-01'),
            echeance: 'Mensuel'
        };

        const mockAccount = {
            id: 'compte-1',
            soldeCourant: '500000'
        };

        // Mocks
        vi.mocked(db.query.credits.findMany).mockResolvedValue([mockCredit] as any);
        // Important: Reset previous select mock to match structure if needed, or rely on implementation detail
        vi.mocked(db.select).mockReturnValue(createMockQueryBuilder([mockAccount]));

        const { updateCreditSolde, updateCompteSolde } = await import('../services/ledger');

        // Execute
        await processAutomaticCreditRepayments();

        // Assert
        // Should pay ONLY 500, not 1000
        expect(updateCompteSolde).toHaveBeenCalledWith(expect.anything(), 'compte-1', -500);
        expect(updateCreditSolde).toHaveBeenCalledWith(expect.anything(), 'cred-final', -500);
    });

    it('should SKIP payment if remaining balance is 0 or negative', async () => {
        // Setup: Fully paid credit but somehow flag still on
        const mockCredit = {
            id: 'cred-paid',
            clientId: 'client-1',
            montantEcheance: '1000',
            soldeRestant: '0', 
            remboursementCompteId: 'compte-1',
            prochaineEcheance: new Date('2025-01-01'),
        };

        vi.mocked(db.query.credits.findMany).mockResolvedValue([mockCredit] as any);

        const { updateCreditSolde } = await import('../services/ledger');

        // Execute
        await processAutomaticCreditRepayments();

        // Assert
        expect(updateCreditSolde).not.toHaveBeenCalled();
    });
});
