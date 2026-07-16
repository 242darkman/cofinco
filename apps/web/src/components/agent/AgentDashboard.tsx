import React, { useState, useEffect, useCallback } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { TrendingUp, Target, Users, Banknote, Clock, MapPin, Star, Award, Calendar, CheckCircle, AlertCircle, Phone, Zap, RefreshCw, BookOpen, LayoutDashboard, UserCircle, ChevronDown, Search, UserPlus } from 'lucide-react';
import Card from '../ui/Card';
import StatCard from '../ui/StatCard';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { FeatureHeader, FEATURE_DESCRIPTIONS } from '../ui/FeatureHeader';
import { authService } from '../../lib/auth';
import { useIsAdmin } from '../../contexts/AbilityContext';
import { prospectionApi } from '../../lib/api-client';

interface AgentProfile {
  id: string;
  nom: string;
  prenom: string;
  nombreClients?: number;
  objectifMensuel?: number;
  zoneAffectation?: string;
}

interface DashboardStats {
  presenceStats: {
    joursPresents: number;
    totalVisites: number;
    tauxPresence: number;
    heuresMoyennes: number;
  };
  collecteStats: {
    montantTotal: number;
    nombreCollectes: number;
    montantMoyen: number;
  };
  recouvrementStats: {
    tauxRecouvrement: number;
    dossiersActifs: number;
    objectifMontant: number;
    realise: number;
  };
  portefeuilleStats: {
    nombreClients: number;
    clientsActifs: number;
  };
  performanceStats: {
    performance: number;
    objectifsAtteints: number;
    objectifsTotal: number;
    points: number;
  };
  formationProchaine: {
    titre: string;
    dateDebut: string;
    progression: number;
  } | null;
  incidentsOuverts: number;
  communicationsNonLues: number;
  objectifsJour: {
    label: string;
    valeurRealisee: number;
    valeurObjectif: number;
  }[];
}

interface AgentTerrainOption {
  id: string;
  nom: string;
  prenom: string;
  zoneAffectation?: string;
}

interface AgentDashboardProps {
  agentId?: string;
  selectedAgentId?: string | null;
  onAgentChange?: (agentId: string | null) => void;
  embedded?: boolean;
}

