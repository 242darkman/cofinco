import {
  agencyMigrations,
  migrationAuditLogs,
  migrationEntityLogs
} from "@shared/schema/agency_migration";
import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { MigrationContext, StepLog } from "./types";

export function generateReference(): string {
    const year = new Date().getFullYear();
    const random = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    return `MIG-${year}-${random}`;
  }

export function generateChecksum(data: any): string {
    return createHash("sha256").update(JSON.stringify(data)).digest("hex");
  }

export async function logAudit(
    ctx: MigrationContext,
    action: string,
    statutAvant: string | null,
    statutApres: string | null,
    details: any
  ): Promise<void> {
    await db.insert(migrationAuditLogs).values({
      migrationId: ctx.migration.id,
      action,
      statutAvant,
      statutApres,
      details,
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

export async function updateMigrationStatus(
    migrationId: string,
    statut: string,
    progress: number,
    logs: StepLog[],
    currentStep?: string,
    error?: string,
    errorDetails?: any,
    /** Pass sourceAgencyId to enable WebSocket broadcasting */
    sourceAgencyId?: string,
  ): Promise<void> {
    await db
      .update(agencyMigrations)
      .set({
        statut,
        progress,
        logs,
        currentStep,
        error,
        errorDetails,
        updatedAt: new Date(),
      })
      .where(eq(agencyMigrations.id, migrationId));

    // Broadcast real-time progress via WebSocket
    broadcastMigrationProgress(migrationId, sourceAgencyId, currentStep || statut, progress);
  }

export function broadcastMigrationProgress(
    migrationId: string,
    sourceAgencyId?: string,
    step?: string,
    progress?: number,
    count?: number,
    total?: number,
  ): void {
    try {
      const ws = getWsInstance();
      if (!ws) return;

      const payload = { migrationId, step, progress, count, total, timestamp: new Date().toISOString() };

      if (sourceAgencyId) {
        ws.broadcastToAgency(sourceAgencyId, { type: "MIGRATION_PROGRESS", payload });
      }
      // Also broadcast globally for admin dashboards
      ws.broadcast({ type: "MIGRATION_PROGRESS", payload });
    } catch {
      // WebSocket broadcast failure is non-critical
    }
  }

export function broadcastMigrationStatus(
    migrationId: string,
    sourceAgencyId: string,
    status: string,
    details?: Record<string, any>,
  ): void {
    try {
      const ws = getWsInstance();
      if (!ws) return;

      const payload = { migrationId, status, ...details, timestamp: new Date().toISOString() };

      ws.broadcastToAgency(sourceAgencyId, { type: "MIGRATION_STATUS", payload });
      ws.broadcast({ type: "MIGRATION_STATUS", payload });
    } catch {
      // WebSocket broadcast failure is non-critical
    }
  }

export async function batchInsertEntityLogs<T extends { id: string }>(
    tx: any,
    migrationId: string,
    entityType: string,
    entities: T[],
    sourceAgencyId: string,
    targetAgencyId: string,
    snapshotFn: (entity: any) => object,
    batchSize: number = 500
  ): Promise<void> {
    const logBatch = entities.map((e) => ({
      migrationId,
      entityType,
      entityId: e.id,
      previousAgencyId: sourceAgencyId,
      newAgencyId: targetAgencyId,
      snapshotBefore: snapshotFn(e),
      success: true,
    }));

    for (let i = 0; i < logBatch.length; i += batchSize) {
      await tx.insert(migrationEntityLogs).values(logBatch.slice(i, i + batchSize));
    }
  }