import cron, { ScheduledTask } from "node-cron";
import { db } from "../db";
import { comptes, produitsCompte, transactionsCompte } from "@shared/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { executeWithLedger, updateCompteSolde } from "./ledger";
import { createLogger } from "../lib/logger";
import { StatutCompte } from "@shared/enum/status-constants";

const logger = createLogger('MaintenanceFeeScheduler');

/**
 * Map account type → GL eventType for maintenance fee routing
 */
function getMaintenanceFeeEventType(typeCompte: string): string {
  switch (typeCompte) {
    case "SAVINGS": return "MAINTENANCE_FEE_SAVINGS";
    case "CURRENT": return "MAINTENANCE_FEE_CURRENT";
    case "BLOCKED": return "MAINTENANCE_FEE_BLOCKED";
    default: return "MAINTENANCE_FEE_CURRENT";
  }
}

export class MaintenanceFeeSchedulerService {
  private monthlyJob: ScheduledTask | null = null;

  constructor() {
    this.startJobs();
  }

  public startJobs() {
    // Prélèvement mensuel des frais de tenue (le 1er de chaque mois à 03:00)
    this.monthlyJob = cron.schedule("0 3 1 * *", () => {
      this.runMonthlyMaintenanceFees();
    });

    logger.info('Service started: Monthly maintenance fees @ 03:00 (1st of month)');
  }

  /**
   * Prélèvement mensuel des frais de tenue de compte.
   *
   * Pour chaque compte actif dont le produit a frais.tenue > 0:
   * - Si le solde est suffisant: débiter les frais
   * - Si le solde est insuffisant: ignorer (pas de solde négatif pour frais de tenue)
   * - Enregistrer la date du dernier prélèvement
   */
  public async runMonthlyMaintenanceFees() {
    logger.info('Starting Monthly Maintenance Fee Job');

    try {
      // Fetch all active accounts with their product config
      const activeAccounts = await db
        .select({
          compte: comptes,
          frais: produitsCompte.frais,
        })
        .from(comptes)
        .leftJoin(produitsCompte, eq(comptes.produitId, produitsCompte.id))
        .where(
          and(
            eq(comptes.statut, StatutCompte.ACTIVE),
            isNull(comptes.deletedAt)
          )
        );

      let processed = 0;
      let skippedNoFee = 0;
      let skippedInsufficientBalance = 0;

      for (const { compte, frais } of activeAccounts) {
        // Extract tenue fee from product config
        if (!frais || typeof frais !== "object") {
          skippedNoFee++;
          continue;
        }

        const fraisObj = frais as Record<string, unknown>;
        const fraisTenue = Number(fraisObj.tenue) || 0;

        if (fraisTenue <= 0) {
          skippedNoFee++;
          continue;
        }

        // Check balance sufficiency — no negative balance allowed for maintenance fees
        const solde = parseFloat(compte.soldeCourant || "0");
        if (solde < fraisTenue) {
          logger.warn(
            { compteId: compte.id, solde, fraisTenue },
            'Insufficient balance for maintenance fee — skipped'
          );
          skippedInsufficientBalance++;
          continue;
        }

        try {
          const eventType = getMaintenanceFeeEventType(compte.typeCompte);

          await executeWithLedger(
            "SYSTEME",
            {
              montant: fraisTenue.toString(),
              sens: "DEBIT",
              clientId: compte.clientId,
              compteId: compte.id,
              agenceId: compte.agenceId || undefined,
              methodePaiement: "TRANSFER",
              typePaiement: "MAINTENANCE_FEE",
              requiresGlPosting: true,
              metadata: {
                observations: "Frais de tenue de compte mensuel",
                glEventType: eventType,
              },
            },
            async (tx, mouvement) => {
              // Debit account
              const nouveauSolde = await updateCompteSolde(tx, compte.id, -fraisTenue);

              // Create transaction record
              const [transaction] = await tx
                .insert(transactionsCompte)
                .values({
                  compteId: compte.id,
                  mouvementId: mouvement.id,
                  typePaiement: "MAINTENANCE_FEE",
                  sens: "DEBIT",
                  montant: fraisTenue.toString(),
                  soldeApres: nouveauSolde,
                  methodePaiement: "TRANSFER",
                  observations: "Frais de tenue de compte mensuel",
                  createdBy: null, // System
                } as any)
                .returning();

              // Update last maintenance fee date
              await tx.update(comptes).set({
                dateDerniereFraisTenue: new Date(),
              }).where(eq(comptes.id, compte.id));

              return { result: transaction };
            }
          );

          processed++;
        } catch (err) {
          logger.error(
            { err, compteId: compte.id },
            'Failed to deduct maintenance fee for account'
          );
        }
      }

      logger.info(
        { processed, skippedNoFee, skippedInsufficientBalance, total: activeAccounts.length },
        'Monthly Maintenance Fee Job completed'
      );
    } catch (error) {
      logger.error({ err: error }, 'Error in Monthly Maintenance Fee Job');
    }
  }
}

export const maintenanceFeeScheduler = new MaintenanceFeeSchedulerService();
