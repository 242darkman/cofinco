import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Users, DollarSign, Filter, Activity, PiggyBank } from 'lucide-react';
import { FeatureHeader, FEATURE_DESCRIPTIONS } from '../../ui/FeatureHeader';
import { toast } from 'sonner';
import { compteEpargneApi, sessionCaisseApi } from '../../../lib/api-client';
import EpargneAccountForm from './EpargneAccountForm';
import EpargneTransactionForm from './EpargneTransactionForm';
import AccountDetailSlideOver from './AccountDetailSlideOver';
import AccountsList, { ACCOUNT_STATUS_FILTER_OPTIONS } from './AccountsList';
import EpargneInterestCalculator from './EpargneInterestCalculator';
import EpargneSavingsGoals from './EpargneSavingsGoals';
import ComptesBloquesSection from '../operations/ComptesBloquesSection';
import { ProtectedFeature, usePermissions } from '../../auth/ProtectedFeature';
import { getAccountBalance } from '../../../lib/account-config';
import { computeSessionStatus } from '../../../lib/format';
import { TypeCompte, type TypeCompteType, StatutCompte, type StatutCompteType } from '@shared/enum/status-constants';
import { AccountActivationModal } from '../caisse/AccountActivationModal';
import { caisseKeys, compteKeys } from '../../../lib/query-keys';


