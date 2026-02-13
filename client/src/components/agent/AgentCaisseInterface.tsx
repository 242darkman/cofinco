import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DollarSign, CheckCircle, AlertCircle, Search, CreditCard, Banknote, ArrowDownCircle, ArrowUpCircle, WifiOff } from 'lucide-react';
import AppShell from '../layout/AppShell';
import AgentSidebarContent from '../layout/AgentSidebarContent';
import AgentHeader from '../layout/AgentHeader';
import OfflineDaySession from './offline/OfflineDaySession';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNetworkStatus } from '@/contexts/NetworkContext';
import { useOfflinePendingCount } from '@/hooks/useJournalSync';
import { executeOfflineOperation } from '@/lib/offline-treasury';

interface AgentCaisseInterfaceProps {
  agentId: string;
  onLogout: () => void;
}

export default function AgentCaisseInterface({ agentId, onLogout }: AgentCaisseInterfaceProps) {
  const [agent, setAgent] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'versement' | 'retrait' | 'remboursement' | 'epargne' | 'offline'>('versement');

  // Offline support
  const { user } = useUserProfile();
  const networkStatus = useNetworkStatus();
  const isOffline = networkStatus === 'offline';
  const pendingOffline = useOfflinePendingCount();
  const [searchClient, setSearchClient] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [montant, setMontant] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchAgentInfo();
    fetchRecentTransactions();
  }, [agentId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const mobile = e.matches;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchAgentInfo = async () => {
    try {
      const response = await fetch(`/api/agents-caisse/${agentId}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data) setAgent(data);
      }
    } catch (error) {
      console.error('Erreur chargement agent:', error);
    }
  };

  const fetchRecentTransactions = async () => {
    try {
      const response = await fetch(`/api/transactions?agent_id=${agentId}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setTransactions(data || []);
      }
    } catch (error) {
      console.error('Erreur chargement transactions:', error);
    }
  };

  const searchClients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    try {
      const response = await fetch(`/api/clients?search=${encodeURIComponent(query)}&limit=10`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const results = Array.isArray(data) ? data : (data.data || []);
        setSearchResults(results);
        setShowSearchResults(results.length > 0);
      }
    } catch (error) {
      console.error('Erreur recherche clients:', error);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchClient(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => searchClients(value), 300);
  };

  const selectClient = (client: any) => {
    setSelectedClient(client);
    setSearchClient(client.nomComplet || `${client.nom || ''} ${client.prenom || ''}`.trim());
    setShowSearchResults(false);
    setSearchResults([]);
  };

  const handleTransaction = async () => {
    if (!selectedClient || !montant) {
      setNotification({ type: 'error', message: 'Veuillez sélectionner un client et saisir un montant' });
      return;
    }

    const amount = parseFloat(montant);
    if (isNaN(amount) || amount <= 0) {
      setNotification({ type: 'error', message: 'Montant invalide' });
      return;
    }

    if (agent && amount > agent.limite_transaction_max) {
      setNotification({ type: 'error', message: `Montant supérieur à la limite autorisée (${agent.limite_transaction_max} FCFA)` });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/caisse-agent/operations-terrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'COLLECT_CASH',
          agentId,
          clientId: selectedClient.id,
          montant: amount,
          typePaiementClient: activeTab,
          numeroRecu: reference || undefined,
          observations: `${getTabLabel(activeTab)} via interface caisse`,
          idempotencyKey: `${agentId}-${activeTab}-${Date.now()}`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Erreur lors de la transaction');
      }

      setNotification({ type: 'success', message: `${getTabLabel(activeTab)} de ${amount.toLocaleString()} FCFA effectué avec succès` });
      setMontant('');
      setReference('');
      setSelectedClient(null);
      setSearchClient('');
      fetchRecentTransactions();
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Erreur lors de la transaction' });
    } finally {
      setLoading(false);
    }
  };

  const getTabLabel = (tab: string) => {
    switch (tab) {
      case 'versement': return 'Versement';
      case 'retrait': return 'Retrait';
      case 'remboursement': return 'Remboursement crédit';
      case 'epargne': return 'Collecte épargne';
      case 'offline': return 'Session Offline';
      default: return tab;
    }
  };

  const getTabIcon = (tab: string, size = 20) => {
    switch (tab) {
      case 'versement': return <ArrowDownCircle size={size} />;
      case 'retrait': return <ArrowUpCircle size={size} />;
      case 'remboursement': return <CreditCard size={size} />;
      case 'epargne': return <Banknote size={size} />;
      case 'offline': return <WifiOff size={size} />;
    }
  };

  const canPerformTab = (tab: typeof activeTab) => {
    if (tab === 'offline') return true; // Offline session always accessible
    if (!agent) return false;
    switch (tab) {
      case 'versement': return agent.peut_faire_versements;
      case 'retrait': return agent.peut_faire_retraits;
      case 'remboursement': return agent.peut_rembourser_credits;
      case 'epargne': return agent.peut_collecter_epargnes;
      default: return false;
    }
  };

  const canPerformAction = () => canPerformTab(activeTab);

  return (
    <AppShell
      isMobile={isMobile}
      sidebarOpen={sidebarOpen}
      onCloseSidebar={() => setSidebarOpen(false)}
      sidebarWidthOpen="w-64"
      sidebarWidthClosed="w-16"
      contentOffsetOpen="lg:ml-64"
      contentOffsetClosed="lg:ml-16"
      sidebar={
        <AgentSidebarContent
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLogout={onLogout}
          agent={agent ? {
            nomComplet: agent.user?.nomComplet || '',
            codeAgent: agent.codeAgent || '',
            peutFaireVersements: agent.peutFaireVersements || false,
            peutFaireRetraits: agent.peutFaireRetraits || false,
            peutRembourserCredits: agent.peutRembourserCredits || false,
            peutCollecterEpargnes: agent.peutCollecterEpargnes || false,
          } : null}
        />
      }
      header={
        <AgentHeader
          agent={agent ? {
            nomComplet: agent.user?.nomComplet || '',
            codeAgent: agent.codeAgent || '',
          } : null}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          isMobile={isMobile}
          sidebarOpen={sidebarOpen}
        />
      }
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-5 gap-4 mb-6">
          {(['versement', 'retrait', 'remboursement', 'epargne', 'offline'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              disabled={!canPerformTab(tab)}
              className={`p-4 rounded-xl border transition-all duration-300 relative ${
                activeTab === tab
                  ? tab === 'offline'
                    ? 'bg-gradient-to-br from-amber-600 to-orange-600 border-amber-500 shadow-lg shadow-amber-500/30 text-white scale-105'
                    : 'bg-gradient-to-br from-blue-600 to-cyan-600 border-blue-500 shadow-lg shadow-blue-500/30 text-white scale-105'
                  : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:scale-105'
              } ${!canPerformTab(tab) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                {getTabIcon(tab)}
                {tab === 'offline' && pendingOffline > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {pendingOffline > 99 ? '99+' : pendingOffline}
                  </span>
                )}
              </div>
              <p className="font-semibold text-sm">{getTabLabel(tab)}</p>
            </button>
          ))}
        </div>

        {/* Offline Session Tab */}
        {activeTab === 'offline' && (
          <div className="animate-slide-up">
            {user?.id ? (
              <OfflineDaySession
                agentId={parseInt(user.id, 10)}
                agenceId={user.agenceId || ''}
              />
            ) : (
              <div className="text-center py-12 text-slate-400">Chargement du profil...</div>
            )}
          </div>
        )}

        {/* Transaction Tabs */}
        {activeTab !== 'offline' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card-gradient p-6 animate-slide-up">
              <h2 className="text-xl font-bold mb-4 gradient-text">Nouvelle Transaction</h2>

              {!canPerformAction() && (
                <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 mb-4 flex items-center gap-3">
                  <AlertCircle className="text-blue-400" size={20} />
                  <p className="text-blue-400 text-sm">
                    Vous n'avez pas l'autorisation pour effectuer cette action
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    <Search size={16} className="inline mr-1" />
                    Rechercher un client
                  </label>
                  <input
                    type="text"
                    placeholder="Nom, téléphone ou email..."
                    value={searchClient}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                    onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                    className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 input-focus"
                    disabled={!canPerformAction()}
                  />
                  {showSearchResults && searchResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                      {searchResults.map((client: any) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => selectClient(client)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-700 transition border-b border-slate-700 last:border-b-0"
                        >
                          <p className="text-white font-semibold text-sm">
                            {client.nomComplet || `${client.nom || ''} ${client.prenom || ''}`.trim()}
                          </p>
                          <p className="text-slate-400 text-xs">{client.telephone || client.phone || ''}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedClient && (
                    <div className="mt-2 p-3 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center justify-between">
                      <div>
                        <p className="text-green-400 font-semibold">
                          {selectedClient.nomComplet || `${selectedClient.nom || ''} ${selectedClient.prenom || ''}`.trim()}
                        </p>
                        <p className="text-sm text-slate-400">{selectedClient.telephone || selectedClient.phone || ''}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSelectedClient(null); setSearchClient(''); }}
                        className="text-slate-400 hover:text-white text-sm"
                      >
                        &times;
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    <DollarSign size={16} className="inline mr-1" />
                    Montant (FC)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 input-focus text-2xl font-bold"
                    disabled={!canPerformAction()}
                  />
                  {agent && (
                    <p className="text-xs text-slate-500 mt-1">
                      Limite: {agent.limite_transaction_max.toLocaleString()} FCFA
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Référence (optionnelle)
                  </label>
                  <input
                    type="text"
                    placeholder="REF-123456"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 input-focus"
                    disabled={!canPerformAction()}
                  />
                </div>

                <button
                  onClick={handleTransaction}
                  disabled={loading || !canPerformAction()}
                  className="w-full btn-primary py-4 text-lg"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      Traitement...
                    </div>
                  ) : (
                    `Valider ${getTabLabel(activeTab)}`
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card-gradient p-6">
              <h3 className="text-lg font-bold mb-4">Mes Informations</h3>
              <div className="space-y-3">
                <div className="bg-slate-700/30 p-3 rounded-lg">
                  <p className="text-xs text-slate-400">Caisse assignée</p>
                  <p className="font-semibold text-white">{agent?.caisse_assignee || 'Non assigné'}</p>
                </div>
                <div className="bg-slate-700/30 p-3 rounded-lg">
                  <p className="text-xs text-slate-400">Statut</p>
                  <span className="inline-block mt-1 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-semibold">
                    {ALL_STATUS_LABELS[agent?.statut || ''] || agent?.statut || 'Actif'}
                  </span>
                </div>
                <div className="bg-slate-700/30 p-3 rounded-lg">
                  <p className="text-xs text-slate-400">Horaires</p>
                  <p className="font-semibold text-white">
                    {agent?.horaire_debut} - {agent?.horaire_fin}
                  </p>
                </div>
              </div>
            </div>

            <div className="card-gradient p-6">
              <h3 className="text-lg font-bold mb-4">Transactions Récentes</h3>
              <div className="space-y-2">
                {transactions.slice(0, 5).map((tx, idx) => (
                  <div key={idx} className="bg-slate-700/30 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-white">{tx.type}</span>
                      <span className="text-sm font-bold text-green-400">{tx.montant} FCFA</span>
                    </div>
                    <p className="text-xs text-slate-400">{tx.reference}</p>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">Aucune transaction</p>
                )}
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-2xl border animate-slide-down ${
          notification.type === 'success'
            ? 'bg-green-500/90 border-green-400 text-white'
            : 'bg-blue-500/90 border-blue-400 text-white'
        }`}>
          <div className="flex items-center gap-3">
            {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <p className="font-semibold">{notification.message}</p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
