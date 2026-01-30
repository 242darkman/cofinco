import React from 'react';
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, TrendingDown, Briefcase } from 'lucide-react';
import { useHrAnalytics } from '../../hooks/hr/useHrAnalytics';

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs font-semibold" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString('fr-FR') : entry.value}
        </p>
      ))}
    </div>
  );
};

export default function HrAnalyticsDashboard() {
  const { data, loading, error } = useHrAnalytics();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        Erreur lors du chargement des données analytiques.
      </div>
    );
  }

  // Process conges data: pivot by month with types as columns
  const congesMonths = Array.from(new Set(data.congesTendances.map(c => c.mois))).sort();
  const congesData = congesMonths.map(mois => {
    const entry: Record<string, any> = { mois: mois.slice(5) }; // Show MM only
    data.congesTendances.filter(c => c.mois === mois).forEach(c => {
      entry[c.type || 'Autre'] = c.total;
    });
    return entry;
  });
  const congesTypes = Array.from(new Set(data.congesTendances.map(c => c.type || 'Autre')));
  const congesColors = ['#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899'];

  return (
    <div className="flex flex-col h-full space-y-3 overflow-y-auto no-scrollbar">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <Users size={18} className="text-cyan-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">{data.kpis.totalEmployes}</p>
            <p className="text-[10px] text-slate-400">Employés actifs</p>
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <TrendingDown size={18} className="text-amber-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">{data.kpis.tauxRotation}%</p>
            <p className="text-[10px] text-slate-400">Taux de rotation</p>
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Briefcase size={18} className="text-purple-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">{data.kpis.postesOuverts}</p>
            <p className="text-[10px] text-slate-400">Candidatures ouvertes</p>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
        {/* Effectifs par département */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-slate-400 mb-3">Effectifs par département</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.effectifsParDepartement} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="departement" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#334155', opacity: 0.2 }} />
                <Bar dataKey="total" name="Employés" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tendances congés */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-slate-400 mb-3">Congés mensuels par type</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={congesData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  {congesTypes.map((type, i) => (
                    <linearGradient key={type} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={congesColors[i % congesColors.length]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={congesColors[i % congesColors.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="mois" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                {congesTypes.map((type, i) => (
                  <Area
                    key={type}
                    type="monotone"
                    dataKey={type}
                    name={type}
                    stroke={congesColors[i % congesColors.length]}
                    fill={`url(#grad-${i})`}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Masse salariale */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-slate-400 mb-3">Masse salariale mensuelle</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.masseSalariale.map(m => ({ ...m, mois: m.mois.slice(5) }))} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradSalaire" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="mois" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 9, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
                        <p className="text-xs text-slate-400 mb-1">{label}</p>
                        <p className="text-xs font-semibold text-emerald-400">
                          {new Intl.NumberFormat('fr-FR').format(payload[0].value as number)} FC
                        </p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="total" name="Net à payer" stroke="#10b981" fill="url(#gradSalaire)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution sanctions */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-slate-400 mb-3">Sanctions par gravité</h4>
          <div className="h-48 flex items-center justify-center">
            {data.sanctionsDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.sanctionsDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="total"
                    nameKey="gravite"
                    label={({ gravite, total }) => `${gravite}: ${total}`}
                    labelLine={false}
                  >
                    {data.sanctionsDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-500">Aucune sanction enregistrée</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
