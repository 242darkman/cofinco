import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processAutomaticTontineContributions } from '../../apps/api/services/automatic-tontine-service';
import { executeAutomaticTransfer } from '../../apps/api/services/automatic-transfers-service';
import { processAutomaticCreditRepayments } from '../../apps/api/services/automatic-repayment-service';
import { createFactureForDepot } from '../../apps/api/storage/finance';
import { db } from '../../apps/api/db';
import { transactionsCompte, modelesFactures, tontines, versementsAutomatiques } from '@shared/schema';

// --- Mocks Setup ---

const mockTx = {
  update: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  delete: vi.fn(),
};

// We will capture the 'values' calls here to verify what data was inserted
let mockValuesSpy: any;
let mockSetSpy: any;

const createMockBuilder = (result: any = []) => {
  const resolved = Array.isArray(result) ? result : [result];
  const builder: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    get set() { return mockSetSpy; },
    get values() { return mockValuesSpy; },
    returning: vi.fn().mockResolvedValue(resolved),
    then: (resolve: any) => resolve(resolved),
  };
  return builder;
};

vi.mock('../../apps/api/db', () => ({
  db: {
    query: {
      tontines: { findMany: vi.fn() },
      membresTontine: { findMany: vi.fn() },
      contributionsTontine: { findFirst: vi.fn() },
      comptes: { findMany: vi.fn() },
      credits: { findMany: vi.fn() }, 
      versementsAutomatiques: { findMany: vi.fn() },
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

vi.mock('../../apps/api/services/ledger', () => ({
  executeWithLedger: vi.fn(async (module, data, callback) => {
    // Setup generic mock returns for the transaction context
    mockTx.update.mockReturnValue(createMockBuilder([{}]));
    mockTx.insert.mockReturnValue(createMockBuilder([{}]));
    return callback(mockTx, { id: 'mvt-123', reference: 'REF-MVT' });
  }),
  updateCompteSolde: vi.fn().mockResolvedValue('90000'),
  updateTontineSolde: vi.fn().mockResolvedValue('50000'),
  updateCreditSolde: vi.fn().mockResolvedValue('0'),
  generateReference: vi.fn().mockReturnValue('REF-TEST'),
}));

vi.mock('../../apps/api/storage/tontines', () => ({
    createContributionTontineWithLedger: vi.fn(),
}));

vi.mock('../../apps/api/services/tontine-logic', () => ({
    isTourFullyPaid: vi.fn().mockResolvedValue({ isPaid: false, montantRestant: 1000 }),
}));

vi.mock('../../apps/api/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()
  })
}));

vi.mock('../../apps/api/services/accounting-posting-service', () => ({
  postGlForMouvement: vi.fn().mockResolvedValue(null),
  AccountingRuleNotFoundError: class extends Error {},
}));

describe('Production Readiness - Staged Features Robustness', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Initialize Spies that return builders or results
    mockValuesSpy = vi.fn().mockImplementation(() => ({
       returning: vi.fn().mockResolvedValue([{ id: 'mock-id' }]),
       then: (r: any) => r([{ id: 'mock-id' }])
    }));
    
    mockSetSpy = vi.fn().mockImplementation(() => ({
       where: vi.fn().mockReturnThis(),
       returning: vi.fn().mockResolvedValue([{ id: 'mock-id' }]),
       then: (r: any) => r([{ id: 'mock-id' }])
    }));

    // Reset TX mocks to use the new spies
    mockTx.insert.mockImplementation(() => createMockBuilder([{ id: 'mock-id' }]));
    mockTx.update.mockImplementation(() => createMockBuilder([{ id: 'mock-id' }]));
    vi.mocked(db.insert).mockImplementation(() => createMockBuilder([{ id: 'mock-id' }]));
    vi.mocked(db.update).mockImplementation(() => createMockBuilder([{ id: 'mock-id' }]));
    
    // Default fallback for select (can be overridden with once)
    vi.mocked(db.select).mockImplementation(() => createMockBuilder([{}]));
  });

  describe('Automatic Tontine Contributions', () => {
    it('should create a transaction history record when processing a tontine contribution', async () => {
      // 1. Setup Data
      const mockTontine = {
        id: 'tontine-1',
        nom: 'Tontine A',
        montantCotisation: '1000',
        frequence: 'WEEKLY',
        dateDebut: new Date(),
        statut: 'ACTIVE'
      };
      
      const mockMembre = {
        id: 'membre-1',
        tontineId: 'tontine-1',
        clientId: 'client-1',
        cotisationCompteId: 'compte-1',
        statut: 'ACTIVE',
        cotisationAutomatique: true,
        dateInscription: new Date()
      };
      
      const mockCompte = {
        id: 'compte-1',
        soldeCourant: '50000',
        clientId: 'client-1',
        numeroCompte: 'CPT-001'
      };

      // 2. Mock DB Responses
      const selectMock = vi.mocked(db.select);
      selectMock
          .mockImplementationOnce(() => createMockBuilder([mockTontine])) // activeTontines
          .mockImplementationOnce(() => createMockBuilder([mockMembre]))  // eligibleMembers
          .mockImplementationOnce(() => createMockBuilder([mockCompte])); // account lookup

      vi.mocked(db.query.contributionsTontine.findFirst).mockResolvedValue(undefined);

      // 3. Execute
      await processAutomaticTontineContributions();

      // 4. Assert
      // Verify transactionsCompte insert
      const insertCalls = mockTx.insert.mock.calls;
      const isTransactionTable = (call: any) => call[0] === transactionsCompte;
      expect(insertCalls.some(isTransactionTable)).toBe(true);

      // Verify Value
      const valuesCalls = mockValuesSpy.mock.calls;
      const hasExpectedData = valuesCalls.some((call: any) => {
          const data = call[0];
          return data.compteId === 'compte-1' && 
                 data.typePaiement === "TONTINE_CONTRIBUTION";
      });
      expect(hasExpectedData).toBe(true);
    });
  });

  describe('Automatic Transfers', () => {
      it('should create separate transaction records for Source and Destination accounts', async () => {
          // Setup
          const mockSource = {
              id: 'compte-src',
              numeroCompte: 'SRC-001',
              soldeCourant: '50000',
              statut: 'ACTIVE',
              clientId: 'client-1'
          };
          const mockDest = {
              id: 'compte-dest',
              numeroCompte: 'DST-001',
              soldeCourant: '1000',
              statut: 'ACTIVE',
              versementAutoActif: true,
              compteSourceId: 'compte-src',
              versementAutoMontant: '1000',
              versementAutoFrequence: 'WEEKLY',
              prochainVersementAuto: new Date(),
              clientId: 'client-1'
          };

          // Mock DB responses for executeAutomaticTransfer internal queries
          // 1. Get Dest Account
          // 2. Get Source Account
          const selectMock = vi.mocked(db.select);
          selectMock
             .mockImplementationOnce(() => createMockBuilder([mockDest]))   // 1. Dest
             .mockImplementationOnce(() => createMockBuilder([mockSource])); // 2. Source

          // Execute
          // executeAutomaticTransfer(compteId, userId)
          await executeAutomaticTransfer('compte-dest', 'user-1');
          
          // Assert
          const insertCalls = mockTx.insert.mock.calls;
          const transactionInsertCalls = insertCalls.filter((call: any) => call[0] === transactionsCompte);
          
          // Should be 2 transaction records
          expect(transactionInsertCalls.length).toBeGreaterThanOrEqual(2);
          
          const valuesCalls = mockValuesSpy.mock.calls;
          
          // Check Source Debit Record
          const hasSourceRecord = valuesCalls.some((call: any) => {
              const data = call[0];
              return data.compteId === 'compte-src' && 
                     data.typePaiement === 'TRANSFER_OUT' &&
                     data.montant === '1000';
          });
          expect(hasSourceRecord).toBe(true);
          
          // Check Dest Credit Record
          const hasDestRecord = valuesCalls.some((call: any) => {
              const data = call[0];
              return data.compteId === 'compte-dest' && 
                     data.typePaiement === 'TRANSFER_IN' &&
                     data.montant === '1000';
          });
          expect(hasDestRecord).toBe(true);
      });
  });

  describe('Automatic Repayments', () => {
      it('should create a transaction history record when repaying a credit', async () => {
          // Setup
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
             soldeCourant: '500000',
             clientId: 'client-1'
          };

          vi.mocked(db.query.credits.findMany).mockResolvedValue([mockCredit] as any);
          vi.mocked(db.select).mockImplementation(() => createMockBuilder([mockAccount]));

          // Execute
          await processAutomaticCreditRepayments();

          // Assert
          const insertCalls = mockTx.insert.mock.calls;
          const transactionInsertCalls = insertCalls.filter((call: any) => call[0] === transactionsCompte);
          
          expect(transactionInsertCalls.length).toBeGreaterThanOrEqual(1);
          
          const valuesCalls = mockValuesSpy.mock.calls;
          const hasRecord = valuesCalls.some((call: any) => {
              const data = call[0];
              return data.compteId === 'compte-1' && 
                     data.typePaiement === 'CREDIT_REPAYMENT';
          });
          expect(hasRecord).toBe(true);
      });
  });

  describe('Facture Creation - Depot', () => {
    it('should link invoice to transaction when transactionId is provided', async () => {
        // Setup
        const data = {
            compteId: 'compte-1',
            numeroCompte: 'CPT-001',
            clientId: 'client-1',
            montant: '1000',
            typeCompte: 'Epargne',
            transactionId: 'trans-123'
        };

        vi.mocked(db.query.modelesFactures.findFirst).mockResolvedValue({ id: 'mod-1', prefixeNumero: 'DEP' } as any);

        // Execute
        await createFactureForDepot(data);

        // Assert
        const updateCalls = vi.mocked(db.update).mock.calls;
        const isTransactionTable = (call: any) => call[0] === transactionsCompte;
        expect(updateCalls.some(isTransactionTable)).toBe(true);
        
        const setCalls = mockSetSpy.mock.calls;
        const hasFactureId = setCalls.some((call: any) => {
             return call[0].factureId !== undefined;
        });
        expect(hasFactureId).toBe(true);
    });
  });
});
