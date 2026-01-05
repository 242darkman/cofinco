import React, { useState, useEffect } from 'react';
import { 
  Activity, RefreshCw, ArrowRightLeft, Users, Smartphone, Wallet, 
  CreditCard, Lock, Unlock, FileText, TrendingUp, TrendingDown, Clock,
  PiggyBank, ArrowUpRight, ArrowDownRight, Shield
} from 'lucide-react';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import { Button, Card, StatCard, TabGroup } from '../../ui';
import { usePermissions } from '../../auth/ProtectedFeature';
import { sessionCaisseApi, caisseOperationApi, caisseSepareeApi } from '../../../lib/api-client';
import CaisseOuverture from './CaisseOuverture';
import CaisseOperations from './CaisseOperations';
import CaisseRapprochement from './CaisseRapprochement';
import CaisseTransferts from './CaisseTransferts';
import CaisseEtats from './CaisseEtats';
import CaisseSupervision from './CaisseSupervision';
import CaissePaiementModal from './CaissePaiementModal';
import CaisseEspeces from './CaisseEspeces';
import CaisseMobileMoney from './CaisseMobileMoney';

import CaisseAccessControl from './CaisseAccessControl';
import CaisseClientInfos from './CaisseClientInfos';

interface SessionCaisse {
  id: string;
  caissier_id: string;
  date_ouverture: string;
  date_fermeture?: string;
  solde_initial: number;
  solde_theorique: number;
  solde_reel?: number;
  ecart?: number;
  statut: string;
  observations: string;
  caissier_nom?: string;
  caisse_nom?: string;
}

interface Transaction {
  id: string;
  session_id: string;
  type_operation: string;
  montant: number;
  mode_paiement: string;
  reference: string;
  description: string;
  created_at: string;
}

interface CaisseProps {
  userRole?: string;
  onModuleChange?: (module: string) => void;
  activeView?: string;
  initialShowPaiement?: boolean;
  onPaiementModalClose?: () => void;
}

const toNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function CaisseDashboard({ 
  userRole, 
  onModuleChange, 
  activeView,
  initialShowPaiement = false,
  onPaiementModalClose
}: CaisseProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canOpenCaisse = hasPermission('caisse', 'open') || hasPermission('caisse', 'manage');
  const canCloseCaisse = hasPermission('caisse', 'close') || hasPermission('caisse', 'manage');
  const canCreatePayments = hasPermission('caisse', 'deposit') || hasPermission('paiements', 'create');

  const { mobileMoneyEnabled } = useFeatureFlags();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sessionActive, setSessionActive] = useState<SessionCaisse | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOuverture, setShowOuverture] = useState(false);
  const [showPaiement, setShowPaiement] = useState(false);
  const [caissesSeparees, setCaissesSeparees] = useState<any[]>([]);
  
  // Super-User mode: Admin can supervise a specific active session
  const [supervisedSession, setSupervisedSession] = useState<SessionCaisse | null>(null);

  const [accessGranted, setAccessGranted] = useState(userRole === 'Administrateur');

  // Actual session being used (own or supervised)
  const currentSession = supervisedSession || sessionActive;

  useEffect(() => {
    if (activeView) {
      switch (activeView) {
        case 'caisse-session': setActiveTab('dashboard'); break;
        case 'caisse-operations': setActiveTab('operations'); break;
        case 'caisse-cloture': setActiveTab('rapprochement'); break;
        default: setActiveTab('dashboard');
      }
    }
  }, [activeView]);

  useEffect(() => {
    if (initialShowPaiement) {
      setShowPaiement(true);
    }
  }, [initialShowPaiement]);

  useEffect(() => {
    loadSessionActive();
    loadTransactionsJour();
    loadCaissesSeparees();
  }, []);

  const loadSessionActive = async () => {
    try {
      // If we are in supervised mode, we already have the session data
      if (supervisedSession) {
        // Refresh it from API just in case? 
        // For simplicity, we just check if it's still active or use the supervised one
      }

      const data = await sessionCaisseApi.getActive();
      if (data && data.statut === 'Ouverte') {
        setSessionActive(data);
      } else {
        setSessionActive(null);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactionsJour = async () => {
    try {
      const data = await caisseOperationApi.getToday();
      setTransactions(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const loadCaissesSeparees = async () => {
    try {
      if (!currentSession?.id) return;
      const data = await caisseSepareeApi.getBySession(currentSession.id);
      setCaissesSeparees(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  useEffect(() => {
    if (currentSession?.id) {
      loadCaissesSeparees();
    }
  }, [currentSession]);

  const handleOuvertureCaisse = async () => {
    await loadSessionActive();
    await loadCaissesSeparees();
    setSupervisedSession(null); // Clear supervision if we open our own
    setShowOuverture(false);
  };

  const handleFermetureCaisse = () => {
    setActiveTab('rapprochement');
  };

  const totalEntrees = transactions
    .filter(t => ['Dépôt', 'Versement', 'Remboursement', 'Remboursement Crédit', 'Encaissement', 'Cotisation Tontine'].includes(t.type_operation))
    .reduce((sum, t) => sum + toNumber(t.montant), 0);

  const totalSorties = transactions
    .filter(t => ['Retrait', 'Décaissement', 'Prêt'].includes(t.type_operation))
    .reduce((sum, t) => sum + toNumber(t.montant), 0);

  const soldeActuel = currentSession
    ? toNumber(currentSession.solde_initial) + totalEntrees - totalSorties
    : 0;

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: Activity },
    { key: 'infos-client', label: 'Info Client', icon: Users },
    { key: 'especes', label: 'Espèces', icon: Wallet },
    { key: 'mobilemoney', label: 'Mobile Money', icon: Smartphone, disabled: !mobileMoneyEnabled },
    { key: 'rapprochement', label: 'Clôture', icon: RefreshCw },
    { key: 'transferts', label: 'Transferts', icon: ArrowRightLeft },
    { key: 'etats', label: 'États', icon: FileText },

    { key: 'supervision', label: 'Supervision', icon: Shield },
  ];

  if (!accessGranted) {
    return (
      <CaisseAccessControl
        onAccessGranted={() => setAccessGranted(true)}
        onClose={() => onModuleChange?.('dashboard')}
        userRole={userRole}
      />
    );
  }



  // Helper for rendering the dashboard view
  const DashboardView = () => (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      
      {/* Top Session Stats - Mobile First Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
             title="Solde Session" 
             value={soldeActuel}
             icon={Wallet}
             color="primary"
             subtitle={currentSession ? "Session Ouverte" : "Session Fermée"}
             trend={currentSession ? "Ouverte" : "Fermée"}
             trendUp={!!currentSession}
             className="col-span-2"
          />
          <StatCard
             title="Entrées" 
             value={totalEntrees}
             icon={ArrowDownRight}
             color="success"
             trend="+0%"
             trendUp={true}
          />
           <StatCard
             title="Sorties" 
             value={totalSorties}
             icon={ArrowUpRight}
             color="warning" // Warning color for money leaving
             trend="-0%"
             trendUp={false}
          />
      </div>

      {/* Quick Actions - Clean Cards */}
      <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-1">Actions Rapides</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
             <Card 
                variant="default" 
                padding="sm" 
                className="cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group"
                onClick={() => setActiveTab('especes')}
             >
                 <div className="flex flex-col items-center gap-3 py-2">
                     <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                         <Wallet size={24} />
                     </div>
                     <span className="text-sm font-medium text-slate-300 group-hover:text-white">Espèces</span>
                 </div>
             </Card>

             <Card 
                variant="default" 
                padding="sm" 
                className={`cursor-pointer transition-all group ${!mobileMoneyEnabled ? 'opacity-50 pointer-events-none' : 'hover:border-amber-500/50 hover:bg-amber-500/5'}`}
                onClick={() => mobileMoneyEnabled && setActiveTab('mobilemoney')}
             >
                 <div className="flex flex-col items-center gap-3 py-2">
                     <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
                         <Smartphone size={24} />
                     </div>
                     <span className="text-sm font-medium text-slate-300 group-hover:text-white">Mobile Money</span>
                 </div>
             </Card>

             <Card 
                variant="default" 
                padding="sm" 
                className="cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
                onClick={() => setActiveTab('transferts')}
             >
                 <div className="flex flex-col items-center gap-3 py-2">
                     <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                         <ArrowRightLeft size={24} />
                     </div>
                     <span className="text-sm font-medium text-slate-300 group-hover:text-white">Transferts</span>
                 </div>
             </Card>

             <Card 
                variant="default" 
                padding="sm" 
                className="cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
                onClick={() => setActiveTab('etats')}
             >
                 <div className="flex flex-col items-center gap-3 py-2">
                     <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
                         <FileText size={24} />
                     </div>
                     <span className="text-sm font-medium text-slate-300 group-hover:text-white">États</span>
                 </div>
             </Card>
          </div>
      </div>

      {/* Recent Transactions */}
       <Card variant="default" padding="none" className="overflow-hidden">
           <div className="p-4 border-b border-edge flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock size={16} className="text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">Transactions Récentes</h3>
                </div>
                <button onClick={() => setActiveTab('operations')} className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
                    Voir tout
                </button>
           </div>
           
           <div className="divide-y divide-edge">
              {transactions.length === 0 ? (
                  <div className="p-8 text-center bg-surface-muted/30">
                      <p className="text-xs text-slate-500">Aucune transaction aujourd'hui</p>
                  </div>
              ) : (
                  transactions.slice(0, 5).map((tx) => (
                      <div key={tx.id} onClick={() => setActiveTab('operations')} className="p-3 sm:p-4 flex items-center justify-between hover:bg-surface-elevated transition-colors cursor-pointer group">
                          <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${['Dépôt', 'Encaissement'].includes(tx.type_operation) ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                  {['Dépôt', 'Encaissement'].includes(tx.type_operation) ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                              </div>
                              <div>
                                  <p className="text-sm font-medium text-white group-hover:text-cyan-400 transition-colors line-clamp-1">{tx.description || tx.type_operation}</p>
                                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                      <span>{new Date(tx.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                      <span>•</span>
                                      <span>{tx.mode_paiement}</span>
                                  </div>
                              </div>
                          </div>
                          <span className={`text-sm font-bold whitespace-nowrap ${['Dépôt', 'Encaissement'].includes(tx.type_operation) ? 'text-emerald-400' : 'text-red-400'}`}>
                              {['Dépôt', 'Encaissement'].includes(tx.type_operation) ? '+' : '-'}{formattedMoney(tx.montant)}
                          </span>
                      </div>
                  ))
              )}
           </div>
       </Card>

    </div>
  );

  const formattedMoney = (amount: number) => {
      return new Intl.NumberFormat('fr-FR').format(amount);
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'operations':
        return currentSession ? <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><CaisseOperations sessionId={currentSession.id} onBack={() => setActiveTab('dashboard')} /></div> : null;
      case 'especes':
        return currentSession ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                 <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('dashboard')} icon={ArrowRightLeft} className="rounded-full w-8 h-8 p-0 flex items-center justify-center transform rotate-180" />
                    <h2 className="text-lg font-bold text-white">Espèces</h2>
                 </div>
                 <CaisseEspeces sessionId={currentSession.id} onTransactionComplete={() => { loadSessionActive(); loadTransactionsJour(); }} />
            </div>
        ) : null;
      case 'mobilemoney':
        return currentSession ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                 <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('dashboard')} icon={ArrowRightLeft} className="rounded-full w-8 h-8 p-0 flex items-center justify-center transform rotate-180" />
                    <h2 className="text-lg font-bold text-white">Mobile Money</h2>
                 </div>
                 <CaisseMobileMoney sessionId={currentSession.id} onTransactionComplete={() => { loadSessionActive(); loadTransactionsJour(); loadCaissesSeparees(); }} />
            </div>
        ) : null;
      case 'infos-client':
        return (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><CaisseClientInfos /></div>
        );
      case 'rapprochement':
        return currentSession ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><CaisseRapprochement session={currentSession} onClose={() => { setActiveTab('dashboard'); loadSessionActive(); loadTransactionsJour(); }} /></div>
        ) : null;
      case 'transferts':
        return <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><CaisseTransferts session={currentSession} soldeActuel={soldeActuel} onBack={() => setActiveTab('dashboard')} /></div>;
      case 'etats':
        return <CaisseEtats onBack={() => setActiveTab('dashboard')} />;

      case 'supervision':
        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                 <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('dashboard')} icon={ArrowRightLeft} className="rounded-full w-8 h-8 p-0 flex items-center justify-center transform rotate-180" />
                    <h2 className="text-lg font-bold text-white">Supervision</h2>
                 </div>
                 <CaisseSupervision 
                    onTakeControl={(session) => {
                      setSupervisedSession(session);
                      setActiveTab('dashboard');
                      // We might need to refresh transactions for this specific user/session
                      // but for now, let's keep it simple
                    }} 
                 />
            </div>
        );
      default:
        return <DashboardView />;
    }
  };



  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-cyan-500/30">
        
      <div className="w-full min-h-screen flex flex-col p-4 md:p-6">
        {/* App Header */}
        <div className="flex items-center justify-between mb-4 pt-2">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/20 flex items-center justify-center text-white">
                    <Wallet size={20} strokeWidth={2.5} />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-white leading-none mb-0.5">Caisse</h1>
                        {currentSession?.caisse_nom && (
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold uppercase tracking-wider border border-cyan-500/20">
                                {currentSession.caisse_nom}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Gestion Financière</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                 {supervisedSession && (
                   <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setSupervisedSession(null)} 
                      className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                   >
                     Quitter Supervision
                   </Button>
                 )}

                 {canCreatePayments && (
                   <button 
                      onClick={() => currentSession ? setShowPaiement(true) : alert('Caisse fermée')}
                      disabled={!currentSession}
                      className="w-9 h-9 rounded-full bg-[#1e293b] border border-[#334155] text-cyan-400 hover:bg-[#334155] hover:text-white flex items-center justify-center transition-all"
                   >
                       <CreditCard size={18} />
                   </button>
                )}
                 {!currentSession ? (
                    canOpenCaisse && (
                      <Button variant="success" size="sm" icon={Unlock} onClick={() => setShowOuverture(true)} className="rounded-full shadow-lg shadow-emerald-500/20">
                          Ouvrir
                      </Button>
                    )
                 ) : (
                    canCloseCaisse && (
                      <Button variant="danger" size="sm" onClick={handleFermetureCaisse} className="rounded-full shadow-lg shadow-red-500/20">
                          <Lock size={14} className="mr-1.5" />
                          Fermer
                      </Button>
                    )
                 )}
            </div>
        </div>

        {supervisedSession && (
          <div className="px-4 py-2 bg-amber-500/10 border-y border-amber-500/20 flex items-center justify-between -mx-4 md:-mx-6 mb-4 animate-in slide-in-from-top duration-500">
             <div className="flex items-center gap-2 text-amber-500">
                <Shield size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">Mode Supervision Active</span>
                <span className="text-xs opacity-80">|</span>
                <span className="text-xs font-medium">Caisse : <strong>{supervisedSession.caisse_nom}</strong></span>
                <span className="text-xs opacity-80">|</span>
                <span className="text-xs font-medium">Session de : <strong>{supervisedSession.caissier_nom}</strong></span>
             </div>
             <div className="text-[10px] text-amber-200/50 italic hidden sm:block">
               Toutes les opérations effectuées seront enregistrées au nom de ce caissier
             </div>
          </div>
        )}

        {/* Tab Navigation (Sticky) */}
        <div className="bg-[#020617]/90 backdrop-blur-xl -mx-4 px-4 py-2 mb-2 border-b border-[#1e293b]/50 sticky top-0 z-20">
          <TabGroup
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={tabs}
            variant="pills"
            size="sm"
            scrollable
            className="pb-1"
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 pb-16">
             {renderContent()}
        </div>
      </div>

       {showOuverture && (
        <CaisseOuverture
          onClose={() => setShowOuverture(false)}
          onSuccess={handleOuvertureCaisse}
        />
      )}

      {showPaiement && currentSession && (
        <CaissePaiementModal
          onClose={() => {
            setShowPaiement(false);
            onPaiementModalClose?.();
          }}
          sessionId={currentSession.id}
          onSuccess={() => {
            loadTransactionsJour();
            loadSessionActive();
          }}
        />
      )}
    </div>
  );
}

