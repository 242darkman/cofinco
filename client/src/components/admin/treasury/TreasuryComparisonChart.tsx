import React, { useState, useMemo, useCallback, Suspense } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { ChartSkeleton } from '../../ui/LazyChart';
import { cn } from '@/lib/utils';
import { currencySymbol } from '@shared/config/currency';
import {
  type Period,
  type HistoryPoint,
  PERIOD_OPTIONS,
  PRIMARY_CHART_COLOR,
  getAgencyColor,
  formatCurrency,
  formatTooltipDate,
  formatAxisDate,
} from './treasury-helpers';

// ============================================================================
// Types
// ============================================================================

type ComparisonMode = 'absolute' | 'variation' | 'index100';

interface Props {
  chartData: HistoryPoint[] | undefined;
  selectedAgencies: string[];
  agencyMap: Record<string, string>; // agenceId -> agenceNom
  period: Period;
  isLoading: boolean;
  allAgenciesHistory?: HistoryPoint[]; // for benchmark average calculation
}

const MODE_OPTIONS: { value: ComparisonMode; label: string }[] = [
  { value: 'absolute', label: 'FCFA' },
  { value: 'variation', label: 'Var %' },
  { value: 'index100', label: 'Base 100' },
];

const BENCHMARK_KEY = '__avg__';
const BENCHMARK_COLOR = '#9ca3af'; // neutral gray for dashed benchmark line

// ============================================================================
// Data transformation
// ============================================================================

/**
 * Transform raw history data according to the selected comparison mode.
 * Each agency key and the global `balance` key are transformed independently.
 */
function transformData(
  data: HistoryPoint[],
  keys: string[],
  mode: ComparisonMode,
): HistoryPoint[] {
  if (mode === 'absolute' || data.length === 0) return data;

  // Get base values (first data point for each key)
  const baseValues: Record<string, number> = {};
  for (const key of keys) {
    const raw = data[0][key];
    baseValues[key] = typeof raw === 'number' ? raw : 0;
  }

  return data.map((point) => {
    const transformed: HistoryPoint = { date: point.date, balance: 0 };

    for (const key of keys) {
      const raw = point[key];
      const val = typeof raw === 'number' ? raw : 0;
      const base = baseValues[key];

      if (mode === 'variation') {
        transformed[key] = base !== 0 ? ((val - base) / Math.abs(base)) * 100 : 0;
      } else {
        // index100
        transformed[key] = base !== 0 ? (val / Math.abs(base)) * 100 : 100;
      }
    }

    return transformed;
  });
}

/**
 * Compute the benchmark average line from all-agencies history.
 * Returns the original data augmented with a `__avg__` key.
 */
function addBenchmarkAverage(
  data: HistoryPoint[],
  allHistory: HistoryPoint[] | undefined,
  agencyKeys: string[],
): HistoryPoint[] {
  if (!allHistory || allHistory.length === 0) return data;

  // Build a map date -> average across all agencies in allHistory
  // allHistory may have individual agency keys or just `balance` (global)
  const avgByDate: Record<string, number> = {};

  for (const point of allHistory) {
    // Collect all numeric values that are agency-level (not `date` or `balance`)
    const agencyValues = Object.entries(point)
      .filter(([k]) => k !== 'date' && k !== 'balance')
      .map(([, v]) => (typeof v === 'number' ? v : 0));

    if (agencyValues.length > 0) {
      avgByDate[point.date] = agencyValues.reduce((s, v) => s + v, 0) / agencyValues.length;
    } else if (typeof point.balance === 'number') {
      // Fallback: use global balance as proxy
      avgByDate[point.date] = point.balance;
    }
  }

  return data.map((point) => ({
    ...point,
    [BENCHMARK_KEY]: avgByDate[point.date] ?? 0,
  }));
}

// ============================================================================
// Y-axis formatter
// ============================================================================

function formatYAxis(v: number, mode: ComparisonMode): string {
  if (mode === 'variation') return `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;
  if (mode === 'index100') return v.toFixed(0);
  // absolute
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(0)}G`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}

// ============================================================================
// Custom tooltip
// ============================================================================

interface ComparisonTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  agencyMap: Record<string, string>;
  period: Period;
  mode: ComparisonMode;
}

