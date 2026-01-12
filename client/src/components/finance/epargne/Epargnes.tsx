import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Eye, TrendingUp, TrendingDown, Users, DollarSign, Percent, PiggyBank, Lock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { compteEpargneApi } from '../../../lib/api-client';
import EpargneAccountForm from './EpargneAccountForm';
import EpargneTransactionForm from './EpargneTransactionForm';
import EpargneDetailModal from './EpargneDetailModal';
import EpargneInterestCalculator from './EpargneInterestCalculator';
import EpargneSavingsGoals from './EpargneSavingsGoals';
import ComptesBloquesSection from '../operations/ComptesBloquesSection';
import PageHeader from '../../ui/PageHeader';
import StatCard from '../../ui/StatCard';
import TabGroup from '../../ui/TabGroup';
import ResponsiveTable, { TableColumn } from '../../ui/ResponsiveTable';
import Badge from '../../ui/Badge';
import { ProtectedFeature, usePermissions } from '../../auth/ProtectedFeature';


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
  const [activeTab, setActiveTab] = useState<'courant' | 'epargne' | 'bloques'>('courant');

  // Pagination & Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalComptes, setTotalComptes] = useState(0);
  const ITEMS_PER_PAGE = 15;

  // RBAC permissions
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
    if (activeTab !== 'bloques') {
      loadComptes();
    }
  }, [activeTab, currentPage, debouncedSearch]);

  useEffect(() => {
    if (activeView) {
      if (activeView === 'epargnes-list') {
        setActiveTab('courant');
      } else if (activeView === 'epargnes-transactions') {
        setActiveTab('courant');
      }
    }
  }, [activeView]);

  // Debug: log when detailCompteId changes
  useEffect(() => {
    console.log('detailCompteId changed:', detailCompteId);
  }, [detailCompteId]);

  const loadComptes = useCallback(async () => {
    setLoading(true);
    try {
      // Map tab to typeCompte filter
      const typeCompte = activeTab === 'courant' ? 'Courant' : activeTab === 'epargne' ? 'Épargne' : undefined;
      
      const result = await compteEpargneApi.getAll({
        search: debouncedSearch || undefined,
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        typeCompte
      });

      // API now returns { data, total, page, limit, totalPages }
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

  // Comptes are already filtered server-side
  const comptesFiltered = comptes;

  const formatCompactMoney = (amount: number) => {
    if (amount >= 1000000000) return (amount / 1000000000).toFixed(1) + ' Md FCFA';
    if (amount >= 1000000) return (amount / 1000000).toFixed(1) + ' M FCFA';
    return amount.toLocaleString('fr-FR') + ' FCFA';
  };

  // Helper to get solde value from various property names
  const getSolde = (c: Compte): number => {
    const value = c.solde ?? c.soldeCourant ?? c.solde_courant ?? 0;
    return Number(value) || 0;
  };

  // Helper to get client display name
  const getClientName = (c: Compte): string => {
    if (!c.clients) return 'Client inconnu';
    const prenom = c.clients.prenom || '';
    const nom = c.clients.nom || '';
    return `${prenom} ${nom}`.trim() || 'Client inconnu';
  };

  // Helper to get phone
  const getClientPhone = (c: Compte): string => {
    return c.clients?.phone || c.clients?.telephone || 'N/A';
  };

  // Helper to format date
  const formatDate = (c: Compte): string => {
    const dateStr = c.date_ouverture || c.created_at || c.createdAt;
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR');
    } catch {
      return 'N/A';
    }
  };

  const stats = useMemo(() => ({
    totalComptes: totalComptes,
    comptesActifs: comptesFiltered.filter(c => c.statut === 'Actif').length,
    soldeTotal: comptesFiltered.reduce((sum, c) => sum + getSolde(c), 0),
    comptesEpargne: totalComptes, // Server already filters by type
    comptesCourant: totalComptes,
    tauxMoyen: 0 // Taux not applicable for comptes courants
  }), [comptesFiltered, totalComptes]);

  const handleTransaction = (compte: Compte, type: 'Dépôt' | 'Retrait') => {
    // Ensure the compte has valid client data before proceeding
    if (!compte.clients) {
      console.error('Cannot process transaction: compte has no associated client');
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
    { key: 'courant', label: 'Comptes Courants', icon: DollarSign },
    { key: 'epargne', label: 'Comptes Epargne', icon: PiggyBank },
    { key: 'bloques', label: 'Comptes Bloqués', icon: Lock },
  ];

  // Column definitions matching ResponsiveTable interface
  const columns: TableColumn<Compte>[] = [
    {
      label: 'Compte',
      key: 'numero_compte',
      primary: true,
      format: (_value: any, row: Compte) => (
        <div>
          <div className="font-mono font-bold text-cyan-400">{row.numero_compte || row.numeroCompte}</div>
          <div className="text-xs text-slate-400">{row.type_compte || row.typeCompte}</div>
        </div>
      )
    },
    {
      label: 'Client',
      key: 'clients',
      format: (_value: any, row: Compte) => (
        <div>
          <div className="font-medium text-white">{getClientName(row)}</div>
          <div className="text-xs text-slate-500">{getClientPhone(row)}</div>
        </div>
      )
    },
    {
      label: 'Ouverture',
      key: 'created_at',
      format: (_value: any, row: Compte) => (
        <div className="text-sm text-slate-300">{formatDate(row)}</div>
      )
    },
    {
      label: 'Solde',
      key: 'solde',
      format: (_value: any, row: Compte) => (
        <span className="font-bold text-emerald-400">{getSolde(row).toLocaleString('fr-FR')} FCFA</span>
      )
    },
    {
      label: 'Statut',
      key: 'statut',
      format: (value: any) => {
         const color = value === 'Actif' ? 'success' : value === 'Suspendu' ? 'warning' : 'neutral';
         return <Badge variant={color} value={value} />;
      }
    }
  ];

  const canEditEpargnes = hasPermission('epargnes', 'edit');

  const handleActions = (row: Compte) => (
    <div className="flex gap-2">
      {canEditEpargnes && (
        <>
          <button
             onClick={(e) => { e.stopPropagation(); handleTransaction(row, 'Dépôt'); }}
             className="p-1.5 hover:bg-emerald-500/20 text-emerald-400 rounded transition"
             title="Dépôt"
             disabled={row.statut !== 'Actif'}
          >
            <TrendingUp size={16} />
          </button>
          <button
             onClick={(e) => { e.stopPropagation(); handleTransaction(row, 'Retrait'); }}
             className="p-1.5 hover:bg-blue-500/20 text-blue-400 rounded transition"
             title="Retrait"
             disabled={row.statut !== 'Actif'}
          >
            <TrendingDown size={16} />
          </button>
        </>
      )}
      <button
         onClick={(e) => { e.stopPropagation(); setDetailCompteId(row.id); }}
         className="p-1.5 hover:bg-slate-500/20 text-slate-400 rounded transition"
         title="Détails"
      >
        <Eye size={16} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">


      <PageHeader
        title="Gestion des Comptes"
        description="Comptes d'épargne et placements"
        actions={
          <ProtectedFeature requiredPermission={{ module: 'epargnes', action: 'create' }}>
            <button
              onClick={() => setShowAccountForm(true)}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white rounded-lg transition flex items-center gap-2 font-semibold text-sm"
            >
              <Plus size={16} />
              Nouveau Compte
            </button>
          </ProtectedFeature>
        }
      />

      <div className="px-1">
        <TabGroup 
          tabs={tabs} 
          activeTab={activeTab} 
          onTabChange={(id: string) => { setActiveTab(id as any); setCurrentPage(1); }} 
        />
      </div>

      {/* Search Bar */}
      {activeTab !== 'bloques' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher par nom client ou numéro de compte..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition"
          />
        </div>
      )}

      {activeTab === 'bloques' ? (
        <ComptesBloquesSection />
      ) : (
        <>
          {/* Stats Carousel */}
          <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:pb-0 no-scrollbar">
            <div className="flex md:grid md:grid-cols-4 gap-3 min-w-[max-content] md:min-w-0">
              <div className="w-[200px] md:w-auto">
                <StatCard 
                  title="Total Comptes" 
                  value={stats.totalComptes} 
                  icon={Users} 
                  color="primary"
                  subtitle={`${stats.comptesActifs} actifs`}
                />
              </div>
              <div className="w-[220px] md:w-auto">
                <StatCard 
                  title="Solde Total" 
                  value={formatCompactMoney(stats.soldeTotal)} 
                  icon={DollarSign} 
                  color="success"
                  subtitle="Tous les comptes"
                />
              </div>
              <div className="w-[200px] md:w-auto">
                <StatCard 
                  title="Comptes Épargne" 
                  value={stats.comptesEpargne} 
                  icon={PiggyBank} 
                  color="warning"
                  subtitle={`${stats.comptesCourant} courants`}
                />
              </div>
              <div className="w-[200px] md:w-auto">
                <StatCard 
                  title="Taux Moyen" 
                  value={stats.tauxMoyen.toFixed(1) + '%'} 
                  icon={Percent} 
                  color="neutral"
                  subtitle="Intérêt annuel"
                />
              </div>
            </div>
          </div>

          <ResponsiveTable
            data={comptesFiltered}
            columns={columns}
            loading={loading}
            emptyMessage={debouncedSearch ? `Aucun compte trouvé pour "${debouncedSearch}"` : "Aucun compte trouvé"}
            onRowClick={(row) => {
              console.log('Row clicked:', row.id);
              setDetailCompteId(row.id);
              console.log('DetailCompteId set to:', row.id);
            }}
            actions={handleActions}
          />

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="text-sm text-slate-400">
                Page {currentPage} sur {totalPages} ({totalComptes} comptes)
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-400 hover:text-white transition"
                  title="Première page"
                >
                  <ChevronsLeft size={18} />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-400 hover:text-white transition"
                  title="Page précédente"
                >
                  <ChevronLeft size={18} />
                </button>
                
                {/* Page Numbers */}
                <div className="flex items-center gap-1 px-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = currentPage - 2 + i;
                    if (currentPage <= 2) pageNum = i + 1;
                    if (currentPage >= totalPages - 1) pageNum = totalPages - 4 + i;
                    if (pageNum < 1 || pageNum > totalPages) return null;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded text-sm font-medium transition ${
                          pageNum === currentPage
                            ? 'bg-cyan-600 text-white'
                            : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-400 hover:text-white transition"
                  title="Page suivante"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-400 hover:text-white transition"
                  title="Dernière page"
                >
                  <ChevronsRight size={18} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

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

      {detailCompteId && (
        <EpargneDetailModal
          compteId={detailCompteId}
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
