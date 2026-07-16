import React, { useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Users,
  Percent,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui';
import { SessionCaisse, CaisseTransaction } from '@/types/finance';
import { computeSessionStatus, getSessionStatusLabel } from '@/lib/format';

interface DailySummaryProps {
  sessions: SessionCaisse[];
  transactions: CaisseTransaction[];
  loading?: boolean;
}

const COLORS = {
  entrees: 'var(--color-success)',
  sorties: 'var(--color-danger)',
  neutre: '#6366f1',
  accent: '#06b6d4',
};

const PIE_COLORS = ['#10b981', '#f43f5e', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899'];

export function DailySummary({ sessions, transactions, loading = false }: DailySummaryProps) {
  // Calculs des métriques
  const metrics = useMemo(() => {
    const totalEntrees = transactions
      .filter((t) => isEntreeOperation(t.typeOperation || ''))
      .reduce((sum, t) => sum + Number(t.montant), 0);

    const totalSorties = transactions
      .filter((t) => !isEntreeOperation(t.typeOperation || ''))
      .reduce((sum, t) => sum + Number(t.montant), 0);

    const soldeNet = totalEntrees - totalSorties;

    const sessionsTerminees = sessions.filter(
      (s) => (s.computedStatus || computeSessionStatus(s)) === 'CLOSED'
    ).length;

    const totalEcarts = sessions.reduce((sum, s) => sum + Math.abs(Number(s.ecart || 0)), 0);

    const tauxConformite =
      sessions.length > 0
        ? (sessions.filter((s) => !s.ecart || Number(s.ecart) === 0).length / sessions.length) * 100
        : 100;

    // Moyenne par session
    const moyenneEntrees = sessions.length > 0 ? totalEntrees / sessions.length : 0;
    const moyenneSorties = sessions.length > 0 ? totalSorties / sessions.length : 0;

    return {
      totalEntrees,
      totalSorties,
      soldeNet,
      nbSessions: sessions.length,
      sessionsTerminees,
      nbTransactions: transactions.length,
      totalEcarts,
      tauxConformite,
      moyenneEntrees,
      moyenneSorties,
    };
  }, [sessions, transactions]);

  // Données pour le graphique par jour
  const dailyData = useMemo(() => {
    const byDay: Record<string, { date: string; entrees: number; sorties: number; transactions: number }> =
      {};

    for (const tx of transactions) {
      const date = new Date(tx.createdAt || '').toLocaleDateString('fr-FR');
      if (!byDay[date]) {
        byDay[date] = { date, entrees: 0, sorties: 0, transactions: 0 };
      }

      const isEntree = isEntreeOperation(tx.typeOperation || '');
      if (isEntree) {
        byDay[date].entrees += Number(tx.montant);
      } else {
        byDay[date].sorties += Number(tx.montant);
      }
      byDay[date].transactions++;
    }

    return Object.values(byDay).sort(
      (a, b) => new Date(a.date.split('/').reverse().join('-')).getTime() -
               new Date(b.date.split('/').reverse().join('-')).getTime()
    );
  }, [transactions]);

  // Données pour le graphique par type d'opération
  const operationTypeData = useMemo(() => {
    const byType: Record<string, number> = {};

    for (const tx of transactions) {
      const type = tx.typeOperation || 'AUTRE';
      const label = getOperationLabel(type);
      byType[label] = (byType[label] || 0) + Number(tx.montant);
    }

    return Object.entries(byType)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [transactions]);

  // Données pour l'évolution du solde
  const soldeEvolution = useMemo(() => {
    let solde = 0;
    const data: { date: string; solde: number }[] = [];

    const sortedTx = [...transactions].sort((a, b) => {
      const dateA = new Date(a.createdAt || '');
      const dateB = new Date(b.createdAt || '');
      return dateA.getTime() - dateB.getTime();
    });

    for (const tx of sortedTx) {
      const isEntree = isEntreeOperation(tx.typeOperation || '');
      if (isEntree) {
        solde += Number(tx.montant);
      } else {
        solde -= Number(tx.montant);
      }

      data.push({
        date: new Date(tx.createdAt || '').toLocaleDateString('fr-FR'),
        solde,
      });
    }

    return data;
  }, [transactions]);

  if (loading) {
    return (
      <Card className="bg-surface-base/80 border-edge p-8">
        <div className="flex items-center justify-center gap-3">
          <Spinner size="sm" />
          <span className="text-content-muted">Chargement des statistiques...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs Principaux - Compacted */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-status-success/10 to-status-success/5 border-status-success/20 p-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-status-success/70 font-medium uppercase tracking-wide">
                Total Entrées
              </p>
              <p className="text-xl font-bold text-status-success mt-0.5">
                {metrics.totalEntrees.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-status-success/50 mt-0.5">
                Moy: {metrics.moyenneEntrees.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="p-1.5 bg-status-success-bg rounded-lg">
              <TrendingUp size={16} className="text-status-success" />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-status-danger/10 to-status-danger/5 border-status-danger/20 p-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-status-danger/70 font-medium uppercase tracking-wide">
                Total Sorties
              </p>
              <p className="text-xl font-bold text-status-danger mt-0.5">
                {metrics.totalSorties.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-status-danger/50 mt-0.5">
                Moy: {metrics.moyenneSorties.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="p-1.5 bg-status-danger-bg rounded-lg">
              <TrendingDown size={16} className="text-status-danger" />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20 p-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-accent/70 font-medium uppercase tracking-wide">
                Solde Net
              </p>
              <p
                className={`text-xl font-bold mt-0.5 ${
                  metrics.soldeNet >= 0 ? 'text-accent' : 'text-status-warning'
                }`}
              >
                {metrics.soldeNet >= 0 ? '+' : ''}
                {metrics.soldeNet.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-accent/50 mt-0.5">{metrics.nbTransactions} ops</p>
            </div>
            <div className="p-1.5 bg-accent/10 rounded-lg">
              <DollarSign size={16} className="text-accent" />
            </div>
          </div>
        </Card>

        <Card
          className={`bg-gradient-to-br p-3 ${
            metrics.tauxConformite >= 95
              ? 'from-status-success/10 to-status-success/5 border-status-success/20'
              : metrics.tauxConformite >= 80
                ? 'from-status-warning/10 to-status-warning/5 border-status-warning/20'
                : 'from-status-danger/10 to-status-danger/5 border-status-danger/20'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p
                className={`text-xs font-medium uppercase tracking-wide ${
                  metrics.tauxConformite >= 95
                    ? 'text-status-success/70'
                    : metrics.tauxConformite >= 80
                      ? 'text-status-warning/70'
                      : 'text-status-danger/70'
                }`}
              >
                Conformité
              </p>
              <p
                className={`text-xl font-bold mt-0.5 ${
                  metrics.tauxConformite >= 95
                    ? 'text-status-success'
                    : metrics.tauxConformite >= 80
                      ? 'text-status-warning'
                      : 'text-status-danger'
                }`}
              >
                {metrics.tauxConformite.toFixed(1)}%
              </p>
              <p
                className={`text-[10px] mt-0.5 ${
                  metrics.tauxConformite >= 95
                    ? 'text-status-success/50'
                    : metrics.tauxConformite >= 80
                      ? 'text-status-warning/50'
                      : 'text-status-danger/50'
                }`}
              >
                {metrics.sessionsTerminees}/{metrics.nbSessions} sessions
              </p>
            </div>
            <div
              className={`p-1.5 rounded-lg ${
                metrics.tauxConformite >= 95
                  ? 'bg-status-success-bg'
                  : metrics.tauxConformite >= 80
                    ? 'bg-status-warning-bg'
                    : 'bg-status-danger-bg'
              }`}
            >
              {metrics.tauxConformite >= 95 ? (
                <CheckCircle size={16} className="text-status-success" />
              ) : (
                <AlertTriangle size={16} className={metrics.tauxConformite >= 80 ? 'text-status-warning' : 'text-status-danger'} />
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Graphiques - Compacted Heights */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Évolution journalière */}
        <Card className="bg-surface-base/80 border-edge p-4">
          <h3 className="text-xs font-bold text-content-primary mb-2 flex items-center gap-2">
            <Activity size={14} className="text-accent" />
            Mouvements par Jour
          </h3>
          {dailyData.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-default)' }}
                    dy={5}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--bg-elevated)', opacity: 0.2 }}
                    contentStyle={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      padding: '8px'
                    }}
                    formatter={(value) => [Number(value).toLocaleString('fr-FR') + ' FCFA', '']}
                  />
                  <Bar dataKey="entrees" name="Entrées" fill={COLORS.entrees} radius={[3, 3, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="sorties" name="Sorties" fill={COLORS.sorties} radius={[3, 3, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-content-muted text-xs">
              Aucune donnée disponible
            </div>
          )}
        </Card>

        {/* Répartition par type */}
        <Card className="bg-surface-base/80 border-edge p-4">
          <h3 className="text-xs font-bold text-content-primary mb-2 flex items-center gap-2">
            <Percent size={14} className="text-status-info" />
            Répartition par Type
          </h3>
          {operationTypeData.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={operationTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ percent = 0 }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {operationTypeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      padding: '8px'
                    }}
                    formatter={(value) => [Number(value).toLocaleString('fr-FR') + ' FCFA', '']}
                  />
                  <Legend 
                    layout="vertical" 
                    verticalAlign="middle" 
                    align="right"
                    wrapperStyle={{ fontSize: '10px' }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-content-muted text-xs">
              Aucune donnée disponible
            </div>
          )}
        </Card>
      </div>

      {/* Évolution du solde - Compacted */}
      {soldeEvolution.length > 0 && (
        <Card className="bg-surface-base/80 border-edge p-4">
          <h3 className="text-xs font-bold text-content-primary mb-2 flex items-center gap-2">
            <TrendingUp size={14} className="text-status-success" />
            Évolution du Solde Net
          </h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={soldeEvolution} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="soldeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border-default)' }}
                  dy={5}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    padding: '8px'
                  }}
                  formatter={(value) => [Number(value).toLocaleString('fr-FR') + ' FCFA', 'Solde']}
                />
                <Area
                  type="monotone"
                  dataKey="solde"
                  stroke="var(--accent-primary)"
                  strokeWidth={2}
                  fill="url(#soldeGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Stats secondaires - Hidden to save space or made extremely compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pb-2">
        <Card className="bg-surface-base/60 border-edge p-3 flex items-center gap-3">
            <div className="p-1.5 bg-status-info-bg rounded-lg shrink-0">
              <Users size={16} className="text-status-info" />
            </div>
            <div>
              <p className="text-[10px] text-content-muted uppercase tracking-wide">Sessions</p>
              <p className="text-sm font-bold text-content-primary">{metrics.nbSessions}</p>
            </div>
        </Card>

        <Card className="bg-surface-base/60 border-edge p-3 flex items-center gap-3">
            <div className="p-1.5 bg-status-info-bg rounded-lg shrink-0">
              <Activity size={16} className="text-status-info" />
            </div>
            <div>
              <p className="text-[10px] text-content-muted uppercase tracking-wide">Opérations</p>
              <p className="text-sm font-bold text-content-primary">{metrics.nbTransactions}</p>
            </div>
        </Card>

        <Card className="bg-surface-base/60 border-edge p-3 flex items-center gap-3">
            <div className="p-1.5 bg-status-success-bg rounded-lg shrink-0">
              <CheckCircle size={16} className="text-status-success" />
            </div>
            <div>
              <p className="text-[10px] text-content-muted uppercase tracking-wide">Fermées</p>
              <p className="text-sm font-bold text-content-primary">{metrics.sessionsTerminees}</p>
            </div>
        </Card>

        <Card className="bg-surface-base/60 border-edge p-3 flex items-center gap-3">
            <div className={`p-1.5 rounded-lg shrink-0 ${metrics.totalEcarts > 0 ? 'bg-status-warning-bg' : 'bg-status-success-bg'}`}>
              <AlertTriangle
                size={16}
                className={metrics.totalEcarts > 0 ? 'text-status-warning' : 'text-status-success'}
              />
            </div>
            <div>
              <p className="text-[10px] text-content-muted uppercase tracking-wide">Total Écarts</p>
              <p className={`text-sm font-bold ${metrics.totalEcarts > 0 ? 'text-status-warning' : 'text-status-success'}`}>
                {metrics.totalEcarts.toLocaleString('fr-FR')}
              </p>
            </div>
        </Card>
      </div>
    </div>
  );
}

// Helpers
function isEntreeOperation(type: string): boolean {
  const entreeTypes = [
    'DEPOSIT',
    'ENCAISSEMENT',
    'LOAN_REPAYMENT',
    'REMBOURSEMENT_PRET',
    'TONTINE_COTISATION',
    'TONTINE_CONTRIBUTION',  // Cotisation tontine (typeOperation utilisé dans tontine-logic.ts)
    'COTISATION_TONTINE',
    'SAVINGS_DEPOSIT',
    'DEPOT_EPARGNE',
    'APPROVISIONNEMENT',
    'TRANSFER_IN',
    'BLOCKED_DEPOSIT',
    'VERSEMENT_COMPTE_BLOQUE',
  ];
  return entreeTypes.some((t) => type.toUpperCase().includes(t));
}

function getOperationLabel(type: string): string {
  const labels: Record<string, string> = {
    DEPOSIT: 'Dépôts',
    WITHDRAWAL: 'Retraits',
    LOAN_REPAYMENT: 'Remb. Prêts',
    CREDIT_DISBURSEMENT: 'Décais. Crédits',
    TONTINE_CONTRIBUTION: 'Cotis. Tontines',  // TONTINE_CONTRIBUTION avant TONTINE_COTISATION
    TONTINE_COTISATION: 'Cotis. Tontines',
    TONTINE_DISTRIBUTION: 'Distrib. Tontines',
    TONTINE_WITHDRAWAL: 'Distrib. Tontines',  // Ajout pour les distributions
    SAVINGS_DEPOSIT: 'Épargne Dépôts',
    SAVINGS_WITHDRAWAL: 'Épargne Retraits',
    BLOCKED_DEPOSIT: 'Compte Bloqué Dépôts',
    BLOCKED_WITHDRAWAL: 'Compte Bloqué Retraits',
    APPROVISIONNEMENT: 'Approvisionnement',
  };

  for (const [key, label] of Object.entries(labels)) {
    if (type.toUpperCase().includes(key)) {
      return label;
    }
  }

  return 'Autres';
}
