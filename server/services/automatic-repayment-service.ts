import { db } from "../db";
import { comptes, credits, transactionsCompte } from "@shared/schema";
import { eq, and, lte, sql, isNotNull, gt } from "drizzle-orm";
import { executeWithLedger } from "./ledger";
import { updateCompteSolde, updateCreditSolde, generateReference } from "./ledger";

export async function processAutomaticCreditRepayments() {
  const now = new Date();

  // 1. Find credits with automatic repayment enabled and due/overdue payment
  const creditsToRepay = await db.query.credits.findMany({
    where: and(
      eq(credits.remboursementAutomatique, true),
      eq(credits.statut, 'Actif'),
      lte(credits.prochaineEcheance, now),
      isNotNull(credits.montantEcheance),
      gt(credits.soldeRestant, "0") // Ensure we don't try to pay if already fully paid
    ),
    with: {
      client: true
    }
  });

  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    errors: [] as any[]
  };

  for (const credit of creditsToRepay) {
    results.processed++;
    try {
      await executeAutomaticRepayment(credit);
      results.success++;
    } catch (error) {
      console.error(`Error processing auto-repayment for credit ${credit.id}:`, error);
      results.failed++;
      results.errors.push({ creditId: credit.id, error });
    }
  }

  return results;
}

async function executeAutomaticRepayment(credit: any) {
  // Determine source account
  const sourceAccountId = credit.remboursementCompteId; // Should be set if auto-repay is on
  
  if (!sourceAccountId) {
    // If not set, try to find default current account
    const accounts = await db.select().from(comptes).where(and(eq(comptes.clientId, credit.clientId), eq(comptes.typeCompte, 'Courant')));
    if (accounts.length === 0) throw new Error("No source account found for automatic repayment");
    // Use first one found locally (in a real scenario, we might want to be more specific)
    // For now, let's assume we need a specific ID or fail.
    throw new Error("Source account ID not specified for automatic repayment");
  }

  const [compte] = await db.select().from(comptes).where(eq(comptes.id, sourceAccountId));
  if (!compte) throw new Error(`Source account ${sourceAccountId} not found`);

  const soldeRestant = parseFloat(credit.soldeRestant || "0");
  const montantEcheanceStr = credit.montantEcheance; // Assuming it's string from schema, or use generic query type
  const montantEcheance = parseFloat(montantEcheanceStr as string || "0"); // Cast to unknown if needed or just string
  
  const amountToPay = Math.min(soldeRestant, montantEcheance);

  if (amountToPay <= 0) {
      console.log(`[AutoRepay] Credit ${credit.id} has 0 remaining balance. Skipping.`);
      // Optional: Auto-close credit?
      return; // Skip this credit
  }
  const currentBalance = parseFloat(compte.soldeCourant || "0");

  if (currentBalance < amountToPay) {
    // Insufficient funds
    // Log failure or partial payment? For now, fail.
    // TODO: Send notification to user
    throw new Error("Insufficient funds");
  }

  // Execute Transfer: Account -> Credit
  await executeWithLedger(
    "CREDIT",
    {
      montant: amountToPay.toString(),
      sens: "Crédit", // Input to Credit module
      clientId: credit.clientId,
      creditId: credit.id,
      compteId: sourceAccountId, // Determines which account is debited in the event logic?
      
      typePaiement: "Remboursement Automatique",
      methodePaiement: "Virement",
      referenceExterne: `AUTO-${generateReference("CREDIT")}`,
      metadata: {
        description: `Remboursement automatique échéance du ${credit.prochaineEcheance?.toLocaleDateString()}`,
        compteSourceId: sourceAccountId
      }
    },
    async (tx, mouvement) => {
      // 1. Debit Source Account
      const nouveauSoldeCompte = await updateCompteSolde(tx, sourceAccountId, -amountToPay);

      // 2. Credit Loan (Decrease remaining balance)
      const nouveauSoldeCredit = await updateCreditSolde(tx, credit.id, -amountToPay);

      // 3. Create Transaction Record (for account history)
      await tx.insert(transactionsCompte).values({
        compteId: sourceAccountId,
        mouvementId: mouvement.id,
        typePaiement: "Remboursement Crédit",
        montant: amountToPay.toString(),
        soldeApres: nouveauSoldeCompte,
        methodePaiement: "Virement",
        observations: `Remboursement automatique crédit ${credit.numeroCredit}`,
      });

      // 4. Update Next Due Date (Advance by frequency)
      let nextDate = new Date(credit.prochaineEcheance);
      // Fallback if null (shouldn't be based on query)
      
      const freq = credit.echeance || "Mensuel"; // Default
      
      switch(freq) {
        case "Journalier": nextDate.setDate(nextDate.getDate() + 1); break;
        case "Hebdomadaire": nextDate.setDate(nextDate.getDate() + 7); break;
        case "Bi-mensuel": nextDate.setDate(nextDate.getDate() + 14); break; // Or 15 days?
        case "Mensuel": nextDate.setMonth(nextDate.getMonth() + 1); break;
        default: nextDate.setMonth(nextDate.getMonth() + 1); 
      }

      await tx.update(credits).set({
        prochaineEcheance: nextDate,
        lastAutoRepaymentCheck: new Date()
      }).where(eq(credits.id, credit.id));
      
      return {
        result: true,
        additionalEventData: {
          nouveauSoldeCompte,
          nouveauSoldeCredit
        }
      };
    }
  );
}
