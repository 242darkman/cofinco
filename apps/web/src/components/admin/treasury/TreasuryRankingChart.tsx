import React, { Suspense } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChartSkeleton } from '../../ui/LazyChart';
import { formatCurrency, getAgencyColor, RANKING_TOP_N } from './treasury-helpers';
import type { RankingEntry } from './treasury-helpers';
import { currencySymbol } from '@shared/config/currency';

interface Props {
  ranking: RankingEntry[];
  selectedAgencies: string[];
  onToggleAgency: (id: string) => void;
}

// Neutral gray palette for unselected bars (dark → lighter by rank)
const BAR_COLORS = ['var(--text-secondary)', 'var(--text-muted)'];

function RankingTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as RankingEntry;
  const sign = d.delta >= 0 ? '+' : '';
  return (
    <div className="bg-card border border-edge rounded-lg shadow-xl p-3 min-w-[180px]">
      <p className="text-xs font-semibold text-content-primary mb-1.5">{d.agenceNom}</p>
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-content-muted">Solde</span>
          <span className="font-mono font-bold text-content-primary">{formatCurrency(d.solde)} {currencySymbol()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-content-muted">Part</span>
          <span className="font-medium text-content-primary">{d.share.toFixed(1)}%</span>
        </div>
        {d.delta !== 0 && (
          <div className="flex justify-between">
            <span className="text-content-muted">Variation</span>
            <span className={`font-medium ${d.delta >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
              {sign}{formatCurrency(d.delta)} ({sign}{d.deltaPercent.toFixed(1)}%)
            </span>
          </div>
        )}
        {d.ville && (
          <div className="flex justify-between">
            <span className="text-content-muted">Ville</span>
            <span className="text-content-secondary">{d.ville}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RankingChartInner({ ranking, selectedAgencies, onToggleAgency }: Props) {
  const data = ranking.slice(0, RANKING_TOP_N);

  if (data.length === 0) return null;

  return (
    <div className="w-full flex-1" style={{ minHeight: Math.max(300, data.length * 45 + 20) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => {
              if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(0)}G`;
              if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
              if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
              return v.toString();
            }}
          />
          <YAxis
            type="category"
            dataKey="agenceNom"
            width={100}
            tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<RankingTooltip />} cursor={{ fill: 'var(--color-surface-subtle)', opacity: 0.5 }} />
          <Bar
            dataKey="solde"
            radius={[0, 4, 4, 0]}
            barSize={40}
            cursor="pointer"
            onClick={(entry: any) => {
              if (entry?.agenceId) onToggleAgency(entry.agenceId);
            }}
          >
            {data.map((entry, index) => {
              const isSelected = selectedAgencies.includes(entry.agenceId);
              return (
                <Cell
                  key={entry.agenceId}
                  fill={isSelected ? getAgencyColor(entry.agenceId) : BAR_COLORS[index === 0 ? 0 : 1]}
                  opacity={isSelected ? 1 : 0.85}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function TreasuryRankingChart(props: Props) {
  return (
    <Suspense fallback={<ChartSkeleton height={350} />}>
      <RankingChartInner {...props} />
    </Suspense>
  );
}
