
import React, { useState } from 'react';
import { 
  Search, User, Users, Phone, Mail, CreditCard, Wallet, 
  History, Shield, AlertTriangle, CheckCircle, 
  ArrowUpRight, ArrowDownLeft, FileText, Printer, Loader2, Edit
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
  soldeEpargne?: number; // populated if joined/calc
  security_limits?: SecurityLimits; // keys from backend (snake_case aliases might exist but we use camelCase if possible or adapt)
  // Backend returns snake_case aliases too
  limite_retrait_journalier?: string;
  credits_en_cours?: number; // backend might not return this yet, need to check
  tontines_actives?: number;
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
  
  // Only admins and chefs can edit limits
  const canEditLimits = hasPermission('clients', 'edit') || hasPermission('caisse', 'manage');

  // Fetch Full Client Details
  const { data: client, isLoading: loadingClient, error } = useQuery({
    queryKey: ['clients', selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;
      const res = await fetch(`/api/clients/${selectedClientId}`);
      if (!res.ok) throw new Error('Client introuvable loading');
      return res.json();
    },
    enabled: !!selectedClientId
  });

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

  // Transaction mutation
  const submitTransaction = async () => {
    if (!selectedClientId || !transactionAmount) {
      toast.error('Montant requis');
      return;
    }
    
    const amount = parseFloat(transactionAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Montant invalide');
      return;
    }

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

      toast.success(`${transactionType} de ${amount.toLocaleString()} FCFA effectué avec succès`);
      queryClient.invalidateQueries({ queryKey: ['clients', selectedClientId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      
      // Reset form
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

  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!searchTerm) return;
    setSearching(true);
    try {
      const response = await clientSearchApi.search(searchTerm, { page: 1, perPage: 10 });
      const results = response.data || [];
      if (results.length > 0) {
        setSelectedClientId(results[0].id);
        setSearchTerm('');
      } else {
        toast.error("Aucun client trouvé");
        setSelectedClientId(null);
      }
    } catch (e) {
      console.error(e);
      toast.error("Erreur de recherche");
    } finally {
      setSearching(false);
    }
  };

  const getKycBadge = (status: string = 'en_attente') => {
    // Adapter selon les valeurs réelles de la BD
    const s = status.toLowerCase();
    if (s === 'verifie' || s === 'validé') return <Badge variant="success" icon={<CheckCircle size={14} />} value="KYC Vérifié" />;
    if (s === 'incomplet') return <Badge variant="warning" icon={<AlertTriangle size={14} />} value="KYC Incomplet" />;
    if (s === 'rejet' || s === 'rejeté') return <Badge variant="danger" icon={<Shield size={14} />} value="KYC Rejeté" />;
    return <Badge variant="neutral" icon={<History size={14} />} value="En attente" />;
  };

  const formatMoney = (amount: number | string | undefined) => {
    const val = Number(amount || 0);
    return new Intl.NumberFormat('fr-FR').format(val) + ' FCFA';
  };

  const limits = client?.security_limits;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto p-2">
      
      {/* Search Header */}
      <Card className="bg-slate-900 border-slate-800">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between p-4">
          <div className="flex-1 w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Rechercher par Nom, Compte ou Téléphone..." 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button onClick={handleSearch} disabled={searching || !searchTerm} className="w-full md:w-auto">
            {searching ? <Loader2 className="animate-spin" /> : 'Rechercher Client'}
          </Button>
        </div>
      </Card>

      {loadingClient && (
         <div className="flex justify-center py-20">
             <Loader2 className="animate-spin text-cyan-500" size={40} />
         </div>
      )}

      {client ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Identity Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Photo & Basic Info */}
            <Card className="col-span-1 bg-gradient-to-br from-slate-900 to-slate-950 border-slate-800 overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-blue-500" />
              <div className="p-6 flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-full bg-slate-800 border-4 border-slate-700 mb-4 flex items-center justify-center overflow-hidden shadow-xl">
                    {client.photoProfile || client.photo_url ? (
                        <img src={client.photoProfile || client.photo_url} alt="Client" className="w-full h-full object-cover" />
                    ) : (
                        <User size={40} className="text-slate-500" />
                    )}
                </div>
                <h2 className="text-xl font-bold text-white mb-1">{formatClientName(client.nom, client.prenom)}</h2>
                <p className="text-cyan-400 font-mono text-sm mb-3 text-ellipsis overflow-hidden w-full">{client.id.substring(0,8)}... (ID)</p>
                {getKycBadge(client.kycStatus || client.kyc_status)}
                
                <div className="w-full mt-6 space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-950/40 border border-slate-800/50 hover:bg-slate-950/60 transition-colors">
                    <div className="p-2 rounded-md bg-blue-500/10 text-blue-400">
                      <Phone size={16} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Téléphone</p>
                      <p className="text-sm font-medium text-slate-200 truncate font-mono">{client.telephone}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-950/40 border border-slate-800/50 hover:bg-slate-950/60 transition-colors">
                    <div className="p-2 rounded-md bg-purple-500/10 text-purple-400">
                      <Mail size={16} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email</p>
                      <p className="text-sm font-medium text-slate-200 break-all" title={client.email}>{client.email || '-'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Financial Overview (Metrics) */}
            <div className="col-span-1 md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
               {/* Solde Epargne - Placeholder as backend for 'solde_epargne' aggregation not fully implemented in GET client, using 0 if missing */}
               <Card className="bg-slate-900 border-slate-800 p-5 flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Wallet size={60} className="text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Solde Total Épargne</p>
                    <h3 className="text-2xl font-bold text-emerald-400">{formatMoney(client.epargneTotal || client.epargne_total)}</h3>
                  </div>
                  <div className="mt-4 flex gap-2">
                     <Button 
                       size="sm" 
                       variant="outline" 
                       className="flex-1 border-slate-700 hover:bg-emerald-950/30 hover:text-emerald-400 hover:border-emerald-500/30"
                       onClick={() => openTransactionModal('Dépôt')}
                     >
                        <ArrowDownLeft size={14} className="mr-2" /> Dépôt
                     </Button>
                     <Button 
                       size="sm" 
                       variant="outline" 
                       className="flex-1 border-slate-700 hover:bg-rose-950/30 hover:text-rose-400 hover:border-rose-500/30"
                       onClick={() => openTransactionModal('Retrait')}
                     >
                        <ArrowUpRight size={14} className="mr-2" /> Retrait
                     </Button>
                  </div>
               </Card>

               {/* Limites & Sécurité */}
               <Card className="bg-slate-900 border-slate-800 p-5 flex flex-col justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Sécurité & Limites (FCFA)</p>
                    
                    {limits ? (
                        <div className="space-y-4">
                            {/* Daily */}
                            <div>
                                <div className="flex justify-between items-center text-xs mb-1">
                                    <span className="text-slate-400">Journalier</span>
                                    <span className="text-white font-medium">{formatMoney(limits.daily.limit)}</span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full ${limits.daily.remaining < (limits.daily.limit * 0.2) ? 'bg-rose-500' : 'bg-cyan-500'}`}
                                        style={{ width: `${Math.min(100, (limits.daily.remaining / limits.daily.limit) * 100)}%` }}
                                    />
                                </div>
                                <div className="text-[10px] text-right mt-0.5 text-slate-500">
                                    Reste: <span className="text-cyan-400 font-bold">{formatMoney(limits.daily.remaining)}</span>
                                </div>
                            </div>

                            {/* Weekly */}
                            <div>
                                <div className="flex justify-between items-center text-xs mb-1">
                                    <span className="text-slate-400">Hebdomadaire</span>
                                    <span className="text-white font-medium">{formatMoney(limits.weekly.limit)}</span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                     <div 
                                        className="bg-blue-500 h-full rounded-full"
                                        style={{ width: `${Math.min(100, (limits.weekly.remaining / limits.weekly.limit) * 100)}%` }}
                                    />
                                </div>
                                <div className="text-[10px] text-right mt-0.5 text-slate-500">
                                    Reste: <span className="text-blue-400 font-bold">{formatMoney(limits.weekly.remaining)}</span>
                                </div>
                            </div>

                             {/* Monthly */}
                             <div>
                                <div className="flex justify-between items-center text-xs mb-1">
                                    <span className="text-slate-400">Mensuel</span>
                                    <span className="text-white font-medium">{formatMoney(limits.monthly.limit)}</span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                     <div 
                                        className="bg-purple-500 h-full rounded-full"
                                        style={{ width: `${Math.min(100, (limits.monthly.remaining / limits.monthly.limit) * 100)}%` }}
                                    />
                                </div>
                                 <div className="text-[10px] text-right mt-0.5 text-slate-500">
                                    Reste: <span className="text-purple-400 font-bold">{formatMoney(limits.monthly.remaining)}</span>
                                 </div>
                             </div>
                        </div>
                     ) : (
                         <div className="text-xs text-slate-500 text-center py-4">Aucune limite définie</div>
                     )}
                   </div>
                   {canEditLimits && limits && (
                     <Button 
                       size="sm" 
                       variant="outline" 
                       fullWidth 
                       icon={Edit}
                       className="mt-4 border-slate-700 hover:bg-slate-800"
                       onClick={() => {
                         setEditLimits({
                           daily: limits.daily.limit,
                           weekly: limits.weekly.limit,
                           monthly: limits.monthly.limit
                         });
                         setShowEditLimitsModal(true);
                       }}
                     >
                       Modifier les Limites
                     </Button>
                   )}
                </Card>

               {/* Engagements */}
               <Card className="col-span-1 sm:col-span-2 bg-slate-900 border-slate-800 p-0 overflow-hidden">
                   <div className="p-4 border-b border-slate-800 bg-slate-950/30">
                       <h4 className="text-sm font-bold text-white flex items-center gap-2">
                           <FileText size={14} className="text-blue-400" /> Engagements & Score
                       </h4>
                   </div>
                   <div className="grid grid-cols-2 divide-x divide-slate-800">
                       <div className="p-4 flex items-center gap-3">
                           <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                               <CreditCard size={18} />
                           </div>
                           <div>
                               <p className="text-xs text-slate-500">Crédits Total</p>
                               <p className="text-lg font-bold text-white">{formatMoney(client.creditTotal || client.credit_total)}</p>
                           </div>
                       </div>
                       <div className="p-4 flex items-center gap-3">
                           <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                               <Users size={18} />
                           </div>
                           <div>
                               <p className="text-xs text-slate-500">Fidélité</p>
                               <p className="text-lg font-bold text-white">{client.pointsFidelite || 0} pts</p>
                           </div>
                       </div>
                   </div>
               </Card>
            </div>
          </div>

        </div>
      ) : (
        /* Empty State */
        !loadingClient && !selectedClientId && (
          <div className="text-center py-20 px-4">
              <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ring-1 ring-slate-800">
                  <User size={32} className="text-slate-600" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Aucun client sélectionné</h3>
              <p className="text-slate-500 max-w-sm mx-auto text-sm">
                  Recherchez un client ci-dessus pour afficher son dossier complet et ses limites en temps réel.
              </p>
          </div>
        )
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
                <p className="text-xs text-slate-500 mt-1">Maximum: 50 000 000 FCFA</p>
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
                <p className="text-xs text-slate-500 mt-1">Maximum: 200 000 000 FCFA</p>
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
                <p className="text-xs text-slate-500 mt-1">Maximum: 500 000 000 FCFA</p>
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

      {/* Transaction Modal */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-md w-full p-6">
            <h3 className={`text-lg font-bold mb-4 ${transactionType === 'Dépôt' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {transactionType === 'Dépôt' ? <ArrowDownLeft className="inline mr-2" size={20} /> : <ArrowUpRight className="inline mr-2" size={20} />}
              {transactionType} - {client?.nom} {client?.prenom}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 block mb-2">Montant (FCFA) *</label>
                <input
                  type="number"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-lg font-mono"
                  value={transactionAmount}
                  onChange={(e) => setTransactionAmount(e.target.value)}
                  placeholder="0"
                  min="1"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-2">Description (optionnel)</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  value={transactionDescription}
                  onChange={(e) => setTransactionDescription(e.target.value)}
                  placeholder={`${transactionType} client`}
                />
              </div>
              {transactionType === 'Retrait' && limits && (
                <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Limite journalière restante</p>
                  <p className="text-sm font-bold text-cyan-400">{formatMoney(limits.daily.remaining)}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="ghost" fullWidth onClick={() => setShowTransactionModal(false)} disabled={isSubmitting}>
                Annuler
              </Button>
              <Button 
                variant={transactionType === 'Dépôt' ? 'primary' : 'danger'} 
                fullWidth 
                onClick={submitTransaction}
                isLoading={isSubmitting}
                disabled={!transactionAmount || isSubmitting}
              >
                Confirmer {transactionType}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
