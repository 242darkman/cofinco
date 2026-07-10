/**
 * KPI Refresh Service — recalcul des snapshots par scope.
 *
 * Centralise la logique « recalculer une agence » et « recalculer toutes les
 * agences + vue consolidée » pour qu'elle soit partagée entre :
 * - la route POST /api/kpi/recalculate (déclenchement admin) ;
 * - le worker temps réel (déclenchement outbox, source 'scheduled') ;
 * - le cron filet de sécurité.
 *
 * Le recalcul global vérifie systématiquement la cohérence
 * consolidé = somme des agences et stocke les écarts dans
 * metadata.warnings du snapshot consolidé.
 */
import { db } from "../../db";
import { agences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import type { KpiMetadata, KpiPayload, KpiPeriodType } from "@shared/schema/kpi";
import { computeKpiPayload } from "./kpi-engine";
import { upsertSnapshot } from "./kpi-store";
import { checkConsolidatedCoherence } from "./kpi-coherence";

const logger = createLogger('KpiRefresh');

export interface RefreshScopeOptions {
  periodType: KpiPeriodType;
  periodKey: string;
  generatedBy?: string;
  source?: KpiMetadata['source'];
}

export interface RefreshAllResult {
  agencies: Array<{ agencyId: string; agencyName: string; version: number }>;
  consolidated: { version: number; warnings: string[] };
}

/** Recalcule et persiste le snapshot d'une seule agence. */
export async function refreshAgencyScope(
  options: RefreshScopeOptions & { agencyId: string },
) {
  const { periodType, periodKey, agencyId, generatedBy, source } = options;
  const { payload, metadata } = await computeKpiPayload({
    periodType, periodKey, agencyId, generatedBy, source,
  });
  return upsertSnapshot({
    periodType, periodKey,
    scopeType: 'AGENCY',
    agencyId,
    payload,
    generatedBy,
    metadata,
  });
}

/**
 * Recalcule toutes les agences ACTIVES puis la vue consolidée,
 * avec contrôle de cohérence consolidé = somme des agences.
 * Séquentiel pour ne pas saturer la base.
 */
export async function refreshAllScopes(options: RefreshScopeOptions): Promise<RefreshAllResult> {
  const { periodType, periodKey, generatedBy, source } = options;

  const allAgencies = await db
    .select({ id: agences.id, nom: agences.nom })
    .from(agences)
    .where(eq(agences.statut, 'ACTIVE'));

  const results: RefreshAllResult['agencies'] = [];
  const agencyPayloads: KpiPayload[] = [];

  for (const agency of allAgencies) {
    const { payload, metadata } = await computeKpiPayload({
      periodType, periodKey, agencyId: agency.id, generatedBy, source,
    });
    const snapshot = await upsertSnapshot({
      periodType, periodKey,
      scopeType: 'AGENCY',
      agencyId: agency.id,
      payload,
      generatedBy,
      metadata,
    });
    agencyPayloads.push(payload);
    results.push({ agencyId: agency.id, agencyName: agency.nom, version: (snapshot as any).version });
  }

  // Vue consolidée (sans filtre agence)
  const { payload: consolidatedPayload, metadata: consolidatedMeta } = await computeKpiPayload({
    periodType, periodKey, agencyId: null, generatedBy, source,
  });

  // Contrôle de cohérence : consolidé = somme des agences (clés additives)
  const coherence = checkConsolidatedCoherence(agencyPayloads, consolidatedPayload);
  if (!coherence.coherent) {
    logger.warn(
      { periodType, periodKey, warnings: coherence.warnings },
      'Incohérence consolidé/somme des agences détectée',
    );
  }
  const metadata: KpiMetadata = {
    ...consolidatedMeta,
    warnings: [...(consolidatedMeta.warnings ?? []), ...coherence.warnings],
  };

  const consolidatedSnapshot = await upsertSnapshot({
    periodType, periodKey,
    scopeType: 'CONSOLIDATED',
    agencyId: null,
    payload: consolidatedPayload,
    generatedBy,
    metadata,
  });

  return {
    agencies: results,
    consolidated: {
      version: (consolidatedSnapshot as any).version,
      warnings: coherence.warnings,
    },
  };
}
