import React, { useState } from 'react';
import { CheckCircle, XCircle, Search, Clock, DollarSign, User, AlertCircle, RefreshCw, MapPin, Smartphone, CreditCard, Hash, Calendar, Building2 } from 'lucide-react';
import { Button, Modal, FormField, ResponsiveTable, Badge, Card } from '../ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { useUserProfile } from '../../hooks/useUserProfile';
import { isAdminRole } from '@shared/types/roles';
import { requestAllPages } from '../../lib/api-client';

interface PaiementTerrain {
  id: string;
  agentId: string;
  clientId: string;
  montant: string;
  createdAt: string;
  statut: string;
  typePaiement: string;
  methodePaiement: string;
  reference: string;
  referenceExterne?: string;
  agents_terrain?: { nom: string; prenom: string };
  clients?: { nom: string; prenom: string; telephone: string; photoProfile?: string };
  observations?: string;
  validationOTP?: string;
  latitude?: string;
  longitude?: string;
}

interface Agence {
  id: string;
  nom: string;
  ville?: string;
}

export default function AdminValidationTerrain() {
  const { user } = useUserProfile();
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [selectedAgenceId, setSelectedAgenceId] = useState<string | null>(null);
  const itemsPerPage = 10;
  
  // Reject Modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaiementTerrain | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Detail Modal
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailPayment, setDetailPayment] = useState<PaiementTerrain | null>(null);

  const handleRowClick = (payment: PaiementTerrain) => {
    setDetailPayment(payment);
    setShowDetailModal(true);
  };

  // Check if user is admin (supports multiple role variants)
  const isAdmin = isAdminRole(user?.role);

  // Fetch agences for selector (admins only)
  const { data: agences = [] } = useQuery<Agence[]>({
    queryKey: ['/api/agences'],
    queryFn: async () => {
      const response = await fetch('/api/agences');
      if (!response.ok) throw new Error('Failed to fetch agences');
      return response.json();
    },
    enabled: isAdmin,
  });

  // Data Fetching with React Query - now includes agenceId in query
  const { data: paymentsResponse, isLoading, isRefetching } = useQuery({
    queryKey: ['/api/paiements-terrain', { agenceId: selectedAgenceId, page, search: searchTerm }],
    queryFn: async () => {
      if (searchTerm.trim()) {
        const allPayments = await requestAllPages<PaiementTerrain>('/paiements-terrain', selectedAgenceId ? { agenceId: selectedAgenceId } : undefined);
        return {
          success: true,
          data: allPayments,
          meta: {
            pagination: {
              page: 1,
              per_page: itemsPerPage,
              total_items: allPayments.length,
              total_pages: Math.max(1, Math.ceil(allPayments.length / itemsPerPage)),
            },
            filters: { agenceId: selectedAgenceId || undefined },
          },
          links: { self: '', next: null, prev: null },
        };
      }

      const params = new URLSearchParams();
      if (selectedAgenceId) params.append('agenceId', selectedAgenceId);
      params.append('page', String(page));
      params.append('per_page', String(itemsPerPage));
      const url = `/api/paiements-terrain?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch payments');
      return response.json();
    },
    staleTime: 60000, // 1 minute (invalidated by WS anyway)
  });

  const handleValidate = async (id: string) => {
    setProcessingId(id);
    try {
      const response = await fetch(`/api/paiements-terrain/${id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        toast.success("Paiement validé avec succès");
        // Optimistic update or wait for invalidation
        queryClient.invalidateQueries({ queryKey: ['/api/paiements-terrain'] });
      } else {
        const err = await response.json();
        toast.error(`Erreur: ${err.error || 'Erreur inconnue'}`);
      }
    } catch (error: any) {
      console.error("Validation error:", error);
      toast.error("Erreur lors de la validation");
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (payment: PaiementTerrain) => {
    setSelectedPayment(payment);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!selectedPayment) return;
    setProcessingId(selectedPayment.id);
    try {
        const response = await fetch(`/api/paiements-terrain/${selectedPayment.id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: rejectReason })
        });

        if (response.ok) {
             toast.success("Paiement rejeté");
             queryClient.invalidateQueries({ queryKey: ['/api/paiements-terrain'] });
             setShowRejectModal(false);
             setSelectedPayment(null);
        } else {
             toast.error("Erreur lors du rejet");
        }
    } catch (error: any) {
        console.error("Reject error:", error);
        toast.error("Erreur lors du rejet");
    } finally {
        setProcessingId(null);
    }
  };

  const allPayments = paymentsResponse?.data || [];
  const isSearching = searchTerm.trim().length > 0;
  const filteredData = isSearching
    ? allPayments.filter((p: PaiementTerrain) => {
        const search = searchTerm.toLowerCase();
        return (
          p.reference?.toLowerCase().includes(search) ||
          p.clients?.nom?.toLowerCase().includes(search) ||
          p.clients?.prenom?.toLowerCase().includes(search) ||
          p.agents_terrain?.nom?.toLowerCase().includes(search)
        );
      })
    : allPayments;

  const totalPages = isSearching
    ? Math.max(1, Math.ceil(filteredData.length / itemsPerPage))
    : paymentsResponse?.meta?.pagination?.total_pages || 1;
  const totalItems = isSearching
    ? filteredData.length
    : paymentsResponse?.meta?.pagination?.total_items || 0;
  const paginatedData = isSearching
    ? filteredData.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    : filteredData;

  const columns = [
    { 
      key: 'montant', 
      label: 'Montant', 
      primary: true,
      format: (val: string) => (
        <span className="font-bold text-emerald-600 dark:text-emerald-400">
          {parseFloat(val).toLocaleString()} FCFA
        </span>
      ),
      icon: DollarSign 
    },
    { 
      key: 'typePaiement', 
      label: 'Type',
      badge: true
    },
    { 
      key: 'client', 
      label: 'Client',
      format: (_: any, item: PaiementTerrain) => (
        <div className="flex flex-col">
          <span className="font-medium">{item.clients ? `${item.clients.nom} ${item.clients.prenom}` : 'Inconnu'}</span>
          <span className="text-xs text-slate-500">{item.clients?.telephone || ''}</span>
        </div>
      ),
      icon: User
    },
    { 
      key: 'agent', 
      label: 'Agent',
      format: (_: any, item: PaiementTerrain) => (
        <span className="text-sm">{item.agents_terrain ? `${item.agents_terrain.nom} ${item.agents_terrain.prenom}` : 'Inconnu'}</span>
      ),
      hideOnMobile: true
    },
    { 
      key: 'createdAt', 
      label: 'Date', 
      format: (date: string) => (
        <div className="flex flex-col text-xs">
          <span className="font-medium">{format(new Date(date), 'dd MMM yyyy', { locale: fr })}</span>
          <span className="text-slate-500">{format(new Date(date), 'HH:mm', { locale: fr })}</span>
        </div>
      ),
      icon: Clock,
      hideOnMobile: true
    },
    {
       key: 'observations',
       label: 'Details',
       format: (obs: string | undefined, item: PaiementTerrain) => {
           if (!obs && !item.validationOTP) return null;
           return (
             <div className="max-w-[150px] truncate text-xs text-slate-500 italic">
               {item.validationOTP === 'REQUIRED' && <span className="text-amber-500 mr-1">[OTP manquant]</span>}
               {obs}
             </div>
           )
       },
       hideOnMobile: true
    }
  ];

  return (
    <div className="space-y-6">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         <div>
           <div className="flex items-center gap-2">
             <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Validations Terrain</h2>
             <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-xs font-medium border border-amber-500/20">
               {totalItems} en attente
             </span>
           </div>
           <p className="text-slate-500 text-sm">Valider les transactions collectées par les agents en temps réel</p>
         </div>
         <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
             {/* Agency Selector (Admin only) */}
             {isAdmin && (
               <div className="relative">
                 <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                 <select
                   value={selectedAgenceId || 'all'}
                   onChange={(e) => {
                     setSelectedAgenceId(e.target.value === 'all' ? null : e.target.value);
                     setPage(1); // Reset to page 1 on agency change
                   }}
                   className="pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none transition-all appearance-none cursor-pointer"
                 >
                   <option value="all">Toutes les agences</option>
                   {agences.map((agence) => (
                     <option key={agence.id} value={agence.id}>
                       {agence.nom}
                     </option>
                   ))}
                 </select>
               </div>
             )}
             <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Rechercher un paiement..." 
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setSearchTerm(e.target.value);
                    setPage(1); // Reset to page 1 on search
                  }}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                />
             </div>
             <Button 
                variant="ghost" 
                size="sm"
                icon={RefreshCw} 
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/paiements-terrain'] })} 
                className={isRefetching ? "animate-spin" : ""}
                title="Actualiser"
             />
         </div>
       </div>

       <Card padding="none" className="overflow-hidden">
         <ResponsiveTable
            data={paginatedData}
            columns={columns}
            loading={isLoading}
            emptyMessage="Aucune transaction en attente de validation"
            pagination={{
              page,
              totalPages,
              onPageChange: setPage
            }}
            actions={(item) => (
              <div className="flex items-center gap-2 justify-end">
                  <Button 
                      variant="danger" 
                      size="xs" 
                      onClick={(e) => {
                        e.stopPropagation();
                        openRejectModal(item);
                      }}
                      disabled={!!processingId}
                  >
                      Rejeter
                  </Button>
                  <Button 
                      variant="success" 
                      size="xs" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleValidate(item.id);
                      }}
                      isLoading={processingId === item.id}
                      disabled={!!processingId}
                  >
                      Valider
                  </Button>
              </div>
            )}
            onRowClick={handleRowClick}
         />
       </Card>

       {/* Detail Modal */}
       <Modal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title="Détails de la transaction"
          size="lg"
          footer={
             <div className="flex justify-end gap-2">
                 <Button variant="ghost" onClick={() => setShowDetailModal(false)}>Fermer</Button>
                 {detailPayment && (
                     <>
                        <Button 
                           variant="danger" 
                           onClick={() => {
                               setShowDetailModal(false);
                               openRejectModal(detailPayment);
                           }}
                        >
                            Rejeter
                        </Button>
                        <Button 
                           variant="success" 
                           onClick={() => {
                               setShowDetailModal(false);
                               handleValidate(detailPayment.id);
                           }}
                        >
                            Valider
                        </Button>
                     </>
                 )}
             </div>
          }
       >
          {detailPayment && (
              <div className="space-y-6">
                  {/* Header Amount */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col items-center justify-center text-center">
                      <span className="text-slate-500 text-sm font-medium mb-1">Montant Transaction</span>
                      <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
                          {parseFloat(detailPayment.montant).toLocaleString()} <span className="text-xl text-emerald-600/60">FCFA</span>
                      </div>
                      <Badge value={detailPayment.statut} className="mt-3" />
                  </div>

                  {/* Grid Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Client Info */}
                      <div className="space-y-4">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-2">
                              <User size={18} className="text-primary" />
                              Information Client
                          </h4>
                          <div className="space-y-3 pl-2">
                              <div>
                                  <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Client</label>
                                  <p className="font-medium text-slate-800 dark:text-slate-200">
                                      {detailPayment.clients ? `${detailPayment.clients.nom} ${detailPayment.clients.prenom}` : 'Non spécifié'}
                                  </p>
                              </div>
                              <div>
                                  <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Téléphone</label>
                                  <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                      <Smartphone size={14} />
                                      {detailPayment.clients?.telephone || 'N/A'}
                                  </p>
                              </div>
                          </div>
                      </div>

                      {/* Transaction Info */}
                      <div className="space-y-4">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-2">
                              <CreditCard size={18} className="text-primary" />
                              Détails Transaction
                          </h4>
                          <div className="space-y-3 pl-2">
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Type</label>
                                      <p className="font-medium text-slate-800 dark:text-slate-200">{detailPayment.typePaiement}</p>
                                  </div>
                                  <div>
                                      <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Mode</label>
                                      <p className="font-medium text-slate-800 dark:text-slate-200">{detailPayment.methodePaiement}</p>
                                  </div>
                              </div>
                              <div>
                                  <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Référence</label>
                                  <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded w-fit text-sm">
                                      <Hash size={12} />
                                      {detailPayment.reference}
                                  </p>
                              </div>
                              <div>
                                  <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Date & Heure</label>
                                  <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                      <Calendar size={14} />
                                      {format(new Date(detailPayment.createdAt), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                                  </p>
                              </div>
                          </div>
                      </div>

                      {/* Agent & Location */}
                      <div className="space-y-4">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-2">
                              <MapPin size={18} className="text-primary" />
                              Origine & Agent
                          </h4>
                          <div className="space-y-3 pl-2">
                              <div>
                                  <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Agent Collecteur</label>
                                  <p className="font-medium text-slate-800 dark:text-slate-200">
                                      {detailPayment.agents_terrain ? `${detailPayment.agents_terrain.nom} ${detailPayment.agents_terrain.prenom}` : 'Non spécifié'}
                                  </p>
                              </div>
                              {detailPayment.latitude && detailPayment.longitude && (
                                  <div>
                                      <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Localisation GPS</label>
                                      <a 
                                        href={`https://www.google.com/maps?q=${detailPayment.latitude},${detailPayment.longitude}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-primary hover:underline mt-1"
                                      >
                                          <MapPin size={14} />
                                          Voir sur la carte
                                      </a>
                                  </div>
                              )}
                          </div>
                      </div>

                      {/* Observations / Validation Info */}
                      <div className="space-y-4">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-2">
                              <AlertCircle size={18} className="text-primary" />
                              Métadonnées
                          </h4>
                          <div className="space-y-3 pl-2">
                              {detailPayment.validationOTP === 'REQUIRED' && (
                                  <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 p-2 rounded text-sm flex items-start gap-2">
                                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                      Validation OTP requise pour cette transaction
                                  </div>
                              )}
                              <div>
                                  <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Observations</label>
                                  <p className="text-slate-600 dark:text-slate-300 italic text-sm">
                                      {detailPayment.observations || "Aucune observation"}
                                  </p>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          )}
       </Modal>

       {/* Reject Modal */}
       <Modal 
           isOpen={showRejectModal} 
           onClose={() => setShowRejectModal(false)}
           title="Rejeter le paiement"
           footer={
               <div className="flex justify-end gap-2">
                   <Button variant="ghost" onClick={() => setShowRejectModal(false)}>Annuler</Button>
                   <Button variant="danger" onClick={handleReject} isLoading={!!processingId}>Confirmer Rejet</Button>
               </div>
           }
       >
           <div className="space-y-4">
               <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg flex items-start gap-3">
                   <AlertCircle className="text-amber-500 shrink-0 mt-0.5" />
                   <div>
                       <h4 className="font-bold text-amber-500 text-sm">Attention</h4>
                       <p className="text-amber-600/80 text-sm mt-1">
                           Cette action est irréversible. Le paiement sera marqué comme "Annulé".
                       </p>
                   </div>
               </div>
               <FormField 
                   label="Motif du rejet" 
                   name="reason" 
                   value={rejectReason}
                   onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectReason(e.target.value)}
                   placeholder="Raison du rejet (ex: Montant incorrect)..."
                   autoFocus
               />
           </div>
       </Modal>
    </div>
  );
}