interface Compte {
  id: string;
  numeroCompte: string;
  typeCompte: string;
  solde: number;
  soldeCourant?: number;
  statut: string;
  clientId: string;
  createdAt?: string;
  dateOuverture?: string;
  tauxInteret?: number;
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

const ITEMS_PER_PAGE = 15;

export default function Epargnes({ activeView }: EpargnesProps) {
  const queryClient = useQueryClient();

  // UI state (modals, forms, selections)
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
  const [activationAccount, setActivationAccount] = useState<{
    id: string;
    numeroCompte: string;
    typeCompte: string;
    montantInitial: number;
    client: { id: string; nom: string; prenom: string; photoUrl?: string };
  } | null>(null);

  // Pagination & Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Permissions
  const { hasPermission } = usePermissions();

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

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (activeView) {
      if (activeView === 'epargnes-list' || activeView === 'epargnes-transactions') {
        setActiveTab(TypeCompte.CURRENT);
      }
    }
  }, [activeView]);

  // --- React Query: Comptes list ---
  const typeCompte = activeTab === TypeCompte.BLOCKED
    ? undefined
    : activeTab;

  const comptesQuery = useQuery({
    queryKey: compteKeys.list({ typeCompte, search: debouncedSearch, page: currentPage, limit: ITEMS_PER_PAGE }),
    queryFn: () => compteEpargneApi.getAll({
      search: debouncedSearch || undefined,
      page: currentPage,
      limit: ITEMS_PER_PAGE,
      typeCompte,
    }),
    enabled: activeTab !== TypeCompte.BLOCKED,
  });

  const comptes = useMemo(() => {
    const data = comptesQuery.data;
    return Array.isArray(data?.data) ? data.data : [];
  }, [comptesQuery.data]);

  const totalPages = comptesQuery.data?.totalPages || 1;
  const totalComptes = comptesQuery.data?.total || 0;
  const loading = comptesQuery.isLoading;

  // --- React Query: Stats ---
  const statsQuery = useQuery({
    queryKey: compteKeys.epargne(),
    queryFn: () => compteEpargneApi.getStats(),
  });

  const accountStats = useMemo(() => ({
    total: 0,
    epargne: 0,
    courant: 0,
    bloque: 0,
    totalSolde: 0,
    tauxMoyenGlobal: 0,
    tauxMoyenEpargne: 0,
    tauxMoyenCourant: 0,
    tauxMoyenBloque: 0,
    fluxEntrees: 0,
    fluxSorties: 0,
    ...statsQuery.data,
    // Keep flux values at 0 until backend provides them
    ...(statsQuery.data ? { fluxEntrees: 0, fluxSorties: 0 } : {}),
  }), [statsQuery.data]);

  const stats = useMemo(() => {
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

    const fluxNet = accountStats.fluxEntrees - accountStats.fluxSorties;

    return {
      totalComptes: activeTotal,
      activeLabel,
      soldeTotal: accountStats.totalSolde,
      fluxNet,
      fluxEntrees: accountStats.fluxEntrees,
      fluxSorties: accountStats.fluxSorties,
    };
  }, [accountStats, activeTab]);

  // --- Invalidation helper (replaces loadComptes) ---
  const invalidateComptes = () => {
    queryClient.invalidateQueries({ queryKey: compteKeys.lists() });
    queryClient.invalidateQueries({ queryKey: compteKeys.epargne() });
  };

  const handleTransaction = (compte: Compte, type: 'Dépôt' | 'Retrait') => {
    if (!compte.clients) {
      console.error('Cannot process transaction: compte has no associated client');
      return;
    }

    // Handle pending activation/payment accounts specially
    const isPendingPayment = [
      StatutCompte.PENDING_ACTIVATION,
      StatutCompte.PENDING_PAYMENT,
      StatutCompte.PENDING_PAYMENT_AND_APPROVAL,
    ].includes(compte.statut as StatutCompteType);
    if (isPendingPayment && type === 'Dépôt') {
      if (!sessionActive) {
        toast.warning('Pour activer un compte, veuillez d\'abord ouvrir une session de caisse');
        return;
      }
      setActivationAccount({
        id: compte.id,
        numeroCompte: compte.numeroCompte,
        typeCompte: compte.typeCompte,
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
    invalidateComptes();
  };

  const tabs = [
    { key: TypeCompte.CURRENT, label: 'Comptes Courants' },
    { key: TypeCompte.SAVINGS, label: 'Comptes Epargne' },
    { key: TypeCompte.BLOCKED, label: 'Comptes Bloqués' },
  ];

  return (
    <div className="space-y-4 pb-20 md:pb-0 font-sans">

      {/* Header with contextual help */}
      <FeatureHeader
        featureKey="finance.epargne"
        title={FEATURE_DESCRIPTIONS['finance.epargne'].title}
        subtitle={FEATURE_DESCRIPTIONS['finance.epargne'].subtitle}
        helpText={FEATURE_DESCRIPTIONS['finance.epargne'].helpText}
        icon={<PiggyBank size={24} />}
        actions={
          <ProtectedFeature requiredPermission={{ module: 'epargnes', action: 'create' }}>
            <button
              onClick={() => setShowAccountForm(true)}
              className="px-3 py-1.5 bg-status-info hover:bg-status-info text-white rounded-lg transition shadow-sm shadow-status-info/20 flex items-center gap-1.5 font-medium text-xs"
            >
              <Plus size={14} />
              Nouveau <span className="hidden sm:inline">Compte</span>
            </button>
          </ProtectedFeature>
        }
        className="px-1"
      />

      {/* 2. KPIs (Simplified & Compact) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Solde */}
        <div className="bg-gradient-to-br from-surface to-surface-base border border-edge rounded-xl p-3 flex flex-col justify-between shadow-sm relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <DollarSign size={40} />
          </div>
          <div>
            <p className="text-[10px] font-medium text-content-muted uppercase tracking-wider">Solde Total</p>
            <h3 className="text-xl font-bold text-content-primary mt-0.5">{stats.soldeTotal.toLocaleString()} <span className="text-xs font-normal text-content-muted">FCFA</span></h3>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-status-success animate-pulse"></div>
            <p className="text-[10px] text-status-success font-medium">Tous comptes confondus</p>
          </div>
        </div>

        {/* Nombre de Comptes */}
        <div className="bg-surface-base border border-edge rounded-xl p-3 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="absolute right-0 top-0 p-3 opacity-5 text-status-info">
            <Users size={40} />
          </div>
          <div>
             <p className="text-[10px] font-medium text-content-muted uppercase tracking-wider">Comptes {stats.activeLabel}</p>
             <h3 className="text-xl font-bold text-content-primary mt-0.5">{stats.totalComptes}</h3>
          </div>
          <div className="mt-2 text-[10px] text-status-info font-medium bg-status-info-bg px-2 py-0.5 rounded-full w-fit">
            Actifs maintenant
          </div>
        </div>

        {/* Flux du jour */}
        <div className="bg-surface-base border border-edge rounded-xl p-3 flex flex-col justify-between shadow-sm">
            <div className="flex items-start justify-between">
               <div>
                  <p className="text-[10px] font-medium text-content-muted uppercase tracking-wider">Flux du jour</p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <h3 className={`text-xl font-bold ${stats.fluxNet >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                      {stats.fluxNet >= 0 ? '+' : ''}{stats.fluxNet.toLocaleString('fr-FR')}
                    </h3>
                    <span className="text-[9px] text-content-muted">Net</span>
                  </div>
               </div>
               <div className={`p-1.5 rounded-lg ${stats.fluxNet >= 0 ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger'}`}>
                  <Activity size={16} />
               </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] font-medium">
               <span className="text-status-success bg-status-success/5 px-1.5 py-0.5 rounded">+{stats.fluxEntrees.toLocaleString('fr-FR')}</span>
               <span className="text-status-danger bg-status-danger/5 px-1.5 py-0.5 rounded">-{stats.fluxSorties.toLocaleString('fr-FR')}</span>
            </div>
        </div>
      </div>

      {/* 4. CONTENU DYNAMIQUE AVEC NAVIGATION PERSISTANTE */}
      <div className="mt-6 bg-surface-base rounded-lg border border-edge shadow-sm overflow-hidden flex flex-col">

          {/* Toolbar: Tabs + Search + Filter combined */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-2 gap-2 border-b border-edge bg-surface-muted/50">
              {/* Tabs */}
              <div className="flex bg-surface-subtle rounded-lg p-1 self-stretch sm:self-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setCurrentPage(1); }}
                    className={`
                      flex-1 sm:flex-none px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 whitespace-nowrap
                      ${activeTab === tab.key
                        ? 'bg-surface-elevated text-content-primary shadow-sm'
                        : 'text-content-muted hover:text-content-secondary'
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
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" size={14} />
                      <input
                        type="text"
                        placeholder="Rechercher..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-surface border border-edge rounded-lg text-content-primary placeholder-content-muted focus:ring-2 focus:ring-status-info/20 focus:border-status-info pl-8 pr-3 py-1.5 text-xs transition-all"
                      />
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                        statusFilter !== 'all'
                          ? 'text-status-info border-status-info bg-status-info-bg'
                          : 'text-content-muted border-edge bg-surface hover:bg-surface-muted-elevated'
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
                        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] bg-surface border border-edge rounded-lg shadow-xl py-1 animate-in fade-in zoom-in-95 duration-100">
                          {ACCOUNT_STATUS_FILTER_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setStatusFilter(option.value);
                                setShowStatusDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                                statusFilter === option.value
                                  ? 'bg-status-info-bg text-status-info font-medium'
                                  : 'text-content-secondary hover:bg-surface-muted'
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
            invalidateComptes();
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
          caisseName={sessionActive.caisseNom}
          onClose={() => setActivationAccount(null)}
          onSuccess={() => {
            setActivationAccount(null);
            invalidateComptes();
          }}
        />
      )}

      {detailCompteId && (
        <AccountDetailSlideOver
          compteId={detailCompteId}
          isOpen={!!detailCompteId}
          onClose={() => setDetailCompteId(null)}
          onRequestActivation={(account) => {
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
            invalidateComptes();
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
