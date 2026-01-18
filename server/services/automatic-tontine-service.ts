import { db } from "../db";
import { tontines, membresTontine, contributionsTontine, tontineDistributions, comptes, transactionsCompte } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { createContributionTontineWithLedger } from "../storage/tontines";
import { updateTontineSolde, executeWithLedger, updateCompteSolde, generateReference } from "./ledger";
import { isTourFullyPaid } from "./tontine-logic";

export async function processAutomaticTontineContributions() {
  const now = new Date();

  // 1. Get all active tontines
  const activeTontines = await db.select().from(tontines).where(eq(tontines.statut, 'Actif'));

  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    errors: [] as any[]
  };

  for (const tontine of activeTontines) {
    try {
      // Determine Current Tour
      // Logic: Max distribution tour + 1. 
      // If 0 distributions, tour 1.
      const lastDist = await db.query.tontineDistributions.findFirst({
        where: eq(tontineDistributions.tontineId, tontine.id),
        orderBy: desc(tontineDistributions.tourNumero)
      });
      const currentTour = (lastDist?.tourNumero || 0) + 1;

      // 2. Find members with auto-contribution
      const eligibleMembers = await db.select().from(membresTontine).where(and(
        eq(membresTontine.tontineId, tontine.id),
        eq(membresTontine.cotisationAutomatique, true),
        eq(membresTontine.statut, 'Actif')
      ));

      for (const membre of eligibleMembers) {
        // Vérifier si le tour est déjà payé (complètement ou partiellement via avance)
        const tourStatus = await isTourFullyPaid(membre.clientId, tontine.id, currentTour);

        if (tourStatus.isPaid) {
          // Tour déjà payé via avance - sauter silencieusement
          console.log(`[Auto-Tontine] Tour ${currentTour} déjà payé via avance pour membre ${membre.id} (${membre.clientId})`);
          continue;
        }

        // Calculer le montant restant à prélever (gestion des paiements partiels)
        const montantAPrevelever = tourStatus.montantRestant;

        if (montantAPrevelever <= 0) {
          console.log(`[Auto-Tontine] Rien à prélever pour membre ${membre.id} tour ${currentTour}`);
          continue;
        }

        results.processed++;
        try {
          await executeAutomaticContribution(tontine, membre, currentTour, montantAPrevelever);
          results.success++;
          console.log(`[Auto-Tontine] Prélèvement réussi: ${montantAPrevelever} FCFA pour membre ${membre.id} tour ${currentTour}`);
        } catch (error) {
           console.error(`Error processing auto-contribution for tontine ${tontine.id} member ${membre.id}:`, error);
           results.failed++;
           results.errors.push({ tontineId: tontine.id, membreId: membre.id, error });
        }
      }
    } catch (e) {
      console.error("Error processing tontine:", tontine.id, e);
    }
  }
  
  return results;
}

async function executeAutomaticContribution(tontine: any, membre: any, tourNumero: number, montantAPrevelever?: number) {
  // Determine source account
  const sourceAccountId = membre.cotisationCompteId;
  
  if (!sourceAccountId) {
     // Check for default account logic ?
     // For now require explicit account or find 'Courant'
      const accounts = await db.select().from(comptes).where(and(eq(comptes.clientId, membre.clientId), eq(comptes.typeCompte, 'Courant')));
      if (accounts.length === 0) throw new Error("No source account found for automatic contribution");
     // Use first one
     const account = accounts[0];
     await processPayment(tontine, membre, tourNumero, account, montantAPrevelever);
     return;
  }

  const [compte] = await db.select().from(comptes).where(eq(comptes.id, sourceAccountId));
  if (!compte) throw new Error(`Source account ${sourceAccountId} not found`);

  await processPayment(tontine, membre, tourNumero, compte, montantAPrevelever);
}

