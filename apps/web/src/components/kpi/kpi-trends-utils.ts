/**
 * Trends Utils — géométrie pure des sparklines et sens de tendance.
 *
 * Module sans dépendance React : testable unitairement.
 */

export interface SparklineGeometry {
  /** Attribut `points` d'une polyline SVG */
  points: string;
  /** Coordonnées du dernier point (pastille) */
  last: { x: number; y: number };
}

/**
 * Convertit une série de valeurs en géométrie de polyline SVG.
 * Les valeurs sont normalisées sur la hauteur disponible ; une série plate
 * est tracée à mi-hauteur. Retourne null si moins de 2 points.
 */
export function buildSparklineGeometry(
  values: number[],
  width: number,
  height: number,
  padding = 2,
): SparklineGeometry | null {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;
  const stepX = usableW / (values.length - 1);

  const coords = values.map((value, i) => {
    const x = padding + i * stepX;
    // Série plate : ligne à mi-hauteur (span nul)
    const ratio = span === 0 ? 0.5 : (value - min) / span;
    const y = padding + (1 - ratio) * usableH;
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  });

  return {
    points: coords.map((c) => `${c.x},${c.y}`).join(' '),
    last: coords[coords.length - 1],
  };
}

export type TrendDirection = 'up' | 'down' | 'flat';

/** Sens de la tendance entre le premier et le dernier point. */
export function trendDirection(values: number[]): TrendDirection {
  if (values.length < 2) return 'flat';
  const first = values[0];
  const last = values[values.length - 1];
  if (last > first) return 'up';
  if (last < first) return 'down';
  return 'flat';
}

/**
 * Variante visuelle d'une tendance : une hausse est positive par défaut,
 * négative pour les indicateurs inversés (PAR, écarts, charges...).
 */
export function trendVariant(
  direction: TrendDirection,
  inverse = false,
): 'success' | 'danger' | 'neutral' {
  if (direction === 'flat') return 'neutral';
  const isGood = inverse ? direction === 'down' : direction === 'up';
  return isGood ? 'success' : 'danger';
}

/** Extrait la série d'une métrique depuis les points de l'API. */
export function metricSeries(
  points: Array<{ periodKey: string; metrics: Record<string, number> }>,
  metric: string,
): number[] {
  return points
    .map((p) => p.metrics[metric])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}
