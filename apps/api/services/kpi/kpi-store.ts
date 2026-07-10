/**
 * KPI Store — CRUD operations on kpi_snapshots table
 *
 * Uses a find-then-update/insert pattern instead of ON CONFLICT
 * to correctly handle NULL agency_id (CONSOLIDATED scope).
 * PostgreSQL treats NULL as distinct in unique indexes, so ON CONFLICT
 * would create duplicates for consolidated snapshots.
 *
 * L'upsert est sérialisé par un verrou consultatif transactionnel
 * (pg_advisory_xact_lock) sur la clé période/scope/agence : deux recalculs
 * concurrents (deux admins, worker + admin) ne peuvent plus créer de
 * doublon ni s'écraser mutuellement en écriture croisée.
 */
import { db } from "../../db";
import { kpiSnapshots, type KpiPayload, type KpiMetadata, type KpiPeriodType, type KpiScopeType } from "@shared/schema/kpi";
import { eq, and, sql, desc, isNull } from "drizzle-orm";

export interface UpsertSnapshotParams {
  periodType: KpiPeriodType;
  periodKey: string;
  scopeType: KpiScopeType;
  agencyId?: string | null;
  payload: KpiPayload;
  generatedBy?: string | null;
  metadata?: KpiMetadata;
}

/**
 * Upsert a KPI snapshot — finds existing by period/scope/agency, then updates or inserts.
 * Increments version on update.
 */
export async function upsertSnapshot(params: UpsertSnapshotParams) {
  const { periodType, periodKey, scopeType, agencyId, payload, generatedBy, metadata } = params;

  return db.transaction(async (tx) => {
    // Sérialise les upserts concurrents sur la même clé logique.
    // hashtext() borne la clé sur un int32 — collisions improbables et sans
    // danger (au pire, deux clés différentes se sérialisent entre elles).
    const lockKey = `kpi_snapshot:${periodType}:${periodKey}:${scopeType}:${agencyId ?? 'ALL'}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    // Find existing snapshot for this exact combination (dans la transaction,
    // donc après acquisition du verrou : lecture à jour garantie)
    const existing = await getSnapshot(periodType, periodKey, scopeType, agencyId, tx);

    if (existing) {
      // UPDATE existing — increment version
      const result = await tx.execute(sql`
        UPDATE kpi_snapshots
        SET
          payload = ${JSON.stringify(payload)}::jsonb,
          generated_at = NOW(),
          generated_by = ${generatedBy ?? null},
          version = ${existing.version + 1},
          metadata = ${metadata ? JSON.stringify(metadata) : null}::jsonb,
          updated_at = NOW()
        WHERE id = ${existing.id}
        RETURNING *
      `);
      return result.rows[0] as any;
    }

    // INSERT new snapshot
    const result = await tx.execute(sql`
      INSERT INTO kpi_snapshots (
        id, period_type, period_key, scope_type, agency_id,
        payload, generated_at, generated_by, version, metadata,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        ${periodType}, ${periodKey}, ${scopeType}, ${agencyId ?? null},
        ${JSON.stringify(payload)}::jsonb,
        NOW(),
        ${generatedBy ?? null},
        1,
        ${metadata ? JSON.stringify(metadata) : null}::jsonb,
        NOW(), NOW()
      )
      RETURNING *
    `);

    return result.rows[0] as any;
  });
}

/** Exécuteur minimal pour les lectures du store (db ou transaction). */
type SnapshotReadDb = Pick<typeof db, "select">;

/**
 * Get a single KPI snapshot by period/scope/agency.
 */
export async function getSnapshot(
  periodType: KpiPeriodType,
  periodKey: string,
  scopeType: KpiScopeType,
  agencyId?: string | null,
  dbx: SnapshotReadDb = db,
) {
  const conditions = [
    eq(kpiSnapshots.periodType, periodType),
    eq(kpiSnapshots.periodKey, periodKey),
    eq(kpiSnapshots.scopeType, scopeType),
  ];

  if (scopeType === 'AGENCY' && agencyId) {
    conditions.push(eq(kpiSnapshots.agencyId, agencyId));
  } else {
    conditions.push(isNull(kpiSnapshots.agencyId));
  }

  const rows = await dbx
    .select()
    .from(kpiSnapshots)
    .where(and(...conditions))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * List available snapshot periods for a given scope.
 */
export async function listSnapshotPeriods(
  scopeType: KpiScopeType,
  agencyId?: string | null,
  limit = 24,
) {
  const conditions = [eq(kpiSnapshots.scopeType, scopeType)];

  if (scopeType === 'AGENCY' && agencyId) {
    conditions.push(eq(kpiSnapshots.agencyId, agencyId));
  } else {
    conditions.push(isNull(kpiSnapshots.agencyId));
  }

  return db
    .select({
      periodType: kpiSnapshots.periodType,
      periodKey: kpiSnapshots.periodKey,
      generatedAt: kpiSnapshots.generatedAt,
      version: kpiSnapshots.version,
    })
    .from(kpiSnapshots)
    .where(and(...conditions))
    .orderBy(desc(kpiSnapshots.periodKey))
    .limit(limit);
}
