import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Wallet, User, Lock, RefreshCw, AlertTriangle, TrendingUp, Clock, Building2, Search, ChevronLeft, ChevronRight, Eye, UserX, UserCheck, BarChart3, X, ShieldAlert, Shield } from 'lucide-react';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import { sessionCaisseApi, authApi, userApi } from '../../../lib/api-client';
import { useAgence } from '../../../contexts/AgenceContext';
import { authService } from '../../../lib/auth';
import SupervisionConfirmModal, { SupervisionSession } from './shared/SupervisionConfirmModal';

// Types pour les filtres
type CaissierStatusFilter = 'all' | 'en_caisse' | 'hors_caisse' | 'inactif';

// Hook pour vérifier les permissions dynamiquement depuis la BDD
function useSupervisionPermissions() {
  // Les permissions sont chargées dynamiquement depuis /api/my-permissions
  // et stockées dans authService lors du login

  return {
    // Accès au module caisse
    canViewCaisse: authService.hasPermission('caisse', 'view'),
    canManageCaisse: authService.hasPermission('caisse', 'manage'),

    // Gestion des utilisateurs
    canViewUsers: authService.hasPermission('users', 'view'),
    canEditUsers: authService.hasPermission('users', 'edit'),

    // Actions spécifiques
    canTakeControl: authService.hasPermission('caisse', 'manage'),
    canForceClose: authService.hasPermission('caisse', 'manage'),
    canToggleUserStatus: authService.hasPermission('users', 'edit'),

    // Admin check
    isAdmin: authService.isAdmin(),
  };
}

export interface SupervisionCallbackData {
  session: any;
  supervisionInfo: SupervisionSession;
}

