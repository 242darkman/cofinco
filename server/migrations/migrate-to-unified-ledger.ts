/**
 * Migration Script: Link Existing Transactions to mouvementsFinanciers
 * 
 * This script creates mouvementsFinanciers entries for existing:
 * - remboursements (credit repayments)
 * - transactionsEpargne (savings deposits/withdrawals)
 * - operationsCaisse (cash register operations)
 * - contributionsTontine (tontine contributions)
 * - paiementsTerrain (field payments)
 * 
 * Run with: npx tsx server/migrations/migrate-to-unified-ledger.ts
 */

import { db } from "../db";
import { 
  mouvementsFinanciers,
  remboursements,
  transactionsCompte,
  operationsCaisse,
  contributionsTontine,
  paiementsTerrain,
  credits,
  comptes,
  sessionsCaisse,
} from "@shared/schema";
import { eq, isNull, sql } from "drizzle-orm";

// Helper to generate unique reference
function generateReference(sourceModule: string, index: number): string {
  const timestamp = Date.now().toString(36);
  return `MIG-${sourceModule.substring(0, 3).toUpperCase()}-${timestamp}-${index}`;
}

async function migrateRemboursements() {
  console.log("[Migration] Starting remboursements migration...");
  
  // Get remboursements without mouvement_id
  const rembs = await db.select()
    .from(remboursements)
    .where(isNull(remboursements.mouvementId));
  
  console.log(`[Migration] Found ${rembs.length} remboursements to migrate`);
  
  let migrated = 0;
  for (const remb of rembs) {
    try {
      // Get credit for client info
      const [credit] = await db.select().from(credits).where(eq(credits.id, remb.creditId));
      
      // Create mouvement
      const [mouvement] = await db.insert(mouvementsFinanciers).values({
        reference: generateReference("CREDIT", migrated),
        sourceModule: "CREDIT",
        sens: "Crédit",
        montant: remb.montant,
        dateOperation: remb.dateRemboursement || remb.createdAt,
        clientId: credit?.clientId,
        creditId: remb.creditId,
        methodePaiement: remb.methodePaiement || "Espèces",
        typePaiement: "Remboursement Crédit",
      }).returning();
      
      // Update remboursement with mouvement_id
      await db.update(remboursements)
        .set({ mouvementId: mouvement.id })
        .where(eq(remboursements.id, remb.id));
      
      migrated++;
    } catch (error) {
      console.error(`[Migration] Error migrating remboursement ${remb.id}:`, error);
    }
  }
  
  console.log(`[Migration] Migrated ${migrated}/${rembs.length} remboursements`);
  return migrated;
}

async function migrateTransactionsCompte() {
  console.log("[Migration] Starting transactionsCompte migration...");
  
  // Get transactions without mouvement_id
  const trans = await db.select()
    .from(transactionsCompte)
    .where(isNull(transactionsCompte.mouvementId));
  
  console.log(`[Migration] Found ${trans.length} transactions to migrate`);
  
  let migrated = 0;
  for (const t of trans) {
    try {
      // Get compte for client info
      const [compte] = await db.select().from(comptes).where(eq(comptes.id, t.compteId));
      
      // Determine sens based on transaction type
      const isDebit = t.typePaiement.startsWith("Retrait");
      const sens = isDebit ? "Débit" : "Crédit";
      
      // Create mouvement
      const [mouvement] = await db.insert(mouvementsFinanciers).values({
        reference: generateReference("EPARGNE", migrated),
        sourceModule: "EPARGNE",
        sens: sens as any,
        montant: t.montant,
        dateOperation: t.createdAt,
        clientId: compte?.clientId,
        compteId: t.compteId,
        methodePaiement: t.methodePaiement || "Espèces",
        typePaiement: t.typePaiement,
      }).returning();
      
      // Update transaction with mouvement_id
      await db.update(transactionsCompte)
        .set({ mouvementId: mouvement.id })
        .where(eq(transactionsCompte.id, t.id));
      
      migrated++;
    } catch (error) {
      console.error(`[Migration] Error migrating transaction ${t.id}:`, error);
    }
  }
  
  console.log(`[Migration] Migrated ${migrated}/${trans.length} transactions`);
  return migrated;
}

