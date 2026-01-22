
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { executeWithLedger, updateCompteSolde } from '../../server/services/ledger';
import { db } from '../../server/db';
import { comptes, mouvementsFinanciers, users, clients } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { faker } from '@faker-js/faker';

describe('Robustesse Transactionnelle', () => {
  // Test data containers
  let testUserId: string;
  let testClientId: string;
  let testCompteId: string;
  let testAgenceId: string | undefined; // Optional, can be null

  // Helper to create required entities
  async function createTestClientAndAccount() {
    // 1. Create User (with ACTIVE status since status is on users table)
    const [user] = await db.insert(users).values({
      nom: `TestUser_${faker.string.alphanumeric(5)}`,
      username: `testuser_${faker.string.alphanumeric(8)}`,
      password: 'hash_placeholder',
      typeCompte: 'client',
      statut: 'ACTIVE'
    }).returning();
    testUserId = user.id;

    // 2. Create Client (linked to user - no status field here, it's on users)
    const [client] = await db.insert(clients).values({
      userId: user.id
    }).returning();
    testClientId = client.id;
    testAgenceId = client.agenceId || undefined;

    // 3. Create Compte (using standardized EN enum values)
    const [compte] = await db.insert(comptes).values({
      clientId: client.id,
      numeroCompte: `CPT-${faker.string.numeric(10)}`,
      typeCompte: 'CURRENT',
      soldeCourant: '100000', // Start with 100k
      statut: 'ACTIVE'
    }).returning();
    testCompteId = compte.id;
  }

  beforeEach(async () => {
    await createTestClientAndAccount();
  });

  afterEach(async () => {
    // Cleanup - Delete in reverse order of dependencies
    if (testCompteId) {
      await db.delete(comptes).where(eq(comptes.id, testCompteId)).catch(() => {});
    }
    // Users deletion will cascade to clients, but we deleted accounts manually to satisfy constraint
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId)).catch(() => {});
    }
  });

  describe('executeWithLedger', () => {
    it('devrait empêcher le double-spending avec la même clé d\'idempotence', async () => {
      const idempotencyKey = `idem-${faker.string.uuid()}`;
      const amount = '5000';

      // First call: Should succeed
      const result1 = await executeWithLedger(
        'EPARGNE',
        {
          montant: amount,
          sens: 'DEBIT',
          clientId: testClientId,
          compteId: testCompteId,
          typePaiement: 'Retrait Courant',
          idempotencyKey
        },
        async (tx: any, mouvement: any) => {
           return { result: 'success' };
        }
      );

      expect(result1.result).toBe('success');
      expect(result1.mouvement.idempotencyKey).toBe(idempotencyKey);

      // Second call: Should fail with duplicate key error
      await expect(executeWithLedger(
        'EPARGNE',
        {
          montant: amount,
          sens: 'DEBIT',
          clientId: testClientId,
          compteId: testCompteId,
          typePaiement: 'Retrait Courant',
          idempotencyKey
        },
        async (tx: any, mouvement: any) => {
           return { result: 'should_not_happen' };
        }
      )).rejects.toThrow(/Duplicate idempotency key/);
    });

    it('devrait rollback toute la transaction en cas d\'erreur métier', async () => {
      const startBalance = 100000;
      
      try {
        await executeWithLedger(
          'EPARGNE',
          {
             montant: '5000',
             sens: 'DEBIT',
             clientId: testClientId,
             compteId: testCompteId,
             typePaiement: 'Retrait Courant'
          },
          async (tx: any, mouvement: any) => {
             // 1. Simulate balance update (this logic is usually inside services like retraitESpeces)
             // We manually touch the DB to verify rollback
             const [compte] = await tx.select().from(comptes).where(eq(comptes.id, testCompteId));
             const newSolde = (parseFloat(compte.soldeCourant) - 5000).toString();
             
             await tx.update(comptes)
               .set({ soldeCourant: newSolde })
               .where(eq(comptes.id, testCompteId));

             // 2. Throw error midway to trigger rollback
             throw new Error('Erreur Métier Simulée');
          }
        );
      } catch (e: any) {
        expect(e.message).toBe('Erreur Métier Simulée');
      }

      // Assertions: Verify balance is unchanged
      const [finalCompte] = await db.select().from(comptes).where(eq(comptes.id, testCompteId));
      expect(parseFloat(finalCompte.soldeCourant)).toBe(startBalance);

      // Verify no movement created (need to search by timestamp or just count for this client)
      // Since we don't have the ID of the rolled back movement, we can check count or ID
      const movements = await db.select().from(mouvementsFinanciers).where(eq(mouvementsFinanciers.compteId, testCompteId));
      // Should be 0 because we just created the account and failed the first transaction
      expect(movements.length).toBe(0); 
    });
  });

  describe('Concurrence & Race Conditions', () => {
    it('devrait gérer correctement de multiples opérations simultanées', async () => {
      const initialBalance = 100000;
      const withdrawalAmount = 100;
      const numberOfOperations = 10;

      // We define an operation that performs a "Retrait"
      // In a real scenario, this involves fetching balance, checking > amount, decrementing, saving.
      // We simulate this logic inside executeWithLedger callback.
      
      const performWithdrawal = async (idx: number) => {
        try {
          return await executeWithLedger(
            'EPARGNE',
            {
              montant: withdrawalAmount.toString(),
              sens: 'DEBIT',
              clientId: testClientId,
              compteId: testCompteId,
              typePaiement: 'Retrait Courant',
              referenceExterne: `conc-test-${faker.string.uuid()}-${idx}`
            },
            async (tx: any, mouvement: any) => {
              // Use the robust atomic update function
              // This should handle concurrency correctly via SQL `solde = solde - amount`
              
              // We need to import updateCompteSolde (it's already imported at top of file?)
              // Wait, I need to check imports. The previous replace might have messed them up or kept them.
              // Assuming it's imported or I need to add it. 
              // Using the imported function:
              
              // Logic: Check balance (optional read), then atomic update.
              // Note: For strict safety, we might want `RETURNING` from update to check if it went negative
              // or use a DB constraint. 
              // Without DB constraint, `solde = solde - amount` can go negative.
              // Use a check?
              // For this test, we just assume positive balance and want to see if the SUM is correct.
              
              const currentSolde = await updateCompteSolde(tx, testCompteId, -withdrawalAmount);
              
              // Note: updateCompteSolde now returns the NEW balance as string.
              if (parseFloat(currentSolde) < 0) {
                 // Creating an artificial error if we went below zero? 
                 // Though the update already happened. 
                 // Real world: `UPDATE ... WHERE solde >= amount`
              }

              return { result: 'ok' };
            }
          );
        } catch (e) {
          return { result: 'failed', error: e };
        }
      };

      const promises = [];
      for (let i = 0; i < numberOfOperations; i++) {
        promises.push(performWithdrawal(i));
      }

      await Promise.all(promises);

      // Verify Final Balance
      const [finalCompte] = await db.select().from(comptes).where(eq(comptes.id, testCompteId));
      const finalBalance = parseFloat(finalCompte.soldeCourant);
      const expectedBalance = initialBalance - (withdrawalAmount * numberOfOperations);

      // If checks fail, it means we have a race condition!
      expect(finalBalance).toBe(expectedBalance);
    });
  });
});
