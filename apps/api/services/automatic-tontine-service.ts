import { db } from "../db";
import { tontines, membresTontine, contributionsTontine, comptes, transactionsCompte } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { createContributionTontineWithLedger } from "../storage/tontines";
import { updateTontineSolde, executeWithLedger, updateCompteSolde, generateReference } from "./ledger";
import { isTourFullyPaid } from "./tontine-logic";
import { StatutMembreTontine, TypeCompte, StatutTransaction, TypeOperationCaisse, MethodePaiement } from "@shared/enum/status-constants";
import { TontineStatus } from "@shared/schema/tontines";
import { createLogger } from "../lib/logger";

const logger = createLogger('AutoTontine');

export async function processAutomaticTontineContributions() {
  const now = new Date();

  // 1. Get all active tontines
  const activeTontines = await db.select().from(tontines).where(eq(tontines.statut, TontineStatus.ACTIVE));

  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    errors: [] as any[]
  };

  for (const tontine of activeTontines) {
    try {
      // Determine Current Tour from typed column
      const currentTour = (tontine.currentRound || 0) + 1;

      // 2. Find members with auto-contribution
      const eligibleMembers = await db.select().from(membresTontine).where(and(
        eq(membresTontine.tontineId, tontine.id),
        eq(membresTontine.cotisationAutomatique, true),
        eq(membresTontine.statut, StatutMembreTontine.ACTIVE)
      ));

      for (const membre of eligibleMembers) {
        // Vérifier si le tour est déjà payé (complètement ou partiellement via avance)
        const tourStatus = await isTourFullyPaid(membre.clientId, tontine.id, currentTour);

        if (tourStatus.isPaid) {
          // Tour déjà payé via avance - sauter silencieusement
          logger.info({ currentTour, membreId: membre.id, clientId: membre.clientId }, 'Tour already paid via advance');
          continue;
        }

        // Calculer le montant restant à prélever (gestion des paiements partiels)
        const montantAPrevelever = tourStatus.montantRestant;

        if (montantAPrevelever <= 0) {
          logger.info({ membreId: membre.id, currentTour }, 'Nothing to debit for member');
          continue;
        }

        results.processed++;
        try {
          await executeAutomaticContribution(tontine, membre, currentTour, montantAPrevelever);
          results.success++;
          logger.info({ amount: montantAPrevelever, membreId: membre.id, currentTour }, 'Debit successful');
        } catch (error) {
           logger.error({ tontineId: tontine.id, membreId: membre.id, err: error }, 'Error processing auto-contribution');
           results.failed++;
           results.errors.push({ tontineId: tontine.id, membreId: membre.id, error });
        }
      }
    } catch (e) {
      logger.error({ tontineId: tontine.id, err: e }, 'Error processing tontine');
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
      const accounts = await db.select().from(comptes).where(and(eq(comptes.clientId, membre.clientId), eq(comptes.typeCompte, TypeCompte.CURRENT)));
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

    // Debit account + credit tontine atomically via executeWithLedger
    await executeWithLedger(
        "TONTINE",
        {
          montant: amount.toString(),
          sens: "CREDIT",
          clientId: membre.clientId,
          tontineId: tontine.id,
          compteId: compte.id,
          agenceId: tontine.agenceId || undefined,
          typePaiement: "TONTINE_CONTRIBUTION",
          methodePaiement: "TRANSFER",
          referenceExterne: `AUTO-TON-${generateReference("TONTINE")}`,
          metadata: {
              description: montantAPrevelever
                ? `Contribution automatique Tour ${tourNumero} (Complément: ${amount} FCFA)`
                : `Contribution automatique Tour ${tourNumero}`,
              tourNumero,
              compteSourceId: compte.id,
              isPartialPayment: !!montantAPrevelever,
          },
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
                membreId: membre.id,
                typeOperation: TypeOperationCaisse.TONTINE_CONTRIBUTION,
                montant: amount.toString(),
                tourNumero,
                methodePaiement: MethodePaiement.TRANSFER,
                reference: mouvement.reference,
                statutTransaction: StatutTransaction.POSTED,
                mouvementId: mouvement.id
            });

            // 4. Create Transaction Record (for account history)
            await tx.insert(transactionsCompte).values({
                compteId: compte.id,
                mouvementId: mouvement.id,
                typePaiement: TypeOperationCaisse.TONTINE_CONTRIBUTION,
                sens: "DEBIT", // Contribution is money going out
                montant: amount.toString(),
                soldeApres: nouveauSoldeCompte,
                methodePaiement: MethodePaiement.TRANSFER,
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
