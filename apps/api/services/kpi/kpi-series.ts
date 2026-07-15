/**
 * KPI Series — extraction de séries temporelles compactes depuis les
 * snapshots historisés.
 *
 * Chaque snapshot stocke un payload JSONB complet (répartitions, tops,
 * deltas...). Pour les tendances (sparklines, comparaisons N vs N-1),
 * le front n'a besoin que des valeurs SCALAIRES par domaine : ce module
 * aplatit un payload en métriques `domaine.indicateur` → nombre.
 *
 * Module pur (aucune dépendance DB) : testable unitairement.
 */
import type { KpiPayload } from "@shared/schema/kpi";

/** Domaines aplatis dans les séries (deltas et structures exclus). */
const SERIES_DOMAINS = [
  'credit',
  'risque',
  'tontinesEpargne',
  'rentabilite',
  'tresorerie',
  'clients',
  'rhProductivite',
] as const;

export type KpiSeriesMetrics = Record<string, number>;

export interface KpiSeriesPoint {
  periodKey: string;
  generatedAt: string;
  metrics: KpiSeriesMetrics;
}

/**
 * Aplati un payload KPI en métriques scalaires `domaine.indicateur`.
 * Les tableaux (topAgents, répartitions), objets (clientsParSegment) et
 * valeurs non finies sont ignorés — seuls les nombres exploitables en
 * série temporelle sont conservés.
 */
export function extractScalarMetrics(payload: KpiPayload): KpiSeriesMetrics {
  const metrics: KpiSeriesMetrics = {};
  for (const domain of SERIES_DOMAINS) {
    const domainPayload = payload[domain] as unknown as Record<string, unknown> | undefined;
    if (!domainPayload || typeof domainPayload !== 'object') continue;
    for (const [key, value] of Object.entries(domainPayload)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        metrics[`${domain}.${key}`] = value;
      }
    }
  }
  return metrics;
}

/**
 * Transforme des lignes de snapshots (ordonnées de la plus récente à la
 * plus ancienne) en série chronologique ASCENDANTE de points compacts.
 */
export function buildSeriesPoints(
  rows: Array<{ periodKey: string; generatedAt: Date | string; payload: KpiPayload }>,
): KpiSeriesPoint[] {
  return rows
    .map((row) => ({
      periodKey: row.periodKey,
      generatedAt: row.generatedAt instanceof Date ? row.generatedAt.toISOString() : String(row.generatedAt),
      metrics: extractScalarMetrics(row.payload),
    }))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}
