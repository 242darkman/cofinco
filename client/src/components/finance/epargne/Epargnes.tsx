import React, { useState, useEffect } from 'react';
import { Plus, Search, Eye, TrendingUp, TrendingDown, Users, DollarSign, Percent, PiggyBank, Target, Lock, FileText } from 'lucide-react';
import { compteEpargneApi, clientApi } from '../../../lib/api-client';
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
  type_compte: string;
  solde: number;
  taux_interet: number;
  date_ouverture: string;
  statut: string;
  client_id: string;
  clients: {
    id: string;
    nom: string;
    phone: string;
  };
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

  // RBAC permissions
  const { hasPermission } = usePermissions();

  useEffect(() => {
    loadComptes();
  }, []);

  useEffect(() => {
    if (activeView) {
      if (activeView === 'epargnes-list') {
        setActiveTab('courant');
      } else if (activeView === 'epargnes-transactions') {
        setActiveTab('courant');
      }
    }
  }, [activeView]);

  const loadComptes = async () => {
    setLoading(true);
    try {
      const [comptesData, clientsData] = await Promise.all([
        compteEpargneApi.getAll(),
        clientApi.getAll()
      ]);

      const safeClientsData = Array.isArray(clientsData) ? clientsData : [];
      const safeComptesData = Array.isArray(comptesData) ? comptesData : [];

      const clientsMap = new Map(safeClientsData.map((c: any) => [c.id, c]));
      
      const comptesWithClients = safeComptesData.map((compte: any) => ({
        ...compte,
        clients: clientsMap.get(compte.client_id) || { id: compte.client_id, nom: 'Client inconnu', phone: '' }
      }));

      setComptes(comptesWithClients);
    } catch (error) {
      console.error('Exception chargement comptes:', error);
      setComptes([]);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredComptes = () => {
    return comptes.filter(c => {
      if (activeTab === 'epargne') return c.type_compte === 'Épargne';
      if (activeTab === 'courant') return c.type_compte === 'Courant';
      return true;
    });
  };

  const comptesFiltered = getFilteredComptes();

  const formatCompactMoney = (amount: number) => {
    if (amount >= 1000000000) return (amount / 1000000000).toFixed(1) + ' Md FCFA';
    if (amount >= 1000000) return (amount / 1000000).toFixed(1) + ' M FCFA';
    return amount.toLocaleString('fr-FR') + ' FCFA';
  };

  const stats = {
    totalComptes: comptesFiltered.length,
    comptesActifs: comptesFiltered.filter(c => c.statut === 'Actif').length,
    soldeTotal: comptesFiltered.reduce((sum, c) => sum + Number(c.solde || 0), 0),
    comptesEpargne: comptes.filter(c => c.type_compte === 'Épargne').length,
    comptesCourant: comptes.filter(c => c.type_compte === 'Courant').length,
    tauxMoyen: comptesFiltered.length > 0
      ? comptesFiltered.reduce((sum, c) => sum + Number(c.taux_interet || 0), 0) / comptesFiltered.length
      : 0
  };

  const handleTransaction = (compte: Compte, type: 'Dépôt' | 'Retrait') => {
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
      format: (value: any, row: Compte) => (
        <div>
          <div className="font-mono font-bold text-cyan-400">{value}</div>
          <div className="text-xs text-slate-400">{row.type_compte}</div>
        </div>
      )
    },
    {
      label: 'Client',
      key: 'clients.nom',
      format: (value: any, row: Compte) => (
        <div>
          <div className="font-medium text-white">{value}</div>
          <div className="text-xs text-slate-500">{row.clients?.phone || 'N/A'}</div>
        </div>
      )
    },
    {
      label: 'INFO', // Merged rate and date for mobile compactness
      key: 'taux_interet',
      format: (value: any, row: Compte) => (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-slate-300">Taux: <span className="text-white font-bold">{row.taux_interet}%</span></div>
          <div className="text-xs text-slate-500">{new Date(row.date_ouverture).toLocaleDateString()}</div>
        </div>
      )
    },
    {
      label: 'Solde',
      key: 'solde',
      format: (value: any) => (
        <span className="font-bold text-emerald-400">{Number(value).toLocaleString('fr-FR')} FCFA</span>
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
        title="Gestion des Épargnes"
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
          onTabChange={(id: string) => setActiveTab(id as any)} 
        />
      </div>

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
            emptyMessage="Aucun compte trouvé"
            onRowClick={(row) => setDetailCompteId(row.id)}
            actions={handleActions}
          />
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

      {selectedCompte && transactionType && (
        <EpargneTransactionForm
          compte={selectedCompte}
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
