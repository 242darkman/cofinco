import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Users, DollarSign, Filter, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { compteEpargneApi, sessionCaisseApi } from '../../../lib/api-client';
import EpargneAccountForm from './EpargneAccountForm';
import EpargneTransactionForm from './EpargneTransactionForm';
import AccountDetailSlideOver from './AccountDetailSlideOver';
import AccountsList from './AccountsList';
import EpargneInterestCalculator from './EpargneInterestCalculator';
import EpargneSavingsGoals from './EpargneSavingsGoals';
import ComptesBloquesSection from '../operations/ComptesBloquesSection';
import PageHeader from '../../ui/PageHeader';
import StatCard from '../../ui/StatCard';
import TabGroup from '../../ui/TabGroup';
import { ProtectedFeature, usePermissions } from '../../auth/ProtectedFeature';
import { getAccountBalance } from '../../../lib/account-config';
import { computeSessionStatus } from '../../../lib/format';
import { TypeCompte, type TypeCompteType, StatutCompte } from '@shared/enum/status-constants';
import { AccountActivationModal } from '../caisse/AccountActivationModal';


interface Compte {
  id: string;
  numero_compte: string;
  numeroCompte?: string;
  type_compte: string;
  typeCompte?: string;
  solde: number;
  soldeCourant?: number;
  solde_courant?: number;
  statut: string;
  client_id: string;
  clientId?: string;
  created_at?: string;
  createdAt?: string;
  date_ouverture?: string;
  taux_interet?: number;
  tauxInteret?: number;
  clients: {
    id: string;
    nom: string;
    prenom?: string;
    phone?: string;
    telephone?: string;
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
    queryKey: ['session-caisse', 'active'],
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
        numeroCompte: compte.numero_compte || compte.numeroCompte || '',
        typeCompte: compte.type_compte || compte.typeCompte || '',
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
    <div className="space-y-6 pb-20 md:pb-0 font-sans">

      {/* Header & Title */}
      <PageHeader
        title="Gestion des Comptes"
        description="Comptes d'épargne et placements"
        actions={
          <ProtectedFeature requiredPermission={{ module: 'epargnes', action: 'create' }}>
            <button
              onClick={() => setShowAccountForm(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition shadow-lg shadow-blue-900/20 flex items-center gap-2 font-medium text-sm"
            >
              <Plus size={18} />
              Nouveau Compte
            </button>
          </ProtectedFeature>
        }
      />

      {/* 2. KPIs (Simplified) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          title="Solde Total Encours" 
          value={stats.soldeTotal.toLocaleString() + ' FCFA'} 
          icon={DollarSign} 
          color="success"
          subtitle="Tous comptes confondus"
          className="border-emerald-500/20"
        />
        <StatCard 
          title="Nombre de Comptes" 
          value={stats.totalComptes} 
          icon={Users} 
          color="primary"
          subtitle={`${stats.activeLabel}`}
        />
        <div className="bg-surface-base p-4 rounded-xl border border-edge shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between">
               <div>
                  <p className="text-content-muted text-xs font-medium uppercase tracking-wider">Flux du jour</p>
                  <h3 className={`text-2xl font-bold mt-1 ${stats.fluxNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {stats.fluxNet >= 0 ? '+' : ''}{stats.fluxNet.toLocaleString('fr-FR')}
                  </h3>
               </div>
               <div className={`p-2 rounded-lg ${stats.fluxNet >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                  <Activity size={20} />
               </div>
            </div>
            <div className="mt-4 h-1 bg-surface-muted rounded-full overflow-hidden">
               {stats.fluxEntrees + stats.fluxSorties > 0 ? (
                 <div
                   className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                   style={{ width: `${(stats.fluxEntrees / (stats.fluxEntrees + stats.fluxSorties)) * 100}%` }}
                 />
               ) : (
                 <div className="h-full bg-slate-600 w-full rounded-full" />
               )}
            </div>
            <div className="flex justify-between mt-2 text-xs text-content-muted">
               <span className="text-emerald-400">Entrées: +{stats.fluxEntrees.toLocaleString('fr-FR')}</span>
               <span className="text-red-400">Sorties: -{stats.fluxSorties.toLocaleString('fr-FR')}</span>
            </div>
        </div>
      </div>

      {/* 3. NAVIGATION PERSISTANTE */}
      <div className="border-b border-slate-700">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setCurrentPage(1); }}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200
                ${activeTab === tab.key
                  ? 'border-emerald-500 text-emerald-400 bg-white/5' // Style Actif
                  : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700' // Style Inactif
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 4. CONTENU DYNAMIQUE */}
      <div className="mt-6">
        {activeTab === TypeCompte.BLOCKED ? (
          <ComptesBloquesSection />
        ) : (
          <>
            {/* Search Toolbar (Tabs removed) */}
            <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between bg-surface-base p-2 rounded-2xl border border-edge shadow-sm mb-6">
               <div className="relative flex-1 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={20} />
                  <input
                    type="text"
                    placeholder="Rechercher un client..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-transparent border-none text-content-primary placeholder-slate-500 focus:ring-0 px-10 py-2.5 text-sm font-medium"
                  />
               </div>

               <div className="hidden md:flex items-center border-l border-edge pl-4">
                  <button className="flex items-center gap-2 px-3 py-2 text-sm text-content-secondary hover:text-white hover:bg-surface-muted rounded-lg transition">
                     <Filter size={16} />
                     <span>Tous les statuts</span>
                  </button>
               </div>
            </div>

            {/* Account List */}
            <div className="bg-surface-base rounded-2xl border border-edge overflow-hidden shadow-theme-sm p-4">
               <AccountsList
                  data={comptes}
                  type={activeTab === TypeCompte.SAVINGS ? TypeCompte.SAVINGS : TypeCompte.CURRENT}
                  loading={loading}
                  onManage={(c) => setDetailCompteId(c.id)}
                  onTransaction={handleTransaction}
               />
            </div>
          </>
        )}
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
