import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, ArrowRight, Calendar, BarChart2, Activity, RefreshCw } from 'lucide-react';
import { Card, Button, Badge } from '../ui';
import { useLanguage } from '../../contexts/LanguageContext';

// ============================================
// TYPES
// ============================================

interface PeriodMetrics {
  nouveauxClients: number;
  nouveauxCredits: number;
  montantCredits: number;
  montantDepots: number;
  montantRetraits: number;
}

interface ComparativeData {
  periodA: { start: string; end: string; metrics: PeriodMetrics };
  periodB: { start: string; end: string; metrics: PeriodMetrics };
  variations: Record<string, { periodA: number; periodB: number; change: number; changePercent: number }>;
}

interface ForecastData {
  historical: {
    clients: Array<{ month: string; value: number }>;
    credits: Array<{ month: string; value: number }>;
    deposits: Array<{ month: string; value: number }>;
  };
  forecast: {
    clients: Array<{ month: string; value: number; isForecasted: boolean }>;
    credits: Array<{ month: string; value: number; isForecasted: boolean }>;
    deposits: Array<{ month: string; value: number; isForecasted: boolean }>;
  };
}

// ============================================
// HELPERS
// ============================================

const formatMoney = (val: number) => val >= 1_000_000
  ? `${(val / 1_000_000).toFixed(1)}M`
  : val >= 1000
    ? `${(val / 1000).toFixed(0)}K`
    : val.toString();

const formatMonth = (month: string, locale: string = 'fr-FR') => {
  try {
    const date = new Date(month + '-01');
    return date.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
  } catch {
    return month;
  }
};

type PresetPeriod = 'month' | 'quarter' | 'year';

function getPresetDates(preset: PresetPeriod): { periodA_start: string; periodA_end: string; periodB_start: string; periodB_end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (preset === 'month') {
    // Current month vs previous month
    const pBStart = new Date(year, month, 1);
    const pBEnd = now;
    const pAStart = new Date(year, month - 1, 1);
    const pAEnd = new Date(year, month, 0); // Last day of previous month
    return {
      periodA_start: pAStart.toISOString().slice(0, 10),
      periodA_end: pAEnd.toISOString().slice(0, 10),
      periodB_start: pBStart.toISOString().slice(0, 10),
      periodB_end: pBEnd.toISOString().slice(0, 10),
    };
  }
  if (preset === 'quarter') {
    const currentQStart = new Date(year, Math.floor(month / 3) * 3, 1);
    const prevQStart = new Date(year, Math.floor(month / 3) * 3 - 3, 1);
    const prevQEnd = new Date(currentQStart.getTime() - 86400000);
    return {
      periodA_start: prevQStart.toISOString().slice(0, 10),
      periodA_end: prevQEnd.toISOString().slice(0, 10),
      periodB_start: currentQStart.toISOString().slice(0, 10),
      periodB_end: now.toISOString().slice(0, 10),
    };
  }
  // Year
  const pBStart = new Date(year, 0, 1);
  const pAStart = new Date(year - 1, 0, 1);
  const pAEnd = new Date(year - 1, 11, 31);
  return {
    periodA_start: pAStart.toISOString().slice(0, 10),
    periodA_end: pAEnd.toISOString().slice(0, 10),
    periodB_start: pBStart.toISOString().slice(0, 10),
    periodB_end: now.toISOString().slice(0, 10),
  };
}

const METRIC_LABEL_KEYS: Record<string, string> = {
  nouveauxClients: 'nouveauxClients',
  nouveauxCredits: 'nouveauxCredits',
  montantCredits: 'montantCreditsLabel',
  montantDepots: 'depotsMetrique',
  montantRetraits: 'retraitsMetrique',
};

const METRIC_IS_MONEY: Record<string, boolean> = {
  montantCredits: true,
  montantDepots: true,
  montantRetraits: true,
};

// ============================================
// COMPONENT
// ============================================

