
import { db } from "../db";
import { comptes, evenementsOutbox } from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { subDays } from "date-fns";
import * as cron from "node-cron";
import { StatutCompte } from "@shared/enum/status-constants";

/**
 * Service de nettoyage des comptes en attente de paiement
 * Annule les comptes créés il y a plus de 7 jours et jamais activés
 */
export class AccountCleanupService {
    private static instance: AccountCleanupService;
    private job: cron.ScheduledTask | null = null;
    
    private constructor() {}
    
    public static getInstance(): AccountCleanupService {
        if (!AccountCleanupService.instance) {
            AccountCleanupService.instance = new AccountCleanupService();
        }
        return AccountCleanupService.instance;
    }
    
    /**
     * Démarrer le cron job (Tous les jours à 00:00)
     */
    public start() {
        if (this.job) {
            console.log("Account cleanup job already running");
            return;
        }
        
        // Run every day at midnight: "0 0 * * *"
        this.job = cron.schedule("0 0 * * *", async () => {
             console.log("[CRON] Starting account cleanup job...");
             try {
                 await this.cleanupPendingAccounts();
             } catch (error) {
                 console.error("[CRON] Error during account cleanup:", error);
             }
        });
        
        console.log("Account cleanup job scheduled (Daily at 00:00)");
    }
    
    public stop() {
        if (this.job) {
            this.job.stop();
            this.job = null;
        }
    }
    
    /**
     * Exécute le nettoyage
     */
    public async cleanupPendingAccounts() {
        const cutoffDate = subDays(new Date(), 7);
        
        console.log(`[CLEANUP] Investigating accounts pending since before ${cutoffDate.toISOString()}`);
        
        await db.transaction(async (tx) => {
             // 1. Identification
             const pendingAccounts = await tx
                .select({
                    id: comptes.id,
                    numeroCompte: comptes.numeroCompte,
                    clientId: comptes.clientId,
                    createdAt: comptes.createdAt
                })
                .from(comptes)
                .where(
                    and(
                        eq(comptes.statut, StatutCompte.PENDING_ACTIVATION),
                        lte(comptes.createdAt, cutoffDate)
                    )
                );
                
             if (pendingAccounts.length === 0) {
                 console.log("[CLEANUP] No accounts to clean up.");
                 return;
             }
             
             console.log(`[CLEANUP] Found ${pendingAccounts.length} accounts to cancel.`);
             
             for (const account of pendingAccounts) {
                  // 2. Annulation
                  await tx.update(comptes)
                    .set({
                        statut: StatutCompte.CANCELLED,
                        closedAt: new Date(),
                        // closedBy: 'SYSTEM', // Need to handle system user ID logic if enforced FK
                        updatedAt: new Date(),
                    })
                    .where(eq(comptes.id, account.id));

                  // 3. Audit / Event
                  await tx.insert(evenementsOutbox).values({
                      type: 'SOLDE_COMPTE_CHANGE', // Reuse or add COMPTE_STATUT_CHANGE
                      aggregateType: 'compte',
                      aggregateId: account.id,
                      payload: {
                          compteId: account.id,
                          action: 'ANNULATION_AUTOMATIQUE',
                          motif: 'Délai de paiement initial dépassé (7 jours)',
                          ancienStatut: StatutCompte.PENDING_ACTIVATION,
                          nouveauStatut: StatutCompte.CANCELLED,
                          date: new Date().toISOString()
                      }
                  });
             }
             
             console.log(`[CLEANUP] Successfully cancelled ${pendingAccounts.length} accounts.`);
        });
    }
}

export const accountCleanup = AccountCleanupService.getInstance();
