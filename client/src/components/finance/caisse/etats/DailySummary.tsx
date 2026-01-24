import React, { useMemo } from 'react';
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
  entrees: '#10b981',
  sorties: '#f43f5e',
  neutre: '#6366f1',
  accent: '#06b6d4',
};

const PIE_COLORS = ['#10b981', '#f43f5e', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899'];

export function DailySummary({ sessions, transactions, loading = false }: DailySummaryProps) {
  // Calculs des métriques
  const metrics = useMemo(() => {
    const totalEntrees = transactions
      .filter((t) => isEntreeOperation(t.type_operation || t.typeOperation || ''))
      .reduce((sum, t) => sum + Number(t.montant), 0);

    const totalSorties = transactions
      .filter((t) => !isEntreeOperation(t.type_operation || t.typeOperation || ''))
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
      const date = new Date(tx.created_at || tx.createdAt || '').toLocaleDateString('fr-FR');
      if (!byDay[date]) {
        byDay[date] = { date, entrees: 0, sorties: 0, transactions: 0 };
      }

      const isEntree = isEntreeOperation(tx.type_operation || tx.typeOperation || '');
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
      const type = tx.type_operation || tx.typeOperation || 'AUTRE';
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
      const dateA = new Date(a.created_at || a.createdAt || '');
      const dateB = new Date(b.created_at || b.createdAt || '');
      return dateA.getTime() - dateB.getTime();
    });

    for (const tx of sortedTx) {
      const isEntree = isEntreeOperation(tx.type_operation || tx.typeOperation || '');
      if (isEntree) {
        solde += Number(tx.montant);
      } else {
        solde -= Number(tx.montant);
      }

      data.push({
        date: new Date(tx.created_at || tx.createdAt || '').toLocaleDateString('fr-FR'),
        solde,
      });
    }

    return data;
  }, [transactions]);

  if (loading) {
    return (
      <Card className="bg-slate-900/80 border-slate-800 p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full" />
          <span className="text-slate-400">Chargement des statistiques...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs Principaux */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-emerald-400/70 font-medium uppercase tracking-wide">
                Total Entrées
              </p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                {metrics.totalEntrees.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-emerald-400/50 mt-1">
                Moy: {metrics.moyenneEntrees.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}/session
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
                Total Sorties
              </p>
              <p className="text-2xl font-bold text-rose-400 mt-1">
                {metrics.totalSorties.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-rose-400/50 mt-1">
                Moy: {metrics.moyenneSorties.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}/session
              </p>
            </div>
            <div className="p-2 bg-rose-500/20 rounded-lg">
              <TrendingDown size={20} className="text-rose-400" />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-cyan-500/20 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-cyan-400/70 font-medium uppercase tracking-wide">
                Solde Net
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  metrics.soldeNet >= 0 ? 'text-cyan-400' : 'text-amber-400'
                }`}
              >
                {metrics.soldeNet >= 0 ? '+' : ''}
                {metrics.soldeNet.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-cyan-400/50 mt-1">{metrics.nbTransactions} opérations</p>
            </div>
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <DollarSign size={20} className="text-cyan-400" />
            </div>
          </div>
        </Card>

        <Card
          className={`bg-gradient-to-br p-4 ${
            metrics.tauxConformite >= 95
              ? 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20'
              : metrics.tauxConformite >= 80
                ? 'from-amber-500/10 to-amber-500/5 border-amber-500/20'
                : 'from-rose-500/10 to-rose-500/5 border-rose-500/20'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p
                className={`text-xs font-medium uppercase tracking-wide ${
                  metrics.tauxConformite >= 95
                    ? 'text-emerald-400/70'
                    : metrics.tauxConformite >= 80
                      ? 'text-amber-400/70'
                      : 'text-rose-400/70'
                }`}
              >
                Conformité
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  metrics.tauxConformite >= 95
                    ? 'text-emerald-400'
                    : metrics.tauxConformite >= 80
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }`}
              >
                {metrics.tauxConformite.toFixed(1)}%
              </p>
              <p
                className={`text-[10px] mt-1 ${
                  metrics.tauxConformite >= 95
                    ? 'text-emerald-400/50'
                    : metrics.tauxConformite >= 80
                      ? 'text-amber-400/50'
                      : 'text-rose-400/50'
                }`}
              >
                {metrics.sessionsTerminees}/{metrics.nbSessions} sessions
              </p>
            </div>
            <div
              className={`p-2 rounded-lg ${
                metrics.tauxConformite >= 95
                  ? 'bg-emerald-500/20'
                  : metrics.tauxConformite >= 80
                    ? 'bg-amber-500/20'
                    : 'bg-rose-500/20'
              }`}
            >
              {metrics.tauxConformite >= 95 ? (
                <CheckCircle size={20} className="text-emerald-400" />
              ) : (
                <AlertTriangle size={20} className={metrics.tauxConformite >= 80 ? 'text-amber-400' : 'text-rose-400'} />
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Graphiques */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Évolution journalière */}
        <Card className="bg-slate-900/80 border-slate-800 p-6">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Activity size={16} className="text-cyan-400" />
            Mouvements par Jour
          </h3>
          {dailyData.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                    }}
                    formatter={(value: number) => [value.toLocaleString('fr-FR') + ' FCFA', '']}
                  />
                  <Bar dataKey="entrees" name="Entrées" fill={COLORS.entrees} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sorties" name="Sorties" fill={COLORS.sorties} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-500">
              Aucune donnée disponible
            </div>
          )}
        </Card>

        {/* Répartition par type */}
        <Card className="bg-slate-900/80 border-slate-800 p-6">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Percent size={16} className="text-purple-400" />
            Répartition par Type
          </h3>
          {operationTypeData.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={operationTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={{ stroke: '#475569' }}
                  >
                    {operationTypeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                    }}
                    formatter={(value: number) => [value.toLocaleString('fr-FR') + ' FCFA', '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-500">
              Aucune donnée disponible
            </div>
          )}
        </Card>
      </div>

      {/* Évolution du solde */}
      {soldeEvolution.length > 0 && (
        <Card className="bg-slate-900/80 border-slate-800 p-6">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            Évolution du Solde Net
          </h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={soldeEvolution} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="soldeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                  }}
                  formatter={(value: number) => [value.toLocaleString('fr-FR') + ' FCFA', 'Solde']}
                />
                <Area
                  type="monotone"
                  dataKey="solde"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fill="url(#soldeGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Stats secondaires */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Users size={18} className="text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Sessions</p>
              <p className="text-lg font-bold text-white">{metrics.nbSessions}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Activity size={18} className="text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Opérations</p>
              <p className="text-lg font-bold text-white">{metrics.nbTransactions}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <CheckCircle size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Fermées</p>
              <p className="text-lg font-bold text-white">{metrics.sessionsTerminees}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${metrics.totalEcarts > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
              <AlertTriangle
                size={18}
                className={metrics.totalEcarts > 0 ? 'text-amber-400' : 'text-emerald-400'}
              />
            </div>
            <div>
              <p className="text-xs text-slate-400">Total Écarts</p>
              <p className={`text-lg font-bold ${metrics.totalEcarts > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {metrics.totalEcarts.toLocaleString('fr-FR')}
              </p>
            </div>
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
