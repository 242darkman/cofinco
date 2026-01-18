/**
 * AUDIT CRITIQUE - Intégrité des Données Dashboard
 * 
 * Anomalies détectées sur les captures d'écran:
 * 1. Taux de recouvrement: -20% (IMPOSSIBLE - doit être 0-100%)
 * 2. Crédits actifs: "100%" vs "0%" (CONTRADICTION)
 * 3. Top Clients: 400K total mais stats montrent 0%
 */

import { db } from "../server/db";
import { credits, clients, comptes, remboursements } from "../shared/schema";
import { sql, eq, count } from "drizzle-orm";

async function auditDashboardIntegrity() {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║  AUDIT CRITIQUE - INTÉGRITÉ DONNÉES DASHBOARD     ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  // 1. AUDIT TAUX DE RECOUVREMENT (Problème: -20%)
  console.log('🔍 [1/5] Audit Taux de Recouvrement...\n');
  
  const creditStats = await db.select({
    total: count(),
    montantTotal: sql<number>`COALESCE(SUM(${credits.montant}), 0)`,
    montantDecaisse: sql<number>`COALESCE(SUM(CASE WHEN ${credits.statut} IN ('Actif', 'En cours', 'Soldé', 'En retard') THEN ${credits.montant} ELSE 0 END), 0)`,
    soldeRestantTotal: sql<number>`COALESCE(SUM(CASE WHEN ${credits.statut} IN ('Actif', 'En cours', 'En retard') THEN CAST(${credits.soldeRestant} AS NUMERIC) ELSE 0 END), 0)`
  }).from(credits);

  const stats = creditStats[0];
  const montantRecouvreCalcule = Number(stats.montantDecaisse) - Number(stats.soldeRestantTotal);
  const tauxRecouvrement = stats.montantDecaisse > 0 
    ? Math.round((montantRecouvreCalcule / Number(stats.montantDecaisse)) * 100) 
    : 0;

  console.log('   Montant décaissé:', stats.montantDecaisse, 'FCFA');
  console.log('   Solde restant:', stats.soldeRestantTotal, 'FCFA');
  console.log('   Montant recouvré (calculé):', montantRecouvreCalcule, 'FCFA');
  console.log('   Taux de recouvrement:', tauxRecouvrement, '%');
  
  if (tauxRecouvrement < 0 || tauxRecouvrement > 100) {
    console.log('   ❌ ANOMALIE: Taux invalide! Raisons possibles:');
    console.log('      - solde_restant corrompu (négatif ou > montant)');
    console.log('      - Remboursements non synchronisés avec solde_restant');
  } else {
    console.log('   ✅ Taux dans les limites normales');
  }

  // 2. AUDIT STATUTS DES CRÉDITS (Problème: 0% partout)
  console.log('\n🔍 [2/5] Audit Répartition Statuts Crédits...\n');
  
  const statutBreakdown = await db.select({
    statut: credits.statut,
    count: count()
  }).from(credits).groupBy(credits.statut);

  console.log('   Répartition réelle:');
  statutBreakdown.forEach(s => {
    console.log(`      - ${s.statut}: ${s.count} crédits`);
  });

  const totalCredits = statutBreakdown.reduce((sum, s) => sum + s.count, 0);
  if (totalCredits === 0) {
    console.log('   ⚠️  ATTENTION: Aucun crédit en base!');
  }

  // 3. AUDIT COHÉRENCE CRÉDITS ACTIFS
  console.log('\n🔍 [3/5] Audit Cohérence "Crédits Actifs"...\n');
  
  const activeCredits = await db.select({ count: count() })
    .from(credits)
    .where(sql`${credits.statut} IN ('Actif', 'En cours', 'En_cours')`);

  console.log('   Crédits "Actifs/En cours":', activeCredits[0].count);
  console.log('   Dashboard devrait afficher:', activeCredits[0].count);

  // 4. AUDIT TOP CLIENTS vs STATS CRÉDITS
  console.log('\n🔍 [4/5] Audit Top Clients vs Volume Crédits...\n');
  
  const topClients = await db.select({
    clientNom: sql<string>`${clients.nom} || ' ' || ${clients.prenom}`,
    nbCredits: count(credits.id),
    totalMontant: sql<number>`COALESCE(SUM(${credits.montant}), 0)`
  })
  .from(clients)
  .leftJoin(credits, eq(clients.id, credits.clientId))
  .groupBy(clients.id, clients.nom, clients.prenom)
  .having(sql`SUM(${credits.montant}) > 0`)
  .orderBy(sql`SUM(${credits.montant}) DESC`)
  .limit(5);

  console.log('   Top 5 Clients:');
  let totalTopClients = 0;
  topClients.forEach((c, i) => {
    console.log(`      ${i+1}. ${c.clientNom}: ${c.nbCredits} crédit(s), ${Number(c.totalMontant).toLocaleString('fr-FR')} FCFA`);
    totalTopClients += Number(c.totalMontant);
  });
  console.log(`   TOTAL Top Clients: ${totalTopClients.toLocaleString('fr-FR')} FCFA`);

  if (totalTopClients > 0 && Number(stats.montantTotal) === 0) {
    console.log('   ❌ INCOHÉRENCE: Top clients ont des crédits mais stats montrent 0!');
  }

  // 5. AUDIT SOLDES RESTANTS INVALIDES
  console.log('\n🔍 [5/5] Audit Soldes Restants Invalides...\n');
  
  const invalidSoldes = await db.select({
    id: credits.id,
    numeroCredit: credits.numeroCredit,
    montant: credits.montant,
    soldeRestant: credits.soldeRestant,
    statut: credits.statut
  })
  .from(credits)
  .where(sql`
    CAST(${credits.soldeRestant} AS NUMERIC) < 0 
    OR CAST(${credits.soldeRestant} AS NUMERIC) > ${credits.montant}
  `);

  if (invalidSoldes.length > 0) {
    console.log(`   ❌ ${invalidSoldes.length} crédits avec solde_restant INVALIDE:`);
    invalidSoldes.forEach(c => {
      console.log(`      - ${c.numeroCredit}: Montant=${c.montant}, SoldeRestant=${c.soldeRestant} (${c.statut})`);
    });
    console.log('\n   🔧 CORRECTION REQUISE: Recalculer solde_restant à partir des remboursements');
  } else {
    console.log('   ✅ Tous les soldes restants sont cohérents');
  }

  // RÉSUMÉ
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║                   RÉSUMÉ AUDIT                    ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  const issues = [];
  if (tauxRecouvrement < 0 || tauxRecouvrement > 100) issues.push('Taux recouvrement invalide');
  if (totalTopClients > 0 && Number(stats.montantTotal) === 0) issues.push('Incohérence crédits');
  if (invalidSoldes.length > 0) issues.push(`${invalidSoldes.length} soldes corrompus`);

  if (issues.length === 0) {
    console.log('✅ DASHBOARD INTÈGRE - Aucun problème détecté');
  } else {
    console.log('❌ PROBLÈMES DÉTECTÉS:');
    issues.forEach(issue => console.log(`   - ${issue}`));
    console.log('\n💡 RECOMMANDATION: Exécuter script de correction des données');
  }

  return {
    tauxRecouvrement,
    totalCredits,
    activeCredits: activeCredits[0].count,
    invalidSoldes: invalidSoldes.length,
    hasIssues: issues.length > 0
  };
}

// Exécution
auditDashboardIntegrity()
  .then(result => {
    console.log('\n');
    process.exit(result.hasIssues ? 1 : 0);
  })
  .catch(error => {
    console.error('\n❌ Erreur audit:', error);
    process.exit(1);
  });
