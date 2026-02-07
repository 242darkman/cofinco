import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  User,
  FileText,
  Scale,
  Target,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, Pagination } from '@/components/ui';
import { SessionCaisse } from '@/types/finance';
import { computeSessionStatus, getSessionStatusLabel } from '@/lib/format';

interface DiscrepancyReportProps {
  sessions: SessionCaisse[];
  loading?: boolean;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

interface DiscrepancyEntry {
  session: SessionCaisse;
  date: Date;
  soldeTheorique: number;
  soldeReel: number;
  ecart: number;
  ecartPercent: number;
  status: 'ok' | 'warning' | 'critical';
  caissier?: string;
  justification?: string;
}

export function DiscrepancyReport({
  sessions,
  loading = false,
  currentPage,
  itemsPerPage,
  onPageChange,
}: DiscrepancyReportProps) {
  // Analyser les écarts
  const discrepancies = useMemo(() => {
    return sessions
      .filter((s) => {
        const status = s.computedStatus || computeSessionStatus(s);
        return status === 'CLOSED' || status === 'CLOSING_VALIDATION';
      })
      .map((session): DiscrepancyEntry => {
        const soldeTheorique = Number(
          session.soldeTheorique || session.montantFermetureTheorique || 0
        );
        const soldeReel = Number(
          session.soldeReel || session.montantFermetureDeclare || 0
        );
        const ecart = Number(session.ecart || 0) || (soldeReel - soldeTheorique);
        const ecartPercent = soldeTheorique !== 0 ? (ecart / soldeTheorique) * 100 : 0;

        let status: 'ok' | 'warning' | 'critical' = 'ok';
        if (Math.abs(ecart) > 0 && Math.abs(ecart) <= 5000) status = 'warning';
        if (Math.abs(ecart) > 5000) status = 'critical';

        return {
          session,
          date: new Date(session.closedAt || session.openedAt || ''),
          soldeTheorique,
          soldeReel,
          ecart,
          ecartPercent,
          status,
          caissier: session.caissierNom,
          justification: session.ecartJustification,
        };
      })
      .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart));
  }, [sessions]);

  // Statistiques globales
  const stats = useMemo(() => {
    const withDiscrepancy = discrepancies.filter((d) => d.ecart !== 0);
    const positiveEcarts = discrepancies.filter((d) => d.ecart > 0);
    const negativeEcarts = discrepancies.filter((d) => d.ecart < 0);

    const totalEcartPositif = positiveEcarts.reduce((sum, d) => sum + d.ecart, 0);
    const totalEcartNegatif = negativeEcarts.reduce((sum, d) => sum + Math.abs(d.ecart), 0);
    const totalEcartNet = totalEcartPositif - totalEcartNegatif;

    const tauxConformite =
      discrepancies.length > 0
        ? ((discrepancies.length - withDiscrepancy.length) / discrepancies.length) * 100
        : 100;

    const ecartMoyen =
      withDiscrepancy.length > 0
        ? withDiscrepancy.reduce((sum, d) => sum + Math.abs(d.ecart), 0) / withDiscrepancy.length
        : 0;

    return {
      total: discrepancies.length,
      withDiscrepancy: withDiscrepancy.length,
      positiveCount: positiveEcarts.length,
      negativeCount: negativeEcarts.length,
      totalEcartPositif,
      totalEcartNegatif,
      totalEcartNet,
      tauxConformite,
      ecartMoyen,
    };
  }, [discrepancies]);

  // Données pour le graphique
  const chartData = useMemo(() => {
    return discrepancies.slice(0, 10).map((d) => ({
      date: d.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      ecart: d.ecart,
      color: d.ecart > 0 ? '#10b981' : d.ecart < 0 ? '#f43f5e' : '#6366f1',
    }));
  }, [discrepancies]);

  // Pagination
  const totalPages = Math.ceil(discrepancies.length / itemsPerPage);
  const paginatedDiscrepancies = discrepancies.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) {
    return (
      <Card className="bg-slate-900/80 border-slate-800 p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full" />
          <span className="text-slate-400">Analyse des écarts en cours...</span>
        </div>
      </Card>
    );
  }

  if (discrepancies.length === 0) {
    return (
      <Card className="bg-slate-900/80 border-slate-800 p-12 text-center">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-emerald-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-1">Aucune session à analyser</h3>
        <p className="text-slate-500 text-sm">
          Aucune session fermée trouvée pour cette période.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className={`p-4 ${
            stats.tauxConformite >= 95
              ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20'
              : stats.tauxConformite >= 80
                ? 'bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20'
                : 'bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                Taux Conformité
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  stats.tauxConformite >= 95
                    ? 'text-emerald-400'
                    : stats.tauxConformite >= 80
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }`}
              >
                {stats.tauxConformite.toFixed(1)}%
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                {stats.total - stats.withDiscrepancy}/{stats.total} sessions OK
              </p>
            </div>
            <div
              className={`p-2 rounded-lg ${
                stats.tauxConformite >= 95
                  ? 'bg-emerald-500/20'
                  : stats.tauxConformite >= 80
                    ? 'bg-amber-500/20'
                    : 'bg-rose-500/20'
              }`}
            >
              <Target
                size={20}
                className={
                  stats.tauxConformite >= 95
                    ? 'text-emerald-400'
                    : stats.tauxConformite >= 80
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }
              />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-emerald-400/70 font-medium uppercase tracking-wide">
                Excédents
              </p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                +{stats.totalEcartPositif.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-emerald-400/50 mt-1">
                {stats.positiveCount} session{stats.positiveCount > 1 ? 's' : ''}
              </p>
            </div>
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <TrendingUp size={20} className="text-emerald-400" />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-rose-400/70 font-medium uppercase tracking-wide">
                Manquants
              </p>
              <p className="text-2xl font-bold text-rose-400 mt-1">
                -{stats.totalEcartNegatif.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-rose-400/50 mt-1">
                {stats.negativeCount} session{stats.negativeCount > 1 ? 's' : ''}
              </p>
            </div>
            <div className="p-2 bg-rose-500/20 rounded-lg">
              <TrendingDown size={20} className="text-rose-400" />
            </div>
          </div>
        </Card>

        <Card
          className={`p-4 ${
            stats.totalEcartNet === 0
              ? 'bg-gradient-to-br from-slate-500/10 to-slate-500/5 border-slate-500/20'
              : stats.totalEcartNet > 0
                ? 'bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-cyan-500/20'
                : 'bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                Balance Nette
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  stats.totalEcartNet === 0
                    ? 'text-slate-400'
                    : stats.totalEcartNet > 0
                      ? 'text-cyan-400'
                      : 'text-amber-400'
                }`}
              >
                {stats.totalEcartNet > 0 ? '+' : ''}
                {stats.totalEcartNet.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Moy: {stats.ecartMoyen.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div
              className={`p-2 rounded-lg ${
                stats.totalEcartNet === 0
                  ? 'bg-slate-500/20'
                  : stats.totalEcartNet > 0
                    ? 'bg-cyan-500/20'
                    : 'bg-amber-500/20'
              }`}
            >
              <Scale
                size={20}
                className={
                  stats.totalEcartNet === 0
                    ? 'text-slate-400'
                    : stats.totalEcartNet > 0
                      ? 'text-cyan-400'
                      : 'text-amber-400'
                }
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Graphique des écarts */}
      {chartData.length > 0 && (
        <Card className="bg-slate-900/80 border-slate-800 p-6">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" />
            Distribution des Écarts (Top 10)
          </h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickLine={{ stroke: '#475569' }}
                  axisLine={{ stroke: '#475569' }}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickLine={{ stroke: '#475569' }}
                  axisLine={{ stroke: '#475569' }}
                  tickFormatter={(value) => `${value > 0 ? '+' : ''}${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                  }}
                  formatter={(value: number) => [
                    `${value > 0 ? '+' : ''}${value.toLocaleString('fr-FR')} FCFA`,
                    'Écart',
                  ]}
                />
                <Bar dataKey="ecart" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Tableau détaillé */}
      <Card className="bg-slate-900/80 border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/30">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText size={16} className="text-slate-400" />
            Détail des Sessions
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/50 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Caissier</th>
                <th className="px-4 py-3 text-right">Théorique</th>
                <th className="px-4 py-3 text-right">Réel</th>
                <th className="px-4 py-3 text-right">Écart</th>
                <th className="px-4 py-3 text-right">%</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-left">Justification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {paginatedDiscrepancies.map((entry) => (
                <tr key={entry.session.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Calendar size={12} className="text-slate-500" />
                      <div>
                        <p className="text-slate-300 font-medium text-xs">
                          {entry.date.toLocaleDateString('fr-FR')}
                        </p>
                        <p className="text-slate-500 text-[10px]">
                          {entry.date.toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {entry.caissier ? (
                      <div className="flex items-center gap-2">
                        <User size={12} className="text-slate-500" />
                        <span className="text-slate-300 text-xs">{entry.caissier}</span>
                      </div>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-slate-400 font-mono text-xs">
                      {entry.soldeTheorique.toLocaleString('fr-FR')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-white font-mono font-medium text-xs">
                      {entry.soldeReel.toLocaleString('fr-FR')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-mono font-bold text-xs ${
                        entry.ecart > 0
                          ? 'text-emerald-400'
                          : entry.ecart < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {entry.ecart > 0 ? '+' : ''}
                      {entry.ecart.toLocaleString('fr-FR')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-mono text-[10px] ${
                        Math.abs(entry.ecartPercent) <= 0.5
                          ? 'text-slate-500'
                          : entry.ecartPercent > 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {entry.ecartPercent > 0 ? '+' : ''}
                      {entry.ecartPercent.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {entry.status === 'ok' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full">
                        <CheckCircle size={10} />
                        OK
                      </span>
                    )}
                    {entry.status === 'warning' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-bold rounded-full">
                        <AlertTriangle size={10} />
                        Mineur
                      </span>
                    )}
                    {entry.status === 'critical' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[10px] font-bold rounded-full">
                        <AlertTriangle size={10} />
                        Critique
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {entry.justification ? (
                      <span className="text-slate-400 text-xs truncate block max-w-[200px]">
                        {entry.justification}
                      </span>
                    ) : entry.ecart !== 0 ? (
                      <span className="text-amber-400/50 text-xs italic">Non justifié</span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {discrepancies.length > itemsPerPage && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/30">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
              itemsPerPage={itemsPerPage}
              totalItems={discrepancies.length}
              canGoNext={currentPage < totalPages}
              canGoPrevious={currentPage > 1}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
