import React, { useState, useEffect } from 'react';
import { 
  Search, User, Phone, Mail, CreditCard, Wallet, 
  History, Shield, AlertTriangle, CheckCircle, 
  ArrowUpFromLine, ArrowDownToLine, Copy, Clock, MoreHorizontal
} from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/components/auth/ProtectedFeature';
import { formatClientName } from '@/lib/format';
import { clientSearchApi } from '@/lib/api-client';

interface SecurityLimits {
  daily: { limit: number, used: number, remaining: number };
  weekly: { limit: number, used: number, remaining: number };
  monthly: { limit: number, used: number, remaining: number };
}

interface Client {
  id: string;
  nom: string;
  prenom: string;
  numeroCompte: string;
  telephone: string;
  email?: string;
  photoProfile?: string;
  kycStatus: string;
  soldeEpargne?: number;
  epargneTotal?: number;
  epargne_total?: number;
  security_limits?: SecurityLimits;
  creditTotal?: number;
  credit_total?: number;
  pointsFidelite?: number;
}

export default function CaisseClientInfos() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showEditLimitsModal, setShowEditLimitsModal] = useState(false);
  const [editLimits, setEditLimits] = useState({ daily: 0, weekly: 0, monthly: 0 });
  
  // Transaction modal state
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionType, setTransactionType] = useState<'Dépôt' | 'Retrait'>('Dépôt');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionDescription, setTransactionDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const canEditLimits = hasPermission('clients', 'edit') || hasPermission('caisse', 'manage');

  // Fetch Full Client Details
  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ['clients', selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;
      const res = await fetch(`/api/clients/${selectedClientId}`);
      if (!res.ok) throw new Error('Client introuvable loading');
      return res.json();
    },
    enabled: !!selectedClientId
  });

  // Recent Transactions (Mocked or fetched if endpoint exists)
  const { data: recentTransactions } = useQuery({
    queryKey: ['transactions', selectedClientId],
    queryFn: async () => {
       if (!selectedClientId) return [];
       try {
         const res = await fetch(`/api/clients/${selectedClientId}/transactions?limit=3`);
         if (!res.ok) return [];
         return res.json();
       } catch { return []; }
    },
    enabled: !!selectedClientId
  });

  const getKycBadge = (status: string = 'en_attente') => {
    const s = status.toLowerCase();
    if (s === 'verifie' || s === 'validé') return <Badge variant="success" icon={<CheckCircle size={14} />} value="KYC Vérifié" />;
    if (s === 'incomplet') return <Badge variant="warning" icon={<AlertTriangle size={14} />} value="KYC Incomplet" />;
    if (s === 'rejet' || s === 'rejeté') return <Badge variant="danger" icon={<Shield size={14} />} value="KYC Rejeté" />;
    return <Badge variant="neutral" icon={<History size={14} />} value="En attente" />;
  };

  // Transaction mutation
  const submitTransaction = async () => {
    if (!selectedClientId || !transactionAmount) return toast.error('Montant requis');
    
    const amount = parseFloat(transactionAmount);
    if (isNaN(amount) || amount <= 0) return toast.error('Montant invalide');

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transactions-epargne', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          montant: amount,
          typeTransaction: transactionType === 'Dépôt' ? 'depot' : 'retrait',
          description: transactionDescription || `${transactionType} client`
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Erreur transaction');
      }

      toast.success(`${transactionType} effectué avec succès`);
      queryClient.invalidateQueries({ queryKey: ['clients', selectedClientId] });
      queryClient.invalidateQueries({ queryKey: ['transactions', selectedClientId] });
      
      setShowTransactionModal(false);
      setTransactionAmount('');
      setTransactionDescription('');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openTransactionModal = (type: 'Dépôt' | 'Retrait') => {
    setTransactionType(type);
    setTransactionAmount('');
    setTransactionDescription('');
    setShowTransactionModal(true);
  };

  // Update limits mutation
  const updateLimitsMutation = useMutation({
    mutationFn: async (limits: { daily: number, weekly: number, monthly: number }) => {
      const res = await fetch(`/api/clients/${selectedClientId}/limits`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limite_retrait_journalier: limits.daily,
          limite_retrait_hebdomadaire: limits.weekly,
          limite_retrait_mensuel: limits.monthly
        })
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Erreur mise à jour');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Limites mises à jour');
      queryClient.invalidateQueries({ queryKey: ['clients', selectedClientId] });
      setShowEditLimitsModal(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const executeSearch = async () => {
    if (!searchTerm) return;
    try {
      const response = await clientSearchApi.search(searchTerm, { page: 1, perPage: 1 });
      const results = response.data || [];
      if (results.length > 0) {
        setSelectedClientId(results[0].id);
        setSearchTerm('');
      } else {
        toast.error("Aucun client trouvé");
      }
    } catch (e) {
      toast.error("Erreur de recherche");
    }
  };

  const copyToClipboard = (text: string, label: string) => {
      navigator.clipboard.writeText(text);
      toast.success(`${label} copié !`);
  };

  const limits = client?.security_limits;
  const balance = client ? (client.epargneTotal || client.epargne_total || 0) : 0;
  
  // Risk Level Simulation (Mock)
  const getRiskLevel = (status: string) => {
      const s = (status || '').toLowerCase();
      if (s === 'verifie' || s === 'validé') return { label: 'Faible', color: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500/30', bgBadge: 'bg-emerald-500/10' };
      if (s === 'incomplet') return { label: 'Moyen', color: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-500/30', bgBadge: 'bg-amber-500/10' };
      return { label: 'Haut', color: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-500/30', bgBadge: 'bg-rose-500/10' };
  };

  const risk = client ? getRiskLevel(client.kycStatus) : null;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4">
      
      {/* 1. Bar de Recherche (Top) - Autocomplete Style */}
      <div className="relative group max-w-2xl mx-auto">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-6 w-6 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
        </div>
        <input 
          type="text" 
          placeholder="Rechercher un client (Nom, Compte, Téléphone)..." 
          className="block w-full pl-14 pr-4 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all shadow-lg"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
          autoFocus
        />
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
            <span className="text-xs text-slate-600 bg-slate-800 px-2 py-1 rounded border border-slate-700">ENTER</span>
        </div>
      </div>

      {client ? (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-500 space-y-6">
          
          {/* Main Cockpit Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* COL 1: Identité Client (3 cols) */}
            <Card className="lg:col-span-3 bg-slate-900 border-slate-800 h-full relative overflow-hidden flex flex-col items-center p-6 text-center">
                {/* Risk Indicator Strip */}
                <div className={`absolute top-0 w-full h-1 ${risk?.color}`} />
                
                {/* Avatar with Status Dot */}
                <div className="relative mb-4">
                    <div className="w-28 h-28 rounded-full bg-slate-800 border-4 border-slate-800 shadow-2xl overflow-hidden">
                        {client.photoProfile || client.photo_url ? (
                            <img src={client.photoProfile || client.photo_url} alt="Client" className="w-full h-full object-cover" />
                        ) : (
                            <User className="w-full h-full p-6 text-slate-600" />
                        )}
                    </div>
                    {/* Status Dot */}
                    <div className={`absolute bottom-1 right-1 w-6 h-6 rounded-full border-4 border-slate-900 ${risk?.color}`}></div>
                </div>

                <h2 className="text-2xl font-bold text-white mb-1">{formatClientName(client.nom, client.prenom)}</h2>
                
                {/* Risk Badge */}
                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-6 ${risk?.bgBadge} ${risk?.text} border ${risk?.border}`}>
                    Risque {risk?.label}
                </div>

                {/* ID & Contact Copyable */}
                <div className="w-full space-y-3">
                    <button 
                        onClick={() => copyToClipboard(client.telephone, 'Téléphone')}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 hover:bg-slate-950 transition-all group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-slate-900 text-slate-400 group-hover:text-cyan-400 transition-colors">
                                <Phone size={16} />
                            </div>
                            <span className="font-mono text-slate-300 group-hover:text-white transition-colors">{client.telephone}</span>
                        </div>
                        <Copy size={14} className="text-slate-600 group-hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-all" />
                    </button>

                    <button 
                        onClick={() => copyToClipboard(client.id, 'ID Client')}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 hover:bg-slate-950 transition-all group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-slate-900 text-slate-400 group-hover:text-cyan-400 transition-colors">
                                <Shield size={16} />
                            </div>
                            <span className="font-mono text-slate-300 text-xs truncate group-hover:text-white transition-colors max-w-[120px]">{client.id}</span>
                        </div>
                        <Copy size={14} className="text-slate-600 group-hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-all" />
                    </button>
                    
                    {getKycBadge(client.kycStatus || client.kyc_status)}
                </div>
            </Card>


            {/* COL 2: Transaction Central (6 cols) */}
            <Card className="lg:col-span-6 bg-slate-800/50 border-slate-700/50 h-full p-8 flex flex-col justify-between relative shadow-2xl">
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                    <Wallet size={120} />
                </div>

                <div className="space-y-2 mb-10">
                    <p className="text-slate-400 font-medium uppercase tracking-widest text-sm">Solde Disponible</p>
                    <h1 className="text-5xl md:text-6xl font-black text-white tracking-tight leading-none">
                        {new Intl.NumberFormat('fr-FR').format(balance)} <span className="text-2xl text-slate-500 font-normal">FCFA</span>
                    </h1>
                </div>

                <div className="space-y-4">
                     {/* Action Buttons Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => openTransactionModal('Dépôt')}
                            className="h-20 flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xl font-bold transition-all shadow-lg hover:shadow-emerald-500/20 group"
                        >
                            <div className="bg-white/20 p-2 rounded-lg group-hover:scale-110 transition-transform">
                                <ArrowDownToLine size={24} />
                            </div>
                            DÉPÔT
                        </button>
                        <button
                            onClick={() => openTransactionModal('Retrait')}
                            className="h-20 flex items-center justify-center gap-3 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-xl text-xl font-bold transition-all shadow-lg hover:shadow-rose-500/20 group"
                        >
                            <div className="bg-white/20 p-2 rounded-lg group-hover:scale-110 transition-transform">
                                <ArrowUpFromLine size={24} />
                            </div>
                            RETRAIT
                        </button>
                    </div>
                    
                    <button className="w-full py-2 text-slate-400 hover:text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-800 rounded-lg transition-colors">
                        <History size={14} /> Voir l'historique complet des transactions
                    </button>
                </div>
            </Card>


            {/* COL 3: Conformité & Limites (3 cols) */}
            <Card className="lg:col-span-3 bg-slate-900 border-slate-800 h-full p-6 flex flex-col relative">
                <div className="flex items-center gap-2 mb-6">
                    <Shield className="text-slate-400" size={18} />
                    <h3 className="font-bold text-white">Limites de Retrait</h3>
                </div>

                {limits ? (
                    <div className="space-y-8 flex-1">
                        {/* Daily Limit - Hero */}
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Disponible Aujourd'hui</p>
                            <div className="text-3xl font-bold text-white mb-3 font-mono">
                                {new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(limits.daily.remaining)}
                            </div>
                            
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-slate-400">
                                    <span>0</span>
                                    <span>{new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(limits.daily.limit)}</span>
                                </div>
                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                     <div 
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            (limits.daily.used / limits.daily.limit) > 0.8 ? 'bg-rose-500' : 
                                            (limits.daily.used / limits.daily.limit) > 0.5 ? 'bg-amber-500' : 'bg-emerald-500'
                                        }`}
                                        style={{ width: `${(limits.daily.used / limits.daily.limit) * 100}%` }}
                                     />
                                </div>
                                <p className="text-right text-[10px] text-slate-500 mt-1">
                                    {Math.round((limits.daily.used / limits.daily.limit) * 100)}% utilisé
                                </p>
                            </div>
                        </div>

                        {/* Other Limits Compact */}
                        <div className="space-y-4 pt-4 border-t border-slate-800">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-slate-400">Hebdo</span>
                                    <span className="text-xs font-bold text-white">{new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(limits.weekly.remaining)}</span>
                                </div>
                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-blue-500 rounded-full" 
                                        style={{ width: `${(limits.weekly.used / limits.weekly.limit) * 100}%` }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-slate-400">Mensuel</span>
                                    <span className="text-xs font-bold text-white">{new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(limits.monthly.remaining)}</span>
                                </div>
                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-purple-500 rounded-full" 
                                        style={{ width: `${(limits.monthly.used / limits.monthly.limit) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                        Aucune limite configurée
                    </div>
                )}
                 {canEditLimits && limits && (
                     <Button 
                       size="sm" 
                       variant="outline" 
                       fullWidth 
                       icon={MoreHorizontal}
                       className="mt-6 border-slate-700 hover:bg-slate-800"
                       onClick={() => {
                         setEditLimits({
                           daily: limits.daily.limit,
                           weekly: limits.weekly.limit,
                           monthly: limits.monthly.limit
                         });
                         setShowEditLimitsModal(true);
                       }}
                     >
                       Modifier
                     </Button>
                   )}
            </Card>

          </div>

          {/* Flash Activity Feed (Bottom) */}
          <Card className="bg-slate-900 border-slate-800 p-0 overflow-hidden">
              <div className="px-6 py-3 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                      <Clock size={16} className="text-cyan-500" /> Activité Récente (24h)
                  </h4>
                  <Badge variant="neutral" value="Temps réel" className="animate-pulse" />
              </div>
              <div className="divide-y divide-slate-800">
                  {recentTransactions?.length ? (
                      recentTransactions.map((t: any, i: number) => (
                          <div key={t.id || i} className="px-6 py-3 flex items-center justify-between hover:bg-slate-800/50 transition-colors">
                              <div className="flex items-center gap-4">
                                  <span className="text-xs font-mono text-slate-500">
                                      {new Date(t.created_at || t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </span>
                                  <Badge 
                                    variant={t.sens === 'CREDIT' || t.type === 'depot' ? 'success' : 'danger'} 
                                    value={t.type_transaction || t.type || 'Transaction'} 
                                    size="sm" 
                                  />
                                  <span className="text-sm text-slate-300">
                                     {t.description || 'Opération caisse'}
                                  </span>
                              </div>
                              <div className="flex items-center gap-4">
                                  <span className={`font-mono font-bold ${t.sens === 'CREDIT' || t.type === 'depot' ? 'text-emerald-400' : 'text-slate-400'}`}>
                                      {t.sens === 'CREDIT' || t.type === 'depot' ? '+' : '-'}{new Intl.NumberFormat('fr-FR').format(t.montant)} FCFA
                                  </span>
                              </div>
                          </div>
                      ))
                  ) : (
                      <div className="px-6 py-4 text-center text-slate-500 text-sm italic">
                          Aucune activité récente aujourd'hui
                      </div>
                  )}
              </div>
          </Card>

        </div>
      ) : (
        /* Empty State (Centered) */
        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-600">
             <div className="w-32 h-32 bg-slate-900/50 rounded-full flex items-center justify-center mb-6 ring-4 ring-slate-800 shadow-2xl">
                 <Search size={48} className="text-slate-700" />
             </div>
             <h2 className="text-2xl font-bold text-slate-400 mb-2">Prêt pour une opération</h2>
             <p className="max-w-md text-center text-slate-500">Scannez un badge client ou recherchez par nom/compte pour activer le cockpit caisse.</p>
        </div>
      )}

      {/* Transaction Modal (Reused Logic) */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 max-w-lg w-full p-8 shadow-2xl">
            <h3 className={`text-2xl font-bold mb-6 flex items-center gap-3 ${transactionType === 'Dépôt' ? 'text-emerald-400' : 'text-rose-400'}`}>
              <span className={`p-2 rounded-lg ${transactionType === 'Dépôt' ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                  {transactionType === 'Dépôt' ? <ArrowDownToLine size={24} /> : <ArrowUpFromLine size={24} />}
              </span>
              {transactionType}
            </h3>
            
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-slate-400 block mb-2 uppercase tracking-wide">Montant (FCFA)</label>
                <input
                  type="number"
                  className="w-full px-4 py-4 bg-slate-950 border border-slate-700 rounded-xl text-white text-3xl font-mono focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                  value={transactionAmount}
                  onChange={(e) => setTransactionAmount(e.target.value)}
                  placeholder="0"
                  min="1"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400 block mb-2 uppercase tracking-wide">Note (Optionnel)</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:border-cyan-500 outline-none transition-all"
                  value={transactionDescription}
                  onChange={(e) => setTransactionDescription(e.target.value)}
                  placeholder="Motif de l'opération..."
                />
              </div>

              {transactionType === 'Retrait' && limits && (
                 <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl flex justify-between items-center">
                    <span className="text-rose-400 text-sm font-medium">Limite disponible</span>
                    <span className="text-white font-bold font-mono text-lg">{formatMoney(limits.daily.remaining)}</span>
                 </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-8">
              <button 
                onClick={() => setShowTransactionModal(false)}
                className="px-6 py-4 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition"
              >
                Annuler
              </button>
              <button 
                onClick={submitTransaction}
                disabled={isSubmitting || !transactionAmount}
                className={`px-6 py-4 rounded-xl text-white font-bold shadow-lg transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                    transactionType === 'Dépôt' 
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' 
                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20'
                }`}
              >
                {isSubmitting ? 'Traitement...' : 'CONFIRMER'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Limits Modal */}
      {showEditLimitsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-white mb-4">Modifier les Limites de Retrait</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 block mb-2">Limite Journalière (FCFA)</label>
                <input
                  type="number"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  value={editLimits.daily}
                  onChange={(e) => setEditLimits({ ...editLimits, daily: parseInt(e.target.value) || 0 })}
                  max={50000000}
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-2">Limite Hebdomadaire (FCFA)</label>
                <input
                  type="number"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  value={editLimits.weekly}
                  onChange={(e) => setEditLimits({ ...editLimits, weekly: parseInt(e.target.value) || 0 })}
                  max={200000000}
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-2">Limite Mensuelle (FCFA)</label>
                <input
                  type="number"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  value={editLimits.monthly}
                  onChange={(e) => setEditLimits({ ...editLimits, monthly: parseInt(e.target.value) || 0 })}
                  max={500000000}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="ghost" fullWidth onClick={() => setShowEditLimitsModal(false)}>
                Annuler
              </Button>
              <Button 
                variant="primary" 
                fullWidth 
                onClick={() => updateLimitsMutation.mutate(editLimits)}
                isLoading={updateLimitsMutation.isPending}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    
    </div>
  );

  function formatMoney(amount: number | string | undefined) {
    const val = Number(amount || 0);
    return new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';
  }
}
