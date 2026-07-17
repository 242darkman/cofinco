/**
 * E2E — Parcours complet d'une carte de pointage : ouverture → versements → retrait.
 *
 * Pilote le stack réel (HTTP → routes → services transactionnels → PostgreSQL →
 * comptabilité GL) via une session authentifiée, et vérifie les invariants
 * financiers contractuels :
 *   - un versement coche la case suivante (montant = M) ;
 *   - au retrait, le client reçoit A = M×N − M et la commission vaut M ;
 *   - la carte est clôturée (WITHDRAWN) et son journal contient N dépôts + 1 retrait ;
 *   - un rejeu de la même clé d'idempotence est refusé.
 *
 * Les versements/retraits utilisent Mobile Money pour ne pas dépendre d'une
 * session de caisse ouverte (le CASH l'exige, cf. service). Les règles GL
 * `CARTE_POINTAGE_*` et le compte 4193 doivent être seedés (db:seed / profil test).
 *
 * Exécution : `docker compose --profile test run --rm test-e2e`.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { db } from '../../apps/api/db';
import { cartesPointage, transactionsPointage } from '../../packages/shared/schema/cartes-pointage';
import { eq, asc } from 'drizzle-orm';
import { createTestFixture, type TestFixture } from './test-fixtures';

/** Montant unitaire (M) de la carte de test, en FCFA. */
const UNIT_AMOUNT = '1500';

let fixture: TestFixture;

/** Authentifie le caissier de test ; le cookie de session reste dans `request`. */
async function loginCaissier(request: APIRequestContext): Promise<void> {
  const res = await request.post('/api/auth/login', {
    data: { username: fixture.caissierEmail, password: fixture.password },
  });
  expect(res.ok(), `login caissier (${res.status()})`).toBeTruthy();
}

test.describe('Parcours carte de pointage', () => {
  test.beforeAll(async () => {
    // Le caissier dispose des permissions cartespointage.* (seed RBAC).
    fixture = await createTestFixture('cdp');
  });

  test('ouverture → 2 versements → retrait, avec invariants financiers', async ({ request }) => {
    await loginCaissier(request);

    let cardId = '';
    let reference = '';

    await test.step('Ouverture de la carte (montant fixe par case)', async () => {
      const res = await request.post('/api/cartes-pointage', {
        data: { clientId: fixture.clientId, unitAmount: UNIT_AMOUNT },
      });
      expect(res.status(), await res.text()).toBe(201);
      const carte = await res.json();
      cardId = carte.id;
      reference = carte.reference;
      expect(carte.status).toBe('ACTIVE');
      expect(carte.completedSlots).toBe(0);
      expect(carte.reference).toMatch(/^CDP-\d{4}-/);
    });

    await test.step('Premier versement (case 1)', async () => {
      const res = await request.post(`/api/cartes-pointage/${cardId}/versements`, {
        data: { paymentMethod: 'MOBILE_MONEY', idempotencyKey: `${reference}-dep-1` },
      });
      expect(res.status(), await res.text()).toBe(201);
      const tx = await res.json();
      expect(tx.type).toBe('DEPOSIT');
      expect(tx.slotNumber).toBe(1);
      expect(Number(tx.amount)).toBe(1500);
    });

    await test.step('Rejeu du versement 1 refusé (idempotence)', async () => {
      const res = await request.post(`/api/cartes-pointage/${cardId}/versements`, {
        data: { paymentMethod: 'MOBILE_MONEY', idempotencyKey: `${reference}-dep-1` },
      });
      expect(res.ok()).toBeFalsy();
    });

    await test.step('Deuxième versement (case 2)', async () => {
      const res = await request.post(`/api/cartes-pointage/${cardId}/versements`, {
        data: { paymentMethod: 'MOBILE_MONEY', idempotencyKey: `${reference}-dep-2` },
      });
      expect(res.status(), await res.text()).toBe(201);
      const tx = await res.json();
      expect(tx.slotNumber).toBe(2);
    });

    await test.step('Retrait : client M×N − M, commission M, carte clôturée', async () => {
      const res = await request.post(`/api/cartes-pointage/${cardId}/retrait`, {
        data: { paymentMethod: 'MOBILE_MONEY', idempotencyKey: `${reference}-ret` },
      });
      expect(res.status(), await res.text()).toBe(200);
      const result = await res.json();
      // N = 2, M = 1500 → total 3000, client 1500, commission 1500.
      expect(Number(result.totalCollecte)).toBe(3000);
      expect(Number(result.montantClient)).toBe(1500);
      expect(Number(result.commission)).toBe(1500);
    });

    await test.step('Vérification de l\'état persisté', async () => {
      const [carte] = await db.select().from(cartesPointage).where(eq(cartesPointage.id, cardId));
      expect(carte.status).toBe('WITHDRAWN');
      expect(carte.withdrawnAt).not.toBeNull();
      expect(carte.completedSlots).toBe(2);

      const txs = await db
        .select()
        .from(transactionsPointage)
        .where(eq(transactionsPointage.cardId, cardId))
        .orderBy(asc(transactionsPointage.createdAt));
      expect(txs).toHaveLength(3); // 2 dépôts + 1 retrait
      expect(txs.filter((t) => t.type === 'DEPOSIT')).toHaveLength(2);

      const retrait = txs.find((t) => t.type === 'WITHDRAWAL');
      expect(retrait).toBeDefined();
      expect(Number(retrait!.amount)).toBe(1500);
      expect(Number(retrait!.commissionAmount)).toBe(1500);
      // Chaque transaction est reliée à un mouvement financier (piste d'audit).
      expect(retrait!.mouvementFinancierId).not.toBeNull();
    });

    await test.step('Aucune opération possible après clôture', async () => {
      const res = await request.post(`/api/cartes-pointage/${cardId}/versements`, {
        data: { paymentMethod: 'MOBILE_MONEY', idempotencyKey: `${reference}-dep-after` },
      });
      expect(res.ok()).toBeFalsy();
    });
  });

  test('retrait refusé avec un seul versement (N < 2)', async ({ request }) => {
    await loginCaissier(request);

    const create = await request.post('/api/cartes-pointage', {
      data: { clientId: fixture.clientId, unitAmount: UNIT_AMOUNT },
    });
    expect(create.status(), await create.text()).toBe(201);
    const { id: cardId, reference } = await create.json();

    const dep = await request.post(`/api/cartes-pointage/${cardId}/versements`, {
      data: { paymentMethod: 'MOBILE_MONEY', idempotencyKey: `${reference}-dep-1` },
    });
    expect(dep.status()).toBe(201);

    // Un seul versement : le client toucherait 0 → retrait interdit.
    const ret = await request.post(`/api/cartes-pointage/${cardId}/retrait`, {
      data: { paymentMethod: 'MOBILE_MONEY', idempotencyKey: `${reference}-ret` },
    });
    expect(ret.ok()).toBeFalsy();

    const [carte] = await db.select().from(cartesPointage).where(eq(cartesPointage.id, cardId));
    expect(carte.status).toBe('ACTIVE'); // toujours active, non clôturée
  });
});
