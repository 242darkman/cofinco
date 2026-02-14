import React, { useState, useEffect, useId } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { currencyCode } from '@shared/config/currency';

interface StatPoint {
  date: string;
  balance: number;
  credit?: number;
  debit?: number;
}

interface StatsResponse {
  period: string;
  currency: string;
  trend: 'positive' | 'negative' | 'neutral';
  dataPoints: StatPoint[];
}

interface AccountStatsChartProps {
  compteId: string;
  filter?: 'ALL' | 'CREDIT' | 'DEBIT'; // Added filter prop
}

const PERIODS = [
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1A', value: '1Y' },
];

export default function AccountStatsChart({ compteId, filter = 'ALL' }: AccountStatsChartProps) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [period, setPeriod] = useState<string>('1M');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gradientId = `colorBalance-${compteId}`; // Simple unique ID based on prop

  useEffect(() => {
    fetchStats();
  }, [compteId, period]);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/comptes/${compteId}/stats?period=${period}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement statistiques');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError('Impossible de charger le graphique');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currencyCode(),
      maximumFractionDigits: 0,
    }).format(val);
  };

  const getChartConfig = () => {
    switch (filter) {
      case 'CREDIT':
        return { 
          title: 'Volume des Dépôts', 
          color: 'var(--color-success)',
          dataKey: 'credit',
          Type: BarChart,
          Element: Bar
        };
      case 'DEBIT':
        return { 
          title: 'Volume des Retraits', 
          color: 'var(--color-danger)',
          dataKey: 'debit',
          Type: BarChart,
          Element: Bar
        };
      default:
        return { 
          title: 'Évolution du solde', 
          color: data?.trend === 'negative' ? 'var(--color-danger)' : 'var(--color-success)',
          dataKey: 'balance',
          Type: AreaChart,
          Element: Area
        };
    }
  };

  const config = getChartConfig();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const val = payload[0].value;
      const displayVal = filter === 'DEBIT' ? -val : val; // Optional: show debit as negative? Or just volume?
      // Actually usually volume is positive number, visual context implies outflow.
      
      return (
        <div className="bg-surface-base border border-edge p-3 rounded-lg shadow-xl text-xs z-50">
          <p className="text-content-muted mb-1">{format(new Date(label), 'd MMMM yyyy', { locale: fr })}</p>
          <p className={`font-bold text-base`} style={{ color: config.color }}>
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (error) {
    return (
      <div className="h-[250px] w-full flex flex-col items-center justify-center text-content-muted bg-surface-base/30 rounded-xl border border-dashed border-edge">
        <AlertCircle className="mb-2" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  // Calculate min/max for domain to prevent flat line issues (Only relevant for Balance/Area)
  const isBalance = filter === 'ALL';
  const dataKey = config.dataKey as keyof StatPoint;
  
  const minValue = data?.dataPoints?.reduce((min, p) => Math.min(min, (p[dataKey] as number) || 0), Infinity) || 0;
  const maxValue = data?.dataPoints?.reduce((max, p) => Math.max(max, (p[dataKey] as number) || 0), -Infinity) || 0;
  
  const isFlat = minValue === maxValue;

  // Force domain
  let domain: any = ['auto', 'auto'];
  if (isBalance) {
      domain = isFlat 
        ? [minValue >= 0 ? 0 : 'auto', maxValue * 1.1 || 1000] 
        : ['auto', 'auto'];
  } else {
      // For bars, usually start at 0
      domain = [0, 'auto'];
  }

  const ChartComponent = config.Type as any;
  const GraphicElement = config.Element as any;

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-medium text-content-secondary">{config.title}</h3>
        <div className="flex bg-surface-base rounded-lg p-1 border border-edge">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                period === p.value
                  ? 'bg-accent/10 text-accent shadow-sm'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[220px] w-full relative group">
        {loading && (
          <div className="absolute inset-0 z-10 bg-surface-base/50 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
            <Loader2 className="animate-spin text-accent" />
          </div>
        )}
        
        <ResponsiveContainer width="100%" height="100%">
          <ChartComponent data={data?.dataPoints || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
             {isBalance && (
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={config.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={config.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
             )}
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              tickFormatter={(val) => {
                 try { return format(new Date(val), 'dd/MM'); } catch { return ''; }
              }}
              minTickGap={30}
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }} 
              tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val}
              axisLine={false}
              tickLine={false}
              domain={domain}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-elevated)', opacity: 0.2 }} />
            
            <GraphicElement
              type="monotone"
              dataKey={config.dataKey}
              stroke={isBalance ? config.color : undefined}
              fill={isBalance ? `url(#${gradientId})` : config.color}
              strokeWidth={isBalance ? 2 : 0}
              fillOpacity={isBalance ? 1 : 0.8}
              radius={!isBalance ? [4, 4, 0, 0] : undefined} // Rounded bars logic
              animationDuration={1000}
              barSize={!isBalance ? 20 : undefined} // Specific for bars
            />
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
