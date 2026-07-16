/**
 * Tests de sécurité — isolation de périmètre des cartes de pointage.
 *
 * Vérifie que le service refuse tout accès inter-agences (une carte d'une
 * autre agence est invisible, pas seulement interdite) et que le mapping
 * CASL du module est correctement câblé (permissions → actions/sujets).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetCarte, mockGetByRef, mockGetTransactions, mockGetClient } = vi.hoisted(() => ({
  mockGetCarte: vi.fn(),
  mockGetByRef: vi.fn(),
  mockGetTransactions: vi.fn(async () => []),
  mockGetClient: vi.fn(),
}));

vi.mock('../../apps/api/storage/cartes-pointage', () => ({
  getCartePointage: mockGetCarte,
  getCartePointageByReference: mockGetByRef,
  getTransactionsPointageByCard: mockGetTransactions,
  getAllCartesPointage: vi.fn(async () => []),
  createCartePointage: vi.fn(),
  createVersementCartePointage: vi.fn(),
  createRetraitCartePointage: vi.fn(),
}));

vi.mock('../../apps/api/storage', () => ({
  storage: {
    getClient: mockGetClient,
    getActiveSessionForUser: vi.fn(async () => undefined),
  },
}));

vi.mock('../../apps/api/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  getCarteDetail,
  getCarteParReference,
  ouvrirCarte,
  effectuerVersement,
  CartePointageError,
} from '../../apps/api/services/cartes-pointage/carte-pointage-service';
import { PERMISSION_MAPPINGS } from '@shared/ability/mappings';
import { Actions, Subjects, MODULE_ENTITY_MAP } from '@shared/ability';
import { isAgencyScopedSubject } from '@shared/ability/factory';

const carteAgenceA = {
  id: 'carte-1',
  reference: 'CDP-2026-000001',
  clientId: 'client-1',
  agenceId: 'agence-A',
  status: 'ACTIVE',
  completedSlots: 3,
  unitAmount: '1500.00',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Isolation agence', () => {
  it('une carte d\'une autre agence est invisible (détail)', async () => {
    mockGetCarte.mockResolvedValue(carteAgenceA);
    expect(await getCarteDetail('carte-1', 'agence-B')).toBeUndefined();
    // Aucun historique n'est chargé pour une carte hors périmètre.
    expect(mockGetTransactions).not.toHaveBeenCalled();
  });

  it('une carte de la même agence est accessible', async () => {
    mockGetCarte.mockResolvedValue(carteAgenceA);
    const detail = await getCarteDetail('carte-1', 'agence-A');
    expect(detail?.carte.id).toBe('carte-1');
  });

  it('le scan QR ne révèle pas une carte hors périmètre', async () => {
    mockGetByRef.mockResolvedValue(carteAgenceA);
    expect(await getCarteParReference('CDP-2026-000001', 'agence-B')).toBeUndefined();
  });

  it('refuse d\'ouvrir une carte pour un client d\'une autre agence', async () => {
    mockGetClient.mockResolvedValue({ id: 'client-1', agenceId: 'agence-A' });
    await expect(
      ouvrirCarte({ clientId: 'client-1', unitAmount: '1500', agenceId: 'agence-B', userId: 'u1' }),
    ).rejects.toThrow(CartePointageError);
  });
});

describe('Règles d\'accès opérationnelles', () => {
  it('un versement en espèces sans caisse ouverte est refusé (code CAISSE_REQUISE)', async () => {
    await expect(
      effectuerVersement({ cardId: 'carte-1', paymentMethod: 'CASH', idempotencyKey: 'k-1234567', userId: 'u1' }),
    ).rejects.toMatchObject({ code: 'CAISSE_REQUISE' });
  });
});

describe('Câblage CASL du module', () => {
  it('les permissions cartespointage.* sont mappées vers CartePointage', () => {
    expect(PERMISSION_MAPPINGS['cartespointage.view']).toEqual({
      action: Actions.VIEW,
      subject: Subjects.CARTE_POINTAGE,
    });
    expect(PERMISSION_MAPPINGS['cartespointage.deposit']).toEqual({
      action: Actions.DEPOSIT,
      subject: Subjects.CARTE_POINTAGE,
    });
    expect(PERMISSION_MAPPINGS['cartespointage.withdraw']).toEqual({
      action: Actions.WITHDRAW,
      subject: Subjects.CARTE_POINTAGE,
    });
  });

  it('le module expose ses entités et le sujet est scoping agence', () => {
    expect(MODULE_ENTITY_MAP[Subjects.CARTES_POINTAGE]).toContain(Subjects.CARTE_POINTAGE);
    expect(isAgencyScopedSubject(Subjects.CARTE_POINTAGE)).toBe(true);
    expect(isAgencyScopedSubject(Subjects.CARTE_POINTAGE_TRANSACTION)).toBe(true);
  });
});
