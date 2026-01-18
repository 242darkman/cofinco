/**
 * Script de test de concurrence pour les transferts inter-coffres
 * 
 * Ce script simule 20 requêtes parallèles pour dispatcher le même transfert
 * afin de valider que le verrouillage pessimiste fonctionne correctement.
 * 
 * Résultat attendu:
 * - 1 requête réussit (la première à acquérir le verrou)
 * - 19 requêtes échouent avec une erreur de conflit (409)
 * - Le coffre source n'est débité qu'une seule fois
 * 
 * Usage: npx tsx scripts/test-concurrency-transfer.ts
 */

import { db } from "../server/db";
import { 
  coffresForts, 
  transfertsInterCoffres,
  mouvementsFinanciers,
  users 
} from "../shared/schema";
import { eq, sql, and } from "drizzle-orm";
import { executeDispatch } from "../server/services/transfert-inter-coffres/transfer-executor";

const CONCURRENCY_LEVEL = 20;
const TEST_MONTANT = 100000; // 100,000 XAF

interface TestResult {
  success: number;
  conflict: number;
  other_errors: number;
  mouvements_created: number;
  solde_debited_once: boolean;
}

async function runConcurrencyTest(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("   TEST DE CONCURRENCE - TRANSFERTS INTER-COFFRES");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Niveau de concurrence: ${CONCURRENCY_LEVEL} requêtes simultanées\n`);

  // 1. SETUP: Créer les données de test
  console.log("[SETUP] Création des données de test...");
  
  // Récupérer un utilisateur admin pour les tests
  const [adminUser] = await db
    .select()
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  if (!adminUser) {
    console.error("❌ Aucun utilisateur admin trouvé. Veuillez en créer un.");
    process.exit(1);
  }

  // Récupérer ou créer des coffres de test
  const [coffreSource] = await db
    .select()
    .from(coffresForts)
    .where(eq(coffresForts.ownerType, "SIEGE"))
    .limit(1);

  const [coffreDest] = await db
    .select()
    .from(coffresForts)
    .where(and(
      eq(coffresForts.ownerType, "AGENCE"),
      sql`${coffresForts.id} != ${coffreSource?.id || 'null'}`
    ))
    .limit(1);

  if (!coffreSource || !coffreDest) {
    console.error("❌ Coffres insuffisants pour le test. Besoin d'un coffre SIEGE et un coffre AGENCE.");
    process.exit(1);
  }

  console.log(`  Coffre Source: ${coffreSource.code} (Solde: ${coffreSource.solde})`);
  console.log(`  Coffre Dest:   ${coffreDest.code}`);

  // Sauvegarder le solde initial
  const soldeInitial = parseFloat(coffreSource.solde?.toString() || "0");
  console.log(`  Solde initial: ${soldeInitial.toLocaleString()} XAF\n`);

  // S'assurer que le coffre a assez de fonds
  if (soldeInitial < TEST_MONTANT) {
    console.log("[SETUP] Approvisionnement du coffre source...");
    await db
      .update(coffresForts)
      .set({ solde: (TEST_MONTANT * 2).toString() })
      .where(eq(coffresForts.id, coffreSource.id));
  }

  // Créer un transfert de test en statut "Approuvé N2"
  const testReference = `TEST-CONCURRENCY-${Date.now()}`;
  const [testTransfert] = await db
    .insert(transfertsInterCoffres)
    .values({
      reference: testReference,
      dateTransfert: new Date().toISOString().split("T")[0],
      coffreSourceId: coffreSource.id,
      coffreDestinationId: coffreDest.id,
      montant: TEST_MONTANT.toString(),
      devise: "XAF",
      typeTransfert: "SIEGE_VERS_AGENCE",
      typeConditionnement: "Mallette",
      motif: "Test de concurrence automatique",
      statut: "Approuvé N2", // Prêt pour dispatch
      createdBy: adminUser.id,
      agentsTransport: [
        { nom: "Test Agent 1", contact: "000000001" },
        { nom: "Test Agent 2", contact: "000000002" },
      ],
    })
    .returning();

  console.log(`[SETUP] Transfert de test créé: ${testTransfert.reference}`);
  console.log(`  ID: ${testTransfert.id}`);
  console.log(`  Montant: ${TEST_MONTANT.toLocaleString()} XAF`);
  console.log(`  Statut: ${testTransfert.statut}\n`);

  // Récupérer le solde actuel du coffre source
  const [coffreAvant] = await db
    .select()
    .from(coffresForts)
    .where(eq(coffresForts.id, coffreSource.id));
  const soldeAvantTest = parseFloat(coffreAvant.solde?.toString() || "0");

  // 2. EXECUTION: Lancer N requêtes simultanées
  console.log("[EXEC] Lancement des requêtes concurrentes...\n");

  const startTime = Date.now();
  
  const promises = Array.from({ length: CONCURRENCY_LEVEL }, (_, i) => 
    executeDispatch(
      testTransfert.id,
      adminUser.id,
      adminUser.role || "admin",
      `127.0.0.${i}`,
      `TestAgent/${i}`
    )
  );

  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;

  // 3. ANALYSE: Compter les résultats
  const testResult: TestResult = {
    success: 0,
    conflict: 0,
    other_errors: 0,
    mouvements_created: 0,
    solde_debited_once: false,
  };

  results.forEach((result, i) => {
    if (result.success) {
      testResult.success++;
      console.log(`  [${i + 1}] ✅ Succès - Mouvement: ${result.mouvementSourceId}`);
    } else if (result.errorCode === "TIC_CONFLICT" || result.errorCode === "TIC_024") {
      testResult.conflict++;
      console.log(`  [${i + 1}] ⚠️  Conflit: ${result.error}`);
    } else {
      testResult.other_errors++;
      console.log(`  [${i + 1}] ❌ Erreur: ${result.errorCode} - ${result.error}`);
    }
  });

  // 4. VÉRIFICATION: Compter les mouvements créés
  const mouvements = await db
    .select()
    .from(mouvementsFinanciers)
    .where(
      sql`${mouvementsFinanciers.metadata}->>'transfertInterCoffreId' = ${testTransfert.id}`
    );

  testResult.mouvements_created = mouvements.length;

  // Vérifier le solde du coffre
  const [coffreApres] = await db
    .select()
    .from(coffresForts)
    .where(eq(coffresForts.id, coffreSource.id));
  const soldeApresTest = parseFloat(coffreApres.solde?.toString() || "0");
  const debit = soldeAvantTest - soldeApresTest;

  testResult.solde_debited_once = Math.abs(debit - TEST_MONTANT) < 0.01;

  // 5. RAPPORT FINAL
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("                      RÉSULTATS DU TEST");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Durée totale: ${duration}ms`);
  console.log(`Requêtes réussies: ${testResult.success}`);
  console.log(`Requêtes en conflit: ${testResult.conflict}`);
  console.log(`Autres erreurs: ${testResult.other_errors}`);
  console.log(`Mouvements créés: ${testResult.mouvements_created}`);
  console.log(`Solde avant: ${soldeAvantTest.toLocaleString()} XAF`);
  console.log(`Solde après: ${soldeApresTest.toLocaleString()} XAF`);
  console.log(`Débit réel: ${debit.toLocaleString()} XAF`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Validation finale
  const passed = 
    testResult.success === 1 &&
    testResult.mouvements_created === 1 &&
    testResult.solde_debited_once;

  if (passed) {
    console.log("🎉 TEST RÉUSSI !");
    console.log("   Le verrouillage pessimiste fonctionne correctement.");
    console.log("   Un seul mouvement a été créé malgré les 20 requêtes simultanées.");
  } else {
    console.log("❌ TEST ÉCHOUÉ !");
    if (testResult.success !== 1) {
      console.log(`   Attendu: 1 succès, Obtenu: ${testResult.success} succès`);
    }
    if (testResult.mouvements_created !== 1) {
      console.log(`   Attendu: 1 mouvement, Obtenu: ${testResult.mouvements_created} mouvements`);
    }
    if (!testResult.solde_debited_once) {
      console.log(`   Le coffre n'a pas été débité du montant correct`);
    }
  }

  // 6. CLEANUP: Supprimer les données de test
  console.log("\n[CLEANUP] Nettoyage des données de test...");
  
  // Annuler le transfert au lieu de le supprimer (pour garder la trace)
  await db
    .update(transfertsInterCoffres)
    .set({ 
      statut: "Annulé",
      cancellationReason: "Test de concurrence - Nettoyage automatique",
    })
    .where(eq(transfertsInterCoffres.id, testTransfert.id));

  console.log("[CLEANUP] Terminé.\n");

  process.exit(passed ? 0 : 1);
}

// Exécution
runConcurrencyTest().catch((error) => {
  console.error("Erreur fatale:", error);
  process.exit(1);
});
