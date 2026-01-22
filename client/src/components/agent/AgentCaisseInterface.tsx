import React, { useState, useEffect } from 'react';
import { DollarSign, CheckCircle, AlertCircle, Search, CreditCard, Banknote, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import AppShell from '../layout/AppShell';
import AgentSidebarContent from '../layout/AgentSidebarContent';
import AgentHeader from '../layout/AgentHeader';

interface AgentCaisseInterfaceProps {
  agentId: string;
  onLogout: () => void;
}

export default function AgentCaisseInterface({ agentId, onLogout }: AgentCaisseInterfaceProps) {
  const [agent, setAgent] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'versement' | 'retrait' | 'remboursement' | 'epargne'>('versement');
  const [searchClient, setSearchClient] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [montant, setMontant] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
    if (agentId.startsWith('demo-')) {
      setAgent({
        id: agentId,
        code_agent: 'AG0001',
        caisse_assignee: 'CAISSE_01',
        limite_transaction_max: 500000,
        peut_ouvrir_caisse: false,
        peut_fermer_caisse: false,
        peut_faire_versements: true,
        peut_faire_retraits: true,
        peut_faire_transferts: false,
        peut_rembourser_credits: true,
        peut_collecter_epargnes: true,
        peut_voir_solde_caisse: false,
        horaire_debut: '08:00',
        horaire_fin: '17:00',
        statut: 'ACTIVE',
        user: {
          nom_complet: 'Agent de Caisse Démo'
        }
      });
      return;
    }

    try {
      const response = await fetch(`/api/agents-caisse/${agentId}`);
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
      await new Promise(resolve => setTimeout(resolve, 1500));

      const transaction = {
        type: activeTab,
        client_id: selectedClient.id,
        montant: amount,
        agent_id: agentId,
        reference: reference || `TRX-${Date.now()}`,
        statut: 'VALIDATED',
        created_at: new Date().toISOString()
      };

      setNotification({ type: 'success', message: `${getTabLabel(activeTab)} de ${amount} FCFA effectué avec succès` });

      setMontant('');
      setReference('');
      setSelectedClient(null);
      setSearchClient('');
      fetchRecentTransactions();
    } catch (error) {
      setNotification({ type: 'error', message: 'Erreur lors de la transaction' });
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
      default: return tab;
    }
  };

  const getTabIcon = (tab: string, size = 20) => {
    switch (tab) {
      case 'versement': return <ArrowDownCircle size={size} />;
      case 'retrait': return <ArrowUpCircle size={size} />;
      case 'remboursement': return <CreditCard size={size} />;
      case 'epargne': return <Banknote size={size} />;
    }
  };

  const canPerformTab = (tab: typeof activeTab) => {
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
            nom_complet: agent.user?.nom_complet || '',
            code_agent: agent.code_agent || '',
            peut_faire_versements: agent.peut_faire_versements || false,
            peut_faire_retraits: agent.peut_faire_retraits || false,
            peut_rembourser_credits: agent.peut_rembourser_credits || false,
            peut_collecter_epargnes: agent.peut_collecter_epargnes || false,
          } : null}
        />
      }
      header={
        <AgentHeader
          agent={agent ? {
            nom_complet: agent.user?.nom_complet || '',
            code_agent: agent.code_agent || '',
          } : null}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          isMobile={isMobile}
          sidebarOpen={sidebarOpen}
        />
      }
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          {(['versement', 'retrait', 'remboursement', 'epargne'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              disabled={!canPerformTab(tab)}
              className={`p-4 rounded-xl border transition-all duration-300 ${
                activeTab === tab
                  ? 'bg-gradient-to-br from-blue-600 to-cyan-600 border-blue-500 shadow-lg shadow-blue-500/30 text-white scale-105'
                  : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:scale-105'
              } ${!canPerformTab(tab) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                {getTabIcon(tab)}
                <span className="text-2xl">
                  {tab === 'versement' && '💵'}
                  {tab === 'retrait' && '💸'}
                  {tab === 'remboursement' && '💳'}
                  {tab === 'epargne' && '💰'}
                </span>
              </div>
              <p className="font-semibold">{getTabLabel(tab)}</p>
            </button>
          ))}
        </div>

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
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    <Search size={16} className="inline mr-1" />
                    Rechercher un client
                  </label>
                  <input
                    type="text"
                    placeholder="Nom, téléphone ou email..."
                    value={searchClient}
                    onChange={(e) => setSearchClient(e.target.value)}
                    className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 input-focus"
                    disabled={!canPerformAction()}
                  />
                  {selectedClient && (
                    <div className="mt-2 p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
                      <p className="text-green-400 font-semibold">{selectedClient.nom}</p>
                      <p className="text-sm text-slate-400">{selectedClient.phone}</p>
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
                    {agent?.statut || 'Actif'}
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
