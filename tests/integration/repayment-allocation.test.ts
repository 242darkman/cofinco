/**
 * Tests d'intégration pour l'allocation FIFO des remboursements
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../apps/api/db';
import {
  credits,
  echeancesCredits,
  remboursements,
  clients,
  agences,
  users,
  caisses,
  sessionsCaisse,
  factures,
  lignesFactures,
  mouvementsFinanciers,
  type InsertCredit,
  type InsertEcheanceCredit,
  type InsertClient,
  type InsertUser
} from '@shared/schema';
import { remboursementEcheances, clientCreditBalances, remboursementAllocationAudit } from '@shared/schema/remboursement-allocations';
import { glPostingLinks, ecritures, glPeriods } from '@shared/schema/accounting';
import { 
  allocateRepaymentToSchedule,
  reverseRepaymentAllocations,
  markLateInstallments,
  calculateInstallmentStatus
} from '../../apps/api/services/repayment-allocation-service';
import { createRemboursementWithAllocation, reverseRemboursement } from '../../apps/api/storage/finance-enhanced';
import { eq, and, isNull } from 'drizzle-orm';
import { StatutEcheanceCredit, StatutCredit } from '@shared/enum/status-constants';

// Mock WebSocket
vi.mock('../../apps/api/ws-server', () => ({
  getWsInstance: () => ({
    broadcast: vi.fn(),
    broadcastToAgency: vi.fn(),
    broadcastToAggregate: vi.fn()
  })
}));

describe('Repayment FIFO Allocation', () => {
  let testUserId: string;
  let testUsername: string;
  let testClientId: string;
  let testAgenceId: string;
  let testCreditId: string;
  let testSessionId: string;
  let testCaisseId: string;
  let testEcheanceIds: string[] = [];

  beforeEach(async () => {
    // Créer les données de test
    const setupResult = await setupTestData();
    testUserId = setupResult.userId;
    testUsername = setupResult.username;
    testClientId = setupResult.clientId;
    testAgenceId = setupResult.agenceId;
    testCreditId = setupResult.creditId;
    testSessionId = setupResult.sessionId;
    testCaisseId = setupResult.caisseId;
    testEcheanceIds = setupResult.echeanceIds;
  });

  afterEach(async () => {
    await cleanupTestData({
      userId: testUserId,
      clientId: testClientId,
      creditId: testCreditId,
      sessionId: testSessionId,
      caisseId: testCaisseId,
    });
  });

  describe('Allocation FIFO basique', () => {
    it('devrait allouer un paiement exact à une seule échéance', async () => {
      const result = await db.transaction(async (tx) => {
        // Créer un remboursement de 1000 (montant exact de la première échéance)
        const [remboursement] = await tx.insert(remboursements).values({
          creditId: testCreditId,
          montant: '1000',
          dateRemboursement: new Date(),
          methodePaiement: 'CASH'
        }).returning();

        // Allouer
        return await allocateRepaymentToSchedule(
          tx,
          remboursement.id,
          testCreditId,
          1000,
          testUserId
        );
      });

      expect(result.totalAllocated).toBe(1000);
      expect(result.overpaymentAmount).toBe(0);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].isPaid).toBe(true);
      expect(result.allocations[0].echeanceStatus).toBe(StatutEcheanceCredit.PAID);
    });

    it('devrait gérer un paiement partiel', async () => {
      const result = await db.transaction(async (tx) => {
        const [remboursement] = await tx.insert(remboursements).values({
          creditId: testCreditId,
          montant: '500',
          dateRemboursement: new Date(),
          methodePaiement: 'CASH'
        }).returning();

        return await allocateRepaymentToSchedule(
          tx,
          remboursement.id,
          testCreditId,
          500,
          testUserId
        );
      });

      expect(result.totalAllocated).toBe(500);
      expect(result.overpaymentAmount).toBe(0);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].allocatedAmount).toBe(500);
      expect(result.allocations[0].isPaid).toBe(false);
      expect(result.allocations[0].echeanceStatus).toBe(StatutEcheanceCredit.PARTIALLY_PAID);
    });

    it('devrait allouer sur plusieurs échéances', async () => {
      const result = await db.transaction(async (tx) => {
        const [remboursement] = await tx.insert(remboursements).values({
          creditId: testCreditId,
          montant: '2500', // Plus que la première échéance (1000)
          dateRemboursement: new Date(),
          methodePaiement: 'CASH'
        }).returning();

        return await allocateRepaymentToSchedule(
          tx,
          remboursement.id,
          testCreditId,
          2500,
          testUserId
        );
      });

      expect(result.totalAllocated).toBe(2500);
      expect(result.allocations.length).toBeGreaterThanOrEqual(2);
      expect(result.allocations[0].allocatedAmount).toBe(1000); // Première échéance complète
      expect(result.allocations[0].isPaid).toBe(true);
      expect(result.allocations[1].allocatedAmount).toBe(1000); // Deuxième échéance complète
      expect(result.allocations[1].isPaid).toBe(true);
    });

    it('devrait créer un trop-perçu si le paiement dépasse toutes les échéances', async () => {
      const result = await db.transaction(async (tx) => {
        const [remboursement] = await tx.insert(remboursements).values({
          creditId: testCreditId,
          montant: '6000', // Plus que le total des 3 échéances (3000)
          dateRemboursement: new Date(),
          methodePaiement: 'CASH'
        }).returning();

        return await allocateRepaymentToSchedule(
          tx,
          remboursement.id,
          testCreditId,
          6000,
          testUserId,
          { createCreditBalance: true }
        );
      });

      expect(result.totalAllocated).toBe(3000);
      expect(result.overpaymentAmount).toBe(3000);
      expect(result.allocations).toHaveLength(3);
      expect(result.allocations.every(a => a.isPaid)).toBe(true);
      expect(result.creditBalance).toBe(3000);

      // Vérifier le solde créditeur
      const [creditBalance] = await db.select()
        .from(clientCreditBalances)
        .where(eq(clientCreditBalances.clientId, testClientId));
      
      expect(creditBalance).toBeDefined();
      expect(Number(creditBalance.balance)).toBe(3000);
    });
  });

  describe('Idempotence', () => {
    it('devrait retourner les mêmes allocations si appelé deux fois', async () => {
      const remboursementId = await db.transaction(async (tx) => {
        const [remboursement] = await tx.insert(remboursements).values({
          creditId: testCreditId,
          montant: '1000',
          dateRemboursement: new Date(),
          methodePaiement: 'CASH',
          idempotencyKey: `test-idempotent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        }).returning();
        return remboursement.id;
      });

      // Premier appel
      const result1 = await db.transaction(async (tx) => {
        return await allocateRepaymentToSchedule(tx, remboursementId, testCreditId, 1000, testUserId);
      });

      // Deuxième appel (devrait retourner les allocations existantes)
      const result2 = await db.transaction(async (tx) => {
        return await allocateRepaymentToSchedule(tx, remboursementId, testCreditId, 1000, testUserId);
      });

      expect(result1.totalAllocated).toBe(result2.totalAllocated);
      expect(result1.allocations.length).toBe(result2.allocations.length);

      // Vérifier qu'il n'y a qu'un seul jeu d'allocations en DB
      const allocations = await db.select()
        .from(remboursementEcheances)
        .where(eq(remboursementEcheances.remboursementId, remboursementId));
      
      expect(allocations.length).toBe(1);
    });
  });

  describe('Extourne de remboursement', () => {
    it('devrait reverser correctement les allocations', async () => {
      // D'abord créer un remboursement avec allocations
      const { remboursementId, initialEcheances } = await db.transaction(async (tx) => {
        const [remboursement] = await tx.insert(remboursements).values({
          creditId: testCreditId,
          montant: '2000',
          dateRemboursement: new Date(),
          methodePaiement: 'CASH'
        }).returning();

        await allocateRepaymentToSchedule(tx, remboursement.id, testCreditId, 2000, testUserId);

        const echeances = await tx.select()
          .from(echeancesCredits)
          .where(eq(echeancesCredits.creditId, testCreditId))
          .orderBy(echeancesCredits.numeroEcheance);

        return {
          remboursementId: remboursement.id,
          initialEcheances: echeances
        };
      });

      // Vérifier que les échéances sont payées
      expect(Number(initialEcheances[0].montantPaye)).toBe(1000);
      expect(Number(initialEcheances[1].montantPaye)).toBe(1000);

      // Reverser le remboursement
      const reverseResult = await db.transaction(async (tx) => {
        return await reverseRepaymentAllocations(tx, remboursementId, 'Test reversal', testUserId);
      });

      expect(reverseResult.success).toBe(true);
      expect(reverseResult.reversedAllocations).toBe(2);

      // Vérifier que les échéances sont revenues à 0
      const echeancesAfterReverse = await db.select()
        .from(echeancesCredits)
        .where(eq(echeancesCredits.creditId, testCreditId))
        .orderBy(echeancesCredits.numeroEcheance);

      expect(Number(echeancesAfterReverse[0].montantPaye)).toBe(0);
      expect(Number(echeancesAfterReverse[1].montantPaye)).toBe(0);
      expect(echeancesAfterReverse[0].statut).toBe(StatutEcheanceCredit.UPCOMING);

      // Vérifier que les allocations sont marquées comme extournées
      const allocations = await db.select()
        .from(remboursementEcheances)
        .where(eq(remboursementEcheances.remboursementId, remboursementId));

      expect(allocations.every(a => a.reversedAt !== null)).toBe(true);
    });
  });

  describe('Marquage des échéances en retard', () => {
    it('devrait marquer les échéances non payées dont la date est passée', async () => {
      // Modifier la date de la première échéance pour qu'elle soit dans le passé
      await db.update(echeancesCredits)
        .set({
          dateEcheance: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 jours dans le passé
          statut: StatutEcheanceCredit.UPCOMING as any
        })
        .where(eq(echeancesCredits.id, testEcheanceIds[0]));

      // Exécuter le job de marquage
      const result = await markLateInstallments();

      expect(result.markedCount).toBe(1);
      expect(result.creditIds).toContain(testCreditId);

      // Vérifier que l'échéance est marquée LATE
      const [echeance] = await db.select()
        .from(echeancesCredits)
        .where(eq(echeancesCredits.id, testEcheanceIds[0]));

      expect(echeance.statut).toBe(StatutEcheanceCredit.LATE);
      expect(echeance.lateMarkedAt).toBeDefined();
    });

    it('ne devrait pas marquer les échéances payées', async () => {
      // Payer la première échéance
      await db.update(echeancesCredits)
        .set({
          montantPaye: '1000',
          statut: StatutEcheanceCredit.PAID as any,
          dateEcheance: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // Dans le passé
        })
        .where(eq(echeancesCredits.id, testEcheanceIds[0]));

      // Exécuter le job
      const result = await markLateInstallments();

      // L'échéance payée ne devrait pas être marquée LATE
      const [echeance] = await db.select()
        .from(echeancesCredits)
        .where(eq(echeancesCredits.id, testEcheanceIds[0]));

      expect(echeance.statut).toBe(StatutEcheanceCredit.PAID);
      expect(result.markedCount).toBe(0);
    });
  });

  describe('Calcul de statut', () => {
    it('devrait calculer le bon statut selon les montants et dates', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 jours
      const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // -10 jours
      const dueDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // +5 jours

      // Échéance payée
      expect(calculateInstallmentStatus({
        dateEcheance: futureDate,
        montantTotal: '1000',
        montantPaye: '1000'
      })).toBe(StatutEcheanceCredit.PAID);

      // Échéance partiellement payée
      expect(calculateInstallmentStatus({
        dateEcheance: futureDate,
        montantTotal: '1000',
        montantPaye: '500'
      })).toBe(StatutEcheanceCredit.PARTIALLY_PAID);

      // Échéance en retard
      expect(calculateInstallmentStatus({
        dateEcheance: pastDate,
        montantTotal: '1000',
        montantPaye: '0'
      })).toBe(StatutEcheanceCredit.LATE);

      // Échéance due (proche)
      expect(calculateInstallmentStatus({
        dateEcheance: dueDate,
        montantTotal: '1000',
        montantPaye: '0'
      })).toBe(StatutEcheanceCredit.DUE);

      // Échéance à venir
      expect(calculateInstallmentStatus({
        dateEcheance: futureDate,
        montantTotal: '1000',
        montantPaye: '0'
      })).toBe(StatutEcheanceCredit.UPCOMING);
    });
  });

  describe('Intégration complète avec createRemboursementWithAllocation', () => {
    it('devrait créer un remboursement avec allocations automatiques', async () => {
      const result = await createRemboursementWithAllocation(
        {
          creditId: testCreditId,
          montant: '1500',
          methodePaiement: 'CASH',
          sessionCaisseId: testSessionId,
          observations: 'Test payment',
          idempotencyKey: `test-complete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        },
        testUserId
      );

      expect(result.remboursement).toBeDefined();
      expect(result.allocationResult.totalAllocated).toBe(1500);
      expect(result.allocationResult.allocations).toHaveLength(2);
      
      // Vérifier la première allocation (complète)
      expect(result.allocationResult.allocations[0].allocatedAmount).toBe(1000);
      expect(result.allocationResult.allocations[0].isPaid).toBe(true);
      
      // Vérifier la deuxième allocation (partielle)
      expect(result.allocationResult.allocations[1].allocatedAmount).toBe(500);
      expect(result.allocationResult.allocations[1].isPaid).toBe(false);

      // Vérifier les échéances en DB
      const echeances = await db.select()
        .from(echeancesCredits)
        .where(eq(echeancesCredits.creditId, testCreditId))
        .orderBy(echeancesCredits.numeroEcheance);

      expect(Number(echeances[0].montantPaye)).toBe(1000);
      expect(echeances[0].statut).toBe(StatutEcheanceCredit.PAID);
      expect(Number(echeances[1].montantPaye)).toBe(500);
      expect(echeances[1].statut).toBe(StatutEcheanceCredit.PARTIALLY_PAID);
    });
  });
});

// Fonctions helper pour les tests
async function setupTestData() {
  // Créer une agence
  // Use existing seeded agence (avoids complex FK cascade on cleanup)
  const [agence] = await db.select({ id: agences.id }).from(agences).limit(1);

  // Créer un utilisateur
  const testUsername = `testuser_repay_${Date.now()}`;
  const [user] = await db.insert(users).values({
    username: testUsername,
    password: 'hashed',
    nom: 'Test',
    prenom: 'User',
    email: `${testUsername}@example.com`,
  } as any).returning();

  // Créer un client
  const [client] = await db.insert(clients).values({
    userId: user.id,
    agenceId: agence.id,
  } as any).returning();

  // Créer un crédit
  const [credit] = await db.insert(credits).values({
    clientId: client.id,
    numeroCredit: `CRED-${Date.now()}`,
    montant: '3000',
    taux: '10',
    duree: 3,
    typeCredit: 'PERSONAL',
    soldeRestant: '3000',
    dateDebut: new Date(),
    statut: StatutCredit.ACTIVE as any,
    agenceId: agence.id
  }).returning();

  // Créer une caisse + session pour paiements en espèces
  const [caisse] = await db.insert(caisses).values({
    nom: 'Caisse Test',
    agenceId: agence.id
  }).returning();

  const [session] = await db.insert(sessionsCaisse).values({
    caissierId: user.id,
    caisseId: caisse.id,
    agenceId: agence.id,
    statut: 'OPEN' as any
  }).returning();

  // Créer 3 échéances de 1000 chacune
  const echeanceIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const dateEcheance = new Date();
    dateEcheance.setMonth(dateEcheance.getMonth() + i);

    const [echeance] = await db.insert(echeancesCredits).values({
      creditId: credit.id,
      numeroEcheance: i,
      sequence: i,
      dateEcheance,
      montantCapital: '900',
      montantInteret: '100',
      montantTotal: '1000',
      montantPaye: '0',
      statut: StatutEcheanceCredit.UPCOMING as any
    }).returning();

    echeanceIds.push(echeance.id);
  }

  return {
    agenceId: agence.id,
    userId: user.id,
    username: testUsername,
    clientId: client.id,
    creditId: credit.id,
    sessionId: session.id,
    caisseId: caisse.id,
    echeanceIds
  };
}

async function cleanupTestData(ids: {
  userId?: string; clientId?: string; creditId?: string;
  sessionId?: string; caisseId?: string;
}) {
  if (!ids.userId) return; // Nothing to clean up
  const { userId, clientId, creditId, sessionId, caisseId } = ids;

  // Nettoyer dans l'ordre inverse des dépendances
  if (clientId) {
    if (creditId) {
      const rembRows = await db.select({ id: remboursements.id }).from(remboursements).where(eq(remboursements.creditId, creditId));
      for (const r of rembRows) {
        await db.delete(remboursementAllocationAudit).where(eq(remboursementAllocationAudit.remboursementId, r.id));
        await db.delete(remboursementEcheances).where(eq(remboursementEcheances.remboursementId, r.id));
      }
      await db.delete(remboursements).where(eq(remboursements.creditId, creditId));
      await db.delete(echeancesCredits).where(eq(echeancesCredits.creditId, creditId));
    }
    await db.delete(clientCreditBalances).where(eq(clientCreditBalances.clientId, clientId));
    await db.delete(credits).where(eq(credits.clientId, clientId));

    // Delete lignes_factures -> factures -> GL -> mouvements
    const factureRows = await db.select({ id: factures.id }).from(factures).where(eq(factures.clientId, clientId));
    for (const f of factureRows) {
      await db.delete(lignesFactures).where(eq(lignesFactures.factureId, f.id));
    }
    await db.delete(factures).where(eq(factures.clientId, clientId));

    const mouvRows = await db.select({ id: mouvementsFinanciers.id }).from(mouvementsFinanciers).where(eq(mouvementsFinanciers.clientId, clientId));
    for (const m of mouvRows) {
      await db.delete(ecritures).where(eq(ecritures.mouvementId, m.id));
      await db.delete(glPostingLinks).where(eq(glPostingLinks.mouvementId, m.id));
    }
    await db.delete(mouvementsFinanciers).where(eq(mouvementsFinanciers.clientId, clientId));
    await db.delete(clients).where(eq(clients.id, clientId));
  }

  // Delete session -> caisse (before user, since session references user via caissierId)
  if (sessionId) {
    await db.delete(sessionsCaisse).where(eq(sessionsCaisse.id, sessionId));
  }
  if (caisseId) {
    await db.delete(caisses).where(eq(caisses.id, caisseId));
  }

  // Delete user (no agence deletion — we use seeded agence)
  await db.delete(users).where(eq(users.id, userId));
}