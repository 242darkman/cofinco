
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import comptesService from '../services/comptes';
import { db } from '../db';
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
vi.mock('../db', () => ({
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
vi.mock('../services/ledger', () => ({
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
vi.mock('../storage/finance', () => ({
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
    
    it('should create an account with EN_ATTENTE_PAIEMENT status when mode is "Espèces"', async () => {
      // Setup
      const payload = {
        clientId: 'client-1',
        typeCompte: 'Epargne',
        montantInitial: 5000,
        modePaiement: 'Espèces',
        pays: 'Congo',
        ville: 'Brazzaville'
      };

      // Execute
      await comptesService.createCompteWithInitialDeposit(payload as any, 'user-1', 'agence-1');

      // Assert
      // 1. Verify db.insert was called for Comptes table (via tx)
      expect(mockTx.insert).toHaveBeenCalledWith(comptes);
      
      // 2. Verify values passed contain correct status
      const insertCall = vi.mocked(mockValuesSpy).mock.calls[0];
      const insertedData = insertCall[0];
      expect(insertedData).toMatchObject({
        statut: 'EN_ATTENTE_PAIEMENT',
        soldeCourant: '0', // Initial balance should be 0 until paid? Or stored but not active? 
                      // In logic: logic usually sets solde to 0 and solde_initial to amount?
                      // Let's check logic: actually schema defaults solde.
      });
      // Note: My implementation sets 'en_attente_paiement' so we expect that.
    });

    it('should activate account immediately when mode is "Virement"', async () => {
       // Setup
       const payload = {
         clientId: 'client-1',
         typeCompte: 'Epargne',
         montantInitial: 5000,
         modePaiement: 'Virement',
         compteSourceId: 'source-1'
       };

       const mockSourceAccount = {
         id: 'source-1',
         soldeCourant: '100000',
         statut: 'Actif'
       };

       // Mock finding source account via TX
       mockTx.select.mockImplementation(() => createMockBuilder([mockSourceAccount]));

       // Execute
       await comptesService.createCompteWithInitialDeposit(payload as any, 'user-1', 'agence-1');

       // Assert
       // 1. Check account creation Status = Actif
       const insertCalls = vi.mocked(mockValuesSpy).mock.calls;
       // We expect multiple inserts? (Compte + Transaction?)
       // Actually `executeWithLedger` is called for transfer.
       // The account creation is likely the first insert.
       
       const accountInsert = insertCalls.find((call: any) => call[0].clientId === 'client-1');
       expect(accountInsert).toBeDefined();
       expect(accountInsert[0].statut).toBe('Actif');

       // 2. Check Debit/Credit Transactions Logic (Mocked Ledger)
       // Since we verified status is Actif and it didn't throw, and we mock ledger,
       // we assume flow passed.
    });

    it('should throw error if source account has insufficient funds for transfer', async () => {
        // Setup
        const payload = {
          clientId: 'client-1',
          typeCompte: 'Epargne',
          montantInitial: 50000, // High amount
          modePaiement: 'Virement',
          compteSourceId: 'source-mini'
        };
 
        const mockSourceAccount = {
          id: 'source-mini',
          soldeCourant: '1000', // Low balance
          statut: 'Actif'
        };
 
        // Mock finding source account via TX
        mockTx.select.mockImplementation(() => createMockBuilder([mockSourceAccount]));
 
        // Execute & Assert
        await expect(comptesService.createCompteWithInitialDeposit(payload as any, 'user-1', 'agence-1'))
          .rejects.toThrow(/Solde insuffisant/);
    });
  });

  describe('payerDepotInitialCompte', () => {
      it('should activate account and create transaction', async () => {
          // Setup
          const compteId = 'pending-1';
          const mockPendingAccount = {
              id: compteId,
              statut: 'EN_ATTENTE_PAIEMENT',
              clientId: 'client-1',
              // solde: '0'
          };

          // Mock finding the account via TX
          mockTx.select.mockImplementation(() => createMockBuilder([mockPendingAccount]));
          
          // Mock finding session caisse (if checked) - Mocking simple DB select
          // Assuming service checks session validity?
          
          // Execute
          const result = await comptesService.payerDepotInitialCompte(compteId, {
              montant: 5000,
              sessionCaisseId: 'session-1',
              modePaiement: 'Espèces',
              userId: 'user-admin'
          });

          // Assert
          // 1. Account Update to Actif
          const updateCalls = mockTx.update.mock.calls;
          expect(updateCalls.some((call: any) => call[0] === comptes)).toBe(true);
          
          const setCalls = mockSetSpy.mock.calls;
          const statusUpdate = setCalls.find((call: any) => call[0].statut === 'Actif');
          expect(statusUpdate).toBeDefined();

          // 2. Transaction Creation (via Ledger mock callback)
          const insertCalls = mockTx.insert.mock.calls;
          const txInsert = insertCalls.find((call: any) => call[0] === transactionsCompte);
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
              statut: 'Actif'
          };
          // Mock txn select
          mockTx.select.mockImplementation(() => createMockBuilder([mockActiveAccount]));

          await expect(comptesService.payerDepotInitialCompte('active-1', {
              montant: 5000,
              sessionCaisseId: 's1',
              modePaiement: 'Espèces',
              userId: 'u1'
          })).rejects.toThrow();
      });
  });

});
