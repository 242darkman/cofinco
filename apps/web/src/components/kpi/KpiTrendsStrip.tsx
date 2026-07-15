/**
 * KPI Trends Strip — bandeau de tendances avec sparklines.
 *
 * Affiche l'évolution des indicateurs clés sur les 12 dernières périodes
 * (snapshots historisés, endpoint /api/kpi/series). Discret : masqué tant
 * qu'il n'y a pas au moins 2 points de série (rien d'utile à tracer).
 */
import Card from '@/components/ui/Card';
import { useKpiSeries } from '@/hooks/use-kpi';
import { fmtMoney, fmtPercent } from './kpi-utils';
import {
  buildSparklineGeometry,
  metricSeries,
  trendDirection,
  trendVariant,
} from './kpi-trends-utils';

interface TrendDefinition {
  metric: string;
  label: string;
  /** true si une hausse est défavorable (PAR, écarts...) */
  inverse?: boolean;
  format: (value: number) => string;
}

/** Indicateurs clés du bandeau — alignés sur la vue d'ensemble. */
const TREND_DEFINITIONS: TrendDefinition[] = [
  { metric: 'credit.encoursTotalActif', label: 'Encours crédit', format: fmtMoney },
  { metric: 'risque.par30', label: 'PAR 30', inverse: true, format: fmtPercent },
  { metric: 'tresorerie.soldeCaisses', label: 'Solde caisses', format: fmtMoney },
  { metric: 'rentabilite.resultatNet', label: 'Résultat net', format: fmtMoney },
];

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 32;

const VARIANT_CLASSES = {
  success: 'text-status-success',
  danger: 'text-status-danger',
  neutral: 'text-content-muted',
} as const;

function Sparkline({ values, inverse, label }: { values: number[]; inverse?: boolean; label: string }) {
  const geometry = buildSparklineGeometry(values, SPARK_WIDTH, SPARK_HEIGHT);
  if (!geometry) return null;

  const variant = trendVariant(trendDirection(values), inverse);
  const colorClass = VARIANT_CLASSES[variant];

  return (
    <svg
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      role="img"
      aria-label={`Tendance ${label} sur ${values.length} périodes`}
      className={colorClass}
    >
      <polyline
        points={geometry.points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={geometry.last.x} cy={geometry.last.y} r="2.5" fill="currentColor" />
    </svg>
  );
}

interface Props {
  periodType: string;
  /** Agence sélectionnée — clé de cache uniquement, résolution côté serveur */
  scope?: string;
}

export default function KpiTrendsStrip({ periodType, scope }: Props) {
  const { data, isLoading, isError } = useKpiSeries(periodType, scope);
  const points = data?.data ?? [];

  // Bandeau silencieux : pas de série exploitable, pas de bruit visuel
  if (isLoading || isError || points.length < 2) return null;

  const trends = TREND_DEFINITIONS
    .map((def) => ({ def, values: metricSeries(points, def.metric) }))
    .filter(({ values }) => values.length >= 2);

  if (trends.length === 0) return null;

  return (
    <Card padding="sm">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {trends.map(({ def, values }) => {
          const lastValue = values[values.length - 1];
          return (
            <div key={def.metric} className="flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <p className="text-[11px] text-content-secondary truncate">{def.label}</p>
                <p className="text-sm font-semibold text-content-primary truncate">
                  {def.format(lastValue)}
                </p>
              </div>
              <Sparkline values={values} inverse={def.inverse} label={def.label} />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-content-muted mt-2">
        Tendance sur les {points.length} dernières périodes
      </p>
    </Card>
  );
}
