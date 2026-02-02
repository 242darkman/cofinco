#!/usr/bin/env tsx
/**
 * Script de diagnostic des écarts de balance coffre/caisse
 */

import { db } from '../server/db.ts';
import { coffresForts, caisses, mouvementsFinanciers, lignesEcritures, planComptable, accountingRules } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';

async function diagnoseBalanceIssues() {
  console.log('=== DIAGNOSTIC DES ÉCARTS DE BALANCE ===\n');

  // 1. Vérifier l'existence des règles comptables
  console.log('1. Vérification des règles comptables pour coffre-caisse...');
  const rules = await db.select()
    .from(accountingRules)
    .where(sql`${accountingRules.eventType} IN ('COFFRE_TO_CAISSE', 'CAISSE_TO_COFFRE')`);

  console.log(`   ✓ ${rules.length} règles trouvées:`);
  rules.forEach(r => {
    console.log(`     - ${r.code}: Débit ${r.debitAccount}, Crédit ${r.creditAccount}`);
  });
  console.log();

  // 2. Vérifier l'existence des comptes 521 et 531
  console.log('2. Vérification des comptes comptables...');
  const accounts = await db.select()
    .from(planComptable)
    .where(sql`${planComptable.numeroCompte} IN ('521', '531')`);

  console.log(`   ✓ ${accounts.length} comptes trouvés:`);
  accounts.forEach(a => {
    console.log(`     - ${a.numeroCompte}: ${a.intitule} (${a.typeCompte})`);
  });
  console.log();

  // 3. Analyser les mouvements récents coffre-caisse
  console.log('3. Analyse des mouvements récents coffre-caisse...');
  const recentMouvements = await db.select({
    id: mouvementsFinanciers.id,
    reference: mouvementsFinanciers.reference,
    montant: mouvementsFinanciers.montant,
    sens: mouvementsFinanciers.sens,
    typePaiement: mouvementsFinanciers.typePaiement,
    glPostingStatus: mouvementsFinanciers.glPostingStatus,
    glPostingError: mouvementsFinanciers.glPostingError,
    dateOperation: mouvementsFinanciers.dateOperation,
  })
  .from(mouvementsFinanciers)
  .where(sql`${mouvementsFinanciers.typePaiement} IN ('COFFRE_TO_CAISSE', 'CAISSE_TO_COFFRE')`)
  .orderBy(sql`${mouvementsFinanciers.dateOperation} DESC`)
  .limit(10);

  console.log(`   ✓ ${recentMouvements.length} mouvements récents:`);
  recentMouvements.forEach(m => {
    console.log(`     - ${m.reference}: ${m.montant} FCFA (${m.typePaiement})`);
    console.log(`       Status GL: ${m.glPostingStatus}${m.glPostingError ? ` - Error: ${m.glPostingError}` : ''}`);
  });
  console.log();

  // 4. Comparer soldes opérationnels vs GL pour les coffres
  console.log('4. Analyse des soldes COFFRES...');
  const coffres = await db.select().from(coffresForts);

  // Calculer le total des soldes opérationnels de tous les coffres
  let totalSoldeOpCoffres = 0;
  console.log('   Détail par coffre:');
  for (const coffre of coffres) {
    const soldeOp = Number(coffre.solde || 0);
    totalSoldeOpCoffres += soldeOp;
    console.log(`     - ${coffre.nom} (${coffre.code}): ${soldeOp.toLocaleString()} FCFA`);
  }

  // Solde GL global pour le compte 531 (tous coffres confondus)
  const [glBalance] = await db.select({
    balance: sql<number>`COALESCE(SUM(
      CAST(${lignesEcritures.debit} AS DECIMAL) - CAST(${lignesEcritures.credit} AS DECIMAL)
    ), 0)`
  })
  .from(lignesEcritures)
  .innerJoin(planComptable, eq(lignesEcritures.compteId, planComptable.id))
  .where(eq(planComptable.numeroCompte, '531'));

  const soldeGL = Number(glBalance?.balance || 0);
  const ecart = totalSoldeOpCoffres - soldeGL;

  console.log(`\n   TOTAL COFFRES:`);
  console.log(`     Solde opérationnel total: ${totalSoldeOpCoffres.toLocaleString()} FCFA`);
  console.log(`     Solde GL (531):           ${soldeGL.toLocaleString()} FCFA`);
  console.log(`     Écart:                    ${ecart.toLocaleString()} FCFA ${ecart !== 0 ? '⚠️' : '✓'}`);
  console.log();

  // 5. Comparer soldes opérationnels vs GL pour les caisses
  console.log('5. Analyse des soldes CAISSES...');
  const allCaisses = await db.select().from(caisses);

  // Calculer le total des soldes opérationnels de toutes les caisses
  let totalSoldeOpCaisses = 0;
  console.log('   Détail par caisse:');
  for (const caisse of allCaisses) {
    const soldeOp = Number(caisse.solde || 0);
    totalSoldeOpCaisses += soldeOp;
    console.log(`     - ${caisse.nom}: ${soldeOp.toLocaleString()} FCFA`);
  }

  // Solde GL global pour le compte 521 (toutes caisses confondues)
  const [glBalanceCaisses] = await db.select({
    balance: sql<number>`COALESCE(SUM(
      CAST(${lignesEcritures.debit} AS DECIMAL) - CAST(${lignesEcritures.credit} AS DECIMAL)
    ), 0)`
  })
  .from(lignesEcritures)
  .innerJoin(planComptable, eq(lignesEcritures.compteId, planComptable.id))
  .where(eq(planComptable.numeroCompte, '521'));

  const soldeGLCaisses = Number(glBalanceCaisses?.balance || 0);
  const ecartCaisses = totalSoldeOpCaisses - soldeGLCaisses;

  console.log(`\n   TOTAL CAISSES:`);
  console.log(`     Solde opérationnel total: ${totalSoldeOpCaisses.toLocaleString()} FCFA`);
  console.log(`     Solde GL (521):           ${soldeGLCaisses.toLocaleString()} FCFA`);
  console.log(`     Écart:                    ${ecartCaisses.toLocaleString()} FCFA ${ecartCaisses !== 0 ? '⚠️' : '✓'}`);
  console.log();

  // 6. Analyser TOUS les mouvements coffre-caisse par type
  console.log('6. Analyse de TOUS les mouvements coffre-caisse...');
  const allMouvements = await db.select({
    typePaiement: mouvementsFinanciers.typePaiement,
    glPostingStatus: mouvementsFinanciers.glPostingStatus,
    count: sql<number>`COUNT(*)`,
    totalMontant: sql<number>`SUM(CAST(${mouvementsFinanciers.montant} AS DECIMAL))`,
  })
  .from(mouvementsFinanciers)
  .where(sql`${mouvementsFinanciers.typePaiement} IN ('COFFRE_TO_CAISSE', 'CAISSE_TO_COFFRE')`)
  .groupBy(mouvementsFinanciers.typePaiement, mouvementsFinanciers.glPostingStatus);

  console.log('   Résumé par type et statut GL:');
  for (const m of allMouvements) {
    console.log(`     ${m.typePaiement} [${m.glPostingStatus}]: ${Number(m.count)} mouvements, Total: ${Number(m.totalMontant).toLocaleString()} FCFA`);
  }
  console.log();

  // 7. Vérifier les mouvements sans écriture GL
  console.log('7. Recherche de mouvements sans écriture comptable...');
  const mouvementsSansGL = await db.select({
    id: mouvementsFinanciers.id,
    reference: mouvementsFinanciers.reference,
    montant: mouvementsFinanciers.montant,
    typePaiement: mouvementsFinanciers.typePaiement,
    glPostingStatus: mouvementsFinanciers.glPostingStatus,
  })
  .from(mouvementsFinanciers)
  .where(and(
    sql`${mouvementsFinanciers.typePaiement} IN ('COFFRE_TO_CAISSE', 'CAISSE_TO_COFFRE')`,
    sql`${mouvementsFinanciers.glPostingStatus} IN ('PENDING', 'FAILED')`
  ));

  if (mouvementsSansGL.length > 0) {
    console.log(`   ⚠️ ${mouvementsSansGL.length} mouvements sans écriture GL:`);
    mouvementsSansGL.forEach(m => {
      console.log(`     - ${m.reference}: ${m.montant} FCFA (Status: ${m.glPostingStatus})`);
    });
  } else {
    console.log('   ✓ Tous les mouvements ont des écritures GL');
  }
  console.log();

  console.log('=== FIN DU DIAGNOSTIC ===');
  process.exit(0);
}

diagnoseBalanceIssues().catch(err => {
  console.error('Erreur:', err);
  process.exit(1);
});
