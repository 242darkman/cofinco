import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Calendar, Activity, RefreshCw, Info } from 'lucide-react';
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

// Short labels for compact cards (avoid truncation)
const METRIC_SHORT_LABELS: Record<string, string> = {
  nouveauxClients: 'Nouv. Clients',
  nouveauxCredits: 'Nouv. Crédits',
  montantCredits: 'Vol. Crédits',
  montantDepots: 'Dépôts',
  montantRetraits: 'Retraits',
};

const METRIC_IS_MONEY: Record<string, boolean> = {
  montantCredits: true,
  montantDepots: true,
  montantRetraits: true,
};

// Map forecast metric → comparative variations key
const FORECAST_COMP_KEY: Record<string, string> = {
  clients: 'nouveauxClients',
  credits: 'montantCredits',
  deposits: 'montantDepots',
};

// ============================================
// COMPONENT
// ============================================

export default function ComparativeAnalytics({ agenceId }: { agenceId?: string }) {
  const { t, language } = useLanguage();
  const [preset, setPreset] = useState<PresetPeriod>('month');
  const [forecastMetric, setForecastMetric] = useState<'clients' | 'credits' | 'deposits'>('clients');
  const dates = useMemo(() => getPresetDates(preset), [preset]);
  const locale = language === 'en' ? 'en-US' : 'fr-FR';

  // Comparative data
  const { data: comparative, isLoading: compLoading } = useQuery<ComparativeData>({
    queryKey: ['comparative-analytics', dates, agenceId],
    queryFn: async () => {
      const params = new URLSearchParams(dates);
      if (agenceId && agenceId !== 'all') params.set('agenceId', agenceId);
      const res = await fetch(`/api/dashboard/comparative?${params}`);
      if (!res.ok) throw new Error(t('erreurChargement'));
      return res.json();
    },
    retry: 2,
    retryDelay: 1000,
  });

  // Forecast data
  const { data: forecast, isLoading: forecastLoading } = useQuery<ForecastData>({
    queryKey: ['forecast-analytics', agenceId],
    queryFn: async () => {
      const params = new URLSearchParams({ months: '6' });
      if (agenceId && agenceId !== 'all') params.set('agenceId', agenceId);
      const res = await fetch(`/api/dashboard/forecast?${params}`);
      if (!res.ok) throw new Error(t('erreurChargement'));
      return res.json();
    },
    staleTime: 300_000, // 5 min
    retry: 2,
    retryDelay: 1000,
  });

  // Build chart data for forecast (bridge historical→forecast for visual continuity)
  const forecastChartData = useMemo(() => {
    if (!forecast) return [];
    const historical = forecast.historical[forecastMetric] || [];
    const projected = forecast.forecast[forecastMetric] || [];

    const histData = historical.map(d => ({
      month: formatMonth(d.month, locale),
      value: Number(d.value),
      forecast: null as number | null,
    }));

    // Bridge: duplicate last historical value as forecast start so lines connect
    if (histData.length > 0 && projected.length > 0) {
      histData[histData.length - 1].forecast = histData[histData.length - 1].value;
    }

    const projData = projected.map(d => ({
      month: formatMonth(d.month, locale),
      value: null as number | null,
      forecast: Number(d.value),
    }));

    return [...histData, ...projData];
  }, [forecast, forecastMetric, locale]);

  // Dynamic punchline combining comparative trend + forecast projection
  const forecastInsight = useMemo(() => {
    if (!forecast) return null;
    const historical = forecast.historical[forecastMetric] || [];
    const projected = forecast.forecast[forecastMetric] || [];
    const isMoney = forecastMetric !== 'clients';
    const fmt = (v: number) => isMoney ? formatMoney(v) : v.toLocaleString(locale);

    // Not enough data for regression
    if (historical.length < 2) {
      return {
        text: historical.length === 0
          ? 'Aucune donnée historique disponible'
          : '1 mois d\'historique — min. 2 requis pour projeter',
        type: 'neutral' as const,
      };
    }

    const parts: string[] = [];

    // Part 1: Comparative context (changes with period selector)
    const compKey = FORECAST_COMP_KEY[forecastMetric];
    const compVar = comparative?.variations?.[compKey];
    if (compVar) {
      const pct = compVar.changePercent;
      const pl = preset === 'month' ? 'ce mois' : preset === 'quarter' ? 'ce trimestre' : 'cette année';
      parts.push(`${pct >= 0 ? '+' : ''}${pct}% ${pl}`);
    }

    // Part 2: Forecast endpoint
    if (projected.length > 0) {
      const lastForecast = Number(projected[projected.length - 1].value);
      parts.push(`tendance vers ${fmt(lastForecast)}/mois à ${projected.length} mois`);
    }

    const isPositive = (compVar?.changePercent ?? 0) >= 0;
    return {
      text: parts.join(' — '),
      type: isPositive ? 'positive' as const : 'negative' as const,
    };
  }, [forecast, forecastMetric, comparative, preset, locale]);

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar size={12} className="text-content-muted" />
        <span className="text-[11px] text-content-muted font-medium">{t('comparerLabel')}</span>
        <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5">
          {(['month', 'quarter', 'year'] as PresetPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                preset === p
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {p === 'month' ? t('moisPeriode') : p === 'quarter' ? t('trimestrePeriode') : t('anneePeriode')}
            </button>
          ))}
        </div>
      </div>

      {/* Comparative Cards */}
      {compLoading ? (
        <div className="flex items-center justify-center py-8 text-content-muted text-xs">
          <RefreshCw className="animate-spin mr-2" size={14} />
          {t('chargement')}
        </div>
      ) : comparative ? (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {Object.entries(comparative.variations).map(([key, v]) => {
            const isUp = v.change >= 0;
            const isMoney = METRIC_IS_MONEY[key];
            const isPositive = key === 'montantRetraits' ? !isUp : isUp;
            return (
              <div key={key} className="bg-surface/80 border border-edge rounded-lg px-2.5 py-2">
                <p className="text-[9px] text-content-muted uppercase tracking-wide font-semibold leading-tight mb-1">{METRIC_SHORT_LABELS[key] || t(METRIC_LABEL_KEYS[key] || key)}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold text-content-primary font-mono leading-none">
                    {isMoney ? formatMoney(v.periodB) : v.periodB.toLocaleString(locale)}
                  </span>
                  <span className={`text-[9px] font-bold flex items-center gap-0.5 ${isPositive ? 'text-status-success' : 'text-status-danger'}`}>
                    {isUp ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                    {v.changePercent > 0 ? '+' : ''}{v.changePercent}%
                  </span>
                </div>
                <p className="text-[8px] text-content-muted mt-0.5">
                  vs {isMoney ? formatMoney(v.periodA) : v.periodA.toLocaleString(locale)}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Forecast Chart */}
      <div className="bg-surface/80 border border-edge rounded-lg px-3 py-2.5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Activity size={13} className="text-accent" />
            <h4 className="text-[11px] font-bold text-content-primary uppercase tracking-wide">{t('previsionsNMois')}</h4>
          </div>
          <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5">
            {(['clients', 'credits', 'deposits'] as const).map(m => (
              <button
                key={m}
                onClick={() => setForecastMetric(m)}
                className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                  forecastMetric === m
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-content-muted hover:text-content-secondary'
                }`}
              >
                {m === 'clients' ? t('clientsMetrique') : m === 'credits' ? t('creditsMetrique') : t('depotsMetrique')}
              </button>
            ))}
          </div>
        </div>
        {/* Dynamic punchline */}
        {forecastInsight && (
          <div className={`flex items-center gap-1.5 mb-2 text-[10px] font-medium ${
            forecastInsight.type === 'positive' ? 'text-status-success' :
            forecastInsight.type === 'negative' ? 'text-status-danger' :
            'text-content-muted'
          }`}>
            {forecastInsight.type === 'positive' ? <TrendingUp size={10} /> :
             forecastInsight.type === 'negative' ? <TrendingDown size={10} /> :
             <Info size={10} />}
            <span>{forecastInsight.text}</span>
          </div>
        )}

        {forecastLoading ? (
          <div className="flex items-center justify-center py-12 text-content-muted text-xs">
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis
                dataKey="month"
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={{ stroke: 'var(--border-default)' }}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={{ stroke: 'var(--border-default)' }}
                tickFormatter={(v) => forecastMetric === 'clients' ? v : formatMoney(v)}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '11px' }}
                labelStyle={{ color: 'var(--text-muted)' }}
                formatter={(val, name) => [
                  forecastMetric === 'clients' ? Number(val).toLocaleString(locale) : formatMoney(Number(val)),
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
                formatter={(value) => <span className="text-content-muted">{value}</span>}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-content-muted text-xs">
            {t('donneesInsuffisantesPrevision')}
          </div>
        )}
      </div>
    </div>
  );
}
