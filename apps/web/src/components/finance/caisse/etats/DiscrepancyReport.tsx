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
      color: d.ecart > 0 ? 'var(--color-success)' : d.ecart < 0 ? 'var(--color-danger)' : '#6366f1',
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
      <Card className="bg-surface-base/80 border-edge p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full" />
          <span className="text-content-muted">Analyse des écarts en cours...</span>
        </div>
      </Card>
    );
  }

  if (discrepancies.length === 0) {
    return (
      <Card className="bg-surface-base/80 border-edge p-12 text-center">
        <div className="w-16 h-16 bg-status-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-status-success" />
        </div>
        <h3 className="text-lg font-semibold text-content-primary mb-1">Aucune session à analyser</h3>
        <p className="text-content-muted text-sm">
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
              ? 'bg-gradient-to-br from-status-success/10 to-status-success/5 border-status-success/20'
              : stats.tauxConformite >= 80
                ? 'bg-gradient-to-br from-status-warning/10 to-status-warning/5 border-status-warning/20'
                : 'bg-gradient-to-br from-status-danger/10 to-status-danger/5 border-status-danger/20'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-content-muted font-medium uppercase tracking-wide">
                Taux Conformité
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  stats.tauxConformite >= 95
                    ? 'text-status-success'
                    : stats.tauxConformite >= 80
                      ? 'text-status-warning'
                      : 'text-status-danger'
                }`}
              >
                {stats.tauxConformite.toFixed(1)}%
              </p>
              <p className="text-[10px] text-content-muted mt-1">
                {stats.total - stats.withDiscrepancy}/{stats.total} sessions OK
              </p>
            </div>
            <div
              className={`p-2 rounded-lg ${
                stats.tauxConformite >= 95
                  ? 'bg-status-success-bg'
                  : stats.tauxConformite >= 80
                    ? 'bg-status-warning-bg'
                    : 'bg-status-danger-bg'
              }`}
            >
              <Target
                size={20}
                className={
                  stats.tauxConformite >= 95
                    ? 'text-status-success'
                    : stats.tauxConformite >= 80
                      ? 'text-status-warning'
                      : 'text-status-danger'
                }
              />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-status-success/10 to-status-success/5 border-status-success/20 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-status-success/70 font-medium uppercase tracking-wide">
                Excédents
              </p>
              <p className="text-2xl font-bold text-status-success mt-1">
                +{stats.totalEcartPositif.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-status-success/50 mt-1">
                {stats.positiveCount} session{stats.positiveCount > 1 ? 's' : ''}
              </p>
            </div>
            <div className="p-2 bg-status-success-bg rounded-lg">
              <TrendingUp size={20} className="text-status-success" />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-status-danger/10 to-status-danger/5 border-status-danger/20 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-status-danger/70 font-medium uppercase tracking-wide">
                Manquants
              </p>
              <p className="text-2xl font-bold text-status-danger mt-1">
                -{stats.totalEcartNegatif.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-status-danger/50 mt-1">
                {stats.negativeCount} session{stats.negativeCount > 1 ? 's' : ''}
              </p>
            </div>
            <div className="p-2 bg-status-danger-bg rounded-lg">
              <TrendingDown size={20} className="text-status-danger" />
            </div>
          </div>
        </Card>

        <Card
          className={`p-4 ${
            stats.totalEcartNet === 0
              ? 'bg-gradient-to-br from-surface-subtle/10 to-surface-subtle/5 border-edge-strong/20'
              : stats.totalEcartNet > 0
                ? 'bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20'
                : 'bg-gradient-to-br from-status-warning/10 to-status-warning/5 border-status-warning/20'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-content-muted font-medium uppercase tracking-wide">
                Balance Nette
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  stats.totalEcartNet === 0
                    ? 'text-content-muted'
                    : stats.totalEcartNet > 0
                      ? 'text-accent'
                      : 'text-status-warning'
                }`}
              >
                {stats.totalEcartNet > 0 ? '+' : ''}
                {stats.totalEcartNet.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-content-muted mt-1">
                Moy: {stats.ecartMoyen.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div
              className={`p-2 rounded-lg ${
                stats.totalEcartNet === 0
                  ? 'bg-surface-subtle/40'
                  : stats.totalEcartNet > 0
                    ? 'bg-accent/10'
                    : 'bg-status-warning-bg'
              }`}
            >
              <Scale
                size={20}
                className={
                  stats.totalEcartNet === 0
                    ? 'text-content-muted'
                    : stats.totalEcartNet > 0
                      ? 'text-accent'
                      : 'text-status-warning'
                }
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Graphique des écarts */}
      {chartData.length > 0 && (
        <Card className="bg-surface-base/80 border-edge p-6">
          <h3 className="text-sm font-bold text-content-primary mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-status-warning" />
            Distribution des Écarts (Top 10)
          </h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  tickLine={{ stroke: 'var(--border-default)' }}
                  axisLine={{ stroke: 'var(--border-default)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  tickLine={{ stroke: 'var(--border-default)' }}
                  axisLine={{ stroke: 'var(--border-default)' }}
                  tickFormatter={(value) => `${value > 0 ? '+' : ''}${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                  }}
                  formatter={(value) => [
                    `${Number(value) > 0 ? '+' : ''}${Number(value).toLocaleString('fr-FR')} FCFA`,
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
      <Card className="bg-surface-base/80 border-edge overflow-hidden">
        <div className="px-6 py-4 border-b border-edge bg-surface-base/30">
          <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
            <FileText size={16} className="text-content-muted" />
            Détail des Sessions
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-base/50 text-content-muted uppercase text-[10px] font-bold tracking-wider">
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
            <tbody className="divide-y divide-edge/50">
              {paginatedDiscrepancies.map((entry) => (
                <tr key={entry.session.id} className="hover:bg-surface/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Calendar size={12} className="text-content-muted" />
                      <div>
                        <p className="text-content-secondary font-medium text-xs">
                          {entry.date.toLocaleDateString('fr-FR')}
                        </p>
                        <p className="text-content-muted text-[10px]">
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
                        <User size={12} className="text-content-muted" />
                        <span className="text-content-secondary text-xs">{entry.caissier}</span>
                      </div>
                    ) : (
                      <span className="text-content-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-content-muted font-mono text-xs">
                      {entry.soldeTheorique.toLocaleString('fr-FR')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-content-primary font-mono font-medium text-xs">
                      {entry.soldeReel.toLocaleString('fr-FR')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-mono font-bold text-xs ${
                        entry.ecart > 0
                          ? 'text-status-success'
                          : entry.ecart < 0
                            ? 'text-status-danger'
                            : 'text-content-muted'
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
                          ? 'text-content-muted'
                          : entry.ecartPercent > 0
                            ? 'text-status-success'
                            : 'text-status-danger'
                      }`}
                    >
                      {entry.ecartPercent > 0 ? '+' : ''}
                      {entry.ecartPercent.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {entry.status === 'ok' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-status-success-bg text-status-success text-[10px] font-bold rounded-full">
                        <CheckCircle size={10} />
                        OK
                      </span>
                    )}
                    {entry.status === 'warning' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-status-warning-bg text-status-warning text-[10px] font-bold rounded-full">
                        <AlertTriangle size={10} />
                        Mineur
                      </span>
                    )}
                    {entry.status === 'critical' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-status-danger/10 text-status-danger text-[10px] font-bold rounded-full">
                        <AlertTriangle size={10} />
                        Critique
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {entry.justification ? (
                      <span className="text-content-muted text-xs truncate block max-w-[200px]">
                        {entry.justification}
                      </span>
                    ) : entry.ecart !== 0 ? (
                      <span className="text-status-warning/50 text-xs italic">Non justifié</span>
                    ) : (
                      <span className="text-content-muted text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {discrepancies.length > itemsPerPage && (
          <div className="p-4 border-t border-edge bg-surface-base/30">
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