export default function ComparativeAnalytics() {
  const { t, language } = useLanguage();
  const [preset, setPreset] = useState<PresetPeriod>('month');
  const [forecastMetric, setForecastMetric] = useState<'clients' | 'credits' | 'deposits'>('clients');
  const dates = useMemo(() => getPresetDates(preset), [preset]);
  const locale = language === 'en' ? 'en-US' : 'fr-FR';

  // Comparative data
  const { data: comparative, isLoading: compLoading } = useQuery<ComparativeData>({
    queryKey: ['comparative-analytics', dates],
    queryFn: async () => {
      const params = new URLSearchParams(dates);
      const res = await fetch(`/api/dashboard/comparative?${params}`);
      if (!res.ok) throw new Error(t('erreurChargement'));
      return res.json();
    },
    retry: 2,
    retryDelay: 1000,
  });

  // Forecast data
  const { data: forecast, isLoading: forecastLoading } = useQuery<ForecastData>({
    queryKey: ['forecast-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/forecast?months=6');
      if (!res.ok) throw new Error(t('erreurChargement'));
      return res.json();
    },
    staleTime: 300_000, // 5 min
    retry: 2,
    retryDelay: 1000,
  });

  // Build chart data for forecast
  const forecastChartData = useMemo(() => {
    if (!forecast) return [];
    const historical = forecast.historical[forecastMetric] || [];
    const projected = forecast.forecast[forecastMetric] || [];

    return [
      ...historical.map(d => ({
        month: formatMonth(d.month, locale),
        value: Number(d.value),
        forecast: null as number | null,
      })),
      ...projected.map(d => ({
        month: formatMonth(d.month, locale),
        value: null as number | null,
        forecast: d.value,
      })),
    ];
  }, [forecast, forecastMetric, locale]);

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar size={14} className="text-slate-400" />
        <span className="text-xs text-slate-400">{t('comparerLabel')}</span>
        {(['month', 'quarter', 'year'] as PresetPeriod[]).map(p => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              preset === p
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
            }`}
          >
            {p === 'month' ? t('moisPeriode') : p === 'quarter' ? t('trimestrePeriode') : t('anneePeriode')}
          </button>
        ))}
      </div>

      {/* Comparative Cards */}
      {compLoading ? (
        <div className="flex items-center justify-center py-8 text-slate-500 text-xs">
          <RefreshCw className="animate-spin mr-2" size={14} />
          {t('chargement')}
        </div>
      ) : comparative ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(comparative.variations).map(([key, v]) => {
            const isUp = v.change >= 0;
            const isMoney = METRIC_IS_MONEY[key];
            // For withdrawals, up = bad
            const isPositive = key === 'montantRetraits' ? !isUp : isUp;
            return (
              <Card key={key} padding="sm" className="bg-slate-800/80 border-slate-700">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide truncate">{t(METRIC_LABEL_KEYS[key] || key)}</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-lg font-bold text-white font-mono">
                    {isMoney ? formatMoney(v.periodB) : v.periodB.toLocaleString(locale)}
                  </span>
                  <span className={`text-[10px] font-bold flex items-center gap-0.5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {v.changePercent > 0 ? '+' : ''}{v.changePercent}%
                  </span>
                </div>
                <p className="text-[9px] text-slate-600 mt-0.5">
                  {t('vsPrecedent')} {isMoney ? formatMoney(v.periodA) : v.periodA.toLocaleString(locale)}
                </p>
              </Card>
            );
          })}
        </div>
      ) : null}

      {/* Forecast Chart */}
      <Card padding="sm" className="bg-slate-800/80 border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-cyan-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wide">{t('previsionsNMois')}</h4>
          </div>
          <div className="flex gap-1">
            {(['clients', 'credits', 'deposits'] as const).map(m => (
              <button
                key={m}
                onClick={() => setForecastMetric(m)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  forecastMetric === m
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {m === 'clients' ? t('clientsMetrique') : m === 'credits' ? t('creditsMetrique') : t('depotsMetrique')}
              </button>
            ))}
          </div>
        </div>

        {forecastLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-500 text-xs">
            <RefreshCw className="animate-spin mr-2" size={14} />
            {t('chargement')}
          </div>
        ) : forecastChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={forecastChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="month"
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={{ stroke: '#334155' }}
                tickFormatter={(v) => forecastMetric === 'clients' ? v : formatMoney(v)}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(val: number, name: string) => [
                  forecastMetric === 'clients' ? val.toLocaleString(locale) : formatMoney(val),
                  name === 'value' ? t('reelLabel') : t('previsionLabel')
                ]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#06b6d4"
                fill="url(#colorActual)"
                strokeWidth={2}
                connectNulls={false}
                name={t('reelLabel')}
              />
              <Area
                type="monotone"
                dataKey="forecast"
                stroke="#a78bfa"
                fill="url(#colorForecast)"
                strokeWidth={2}
                strokeDasharray="5 5"
                connectNulls={false}
                name={t('previsionLabel')}
              />
              <Legend
                wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                formatter={(value) => <span className="text-slate-400">{value}</span>}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-slate-500 text-xs">
            {t('donneesInsuffisantesPrevision')}
          </div>
        )}
      </Card>
    </div>
  );
}
