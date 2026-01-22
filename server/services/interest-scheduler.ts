import cron, { ScheduledTask } from "node-cron";
import { db } from "../db";
import { comptes, produitsCompte, mouvementsFinanciers, evenementsOutbox, transactionsCompte } from "@shared/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import { executeWithLedger, updateCompteSolde } from "./ledger";
import { log } from "../logger";
import { StatutCompte } from "@shared/enum/status-constants";

export class InterestSchedulerService {
  private dailyJob: ScheduledTask | null = null;
  private monthlyJob: ScheduledTask | null = null;

  constructor() {
    this.startJobs();
  }

  public startJobs() {
    // Calcul quotidien des intérêts (tous les jours à minuit)
    this.dailyJob = cron.schedule("0 0 * * *", () => {
      this.runDailyAccrual();
    });

    // Capitalisation mensuelle (le 1er de chaque mois à 1h du matin)
    this.monthlyJob = cron.schedule("0 1 1 * *", () => {
      this.runMonthlyCapitalization();
    });

    log("InterestSchedulerService started: Daily accrual @ 00:00, Monthly capitalization @ 01:00 (1st of month)");
  }

  /**
   * Tâche quotidienne: Calculer les intérêts latents (accrued_interest)
   */
  public async runDailyAccrual() {
    log("Starting Daily Interest Accrual Job...");
    
    try {
      const activeAccounts = await db
        .select({
          compte: comptes,
          produit: produitsCompte,
        })
        .from(comptes)
        .leftJoin(produitsCompte, eq(comptes.produitId, produitsCompte.id))
        .where(
            and(
                eq(comptes.statut, StatutCompte.ACTIVE),
                gt(comptes.soldeCourant, "0") // Intérêts uniquement sur solde positif
            )
        );

      let processed = 0;

      for (const { compte, produit } of activeAccounts) {
        // Déterminer le taux d'intérêt
        // Priorité: Taux du produit, sinon 0 (pas d'intérêt par défaut)
        // Le schema produitsCompte a 'tauxInteret'
        const tauxStr = produit?.tauxInteret;
        
        if (!tauxStr) continue;
        
        const taux = parseFloat(tauxStr);
        if (isNaN(taux) || taux <= 0) continue;

        const solde = parseFloat(compte.soldeCourant || "0");
        
        // Calcul Intérêt Journalier: (Solde * Taux/100) / 365
        const dailyInterest = (solde * (taux / 100)) / 365;

        if (dailyInterest > 0) {
            // Mise à jour de accrued_interest
            // On fait un update incrémental pour éviter les race conditions majeures
            await db
                .update(comptes)
                .set({
                    accruedInterest: sql`${comptes.accruedInterest} + ${dailyInterest.toFixed(4)}`
                })
                .where(eq(comptes.id, compte.id));
            
            processed++;
        }
      }

      log(`Daily Interest Accrual Job completed. Processed ${processed} - accounts.`);
    } catch (error) {
      console.error("Error in Daily Interest Accrual Job:", error);
    }
  }

  /**
   * Tâche mensuelle: Capitaliser les intérêts (verser sur le solde)
   */
  public async runMonthlyCapitalization() {
    log("Starting Monthly Capitalization Job...");

    try {
      // Sélectionner les comptes ayant des intérêts accumulés
      const accountsToCapitalize = await db
        .select()
        .from(comptes)
        .where(gt(comptes.accruedInterest, "0.01")); // Minimum 0.01 pour capitaliser

      let processed = 0;

      for (const compte of accountsToCapitalize) {
        const montantInteret = parseFloat(compte.accruedInterest || "0");
        
        // Arrondir à 2 décimales (inférieur ou normal ?) - Disons normal pour le paiement
        const montantAcrediter = Math.floor(montantInteret * 100) / 100;

        if (montantAcrediter <= 0) continue;

        try {
            await executeWithLedger(
                "SYSTEME",
                {
                    montant: montantAcrediter.toString(),
                    sens: "CREDIT",
                    clientId: compte.clientId,
                    compteId: compte.id,
                    methodePaiement: "TRANSFER", // Ou 'Interne'
                    typePaiement: "INTERETS", 
                    metadata: {
                        observations: "Capitalisation mensuelle des intérêts"
                    }
                },
                async (tx, mouvement) => {
                    // Update compte: Créditer solde + Reset accruedInterest + Update date
                    const nouveauSolde = await updateCompteSolde(tx, compte.id, montantAcrediter);

                    // Reset accrued interest
                    await tx.update(comptes).set({
                        accruedInterest: "0",
                        dateDerniereCapitalisation: new Date()
                    }).where(eq(comptes.id, compte.id));

                    // Create transaction record
                    const [transaction] = await tx
                        .insert(transactionsCompte)
                        .values({
                            compteId: compte.id,
                            mouvementId: mouvement.id,
                            typePaiement: "INTERETS" as any, // Cast si enum strict, sinon string
                            montant: montantAcrediter.toString(),
                            soldeApres: nouveauSolde,
                            methodePaiement: "TRANSFER",
                            observations: "Capitalisation mensuelle des intérêts",
                            createdBy: null, // System
                        } as any)
                        .returning();

                    return { result: transaction };
                }
            );

            // Log / Outbox event (optional but good practice)
            processed++;
        } catch (err) {
            console.error(`Failed to capitalize for account ${compte.id}:`, err);
        }
      }

      log(`Monthly Capitalization Job completed. Capitalized for ${processed} accounts.`);
    } catch (error) {
      console.error("Error in Monthly Capitalization Job:", error);
    }
  }
}

export const interestScheduler = new InterestSchedulerService();
