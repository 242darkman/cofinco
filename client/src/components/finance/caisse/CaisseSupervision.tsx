import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SystemRole, normalizeRole } from '@shared/types/roles';
import { StatutUser } from '@shared/enum/status-constants';
import { Wallet, User, Lock, RefreshCw, AlertTriangle, TrendingUp, Clock, Building2, Search, ChevronLeft, ChevronRight, Eye, UserX, UserCheck, BarChart3, X, ShieldAlert, Shield, Info, Calendar } from 'lucide-react';
import Tooltip from '../../ui/Tooltip';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import { sessionCaisseApi, authApi, userApi } from '../../../lib/api-client';
import { computeSessionStatus } from '../../../lib/format';
import { useAgence } from '../../../contexts/AgenceContext';
import { authService } from '../../../lib/auth';
import { usePermissions } from '../../auth/ProtectedFeature';
import SupervisionConfirmModal, { SupervisionSession } from './shared/SupervisionConfirmModal';
import CaisseAuditLog from './CaisseAuditLog';
import AgencyClosurePanel from './AgencyClosurePanel';
import EcartApprovalPanel from './EcartApprovalPanel';

// Types pour les filtres
type CaissierStatusFilter = 'all' | 'en_caisse' | 'hors_caisse' | 'inactif';

// Hook pour vérifier les permissions via CASL
function useSupervisionPermissions() {
  const { hasPermission, isAdmin } = usePermissions();

  return {
    canViewCaisse: hasPermission('caisse', 'view'),
    canManageCaisse: hasPermission('caisse', 'manage'),
    canViewUsers: hasPermission('users', 'view'),
    canEditUsers: hasPermission('users', 'edit'),
    canTakeControl: hasPermission('caisse', 'manage'),
    canForceClose: hasPermission('caisse', 'manage'),
    canToggleUserStatus: hasPermission('users', 'edit'),
    isAdmin,
  };
}

export interface SupervisionCallbackData {
  session: SupervisionSessionData;
  supervisionInfo: SupervisionSession;
}

