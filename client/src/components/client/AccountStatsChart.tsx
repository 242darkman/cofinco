import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface StatPoint {
  date: string;
  balance: number;
}

interface StatsResponse {
  period: string;
  currency: string;
  trend: 'positive' | 'negative' | 'neutral';
  data_points: StatPoint[];
}

interface AccountStatsChartProps {
  compteId: string;
}

const PERIODS = [
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1A', value: '1Y' },
];

export default function AccountStatsChart({ compteId }: AccountStatsChartProps) {
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
      const res = await fetch(`/api/comptes/${compteId}/stats?period=${period}`);
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
      currency: 'XAF',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs z-50">
          <p className="text-slate-400 mb-1">{format(new Date(label), 'd MMMM yyyy', { locale: fr })}</p>
          <p className={`font-bold text-base ${payload[0].value < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (error) {
    return (
      <div className="h-[250px] w-full flex flex-col items-center justify-center text-slate-500 bg-slate-900/30 rounded-xl border border-dashed border-slate-700">
        <AlertCircle className="mb-2" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  // Calculate min/max for domain to prevent flat line issues
  const minValue = data?.data_points?.reduce((min, p) => Math.min(min, p.balance), Infinity) || 0;
  const maxValue = data?.data_points?.reduce((max, p) => Math.max(max, p.balance), -Infinity) || 0;
  const isFlat = minValue === maxValue;

  // Force domain to show some range if flat
  const domain: any = isFlat 
    ? [minValue >= 0 ? 0 : 'auto', maxValue * 1.1 || 1000] 
    : ['auto', 'auto'];

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-medium text-slate-300">Évolution du solde</h3>
        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                period === p.value
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[220px] w-full relative group">
        {loading && (
          <div className="absolute inset-0 z-10 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
            <Loader2 className="animate-spin text-cyan-500" />
          </div>
        )}
        
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data?.data_points || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={data?.trend === 'negative' ? '#ef4444' : '#10b981'} stopOpacity={0.3} />
                <stop offset="95%" stopColor={data?.trend === 'negative' ? '#ef4444' : '#10b981'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 10, fill: '#64748b' }} 
              tickFormatter={(val) => {
                 try { return format(new Date(val), 'dd/MM'); } catch { return ''; }
              }} 
              minTickGap={30}
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis 
              tick={{ fontSize: 10, fill: '#64748b' }} 
              tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val}
              axisLine={false}
              tickLine={false}
              domain={domain}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#475569', strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="balance"
              stroke={data?.trend === 'negative' ? '#ef4444' : '#10b981'}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${gradientId})`}
              animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
