
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import comptesService from 'server/services/comptes';
import { db } from 'server/db';
import { transactionsCompte, comptes, factures } from '@shared/schema';

// --- Mocks Setup ---

const mockTx = {
  update: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  delete: vi.fn(),
  query: {
    comptes: { findFirst: vi.fn() },
  }
};

let mockValuesSpy: any;
let mockSetSpy: any;

const createMockBuilder = (result: any = []) => {
  const builder: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    set: mockSetSpy,
    values: mockValuesSpy,
    returning: vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]),
    then: (resolve: any) => resolve(Array.isArray(result) ? result : [result]),
  };
  return builder;
};

// Mock dependencies
vi.mock('server/db', () => ({
  db: {
    query: {
      comptes: { findFirst: vi.fn(), findMany: vi.fn() },
      modelesFactures: { findFirst: vi.fn() },
      factures: { findFirst: vi.fn() },
    },
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn((callback) => callback(mockTx)),
  }
}));

// Mock Ledger to avoid real financial logic complexity in unit test
vi.mock('server/services/ledger', () => ({
  executeWithLedger: vi.fn(async (module, data, callback) => {
    // Simulate ledger execution by calling callback
    mockTx.update.mockReturnValue(createMockBuilder([{}]));
    mockTx.insert.mockReturnValue(createMockBuilder([{}]));
    return callback(mockTx, { id: 'mvt-ledger-123', reference: 'REF-LEDGER' });
  }),
  updateCompteSolde: vi.fn().mockResolvedValue('5000'),
  updateSessionSolde: vi.fn().mockResolvedValue('55000'),
  generateReference: vi.fn().mockReturnValue('REF-TEST-GEN'),
}));

// Mock finance storage functions used creating invoices
vi.mock('server/storage/finance', () => ({
  createFactureForDepotInitial: vi.fn().mockResolvedValue({ id: 'fac-1', reference: 'FAC-INIT' }),
  createFactureForDepot: vi.fn(),
  createFactureForRetrait: vi.fn()
}));

