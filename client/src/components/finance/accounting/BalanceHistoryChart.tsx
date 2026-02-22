import React, { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useBalanceHistory } from '../../../hooks/dashboard/useBalanceHistory';

interface BalanceHistoryChartProps {
  title?: string;
  showLegend?: boolean;
  height?: number;
}

type Period = '7d' | '30d' | '90d' | '1y';
type Metric = 'solde' | 'credits' | 'epargnes';

const METRIC_CONFIG = {
  solde: {
    labelKey: 'soldeTotal',
    color: '#10b981',
    gradientColors: ['#10b981', '#34d399'],
  },
  credits: {
    labelKey: 'credits',
    color: '#3b82f6',
    gradientColors: ['#3b82f6', '#60a5fa'],
  },
  epargnes: {
    labelKey: 'epargnes',
    color: '#8b5cf6',
    gradientColors: ['#8b5cf6', '#a78bfa'],
  }
} as const;

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7J' },
  { value: '30d', label: '30J' },
  { value: '90d', label: '3M' },
  { value: '1y', label: '1A' }
];

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 jours',
  '30d': '30 jours',
  '90d': '3 mois',
  '1y': '1 an',
};

export default function BalanceHistoryChart({
  title,
  height = 250
}: BalanceHistoryChartProps) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState<Period>('30d');
  const [activeMetric, setActiveMetric] = useState<Metric>('solde');

  const { data: chartData, loading } = useBalanceHistory(period);

  const displayTitle = title || t('evolutionFinanciere');

  // Calculate trend & stats
  const { latestValue, trend, trendPercent, minValue, maxValue } = useMemo(() => {
    if (chartData.length < 2) {
      return { latestValue: 0, trend: 0, trendPercent: 0, minValue: 0, maxValue: 0 };
    }
    const values = chartData.map(d => d[activeMetric] || 0);
    const latest = values[values.length - 1];
    const previous = values[0];
    const diff = latest - previous;
    const percent = previous > 0 ? ((diff / previous) * 100) : 0;

    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
      if (min === 0) {
        max = 10000;
      } else {
        const padding = Math.abs(min * 0.1) || 1000;
        min -= padding;
        max += padding;
      }
    } else {
      const range = max - min;
      min -= range * 0.05;
      max += range * 0.05;
    }

    return { latestValue: latest, trend: diff, trendPercent: percent, minValue: min, maxValue: max };
  }, [chartData, activeMetric]);

  const formatValue = (value: number, compact = false) => {
    if (compact) {
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
      return value.toString();
    }
    return new Intl.NumberFormat('fr-FR').format(value);
  };

  // Punchline
  const punchline = useMemo(() => {
    const metricLabel = t(METRIC_CONFIG[activeMetric].labelKey);
    const periodLabel = PERIOD_LABELS[period];
    if (chartData.length < 2) return `${metricLabel} — données en cours de collecte`;
    const dir = trend >= 0 ? 'en hausse' : 'en baisse';
    const pct = Math.abs(trendPercent).toFixed(1);
    if (Math.abs(trendPercent) < 0.5) return `${metricLabel} stable sur ${periodLabel}`;
    return `${metricLabel} ${dir} de ${pct}% sur ${periodLabel}`;
  }, [chartData, activeMetric, period, trend, trendPercent, t]);

  const config = METRIC_CONFIG[activeMetric];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface-base/90 border border-edge rounded-lg p-2 shadow-lg backdrop-blur-sm">
          <p className="text-content-muted text-[10px] mb-0.5 font-medium">{label}</p>
          <div className="flex items-baseline gap-1">
            <span className="font-bold text-sm text-content-primary tabular-nums">
              {formatValue(payload[0]?.value || 0)}
            </span>
            <span className="text-[10px] text-content-muted">FCFA</span>
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="bg-surface-base border border-edge rounded-2xl flex flex-col items-center justify-center animate-pulse" style={{ height: height + 120 }}>
        <div className="w-10 h-10 rounded-full bg-surface-elevated mb-2" />
        <div className="h-3 w-24 bg-surface-elevated rounded" />
      </div>
    );
  }

  return (
    <div className="bg-surface-base border border-edge rounded-2xl overflow-hidden shadow-sm flex flex-col h-full">
      {/* Header row: title + period pills */}
      <div className="px-4 pt-3 pb-0 flex items-center justify-between">
        <h3 className="text-sm font-bold text-content-primary">{displayTitle}</h3>
        <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                period === p.value
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric selector — pill group */}
      <div className="px-4 pt-2 pb-0">
        <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5">
          {(Object.keys(METRIC_CONFIG) as Metric[]).map((metric) => (
            <button
              key={metric}
              onClick={() => setActiveMetric(metric)}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${
                activeMetric === metric
                  ? 'bg-surface-base text-content-primary shadow-sm'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {t(METRIC_CONFIG[metric].labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Hero value + trend */}
      <div className="px-4 pt-3 pb-1 flex items-end justify-between">
        <div>
          <p className="text-[10px] text-content-muted mb-0.5">{t('volumePortefeuille')}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-content-primary tracking-tight tabular-nums">
              {formatValue(latestValue)}
            </span>
            <span className="text-[10px] font-medium text-content-muted">FCFA</span>
          </div>
        </div>

        {/* Trend badge */}
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
          trend >= 0
            ? 'bg-status-success-bg text-status-success'
            : 'bg-status-danger-bg text-status-danger'
        }`}>
          {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {trend >= 0 ? '+' : ''}{trendPercent.toFixed(1)}%
        </div>
      </div>

      {/* Punchline */}
      <div className="px-4 pb-2">
        <p className={`text-[10px] font-medium ${
          Math.abs(trendPercent) < 0.5 ? 'text-content-muted' :
          trend >= 0 ? 'text-status-success' : 'text-status-danger'
        }`}>
          {punchline}
        </p>
      </div>

      {/* Chart */}
      <div className="w-full flex-1 min-h-0" style={{ minHeight: height * 0.55 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 15, left: 5, bottom: 5 }}
          >
            <defs>
              <linearGradient id={`gradient-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={config.gradientColors[0]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={config.gradientColors[1]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--border-default)"
              opacity={0.3}
            />
            <XAxis
              dataKey="date"
              stroke="var(--text-muted)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
              tickMargin={6}
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={10}
              tickFormatter={(v) => formatValue(v, true)}
              tickLine={false}
              axisLine={false}
              domain={[minValue, maxValue]}
              width={50}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: config.color, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey={activeMetric}
              stroke={config.color}
              strokeWidth={2.5}
              fill={`url(#gradient-${activeMetric})`}
              animationDuration={1200}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
