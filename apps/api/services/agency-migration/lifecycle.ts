import {
  agences
} from "@shared/schema";
import {
  AGENCY_MIGRATION_MODE,
  agencyMigrations,
  MIGRATION_STATUS,
  migrationAuditLogs,
  type AgencyMigration
} from "@shared/schema/agency_migration";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { generateReference } from "./helpers";
import { MigrationError } from "./types";

export async function createMigration(params: {
    sourceAgencyId: string;
    targetClientsAgencyId?: string;
    targetEmployeesAgencyId?: string;
    targetTreasuryAgencyId?: string;
    scheduledAt?: Date;
    createdBy?: string;
  }): Promise<AgencyMigration> {
    const reference = generateReference();

    const [migration] = await db
      .insert(agencyMigrations)
      .values({
        reference,
        sourceAgencyId: params.sourceAgencyId,
        targetClientsAgencyId: params.targetClientsAgencyId,
        targetEmployeesAgencyId: params.targetEmployeesAgencyId,
        targetTreasuryAgencyId: params.targetTreasuryAgencyId,
        scheduledAt: params.scheduledAt,
        statut: params.scheduledAt ? MIGRATION_STATUS.SCHEDULED : MIGRATION_STATUS.DRAFT,
        createdBy: params.createdBy,
      })
      .returning();

    // Log d'audit
    await db.insert(migrationAuditLogs).values({
      migrationId: migration.id,
      action: "CREATED",
      statutAvant: null,
      statutApres: migration.statut,
      details: { ...params, reference },
      userId: params.createdBy,
    });

    // Si planifiée, passer l'agence en mode "En fermeture"
    if (params.scheduledAt) {
      await db
        .update(agences)
        .set({
          statut: AGENCY_MIGRATION_MODE.CLOSING_PENDING,
          notes: `Migration planifiée pour le ${params.scheduledAt.toISOString()}. Référence: ${reference}`,
          updatedAt: new Date(),
        })
        .where(eq(agences.id, params.sourceAgencyId));
    }

    return migration;
  }

export async function submitMigration(migrationId: string, userId?: string): Promise<void> {
    const [migration] = await db
      .select()
      .from(agencyMigrations)
      .where(eq(agencyMigrations.id, migrationId))
      .limit(1);

    if (!migration) {
      throw new MigrationError("Migration non trouvée", "NOT_FOUND");
    }

    // Idempotent: if already submitted (PENDING/SCHEDULED), return silently
    if (migration.statut === MIGRATION_STATUS.PENDING || migration.statut === MIGRATION_STATUS.SCHEDULED) {
      return;
    }

    if (migration.statut !== MIGRATION_STATUS.DRAFT) {
      throw new MigrationError("Seuls les brouillons peuvent être soumis", "INVALID_STATUS");
    }

    const previousStatus = migration.statut;
    const newStatus = migration.scheduledAt ? MIGRATION_STATUS.SCHEDULED : MIGRATION_STATUS.PENDING;

    await db
      .update(agencyMigrations)
      .set({
        statut: newStatus,
        executedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(agencyMigrations.id, migrationId));

    await db.insert(migrationAuditLogs).values({
      migrationId,
      action: "SUBMITTED",
      statutAvant: previousStatus,
      statutApres: newStatus,
      details: { executedBy: userId },
      userId,
    });

    // Mettre l'agence en mode fermeture si pas déjà fait
    await db
      .update(agences)
      .set({
        statut: AGENCY_MIGRATION_MODE.CLOSING_PENDING,
        updatedAt: new Date(),
      })
      .where(eq(agences.id, migration.sourceAgencyId));
  }

export async function cancelMigration(migrationId: string, reason: string, userId?: string): Promise<void> {
    const [migration] = await db
      .select()
      .from(agencyMigrations)
      .where(eq(agencyMigrations.id, migrationId))
      .limit(1);

    if (!migration) {
      throw new MigrationError("Migration non trouvée", "NOT_FOUND");
    }

    const cancelableStatuses: string[] = [MIGRATION_STATUS.DRAFT, MIGRATION_STATUS.PENDING, MIGRATION_STATUS.SCHEDULED];
    if (!cancelableStatuses.includes(migration.statut)) {
      throw new MigrationError("Cette migration ne peut plus être annulée", "INVALID_STATUS");
    }

    await db
      .update(agencyMigrations)
      .set({
        statut: MIGRATION_STATUS.CANCELLED,
        error: reason,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agencyMigrations.id, migrationId));

    await db.insert(migrationAuditLogs).values({
      migrationId,
      action: "CANCELLED",
      statutAvant: migration.statut,
      statutApres: MIGRATION_STATUS.CANCELLED,
      details: { reason },
      userId,
    });

    // Remettre l'agence en mode actif
    await db
      .update(agences)
      .set({
        statut: AGENCY_MIGRATION_MODE.ACTIVE,
        notes: null,
        updatedAt: new Date(),
      })
      .where(eq(agences.id, migration.sourceAgencyId));
  }