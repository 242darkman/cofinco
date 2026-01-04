import React, { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useBalanceHistory } from '../../../hooks/dashboard/useBalanceHistory';

interface BalanceHistoryChartProps {
  title?: string;
  showLegend?: boolean;
  height?: number;
}

export default function BalanceHistoryChart({
  title,
  showLegend = true,
  height = 350
}: BalanceHistoryChartProps) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [activeMetric, setActiveMetric] = useState<'all' | 'solde' | 'credits' | 'epargnes'>('all');
  
  const { data: chartData, loading, error } = useBalanceHistory(period);
  
  const displayTitle = title || t('evolutionSoldes');

  // Get latest values for stats display
  const latestData = chartData.length > 0 ? chartData[chartData.length - 1] : null;

  const formatYAxis = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  const formatTooltip = (value: number) => {
    return new Intl.NumberFormat('fr-FR').format(value) + ' FCFA';
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
          <p className="text-slate-300 text-sm font-medium mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4 text-sm">
              <span style={{ color: entry.color }}>{entry.name}</span>
              <span className="font-semibold text-white">{formatTooltip(entry.value)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const periods = [
    { value: '7d', label: t('jours7') },
    { value: '30d', label: t('jours30') },
    { value: '90d', label: t('mois3') },
    { value: '1y', label: t('an1') }
  ];

  const metrics = [
    { value: 'all', label: t('tout') },
    { value: 'solde', label: t('solde'), color: '#10b981' },
    { value: 'credits', label: t('credits'), color: '#3b82f6' },
    { value: 'epargnes', label: t('epargnes'), color: '#8b5cf6' }
  ];
  const chartStyle = height ? { height } : undefined;
  const chartHeightClass = height ? '' : 'h-56 sm:h-72 lg:h-80';

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-emerald-400" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-4 sm:p-6 min-w-0 overflow-hidden" data-testid="balance-history-chart">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <TrendingUp className="text-emerald-400" size={20} />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-white">{displayTitle}</h3>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full lg:w-auto">
          <div className="flex flex-wrap bg-slate-700/50 rounded-lg p-1 w-full sm:w-auto">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value as any)}
                className={`px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  period === p.value
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                data-testid={`button-period-${p.value}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap bg-slate-700/50 rounded-lg p-1 w-full sm:w-auto">
            {metrics.map((m) => (
              <button
                key={m.value}
                onClick={() => setActiveMetric(m.value as any)}
                className={`px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  activeMetric === m.value
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                data-testid={`button-metric-${m.value}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={chartHeightClass} style={chartStyle}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradientSolde" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradientCredits" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradientEpargnes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis
            dataKey="date" 
            stroke="#64748b" 
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={14}
          />
          <YAxis 
            stroke="#64748b" 
            fontSize={11}
            tickFormatter={formatYAxis}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          
          {showLegend && (
            <Legend
              wrapperStyle={{ paddingTop: '16px' }}
              formatter={(value) => <span className="text-slate-300 text-xs sm:text-sm">{value}</span>}
            />
          )}

          {(activeMetric === 'all' || activeMetric === 'solde') && (
            <Area
              type="monotone"
              dataKey="solde"
              name={t('soldeTotal')}
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gradientSolde)"
              dot={false}
              activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2, fill: '#1e293b' }}
            />
          )}
          
          {(activeMetric === 'all' || activeMetric === 'credits') && (
            <Area
              type="monotone"
              dataKey="credits"
              name={t('credits')}
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#gradientCredits)"
              dot={false}
              activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2, fill: '#1e293b' }}
            />
          )}
          
          {(activeMetric === 'all' || activeMetric === 'epargnes') && (
            <Area
              type="monotone"
              dataKey="epargnes"
              name={t('epargnes')}
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#gradientEpargnes)"
              dot={false}
              activeDot={{ r: 6, stroke: '#8b5cf6', strokeWidth: 2, fill: '#1e293b' }}
            />
          )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats Footer - Inline on mobile, grid on larger screens */}
      <div className="flex flex-row justify-around sm:grid sm:grid-cols-3 gap-2 sm:gap-3 mt-4 sm:mt-6 pt-4 border-t border-slate-700 text-center">
        <div className="flex flex-col items-center">
          <p className="text-slate-400 text-[10px] sm:text-xs">{t('soldeActuel')}</p>
          <p className="text-emerald-400 font-bold text-xs sm:text-base">{formatYAxis(latestData?.solde || 0)}</p>
        </div>
        <div className="flex flex-col items-center">
          <p className="text-slate-400 text-[10px] sm:text-xs">{t('credits')}</p>
          <p className="text-blue-400 font-bold text-xs sm:text-base">{formatYAxis(latestData?.credits || 0)}</p>
        </div>
        <div className="flex flex-col items-center">
          <p className="text-slate-400 text-[10px] sm:text-xs">{t('epargnes')}</p>
          <p className="text-purple-400 font-bold text-xs sm:text-base">{formatYAxis(latestData?.epargnes || 0)}</p>
        </div>
      </div>
    </div>
  );
}
