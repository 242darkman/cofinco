import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Users, DollarSign, Filter, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { compteEpargneApi, sessionCaisseApi } from '../../../lib/api-client';
import EpargneAccountForm from './EpargneAccountForm';
import EpargneTransactionForm from './EpargneTransactionForm';
import AccountDetailSlideOver from './AccountDetailSlideOver';
import AccountsList, { ACCOUNT_STATUS_FILTER_OPTIONS } from './AccountsList';
import EpargneInterestCalculator from './EpargneInterestCalculator';
import EpargneSavingsGoals from './EpargneSavingsGoals';
import ComptesBloquesSection from '../operations/ComptesBloquesSection';
import PageHeader from '../../ui/PageHeader';
import StatCard from '../../ui/StatCard';
import TabGroup from '../../ui/TabGroup';
import { ProtectedFeature, usePermissions } from '../../auth/ProtectedFeature';
import { getAccountBalance } from '../../../lib/account-config';
import { computeSessionStatus } from '../../../lib/format';
import { TypeCompte, type TypeCompteType, StatutCompte, type StatutCompteType } from '@shared/enum/status-constants';
import { AccountActivationModal } from '../caisse/AccountActivationModal';
import { caisseKeys } from '../../../lib/query-keys';


interface Compte {
  id: string;
  numero_compte: string;
  type_compte: string;
  solde: number;
  solde_courant?: number;
  statut: string;
  client_id: string;
  created_at?: string;
  date_ouverture?: string;
  taux_interet?: number;
  clients: {
    id: string;
    nom: string;
    prenom?: string;
    phone?: string;
    telephone?: string;
    photoUrl?: string;
  } | null;
}

interface EpargnesProps {
  activeView?: string;
}