export default function CaisseSupervision({
  onTakeControl,
  activeSupervision,
  onSupervisionStart
}: {
  onTakeControl?: (session: SupervisionSessionData, supervisionInfo: SupervisionSession) => void;
  activeSupervision?: SupervisionSession | null;
  onSupervisionStart?: (data: SupervisionCallbackData) => void;
}) {
  type SupervisionTab = 'sessions' | 'caissiers' | 'alertes' | 'cloture' | 'audit';
  const [activeTab, setActiveTab] = useState<SupervisionTab>('sessions');
  const [sessions, setSessions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [riskAlerts, setRiskAlerts] = useState<any[]>([]);
  const [ecartAlerts, setEcartAlerts] = useState<any[]>([]);

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

    const handleRiskAlert = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        // Refresh alerts on risk alert
        sessionCaisseApi.getRisky().then(data => setRiskAlerts(data || [])).catch(() => {});
      }
    };

    window.addEventListener('caisse-update', handleRealTimeUpdate);
    window.addEventListener('session-risk-alert', handleRiskAlert);
    return () => {
      window.removeEventListener('caisse-update', handleRealTimeUpdate);
      window.removeEventListener('session-risk-alert', handleRiskAlert);
    };
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
      const [sessionsData, usersData, riskyData, ecartsData] = await Promise.all([
        sessionCaisseApi.getAll(),
        authApi.getUsers().catch(() => []),
        sessionCaisseApi.getRisky().catch(() => []),
        sessionCaisseApi.getEcarts().catch(() => []),
      ]);
      setSessions(sessionsData || []);
      setUsers(usersData || []);
      setRiskAlerts(riskyData || []);
      setEcartAlerts(ecartsData || []);
    } catch {
      // Handled by empty state
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (session: SupervisionSessionData) => {
    try {
      setLoading(true);
      const details = await sessionCaisseApi.get(session.id);
      setSelectedSession(details);
      setIsDetailsOpen(true);
    } catch {
      // Handled by loading state reset
    } finally {
      setLoading(false);
    }
  };

  const handleForceClose = async () => {
    if (!selectedSession) return;
    
    setSubmitting(true);
    try {
      // Force closure with current theoretical balance as real balance
      const soldeTheorique = getSoldeTheorique(selectedSession);
      await sessionCaisseApi.close(selectedSession.id, {
        solde_reel: soldeTheorique.toString(),
        ecart: "0",
        billetage_fermeture: {},
        observations: "Fermeture forcée par l'administrateur depuis la supervision."
      });
      setIsClosingOpen(false);
      setSelectedSession(null);
      fetchData();
    } catch {
      // Toast error already shown by API client
    } finally {
      setSubmitting(false);
    }
  };

  const resolveSessionStatus = (session: SupervisionSessionData) => session.computedStatus || computeSessionStatus(session);
  const resolveOpenedAt = (session: SupervisionSessionData) => session.openedAt;
  const resolveClosedAt = (session: SupervisionSessionData) => session.closedAt;
  // Helper pour récupérer le solde théorique (nom de champ varie selon les routes)
  const getSoldeTheorique = (session: SupervisionSessionData) => {
    if (!session) return 0;
    return Number(session.montantFermetureTheorique || session.soldeTheorique || 0);
  };
  const activeSessions = sessions.filter((s) => resolveSessionStatus(s) === 'OPEN');
  const closedSessions = sessions.filter((s) => resolveSessionStatus(s) === 'CLOSED');
  const totalEspeces = activeSessions.reduce((acc, s) => acc + getSoldeTheorique(s), 0);

  // Compter les caisses UNIQUES (pas les sessions) — une même caisse ouverte/fermée
  // plusieurs fois ne doit compter que comme 1
  const resolveCaisseId = (s: SupervisionSessionData) => s.caisseId;
  const uniqueActiveCaisseCount = new Set(activeSessions.map(resolveCaisseId)).size;
  const uniqueClosedTodayCaisseCount = new Set(
    closedSessions
      .filter(s => new Date(resolveClosedAt(s) || resolveOpenedAt(s)).toDateString() === new Date().toDateString())
      .map(resolveCaisseId)
  ).size;

  // Liste des caissiers filtrés
  const caissierRoles = new Set([SystemRole.CAISSIER, SystemRole.ADMIN, SystemRole.SUPERVISEUR]);
  const allCaissiers = users.filter((u) => {
    const normalized = normalizeRole(u.role);
    return normalized ? caissierRoles.has(normalized) : false;
  });

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
          matchesStatus = enCaisse && user.statut === StatutUser.ACTIVE;
          break;
        case 'hors_caisse':
          matchesStatus = !enCaisse && user.statut === StatutUser.ACTIVE;
          break;
        case 'inactif':
          matchesStatus = user.statut !== StatutUser.ACTIVE;
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
    en_caisse: allCaissiers.filter(u => isUserEnCaisse(u.id) && u.statut === StatutUser.ACTIVE).length,
    hors_caisse: allCaissiers.filter(u => !isUserEnCaisse(u.id) && u.statut === StatutUser.ACTIVE).length,
    inactif: allCaissiers.filter(u => u.statut !== StatutUser.ACTIVE && u.statut !== 'Actif').length,
  }), [allCaissiers, activeSessions]);

  // Tabs conditionnels selon les permissions
  const tabs: { key: SupervisionTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: 'sessions', label: 'Caisses Ouvertes', icon: Wallet, badge: uniqueActiveCaisseCount },
    // L'onglet Caissiers est visible uniquement si l'utilisateur a la permission de voir les users
    ...(permissions.canViewUsers ? [{ key: 'caissiers' as const, label: 'Caissiers', icon: User }] : []),
    { key: 'alertes', label: 'Alertes', icon: AlertTriangle, badge: riskAlerts.length + ecartAlerts.length },
    ...(permissions.canManageCaisse ? [{ key: 'cloture' as const, label: 'Clôture', icon: Calendar }] : []),
    ...(permissions.canManageCaisse ? [{ key: 'audit' as const, label: 'Audit', icon: Shield }] : [])
  ];

  const handleManageUser = async (user: SupervisionUser) => {
    setSelectedUser(user);
    setIsUserManagementOpen(true);
    setLoadingHistory(true);
    setUserStats(null);
    try {
      const history = await sessionCaisseApi.getByCaissier(user.id);
      setUserHistory(history || []);

      // Calculer les statistiques du caissier
      if (history && history.length > 0) {
        const closedHistory = history.filter((s: SupervisionSessionData) => resolveSessionStatus(s) === 'CLOSED');
        const totalEncaisse = closedHistory.reduce((acc: number, s: SupervisionSessionData) => {
          const ops = s.operations || [];
          const depots = ops.filter((o: SupervisionOperation) => !(o.typeOperation || '').toLowerCase().includes('retrait'));
          return acc + depots.reduce((sum: number, o: SupervisionOperation) => sum + Number(o.montant || 0), 0);
        }, 0);

        const totalEcarts = closedHistory.reduce((acc: number, s: SupervisionSessionData) => acc + Math.abs(Number(s.ecart || 0)), 0);

        setUserStats({
          totalSessions: history.length,
          sessionsThisMonth: history.filter((s: SupervisionSessionData) => {
            const d = new Date(resolveOpenedAt(s));
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length,
          totalEncaisse,
          ecartMoyen: closedHistory.length > 0 ? totalEcarts / closedHistory.length : 0,
        });
      }
    } catch {
      // Handled by loading state reset
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
      const isActive = selectedUser.statut === StatutUser.ACTIVE;
      const newStatus = isActive ? StatutUser.INACTIVE : StatutUser.ACTIVE;
      await userApi.update(selectedUser.id, { statut: newStatus });
      
      // Update local state
      setUsers((prev: SupervisionUser[]) => prev.map(u => u.id === selectedUser.id ? { ...u, statut: newStatus } : u));
      setSelectedUser((prev: SupervisionUser) => ({ ...prev, statut: newStatus }));
      
      // Refresh global data to ensure consistency (e.g. if status affects session eligibility)
      fetchData();
    } catch {
      // Toast error already shown by API client
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

  // Traduction des types d'opération
  const translateOperationType = (type: string): string => {
    const translations: Record<string, string> = {
      'DEPOSIT': 'Dépôt',
      'WITHDRAWAL': 'Retrait',
      'ENCAISSEMENT': 'Encaissement',
      'DECAISSEMENT': 'Décaissement',
      'LOAN_REPAYMENT': 'Remb. Prêt',
      'CREDIT_DISBURSEMENT': 'Décais. Crédit',
      'TONTINE_CONTRIBUTION': 'Cotis. Tontine',
      'TONTINE_COTISATION': 'Cotis. Tontine',
      'TONTINE_DISTRIBUTION': 'Distrib. Tontine',
      'SAVINGS_DEPOSIT': 'Dépôt Épargne',
      'SAVINGS_WITHDRAWAL': 'Retrait Épargne',
      'BLOCKED_DEPOSIT': 'Vers. Compte Bloqué',
      'BLOCKED_WITHDRAWAL': 'Retr. Compte Bloqué',
      'APPROVISIONNEMENT': 'Approv. Coffre',
      'VERSEMENT_COFFRE': 'Vers. Coffre',
      'RETRAIT_COFFRE': 'Retr. Coffre',
      'TRANSFER_IN': 'Transfert Entrant',
      'TRANSFER_OUT': 'Transfert Sortant',
      'ACCOUNT_ACTIVATION': 'Activation Compte',
      'VERSEMENT_COMPTE_BLOQUE': 'Vers. Compte Bloqué',
      'RETRAIT_COMPTE_BLOQUE': 'Retr. Compte Bloqué',
    };

    const upperType = (type || '').toUpperCase();

    // Recherche exacte
    if (translations[upperType]) return translations[upperType];

    // Recherche partielle
    for (const [key, label] of Object.entries(translations)) {
      if (upperType.includes(key)) return label;
    }

    // Retourner le type formaté si pas de traduction
    return type.replace(/_/g, ' ');
  };

  // Handle clicking "Prendre la main" - opens confirmation modal
  const handleRequestSupervision = useCallback((session: SupervisionSessionData) => {
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
      targetCaissierName: pendingSupervisionSession.caissierNom || 'Inconnu',
      targetCaisseName: pendingSupervisionSession.caisseNom || 'Caisse',
      targetAgenceName: pendingSupervisionSession.agenceNom,
      currentBalance: getSoldeTheorique(pendingSupervisionSession),
      openedAt: resolveOpenedAt(pendingSupervisionSession),
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
    <div className="flex flex-col h-full space-y-2 animate-in fade-in duration-500 overflow-hidden">
      
      {/* Sélecteur d'agence pour Admin */}
      {permissions.isAdmin && agences.length > 1 && (
        <div className="flex items-center gap-3 p-3 bg-surface-base/50 backdrop-blur-md border border-edge/60 rounded-xl">
          <Building2 size={18} className="text-accent" />
          <span className="text-sm text-content-muted">Supervision :</span>
          <select
            value={selectedAgence?.id || 'all'}
            onChange={(e) => selectAgence(e.target.value)}
            className="flex-1 max-w-xs bg-surface border border-edge rounded-lg px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            {agences.map(ua => (
              <option key={ua.agence.id} value={ua.agence.id}>
                {ua.agence.nom}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* KPI Supervision - Compact */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0">
        {/* KPI Principal - Fonds */}
        <div className="col-span-2 sm:col-span-1 p-2 rounded-lg bg-gradient-to-br from-status-success-bg to-accent/10
                      border border-status-success/20 backdrop-blur-sm shadow-sm">
          <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-0.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-status-success-bg">
                <Wallet size={14} className="text-status-success" />
              </div>
              <span className="text-[10px] text-content-muted uppercase font-semibold tracking-wider sm:hidden">
                Fonds
              </span>
            </div>
            <div className="text-right sm:text-left sm:w-full">
              <div className="hidden sm:block text-[10px] text-content-muted uppercase font-semibold tracking-wider mb-0.5">
                Fonds en Caisse
              </div>
              <div className="text-base sm:text-lg font-bold text-content-primary font-mono leading-tight">
                {formatMoney(totalEspeces)}
              </div>
              <div className="text-[9px] text-content-muted">
                {uniqueActiveCaisseCount} caisse{uniqueActiveCaisseCount > 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* KPI Caissiers Actifs */}
        <div className="p-2 rounded-lg bg-surface/40 border border-edge-subtle backdrop-blur-sm shadow-sm">
          <div className="flex flex-col items-center sm:items-start gap-0.5">
            <div className="flex items-center gap-1.5">
              <User size={12} className="text-status-info" />
              <span className="text-[9px] text-content-muted uppercase font-semibold hidden sm:inline">Actifs</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-content-primary leading-tight">{uniqueActiveCaisseCount}</div>
            <div className="text-[9px] text-status-success flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
              En ligne
            </div>
          </div>
        </div>

        {/* KPI Fermées */}
        <div className="p-2 rounded-lg bg-surface/40 border border-edge-subtle backdrop-blur-sm shadow-sm">
          <div className="flex flex-col items-center sm:items-start gap-0.5">
            <div className="flex items-center gap-1.5">
              <Lock size={12} className="text-content-muted" />
              <span className="text-[9px] text-content-muted uppercase font-semibold hidden sm:inline">Fermées</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-content-primary leading-tight">
              {uniqueClosedTodayCaisseCount}
            </div>
            <div className="text-[9px] text-content-muted">Aujourd'hui</div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-surface-base/80 backdrop-blur-xl border border-edge rounded-xl shadow-xl overflow-hidden flex flex-col">

        {/* Navigation Tabs - sticky sur mobile */}
        <div className="sticky top-0 z-20 bg-surface-base/95 backdrop-blur-lg border-b border-edge/50 shrink-0">
          <div className="flex">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    flex-1 flex items-center justify-center gap-2 py-2 px-4
                    text-xs font-medium transition-all relative
                    ${isActive
                      ? 'text-status-success'
                      : 'text-content-muted hover:text-content-primary'
                    }
                  `}
                >
                  {Icon && <Icon size={14} className="sm:size-[16px]" />}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className={`
                      min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold
                      flex items-center justify-center
                      ${isActive
                        ? 'bg-status-success-bg text-status-success'
                        : 'bg-surface-elevated text-content-secondary'
                      }
                    `}>
                      {tab.badge}
                    </span>
                  )}
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-accent rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
          
          {/* VUE SESSIONS */}
          {activeTab === 'sessions' && (
            <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
              {/* Header mobile-friendly */}
              <div className="flex justify-between items-center">
                <h3 className="text-base sm:text-lg font-bold text-content-primary flex items-center gap-2">
                  <Wallet size={18} className="text-status-success sm:size-5" />
                  Caisses en cours
                </h3>
                <button
                  onClick={fetchData}
                  className="p-2 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface active:scale-95 transition-all"
                  aria-label="Actualiser"
                >
                   <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>

              {activeSessions.length === 0 ? (
                <div className="text-center py-8 text-content-muted">
                   <div className="bg-surface/50 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                     <Lock size={24} className="opacity-50" />
                   </div>
                   <p className="text-xs">Aucune caisse ouverte actuellement.</p>
                </div>
              ) : (
                /* Mobile: Stack vertical, Desktop: Grid 2 cols - Compact Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeSessions.map(session => {
                    // Vérifier si c'est la propre session de l'utilisateur connecté
                    const isOwnSession = session.caissier_id === currentUser?.id;

                    return (
                    <div
                      key={session.id}
                      className="group relative bg-surface/40 backdrop-blur-sm border border-edge-subtle rounded-lg overflow-hidden
                                 active:scale-[0.98] transition-transform touch-manipulation hover:bg-surface/60"
                    >
                      {/* Indicateur de statut actif - barre gauche */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${isOwnSession ? 'from-accent to-accent-secondary' : 'from-status-success to-status-success'}`} />

                      {/* Badge Agence - positionné en haut à droite */}
                      {session.agenceNom && (
                        <div className="absolute top-2 right-2 z-10">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-status-info-bg text-status-info border border-status-info/20">
                            {session.agenceCode || session.agenceNom.substring(0, 4).toUpperCase()}
                          </span>
                        </div>
                      )}

                      <div className="p-3 pl-4">
                        {/* En-tête: Nom de la Caisse */}
                        {session.caisseNom && (
                          <div className="mb-2 pb-1.5 border-b border-edge-subtle">
                            <div className="flex items-center gap-1.5">
                              <Wallet size={12} className="text-status-warning" />
                              <span className="text-xs font-bold text-content-primary truncate max-w-[140px]">
                                {session.caisseNom}
                              </span>
                              {isOwnSession && (
                                <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-accent/20 text-accent border border-accent/30">
                                  MOI
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Header: Avatar + Info + Solde */}
                        <div className="flex items-start gap-2.5">
                          {/* Avatar */}
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br
                                        flex items-center justify-center border font-bold text-xs shrink-0
                                        ${isOwnSession
                                          ? 'from-accent/70 to-accent/80 border-accent/60 text-accent'
                                          : 'from-surface-elevated to-surface border-edge-strong text-content-secondary'
                                        }`}>
                            {session.caissierNom?.[0] || 'C'}
                          </div>

                          {/* Info caissier */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-content-primary text-sm truncate pr-8">
                              {session.caissierNom || 'Caissier Inconnu'}
                            </h4>
                            <div className="flex items-center gap-1 text-[10px] text-status-success">
                              <span className="w-1 h-1 rounded-full bg-accent animate-pulse shrink-0" />
                              <span>{formatTimeAgo(resolveOpenedAt(session))}</span>
                            </div>
                          </div>
                        </div>

                        {/* Solde - Compact */}
                        <div className="mt-2 p-2 rounded bg-surface-base/50 border border-edge-subtle flex items-center justify-between">
                          <span className="text-[9px] text-content-muted uppercase font-semibold tracking-wider">
                            Solde
                          </span>
                          <span className="text-sm font-mono font-bold text-content-primary">
                            {formatMoney(getSoldeTheorique(session))}
                          </span>
                        </div>

                        {/* Actions - optimisées */}
                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            onClick={() => handleViewDetails(session)}
                            className="flex-1 py-1.5 px-2 rounded text-xs font-medium
                                     bg-surface-elevated/50 text-content-secondary border border-edge-strong/50
                                     hover:bg-surface-elevated hover:text-content-primary active:scale-[0.97]
                                     transition-all"
                          >
                            Détails
                          </button>

                          {/* Bouton "Prendre la main" */}
                          {onTakeControl && permissions.canTakeControl && (
                            isOwnSession ? (
                              <button
                                disabled
                                className="flex-1 py-1.5 px-2 rounded text-xs font-medium
                                         bg-surface text-content-muted cursor-not-allowed border border-edge"
                              >
                                Votre Session
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRequestSupervision(session)}
                                disabled={!!activeSupervision && activeSupervision.sessionId !== session.id}
                                className={`flex-1 py-1.5 px-2 rounded text-xs font-medium
                                         transition-all
                                         ${activeSupervision && activeSupervision.sessionId !== session.id
                                           ? 'bg-surface-elevated text-content-muted cursor-not-allowed opacity-60'
                                           : activeSupervision?.sessionId === session.id
                                             ? 'bg-accent-secondary text-content-primary hover:bg-accent-secondary-hover'
                                             : 'bg-accent text-white hover:bg-accent-primary-hover'
                                         }`}
                              >
                                {activeSupervision?.sessionId === session.id ? 'En cours' : 'Superviser'}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );})}
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
                    <h3 className="text-base sm:text-lg font-bold text-content-primary flex items-center gap-2">
                        <User size={18} className="text-status-info sm:size-5" />
                        Gestion des Caissiers
                    </h3>
                    <span className="text-xs text-content-muted">
                      {filteredCaissiers.length} / {allCaissiers.length}
                    </span>
                  </div>

                  {/* Barre de recherche */}
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                    <input
                      type="text"
                      placeholder="Rechercher un caissier..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-9 py-2.5 rounded-lg bg-surface/60 border border-edge-subtle
                               text-sm text-content-primary placeholder-content-muted
                               focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50
                               transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary"
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
                            ? 'bg-accent/20 text-accent border border-accent/30'
                            : 'bg-surface/40 text-content-muted border border-edge-subtle hover:bg-surface'
                          }
                        `}
                      >
                        <filter.icon size={12} />
                        <span>{filter.label}</span>
                        <span className={`
                          min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold
                          flex items-center justify-center
                          ${statusFilter === filter.key ? 'bg-accent/30' : 'bg-surface-elevated'}
                        `}>
                          {filterCounts[filter.key as keyof typeof filterCounts]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Liste des caissiers */}
                {filteredCaissiers.length === 0 ? (
                  <div className="text-center py-12 text-content-muted">
                    <div className="bg-surface/50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                      <Search size={32} className="opacity-50" />
                    </div>
                    <p className="text-sm">Aucun caissier trouvé.</p>
                    {(searchQuery || statusFilter !== 'all') && (
                      <button
                        onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                        className="mt-2 text-xs text-accent hover:underline"
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
                                ? 'bg-status-success-bg/50 border-status-success/30 hover:bg-status-success-bg'
                                : (user.statut !== StatutUser.ACTIVE)
                                  ? 'bg-status-danger-bg/50 border-status-danger/20 hover:bg-status-danger-bg'
                                  : 'bg-surface/40 border-edge-subtle hover:bg-surface/60'
                              }
                            `}
                          >
                            {/* Badge statut en caisse */}
                            {enCaisse && (
                              <div className="absolute -top-1.5 -right-1.5">
                                <span className="flex h-4 w-4">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75" />
                                  <span className="relative inline-flex rounded-full h-4 w-4 bg-accent items-center justify-center">
                                    <Wallet size={10} className="text-content-primary" />
                                  </span>
                                </span>
                              </div>
                            )}

                            <div className="flex items-start gap-3">
                              {/* Avatar */}
                              <div className={`
                                w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm
                                ${enCaisse
                                  ? 'bg-status-success-bg border border-status-success/30 text-status-success'
                                  : (user.statut !== StatutUser.ACTIVE)
                                    ? 'bg-status-danger-bg border border-status-danger/30 text-status-danger'
                                    : 'bg-accent/20 border border-accent/30 text-accent'
                                }
                              `}>
                                {user.nom?.[0]}{user.prenom?.[0]}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-content-primary text-sm truncate">
                                  {user.nom} {user.prenom}
                                </div>
                                <div className="text-xs text-content-muted truncate">{user.email}</div>

                                {/* Info contextuelle */}
                                <div className="mt-2 flex items-center gap-2">
                                  {enCaisse && activeSession ? (
                                    <span className="text-[10px] text-status-success flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                                      En caisse • {formatMoney(getSoldeTheorique(activeSession))}
                                    </span>
                                  ) : (user.statut !== StatutUser.ACTIVE) ? (
                                    <span className="text-[10px] text-status-danger flex items-center gap-1">
                                      <UserX size={10} />
                                      Compte désactivé
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-content-muted flex items-center gap-1">
                                      <Clock size={10} />
                                      Disponible
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Chevron */}
                              <ChevronRight size={16} className="text-content-muted shrink-0 mt-1" />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t border-edge/50">
                        <span className="text-xs text-content-muted">
                          Page {currentPage} sur {totalPages}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 rounded-lg bg-surface/40 border border-edge-subtle
                                     text-content-muted hover:text-content-primary hover:bg-surface
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
                                      ? 'bg-accent/20 text-accent border border-accent/30'
                                      : 'bg-surface/40 text-content-muted border border-edge-subtle hover:bg-surface'
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
                            className="p-2 rounded-lg bg-surface/40 border border-edge-subtle
                                     text-content-muted hover:text-content-primary hover:bg-surface
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

          {/* ===== ALERTES TAB ===== */}
          {activeTab === 'alertes' && (
            <div className="space-y-4 p-2">
              {/* Sessions à risque (inactivité) */}
              <div>
                <h4 className="text-xs font-bold text-content-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Clock size={14} className="text-status-warning" />
                  Sessions inactives ({riskAlerts.length})
                </h4>
                {riskAlerts.length === 0 ? (
                  <div className="text-center py-6 text-content-muted text-sm">Aucune session à risque</div>
                ) : (
                  <div className="space-y-2">
                    {riskAlerts.map((alert: SupervisionAlert) => (
                      <div
                        key={alert.sessionId}
                        className={`p-3 rounded-lg border ${
                          alert.riskLevel === 'CRITICAL'
                            ? 'bg-status-danger-bg border-status-danger/50'
                            : 'bg-status-warning-bg border-status-warning/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle
                              size={16}
                              className={alert.riskLevel === 'CRITICAL' ? 'text-status-danger' : 'text-status-warning'}
                            />
                            <div>
                              <div className="text-sm font-medium text-content-primary">{alert.caisseNom}</div>
                              <div className="text-[10px] text-content-muted">{alert.caissierNom}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-xs font-bold ${
                              alert.riskLevel === 'CRITICAL' ? 'text-status-danger' : 'text-status-warning'
                            }`}>
                              {alert.riskLevel}
                            </div>
                            <div className="text-[10px] text-content-muted">
                              {Math.round(alert.hoursInactive)}h inactive
                            </div>
                          </div>
                        </div>
                        {alert.soldeCurrent != null && (
                          <div className="mt-1 text-[10px] text-content-muted">
                            Solde: {Number(alert.soldeCurrent).toLocaleString('fr-FR')} FCFA
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Écarts significatifs */}
              <div>
                <h4 className="text-xs font-bold text-content-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                  <TrendingUp size={14} className="text-status-danger" />
                  Écarts significatifs ({ecartAlerts.length})
                </h4>
                {ecartAlerts.length === 0 ? (
                  <div className="text-center py-6 text-content-muted text-sm">Aucun écart significatif</div>
                ) : (
                  <div className="space-y-2">
                    {ecartAlerts.map((alert: SupervisionAlert) => (
                      <div
                        key={alert.sessionId}
                        className={`p-3 rounded-lg border ${
                          alert.severity === 'HIGH'
                            ? 'bg-status-danger-bg border-status-danger/50'
                            : 'bg-status-warning-bg border-status-warning/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-content-primary">{alert.caisseNom}</div>
                            <div className="text-[10px] text-content-muted">{alert.caissierNom}</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-bold ${
                              Number(alert.ecart) < 0 ? 'text-status-danger' : 'text-status-warning'
                            }`}>
                              {Number(alert.ecart) > 0 ? '+' : ''}{Number(alert.ecart).toLocaleString('fr-FR')} FCFA
                            </div>
                            <div className={`text-[10px] font-medium ${
                              alert.severity === 'HIGH' ? 'text-status-danger' : 'text-status-warning'
                            }`}>
                              {alert.severity}
                            </div>
                          </div>
                        </div>
                        {alert.closedAt && (
                          <div className="mt-1 text-[10px] text-content-muted">
                            Fermé le {new Date(alert.closedAt).toLocaleDateString('fr-FR')} à {new Date(alert.closedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== CLÔTURE TAB ===== */}
          {activeTab === 'cloture' && (
            <div className="space-y-3 p-2 animate-in slide-in-from-right-4 duration-300">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
                  <Calendar size={16} className="text-status-info" />
                  Clôture Journalière
                </h3>
                <span className="text-[11px] text-content-muted">
                  {new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              </div>

              {selectedAgence ? (
                <>
                  {/* Panel clôture agence */}
                  <AgencyClosurePanel
                    agenceId={selectedAgence.id}
                    agenceNom={selectedAgence.nom}
                    onClosureComplete={() => fetchData()}
                  />

                  {/* Panel approbation écarts */}
                  <EcartApprovalPanel
                    agenceId={selectedAgence.id}
                    onApprovalComplete={() => fetchData()}
                  />
                </>
              ) : (
                <div className="text-center py-12 text-content-muted">
                  <Building2 size={32} className="mx-auto opacity-50 mb-3" />
                  <p className="text-sm">Sélectionnez une agence pour gérer la clôture</p>
                </div>
              )}
            </div>
          )}

          {/* ===== AUDIT TAB ===== */}
          {activeTab === 'audit' && (
            <div className="h-full p-2 animate-in slide-in-from-right-4 duration-300">
              <CaisseAuditLog />
            </div>
          )}

        </div>
      </div>

      {/* MODAL DÉTAILS SESSION */}
      <Modal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        title="Détails de la Session"
        subtitle={selectedSession ? `Caissier: ${selectedSession.caissierNom}` : ""}
        size="lg"
      >
        {selectedSession && (
          <div className="flex flex-col h-[70vh] sm:h-[500px] -m-2">
            {/* KPI grid - Fixed height part */}
            <div className="p-2 border-b border-edge/50 mb-4 bg-surface-base z-10">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 rounded-xl bg-surface/40 border border-edge-subtle">
                  <div className="text-[10px] sm:text-xs text-content-muted uppercase font-bold mb-1">Ouverture</div>
                  <div className="text-content-primary text-xs sm:text-sm font-medium">
                    {resolveOpenedAt(selectedSession) ? new Date(resolveOpenedAt(selectedSession)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                  </div>
                </div>
                <div className="p-2 sm:p-3 rounded-xl bg-surface/40 border border-edge-subtle">
                  <div className="text-[10px] sm:text-xs text-content-muted uppercase font-bold mb-1">Solde Initial</div>
                  <div className="text-content-primary text-xs sm:text-sm font-mono font-bold">{formatMoney(Number(selectedSession.soldeInitial || 0))}</div>
                </div>
                <div className="p-2 sm:p-3 rounded-xl bg-surface/40 border border-edge-subtle col-span-2 sm:col-span-1">
                  <div className="text-[10px] sm:text-xs text-content-muted uppercase font-bold mb-1">Solde Actuel</div>
                  <div className="text-status-success text-xs sm:text-sm font-mono font-bold">{formatMoney(getSoldeTheorique(selectedSession))}</div>
                </div>
              </div>
            </div>

            {/* Operations - Scrollable part */}
            <div className="flex-1 flex flex-col min-h-0 px-2 space-y-3">
              <h4 className="text-xs sm:text-sm font-bold text-content-muted uppercase tracking-wider flex items-center gap-2">
                <TrendingUp size={14} className="sm:size-4" />
                Dernières Opérations
              </h4>
              <div className="flex-1 overflow-auto rounded-xl border border-edge bg-surface-base/50 custom-scrollbar">
                {selectedSession.operations?.length === 0 ? (
                  <div className="p-8 sm:p-12 text-center text-content-muted italic">Aucune opération enregistrée</div>
                ) : (
                  <div className="min-w-full inline-block align-middle">
                    <table className="w-full text-xs sm:text-sm text-left border-collapse">
                      <thead className="sticky top-0 bg-surface-base z-10 text-[10px] sm:text-xs font-bold uppercase text-content-muted tracking-wider">
                        <tr>
                          <th className="p-2 sm:p-3 border-b border-edge">Date & Heure</th>
                          <th className="p-2 sm:p-3 border-b border-edge">Type</th>
                          <th className="p-2 sm:p-3 border-b border-edge text-right">Montant</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-edge">
                        {selectedSession.operations?.map((op: SupervisionOperation) => (
                          <tr key={op.id} className="hover:bg-surface/20 active:bg-surface/30 transition-colors">
                            <td className="p-2 sm:p-3 text-content-muted font-mono text-[10px] sm:text-xs whitespace-nowrap">
                              {op.createdAt ? new Date(op.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                            </td>
                            <td className="p-2 sm:p-3">
                              <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase whitespace-nowrap ${
                                (op.typeOperation || '').toLowerCase().includes('retrait') || (op.typeOperation || '').toLowerCase().includes('disbursement') || (op.typeOperation || '').toLowerCase().includes('distribution')
                                  ? 'bg-status-danger-bg text-status-danger' : 'bg-status-success-bg text-status-success'
                              }`}>
                                {translateOperationType(op.typeOperation)}
                              </span>
                            </td>
                            <td className={`p-2 sm:p-3 text-right font-mono font-bold whitespace-nowrap text-[10px] sm:text-xs ${
                              (op.typeOperation || '').toLowerCase().includes('retrait') ? 'text-status-danger' : 'text-status-success'
                            }`}>
                              {(op.typeOperation || '').toLowerCase().includes('retrait') ? '-' : '+'}{formatMoney(Number(op.montant || 0))}
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
          <div className="p-4 bg-status-danger-bg border border-status-danger/20 rounded-xl flex gap-3 text-status-danger">
            <AlertTriangle className="shrink-0" size={24} />
            <div>
              <p className="font-bold">Action irréversible</p>
              <p className="text-sm opacity-80">
                Vous êtes sur le point de forcer la clôture de la caisse de <strong>{selectedSession?.caissierNom}</strong>.
              </p>
            </div>
          </div>
          
          <div className="p-4 bg-surface/50 rounded-xl space-y-3">
             <div className="flex justify-between items-center text-sm">
                <span className="text-content-muted">Solde théorique final :</span>
                <span className="text-content-primary font-mono font-bold">{formatMoney(getSoldeTheorique(selectedSession))}</span>
             </div>
             <p className="text-xs text-content-muted leading-relaxed italic border-t border-edge-subtle pt-2">
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
            <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-surface/50 to-surface/30 rounded-xl border border-edge-subtle">
              <div className={`
                w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shrink-0
                font-bold text-lg sm:text-xl
                ${isUserEnCaisse(selectedUser.id)
                  ? 'bg-status-success-bg border-2 border-status-success/50 text-status-success'
                  : (selectedUser.statut !== StatutUser.ACTIVE && selectedUser.statut !== 'Actif')
                    ? 'bg-status-danger-bg border-2 border-status-danger/50 text-status-danger'
                    : 'bg-accent/20 border-2 border-accent/50 text-accent'
                }
              `}>
                {selectedUser.nom?.[0]}{selectedUser.prenom?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold text-content-primary">{selectedUser.nom} {selectedUser.prenom}</h3>
                  {isUserEnCaisse(selectedUser.id) && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-success-bg text-status-success border border-status-success/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      En caisse
                    </span>
                  )}
                </div>
                <p className="text-sm text-content-muted truncate">{selectedUser.email}</p>
                <p className="text-xs text-content-muted mt-1">{selectedUser.role}</p>
              </div>
            </div>

            {/* KPIs Performance */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="p-3 rounded-xl bg-surface/40 border border-edge-subtle text-center">
                <BarChart3 size={16} className="mx-auto text-status-info mb-1" />
                <div className="text-lg sm:text-xl font-bold text-content-primary">
                  {loadingHistory ? '...' : userStats?.totalSessions || 0}
                </div>
                <div className="text-[10px] text-content-muted uppercase">Sessions totales</div>
              </div>
              <div className="p-3 rounded-xl bg-surface/40 border border-edge-subtle text-center">
                <TrendingUp size={16} className="mx-auto text-status-success mb-1" />
                <div className="text-lg sm:text-xl font-bold text-content-primary">
                  {loadingHistory ? '...' : userStats?.sessionsThisMonth || 0}
                </div>
                <div className="text-[10px] text-content-muted uppercase">Ce mois</div>
              </div>
              <div className="p-3 rounded-xl bg-surface/40 border border-edge-subtle text-center">
                <Wallet size={16} className="mx-auto text-status-warning mb-1" />
                <div className="text-sm sm:text-base font-bold text-content-primary font-mono">
                  {loadingHistory ? '...' : formatMoney(userStats?.totalEncaisse || 0)}
                </div>
                <div className="text-[10px] text-content-muted uppercase">Total encaissé</div>
              </div>
              <div className="p-3 rounded-xl bg-surface/40 border border-edge-subtle text-center">
                <AlertTriangle size={16} className={`mx-auto mb-1 ${(userStats?.ecartMoyen || 0) > 1000 ? 'text-status-danger' : 'text-content-muted'}`} />
                <div className={`text-sm sm:text-base font-bold font-mono ${(userStats?.ecartMoyen || 0) > 1000 ? 'text-status-danger' : 'text-content-primary'}`}>
                  {loadingHistory ? '...' : formatMoney(userStats?.ecartMoyen || 0)}
                </div>
                <div className="text-[10px] text-content-muted uppercase">Ecart moyen</div>
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
                  className="flex items-center gap-3 p-4 rounded-xl bg-status-success-bg border border-status-success/30
                           hover:bg-status-success-bg transition-all group"
                >
                  <div className="p-2 rounded-lg bg-status-success-bg">
                    <Eye size={18} className="text-status-success" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-content-primary">Voir la caisse active</div>
                    <div className="text-xs text-status-success">
                      {formatMoney(getSoldeTheorique(getActiveSessionForUser(selectedUser.id) || {}))}
                    </div>
                  </div>
                  <ChevronRight size={16} className="ml-auto text-status-success opacity-50 group-hover:opacity-100" />
                </button>
              )}

              {/* Action d'activation/désactivation - visible si permission canToggleUserStatus */}
              {permissions.canToggleUserStatus ? (
                <button
                  onClick={handleToggleUserStatus}
                  disabled={submitting}
                  className={`
                    flex items-center gap-3 p-4 rounded-xl border transition-all group
                    ${selectedUser.statut === StatutUser.ACTIVE
                      ? 'bg-status-danger-bg border-status-danger/30 hover:bg-status-danger-bg'
                      : 'bg-status-success-bg border-status-success/30 hover:bg-status-success-bg'
                    }
                    ${submitting ? 'opacity-50 cursor-wait' : ''}
                  `}
                >
                  <div className={`p-2 rounded-lg ${selectedUser.statut === StatutUser.ACTIVE ? 'bg-status-danger-bg' : 'bg-status-success-bg'}`}>
                    {selectedUser.statut === StatutUser.ACTIVE
                      ? <UserX size={18} className="text-status-danger" />
                      : <UserCheck size={18} className="text-status-success" />
                    }
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-content-primary">
                      {selectedUser.statut === StatutUser.ACTIVE ? 'Désactiver le compte' : 'Activer le compte'}
                    </div>
                    <div className={`text-xs ${selectedUser.statut === StatutUser.ACTIVE ? 'text-status-danger' : 'text-status-success'}`}>
                      {selectedUser.statut === StatutUser.ACTIVE ? 'Bloquer l\'accès' : 'Autoriser l\'accès'}
                    </div>
                  </div>
                  {submitting && <RefreshCw size={16} className="ml-auto animate-spin text-content-muted" />}
                </button>
              ) : (
                /* Indicateur de permission manquante - informatif */
                <div className="flex items-center gap-3 p-4 rounded-xl bg-surface/20 border border-edge-subtle opacity-50">
                  <div className="p-2 rounded-lg bg-surface-elevated/30">
                    <ShieldAlert size={18} className="text-content-muted" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-content-muted">Gestion du compte</div>
                    <div className="text-xs text-content-muted">Permission requise</div>
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
                  className="flex items-center gap-3 p-4 rounded-xl bg-status-danger-bg border border-status-danger/30
                           hover:bg-status-danger-bg transition-all group sm:col-span-2"
                >
                  <div className="p-2 rounded-lg bg-status-danger-bg">
                    <Lock size={18} className="text-status-danger" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-content-primary">Forcer la fermeture de caisse</div>
                    <div className="text-xs text-status-danger">Clôturer immédiatement la session</div>
                  </div>
                  <ChevronRight size={16} className="ml-auto text-status-danger opacity-50 group-hover:opacity-100" />
                </button>
              )}
            </div>

            {/* Historique compact */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-content-muted uppercase tracking-wider flex items-center gap-2">
                  <Clock size={14} />
                  Dernières Sessions
                </h4>
                {userHistory.length > 5 && (
                  <span className="text-xs text-content-muted">{userHistory.length} au total</span>
                )}
              </div>

              {loadingHistory ? (
                <div className="flex items-center justify-center py-8 text-content-muted">
                  <RefreshCw size={20} className="animate-spin mr-2" />
                  Chargement...
                </div>
              ) : userHistory.length === 0 ? (
                <div className="text-center py-8 text-content-muted">
                  <Clock size={24} className="mx-auto opacity-50 mb-2" />
                  <p className="text-sm">Aucune session enregistrée</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-auto custom-scrollbar pr-1">
                  {userHistory.slice(0, 10).map((session: SupervisionSessionData) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-surface/30 border border-edge-subtle"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          resolveSessionStatus(session) === 'OPEN'
                            ? 'bg-accent'
                            : resolveSessionStatus(session) === 'TIMED_OUT'
                              ? 'bg-status-warning'
                              : 'bg-surface-muted0'
                        }`} />
                        <div>
                          <div className="text-xs font-medium text-content-primary">
                            {new Date(session.openedAt).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="text-[10px] text-content-muted">
                            {session.closedAt
                              ? `Fermée à ${new Date(session.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                              : resolveSessionStatus(session) === 'TIMED_OUT'
                                ? 'Expirée'
                                : 'En cours'
                            }
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-content-primary">
                          {formatMoney(Number(session.soldeReel || session.montantFermetureDeclare || 0) || getSoldeTheorique(session))}
                        </div>
                        {session.ecart && Number(session.ecart) !== 0 && (
                          <div className={`text-[10px] font-mono ${Number(session.ecart) > 0 ? 'text-status-success' : 'text-status-danger'}`}>
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
            <div className="flex justify-end pt-4 border-t border-edge-subtle">
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
