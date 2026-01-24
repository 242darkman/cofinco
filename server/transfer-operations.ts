/**
 * Script pour transférer les opérations vers la bonne session
 */

import { config } from "dotenv";
config();

import { db } from "./db";
import { sessionsCaisse, operationsCaisse } from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { StatutSessionCaisse } from "@shared/enum/status-constants";

async function transferOperations() {
  console.log("\n🔄 Transfert des opérations vers la session correcte\n");

  try {
    // 1. Session actuelle
    const currentSession = await db.query.sessionsCaisse.findFirst({
      where: eq(sessionsCaisse.statut, StatutSessionCaisse.OPEN),
      orderBy: desc(sessionsCaisse.openedAt)
    });

    if (!currentSession) {
      console.log("❌ Aucune session ouverte");
      process.exit(1);
    }

    console.log(`📊 Session cible: ${currentSession.id}`);
    console.log(`   Ouverte le: ${currentSession.openedAt?.toLocaleString('fr-FR')}`);
    console.log(`   Solde actuel: ${Number(currentSession.montantFermetureTheorique).toLocaleString('fr-FR')} FCFA`);

    // 2. Trouver les opérations de la session zombie
    const zombieSessionId = "3bec5a84-6c6f-49fc-b196-729d7bd621bb";

    const opsToTransfer = await db.query.operationsCaisse.findMany({
      where: eq(operationsCaisse.sessionId, zombieSessionId)
    });

    console.log(`\n📋 Opérations à transférer: ${opsToTransfer.length}`);

    // Filtrer celles créées APRÈS l'ouverture de la nouvelle session
    const currentSessionOpenedAt = currentSession.openedAt!;
    const eligibleOps = opsToTransfer.filter(op => {
      return op.createdAt && op.createdAt > currentSessionOpenedAt;
    });

    console.log(`   Éligibles (après ${currentSessionOpenedAt.toLocaleString('fr-FR')}): ${eligibleOps.length}`);

    if (eligibleOps.length === 0) {
      console.log("\n⚠️  Aucune opération à transférer");
      console.log("   Les opérations ont été créées AVANT l'ouverture de la session actuelle.");
      console.log("\n   Options:");
      console.log("   1. Ces opérations appartiennent à l'ancienne session (correct)");
      console.log("   2. Forcer le transfert de toutes les opérations récentes\n");

      // Montrer les opérations pour décider
      console.log("Opérations de l'ancienne session:");
      for (const op of opsToTransfer) {
        console.log(`   - ${op.typeOperation}: ${Number(op.montant).toLocaleString('fr-FR')} FCFA`);
        console.log(`     Créée: ${op.createdAt?.toLocaleString('fr-FR')}`);
        console.log(`     Référence: ${op.reference}`);
      }

      // Forcer le transfert de la cotisation tontine qui a été créée aujourd'hui
      const tontineOp = opsToTransfer.find(op =>
        op.typeOperation === 'TONTINE_CONTRIBUTION' &&
        op.createdAt &&
        op.createdAt.toDateString() === new Date().toDateString()
      );

      if (tontineOp) {
        console.log(`\n🔧 Transfert forcé de la cotisation tontine d'aujourd'hui...`);

        await db.update(operationsCaisse)
          .set({ sessionId: currentSession.id })
          .where(eq(operationsCaisse.id, tontineOp.id));

        // Mettre à jour le solde
        const montant = Number(tontineOp.montant);
        await db.update(sessionsCaisse)
          .set({
            montantFermetureTheorique: sql`${sessionsCaisse.montantFermetureTheorique} + ${montant}`,
            updatedAt: new Date()
          })
          .where(eq(sessionsCaisse.id, currentSession.id));

        console.log(`✅ Cotisation tontine transférée (+${montant.toLocaleString('fr-FR')} FCFA)`);
      }

      process.exit(0);
    }

    // 3. Transférer les opérations éligibles
    console.log("\n🔧 Transfert en cours...");

    let totalDelta = 0;
    const typesEntrees = [
      'TONTINE_CONTRIBUTION',
      'DEPOSIT_SAVINGS',
      'DEPOSIT_CURRENT',
      'DEPOSIT_BLOCKED',
      'MISC_COLLECTION',
      'LOAN_REPAYMENT',
      'SAFE_SUPPLY',
      'INITIAL_DEPOSIT'
    ];

    for (const op of eligibleOps) {
      await db.update(operationsCaisse)
        .set({ sessionId: currentSession.id })
        .where(eq(operationsCaisse.id, op.id));

      const montant = Number(op.montant);
      const isEntree = typesEntrees.includes(op.typeOperation);
      const delta = isEntree ? montant : -montant;
      totalDelta += delta;

      console.log(`   ✅ ${op.typeOperation}: ${delta > 0 ? '+' : ''}${delta.toLocaleString('fr-FR')} FCFA`);
    }

    // 4. Mettre à jour le solde
    if (totalDelta !== 0) {
      await db.update(sessionsCaisse)
        .set({
          montantFermetureTheorique: sql`${sessionsCaisse.montantFermetureTheorique} + ${totalDelta}`,
          updatedAt: new Date()
        })
        .where(eq(sessionsCaisse.id, currentSession.id));

      console.log(`\n✅ Solde mis à jour: ${totalDelta > 0 ? '+' : ''}${totalDelta.toLocaleString('fr-FR')} FCFA`);
    }

    // 5. Vérification finale
    const updatedSession = await db.query.sessionsCaisse.findFirst({
      where: eq(sessionsCaisse.id, currentSession.id)
    });

    console.log(`\n📊 Session après correction:`);
    console.log(`   Solde: ${Number(updatedSession?.montantFermetureTheorique).toLocaleString('fr-FR')} FCFA`);

    const finalOps = await db.query.operationsCaisse.findMany({
      where: eq(operationsCaisse.sessionId, currentSession.id)
    });
    console.log(`   Opérations: ${finalOps.length}`);

    console.log("\n✅ Transfert terminé!\n");

  } catch (error: any) {
    console.error("\n❌ Erreur:", error.message);
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
}

transferOperations();
