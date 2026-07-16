/**
 * Tests d'intégration — flux transactionnels des cartes de pointage.
 *
 * Couche DB mockée (même approche que caisse-reversal.test.ts) : on vérifie
 * la composition des opérations (versement, retrait), les refus métier
 * (session de caisse manquante, carte pleine, N < 2) et la répartition
 * financière au retrait (client M×N − M, commission M, clôture de la carte).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks hoisted ───────────────────────────────────────────────────────────
const {
  mockTx,
  mockExecuteWithLedger,
  mockCreateMouvementFinancier,
  mockCreateMouvementEvents,
  mockUpdateSessionSolde,
  mockPostGl,
  mockValidateRule,
  txInserts,
  txUpdates,
} = vi.hoisted(() => {
  const txInserts: Array<{ table: unknown; values: any }> = [];
  const txUpdates: Array<{ table: unknown; set: any }> = [];
  /** Carte renvoyée par les SELECT (surchargée par test via setCarteRow). */
  const state: { carte: any } = { carte: null };

  const mockTx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          // Chaîne `.for("update")` (verrou pessimiste) OU await direct.
          const rows = Promise.resolve(state.carte ? [state.carte] : []);
          return Object.assign(rows, { for: vi.fn(() => rows) });
        }),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: any) => {
        txInserts.push({ table, values });
        return Object.assign(Promise.resolve(), {
          returning: vi.fn(() => Promise.resolve([{ id: 'tx-1', ...values }])),
        });
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((set: any) => {
        txUpdates.push({ table, set });
        return { where: vi.fn(() => Promise.resolve()) };
      }),
    })),
    __setCarteRow: (carte: any) => { state.carte = carte; },
  };

  return {
    mockTx,
    // Simule executeWithLedger : exécute l'opération avec la tx mockée et un mouvement factice.
    mockExecuteWithLedger: vi.fn(async (_module: string, _data: any, operation: any) => {
      const mouvement = { id: 'mvt-principal', reference: 'EPG-TEST' };
      const { result } = await operation(mockTx, mouvement);
      return { result, mouvement };
    }),
    mockCreateMouvementFinancier: vi.fn(async (_tx: any, data: any) => ({ id: 'mvt-commission', ...data })),
    mockCreateMouvementEvents: vi.fn(async () => undefined),
    mockUpdateSessionSolde: vi.fn(async () => '99999'),
    mockPostGl: vi.fn(async () => ({ numeroPiece: 'GL-1' })),
    mockValidateRule: vi.fn(async () => undefined),
    txInserts,
    txUpdates,
  };
});

vi.mock('../../apps/api/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve((mockTx as any).__carteHors ? [(mockTx as any).__carteHors] : [])),
      })),
    })),
    transaction: vi.fn(async (fn: any) => fn(mockTx)),
  },
}));

vi.mock('../../apps/api/services/ledger', () => ({
  executeWithLedger: mockExecuteWithLedger,
  createMouvementFinancier: mockCreateMouvementFinancier,
  createMouvementEvents: mockCreateMouvementEvents,
  updateSessionSolde: mockUpdateSessionSolde,
  validateUserId: vi.fn(async (_tx: any, userId: string) => userId),
}));

vi.mock('../../apps/api/services/accounting-posting-service', () => ({
  postGlForMouvement: mockPostGl,
}));

vi.mock('../../apps/api/services/accounting-validation', () => ({
  validateAccountingRule: mockValidateRule,
  isGLStrictMode: vi.fn(() => false),
}));

vi.mock('../../apps/api/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  createVersementCartePointage,
  createRetraitCartePointage,
} from '../../apps/api/storage/cartes-pointage';
import { cartesPointage, transactionsPointage } from '@shared/schema';

/** Carte active de référence : M = 1500 FCFA. */
function carteActive(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'carte-1',
    reference: 'CDP-2026-000001',
    clientId: 'client-1',
    agenceId: 'agence-1',
    unitAmount: '1500.00',
    devise: 'XAF',
    completedSlots: 0,
    status: 'ACTIVE',
    deletedAt: null,
    version: 1,
    ...overrides,
  };
}

function setCarte(carte: any) {
  (mockTx as any).__setCarteRow(carte);
  (mockTx as any).__carteHors = carte; // lecture hors transaction (contexte mouvement)
}

beforeEach(() => {
  vi.clearAllMocks();
  txInserts.length = 0;
  txUpdates.length = 0;
});

