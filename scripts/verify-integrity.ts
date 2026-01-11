
import { db } from "../server/db";
import { sessionsCaisse, mouvementsFinanciers, comptes, credits, tontines } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

async function verifyIntegrity() {
  console.log("🔍 Starting Global Integrity Verification...");

  // 1. Verify Sessions Caisse
  console.log("\n📦 Verifying Cash Sessions...");
  const sessions = await db.select().from(sessionsCaisse);
  let sessionErrors = 0;

  for (const session of sessions) {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(SUM(CASE WHEN sens = 'Crédit' THEN CAST(montant AS DECIMAL) ELSE -CAST(montant AS DECIMAL) END), 0) as ledger_balance
      FROM ${mouvementsFinanciers}
      WHERE session_caisse_id = ${session.id}
    `);
    
    // Ledger balance is the movement flow. Session Solde includes Initial Balance.
    const ledgerFlow = parseFloat(result.rows[0].ledger_balance as string);
    const expectedSolde = parseFloat(session.soldeInitial || '0') + ledgerFlow;
    const actualSolde = parseFloat(session.soldeTheorique || '0');

    if (Math.abs(expectedSolde - actualSolde) > 1) { // Tolerance 1 FCFA
       console.error(`❌ Session ${session.id} MISMATCH! Expected: ${expectedSolde}, Actual: ${actualSolde}, Diff: ${expectedSolde - actualSolde}`);
       sessionErrors++;
    }
  }
  if (sessionErrors === 0) console.log("✅ All Cash Sessions match Ledger.");


  // 2. Verify Accounts (Comptes)
  console.log("\n💰 Verifying Client Accounts...");
  const accounts = await db.select().from(comptes);
  let accountErrors = 0;

  for (const acc of accounts) {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(SUM(CASE WHEN sens = 'Crédit' THEN CAST(montant AS DECIMAL) ELSE -CAST(montant AS DECIMAL) END), 0) as ledger_balance
      FROM ${mouvementsFinanciers}
      WHERE compte_id = ${acc.id}
    `);
    
    // Ledger balance IS the account balance (assuming 0 start or initial deposit included in movements)
    // NB: Our `createCompte` logic CREATES an initial movement, so ledger sum should equal current balance.
    const expectedSolde = parseFloat(result.rows[0].ledger_balance as string);
    const actualSolde = parseFloat(acc.soldeCourant || '0');

    if (Math.abs(expectedSolde - actualSolde) > 1) {
       console.error(`❌ Account ${acc.numeroCompte} MISMATCH! Expected: ${expectedSolde}, Actual: ${actualSolde}, Diff: ${expectedSolde - actualSolde}`);
       accountErrors++;
    }
  }
  if (accountErrors === 0) console.log("✅ All Client Accounts match Ledger.");

  console.log("\n🏁 Verification Complete.");
  process.exit(sessionErrors + accountErrors > 0 ? 1 : 0);
}

verifyIntegrity().catch(console.error);
