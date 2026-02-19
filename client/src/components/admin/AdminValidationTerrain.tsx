import React, { useState, useCallback, useMemo } from 'react';
import { CheckCircle, XCircle, Search, Clock, DollarSign, User, AlertCircle, RefreshCw, MapPin, Smartphone, CreditCard, Hash, Calendar, Building2, CheckSquare, Square, MinusSquare, Loader2, FileImage, Eye } from 'lucide-react';
import { Button, Modal, FormField, ResponsiveTable, Badge, Card, FeatureHeader, FEATURE_DESCRIPTIONS } from '../ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { useUserProfile } from '../../hooks/useUserProfile';
import { isAdminRole } from '@shared/types/roles';
import { requestAllPages } from '../../lib/api-client';
import DocumentPreviewModal from '../ui/DocumentPreviewModal';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useBulkSelection, useBulkAction } from '../../hooks/admin/useBulkSelection';

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
  agentsTerrain?: { nom: string; prenom: string };
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

  // Document Preview Modal
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ id: string; name: string; url?: string } | null>(null);

  // Confirm dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  // Bulk action state
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

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

  // Bulk selection - needs to be after query so we have items
  const payments: PaiementTerrain[] = paymentsResponse?.data || [];
  const {
    selectedIds,
    isAllSelected,
    isPartiallySelected,
    toggle: toggleSelect,
    toggleAll: toggleSelectAll,
    clearSelection,
    selectedCount,
  } = useBulkSelection<PaiementTerrain>({ items: payments });

  const handleValidate = async (id: string) => {
    setProcessingId(id);
    try {
      const response = await fetch(`/api/paiements-terrain/${id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        toast.success("Paiement validé");
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

  // Bulk validate all selected payments
  const handleBulkValidate = useCallback(() => {
    const selected = Array.from(selectedIds);
    if (selected.length === 0) return;

    openConfirm({
      title: `Valider ${selected.length} paiement(s) ?`,
      message: `Voulez-vous vraiment valider ${selected.length} paiement(s) sélectionné(s) ?`,
      variant: 'success',
      confirmText: 'Valider tout',
      onConfirm: async () => {
        setBulkProcessing(true);
        setBulkProgress({ current: 0, total: selected.length });
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < selected.length; i++) {
          try {
            const response = await fetch(`/api/paiements-terrain/${selected[i]}/validate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            if (response.ok) {
              successCount++;
            } else {
              failCount++;
            }
          } catch {
            failCount++;
          }
          setBulkProgress({ current: i + 1, total: selected.length });
        }

        setBulkProcessing(false);
        setBulkProgress(null);
        clearSelection();
        queryClient.invalidateQueries({ queryKey: ['/api/paiements-terrain'] });

        if (failCount === 0) {
          toast.success(`${successCount} paiement(s) validé(s)`);
        } else {
          toast.warning(`${successCount} validé(s), ${failCount} échoué(s)`);
        }
      },
    });
  }, [selectedIds, openConfirm, clearSelection, queryClient]);

  // Bulk reject all selected payments
  const handleBulkReject = useCallback(() => {
    const selected = Array.from(selectedIds);
    if (selected.length === 0) return;

    openConfirm({
      title: `Rejeter ${selected.length} paiement(s) ?`,
      message: `Voulez-vous vraiment rejeter ${selected.length} paiement(s) sélectionné(s) ?`,
      variant: 'danger',
      confirmText: 'Rejeter tout',
      onConfirm: async () => {
        setBulkProcessing(true);
        setBulkProgress({ current: 0, total: selected.length });
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < selected.length; i++) {
          try {
            const response = await fetch(`/api/paiements-terrain/${selected[i]}/reject`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason: 'Rejet en masse' })
            });
            if (response.ok) {
              successCount++;
            } else {
              failCount++;
            }
          } catch {
            failCount++;
          }
          setBulkProgress({ current: i + 1, total: selected.length });
        }

        setBulkProcessing(false);
        setBulkProgress(null);
        clearSelection();
        queryClient.invalidateQueries({ queryKey: ['/api/paiements-terrain'] });

        if (failCount === 0) {
          toast.success(`${successCount} paiement(s) rejeté(s)`);
        } else {
          toast.warning(`${successCount} rejeté(s), ${failCount} échoué(s)`);
        }
      },
    });
  }, [selectedIds, openConfirm, clearSelection, queryClient]);

  // Open document preview
  const handlePreviewDocument = useCallback((payment: PaiementTerrain) => {
    if (payment.clients?.photoProfile) {
      setPreviewDoc({
        id: payment.clientId,
        name: `Photo client - ${payment.clients.nom} ${payment.clients.prenom}`,
        url: payment.clients.photoProfile,
      });
      setShowDocPreview(true);
    }
  }, []);

  const allPayments = paymentsResponse?.data || [];
  const isSearching = searchTerm.trim().length > 0;
  const filteredData = isSearching
    ? allPayments.filter((p: PaiementTerrain) => {
        const search = searchTerm.toLowerCase();
        return (
          p.reference?.toLowerCase().includes(search) ||
          p.clients?.nom?.toLowerCase().includes(search) ||
          p.clients?.prenom?.toLowerCase().includes(search) ||
          p.agentsTerrain?.nom?.toLowerCase().includes(search)
        );
      })
    : allPayments;

  const totalPages = isSearching
    ? Math.max(1, Math.ceil(filteredData.length / itemsPerPage))
    : paymentsResponse?.meta?.pagination?.totalPages || 1;
  const totalItems = isSearching
    ? filteredData.length
    : paymentsResponse?.meta?.pagination?.totalItems || 0;
  const paginatedData = isSearching
    ? filteredData.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    : filteredData;

  const columns = useMemo(() => [
    {
      key: 'select',
      label: '',
      format: (_: any, item: PaiementTerrain) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSelect(item.id);
          }}
          className="p-1 text-content-muted hover:text-primary transition"
        >
          {selectedIds.has(item.id) ? (
            <CheckSquare size={18} className="text-primary" />
          ) : (
            <Square size={18} />
          )}
        </button>
      ),
      width: '40px',
    },
    {
      key: 'montant',
      label: 'Montant',
      primary: true,
      format: (val: string) => (
        <span className="font-bold text-status-success">
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
        <div className="flex items-center gap-2">
          {item.clients?.photoProfile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePreviewDocument(item);
              }}
              className="relative group"
              title="Voir la photo"
            >
              <img
                src={item.clients.photoProfile}
                alt=""
                className="w-8 h-8 rounded-full object-cover border border-edge-strong"
              />
              <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                <Eye size={12} className="text-content-primary" />
              </div>
            </button>
          )}
          <div className="flex flex-col">
            <span className="font-medium">{item.clients ? `${item.clients.nom} ${item.clients.prenom}` : 'Inconnu'}</span>
            <span className="text-xs text-content-muted">{item.clients?.telephone || ''}</span>
          </div>
        </div>
      ),
      icon: User
    },
    {
      key: 'agent',
      label: 'Agent',
      format: (_: any, item: PaiementTerrain) => (
        <span className="text-sm">{item.agentsTerrain ? `${item.agentsTerrain.nom} ${item.agentsTerrain.prenom}` : 'Inconnu'}</span>
      ),
      hideOnMobile: true
    },
    {
      key: 'createdAt',
      label: 'Date',
      format: (date: string) => (
        <div className="flex flex-col text-xs">
          <span className="font-medium">{format(new Date(date), 'dd MMM yyyy', { locale: fr })}</span>
          <span className="text-content-muted">{format(new Date(date), 'HH:mm', { locale: fr })}</span>
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
             <div className="max-w-[150px] truncate text-xs text-content-muted italic">
               {item.validationOTP === 'REQUIRED' && <span className="text-status-warning mr-1">[OTP manquant]</span>}
               {obs}
             </div>
           )
       },
       hideOnMobile: true
    }
  ], [selectedIds, paginatedData, toggleSelect, handlePreviewDocument]);

  return (
    <div className="space-y-6">
       <FeatureHeader
         featureKey="admin.validation-terrain"
         title={`${FEATURE_DESCRIPTIONS['admin.validation-terrain'].title}`}
         subtitle={`${FEATURE_DESCRIPTIONS['admin.validation-terrain'].subtitle} (${totalItems} en attente)`}
         helpText={FEATURE_DESCRIPTIONS['admin.validation-terrain'].helpText}
         actions={
           <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
             {/* Agency Selector (Admin only) */}
             {isAdmin && (
               <div className="relative">
                 <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
                 <select
                   value={selectedAgenceId || 'all'}
                   onChange={(e) => {
                     setSelectedAgenceId(e.target.value === 'all' ? null : e.target.value);
                     setPage(1); // Reset to page 1 on agency change
                   }}
                   className="pl-9 pr-4 py-2 text-sm bg-surface border border-edge rounded-lg focus:ring-2 focus:ring-primary/50 outline-none transition-all appearance-none cursor-pointer"
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
                <input 
                  type="text" 
                  placeholder="Rechercher un paiement..." 
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setSearchTerm(e.target.value);
                    setPage(1); // Reset to page 1 on search
                  }}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-edge rounded-lg focus:ring-2 focus:ring-primary/50 outline-none transition-all"
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
         }
       />

       {/* Bulk Operations Toolbar */}
       {selectedCount > 0 && (
         <div className="bg-surface/80 backdrop-blur-sm border border-edge rounded-xl p-3 flex flex-wrap items-center gap-4">
           <button
             onClick={() => toggleSelectAll()}
             className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-elevated/50 transition"
           >
             {isAllSelected ? (
               <CheckSquare size={18} className="text-primary" />
             ) : isPartiallySelected ? (
               <MinusSquare size={18} className="text-primary" />
             ) : (
               <Square size={18} className="text-content-muted" />
             )}
             <span className="text-sm text-content-secondary">
               {isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
             </span>
           </button>

           <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated/50 rounded-lg">
             <span className="text-sm font-medium text-content-primary">{selectedCount}</span>
             <span className="text-sm text-content-muted">sélectionné(s)</span>
           </div>

           {bulkProcessing && bulkProgress && (
             <div className="flex items-center gap-3 px-4 py-2 bg-accent/10 rounded-lg border border-accent/30">
               <Loader2 className="animate-spin text-accent" size={16} />
               <div className="text-sm">
                 <span className="text-content-primary font-medium">{bulkProgress.current}</span>
                 <span className="text-content-muted"> / {bulkProgress.total}</span>
               </div>
               <div className="w-24 h-2 bg-surface-elevated rounded-full overflow-hidden">
                 <div
                   className="h-full bg-accent transition-all duration-300"
                   style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                 />
               </div>
             </div>
           )}

           {!bulkProcessing && (
             <>
               <div className="flex-1" />
               <Button
                 variant="danger"
                 size="sm"
                 onClick={handleBulkReject}
                 icon={XCircle}
               >
                 Rejeter ({selectedCount})
               </Button>
               <Button
                 variant="success"
                 size="sm"
                 onClick={handleBulkValidate}
                 icon={CheckCircle}
               >
                 Valider ({selectedCount})
               </Button>
               <button
                 onClick={clearSelection}
                 className="px-3 py-1.5 text-sm text-content-muted hover:text-content-primary transition"
               >
                 Effacer
               </button>
             </>
           )}
         </div>
       )}

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
                  <div className="bg-surface-muted/50 p-6 rounded-xl border border-edge-subtle flex flex-col items-center justify-center text-center">
                      <span className="text-content-muted text-sm font-medium mb-1">Montant Transaction</span>
                      <div className="text-4xl font-bold text-status-success">
                          {parseFloat(detailPayment.montant).toLocaleString()} <span className="text-xl text-status-success/60">FCFA</span>
                      </div>
                      <Badge value={detailPayment.statut} className="mt-3" />
                  </div>

                  {/* Grid Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Client Info */}
                      <div className="space-y-4">
                          <h4 className="font-semibold text-content-primary border-b border-edge-subtle pb-2 flex items-center gap-2">
                              <User size={18} className="text-primary" />
                              Information Client
                          </h4>
                          <div className="space-y-3 pl-2">
                              <div>
                                  <label className="text-xs text-content-muted uppercase tracking-wider font-semibold">Client</label>
                                  <p className="font-medium text-content-primary">
                                      {detailPayment.clients ? `${detailPayment.clients.nom} ${detailPayment.clients.prenom}` : 'Non spécifié'}
                                  </p>
                              </div>
                              <div>
                                  <label className="text-xs text-content-muted uppercase tracking-wider font-semibold">Téléphone</label>
                                  <p className="flex items-center gap-2 text-content-muted">
                                      <Smartphone size={14} />
                                      {detailPayment.clients?.telephone || 'N/A'}
                                  </p>
                              </div>
                          </div>
                      </div>

                      {/* Transaction Info */}
                      <div className="space-y-4">
                          <h4 className="font-semibold text-content-primary border-b border-edge-subtle pb-2 flex items-center gap-2">
                              <CreditCard size={18} className="text-primary" />
                              Détails Transaction
                          </h4>
                          <div className="space-y-3 pl-2">
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="text-xs text-content-muted uppercase tracking-wider font-semibold">Type</label>
                                      <p className="font-medium text-content-primary">{detailPayment.typePaiement}</p>
                                  </div>
                                  <div>
                                      <label className="text-xs text-content-muted uppercase tracking-wider font-semibold">Mode</label>
                                      <p className="font-medium text-content-primary">{detailPayment.methodePaiement}</p>
                                  </div>
                              </div>
                              <div>
                                  <label className="text-xs text-content-muted uppercase tracking-wider font-semibold">Référence</label>
                                  <p className="flex items-center gap-2 text-content-muted bg-surface-muted px-2 py-1 rounded w-fit text-sm">
                                      <Hash size={12} />
                                      {detailPayment.reference}
                                  </p>
                              </div>
                              <div>
                                  <label className="text-xs text-content-muted uppercase tracking-wider font-semibold">Date & Heure</label>
                                  <p className="flex items-center gap-2 text-content-muted">
                                      <Calendar size={14} />
                                      {format(new Date(detailPayment.createdAt), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                                  </p>
                              </div>
                          </div>
                      </div>

                      {/* Agent & Location */}
                      <div className="space-y-4">
                          <h4 className="font-semibold text-content-primary border-b border-edge-subtle pb-2 flex items-center gap-2">
                              <MapPin size={18} className="text-primary" />
                              Origine & Agent
                          </h4>
                          <div className="space-y-3 pl-2">
                              <div>
                                  <label className="text-xs text-content-muted uppercase tracking-wider font-semibold">Agent Collecteur</label>
                                  <p className="font-medium text-content-primary">
                                      {detailPayment.agentsTerrain ? `${detailPayment.agentsTerrain.nom} ${detailPayment.agentsTerrain.prenom}` : 'Non spécifié'}
                                  </p>
                              </div>
                              {detailPayment.latitude && detailPayment.longitude && (
                                  <div>
                                      <label className="text-xs text-content-muted uppercase tracking-wider font-semibold">Localisation GPS</label>
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
                          <h4 className="font-semibold text-content-primary border-b border-edge-subtle pb-2 flex items-center gap-2">
                              <AlertCircle size={18} className="text-primary" />
                              Métadonnées
                          </h4>
                          <div className="space-y-3 pl-2">
                              {detailPayment.validationOTP === 'REQUIRED' && (
                                  <div className="bg-status-warning-bg text-status-warning p-2 rounded text-sm flex items-start gap-2">
                                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                      Validation OTP requise pour cette transaction
                                  </div>
                              )}
                              <div>
                                  <label className="text-xs text-content-muted uppercase tracking-wider font-semibold">Observations</label>
                                  <p className="text-content-muted italic text-sm">
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
               <div className="bg-status-warning-bg border border-status-warning/20 p-4 rounded-lg flex items-start gap-3">
                   <AlertCircle className="text-status-warning shrink-0 mt-0.5" />
                   <div>
                       <h4 className="font-bold text-status-warning text-sm">Attention</h4>
                       <p className="text-status-warning/80 text-sm mt-1">
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

       {/* Document Preview Modal */}
       {previewDoc && (
         <DocumentPreviewModal
           isOpen={showDocPreview}
           onClose={() => {
             setShowDocPreview(false);
             setPreviewDoc(null);
           }}
           documentId={previewDoc.id}
           documentName={previewDoc.name}
           preloadedUrl={previewDoc.url}
           preloadedMimeType="image/jpeg"
         />
       )}

       {/* Confirm Dialog for Bulk Operations */}
       <ConfirmDialog
         isOpen={confirmState.isOpen}
         onClose={closeConfirm}
         onConfirm={handleConfirm}
         title={confirmState.title || ''}
         message={confirmState.message || ''}
         variant={confirmState.variant}
         confirmText={confirmState.confirmText}
       />
    </div>
  );
}
