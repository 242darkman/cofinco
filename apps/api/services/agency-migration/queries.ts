import {
  agencyMigrations,
  MIGRATION_STATUS,
  migrationAuditLogs,
  migrationEntityLogs,
  migrationPreFlightChecks,
  type AgencyMigration
} from "@shared/schema/agency_migration";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";

export async function getScheduledMigrationsToExecute(): Promise<AgencyMigration[]> {
    return db
      .select()
      .from(agencyMigrations)
      .where(
        and(
          eq(agencyMigrations.statut, MIGRATION_STATUS.SCHEDULED),
          sql`${agencyMigrations.scheduledAt} <= NOW()`
        )
      );
  }

export async function getMigrationStatus(migrationId: string): Promise<AgencyMigration | null> {
    const [migration] = await db
      .select()
      .from(agencyMigrations)
      .where(eq(agencyMigrations.id, migrationId))
      .limit(1);

    return migration || null;
  }

export async function getMigrationPreFlightChecks(migrationId: string) {
    return db
      .select()
      .from(migrationPreFlightChecks)
      .where(eq(migrationPreFlightChecks.migrationId, migrationId))
      .orderBy(migrationPreFlightChecks.checkedAt);
  }

export async function getMigrationAuditLogs(migrationId: string) {
    return db
      .select()
      .from(migrationAuditLogs)
      .where(eq(migrationAuditLogs.migrationId, migrationId))
      .orderBy(migrationAuditLogs.timestamp);
  }

export async function getMigrationEntityLogs(migrationId: string, entityType?: string) {
    const conditions = [eq(migrationEntityLogs.migrationId, migrationId)];

    if (entityType) {
      conditions.push(eq(migrationEntityLogs.entityType, entityType));
    }

    return db
      .select()
      .from(migrationEntityLogs)
      .where(and(...conditions))
      .orderBy(migrationEntityLogs.migratedAt);
  }