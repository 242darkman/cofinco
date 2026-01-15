import { db } from "../db";
import { agencyMigrations, clients, users, agences, credits, userAgences, coffresForts, mouvementsFinanciers, operationsCaisse, comptes, demandesCredit, tontines } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export class AgencyMigrationService {
  /**
   * Processes a pending migration job.
   * This should ideally be called by a worker/cron, but can be triggered via API.
   */
  async processMigration(migrationId: string) {
    console.log(`[AgencyMigration] Starting job ${migrationId}`);

    // Fetch Job
    const [migration] = await db
      .select()
      .from(agencyMigrations)
      .where(eq(agencyMigrations.id, migrationId))
      .limit(1);

    if (!migration || migration.status !== "PENDING") {
      console.error(`[AgencyMigration] Job ${migrationId} invalid or not PENDING`);
      return;
    }

    try {
      // SET PROCESSING
      await db
        .update(agencyMigrations)
        .set({ status: "PROCESSING", progress: 0 })
        .where(eq(agencyMigrations.id, migrationId));

      let progress = 0;
      const logs: any[] = [];
      const logStep = (step: string) => {
        console.log(`[AgencyMigration] ${step}`);
        logs.push({ step, timestamp: new Date().toISOString() });
      };

      // 1. Clients Transfer
      if (migration.targetClientsAgencyId) {
        logStep("Transferring Clients...");
        await db
            .update(clients)
            .set({ 
                agenceId: migration.targetClientsAgencyId,
                updatedAt: new Date()
            })
            .where(eq(clients.agenceId, migration.sourceAgencyId));
        
        // Transfer active Accounts
        logStep("Transferring Accounts...");
        await db
            .update(comptes)
            .set({ 
                agenceId: migration.targetClientsAgencyId,
                updatedAt: new Date()
            })
            .where(eq(comptes.agenceId, migration.sourceAgencyId));

        // Transfer active Credits
        logStep("Transferring Credits...");
        await db
            .update(credits)
            .set({ 
                agenceId: migration.targetClientsAgencyId,
                updatedAt: new Date()
            })
            .where(eq(credits.agenceId, migration.sourceAgencyId));
            
        // Transfer Credit Demands
        await db
            .update(demandesCredit)
            .set({ 
                agenceId: migration.targetClientsAgencyId,
                updatedAt: new Date()
            })
            .where(eq(demandesCredit.agenceId, migration.sourceAgencyId));

        // Transfer Tontines
        logStep("Transferring Tontines...");
        await db
            .update(tontines)
            .set({ 
                agenceId: migration.targetClientsAgencyId,
                updatedAt: new Date()
            })
            .where(eq(tontines.agenceId, migration.sourceAgencyId));

        logStep("Clients & Related Data Transferred.");
      }
      progress = 30;
      await this.updateProgress(migrationId, progress, logs);

      // 2. Employees Transfer
      if (migration.targetEmployeesAgencyId) {
        logStep("Transferring Employees...");
        // Re-assign users linked to this agency
        await db
            .update(userAgences)
            .set({ 
                agenceId: migration.targetEmployeesAgencyId,
                updatedAt: new Date()
            })
            .where(eq(userAgences.agenceId, migration.sourceAgencyId));
        
        // Also update primary agency in users table if applicable (depending on schema usage)
        // users.agenceId DOES NOT EXIST. Skipping legacy users table update.
        // If there's an 'employes' table, it should be updated instead.
        /* 
        await db
            .update(users)
            .set({ agenceId: migration.targetEmployeesAgencyId })
            .where(eq(users.agenceId, migration.sourceAgencyId));
        */

        logStep("Employees Transferred.");
      }
      progress = 60;
      await this.updateProgress(migrationId, progress, logs);

      // 3. Treasury Transfer
      if (migration.targetTreasuryAgencyId) {
        logStep("Transferring Treasury...");
        
        // Get Source Coffre
        const [sourceCoffre] = await db
            .select()
            .from(coffresForts)
            .where(eq(coffresForts.ownerId, migration.sourceAgencyId))
            .limit(1);

        // Get Target Coffre
        const [targetCoffre] = await db
            .select()
            .from(coffresForts)
            .where(eq(coffresForts.ownerId, migration.targetTreasuryAgencyId))
            .limit(1);

        if (sourceCoffre && targetCoffre && Number(sourceCoffre.solde) > 0) {
            const amount = Number(sourceCoffre.solde);
            
            // Transaction
            await db.transaction(async (tx) => {
                // Debit Source
                await tx
                    .update(coffresForts)
                    .set({ 
                        solde: sql`${coffresForts.solde} - ${amount}`,
                        updatedAt: new Date()
                    })
                    .where(eq(coffresForts.id, sourceCoffre.id));

                // Credit Target
                await tx
                    .update(coffresForts)
                    .set({ 
                        solde: sql`${coffresForts.solde} + ${amount}`,
                        updatedAt: new Date()
                    })
                    .where(eq(coffresForts.id, targetCoffre.id));

                // Record Movement
                await tx.insert(mouvementsFinanciers).values({
                    typeMouvement: "TRANSFERT_AGENCE",
                    montant: amount.toString(),
                    sourceId: sourceCoffre.id,
                    destinationId: targetCoffre.id,
                    status: "COMPLETED",
                    description: `Migration Agence ${migration.sourceAgencyId} -> ${migration.targetTreasuryAgencyId}`,
                    createdBy: migration.createdBy,
                    // Use literal casts for enums if needed, or import enums
                    sens: "SORTIE", 
                    sourceModule: "COFFRE",
                    metadata: {
                        destinationId: targetCoffre.id,
                        type: "MIGRATION_AGENCE"
                    }
                } as any); // Type assertion if strict enum check fails locally
            });
            logStep(`Treasury Transferred: ${amount}`);
        } else {
            logStep("No funds to transfer or invalid coffres.");
        }
      }
      progress = 90;
      await this.updateProgress(migrationId, progress, logs);

      // 4. Archive Source Agency
      logStep("Archiving Source Agency...");
      await db
        .update(agences)
        .set({ 
            statut: "Fermé", 
            notes: `Migrated to ${migration.targetClientsAgencyId} on ${new Date().toISOString()}` 
        })
        .where(eq(agences.id, migration.sourceAgencyId));

      // COMPLETE
      await db
        .update(agencyMigrations)
        .set({ 
            status: "COMPLETED", 
            progress: 100, 
            logs: logs,
            completedAt: new Date() 
        })
        .where(eq(agencyMigrations.id, migrationId));
      
      console.log(`[AgencyMigration] Job ${migrationId} COMPLETED`);

    } catch (error: any) {
      console.error(`[AgencyMigration] Job ${migrationId} FAILED`, error);
      await db
        .update(agencyMigrations)
        .set({ 
            status: "FAILED", 
            error: error.message,
            completedAt: new Date() 
        })
        .where(eq(agencyMigrations.id, migrationId));
    }
  }

  private async updateProgress(id: string, progress: number, logs: any[]) {
     await db
        .update(agencyMigrations)
        .set({ progress, logs })
        .where(eq(agencyMigrations.id, id));
  }
}

export const agencyMigrationService = new AgencyMigrationService();
