import React, { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts';
import { TrendingUp, TrendingDown, Calendar, ArrowRight } from 'lucide-react';
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
    color: '#10b981', // Emerald
    gradientColors: ['#10b981', '#34d399'],
  },
  credits: {
    labelKey: 'credits',
    color: '#3b82f6', // Blue
    gradientColors: ['#3b82f6', '#60a5fa'],
  },
  epargnes: {
    labelKey: 'epargnes',
    color: '#8b5cf6', // Violet
    gradientColors: ['#8b5cf6', '#a78bfa'],
  }
} as const;

export default function BalanceHistoryChart({
  title,
  height = 320 // Slightly taller for better mobile view
}: BalanceHistoryChartProps) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState<Period>('30d');
  const [activeMetric, setActiveMetric] = useState<Metric>('solde');
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);

  const { data: chartData, loading, error } = useBalanceHistory(period);

  const displayTitle = title || t('evolutionFinanciere');

  // Calculate trend & stats
  const { latestValue, previousValue, trend, trendPercent, minValue, maxValue } = useMemo(() => {
    if (chartData.length < 2) {
      return { latestValue: 0, previousValue: 0, trend: 0, trendPercent: 0, minValue: 0, maxValue: 0 };
    }
    const values = chartData.map(d => d[activeMetric] || 0);
    const latest = values[values.length - 1];
    const previous = values[0];
    const diff = latest - previous;
    const percent = previous > 0 ? ((diff / previous) * 100) : 0;
    
    // Add some padding to min/max for the chart domain
    let min = Math.min(...values);
    let max = Math.max(...values);
    
    // Safety check for flat lines or single values
    if (min === max) {
      if (min === 0) {
        max = 10000; // Default range if 0
      } else {
        // Add 10% amplitude padding
        const padding = Math.abs(min * 0.1) || 1000;
        min -= padding;
        max += padding;
      }
    } else {
      // Standard padding
      const range = max - min;
      min -= range * 0.05;
      max += range * 0.05;
    }
    
    return {
      latestValue: latest,
      previousValue: previous,
      trend: diff,
      trendPercent: percent,
      minValue: min,
      maxValue: max
    };
  }, [chartData, activeMetric]);

  const formatValue = (value: number, compact = false) => {
    if (compact) {
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
      return value.toString();
    }
    return new Intl.NumberFormat('fr-FR').format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const config = METRIC_CONFIG[activeMetric];
      return (
        <div className="bg-surface-base/80 border border-edge-subtle rounded-xl p-3 shadow-xl backdrop-blur-md">
          <p className="text-content-muted text-xs mb-1 font-medium">{label}</p>
          <div className="flex items-baseline gap-1">
            <span className="font-bold text-lg text-content-primary tabular-nums">
              {formatValue(payload[0]?.value || 0)}
            </span>
            <span className="text-xs text-content-muted font-medium">FCFA</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const periods: { value: Period; label: string }[] = [
    { value: '7d', label: '7J' },
    { value: '30d', label: '30J' },
    { value: '90d', label: '3M' },
    { value: '1y', label: '1A' }
  ];

  const config = METRIC_CONFIG[activeMetric];

  // Loading State
  if (loading) {
    return (
      <div className="h-[320px] bg-surface-base/50 border border-edge/50 rounded-2xl flex flex-col items-center justify-center animate-pulse">
        <div className="w-12 h-12 rounded-full bg-surface mb-3"></div>
        <div className="h-4 w-32 bg-surface rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-surface-base border border-edge rounded-2xl overflow-hidden shadow-sm flex flex-col h-full min-h-[350px]">
      {/* Header Area */}
      <div className="p-4 sm:p-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-content-primary flex items-center gap-2">
            {displayTitle}
          </h3>
          
          {/* Period Selector - Segmented Control */}
          <div className="flex bg-surface rounded-lg p-1 border border-edge">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`
                  px-3 py-1 text-[10px] font-bold rounded-md transition-all duration-200
                  ${period === p.value
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-content-muted hover:text-content-secondary hover:bg-surface-elevated/50'}
                `}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Segmented Control for Metrics */}
        <div className="flex p-1 bg-surface/50 rounded-xl border border-edge-subtle mb-6">
          {(Object.keys(METRIC_CONFIG) as Metric[]).map((metric) => {
            const isActive = activeMetric === metric;
            const mConfig = METRIC_CONFIG[metric];
            return (
              <button
                key={metric}
                onClick={() => setActiveMetric(metric)}
                className={`
                  flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-300 relative overflow-hidden
                  ${isActive ? 'text-content-primary shadow-sm' : 'text-content-muted hover:text-content-secondary'}
                `}
              >
                {/* Background active indicator */}
                {isActive && (
                  <div className="absolute inset-0 bg-surface-elevated rounded-lg animate-in fade-in zoom-in-95 duration-200"></div>
                )}
                
                {/* Content */}
                <span className="relative z-10 flex items-center justify-center gap-2">
                   {t(mConfig.labelKey)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Current Stats Hero - Mobile First Layout */}
        <div className="flex items-baseline justify-between mb-2 px-1">
           <div>
              <p className="text-sm text-content-muted mb-1">{t('volumePortefeuille')}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-content-primary tracking-tight">
                  {formatValue(latestValue)}
                </span>
                <span className="text-sm font-medium text-content-muted">FCFA</span>
              </div>
           </div>

           {/* Trend Badge */}
           <div className={`
             flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-bold
             ${trend >= 0 
               ? 'bg-status-success-bg border-status-success/20 text-status-success' 
               : 'bg-status-danger-bg border-status-danger/20 text-status-danger'}
           `}>
             {trend >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
             <span>{trend >= 0 ? '+' : ''}{trendPercent.toFixed(1)}%</span>
           </div>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full relative" style={{ height: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
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
              opacity={0.4}
            />
            <XAxis
              dataKey="date"
              stroke="var(--text-muted)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
              tickMargin={10}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={11}
              tickFormatter={(value) => {
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                return value;
              }}
              tickLine={false}
              axisLine={false}
              domain={[minValue, maxValue]}
              width={60}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: config.color, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey={activeMetric}
              stroke={config.color}
              strokeWidth={3}
              fill={`url(#gradient-${activeMetric})`}
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