function ProspectionKpiSection({ agentId }: { agentId?: string }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) { setLoading(false); return; }
    setLoading(true);
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    prospectionApi.getStats(agentId, { period })
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  if (loading || !stats) return null;

  const prospectsCreated = Number(stats.prospectsCreated || stats.prospects_created || 0);
  const converted = Number(stats.convertedClients || stats.converted_clients || 0);
  const conversionRate = Number(stats.conversionRate || stats.conversion_rate || 0);
  const bonusAmount = Number(stats.bonusAmount || stats.bonus_amount || 0);
  const toFollowUp = Number(stats.toFollowUp || stats.to_follow_up || 0);

  if (prospectsCreated === 0 && converted === 0 && toFollowUp === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-content-secondary flex items-center gap-2">
        <UserPlus size={16} className="text-status-info" />
        Prospection
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-surface/80 border border-edge rounded-xl p-2.5 sm:p-3">
          <div className="text-[10px] font-medium text-content-muted uppercase mb-1">Prospects</div>
          <div className="text-lg font-bold text-content-primary">{prospectsCreated}</div>
          {toFollowUp > 0 && <div className="text-[10px] text-status-warning mt-0.5">{toFollowUp} a suivre</div>}
        </div>
        <div className="bg-surface/80 border border-edge rounded-xl p-2.5 sm:p-3">
          <div className="text-[10px] font-medium text-content-muted uppercase mb-1">Convertis</div>
          <div className="text-lg font-bold text-status-info">{converted}</div>
        </div>
        <div className="bg-surface/80 border border-edge rounded-xl p-2.5 sm:p-3">
          <div className="text-[10px] font-medium text-content-muted uppercase mb-1">Taux Conversion</div>
          <div className="text-lg font-bold text-accent">{conversionRate.toFixed(1)}%</div>
        </div>
        <div className="bg-surface/80 border border-edge rounded-xl p-2.5 sm:p-3">
          <div className="text-[10px] font-medium text-content-muted uppercase mb-1">Primes</div>
          <div className="text-lg font-bold text-status-success">
            {bonusAmount >= 1000 ? `${(bonusAmount / 1000).toFixed(0)}K` : bonusAmount.toLocaleString()} FCFA
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentDashboard({ agentId: propAgentId, selectedAgentId: parentSelectedAgentId, onAgentChange, embedded }: AgentDashboardProps) {
  const [agentProfile, setAgentProfile] = useState<AgentProfile | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notAgentTerrain, setNotAgentTerrain] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'jour' | 'semaine' | 'mois'>('jour');

  // Admin agent selector state
  const isAdmin = useIsAdmin();
  const [agentsList, setAgentsList] = useState<AgentTerrainOption[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  // Use parent's selectedAgentId if provided, otherwise use local state
  const [localSelectedAgentId, setLocalSelectedAgentId] = useState<string | null>(propAgentId || null);
  const selectedAgentId = parentSelectedAgentId !== undefined ? parentSelectedAgentId : localSelectedAgentId;
  const setSelectedAgentId = (id: string | null) => {
    if (onAgentChange) {
      onAgentChange(id);
    } else {
      setLocalSelectedAgentId(id);
    }
  };
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState('');

  const getDateFilter = useCallback(() => {
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
  }, [selectedPeriod]);

  const fetchJson = async (url: string) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return res.json();
  };

  // Load agents list for admin users (skip in embedded mode — parent provides selection)
  useEffect(() => {
    if (isAdmin && !embedded) {
      setLoadingAgents(true);
      fetchJson('/api/agents-terrain')
        .then((response) => {
          // Handle paginated response { data: [...] } or direct array
          const data = Array.isArray(response) ? response : (response?.data || []);
          setAgentsList(data.map((a: any) => ({
            id: a.id,
            nom: a.nom,
            prenom: a.prenom,
            zoneAffectation: a.zone_affectation || a.zoneAffectation || '',
          })));
        })
        .finally(() => setLoadingAgents(false));
    } else {
      setLoadingAgents(false);
    }
  }, [isAdmin]);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);

    try {
      // 1. Resolve agent terrain profile
      let agent: AgentProfile | null = agentProfile;

      // If admin with selected agent, fetch that agent's profile
      if (isAdmin && selectedAgentId) {
        const profileData = await fetchJson(`/api/agents-terrain/${selectedAgentId}`);
        if (profileData && !profileData.error && profileData.id) {
          agent = {
            id: profileData.id,
            nom: profileData.nom,
            prenom: profileData.prenom,
            nombreClients: profileData.nombre_clients || profileData.nombreClients || 0,
            objectifMensuel: Number(profileData.objectif_mensuel || profileData.objectifMensuel || 0),
            zoneAffectation: profileData.zone_affectation || profileData.zoneAffectation || '',
          };
          setAgentProfile(agent);
        } else {
          // Agent not found - reset selection and show selector
          setSelectedAgentId(null);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      } else if (!agent) {
        // Regular user: try to get their own agent profile
        const profileResponse = await fetchJson('/api/agents-terrain/me');
        const profileData = profileResponse?.data;
        if (!profileData || !profileData.id) {
          setNotAgentTerrain(true);
          setLoading(false);
          setRefreshing(false);
          return;
        }
        agent = {
          id: profileData.id,
          nom: profileData.nom,
          prenom: profileData.prenom,
          nombreClients: profileData.nombre_clients || profileData.nombreClients || 0,
          objectifMensuel: Number(profileData.objectif_mensuel || profileData.objectifMensuel || 0),
          zoneAffectation: profileData.zone_affectation || profileData.zoneAffectation || '',
        };
        setAgentProfile(agent);
      }

      // If admin but no agent selected yet, don't load dashboard
      if (isAdmin && !selectedAgentId && !agent) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Guard: ensure we have a valid agent with ID before making API calls
      if (!agent || !agent.id) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const agentTerrainId = agent.id;
      const dateFilter = getDateFilter();
      const now = new Date();
      const currentPeriode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // 2. Fetch all data in parallel
      const [visites, paiements, objectifs, commissions, formationsSuivi, incidents, communications, plannings] = await Promise.all([
        fetchJson(`/api/agents-terrain/${agentTerrainId}/visites`).then(d => Array.isArray(d) ? d : []),
        fetchJson(`/api/agents-terrain/${agentTerrainId}/paiements`).then(d => Array.isArray(d) ? d : []),
        fetchJson(`/api/agent-objectifs?agentId=${agentTerrainId}&periode=${currentPeriode}`).then(d => Array.isArray(d) ? d : (d?.data || [])),
        fetchJson(`/api/agent-commissions?agent_id=${agentTerrainId}&periode=${currentPeriode}`).then(d => Array.isArray(d) ? d : (d?.data || [])),
        fetchJson(`/api/agent-formations-suivi?agent_id=${agentTerrainId}`).then(d => Array.isArray(d) ? d : (d?.data || [])),
        fetchJson(`/api/agent-incidents?agentId=${agentTerrainId}`).then(d => Array.isArray(d) ? d : (d?.data || [])),
        fetchJson(`/api/agent-communications?agent_id=${agentTerrainId}`).then(d => Array.isArray(d) ? d : (d?.data || [])),
        fetchJson(`/api/agent-planning?agentId=${agentTerrainId}&date=${now.toISOString().split('T')[0]}`).then(d => Array.isArray(d) ? d : (d?.data || [])),
      ]);

      // 3. Filter by period
      const filterDate = new Date(dateFilter);
      const visitesFiltered = visites.filter((v: any) => {
        const d = new Date(v.dateVisite);
        return d >= filterDate;
      });
      const paiementsFiltered = paiements.filter((p: any) => {
        const d = new Date(p.createdAt);
        return d >= filterDate;
      });

      // 4. Compute stats
      const visitesEffectuees = visitesFiltered.filter((v: any) => (v.statut || '').toUpperCase() === 'COMPLETED' || v.statut === 'Effectuée');
      const totalVisites = visitesFiltered.length;

      // Hours average: parse heureDebut/heureFin
      let totalHours = 0;
      let hoursCount = 0;
      visitesEffectuees.forEach((v: any) => {
        const debut = v.heureDebut || v.heure_debut;
        const fin = v.heureFin || v.heure_fin;
        if (debut && fin) {
          const [dh, dm] = debut.split(':').map(Number);
          const [fh, fm] = fin.split(':').map(Number);
          if (!isNaN(dh) && !isNaN(fh)) {
            totalHours += (fh + fm / 60) - (dh + dm / 60);
            hoursCount++;
          }
        }
      });

      const presenceStats = {
        joursPresents: visitesEffectuees.length,
        totalVisites,
        tauxPresence: totalVisites > 0 ? (visitesEffectuees.length / totalVisites) * 100 : 0,
        heuresMoyennes: hoursCount > 0 ? totalHours / hoursCount : 0,
      };

      const montantTotal = paiementsFiltered.reduce((sum: number, p: any) => sum + Number(p.montant || 0), 0);
      const collecteStats = {
        montantTotal,
        nombreCollectes: paiementsFiltered.length,
        montantMoyen: paiementsFiltered.length > 0 ? montantTotal / paiementsFiltered.length : 0,
      };

      // Recouvrement from objectifs
      const objRecouvrement = objectifs.find((o: any) =>
        (o.type_objectif || o.typeObjectif) === 'Recouvrement' || (o.type_objectif || o.typeObjectif) === 'Collecte'
      );
      const recouvrementStats = {
        objectifMontant: Number(objRecouvrement?.valeur_objectif || objRecouvrement?.valeurObjectif || 0),
        realise: Number(objRecouvrement?.valeur_realisee || objRecouvrement?.valeurRealisee || 0),
        tauxRecouvrement: objRecouvrement
          ? (Number(objRecouvrement.valeur_objectif || objRecouvrement.valeurObjectif) > 0
            ? (Number(objRecouvrement.valeur_realisee || objRecouvrement.valeurRealisee) / Number(objRecouvrement.valeur_objectif || objRecouvrement.valeurObjectif)) * 100
            : 0)
          : 0,
        dossiersActifs: objectifs.filter((o: any) => (o.statut || '').toUpperCase() === 'IN_PROGRESS').length,
      };

      // Portfolio
      const uniqueClients = new Set(visites.map((v: any) => v.clientId).filter(Boolean));
      const portefeuilleStats = {
        nombreClients: agent.nombreClients || uniqueClients.size,
        clientsActifs: new Set(visitesFiltered.map((v: any) => v.clientId).filter(Boolean)).size,
      };

      // Performance from all objectifs
      const objectifsAtteints = objectifs.filter((o: any) => (o.statut || '').toUpperCase() === 'COMPLETED').length;
      const objectifsTotal = objectifs.length;
      const avgCompletion = objectifsTotal > 0
        ? objectifs.reduce((sum: number, o: any) => {
            const obj = Number(o.valeur_objectif || o.valeurObjectif || 1);
            const real = Number(o.valeur_realisee || o.valeurRealisee || 0);
            return sum + Math.min((real / obj) * 100, 100);
          }, 0) / objectifsTotal
        : 0;

      const totalCommission = commissions.reduce((sum: number, c: any) =>
        sum + Number(c.montant_commission || c.montantCommission || 0), 0);

      const performanceStats = {
        performance: Math.round(avgCompletion),
        objectifsAtteints,
        objectifsTotal,
        points: Math.round(totalCommission / 100) + collecteStats.nombreCollectes * 10 + visitesEffectuees.length * 5,
      };

      // Next formation
      const inProgressFormations = formationsSuivi
        .filter((f: any) => (f.statut || '').toUpperCase() === 'IN_PROGRESS')
        .sort((a: any, b: any) => {
          const da = a.dateDebut || '';
          const db2 = b.dateDebut || '';
          return da.localeCompare(db2);
        });

      const nextFormation = inProgressFormations[0];
      const formationProchaine = nextFormation ? {
        titre: nextFormation.formation?.titre || nextFormation.titre || 'Formation en cours',
        dateDebut: nextFormation.dateDebut || '',
        progression: Number(nextFormation.progression || 0),
      } : null;

      // Open incidents
      const incidentsOuverts = incidents.filter((i: any) => (i.statut || '').toUpperCase() === 'OPEN').length;

      // Unread communications
      const communicationsNonLues = communications.filter((c: any) => !(c.lu)).length;

      // Today's objectives from plannings
      const todayPlannings = plannings.filter((p: any) => (p.statut || '').toUpperCase() !== 'CANCELLED');
      const objectifsJour = [
        {
          label: 'Visites planifiees',
          valeurRealisee: visitesEffectuees.length,
          valeurObjectif: Math.max(todayPlannings.length, 1),
        },
        {
          label: 'Collectes',
          valeurRealisee: paiementsFiltered.filter((p: any) => {
            const d = new Date(p.createdAt);
            return d.toISOString().split('T')[0] === now.toISOString().split('T')[0];
          }).length,
          valeurObjectif: Math.max(Number(agent.objectifMensuel || 0) > 0 ? Math.ceil(Number(agent.objectifMensuel) / 22) : 5, 1),
        },
        {
          label: 'Clients visites',
          valeurRealisee: portefeuilleStats.clientsActifs,
          valeurObjectif: Math.max(todayPlannings.length, 3),
        },
      ];

      setStats({
        presenceStats,
        collecteStats,
        recouvrementStats,
        portefeuilleStats,
        performanceStats,
        formationProchaine,
        incidentsOuverts,
        communicationsNonLues,
        objectifsJour,
      });
    } catch (error) {
      // Don't set fallback stats - show error state instead
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentProfile, getDateFilter, isAdmin, selectedAgentId]);

  // Load on period change or agent selection
  useEffect(() => {
    loadDashboard(false);
  }, [selectedPeriod, selectedAgentId]);

  // Reset agent profile when admin selects different agent
  useEffect(() => {
    if (isAdmin && selectedAgentId) {
      setAgentProfile(null);
      setStats(null);
      setNotAgentTerrain(false);
    }
  }, [isAdmin, selectedAgentId]);

  // Refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => loadDashboard(true), 60000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  // Filter agents for admin selector
  const filteredAgents = agentsList.filter((a) =>
    `${a.prenom} ${a.nom}`.toLowerCase().includes(agentSearchQuery.toLowerCase()) ||
    (a.zoneAffectation || '').toLowerCase().includes(agentSearchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <Card className="p-8 sm:p-12 flex flex-col items-center justify-center">
        <Spinner size="md" className="sm:h-12 sm:w-12 mb-4" />
        <p className="text-sm sm:text-base text-content-muted">Chargement du tableau de bord...</p>
      </Card>
    );
  }

  // Admin without agent selected - show selector (only in standalone mode)
  if (isAdmin && !selectedAgentId && !agentProfile && !embedded) {
    return (
      <div className="space-y-4">
        <FeatureHeader
          featureKey="agent.dashboard"
          title="Tableau de Bord Agent Terrain"
          subtitle="Mode Administrateur - Selectionnez un agent pour voir son tableau de bord"
          helpText={FEATURE_DESCRIPTIONS['agent.dashboard'].helpText}
          icon={<LayoutDashboard size={24} />}
        />
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <UserCircle className="text-accent" size={24} />
            <h3 className="text-lg font-semibold text-content-primary">Selectionnez un Agent Terrain</h3>
          </div>
          <p className="text-sm text-content-muted mb-4">
            En tant qu'administrateur, vous pouvez visualiser le tableau de bord de n'importe quel agent terrain.
          </p>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={18} />
            <input
              type="text"
              placeholder="Rechercher un agent..."
              value={agentSearchQuery}
              onChange={(e) => setAgentSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-edge rounded-lg text-content-primary placeholder:text-content-muted focus:border-accent focus:outline-none"
            />
          </div>

          {/* Agents list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
            {loadingAgents ? (
              <div className="col-span-full text-center py-8 text-content-muted">
                <Spinner size="sm" className="mx-auto mb-2" />
                Chargement des agents...
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="col-span-full text-center py-8 text-content-muted">
                {agentSearchQuery ? 'Aucun agent correspondant à la recherche' : 'Aucun agent terrain enregistré'}
              </div>
            ) : (
              filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className="flex items-center gap-3 p-4 bg-surface hover:bg-surface-elevated border border-edge hover:border-accent/50 rounded-xl transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <UserCircle className="text-accent" size={24} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-content-primary truncate">{agent.prenom} {agent.nom}</p>
                    {agent.zoneAffectation && (
                      <p className="text-xs text-content-muted truncate">{agent.zoneAffectation}</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Non-admin without agent profile
  if (notAgentTerrain && !isAdmin) {
    return (
      <Card className="p-8 sm:p-12 flex flex-col items-center justify-center">
        <Users className="text-status-warning mb-4" size={40} />
        <p className="text-base sm:text-lg font-semibold text-content-secondary mb-2">Profil agent terrain non trouve</p>
        <p className="text-sm text-content-muted text-center max-w-md">
          Votre compte utilisateur n'est pas associe a un profil d'agent terrain.
          Contactez l'administrateur pour configurer votre acces.
        </p>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="p-8 sm:p-12 flex flex-col items-center justify-center">
        <AlertCircle className="text-content-muted mb-4" size={32} />
        <p className="text-sm sm:text-base text-content-muted">Aucune donnee disponible</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => loadDashboard(false)}>
          Reessayer
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header with contextual help */}
      <FeatureHeader
        featureKey="agent.dashboard"
        title={FEATURE_DESCRIPTIONS['agent.dashboard'].title}
        subtitle={
          agentProfile
            ? `${agentProfile.prenom} ${agentProfile.nom}${agentProfile.zoneAffectation ? ` - ${agentProfile.zoneAffectation}` : ''}`
            : FEATURE_DESCRIPTIONS['agent.dashboard'].subtitle
        }
        helpText={FEATURE_DESCRIPTIONS['agent.dashboard'].helpText}
        icon={<LayoutDashboard size={24} />}
        actions={
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {/* Admin agent selector dropdown (hidden in embedded mode — parent controls selection) */}
            {isAdmin && !embedded && (
              <div className="relative">
                <button
                  onClick={() => setShowAgentSelector(!showAgentSelector)}
                  className="flex items-center gap-2 px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary hover:border-accent/50 transition"
                >
                  <UserCircle size={16} className="text-accent" />
                  <span className="hidden sm:inline max-w-[150px] truncate">
                    {agentProfile ? `${agentProfile.prenom} ${agentProfile.nom}` : 'Changer agent'}
                  </span>
                  <ChevronDown size={14} className={`transition-transform ${showAgentSelector ? 'rotate-180' : ''}`} />
                </button>

                {showAgentSelector && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowAgentSelector(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-72 bg-surface-base border border-edge rounded-xl shadow-2xl z-50 overflow-hidden">
                      <div className="p-2 border-b border-edge">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" size={14} />
                          <input
                            type="text"
                            placeholder="Rechercher..."
                            value={agentSearchQuery}
                            onChange={(e) => setAgentSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-surface border border-edge rounded-lg text-sm text-content-primary placeholder:text-content-muted focus:border-accent focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {filteredAgents.map((agent) => (
                          <button
                            key={agent.id}
                            onClick={() => {
                              setSelectedAgentId(agent.id);
                              setShowAgentSelector(false);
                              setAgentSearchQuery('');
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface transition ${
                              selectedAgentId === agent.id ? 'bg-accent/10 text-accent' : 'text-content-primary'
                            }`}
                          >
                            <UserCircle size={16} />
                            <span className="truncate">{agent.prenom} {agent.nom}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex gap-1 bg-surface p-1 rounded-lg flex-1 sm:flex-none overflow-x-auto">
              {(['jour', 'semaine', 'mois'] as const).map(period => (
                <Button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  variant={selectedPeriod === period ? 'primary' : 'ghost'}
                  size="sm"
                  className={`text-xs flex-1 sm:flex-none ${selectedPeriod === period ? '' : 'text-content-muted'}`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadDashboard(true)}
              className="text-content-muted"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard
          title="Taux Presence"
          value={`${stats.presenceStats.tauxPresence.toFixed(0)}%`}
          icon={Clock}
          color="primary"
          trend={`${stats.presenceStats.joursPresents}/${stats.presenceStats.totalVisites} visites`}
          className="p-2.5 sm:p-3"
        />
        <StatCard
          title="Collectes"
          value={stats.collecteStats.montantTotal >= 1000
            ? `${(stats.collecteStats.montantTotal / 1000).toFixed(0)}K`
            : stats.collecteStats.montantTotal.toLocaleString()}
          icon={Banknote}
          color="success"
          trend={`${stats.collecteStats.nombreCollectes} ops`}
          className="p-2.5 sm:p-3"
        />
        <StatCard
          title="Recouvrement"
          value={`${stats.recouvrementStats.tauxRecouvrement.toFixed(0)}%`}
          icon={Target}
          color="warning"
          trend={`${stats.recouvrementStats.dossiersActifs} objectifs actifs`}
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

      {/* Prospection KPIs */}
      <ProspectionKpiSection agentId={agentProfile?.id} />

      {/* Performance + Objectifs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card className="lg:col-span-2" padding="none">
          <Card.Header as="div" className="p-3 sm:p-4 border-b border-edge">
            <h3 className="text-sm sm:text-lg font-bold text-content-primary">Performance Globale</h3>
          </Card.Header>
          <Card.Content className="p-3 sm:p-4 space-y-4">
            {/* Presence bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs sm:text-sm font-medium text-content-muted">Presence & Ponctualite</span>
                <span className="text-xs sm:text-sm font-bold text-content-primary">{stats.presenceStats.tauxPresence.toFixed(0)}%</span>
              </div>
              <div className="bg-surface-elevated/50 rounded-full h-1.5 sm:h-2">
                <div
                  className="bg-status-info h-1.5 sm:h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(stats.presenceStats.tauxPresence, 100)}%` }}
                />
              </div>
            </div>

            {/* Collectes bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs sm:text-sm font-medium text-content-muted">Collectes Cash</span>
                <span className="text-xs sm:text-sm font-bold text-content-primary">
                  {stats.recouvrementStats.objectifMontant > 0
                    ? `${Math.min((stats.collecteStats.montantTotal / stats.recouvrementStats.objectifMontant) * 100, 100).toFixed(0)}%`
                    : `${stats.collecteStats.nombreCollectes} ops`}
                </span>
              </div>
              <div className="bg-surface-elevated/50 rounded-full h-1.5 sm:h-2">
                <div
                  className="bg-status-success h-1.5 sm:h-2 rounded-full transition-all duration-500"
                  style={{
                    width: stats.recouvrementStats.objectifMontant > 0
                      ? `${Math.min((stats.collecteStats.montantTotal / stats.recouvrementStats.objectifMontant) * 100, 100)}%`
                      : stats.collecteStats.nombreCollectes > 0 ? '100%' : '0%'
                  }}
                />
              </div>
            </div>

            {/* Recouvrement bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs sm:text-sm font-medium text-content-muted">Recouvrement</span>
                <span className="text-xs sm:text-sm font-bold text-content-primary">{stats.recouvrementStats.tauxRecouvrement.toFixed(0)}%</span>
              </div>
              <div className="bg-surface-elevated/50 rounded-full h-1.5 sm:h-2">
                <div
                  className="bg-status-warning h-1.5 sm:h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(stats.recouvrementStats.tauxRecouvrement, 100)}%` }}
                />
              </div>
            </div>

            {/* Performance summary cards */}
            <div className="mt-6 grid grid-cols-3 gap-2">
              <div className="bg-accent/10 border border-accent/20 rounded-lg p-2 text-center">
                <Star className="mx-auto text-accent mb-1" size={16} fill="currentColor" />
                <div className="text-base sm:text-lg font-bold text-content-primary">{stats.performanceStats.performance}%</div>
                <div className="text-[10px] text-content-muted">Performance</div>
              </div>
              <div className="bg-status-info-bg border border-status-info/20 rounded-lg p-2 text-center">
                <Award className="mx-auto text-status-info mb-1" size={16} />
                <div className="text-base sm:text-lg font-bold text-content-primary">
                  {stats.performanceStats.objectifsAtteints}/{stats.performanceStats.objectifsTotal}
                </div>
                <div className="text-[10px] text-content-muted">Objectifs</div>
              </div>
              <div className="bg-status-success-bg border border-status-success/20 rounded-lg p-2 text-center">
                <Zap className="mx-auto text-status-success mb-1" size={16} />
                <div className="text-base sm:text-lg font-bold text-content-primary">{stats.performanceStats.points}</div>
                <div className="text-[10px] text-content-muted">Points</div>
              </div>
            </div>
          </Card.Content>
        </Card>

        {/* Objectifs du Jour + Formation */}
        <div className="space-y-3 sm:space-y-4">
          <Card padding="none">
            <Card.Header as="div" className="p-3 sm:p-4 border-b border-edge">
              <h3 className="text-sm sm:text-lg font-bold text-content-primary">Objectifs du Jour</h3>
            </Card.Header>
            <Card.Content className="p-3 sm:p-4 space-y-3">
              {stats.objectifsJour.map((obj, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <CheckCircle
                    className={`flex-shrink-0 mt-0.5 ${obj.valeurRealisee >= obj.valeurObjectif ? 'text-status-success' : 'text-content-muted'}`}
                    size={16}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-content-primary">{obj.label}</div>
                    <div className="text-xs text-content-muted">
                      {obj.valeurRealisee}/{obj.valeurObjectif} {obj.valeurRealisee >= obj.valeurObjectif ? 'Complete' : 'En cours'}
                    </div>
                  </div>
                </div>
              ))}
            </Card.Content>
          </Card>

          {/* Prochaine formation */}
          {stats.formationProchaine ? (
            <Card className="bg-gradient-to-br from-accent to-status-info text-white border-none shadow-lg" padding="sm">
              <Card.Content>
                <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                  <BookOpen size={14} /> Formation en cours
                </h3>
                <div className="space-y-2">
                  <div className="font-semibold text-xs text-content-primary">{stats.formationProchaine.titre}</div>
                  {stats.formationProchaine.dateDebut && (
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-accent" />
                      <span className="text-xs text-accent">
                        Debut: {new Date(stats.formationProchaine.dateDebut).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  )}
                  <div className="w-full bg-white/20 rounded-full h-1.5 mt-1">
                    <div
                      className="bg-white h-1.5 rounded-full transition-all"
                      style={{ width: `${stats.formationProchaine.progression}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-accent text-right">{stats.formationProchaine.progression}% complete</div>
                </div>
              </Card.Content>
            </Card>
          ) : (
            <Card className="bg-surface/50 border-edge" padding="sm">
              <Card.Content className="flex flex-col items-center justify-center py-4 text-center">
                <BookOpen size={20} className="text-content-muted mb-2" />
                <p className="text-xs text-content-muted">Aucune formation en cours</p>
              </Card.Content>
            </Card>
          )}
        </div>
      </div>

      {/* Actions Rapides + Alertes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <Card padding="none">
          <Card.Header as="div" className="p-3 sm:p-4 border-b border-edge">
            <h3 className="text-sm sm:text-lg font-bold text-content-primary">Resume Activite</h3>
          </Card.Header>
          <Card.Content className="p-3 sm:p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface/50 rounded-lg p-3 text-center border border-edge-subtle">
                <Banknote className="mx-auto text-status-success mb-1.5" size={20} />
                <div className="text-lg font-bold text-content-primary">{stats.collecteStats.nombreCollectes}</div>
                <div className="text-[10px] text-content-muted uppercase">Collectes</div>
              </div>
              <div className="bg-surface/50 rounded-lg p-3 text-center border border-edge-subtle">
                <MapPin className="mx-auto text-status-info mb-1.5" size={20} />
                <div className="text-lg font-bold text-content-primary">{stats.presenceStats.joursPresents}</div>
                <div className="text-[10px] text-content-muted uppercase">Visites</div>
              </div>
              <div className="bg-surface/50 rounded-lg p-3 text-center border border-edge-subtle">
                <Clock className="mx-auto text-accent mb-1.5" size={20} />
                <div className="text-lg font-bold text-content-primary">{stats.presenceStats.heuresMoyennes.toFixed(1)}h</div>
                <div className="text-[10px] text-content-muted uppercase">Moy. heures</div>
              </div>
              <div className="bg-surface/50 rounded-lg p-3 text-center border border-edge-subtle">
                <TrendingUp className="mx-auto text-status-success mb-1.5" size={20} />
                <div className="text-lg font-bold text-content-primary">{stats.collecteStats.montantMoyen > 0 ? `${(stats.collecteStats.montantMoyen / 1000).toFixed(0)}K` : '0'}</div>
                <div className="text-[10px] text-content-muted uppercase">Moy. collecte</div>
              </div>
            </div>
          </Card.Content>
        </Card>

        <Card padding="none">
          <Card.Header as="div" className="p-3 sm:p-4 border-b border-edge">
            <h3 className="text-sm sm:text-lg font-bold text-content-primary">Alertes</h3>
          </Card.Header>
          <Card.Content className="p-3 sm:p-4 space-y-2">
            {stats.incidentsOuverts > 0 && (
              <div className="flex items-start gap-2 p-2 bg-status-danger-bg border border-status-danger/30/30 rounded-lg">
                <AlertCircle className="text-status-danger flex-shrink-0 mt-0.5" size={16} />
                <div>
                  <div className="font-medium text-content-primary text-xs">{stats.incidentsOuverts} incident{stats.incidentsOuverts > 1 ? 's' : ''} ouvert{stats.incidentsOuverts > 1 ? 's' : ''}</div>
                  <div className="text-[10px] text-content-muted">Action requise</div>
                </div>
              </div>
            )}
            {stats.communicationsNonLues > 0 && (
              <div className="flex items-start gap-2 p-2 bg-status-info-bg border border-status-info/20 rounded-lg">
                <Phone className="text-status-info flex-shrink-0 mt-0.5" size={16} />
                <div>
                  <div className="font-medium text-content-primary text-xs">{stats.communicationsNonLues} message{stats.communicationsNonLues > 1 ? 's' : ''} non lu{stats.communicationsNonLues > 1 ? 's' : ''}</div>
                  <div className="text-[10px] text-content-muted">Communication interne</div>
                </div>
              </div>
            )}
            {stats.recouvrementStats.dossiersActifs > 0 && (
              <div className="flex items-start gap-2 p-2 bg-status-warning-bg border border-status-warning/20 rounded-lg">
                <Target className="text-status-warning flex-shrink-0 mt-0.5" size={16} />
                <div>
                  <div className="font-medium text-content-primary text-xs">{stats.recouvrementStats.dossiersActifs} objectif{stats.recouvrementStats.dossiersActifs > 1 ? 's' : ''} en cours</div>
                  <div className="text-[10px] text-content-muted">
                    Progression: {stats.recouvrementStats.tauxRecouvrement.toFixed(0)}%
                  </div>
                </div>
              </div>
            )}
            {stats.incidentsOuverts === 0 && stats.communicationsNonLues === 0 && stats.recouvrementStats.dossiersActifs === 0 && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle className="text-status-success mb-2" size={24} />
                <p className="text-xs text-content-muted">Aucune alerte en cours</p>
              </div>
            )}
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
