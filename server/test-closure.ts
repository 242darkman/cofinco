import { db } from './db';
import { clients, comptes, transactionsCompte, credits, users } from '@shared/schema';
import { cloturerCompte } from './services/comptes';
import { eq } from 'drizzle-orm';
import { CompteError } from './services/comptes';

async function setupTestEnvironment() {
  console.log('🧪 Setting up test environment...');
  
  // 1. Create a dummy client
  const [client] = await db.insert(clients).values({
     nom: 'Test',
     prenom: 'Closure',
     telephone: '+242000099999',
     status: 'Actif'
  }).returning();

  // 2. Get an admin user for closure
  const [admin] = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
  const adminId = admin?.id;

  return { client, adminId };
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    process.stdout.write(`Executing ${name}... `);
    await fn();
    console.log('✅ PASSED');
  } catch (e: any) {
    console.log('❌ FAILED');
    console.error(e.message);
  }
}

async function testClosureScenarios() {
  const { client, adminId } = await setupTestEnvironment();
  
  // Scenario 1: Balance > 0 (Small Amount)
  await runTest('Scenario 1: Balance 0.0001 (Should Fail)', async () => {
     const [acc] = await db.insert(comptes).values({
        clientId: client.id,
        numeroCompte: `NZERO-${Date.now()}`,
        typeCompte: 'Courant',
        statut: 'Actif',
        soldeCourant: '0.0001'
     }).returning();

     try {
       await cloturerCompte(acc.id, adminId);
       throw new Error('Should have failed with BALANCE_NOT_ZERO');
     } catch (e: any) {
       if (e.code !== 'BALANCE_NOT_ZERO') throw e;
     }
  });

  // Scenario 2: Pending Transactions
  await runTest('Scenario 2: Pending Transaction (Should Fail)', async () => {
    // Account with 0 balance but pending tx
    const [acc] = await db.insert(comptes).values({
       clientId: client.id,
       numeroCompte: `PENDING-${Date.now()}`,
       typeCompte: 'Courant',
       statut: 'Actif',
       soldeCourant: '0'
    }).returning();

    await db.insert(transactionsCompte).values({
       compteId: acc.id,
       montant: '1000',
       // type: 'DEPOT', // Removed: not in schema
       // sens: 'CREDIT', // Removed: not in schema
       statut: 'Pending', // Critical for test scenario
       observations: 'Test Pending', // Changed from description to observations
       typePaiement: 'Dépôt Courant', // Valid Enum value
       methodePaiement: 'Espèces' // Valid Enum value
    });

    try {
      await cloturerCompte(acc.id, adminId);
      throw new Error('Should have failed with PENDING_TRANSACTIONS');
    } catch (e: any) {
      if (e.code !== 'PENDING_TRANSACTIONS') throw e;
    }
  });

  // Scenario 3: Active Credit
  await runTest('Scenario 3: Active Credit (Should Fail)', async () => {
     // Account 0 balance
     const [acc] = await db.insert(comptes).values({
        clientId: client.id,
        numeroCompte: `CREDIT-${Date.now()}`,
        typeCompte: 'Courant',
        statut: 'Actif',
        soldeCourant: '0'
     }).returning();

     // Add Active Credit
     await db.insert(credits).values({
        clientId: client.id,
        montant: '100000',
        statut: 'Actif',
        dateDebut: new Date(),
        duree: 12,
        typeCredit: 'Personnel',
        numeroCredit: `CR-${Date.now()}`,
        taux: '10',
        echeance: 'Mensuel',
        objetCredit: 'Test'
     });

     try {
       await cloturerCompte(acc.id, adminId);
       throw new Error('Should have failed with ACTIVE_CREDITS');
     } catch (e: any) {
        if (e.code !== 'ACTIVE_CREDITS') throw e;
     }
     
     // Cleanup credit for next tests on same client?
     // We create new accounts but client active credit blocks ANY account closure for that client
     await db.delete(credits).where(eq(credits.clientId, client.id));
  });

  // Scenario 4: Valid Closure
  await runTest('Scenario 4: Valid Closure (Should Success)', async () => {
    const [acc] = await db.insert(comptes).values({
       clientId: client.id,
       numeroCompte: `VALID-${Date.now()}`,
       typeCompte: 'Courant',
       statut: 'Actif',
       soldeCourant: '0' // Intentionally 0 string
    }).returning();

    const closed = await cloturerCompte(acc.id, adminId);
    
    if (closed.statut !== 'Clôturé') throw new Error('Status not updated');
    if (!closed.closedAt) throw new Error('ClosedAt not set');
    if (!closed.closedBy) throw new Error('ClosedBy not set');
  });

  // Scenario 5: Already Closed
  await runTest('Scenario 5: Already Closed (Should Fail)', async () => {
    // Get the previously closed account or create one
    // We reuse logic
    const [acc] = await db.select().from(comptes).where(eq(comptes.statut, 'Clôturé')).limit(1);
    
    try {
      await cloturerCompte(acc.id, adminId);
      throw new Error('Should have failed with ALREADY_CLOSED');
    } catch (e: any) {
      if (e.code !== 'ALREADY_CLOSED') throw e;
    }
  });

  console.log('\n✨ All tests completed.');
  process.exit(0);
}

testClosureScenarios().catch(console.error);