describe('Versement (pointage d\'une case)', () => {
  it('refuse un versement en espèces sans session de caisse', async () => {
    setCarte(carteActive());
    await expect(
      createVersementCartePointage({
        cardId: 'carte-1',
        paymentMethod: 'CASH',
        idempotencyKey: 'idem-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(/session de caisse/i);
    expect(mockExecuteWithLedger).not.toHaveBeenCalled();
  });

  it('refuse un versement sur une carte pleine (31/31)', async () => {
    setCarte(carteActive({ completedSlots: 31 }));
    await expect(
      createVersementCartePointage({
        cardId: 'carte-1',
        paymentMethod: 'CASH',
        idempotencyKey: 'idem-2',
        sessionCaisseId: 'session-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(/pleine/i);
  });

  it('refuse toute opération sur une carte clôturée', async () => {
    setCarte(carteActive({ status: 'WITHDRAWN' }));
    await expect(
      createVersementCartePointage({
        cardId: 'carte-1',
        paymentMethod: 'CASH',
        idempotencyKey: 'idem-3',
        sessionCaisseId: 'session-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(/clôturée/i);
  });

  it('versement CASH nominal : case suivante, caisse créditée de M, journal lié au mouvement', async () => {
    setCarte(carteActive({ completedSlots: 11 }));
    const transaction = await createVersementCartePointage({
      cardId: 'carte-1',
      paymentMethod: 'CASH',
      idempotencyKey: 'idem-4',
      sessionCaisseId: 'session-1',
      userId: 'user-1',
    });

    // La case 12 est pointée, avec le montant unitaire M.
    expect(transaction.slotNumber).toBe(12);
    expect(transaction.amount).toBe('1500.00');
    expect(transaction.mouvementFinancierId).toBe('mvt-principal');

    // La caisse de l'agent est créditée de M (1500).
    expect(mockUpdateSessionSolde).toHaveBeenCalledWith(mockTx, 'session-1', 1500);

    // La carte progresse à 12 cases.
    const majCarte = txUpdates.find((u) => u.table === cartesPointage);
    expect(majCarte?.set.completedSlots).toBe(12);
  });
});

describe('Retrait (clôture de la carte)', () => {
  it('refuse le retrait avec un seul versement (N=1)', async () => {
    setCarte(carteActive({ completedSlots: 1 }));
    await expect(
      createRetraitCartePointage({
        cardId: 'carte-1',
        paymentMethod: 'CASH',
        idempotencyKey: 'idem-5',
        sessionCaisseId: 'session-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(/au moins 2 versements/i);
  });

  it('retrait nominal N=31 : client 45 000, commission 1 500, carte clôturée', async () => {
    setCarte(carteActive({ completedSlots: 31 }));
    const resultat = await createRetraitCartePointage({
      cardId: 'carte-1',
      paymentMethod: 'CASH',
      idempotencyKey: 'idem-6',
      sessionCaisseId: 'session-1',
      userId: 'user-1',
    });

    // Répartition contractuelle : A = M×N − M.
    expect(resultat.totalCollecte).toBe('46500.00');
    expect(resultat.montantClient).toBe('45000.00');
    expect(resultat.commission).toBe('1500.00');

    // Mouvement de commission créé et posté au GL dans la même transaction.
    expect(mockCreateMouvementFinancier).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        montant: '1500.00',
        typePaiement: 'CARTE_POINTAGE_COMMISSION',
        idempotencyKey: 'idem-6:commission',
      }),
      'user-1',
    );
    expect(mockPostGl).toHaveBeenCalled();

    // Sortie de caisse limitée au montant client (la commission reste en caisse).
    expect(mockUpdateSessionSolde).toHaveBeenCalledWith(mockTx, 'session-1', -45000);

    // La carte est clôturée/archivée.
    const majCarte = txUpdates.find((u) => u.table === cartesPointage && u.set.status === 'WITHDRAWN');
    expect(majCarte).toBeDefined();
    expect(majCarte?.set.withdrawnAt).toBeInstanceOf(Date);

    // Le journal immuable trace montant client ET commission.
    const insertTxPointage = txInserts.find((i) => i.table === transactionsPointage);
    expect(insertTxPointage?.values).toMatchObject({
      type: 'WITHDRAWAL',
      amount: '45000.00',
      commissionAmount: '1500.00',
      idempotencyKey: 'idem-6',
    });
  });

  it('refuse un retrait en espèces sans session de caisse', async () => {
    setCarte(carteActive({ completedSlots: 10 }));
    await expect(
      createRetraitCartePointage({
        cardId: 'carte-1',
        paymentMethod: 'CASH',
        idempotencyKey: 'idem-7',
        userId: 'user-1',
      }),
    ).rejects.toThrow(/session de caisse/i);
  });
});
