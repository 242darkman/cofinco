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
import { formatClientName, resolveStorageUrl } from '@/lib/format';
import { clientSearchApi, compteEpargneApi } from '@/lib/api-client';
import CaisseOperationModal from './CaisseOperationModal';
import type { OperationType } from './hooks/useCaisseOperation';

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
  photoUrl?: string;
  documents?: Array<{ status?: string; [key: string]: any }>;
  segment?: string;
  agenceNom?: string;
  soldeEpargne?: number;
  epargneTotal?: number;
  securityLimits?: SecurityLimits;
  creditTotal?: number;
  pointsFidelite?: number;
}

export default function CaisseClientInfos() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showEditLimitsModal, setShowEditLimitsModal] = useState(false);
  const [editLimits, setEditLimits] = useState({ daily: 0, weekly: 0, monthly: 0 });
  
  // Operation modal state
  const [operationModalOpen, setOperationModalOpen] = useState(false);
  const [operationModalType, setOperationModalType] = useState<OperationType>('DEPOT');
  
  const canEditLimits = hasPermission('clients', 'edit') || hasPermission('caisse', 'manage');

  // Fetch Full Client Details (avec refresh périodique pour KYC temps réel)
  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ['clients', selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;
      const res = await fetch(`/api/clients/${selectedClientId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Client introuvable');
      return res.json();
    },
    enabled: !!selectedClientId,
    refetchInterval: 15000, // Rafraîchir toutes les 15s pour KYC et données client
  });

  // Fetch client accounts for balance breakdown
  const { data: clientAccounts = [] } = useQuery({
    queryKey: ['comptes', 'client', selectedClientId],
    queryFn: () => compteEpargneApi.getByClient(selectedClientId!),
    enabled: !!selectedClientId,
    refetchInterval: 30000,
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

  const computeKycStatus = (documents?: Array<{ status?: string }>) => {
    if (!documents || documents.length === 0) return 'en_attente';
    const rejected = documents.some(d => d.status?.toLowerCase() === 'rejected');
    if (rejected) return 'rejet';
    const pending = documents.some(d => d.status?.toLowerCase() === 'pending');
    if (pending) return 'incomplet';
    return 'verifie';
  };

  const getKycBadge = (status: string = 'en_attente') => {
    const s = status.toLowerCase();
    if (s === 'verifie' || s === 'validé') return <Badge variant="success" icon={<CheckCircle size={14} />} value="KYC Vérifié" />;
    if (s === 'incomplet') return <Badge variant="warning" icon={<AlertTriangle size={14} />} value="KYC Incomplet" />;
    if (s === 'rejet' || s === 'rejeté') return <Badge variant="danger" icon={<Shield size={14} />} value="KYC Rejeté" />;
    return <Badge variant="neutral" icon={<History size={14} />} value="En attente" />;
  };

  const openOperationModal = (type: OperationType) => {
    setOperationModalType(type);
    setOperationModalOpen(true);
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

  const limits = client?.securityLimits;

  // Calculer le solde total et la répartition par type de compte
  const accountBreakdown = clientAccounts.reduce((acc: Record<string, number>, compte: any) => {
    const type = compte.typeCompte || 'Autre';
    const solde = Number(compte.soldeCourant || 0);
    acc[type] = (acc[type] || 0) + solde;
    return acc;
  }, {} as Record<string, number>);

  const balance = clientAccounts.length > 0
    ? clientAccounts.reduce((sum: number, c: any) => sum + Number(c.soldeCourant || 0), 0)
    : (client ? Number(client.epargneTotal || 0) : 0);
  
  // Risk Level Simulation (Mock)
  const getRiskLevel = (status: string) => {
      const s = (status || '').toLowerCase();
      if (s === 'verifie' || s === 'validé') return { label: 'Faible', color: 'bg-status-success', text: 'text-status-success', border: 'border-status-success/30', bgBadge: 'bg-status-success-bg' };
      if (s === 'incomplet') return { label: 'Moyen', color: 'bg-status-warning', text: 'text-status-warning', border: 'border-status-warning/30', bgBadge: 'bg-status-warning-bg' };
      return { label: 'Haut', color: 'bg-status-danger', text: 'text-status-danger', border: 'border-status-danger/30', bgBadge: 'bg-status-danger/10' };
  };

  const kycStatus = client ? computeKycStatus(client.documents) : 'en_attente';
  const risk = client ? getRiskLevel(kycStatus) : null;

  return (
    <div className="flex flex-col h-full font-sans selection:bg-status-success/30 p-2">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
        
        {/* LEFT COL: Search, Profile & Limits (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-3 h-full overflow-hidden">
            {/* 1. Search Section */}
            <Card className="bg-surface-base/80 backdrop-blur-xl border border-edge p-3 shrink-0">
                <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-status-success-bg">
                        <Search className="w-4 h-4 text-status-success" aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold text-sm text-content-secondary">Recherche Client</h3>
                </div>
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-3 w-3 text-content-muted" />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Nom, compte ou téléphone..." 
                        className="block w-full pl-9 pr-12 py-2 bg-surface-base/50 border border-edge rounded-lg text-sm text-content-primary focus:outline-none focus:border-status-success transition-all font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
                    />
                     <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                        <span className="text-[9px] text-content-muted bg-surface px-1 py-0.5 rounded border border-edge">RET</span>
                    </div>
                </div>
            </Card>

            {/* 2. Client Profile Card */}
             <div className="flex-1 min-h-0 overflow-y-auto space-y-3 custom-scrollbar">
                {client ? (
                    <>
                        <Card className="bg-surface-base/80 border border-edge p-4 relative overflow-hidden group">
                             {/* Risk Strip */}
                             <div className={`absolute top-0 left-0 w-1 h-full ${risk?.color}`} />
                             
                             <div className="flex items-start gap-4 mb-4">
                                <div className="relative">
                                    <div className="w-14 h-14 rounded-full bg-surface border border-edge overflow-hidden">
                                        {(client.photoProfile || client.photoUrl) ? (
                                            <img src={resolveStorageUrl(client.photoProfile || client.photoUrl)} alt="Client" className="w-full h-full object-cover" />
                                        ) : (
                                            <User className="w-full h-full p-3 text-content-muted" />
                                        )}
                                    </div>
                                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-edge ${risk?.color}`} />
                                </div>
                                <div className="flex-1 min-w-0 pt-1">
                                    <h2 className="text-base font-bold text-content-primary truncate leading-tight mb-1">
                                        {formatClientName(client.nom, client.prenom)}
                                    </h2>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {client.segment && (
                                            <Badge variant="neutral" className="text-[10px] h-5 bg-surface border-edge" value={client.segment} />
                                        )}
                                        {client.agenceNom && (
                                            <Badge variant="neutral" className="text-[10px] h-5 bg-surface border-edge" value={client.agenceNom} />
                                        )}
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${risk?.bgBadge} ${risk?.text}`}>
                                            {risk?.label}
                                        </span>
                                    </div>
                                </div>
                             </div>

                             <div className="space-y-2">
                                <button 
                                    onClick={() => copyToClipboard(client.telephone, 'Téléphone')}
                                    className="w-full flex items-center justify-between p-2 rounded-md bg-surface-base/30 border border-edge hover:border-edge transition-all group/btn"
                                >
                                    <div className="flex items-center gap-2">
                                        <Phone size={12} className="text-content-muted group-hover/btn:text-status-success" />
                                        <span className="font-mono text-xs text-content-secondary">{client.telephone}</span>
                                    </div>
                                    <Copy size={10} className="text-content-muted opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                                </button>
                                <div className="flex items-center justify-between p-2 rounded-md bg-surface-base/30 border border-edge">
                                    <div className="flex items-center gap-2">
                                        <Shield size={12} className="text-content-muted" />
                                        <span className="text-xs text-content-secondary">KYC Status</span>
                                    </div>
                                    <div className="transform scale-90 origin-right">
                                        {getKycBadge(kycStatus)}
                                    </div>
                                </div>
                             </div>
                        </Card>

                        {/* 3. Limits Card */}
                        <Card className="bg-surface-base/80 border border-edge p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-content-primary text-xs flex items-center gap-2">
                                    <Shield size={14} className="text-status-success" />
                                    Limites de Retrait
                                </h3>
                                {canEditLimits && (
                                     <button 
                                        onClick={() => {
                                            if (!limits) return;
                                            setEditLimits({
                                                daily: limits.daily.limit,
                                                weekly: limits.weekly.limit,
                                                monthly: limits.monthly.limit
                                            });
                                            setShowEditLimitsModal(true);
                                        }}
                                        className="text-[10px] text-content-muted hover:text-content-primary flex items-center gap-1 transition-colors"
                                     >
                                         <MoreHorizontal size={12} /> Modifier
                                     </button>
                                )}
                            </div>

                            {limits ? (
                                <div className="space-y-4">
                                    {/* Daily Hero */}
                                    <div>
                                        <div className="flex justify-between items-end mb-1">
                                            <span className="text-[10px] text-content-muted uppercase tracking-wider">Journalier</span>
                                            <span className="text-sm font-bold text-content-primary font-mono">
                                                {new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(limits.daily.remaining)}
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-surface rounded-full overflow-hidden mb-1">
                                             <div 
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    (limits.daily.used / limits.daily.limit) > 0.8 ? 'bg-status-danger' : 
                                                    (limits.daily.used / limits.daily.limit) > 0.5 ? 'bg-status-warning' : 'bg-status-success'
                                                }`}
                                                style={{ width: `${Math.min(1, limits.daily.used / limits.daily.limit) * 100}%` }}
                                             />
                                        </div>
                                        <div className="flex justify-between text-[8px] text-content-muted">
                                            <span>0</span>
                                            <span>{new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(limits.daily.limit)}</span>
                                        </div>
                                    </div>

                                    {/* Secondary Limits */}
                                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-edge/50">
                                        <div>
                                            <p className="text-[9px] text-content-muted mb-1">Hebdo</p>
                                            <div className="h-1 bg-surface rounded-full overflow-hidden">
                                                <div className="h-full bg-status-info/70" style={{ width: `${Math.min(1, limits.weekly.used / limits.weekly.limit) * 100}%` }} />
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-content-muted mb-1">Mensuel</p>
                                            <div className="h-1 bg-surface rounded-full overflow-hidden">
                                                <div className="h-full bg-status-info/70" style={{ width: `${Math.min(1, limits.monthly.used / limits.monthly.limit) * 100}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-content-muted italic text-center py-2">Aucune limite configurée</p>
                            )}
                        </Card>
                    </>
                ) : (
                    <div className="h-64 rounded-xl border-2 border-dashed border-edge flex flex-col items-center justify-center text-content-muted space-y-3 p-6">
                        <User size={32} className="opacity-20" />
                        <p className="text-xs text-center font-medium">Recherchez un client<br/>pour voir son profil</p>
                    </div>
                )}
             </div>
        </div>

        {/* RIGHT COL: Cockpit & Activity (8 cols) */}
        <div className="lg:col-span-8 h-full flex flex-col gap-4">
            {/* 1. Finance Cockpit Card */}
            <Card className="bg-surface-base/80 backdrop-blur-xl border border-edge p-6 relative overflow-hidden shrink-0">
                 {!client ? (
                     <div className="absolute inset-0 bg-surface-base/80 backdrop-blur-[2px] z-10 flex items-center justify-center">
                         <span className="text-content-muted text-sm border border-edge bg-surface-base px-4 py-2 rounded-full shadow-lg">En attente de client...</span>
                     </div>
                 ) : null}

                 <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-0">
                     <div>
                         <p className="text-xs font-bold text-content-muted uppercase tracking-widest mb-1 flex items-center gap-2">
                             <Wallet size={14} className="text-status-success" />
                             Solde Disponible
                         </p>
                         <h1 className="text-4xl md:text-5xl font-black text-content-primary tracking-tighter leading-none">
                            {new Intl.NumberFormat('fr-FR').format(balance)}
                            <span className="text-2xl text-content-muted font-medium ml-2">FCFA</span>
                         </h1>
                         {/* Répartition par compte */}
                         {clientAccounts.length > 0 && (
                           <div className="flex flex-wrap gap-3 mt-3">
                             {clientAccounts.map((compte: any) => {
                               const type = compte.typeCompte || 'Autre';
                               const solde = Number(compte.soldeCourant || 0);
                               const numero = compte.numeroCompte || '';
                               const label = type === 'SAVINGS' ? 'Épargne' : type === 'CURRENT' ? 'Courant' : type === 'BLOCKED' ? 'Bloqué' : type;
                               const color = type === 'SAVINGS' ? 'text-status-success bg-status-success-bg border-status-success/20'
                                            : type === 'CURRENT' ? 'text-status-info bg-status-info-bg border-status-info/20'
                                            : type === 'BLOCKED' ? 'text-status-warning bg-status-warning-bg border-status-warning/20'
                                            : 'text-content-muted bg-surface-subtle/30 border-edge-strong/20';
                               return (
                                 <div key={compte.id} className={`px-3 py-1.5 rounded-lg border text-xs ${color}`}>
                                   <span className="font-medium">{label}</span>
                                   <span className="ml-2 font-bold font-mono">{new Intl.NumberFormat('fr-FR').format(solde)}</span>
                                   {numero && <span className="ml-1 opacity-60 text-[10px]">({numero.slice(-8)})</span>}
                                 </div>
                               );
                             })}
                           </div>
                         )}
                     </div>
                     <div className="flex gap-3 w-full md:w-auto shrink-0">
                        <button
                            onClick={() => openOperationModal('DEPOT')}
                            className="flex-1 md:flex-none h-12 px-6 bg-status-success hover:bg-status-success text-white rounded-xl font-bold shadow-lg shadow-status-success/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <ArrowDownToLine size={18} /> DÉPÔT
                        </button>
                        <button
                            onClick={() => openOperationModal('RETRAIT')}
                            className="flex-1 md:flex-none h-12 px-6 bg-status-danger hover:bg-status-danger text-white rounded-xl font-bold shadow-lg shadow-status-danger/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <ArrowUpFromLine size={18} /> RETRAIT
                        </button>
                     </div>
                 </div>
            </Card>

            {/* 2. Activity Feed (Fills remaining height) */}
            <Card className="bg-surface-base/80 backdrop-blur-xl border border-edge flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="p-4 border-b border-edge bg-surface-base/30 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-content-primary text-sm flex items-center gap-2">
                        <History size={16} className="text-content-muted" />
                        Activité Récente
                    </h3>
                    <div className="flex items-center gap-2">
                         <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-status-success"></span>
                        </span>
                        <span className="text-[10px] text-content-muted font-mono uppercase">Live Feed</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-0">
                    {client && recentTransactions ? (
                        recentTransactions.length > 0 ? (
                            <div className="divide-y divide-edge/50">
                                {recentTransactions.map((t: any, i: number) => (
                                    <div key={t.id || i} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between group">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                                t.sens === 'CREDIT' || t.type === 'depot' ? 'bg-status-success-bg text-status-success' : 'bg-status-danger/10 text-status-danger'
                                            }`}>
                                                {t.sens === 'CREDIT' || t.type === 'depot' ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-content-secondary">
                                                    {t.typeTransaction || t.type || 'Opération'}
                                                </p>
                                                <p className="text-xs text-content-muted">
                                                    {new Date(t.createdAt || t.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-mono font-bold ${
                                                t.sens === 'CREDIT' || t.type === 'depot' ? 'text-status-success' : 'text-content-secondary'
                                            }`}>
                                                {t.sens === 'CREDIT' || t.type === 'depot' ? '+' : '-'}{new Intl.NumberFormat('fr-FR').format(t.montant)}
                                            </p>
                                            <p className="text-[10px] text-content-muted truncate max-w-[150px]">
                                                {t.description || '...'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-content-muted gap-2">
                                <History size={24} className="opacity-20" />
                                <p className="text-xs">Aucune activité récente</p>
                            </div>
                        )
                    ) : (
                         <div className="h-full flex flex-col items-center justify-center text-content-muted">
                             <p className="text-xs">Sélectionnez un client pour voir l'historique</p>
                         </div>
                    )}
                </div>
            </Card>
        </div>
      </div>
      {/* Operation Modal (Depot / Retrait) */}
      {client && (
        <CaisseOperationModal
          isOpen={operationModalOpen}
          onClose={() => setOperationModalOpen(false)}
          operationType={operationModalType}
          client={client}
          clientAccounts={clientAccounts}
          securityLimits={limits}
        />
      )}

      {/* Edit Limits Modal */}
      {showEditLimitsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-base rounded-xl border border-edge max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-content-primary mb-4">Modifier les Limites de Retrait</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-content-muted block mb-2">Limite Journalière (FCFA)</label>
                <input
                  type="number"
                  className="w-full px-4 py-2 bg-surface border border-edge rounded-lg text-content-primary"
                  value={editLimits.daily}
                  onChange={(e) => setEditLimits({ ...editLimits, daily: parseInt(e.target.value) || 0 })}
                  max={50000000}
                />
              </div>
              <div>
                <label className="text-sm text-content-muted block mb-2">Limite Hebdomadaire (FCFA)</label>
                <input
                  type="number"
                  className="w-full px-4 py-2 bg-surface border border-edge rounded-lg text-content-primary"
                  value={editLimits.weekly}
                  onChange={(e) => setEditLimits({ ...editLimits, weekly: parseInt(e.target.value) || 0 })}
                  max={200000000}
                />
              </div>
              <div>
                <label className="text-sm text-content-muted block mb-2">Limite Mensuelle (FCFA)</label>
                <input
                  type="number"
                  className="w-full px-4 py-2 bg-surface border border-edge rounded-lg text-content-primary"
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

}
