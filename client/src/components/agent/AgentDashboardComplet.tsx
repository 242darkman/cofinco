import React, { useState, useEffect } from 'react';
import { TrendingUp, Target, Users, Banknote, Clock, MapPin, Star, Award, Calendar, CheckCircle, AlertCircle, Phone, Zap } from 'lucide-react';
import Card from '../ui/Card';
import StatCard from '../ui/StatCard';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

interface DashboardStats {
  presenceStats: {
    joursPresents: number;
    tauxPresence: number;
    heuresMoyennes: number;
  };
  collecteStats: {
    montantTotal: number;
    nombreCollectes: number;
    montantMoyen: number;
  };
  recouvrementStats: {
    montantRecouvre: number;
    tauxRecouvrement: number;
    dossiersActifs: number;
  };
  portefeuilleStats: {
    nombreClients: number;
    clientsActifs: number;
  };
  performanceStats: {
    performance: number;
    niveau: number;
    points: number;
  };
}

export default function AgentDashboardComplet() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'jour' | 'semaine' | 'mois'>('jour');
  const [agentId, setAgentId] = useState<string>('');

  useEffect(() => {
    loadAgentId();
  }, []);

  useEffect(() => {
    if (agentId) {
      loadDashboardStats();
    }
  }, [agentId, selectedPeriod]);

  const loadAgentId = () => {
    const cofinUserStr = localStorage.getItem('cofin_user');
    if (cofinUserStr) {
      const user = JSON.parse(cofinUserStr);
      setAgentId(user.id);
    }
  };

  const loadDashboardStats = async () => {
    try {
      setLoading(true);

      const dateFilter = getDateFilter();

      const [visitesRes, paiementsRes] = await Promise.all([
        fetch(`/api/agents-terrain/${agentId}/visites`).catch(() => null),
        fetch(`/api/agents-terrain/${agentId}/paiements`).catch(() => null)
      ]);

      let visites: any[] = [];
      let paiements: any[] = [];

      if (visitesRes?.ok) {
        visites = await visitesRes.json();
      }
      if (paiementsRes?.ok) {
        paiements = await paiementsRes.json();
      }

      const visitesFiltered = visites.filter((v: any) => {
        const vDate = new Date(v.dateVisite || v.date_visite);
        return vDate >= new Date(dateFilter);
      });

      const paiementsFiltered = paiements.filter((p: any) => {
        const pDate = new Date(p.datePaiement || p.date_paiement || p.createdAt);
        return pDate >= new Date(dateFilter);
      });

      const presenceStats = {
        joursPresents: visitesFiltered.filter((v: any) => v.statut === 'Effectuée').length,
        tauxPresence: visitesFiltered.length > 0
          ? (visitesFiltered.filter((v: any) => v.statut === 'Effectuée').length / visitesFiltered.length) * 100
          : 85,
        heuresMoyennes: 7.5
      };

      const collecteStats = {
        montantTotal: paiementsFiltered.reduce((sum: number, p: any) => sum + (p.montant || 0), 0),
        nombreCollectes: paiementsFiltered.length,
        montantMoyen: paiementsFiltered.length > 0
          ? paiementsFiltered.reduce((sum: number, p: any) => sum + (p.montant || 0), 0) / paiementsFiltered.length
          : 0
      };

      const recouvrementStats = {
        montantRecouvre: collecteStats.montantTotal,
        tauxRecouvrement: 75,
        dossiersActifs: visitesFiltered.filter((v: any) => v.statut === 'Planifiée').length
      };

      const portefeuilleStats = {
        nombreClients: visites.length > 0 ? new Set(visites.map((v: any) => v.clientId)).size : 0,
        clientsActifs: visitesFiltered.length
      };

      const performanceStats = {
        performance: Math.round((presenceStats.tauxPresence + recouvrementStats.tauxRecouvrement) / 2),
        niveau: 3,
        points: collecteStats.nombreCollectes * 10 + visitesFiltered.length * 5
      };

      setStats({
        presenceStats,
        collecteStats,
        recouvrementStats,
        portefeuilleStats,
        performanceStats
      });
    } catch (error) {
      console.error('Erreur chargement stats:', error);
      setStats({
        presenceStats: { joursPresents: 0, tauxPresence: 0, heuresMoyennes: 0 },
        collecteStats: { montantTotal: 0, nombreCollectes: 0, montantMoyen: 0 },
        recouvrementStats: { montantRecouvre: 0, tauxRecouvrement: 0, dossiersActifs: 0 },
        portefeuilleStats: { nombreClients: 0, clientsActifs: 0 },
        performanceStats: { performance: 0, niveau: 1, points: 0 }
      });
    } finally {
      setLoading(false);
    }
  };

  const getDateFilter = () => {
    const date = new Date();
    switch (selectedPeriod) {
      case 'jour':
        return date.toISOString().split('T')[0];
      case 'semaine':
        date.setDate(date.getDate() - 7);
        return date.toISOString().split('T')[0];
      case 'mois':
        date.setMonth(date.getMonth() - 1);
        return date.toISOString().split('T')[0];
      default:
        return date.toISOString().split('T')[0];
    }
  };

  if (loading) {
    return (
      <Card className="p-8 sm:p-12 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-cyan-500 mb-4"></div>
        <p className="text-sm sm:text-base text-slate-400">Chargement du tableau de bord...</p>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="p-8 sm:p-12 flex flex-col items-center justify-center">
        <AlertCircle className="text-slate-400 mb-4" size={32} />
        <p className="text-sm sm:text-base text-slate-400">Aucune donnée disponible</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-lg sm:text-2xl font-bold text-white">Tableau de Bord</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Vue d'ensemble performance</p>
        </div>
        <div className="flex gap-1 bg-slate-800 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
          {(['jour', 'semaine', 'mois'] as const).map(period => (
            <Button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              variant={selectedPeriod === period ? 'primary' : 'ghost'}
              size="sm"
              className={`text-xs flex-1 sm:flex-none ${selectedPeriod === period ? '' : 'text-slate-400'}`}
            >
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard
            title="Taux Présence"
            value={`${stats.presenceStats.tauxPresence.toFixed(0)}%`}
            icon={Clock}
            color="primary"
            trend={`${stats.presenceStats.joursPresents}j`}
            className="p-2.5 sm:p-3"
        />
        <StatCard
            title="Collectes"
            value={`${(stats.collecteStats.montantTotal / 1000).toFixed(0)}K`}
            icon={Banknote}
            color="success"
            trend={`${stats.collecteStats.nombreCollectes} ops`}
            className="p-2.5 sm:p-3"
        />
        <StatCard
            title="Recouvrement"
            value={`${stats.recouvrementStats.tauxRecouvrement.toFixed(0)}%`}
            icon={Phone}
            color="warning"
            trend={`${stats.recouvrementStats.dossiersActifs} dossiers`}
            className="p-2.5 sm:p-3"
        />
        <StatCard
            title="Clients Actifs"
            value={stats.portefeuilleStats.clientsActifs}
            icon={Users}
            color="neutral"
            trend={`${stats.portefeuilleStats.nombreClients} total`}
            className="p-2.5 sm:p-3"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card className="lg:col-span-2" padding="none">
            <Card.Header className="p-3 sm:p-4 border-b border-slate-700">
                <h3 className="text-sm sm:text-lg font-bold text-white">Performance Globale</h3>
            </Card.Header>
            <Card.Content className="p-3 sm:p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs sm:text-sm font-medium text-slate-400">Présence & Ponctualité</span>
                <span className="text-xs sm:text-sm font-bold text-white">{stats.presenceStats.tauxPresence.toFixed(0)}%</span>
              </div>
              <div className="bg-slate-700/50 rounded-full h-1.5 sm:h-2">
                <div
                  className="bg-blue-500 h-1.5 sm:h-2 rounded-full transition-all duration-500"
                  style={{ width: `${stats.presenceStats.tauxPresence}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs sm:text-sm font-medium text-slate-400">Collectes Cash</span>
                <span className="text-xs sm:text-sm font-bold text-white">
                  {stats.collecteStats.nombreCollectes > 0 ? '95%' : '0%'}
                </span>
              </div>
              <div className="bg-slate-700/50 rounded-full h-1.5 sm:h-2">
                <div
                  className="bg-green-500 h-1.5 sm:h-2 rounded-full transition-all duration-500"
                  style={{ width: stats.collecteStats.nombreCollectes > 0 ? '95%' : '0%' }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs sm:text-sm font-medium text-slate-400">Recouvrement</span>
                <span className="text-xs sm:text-sm font-bold text-white">{stats.recouvrementStats.tauxRecouvrement.toFixed(0)}%</span>
              </div>
              <div className="bg-slate-700/50 rounded-full h-1.5 sm:h-2">
                <div
                  className="bg-orange-500 h-1.5 sm:h-2 rounded-full transition-all duration-500"
                  style={{ width: `${stats.recouvrementStats.tauxRecouvrement}%` }}
                />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2 text-center">
                  <Star className="mx-auto text-cyan-500 mb-1" size={16} fill="currentColor" />
                  <div className="text-base sm:text-lg font-bold text-white">{stats.performanceStats.performance}%</div>
                  <div className="text-[10px] text-slate-400">Performance</div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center">
                  <Award className="mx-auto text-blue-500 mb-1" size={16} />
                  <div className="text-base sm:text-lg font-bold text-white">{stats.performanceStats.niveau}</div>
                  <div className="text-[10px] text-slate-400">Niveau</div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
                  <Zap className="mx-auto text-emerald-500 mb-1" size={16} />
                  <div className="text-base sm:text-lg font-bold text-white">{stats.performanceStats.points}</div>
                  <div className="text-[10px] text-slate-400">Points</div>
                </div>
            </div>
            </Card.Content>
        </Card>

        <div className="space-y-3 sm:space-y-4">
          <Card padding="none">
            <Card.Header className="p-3 sm:p-4 border-b border-slate-700">
                <h3 className="text-sm sm:text-lg font-bold text-white">Objectifs du Jour</h3>
            </Card.Header>
            <Card.Content className="p-3 sm:p-4 space-y-3">
              <div className="flex items-start gap-2">
                <CheckCircle className={`flex-shrink-0 mt-0.5 ${stats.presenceStats.joursPresents > 0 ? 'text-green-500' : 'text-slate-600'}`} size={16} />
                <div className="flex-1">
                  <div className="font-medium text-sm text-white">Pointer arrivée</div>
                  <div className="text-xs text-slate-400">
                    {stats.presenceStats.joursPresents > 0 ? 'Complété' : 'En attente'}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className={`flex-shrink-0 mt-0.5 ${stats.collecteStats.nombreCollectes >= 5 ? 'text-green-500' : 'text-slate-600'}`} size={16} />
                <div className="flex-1">
                  <div className="font-medium text-sm text-white">5 collectes minimum</div>
                  <div className="text-xs text-slate-400">
                    {stats.collecteStats.nombreCollectes}/5 complétées
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className={`flex-shrink-0 mt-0.5 ${stats.portefeuilleStats.clientsActifs >= 3 ? 'text-green-500' : 'text-slate-600'}`} size={16} />
                <div className="flex-1">
                  <div className="font-medium text-sm text-white">Visiter 3 clients</div>
                  <div className="text-xs text-slate-400">
                    {Math.min(stats.portefeuilleStats.clientsActifs, 3)}/3 visites
                  </div>
                </div>
              </div>
            </Card.Content>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-600 to-blue-700 text-white border-none shadow-lg" padding="sm">
            <Card.Content>
            <h3 className="text-sm font-bold mb-2">Prochaine Formation</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-cyan-100" />
                <span className="text-xs text-cyan-50">Demain, 14h00</span>
              </div>
              <div className="font-semibold text-xs text-white">Techniques Recouvrement</div>
              <Button variant="secondary" size="sm" fullWidth className="mt-2 bg-white/20 hover:bg-white/30 border-none text-white text-xs h-7 min-h-0">
                M'inscrire
              </Button>
            </div>
            </Card.Content>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <Card padding="none">
            <Card.Header className="p-3 sm:p-4 border-b border-slate-700">
               <h3 className="text-sm sm:text-lg font-bold text-white">Actions Rapides</h3>
            </Card.Header>
            <Card.Content className="p-3 sm:p-4 grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1.5 border-cyan-800 bg-cyan-900/10 hover:bg-cyan-900/20 active:scale-[0.98] transition-all">
              <Clock className="text-cyan-500" size={20} />
              <div className="font-semibold text-white text-xs">Pointer</div>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1.5 border-green-800 bg-green-900/10 hover:bg-green-900/20 active:scale-[0.98] transition-all">
              <Banknote className="text-green-500" size={20} />
              <div className="font-semibold text-white text-xs">Collecte</div>
            </Button>
             <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1.5 border-emerald-800 bg-emerald-900/10 hover:bg-emerald-900/20 active:scale-[0.98] transition-all">
              <Phone className="text-emerald-500" size={20} />
              <div className="font-semibold text-white text-xs">Appeler</div>
            </Button>
             <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1.5 border-blue-800 bg-blue-900/10 hover:bg-blue-900/20 active:scale-[0.98] transition-all">
              <MapPin className="text-blue-500" size={20} />
              <div className="font-semibold text-white text-xs">Localiser</div>
            </Button>
            </Card.Content>
        </Card>

        <Card padding="none">
          <Card.Header className="p-3 sm:p-4 border-b border-slate-700">
            <h3 className="text-sm sm:text-lg font-bold text-white">Notifications</h3>
          </Card.Header>
          <Card.Content className="p-3 sm:p-4 space-y-2">
            <div className="flex items-start gap-2 p-2 bg-cyan-900/10 border border-cyan-800/30 rounded-lg">
              <AlertCircle className="text-cyan-500 flex-shrink-0 mt-0.5" size={16} />
              <div>
                <div className="font-medium text-white text-xs">3 clients en retard</div>
                <div className="text-[10px] text-slate-400">Action requise aujourd'hui</div>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2 bg-blue-900/10 border border-blue-800/30 rounded-lg">
              <CheckCircle className="text-blue-500 flex-shrink-0 mt-0.5" size={16} />
              <div>
                <div className="font-medium text-white text-xs">Objectif hebdo atteint</div>
                <div className="text-[10px] text-slate-400">+50 points bonus</div>
              </div>
            </div>
            </Card.Content>
        </Card>
      </div>
    </div>
  );
}