async function migrateOperationsCaisse() {
  console.log("[Migration] Starting operationsCaisse migration...");
  
  // Get operations without mouvement_id
  const ops = await db.select()
    .from(operationsCaisse)
    .where(isNull(operationsCaisse.mouvementId));
  
  console.log(`[Migration] Found ${ops.length} operations to migrate`);
  
  let migrated = 0;
  for (const op of ops) {
    try {
      // Get session for agence info
      const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, op.sessionId));
      
      // Determine sens based on operation type
      const isDebit = ["Retrait épargne", "Décaissement crédit"].includes(op.typeOperation);
      const sens = isDebit ? "Débit" : "Crédit";
      
      // Create mouvement
      const [mouvement] = await db.insert(mouvementsFinanciers).values({
        reference: generateReference("CAISSE", migrated),
        sourceModule: "CAISSE",
        sens: sens as any,
        montant: op.montant,
        dateOperation: op.createdAt,
        clientId: op.clientId || undefined,
        sessionCaisseId: op.sessionId,
        agenceId: session?.agenceId || undefined,
        methodePaiement: op.methodePaiement || "Espèces",
      }).returning();
      
      // Update operation with mouvement_id
      await db.update(operationsCaisse)
        .set({ mouvementId: mouvement.id })
        .where(eq(operationsCaisse.id, op.id));
      
      migrated++;
    } catch (error) {
      console.error(`[Migration] Error migrating operation ${op.id}:`, error);
    }
  }
  
  console.log(`[Migration] Migrated ${migrated}/${ops.length} operations`);
  return migrated;
}

async function migrateContributionsTontine() {
  console.log("[Migration] Starting contributionsTontine migration...");
  
  // Get contributions without mouvement_id
  const contribs = await db.select()
    .from(contributionsTontine)
    .where(isNull(contributionsTontine.mouvementId));
  
  console.log(`[Migration] Found ${contribs.length} contributions to migrate`);
  
  let migrated = 0;
  for (const contrib of contribs) {
    try {
      // Create mouvement
      const [mouvement] = await db.insert(mouvementsFinanciers).values({
        reference: generateReference("TONTINE", migrated),
        sourceModule: "TONTINE",
        sens: "Crédit",
        montant: contrib.montant,
        dateOperation: contrib.createdAt,
        tontineId: contrib.tontineId,
        typePaiement: "Cotisation Tontine" as any,
        methodePaiement: "Espèces",
      }).returning();
      
      // Update contribution with mouvement_id
      await db.update(contributionsTontine)
        .set({ mouvementId: mouvement.id })
        .where(eq(contributionsTontine.id, contrib.id));
      
      migrated++;
    } catch (error) {
      console.error(`[Migration] Error migrating contribution ${contrib.id}:`, error);
    }
  }
  
  console.log(`[Migration] Migrated ${migrated}/${contribs.length} contributions`);
  return migrated;
}

async function migratePaiementsTerrain() {
  console.log("[Migration] Starting paiementsTerrain migration...");
  
  // Get paiements without mouvement_id
  const paiements = await db.select()
    .from(paiementsTerrain)
    .where(isNull(paiementsTerrain.mouvementId));
  
  console.log(`[Migration] Found ${paiements.length} paiements to migrate`);
  
  let migrated = 0;
  for (const p of paiements) {
    try {
      // Create mouvement
      const [mouvement] = await db.insert(mouvementsFinanciers).values({
        reference: generateReference("TERRAIN", migrated),
        sourceModule: "TERRAIN",
        sens: "Crédit",
        montant: p.montant,
        dateOperation: p.createdAt,
        clientId: p.clientId,

        agentId: p.agentId,
        typePaiement: p.typePaiement as any,
        methodePaiement: "Espèces",
      }).returning();
      
      // Update paiement with mouvement_id
      await db.update(paiementsTerrain)
        .set({ mouvementId: mouvement.id })
        .where(eq(paiementsTerrain.id, p.id));
      
      migrated++;
    } catch (error) {
      console.error(`[Migration] Error migrating paiement ${p.id}:`, error);
    }
  }
  
  console.log(`[Migration] Migrated ${migrated}/${paiements.length} paiements`);
  return migrated;
}

async function runMigration() {
  console.log("=".repeat(60));
  console.log("Starting Unified Ledger Migration");
  console.log("=".repeat(60));
  
  const results = {
    remboursements: 0,
    transactionsCompte: 0,
    operationsCaisse: 0,
    contributionsTontine: 0,
    paiementsTerrain: 0,
  };
  
  try {
    results.remboursements = await migrateRemboursements();
    results.transactionsCompte = await migrateTransactionsCompte();
    results.operationsCaisse = await migrateOperationsCaisse();
    results.contributionsTontine = await migrateContributionsTontine();
    results.paiementsTerrain = await migratePaiementsTerrain();
  } catch (error) {
    console.error("[Migration] Fatal error:", error);
  }
  
  console.log("=".repeat(60));
  console.log("Migration Summary:");
  console.log(`  Remboursements:        ${results.remboursements}`);
  console.log(`  Transactions Compte:   ${results.transactionsCompte}`);
  console.log(`  Opérations Caisse:     ${results.operationsCaisse}`);
  console.log(`  Contributions Tontine: ${results.contributionsTontine}`);
  console.log(`  Paiements Terrain:     ${results.paiementsTerrain}`);
  console.log("=".repeat(60));
  
  const total = Object.values(results).reduce((a, b) => a + b, 0);
  console.log(`Total records migrated: ${total}`);
  
  process.exit(0);
}

// Run if called directly
runMigration();