describe('Account Opening & Activation Workflow', () => {

  beforeEach(() => {
    vi.clearAllMocks();

    // Initialize Spies
    mockValuesSpy = vi.fn().mockImplementation(() => createMockBuilder([{ id: 'mock-id' }]));
    mockSetSpy = vi.fn().mockImplementation(() => createMockBuilder([{ id: 'mock-id' }]));

    // Default builder return
    mockTx.insert.mockImplementation(() => createMockBuilder([{ id: 'new-compte-id', numeroCompte: 'CPT-NEW' }]));
    mockTx.update.mockImplementation(() => createMockBuilder([{ id: 'mock-id' }]));
    mockTx.select.mockImplementation(() => createMockBuilder([{ id: 'mock-id' }]));
    
    vi.mocked(db.insert).mockImplementation(() => createMockBuilder([{ id: 'new-compte-id' }]));
    vi.mocked(db.update).mockImplementation(() => createMockBuilder([{ id: 'updated-id' }]));
    vi.mocked(db.select).mockImplementation(() => createMockBuilder([]));
  });

  describe('createCompteWithInitialDeposit', () => {

    it('should create an account with PENDING_ACTIVATION status when mode is "CASH"', async () => {
      // Setup - use correct function signature: (data, userId)
      const payload = {
        clientId: 'client-1',
        typeCompte: 'SAVINGS' as const,
        agenceId: 'agence-1',
        montantInitial: 5000,
        modePaiement: 'CASH' as const,
      };

      // Execute - createCompteWithInitialDeposit takes (data, userId) not (data, userId, agenceId)
      await comptesService.createCompteWithInitialDeposit(payload, 'user-1');

      // Assert
      // 1. Verify db.insert was called for Comptes table (via tx)
      expect(mockTx.insert).toHaveBeenCalledWith(comptes);

      // 2. Verify values passed contain correct status
      const insertCall = vi.mocked(mockValuesSpy).mock.calls[0];
      const insertedData = insertCall[0];
      expect(insertedData).toMatchObject({
        statut: 'PENDING_ACTIVATION',
        soldeCourant: '5000', // For PENDING_ACTIVATION, soldeCourant stores the expected initial deposit
      });
    });

    it('should activate account immediately when mode is "TRANSFER"', async () => {
       // Setup - use correct function signature
       const payload = {
         clientId: 'client-1',
         typeCompte: 'SAVINGS' as const,
         agenceId: 'agence-1',
         montantInitial: 5000,
         modePaiement: 'TRANSFER' as const,
         compteSourceId: 'source-1'
       };

       const mockSourceAccount = {
         id: 'source-1',
         soldeCourant: '100000',
         statut: 'ACTIVE',
         numeroCompte: 'CE-12345678-0001'
       };

       // Mock finding source account via TX
       mockTx.select.mockImplementation(() => createMockBuilder([mockSourceAccount]));

       // Execute
       await comptesService.createCompteWithInitialDeposit(payload, 'user-1');

       // Assert
       // 1. Check account creation Status = ACTIVE
       const insertCalls = vi.mocked(mockValuesSpy).mock.calls;
       // We expect multiple inserts? (Compte + Transaction?)
       // Actually `executeWithLedger` is called for transfer.
       // The account creation is likely the first insert.

       const accountInsert = insertCalls.find((call: unknown[]) => (call[0] as Record<string, unknown>).clientId === 'client-1');
       expect(accountInsert).toBeDefined();
       expect((accountInsert as unknown[])[0]).toHaveProperty('statut', 'ACTIVE');

       // 2. Check Debit/Credit Transactions Logic (Mocked Ledger)
       // Since we verified status is ACTIVE and it didn't throw, and we mock ledger,
       // we assume flow passed.
    });

    it('should throw error if source account has insufficient funds for transfer', async () => {
        // Setup
        const payload = {
          clientId: 'client-1',
          typeCompte: 'SAVINGS' as const,
          agenceId: 'agence-1',
          montantInitial: 50000, // High amount
          modePaiement: 'TRANSFER' as const,
          compteSourceId: 'source-mini'
        };

        const mockSourceAccount = {
          id: 'source-mini',
          soldeCourant: '1000', // Low balance
          statut: 'ACTIVE',
          numeroCompte: 'CE-87654321-0001'
        };

        // Mock finding source account via TX
        mockTx.select.mockImplementation(() => createMockBuilder([mockSourceAccount]));

        // Execute & Assert
        await expect(comptesService.createCompteWithInitialDeposit(payload, 'user-1'))
          .rejects.toThrow(/Solde insuffisant/);
    });
  });

  describe('payerDepotInitialCompte', () => {
      it('should activate account and create transaction', async () => {
          // Setup
          const compteId = 'pending-1';
          const mockPendingAccount = {
              id: compteId,
              statut: 'PENDING_ACTIVATION',
              clientId: 'client-1',
              soldeCourant: '5000',
              numeroCompte: 'CE-12345678-0001',
              typeCompte: 'Épargne'
          };

          // Mock finding the account via TX
          mockTx.select.mockImplementation(() => createMockBuilder([mockPendingAccount]));

          // Mock finding session caisse (if checked) - Mocking simple DB select
          // Assuming service checks session validity?

          // Execute - payerDepotInitialCompte takes (compteId, { montant, sessionCaisseId, userId })
          const result = await comptesService.payerDepotInitialCompte(compteId, {
              montant: 5000,
              sessionCaisseId: 'session-1',
              userId: 'user-admin'
          });

          // Assert
          // 1. Account Update to ACTIVE
          const updateCalls = mockTx.update.mock.calls;
          expect(updateCalls.some((call: unknown[]) => call[0] === comptes)).toBe(true);

          const setCalls = mockSetSpy.mock.calls;
          const statusUpdate = setCalls.find((call: unknown[]) => (call[0] as Record<string, unknown>).statut === 'ACTIVE');
          expect(statusUpdate).toBeDefined();

          // 2. Transaction Creation (via Ledger mock callback)
          const insertCalls = mockTx.insert.mock.calls;
          const txInsert = insertCalls.find((call: unknown[]) => call[0] === transactionsCompte);
          expect(txInsert).toBeDefined();

          // 3. Invoice Creation
          // We mocked createFactureForDepotInitial to return { id: 'fac-1' }
          // The service returns { facture: ... }
          expect(result.facture).toBeDefined();
          expect(result.facture.id).toBe('fac-1');
      });

      it('should throw if account is already active', async () => {
          const mockActiveAccount = {
              id: 'active-1',
              statut: 'ACTIVE',
              soldeCourant: '10000',
              numeroCompte: 'CE-87654321-0001'
          };
          // Mock txn select
          mockTx.select.mockImplementation(() => createMockBuilder([mockActiveAccount]));

          // payerDepotInitialCompte takes (compteId, { montant, sessionCaisseId, userId })
          await expect(comptesService.payerDepotInitialCompte('active-1', {
              montant: 5000,
              sessionCaisseId: 's1',
              userId: 'u1'
          })).rejects.toThrow();
      });
  });

});