export default function CaisseSupervision({
  onTakeControl,
  activeSupervision,
  onSupervisionStart
}: {
  onTakeControl?: (session: any, supervisionInfo: SupervisionSession) => void;
  activeSupervision?: SupervisionSession | null;
  onSupervisionStart?: (data: SupervisionCallbackData) => void;
}) {
  const [activeTab, setActiveTab] = useState<'sessions' | 'caissiers' | 'alertes'>('sessions');
  const [sessions, setSessions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Contexte d'agence pour le sélecteur
  const { agences, selectedAgence, selectAgence } = useAgence();
  const currentUser = authService.getCurrentUser();

  // Permissions dynamiques depuis la BDD
  const permissions = useSupervisionPermissions();

  // Supervision confirmation modal state
  const [showSupervisionConfirm, setShowSupervisionConfirm] = useState(false);
  const [pendingSupervisionSession, setPendingSupervisionSession] = useState<any>(null);
  const [confirmingSupervision, setConfirmingSupervision] = useState(false);

  // Filtres et pagination pour les caissiers
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CaissierStatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  useEffect(() => {
    fetchData();

    // Écoute des événements WebSocket
    const handleRealTimeUpdate = () => {
        fetchData();
    };

    window.addEventListener('caisse-update', handleRealTimeUpdate);
    return () => window.removeEventListener('caisse-update', handleRealTimeUpdate);
  }, [selectedAgence]); // Refetch when selected agency changes

  // Reset pagination quand les filtres changent
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isClosingOpen, setIsClosingOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // User Management State
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [userStats, setUserStats] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sessionsData, usersData] = await Promise.all([
        sessionCaisseApi.getAll(),
        authApi.getUsers().catch(() => [])
      ]);
      setSessions(sessionsData || []);
      setUsers(usersData || []);
    } catch (error) {
      console.error("Erreur chargement supervision", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (session: any) => {
    try {
      setLoading(true);
      const details = await sessionCaisseApi.get(session.id);
      setSelectedSession(details);
      setIsDetailsOpen(true);
    } catch (error) {
      console.error("Erreur chargement détails session", error);
    } finally {
      setLoading(false);
    }
  };

  const handleForceClose = async () => {
    if (!selectedSession) return;
    
    setSubmitting(true);
    try {
      // Force closure with current theoretical balance as real balance
      await sessionCaisseApi.close(selectedSession.id, {
        solde_reel: selectedSession.solde_theorique,
        ecart: "0",
        billetage_fermeture: {},
        observations: "Fermeture forcée par l'administrateur depuis la supervision."
      });
      setIsClosingOpen(false);
      setSelectedSession(null);
      fetchData();
    } catch (error) {
      console.error("Erreur lors de la fermeture forcée", error);
    } finally {
      setSubmitting(false);
    }
  };

  const activeSessions = sessions.filter(s => ['ouverte', 'ouvert'].includes(s.statut?.toLowerCase()));
  const closedSessions = sessions.filter(s => ['fermée', 'fermé', 'ferme'].includes(s.statut?.toLowerCase()));
  const totalEspeces = activeSessions.reduce((acc, s) => acc + (Number(s.solde_theorique) || 0), 0);

  // Liste des caissiers filtrés
  const caissierRoles = ['Agent Caisse', 'Caissier', 'Administrateur', 'Superviseur'];
  const allCaissiers = users.filter(u => caissierRoles.includes(u.role));

  // Helper pour vérifier si un caissier est actuellement en caisse
  const isUserEnCaisse = (userId: string) => {
    return activeSessions.some(s => s.caissier_id === userId);
  };

  // Filtrage des caissiers
  const filteredCaissiers = useMemo(() => {
    return allCaissiers.filter(user => {
      // Filtre par recherche
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery ||
        user.nom?.toLowerCase().includes(searchLower) ||
        user.prenom?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower);

      // Filtre par statut
      const enCaisse = isUserEnCaisse(user.id);
      let matchesStatus = true;
      switch (statusFilter) {
        case 'en_caisse':
          matchesStatus = enCaisse && user.statut === 'Actif';
          break;
        case 'hors_caisse':
          matchesStatus = !enCaisse && user.statut === 'Actif';
          break;
        case 'inactif':
          matchesStatus = user.statut !== 'Actif';
          break;
        default:
          matchesStatus = true;
      }

      return matchesSearch && matchesStatus;
    });
  }, [allCaissiers, searchQuery, statusFilter, activeSessions]);

  // Pagination
  const totalPages = Math.ceil(filteredCaissiers.length / ITEMS_PER_PAGE);
  const paginatedCaissiers = filteredCaissiers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Compteurs pour les filtres
  const filterCounts = useMemo(() => ({
    all: allCaissiers.length,
    en_caisse: allCaissiers.filter(u => isUserEnCaisse(u.id) && u.statut === 'Actif').length,
    hors_caisse: allCaissiers.filter(u => !isUserEnCaisse(u.id) && u.statut === 'Actif').length,
    inactif: allCaissiers.filter(u => u.statut !== 'Actif').length,
  }), [allCaissiers, activeSessions]);

  // Tabs conditionnels selon les permissions
  const tabs = [
    { key: 'sessions', label: 'Caisses Ouvertes', icon: Wallet, badge: activeSessions.length },
    // L'onglet Caissiers est visible uniquement si l'utilisateur a la permission de voir les users
    ...(permissions.canViewUsers ? [{ key: 'caissiers', label: 'Caissiers', icon: User }] : []),
    // { key: 'alertes', label: 'Anomalies', icon: AlertTriangle, badge: 0 }
  ];

  const handleManageUser = async (user: any) => {
    setSelectedUser(user);
    setIsUserManagementOpen(true);
    setLoadingHistory(true);
    setUserStats(null);
    try {
      const history = await sessionCaisseApi.getByCaissier(user.id);
      setUserHistory(history || []);

      // Calculer les statistiques du caissier
      if (history && history.length > 0) {
        const closedHistory = history.filter((s: any) => ['fermée', 'fermé', 'ferme'].includes(s.statut?.toLowerCase()));
        const totalEncaisse = closedHistory.reduce((acc: number, s: any) => {
          const ops = s.operations || [];
          const depots = ops.filter((o: any) => !(o.type_operation || '').toLowerCase().includes('retrait'));
          return acc + depots.reduce((sum: number, o: any) => sum + Number(o.montant || 0), 0);
        }, 0);

        const totalEcarts = closedHistory.reduce((acc: number, s: any) => acc + Math.abs(Number(s.ecart || 0)), 0);

        setUserStats({
          totalSessions: history.length,
          sessionsThisMonth: history.filter((s: any) => {
            const d = new Date(s.date_ouverture);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length,
          totalEncaisse,
          ecartMoyen: closedHistory.length > 0 ? totalEcarts / closedHistory.length : 0,
        });
      }
    } catch (error) {
      console.error("Erreur chargement historique utilisateur", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Trouver la session active d'un caissier
  const getActiveSessionForUser = (userId: string) => {
    return activeSessions.find(s => s.caissier_id === userId);
  };

  const handleToggleUserStatus = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      const newStatus = selectedUser.statut === 'Actif' ? 'Inactif' : 'Actif';
      await userApi.update(selectedUser.id, { statut: newStatus });
      
      // Update local state
      setUsers((prev: any[]) => prev.map(u => u.id === selectedUser.id ? { ...u, statut: newStatus } : u));
      setSelectedUser((prev: any) => ({ ...prev, statut: newStatus }));
      
      // Refresh global data to ensure consistency (e.g. if status affects session eligibility)
      fetchData();
    } catch (error) {
      console.error("Erreur modification statut utilisateur", error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(amount);
  };

  const formatTimeAgo = (date: string) => {
    if (!date) return '-';
    const diff = (new Date().getTime() - new Date(date).getTime()) / 1000 / 60; // minutes
    if (diff < 60) return `${Math.floor(diff)} min`;
    const hours = Math.floor(diff / 60);
    return `${hours}h ${Math.floor(diff % 60)}min`;
  };

  // Handle clicking "Prendre la main" - opens confirmation modal
  const handleRequestSupervision = useCallback((session: any) => {
    // Check if user already has an active supervision
    if (activeSupervision) {
      setPendingSupervisionSession(session);
      setShowSupervisionConfirm(true);
      return;
    }
    setPendingSupervisionSession(session);
    setShowSupervisionConfirm(true);
  }, [activeSupervision]);

  // Handle confirmed supervision
  const handleConfirmSupervision = useCallback((reason: string, reasonDetail?: string) => {
    if (!pendingSupervisionSession || !currentUser) return;

    setConfirmingSupervision(true);

    const supervisionInfo: SupervisionSession = {
      sessionId: pendingSupervisionSession.id,
      targetCaissierName: pendingSupervisionSession.caissier_nom || 'Inconnu',
      targetCaisseName: pendingSupervisionSession.caisse_nom || 'Caisse',
      targetAgenceName: pendingSupervisionSession.agence_nom,
      currentBalance: Number(pendingSupervisionSession.solde_theorique) || 0,
      openedAt: pendingSupervisionSession.date_ouverture,
      supervisorId: currentUser.id,
      supervisorName: `${currentUser.prenom || ''} ${currentUser.nom || currentUser.name || ''}`.trim(),
      reason,
      reasonDetail,
      startedAt: new Date(),
      maxDurationMinutes: 30,
    };

    // Call parent callback
    if (onTakeControl) {
      onTakeControl(pendingSupervisionSession, supervisionInfo);
    }
    if (onSupervisionStart) {
      onSupervisionStart({ session: pendingSupervisionSession, supervisionInfo });
    }

    // Close modal and reset state
    setShowSupervisionConfirm(false);
    setPendingSupervisionSession(null);
    setConfirmingSupervision(false);
  }, [pendingSupervisionSession, currentUser, onTakeControl, onSupervisionStart]);

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      
      {/* Sélecteur d'agence pour Admin */}
      {permissions.isAdmin && agences.length > 1 && (
        <div className="flex items-center gap-3 p-3 bg-slate-900/50 backdrop-blur-md border border-slate-800/60 rounded-xl">
          <Building2 size={18} className="text-cyan-400" />
          <span className="text-sm text-slate-400">Supervision :</span>
          <select
            value={selectedAgence?.id || 'all'}
            onChange={(e) => selectAgence(e.target.value)}
            className="flex-1 max-w-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            {agences.map(ua => (
              <option key={ua.agence.id} value={ua.agence.id}>
                {ua.agence.nom}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* KPI Supervision - optimisé mobile */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {/* KPI Principal - Fonds */}
        <div className="col-span-3 sm:col-span-1 p-3 sm:p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10
                      border border-emerald-500/20 backdrop-blur-sm">
          <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/20">
                <Wallet size={16} className="text-emerald-400 sm:size-5" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-semibold tracking-wider sm:hidden">
                Fonds en Caisse
              </span>
            </div>
            <div className="text-right sm:text-left sm:w-full">
              <div className="hidden sm:block text-[10px] sm:text-xs text-slate-400 uppercase font-semibold tracking-wider mb-1">
                Fonds en Caisse
              </div>
              <div className="text-lg sm:text-xl font-bold text-white font-mono">
                {formatMoney(totalEspeces)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {activeSessions.length} caisse{activeSessions.length > 1 ? 's' : ''} active{activeSessions.length > 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* KPI Caissiers Actifs */}
        <div className="p-3 sm:p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 backdrop-blur-sm">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <div className="flex items-center gap-2">
              <User size={14} className="text-cyan-400 sm:size-4" />
              <span className="text-[10px] text-slate-500 uppercase font-semibold hidden sm:inline">Actifs</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{activeSessions.length}</div>
            <div className="text-[9px] sm:text-[10px] text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              En ligne
            </div>
          </div>
        </div>

        {/* KPI Fermées */}
        <div className="p-3 sm:p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 backdrop-blur-sm">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-slate-400 sm:size-4" />
              <span className="text-[10px] text-slate-500 uppercase font-semibold hidden sm:inline">Fermées</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">
              {closedSessions.filter(s => new Date(s.date_fermeture || s.date_ouverture).toDateString() === new Date().toDateString()).length}
            </div>
            <div className="text-[9px] sm:text-[10px] text-slate-500">Aujourd'hui</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl shadow-xl overflow-hidden">

        {/* Navigation Tabs - sticky sur mobile */}
        <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-lg border-b border-slate-800/50">
          <div className="flex">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`
                    flex-1 flex items-center justify-center gap-2 py-3 px-4
                    text-xs sm:text-sm font-medium transition-all relative
                    ${isActive
                      ? 'text-emerald-400'
                      : 'text-slate-400 hover:text-white'
                    }
                  `}
                >
                  {Icon && <Icon size={16} className="sm:size-[18px]" />}
                  <span className="hidden xs:inline">{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className={`
                      min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold
                      flex items-center justify-center
                      ${isActive
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-700 text-slate-300'
                      }
                    `}>
                      {tab.badge}
                    </span>
                  )}
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-emerald-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3 sm:p-5">
          
          {/* VUE SESSIONS */}
          {activeTab === 'sessions' && (
            <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
              {/* Header mobile-friendly */}
              <div className="flex justify-between items-center">
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Wallet size={18} className="text-emerald-400 sm:size-5" />
                  Caisses en cours
                </h3>
                <button
                  onClick={fetchData}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all"
                  aria-label="Actualiser"
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>

              {activeSessions.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                   <div className="bg-slate-800/50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                     <Lock size={32} className="opacity-50" />
                   </div>
                   <p className="text-sm">Aucune caisse ouverte actuellement.</p>
                </div>
              ) : (
                /* Mobile: Stack vertical, Desktop: Grid 2 cols */
                <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-4">
                  {activeSessions.map(session => (
                    <div
                      key={session.id}
                      className="group relative bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden
                                 active:scale-[0.98] transition-transform touch-manipulation"
                    >
                      {/* Indicateur de statut actif - barre gauche */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 to-emerald-600" />

                      {/* Badge Agence - positionné en haut à droite */}
                      {session.agence_nom && (
                        <div className="absolute top-2 right-2 z-10">
                          <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            {session.agence_code || session.agence_nom.substring(0, 4).toUpperCase()}
                          </span>
                        </div>
                      )}

                      <div className="p-3 sm:p-4 pl-4">
                        {/* Header: Avatar + Info + Solde */}
                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-slate-700 to-slate-800
                                        flex items-center justify-center border border-slate-600 font-bold text-sm text-slate-200 shrink-0">
                            {session.caissier_nom?.[0] || 'C'}
                          </div>

                          {/* Info caissier */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-white text-sm sm:text-base truncate pr-16">
                              {session.caissier_nom || 'Caissier Inconnu'}
                            </h4>
                            <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                              <span>Ouverte il y a {formatTimeAgo(session.date_ouverture)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Solde - mis en évidence sur mobile */}
                        <div className="mt-3 p-2.5 sm:p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] sm:text-xs text-slate-500 uppercase font-semibold tracking-wider">
                              Solde Théorique
                            </span>
                            <span className="text-base sm:text-lg font-mono font-bold text-white">
                              {formatMoney(Number(session.solde_theorique))}
                            </span>
                          </div>
                        </div>

                        {/* Actions - optimisées pour le touch */}
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => handleViewDetails(session)}
                            className="flex-1 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-medium
                                     bg-slate-700/50 text-slate-300 border border-slate-600/50
                                     hover:bg-slate-700 hover:text-white active:scale-[0.97]
                                     transition-all touch-manipulation"
                          >
                            Voir Détails
                          </button>

                          {/* Bouton "Prendre la main" - visible si permission canTakeControl */}
                          {onTakeControl && permissions.canTakeControl && (
                            <button
                              onClick={() => handleRequestSupervision(session)}
                              disabled={!!activeSupervision && activeSupervision.sessionId !== session.id}
                              className={`flex-1 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-medium
                                       transition-all touch-manipulation
                                       ${activeSupervision && activeSupervision.sessionId !== session.id
                                         ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
                                         : activeSupervision?.sessionId === session.id
                                           ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20'
                                           : 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.97] shadow-lg shadow-emerald-500/20'
                                       }`}
                            >
                              {activeSupervision?.sessionId === session.id ? (
                                <span className="flex items-center justify-center gap-1.5">
                                  <Shield size={14} />
                                  En supervision
                                </span>
                              ) : activeSupervision ? (
                                'Supervision active'
                              ) : (
                                'Prendre la main'
                              )}
                            </button>
                          )}

                          {/* Bouton "Forcer la fermeture" - visible si permission canForceClose */}
                          {permissions.canForceClose && (
                            <button
                              onClick={() => {
                                setSelectedSession(session);
                                setIsClosingOpen(true);
                              }}
                              className="p-2.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20
                                       hover:bg-red-500/20 active:scale-[0.95]
                                       transition-all touch-manipulation"
                              title="Forcer la fermeture"
                            >
                              <Lock size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VUE CAISSIERS */}
          {activeTab === 'caissiers' && (
             <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                {/* Header avec recherche */}
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                        <User size={18} className="text-cyan-400 sm:size-5" />
                        Gestion des Caissiers
                    </h3>
                    <span className="text-xs text-slate-500">
                      {filteredCaissiers.length} / {allCaissiers.length}
                    </span>
                  </div>

                  {/* Barre de recherche */}
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Rechercher un caissier..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-9 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50
                               text-sm text-white placeholder-slate-500
                               focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50
                               transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Filtres par statut */}
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                    {[
                      { key: 'all', label: 'Tous', icon: User },
                      { key: 'en_caisse', label: 'En caisse', icon: Wallet },
                      { key: 'hors_caisse', label: 'Disponible', icon: Clock },
                      { key: 'inactif', label: 'Inactif', icon: UserX },
                    ].map(filter => (
                      <button
                        key={filter.key}
                        onClick={() => setStatusFilter(filter.key as CaissierStatusFilter)}
                        className={`
                          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap
                          transition-all touch-manipulation shrink-0
                          ${statusFilter === filter.key
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-slate-800/40 text-slate-400 border border-slate-700/50 hover:bg-slate-800'
                          }
                        `}
                      >
                        <filter.icon size={12} />
                        <span>{filter.label}</span>
                        <span className={`
                          min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold
                          flex items-center justify-center
                          ${statusFilter === filter.key ? 'bg-cyan-500/30' : 'bg-slate-700'}
                        `}>
                          {filterCounts[filter.key as keyof typeof filterCounts]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Liste des caissiers */}
                {filteredCaissiers.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <div className="bg-slate-800/50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                      <Search size={32} className="opacity-50" />
                    </div>
                    <p className="text-sm">Aucun caissier trouvé.</p>
                    {(searchQuery || statusFilter !== 'all') && (
                      <button
                        onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                        className="mt-2 text-xs text-cyan-400 hover:underline"
                      >
                        Réinitialiser les filtres
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Mobile & Desktop: Cards grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {paginatedCaissiers.map(user => {
                        const enCaisse = isUserEnCaisse(user.id);
                        const activeSession = getActiveSessionForUser(user.id);

                        return (
                          <div
                            key={user.id}
                            onClick={() => handleManageUser(user)}
                            className={`
                              relative p-3 rounded-xl border cursor-pointer
                              active:scale-[0.98] transition-all touch-manipulation
                              ${enCaisse
                                ? 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10'
                                : user.statut !== 'Actif'
                                  ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10'
                                  : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60'
                              }
                            `}
                          >
                            {/* Badge statut en caisse */}
                            {enCaisse && (
                              <div className="absolute -top-1.5 -right-1.5">
                                <span className="flex h-4 w-4">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 items-center justify-center">
                                    <Wallet size={10} className="text-white" />
                                  </span>
                                </span>
                              </div>
                            )}

                            <div className="flex items-start gap-3">
                              {/* Avatar */}
                              <div className={`
                                w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm
                                ${enCaisse
                                  ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                                  : user.statut !== 'Actif'
                                    ? 'bg-red-500/20 border border-red-500/30 text-red-400'
                                    : 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400'
                                }
                              `}>
                                {user.nom?.[0]}{user.prenom?.[0]}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-white text-sm truncate">
                                  {user.nom} {user.prenom}
                                </div>
                                <div className="text-xs text-slate-500 truncate">{user.email}</div>

                                {/* Info contextuelle */}
                                <div className="mt-2 flex items-center gap-2">
                                  {enCaisse && activeSession ? (
                                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      En caisse • {formatMoney(Number(activeSession.solde_theorique || 0))}
                                    </span>
                                  ) : user.statut !== 'Actif' ? (
                                    <span className="text-[10px] text-red-400 flex items-center gap-1">
                                      <UserX size={10} />
                                      Compte désactivé
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                      <Clock size={10} />
                                      Disponible
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Chevron */}
                              <ChevronRight size={16} className="text-slate-600 shrink-0 mt-1" />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t border-slate-800/50">
                        <span className="text-xs text-slate-500">
                          Page {currentPage} sur {totalPages}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/50
                                     text-slate-400 hover:text-white hover:bg-slate-800
                                     disabled:opacity-50 disabled:cursor-not-allowed
                                     transition-all"
                          >
                            <ChevronLeft size={16} />
                          </button>

                          {/* Page numbers */}
                          <div className="flex gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let pageNum;
                              if (totalPages <= 5) {
                                pageNum = i + 1;
                              } else if (currentPage <= 3) {
                                pageNum = i + 1;
                              } else if (currentPage >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                              } else {
                                pageNum = currentPage - 2 + i;
                              }
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => setCurrentPage(pageNum)}
                                  className={`
                                    w-8 h-8 rounded-lg text-xs font-medium transition-all
                                    ${currentPage === pageNum
                                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                      : 'bg-slate-800/40 text-slate-400 border border-slate-700/50 hover:bg-slate-800'
                                    }
                                  `}
                                >
                                  {pageNum}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/50
                                     text-slate-400 hover:text-white hover:bg-slate-800
                                     disabled:opacity-50 disabled:cursor-not-allowed
                                     transition-all"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
             </div>
          )}

        </div>
      </div>

      {/* MODAL DÉTAILS SESSION */}
      <Modal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        title="Détails de la Session"
        subtitle={selectedSession ? `Caissier: ${selectedSession.caissier_nom}` : ""}
        size="lg"
      >
        {selectedSession && (
          <div className="flex flex-col h-[70vh] sm:h-[500px] -m-2">
            {/* KPI grid - Fixed height part */}
            <div className="p-2 border-b border-slate-800/50 mb-4 bg-surface-base z-10">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
                  <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-bold mb-1">Ouverture</div>
                  <div className="text-white text-xs sm:text-sm font-medium">
                    {selectedSession.date_ouverture ? new Date(selectedSession.date_ouverture).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                  </div>
                </div>
                <div className="p-2 sm:p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
                  <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-bold mb-1">Solde Initial</div>
                  <div className="text-white text-xs sm:text-sm font-mono font-bold">{formatMoney(Number(selectedSession.solde_initial || 0))}</div>
                </div>
                <div className="p-2 sm:p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 col-span-2 sm:col-span-1">
                  <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-bold mb-1">Solde Actuel</div>
                  <div className="text-emerald-400 text-xs sm:text-sm font-mono font-bold">{formatMoney(Number(selectedSession.solde_theorique || 0))}</div>
                </div>
              </div>
            </div>

            {/* Operations - Scrollable part */}
            <div className="flex-1 flex flex-col min-h-0 px-2 space-y-3">
              <h4 className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <TrendingUp size={14} className="sm:size-4" />
                Dernières Opérations
              </h4>
              <div className="flex-1 overflow-auto rounded-xl border border-slate-800 bg-slate-900/50 custom-scrollbar">
                {selectedSession.operations?.length === 0 ? (
                  <div className="p-8 sm:p-12 text-center text-slate-500 italic">Aucune opération enregistrée</div>
                ) : (
                  <div className="min-w-full inline-block align-middle">
                    <table className="w-full text-xs sm:text-sm text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-950 z-10 text-[10px] sm:text-xs font-bold uppercase text-slate-500 tracking-wider">
                        <tr>
                          <th className="p-2 sm:p-3 border-b border-slate-800">Date & Heure</th>
                          <th className="p-2 sm:p-3 border-b border-slate-800">Type</th>
                          <th className="p-2 sm:p-3 border-b border-slate-800 text-right">Montant</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedSession.operations?.map((op: any) => (
                          <tr key={op.id} className="hover:bg-slate-800/20 active:bg-slate-800/30 transition-colors">
                            <td className="p-2 sm:p-3 text-slate-400 font-mono text-[10px] sm:text-xs whitespace-nowrap">
                              {op.created_at ? new Date(op.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                            </td>
                            <td className="p-2 sm:p-3">
                              <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase whitespace-nowrap ${
                                (op.type_operation || '').toLowerCase().includes('retrait') ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                              }`}>
                                {op.type_operation || 'Inconnu'}
                              </span>
                            </td>
                            <td className={`p-2 sm:p-3 text-right font-mono font-bold whitespace-nowrap text-[10px] sm:text-xs ${
                              (op.type_operation || '').toLowerCase().includes('retrait') ? 'text-red-400' : 'text-emerald-400'
                            }`}>
                              {(op.type_operation || '').toLowerCase().includes('retrait') ? '-' : '+'}{formatMoney(Number(op.montant || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 mt-auto border-t border-edge px-2">
              <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Fermer</Button>
              {/* Bouton "Clôturer la Caisse" - visible si permission canForceClose */}
              {permissions.canForceClose && (
                <Button
                  variant="danger"
                  icon={Lock}
                  onClick={() => {
                    setIsDetailsOpen(false);
                    setIsClosingOpen(true);
                  }}
                >
                  Clôturer la Caisse
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL FERMETURE FORCÉE */}
      <Modal
        isOpen={isClosingOpen}
        onClose={() => setIsClosingOpen(false)}
        title="Fermeture Forcée"
        variant="danger"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsClosingOpen(false)} disabled={submitting}>Annuler</Button>
            <Button variant="danger" onClick={handleForceClose} isLoading={submitting}>Confirmer la Fermeture</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3 text-red-500">
            <AlertTriangle className="shrink-0" size={24} />
            <div>
              <p className="font-bold">Action irréversible</p>
              <p className="text-sm opacity-80">
                Vous êtes sur le point de forcer la clôture de la caisse de <strong>{selectedSession?.caissier_nom}</strong>.
              </p>
            </div>
          </div>
          
          <div className="p-4 bg-slate-800/50 rounded-xl space-y-3">
             <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Solde théorique final :</span>
                <span className="text-white font-mono font-bold">{formatMoney(Number(selectedSession?.solde_theorique))}</span>
             </div>
             <p className="text-xs text-slate-500 leading-relaxed italic border-t border-slate-700/50 pt-2">
               Note: La session sera fermée avec le solde théorique actuel comme solde réel. Un écart de 0 sera enregistré.
             </p>
          </div>
        </div>
      </Modal>

      {/* MODAL GESTION CAISSIER - ENRICHI */}
      <Modal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        title="Profil Caissier"
        subtitle={selectedUser ? `${selectedUser.nom} ${selectedUser.prenom}` : ""}
        size="lg"
      >
        {selectedUser && (
          <div className="space-y-5 -mx-2 sm:mx-0">
            {/* Header avec avatar et statut */}
            <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-slate-800/50 to-slate-800/30 rounded-xl border border-slate-700/30">
              <div className={`
                w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shrink-0
                font-bold text-lg sm:text-xl
                ${isUserEnCaisse(selectedUser.id)
                  ? 'bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-400'
                  : selectedUser.statut !== 'Actif'
                    ? 'bg-red-500/20 border-2 border-red-500/50 text-red-400'
                    : 'bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-400'
                }
              `}>
                {selectedUser.nom?.[0]}{selectedUser.prenom?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold text-white">{selectedUser.nom} {selectedUser.prenom}</h3>
                  {isUserEnCaisse(selectedUser.id) && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      En caisse
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 truncate">{selectedUser.email}</p>
                <p className="text-xs text-slate-500 mt-1">{selectedUser.role}</p>
              </div>
            </div>

            {/* KPIs Performance */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/30 text-center">
                <BarChart3 size={16} className="mx-auto text-cyan-400 mb-1" />
                <div className="text-lg sm:text-xl font-bold text-white">
                  {loadingHistory ? '...' : userStats?.totalSessions || 0}
                </div>
                <div className="text-[10px] text-slate-500 uppercase">Sessions totales</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/30 text-center">
                <TrendingUp size={16} className="mx-auto text-emerald-400 mb-1" />
                <div className="text-lg sm:text-xl font-bold text-white">
                  {loadingHistory ? '...' : userStats?.sessionsThisMonth || 0}
                </div>
                <div className="text-[10px] text-slate-500 uppercase">Ce mois</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/30 text-center">
                <Wallet size={16} className="mx-auto text-amber-400 mb-1" />
                <div className="text-sm sm:text-base font-bold text-white font-mono">
                  {loadingHistory ? '...' : formatMoney(userStats?.totalEncaisse || 0)}
                </div>
                <div className="text-[10px] text-slate-500 uppercase">Total encaissé</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/30 text-center">
                <AlertTriangle size={16} className={`mx-auto mb-1 ${(userStats?.ecartMoyen || 0) > 1000 ? 'text-red-400' : 'text-slate-400'}`} />
                <div className={`text-sm sm:text-base font-bold font-mono ${(userStats?.ecartMoyen || 0) > 1000 ? 'text-red-400' : 'text-white'}`}>
                  {loadingHistory ? '...' : formatMoney(userStats?.ecartMoyen || 0)}
                </div>
                <div className="text-[10px] text-slate-500 uppercase">Ecart moyen</div>
              </div>
            </div>

            {/* Actions rapides */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Si le caissier est en caisse - Actions sur la session */}
              {isUserEnCaisse(selectedUser.id) && (
                <button
                  onClick={() => {
                    const session = getActiveSessionForUser(selectedUser.id);
                    if (session) {
                      setIsUserManagementOpen(false);
                      handleViewDetails(session);
                    }
                  }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30
                           hover:bg-emerald-500/20 transition-all group"
                >
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <Eye size={18} className="text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-white">Voir la caisse active</div>
                    <div className="text-xs text-emerald-400">
                      {formatMoney(Number(getActiveSessionForUser(selectedUser.id)?.solde_theorique || 0))}
                    </div>
                  </div>
                  <ChevronRight size={16} className="ml-auto text-emerald-400 opacity-50 group-hover:opacity-100" />
                </button>
              )}

              {/* Action d'activation/désactivation - visible si permission canToggleUserStatus */}
              {permissions.canToggleUserStatus ? (
                <button
                  onClick={handleToggleUserStatus}
                  disabled={submitting}
                  className={`
                    flex items-center gap-3 p-4 rounded-xl border transition-all group
                    ${selectedUser.statut === 'Actif'
                      ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                      : 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                    }
                    ${submitting ? 'opacity-50 cursor-wait' : ''}
                  `}
                >
                  <div className={`p-2 rounded-lg ${selectedUser.statut === 'Actif' ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                    {selectedUser.statut === 'Actif'
                      ? <UserX size={18} className="text-red-400" />
                      : <UserCheck size={18} className="text-emerald-400" />
                    }
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-white">
                      {selectedUser.statut === 'Actif' ? 'Désactiver le compte' : 'Activer le compte'}
                    </div>
                    <div className={`text-xs ${selectedUser.statut === 'Actif' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {selectedUser.statut === 'Actif' ? 'Bloquer l\'accès' : 'Autoriser l\'accès'}
                    </div>
                  </div>
                  {submitting && <RefreshCw size={16} className="ml-auto animate-spin text-slate-400" />}
                </button>
              ) : (
                /* Indicateur de permission manquante - informatif */
                <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-800/20 border border-slate-700/30 opacity-50">
                  <div className="p-2 rounded-lg bg-slate-700/30">
                    <ShieldAlert size={18} className="text-slate-500" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-slate-400">Gestion du compte</div>
                    <div className="text-xs text-slate-500">Permission requise</div>
                  </div>
                </div>
              )}

              {/* Forcer fermeture si en caisse - visible si permission canForceClose */}
              {isUserEnCaisse(selectedUser.id) && permissions.canForceClose && (
                <button
                  onClick={() => {
                    const session = getActiveSessionForUser(selectedUser.id);
                    if (session) {
                      setSelectedSession(session);
                      setIsUserManagementOpen(false);
                      setIsClosingOpen(true);
                    }
                  }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30
                           hover:bg-red-500/20 transition-all group sm:col-span-2"
                >
                  <div className="p-2 rounded-lg bg-red-500/20">
                    <Lock size={18} className="text-red-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-white">Forcer la fermeture de caisse</div>
                    <div className="text-xs text-red-400">Clôturer immédiatement la session</div>
                  </div>
                  <ChevronRight size={16} className="ml-auto text-red-400 opacity-50 group-hover:opacity-100" />
                </button>
              )}
            </div>

            {/* Historique compact */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Clock size={14} />
                  Dernières Sessions
                </h4>
                {userHistory.length > 5 && (
                  <span className="text-xs text-slate-500">{userHistory.length} au total</span>
                )}
              </div>

              {loadingHistory ? (
                <div className="flex items-center justify-center py-8 text-slate-500">
                  <RefreshCw size={20} className="animate-spin mr-2" />
                  Chargement...
                </div>
              ) : userHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Clock size={24} className="mx-auto opacity-50 mb-2" />
                  <p className="text-sm">Aucune session enregistrée</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-auto custom-scrollbar pr-1">
                  {userHistory.slice(0, 10).map((session: any) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          ['ouverte', 'ouvert'].includes(session.statut?.toLowerCase())
                            ? 'bg-emerald-500'
                            : 'bg-slate-500'
                        }`} />
                        <div>
                          <div className="text-xs font-medium text-white">
                            {new Date(session.date_ouverture).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {session.date_fermeture
                              ? `Fermée à ${new Date(session.date_fermeture).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                              : 'En cours'
                            }
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-white">
                          {formatMoney(Number(session.solde_reel || session.solde_theorique || 0))}
                        </div>
                        {session.ecart && Number(session.ecart) !== 0 && (
                          <div className={`text-[10px] font-mono ${Number(session.ecart) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {Number(session.ecart) > 0 ? '+' : ''}{formatMoney(Number(session.ecart))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-4 border-t border-slate-700/50">
              <Button variant="outline" onClick={() => setIsUserManagementOpen(false)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL CONFIRMATION SUPERVISION */}
      <SupervisionConfirmModal
        isOpen={showSupervisionConfirm}
        onClose={() => {
          setShowSupervisionConfirm(false);
          setPendingSupervisionSession(null);
        }}
        onConfirm={handleConfirmSupervision}
        session={pendingSupervisionSession}
        isLoading={confirmingSupervision}
        existingSupervision={activeSupervision}
      />
    </div>
  );
}