async function processPayment(tontine: any, membre: any, tourNumero: number, compte: any, montantAPrevelever?: number) {
    // Utiliser le montant spécifié ou le montant de cotisation complet
    const amount = montantAPrevelever ?? parseFloat(tontine.montantCotisation);
    const balance = parseFloat(compte.soldeCourant || "0");

    if (balance < amount) {
        throw new Error("Insufficient funds");
    }

    // Logic: 
    // We need to Debit Account -> this increases Ledger/Bank/System funds ? 
    // No, Tontine is internal money movement usually, but `createContributionTontineWithLedger` expects money to come IN to Tontine.
    // If it comes from an Account, we must DEBIT the account.
    
    // `createContributionTontineWithLedger` does NOT handle the valid debit of a specific source account automatically unless we hack/extend it.
    // It creates a "Mouvement" with inputs.
    // If we look at `server/storage/tontines.ts`:
    /*
      return await executeWithLedger("TONTINE", { ... }, async (tx, mouvement) => {
         // It updates Tontine Solde (+ amount)
         // It updates Session Solde (if Cash)
      })
    */
    // It does NOT debit a source account. It assumes money appears (Cash) or is just recorded (Check/Transfer check).
    
    // So for Automatic Account Transfer, we need to handle the Debit explicitly.
    // We can do this by wrapping `createContributionTontineWithLedger` OR by custom logic here utilizing `executeWithLedger`.
    
    // Better to use `executeWithLedger` directly here to ensure atomicity of Debit + Credit.
    
    await db.transaction(async (tx) => {
       // 1. Debit Account
       await updateCompteSolde(tx, compte.id, -amount);
       
       // 2. We can call createContributionTontineWithLedger INSIDE this transaction?
       // `createContributionTontineWithLedger` uses `executeWithLedger` which starts a NEW transaction usually (`db.transaction`).
       // Nesting transactions in Drizzle/Postgres is supported (savepoints).
       
       // However, `createContributionTontineWithLedger` is not exported as taking a TX. It takes `userId`. import { db } from "../db".
       
       // I should probably duplicate the logic or refactor `createContributionTontineWithLedger`.
       // Refactoring `server/storage/tontines.ts` to accept an optional TX is best practice but might be invasive.
       
       // Alternative: Do the "Contribution" part manually here.
       // It matches what `createContributionTontineWithLedger` does but adds the Account Debit.
       
       const reference = generateReference("TONTINE");
       
       // Use finance service to Create Mouvement
       // We need `createMouvementFinancier` ... wait `executeWithLedger` handles everything.
       // We can just use `executeWithLedger` but we need to pass Tontine module.
    });

    // Let's rewrite `executeWithLedger` call here specifically for Auto-Contribution
    // It is: Account -> Tontine.
    
    await executeWithLedger(
        "TONTINE",
        {
          montant: amount.toString(),
          sens: "Crédit", // Tontine receives money
          clientId: membre.clientId,
          tontineId: tontine.id,
          compteId: compte.id, // Source Account
          typePaiement: "Versement Tontine",
          methodePaiement: "Virement",
          referenceExterne: `AUTO-TON-${generateReference("TONTINE")}`,
          metadata: {
              description: montantAPrevelever
                ? `Contribution automatique Tour ${tourNumero} (Complément: ${amount} FCFA)`
                : `Contribution automatique Tour ${tourNumero}`,
              tourNumero,
              compteSourceId: compte.id,
              isPartialPayment: !!montantAPrevelever
          }
        },
        async (tx, mouvement) => {
            // 1. Debit Account
            const nouveauSoldeCompte = await updateCompteSolde(tx, compte.id, -amount);
            
            // 2. Credit Tontine
            await updateTontineSolde(tx, tontine.id, amount);
            
            // 3. Create Contribution Record
            await tx.insert(contributionsTontine).values({
                tontineId: tontine.id,
                clientId: membre.clientId,
                typeOperation: "Versement",
                montant: amount.toString(),
                tourNumero,
                methodePaiement: "Virement",
                reference: mouvement.reference,
                statutTransaction: "Posté",
                mouvementId: mouvement.id
            });
            
            // 4. Create Transaction Record (for account history)
            await tx.insert(transactionsCompte).values({
                compteId: compte.id,
                mouvementId: mouvement.id,
                typePaiement: "Versement Tontine",
                montant: amount.toString(),
                soldeApres: nouveauSoldeCompte,
                methodePaiement: "Virement",
                observations: `Contribution automatique Tontine Tour ${tourNumero}`,
            });
            
            // 4. Update Member Stats
            await tx.execute(sql`
                UPDATE membres_tontine
                SET total_cotisations = COALESCE(total_cotisations, 0) + ${amount}
                WHERE tontine_id = ${tontine.id}
                AND client_id = ${membre.clientId}
            `);
            
            return { result: true };
        }
    );
}