export default function Epargnes({ activeView }: EpargnesProps) {
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [selectedCompte, setSelectedCompte] = useState<Compte | null>(null);
  const [transactionType, setTransactionType] = useState<'Dépôt' | 'Retrait' | null>(null);
  const [detailCompteId, setDetailCompteId] = useState<string | null>(null);
  const [showInterestCalc, setShowInterestCalc] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [interestCompte, setInterestCompte] = useState<Compte | null>(null);
  const [goalsCompte, setGoalsCompte] = useState<Compte | null>(null);
  const [activeTab, setActiveTab] = useState<TypeCompteType>(TypeCompte.CURRENT);
  const [statusFilter, setStatusFilter] = useState<StatutCompteType | 'all'>('all');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  // État pour le modal d'activation de compte
  const [activationAccount, setActivationAccount] = useState<{
    id: string;
    numeroCompte: string;
    typeCompte: string;
    montantInitial: number;
    client: { id: string; nom: string; prenom: string; photoUrl?: string };
  } | null>(null);

  // Query for active caisse session (needed for account activation)
  const { data: sessionActive } = useQuery({
    queryKey: caisseKeys.sessionActive(),
    queryFn: async () => {
      const data = await sessionCaisseApi.getActive();
      const status = data ? computeSessionStatus(data) : null;
      if (data && status === 'OPEN') return data;
      return null;
    },
  });

  // Pagination & Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalComptes, setTotalComptes] = useState(0);
  const ITEMS_PER_PAGE = 15;

  // Permissions
  const { hasPermission } = usePermissions();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to page 1 on search
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load comptes when tab, page, or search changes
  useEffect(() => {
    if (activeTab !== TypeCompte.BLOCKED) {
      loadComptes();
    }
  }, [activeTab, currentPage, debouncedSearch]);

  useEffect(() => {
    if (activeView) {
      if (activeView === 'epargnes-list') {
        setActiveTab(TypeCompte.CURRENT);
      } else if (activeView === 'epargnes-transactions') {
        setActiveTab(TypeCompte.CURRENT);
      }
    }
  }, [activeView]);

  const loadComptes = useCallback(async () => {
    setLoading(true);
    try {
      // Map tab key to typeCompte value using enums
      const typeCompte = activeTab === TypeCompte.CURRENT
        ? TypeCompte.CURRENT
        : activeTab === TypeCompte.SAVINGS
          ? TypeCompte.SAVINGS
          : undefined;
      
      const result = await compteEpargneApi.getAll({
        search: debouncedSearch || undefined,
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        typeCompte
      });

      const safeData = Array.isArray(result.data) ? result.data : [];
      setComptes(safeData);
      setTotalPages(result.totalPages || 1);
      setTotalComptes(result.total || 0);
    } catch (error) {
      console.error('Exception chargement comptes:', error);
      setComptes([]);
      setTotalPages(1);
      setTotalComptes(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, currentPage, debouncedSearch]);

  const [accountStats, setAccountStats] = useState({
    total: 0,
    epargne: 0,
    courant: 0,
    bloque: 0,
    totalSolde: 0,
    tauxMoyenGlobal: 0,
    tauxMoyenEpargne: 0,
    tauxMoyenCourant: 0,
    tauxMoyenBloque: 0,
    // Flux journaliers (si disponibles via API dédiée)
    fluxEntrees: 0,
    fluxSorties: 0,
  });
  
  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const stats = await compteEpargneApi.getStats();
      // Merge API response with default flux values (API may not provide flux data yet)
      setAccountStats(prev => ({
        ...prev,
        ...stats,
        // Keep flux values at 0 until backend provides them
        fluxEntrees: 0,
        fluxSorties: 0,
      }));
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (!loading) loadStats();
  }, [loading, loadStats]);

  const stats = useMemo(() => {
    // Dynamic KPI Logic based on tab selection
    let activeTotal = accountStats.total;
    let activeLabel = 'actifs';

    if (activeTab === TypeCompte.CURRENT) {
      activeTotal = accountStats.courant;
      activeLabel = 'courants';
    } else if (activeTab === TypeCompte.SAVINGS) {
      activeTotal = accountStats.epargne;
      activeLabel = 'épargnes';
    } else if (activeTab === TypeCompte.BLOCKED) {
      activeTotal = accountStats.bloque;
      activeLabel = 'bloqués';
    }

    // Flux du jour - using real stats from API if available
    const fluxNet = accountStats.fluxEntrees - accountStats.fluxSorties;

    return {
      totalComptes: activeTotal,
      activeLabel: activeLabel,
      soldeTotal: accountStats.totalSolde,
      fluxNet: fluxNet,
      fluxEntrees: accountStats.fluxEntrees,
      fluxSorties: accountStats.fluxSorties,
    };
  }, [accountStats, activeTab]);

  const handleTransaction = (compte: Compte, type: 'Dépôt' | 'Retrait') => {
    if (!compte.clients) {
      console.error('Cannot process transaction: compte has no associated client');
      return;
    }

    // Handle pending activation accounts specially
    if (compte.statut === StatutCompte.PENDING_ACTIVATION && type === 'Dépôt') {
      if (!sessionActive) {
        toast.warning('Pour activer un compte, veuillez d\'abord ouvrir une session de caisse');
        return;
      }
      // Open the dedicated activation modal
      setActivationAccount({
        id: compte.id,
        numeroCompte: compte.numero_compte,
        typeCompte: compte.type_compte,
        montantInitial: getAccountBalance(compte),
        client: {
          id: compte.clients.id,
          nom: compte.clients.nom,
          prenom: compte.clients.prenom || '',
        }
      });
      return;
    }

    setSelectedCompte(compte);
    setTransactionType(type);
  };

  const handleTransactionSuccess = () => {
    setSelectedCompte(null);
    setTransactionType(null);
    loadComptes();
  };

  const tabs = [
    { key: TypeCompte.CURRENT, label: 'Comptes Courants' },
    { key: TypeCompte.SAVINGS, label: 'Comptes Epargne' },
    { key: TypeCompte.BLOCKED, label: 'Comptes Bloqués' },
  ];

  return (
    <div className="space-y-4 pb-20 md:pb-0 font-sans">

      {/* Header & Title */}
      {/* Header & Title - Ultra Compact */}
      <div className="flex items-center justify-between gap-4 px-1">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Gestion des Comptes</h1>
          <p className="text-[10px] text-slate-500 font-medium">Epargnes & Placements</p>
        </div>
        
        <ProtectedFeature requiredPermission={{ module: 'epargnes', action: 'create' }}>
          <button
            onClick={() => setShowAccountForm(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition shadow-sm shadow-blue-900/20 flex items-center gap-1.5 font-medium text-xs"
          >
            <Plus size={14} />
            Nouveau <span className="hidden sm:inline">Compte</span>
          </button>
        </ProtectedFeature>
      </div>

      {/* 2. KPIs (Simplified & Compact) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Solde */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-3 flex flex-col justify-between shadow-sm relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <DollarSign size={40} />
          </div>
          <div>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Solde Total</p>
            <h3 className="text-xl font-bold text-white mt-0.5">{stats.soldeTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">FCFA</span></h3>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <p className="text-[10px] text-emerald-400 font-medium">Tous comptes confondus</p>
          </div>
        </div>

        {/* Nombre de Comptes */}
        <div className="bg-surface-base border border-edge rounded-xl p-3 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="absolute right-0 top-0 p-3 opacity-5 text-blue-500">
            <Users size={40} />
          </div>
          <div>
             <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Comptes {stats.activeLabel}</p>
             <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.totalComptes}</h3>
          </div>
          <div className="mt-2 text-[10px] text-blue-500 font-medium bg-blue-500/10 px-2 py-0.5 rounded-full w-fit">
            Actifs maintenant
          </div>
        </div>

        {/* Flux du jour */}
        <div className="bg-surface-base border border-edge rounded-xl p-3 flex flex-col justify-between shadow-sm">
            <div className="flex items-start justify-between">
               <div>
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Flux du jour</p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <h3 className={`text-xl font-bold ${stats.fluxNet >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {stats.fluxNet >= 0 ? '+' : ''}{stats.fluxNet.toLocaleString('fr-FR')}
                    </h3>
                    <span className="text-[9px] text-slate-400">Net</span>
                  </div>
               </div>
               <div className={`p-1.5 rounded-lg ${stats.fluxNet >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                  <Activity size={16} />
               </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] font-medium">
               <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 px-1.5 py-0.5 rounded">+{stats.fluxEntrees.toLocaleString('fr-FR')}</span>
               <span className="text-red-600 dark:text-red-400 bg-red-500/5 px-1.5 py-0.5 rounded">-{stats.fluxSorties.toLocaleString('fr-FR')}</span>
            </div>
        </div>
      </div>

      {/* 3. NAVIGATION (Integrated below) */}
      {/* Removed separate nav block */}

      {/* 4. CONTENU DYNAMIQUE AVEC NAVIGATION PERSISTANTE */}
      <div className="mt-6 bg-surface-base rounded-lg border border-edge shadow-sm overflow-hidden flex flex-col">
          
          {/* Toolbar: Tabs + Search + Filter combined */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-2 gap-2 border-b border-edge bg-slate-50 dark:bg-slate-900/50">
              {/* Tabs */}
              <div className="flex bg-slate-200 dark:bg-slate-800 rounded-lg p-1 self-stretch sm:self-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setCurrentPage(1); }}
                    className={`
                      flex-1 sm:flex-none px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 whitespace-nowrap
                      ${activeTab === tab.key
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }
                    `}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search & Filter - Visible only for non-blocked tabs, or adapted */}
              {activeTab !== TypeCompte.BLOCKED && (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input
                        type="text"
                        placeholder="Rechercher..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 pl-8 pr-3 py-1.5 text-xs transition-all"
                      />
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                        statusFilter !== 'all'
                          ? 'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                          : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Filter size={12} />
                      <span className="hidden sm:inline">
                        {ACCOUNT_STATUS_FILTER_OPTIONS.find(o => o.value === statusFilter)?.label || 'Tous les statuts'}
                      </span>
                    </button>
                    {showStatusDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowStatusDropdown(false)} />
                        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1 animate-in fade-in zoom-in-95 duration-100">
                          {ACCOUNT_STATUS_FILTER_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setStatusFilter(option.value);
                                setShowStatusDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                                statusFilter === option.value
                                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
          </div>

          {/* Content Area */}
          <div className="">
            {activeTab === TypeCompte.BLOCKED ? (
              <div className="p-4">
                 <ComptesBloquesSection />
              </div>
            ) : (
                <AccountsList
                  data={comptes}
                  type={activeTab === TypeCompte.SAVINGS ? TypeCompte.SAVINGS : TypeCompte.CURRENT}
                  loading={loading}
                  statusFilter={statusFilter}
                  onManage={(c) => setDetailCompteId(c.id)}
                  onTransaction={handleTransaction}
                />
            )}
          </div>
      </div>

      {showAccountForm && (
        <EpargneAccountForm
          onClose={() => setShowAccountForm(false)}
          onSuccess={() => {
            setShowAccountForm(false);
            loadComptes();
          }}
        />
      )}

      {selectedCompte && selectedCompte.clients && transactionType && (
        <EpargneTransactionForm
          compte={selectedCompte as Compte & { clients: NonNullable<Compte['clients']> }}
          type={transactionType}
          onClose={() => {
            setSelectedCompte(null);
            setTransactionType(null);
          }}
          onSuccess={handleTransactionSuccess}
        />
      )}

      {/* Modal d'activation de compte (pour comptes PENDING_ACTIVATION) */}
      {activationAccount && sessionActive && (
        <AccountActivationModal
          account={activationAccount}
          sessionId={sessionActive.id}
          caisseName={sessionActive.caisse_nom}
          onClose={() => setActivationAccount(null)}
          onSuccess={() => {
            setActivationAccount(null);
            loadComptes();
          }}
        />
      )}

      {detailCompteId && (
        <AccountDetailSlideOver
          compteId={detailCompteId}
          isOpen={!!detailCompteId}
          onClose={() => setDetailCompteId(null)}
          onRequestActivation={(account) => {
            // Close the slideover and open the activation modal
            setDetailCompteId(null);
            setActivationAccount(account);
          }}
        />
      )}

      {showInterestCalc && interestCompte && (
        <EpargneInterestCalculator
          compte={interestCompte}
          onClose={() => {
            setShowInterestCalc(false);
            setInterestCompte(null);
          }}
          onSuccess={() => {
            setShowInterestCalc(false);
            setInterestCompte(null);
            loadComptes();
          }}
        />
      )}

      {showGoals && goalsCompte && (
        <EpargneSavingsGoals
          compteId={goalsCompte.id}
          compteSolde={goalsCompte.solde}
          onClose={() => {
            setShowGoals(false);
            setGoalsCompte(null);
          }}
        />
      )}
    </div>
  );
}