function ComparisonTooltip({ active, payload, label, agencyMap, period, mode }: ComparisonTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  // Sort by descending value for instantaneous ranking
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const formatValue = (val: number, dataKey: string) => {
    if (mode === 'variation') return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
    if (mode === 'index100') return val.toFixed(1);
    return `${formatCurrency(val)} ${currencySymbol()}`;
  };

  return (
    <div className="bg-card border border-edge rounded-xl shadow-xl p-4 min-w-[200px] backdrop-blur-sm bg-card/95">
      <p className="text-sm font-semibold mb-3 border-b border-edge pb-2 text-content-primary">
        {formatTooltipDate(label!, period)}
      </p>
      <div className="space-y-2">
        {sorted.map((entry, idx) => {
          const isBenchmark = entry.dataKey === BENCHMARK_KEY;
          const name = isBenchmark
            ? 'Moyenne'
            : agencyMap[entry.dataKey] || entry.name || entry.dataKey;
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {sorted.length > 1 && !isBenchmark && (
                  <span className="text-[9px] font-bold text-content-muted w-3 text-right">
                    {idx + 1}.
                  </span>
                )}
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: entry.color || entry.stroke,
                    ...(isBenchmark ? { border: '1px dashed #6b7280' } : {}),
                  }}
                />
                <span className="text-xs font-medium text-content-muted whitespace-nowrap">
                  {name}
                </span>
              </div>
              <span className="text-sm font-bold font-mono text-content-primary">
                {formatValue(entry.value, entry.dataKey)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Single-agency AreaChart (same style as current)
// ============================================================================

function SingleAreaChart({
  data,
  period,
  agencyMap,
  agencyId,
}: {
  data: HistoryPoint[];
  period: Period;
  agencyMap: Record<string, string>;
  agencyId?: string;
}) {
  const dataKey = agencyId || 'balance';
  const color = agencyId ? getAgencyColor(agencyId) : PRIMARY_CHART_COLOR;
  const name = agencyId ? (agencyMap[agencyId] || 'Agence') : 'Flux Global';
  const gradId = `grad-single-${dataKey}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatAxisDate(v, period)}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
          width={50}
          tickFormatter={(v) => formatYAxis(v, 'absolute')}
          domain={['auto', 'auto']}
        />
        <Tooltip
          content={
            <ComparisonTooltip
              period={period}
              agencyMap={agencyMap}
              mode="absolute"
            />
          }
        />
        <Legend
          wrapperStyle={{ paddingTop: 8, fontSize: '11px' }}
          iconSize={8}
          iconType="circle"
          formatter={(value: string) => (
            <span className="text-xs text-content-muted ml-0.5">{value}</span>
          )}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          fillOpacity={1}
          fill={`url(#${gradId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Multi-agency LineChart (comparison mode)
// ============================================================================

function MultiLineChart({
  data,
  agencies,
  agencyMap,
  period,
  mode,
  showBenchmark,
  hiddenKeys,
  onToggleLegend,
}: {
  data: HistoryPoint[];
  agencies: string[];
  agencyMap: Record<string, string>;
  period: Period;
  mode: ComparisonMode;
  showBenchmark: boolean;
  hiddenKeys: Set<string>;
  onToggleLegend: (key: string) => void;
}) {
  // Reference line at 0 for variation mode, 100 for index100
  const referenceValue = mode === 'variation' ? 0 : mode === 'index100' ? 100 : undefined;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatAxisDate(v, period)}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
          width={50}
          tickFormatter={(v) => formatYAxis(v, mode)}
          domain={['auto', 'auto']}
        />
        <Tooltip
          content={
            <ComparisonTooltip
              period={period}
              agencyMap={agencyMap}
              mode={mode}
            />
          }
        />
        <Legend
          wrapperStyle={{ paddingTop: 8, fontSize: '11px' }}
          iconSize={8}
          iconType="circle"
          onClick={(e: any) => {
            if (e?.dataKey) onToggleLegend(e.dataKey);
          }}
          formatter={(value: string, entry: any) => {
            const isHidden = hiddenKeys.has(entry.dataKey);
            return (
              <span
                className={cn(
                  'text-xs ml-0.5 cursor-pointer select-none',
                  isHidden ? 'text-content-muted line-through opacity-50' : 'text-content-muted',
                )}
              >
                {value}
              </span>
            );
          }}
        />

        {/* Reference line for non-absolute modes */}
        {referenceValue !== undefined && (
          <Line
            type="monotone"
            dataKey={() => referenceValue}
            stroke="var(--border-default)"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            legendType="none"
            isAnimationActive={false}
          />
        )}

        {/* Agency lines */}
        {agencies.map((id) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            name={agencyMap[id] || id}
            stroke={getAgencyColor(id)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            hide={hiddenKeys.has(id)}
            connectNulls
          />
        ))}

        {/* Benchmark average line */}
        {showBenchmark && (
          <Line
            type="monotone"
            dataKey={BENCHMARK_KEY}
            name="Moyenne"
            stroke={BENCHMARK_COLOR}
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            activeDot={{ r: 2, strokeWidth: 0 }}
            hide={hiddenKeys.has(BENCHMARK_KEY)}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Main exported component
// ============================================================================

function TreasuryComparisonChartInner({
  chartData,
  selectedAgencies,
  agencyMap,
  period,
  isLoading,
  allAgenciesHistory,
}: Props) {
  const [mode, setMode] = useState<ComparisonMode>('absolute');
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const isComparison = selectedAgencies.length >= 2;

  const toggleLegend = useCallback((key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Determine which data keys are present
  const dataKeys = useMemo(() => {
    if (!isComparison) return ['balance'];
    return selectedAgencies;
  }, [isComparison, selectedAgencies]);

  // Build the final chart data
  const processedData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];

    let working = [...chartData];

    // Add benchmark if needed
    if (isComparison && showBenchmark) {
      working = addBenchmarkAverage(working, allAgenciesHistory, selectedAgencies);
    }

    // Determine all keys to transform (agencies + benchmark if present)
    const allKeys = [
      ...dataKeys,
      ...(isComparison && showBenchmark ? [BENCHMARK_KEY] : []),
    ];

    // Transform data according to mode
    return transformData(working, allKeys, isComparison ? mode : 'absolute');
  }, [chartData, isComparison, showBenchmark, allAgenciesHistory, selectedAgencies, dataKeys, mode]);

  if (isLoading) return <ChartSkeleton height={350} />;

  return (
    <div>
      {/* Toolbar: mode pills + benchmark toggle (only in comparison mode) */}
      {isComparison && (
        <div className="flex items-center gap-3 mb-4">
          {/* Mode selector pills */}
          <div className="flex items-center bg-surface-subtle rounded-lg p-1">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={cn(
                  'px-3 py-1 rounded text-xs font-medium transition-all',
                  mode === opt.value
                    ? 'bg-surface shadow-sm text-accent'
                    : 'text-content-muted hover:text-content-secondary',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Benchmark toggle */}
          <button
            onClick={() => setShowBenchmark((v) => !v)}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium border transition-all',
              showBenchmark
                ? 'bg-surface-subtle-elevated border-accent text-accent'
                : 'border-edge text-content-muted hover:text-content-secondary hover:border-edge',
            )}
          >
            vs Moyenne
          </button>
        </div>
      )}

      {/* Chart area */}
      <div className="h-[350px] w-full">
        {processedData.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-xs text-content-muted">Aucune donnee disponible</span>
          </div>
        ) : isComparison ? (
          <MultiLineChart
            data={processedData}
            agencies={selectedAgencies}
            agencyMap={agencyMap}
            period={period}
            mode={mode}
            showBenchmark={showBenchmark}
            hiddenKeys={hiddenKeys}
            onToggleLegend={toggleLegend}
          />
        ) : (
          <SingleAreaChart
            data={processedData}
            period={period}
            agencyMap={agencyMap}
            agencyId={selectedAgencies.length === 1 ? selectedAgencies[0] : undefined}
          />
        )}
      </div>
    </div>
  );
}

export default function TreasuryComparisonChart(props: Props) {
  return (
    <Suspense fallback={<ChartSkeleton height={350} />}>
      <TreasuryComparisonChartInner {...props} />
    </Suspense>
  );
}
