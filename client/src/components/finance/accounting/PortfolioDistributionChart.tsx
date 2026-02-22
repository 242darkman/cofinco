
import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

interface DistributionItem {
  name: string;
  value: number;
  color: string;
}

interface PortfolioDistributionChartProps {
  data: DistributionItem[];
  height?: number;
}

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 5}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={4}
      />
    </g>
  );
};

export default function PortfolioDistributionChart({
  data,
  height = 350
}: PortfolioDistributionChartProps) {
  const { t } = useLanguage();
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const activeItem = activeIndex !== undefined ? data[activeIndex] : null;

  // Punchline: identify dominant segment
  const punchline = useMemo(() => {
    if (!data.length) return null;
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const top = sorted[0];
    if (!top || top.value === 0) return null;

    // All equal
    if (sorted.length > 1 && sorted.every(s => s.value === sorted[0].value)) {
      return `Répartition équilibrée — ${sorted.length} produits à ${top.value}%`;
    }
    // Dominant
    const second = sorted[1];
    if (second && top.value - second.value <= 5) {
      return `${top.name} et ${second.name} dominent le portefeuille`;
    }
    return `${top.name} domine à ${top.value}% du portefeuille`;
  }, [data]);

  return (
    <div className="bg-surface-base border border-edge rounded-2xl overflow-hidden shadow-sm flex flex-col h-full">
      {/* Header compact */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-content-primary">
            {t('repartitionPortefeuille') || 'Répartition Portefeuille'}
          </h3>
          <TrendingUp size={14} className="text-content-muted" />
        </div>
        <p className="text-[10px] text-content-muted mt-0.5">
          {t('vueDensembleComptes') || "Vue d'ensemble par produit"}
        </p>
      </div>

      {/* Chart + Legend flex layout */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 pb-3 min-h-0">
        {/* Donut */}
        <div className="w-full relative" style={{ height: Math.min(180, height * 0.5) }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                activeIndex={activeIndex}
                activeShape={renderActiveShape}
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="75%"
                paddingAngle={3}
                dataKey="value"
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(undefined)}
                cornerRadius={4}
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-xl font-bold text-content-primary tabular-nums leading-none">
              {activeItem ? `${activeItem.value}%` : '100%'}
            </div>
            <div className="text-[9px] text-content-muted uppercase tracking-widest font-medium mt-1">
              {activeItem ? activeItem.name : (t('global') || 'GLOBAL')}
            </div>
          </div>
        </div>

        {/* Punchline */}
        {punchline && (
          <p className="text-[10px] text-content-muted font-medium text-center mt-1 mb-2 px-2 leading-tight">
            {punchline}
          </p>
        )}

        {/* Legend — compact horizontal bars */}
        <div className="w-full space-y-1.5 mt-auto">
          {data.map((item, index) => {
            const dimmed = activeIndex !== undefined && activeIndex !== index;
            return (
              <div
                key={item.name}
                className={`flex items-center gap-2 transition-opacity duration-150 cursor-default ${dimmed ? 'opacity-30' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(undefined)}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-[11px] text-content-secondary font-medium flex-1 truncate">{item.name}</span>
                {/* Mini bar */}
                <div className="w-16 h-1.5 bg-surface-elevated rounded-full overflow-hidden shrink-0">
                  <div className="h-full rounded-full" style={{ width: `${item.value}%`, backgroundColor: item.color }} />
                </div>
                <span className="text-[11px] font-bold text-content-primary tabular-nums w-8 text-right">{item.value}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
