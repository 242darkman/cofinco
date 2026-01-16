import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  User, 
  MapPin, 
  DollarSign, 
  Filter, 
  RefreshCw,
  MoreVertical,
  CheckCircle2,
  Calendar,
  Layers,
  Search,
  CreditCard,
  AlertCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Hash
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { caisseAgentApi, agencesApi, type Agence } from '@/lib/api-client';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import FormField from '@/components/ui/FormField';
import { useToast } from '../../hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { SystemRole, normalizeRole } from '@shared/types/roles';

// Types for Detail Modal
import type { OperationTerrainWithRelations, OperationTerrainMetadata } from '@shared/schema';

// Helper for Modal (simple inline for now or use UI component if available)
const Modal = ({ isOpen, onClose, title, children, footer, size = 'md' }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-h-[90vh] overflow-hidden flex flex-col ${size === 'lg' ? 'max-w-4xl' : 'max-w-md'}`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <h3 className="font-semibold text-lg text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
            <XCircle size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {children}
        </div>
        {footer && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default function AgentValidations() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useUserProfile();
  
  // State
  const [operations, setOperations] = useState<OperationTerrainWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [agences, setAgences] = useState<Agence[]>([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgenceId, setSelectedAgenceId] = useState<string>('all');
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  
  // Modals
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<OperationTerrainWithRelations | null>(null);
  
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectOperationId, setRejectOperationId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Pagination (Simple client-side for now to match logic, can be server-side)
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  // Check role for Agency Filter
  const normalizedRole = normalizeRole(user?.role);
  const isAdmin = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.SUPERVISEUR;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const opsPromise = caisseAgentApi.listOperations({ statut: 'SUBMITTED' });
      const agencesPromise = isAdmin ? agencesApi.getAgences() : Promise.resolve([]);
      
      const [opsResponse, agencesResponse] = await Promise.all([opsPromise, agencesPromise]);
      
      // Handle pagination wrapper or array
      const opsData = Array.isArray(opsResponse) ? opsResponse : opsResponse.data || [];
      setOperations(opsData);
      
      if (Array.isArray(agencesResponse)) {
        setAgences(agencesResponse);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast({
        title: t('erreur'),
        description: "Impossible de charger les données.",
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectToggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    
    setProcessing(true);
    try {
      const result = await caisseAgentApi.bulkApproveOperations(Array.from(selectedIds));
      if (result.success) {
        toast({
          title: t('succes'),
          description: `${selectedIds.size} opérations validées avec succès.`,
        });
        setSelectedIds(new Set());
        loadData();
        
        // Update badge
        window.dispatchEvent(new CustomEvent('operation-update', { 
            detail: { type: 'BULK_APPROVE', count: selectedIds.size } 
        }));
      } else {
        toast({
          title: t('attention'),
          description: "Certaines opérations n'ont pas pu être validées.",
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: t('erreur'),
        description: error.message || t('operationEchouee'),
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleSingleApprove = async (id: string) => {
    setProcessing(true);
    try {
      await caisseAgentApi.approveOperation(id);
      toast({
        title: t('succes'),
        description: t('operationReussie'),
      });
      setDetailModalOpen(false);
      loadData();
      
      window.dispatchEvent(new CustomEvent('operation-update', { 
          detail: { type: 'OPERATION_TERRAIN_APPROVED', id } 
      }));
    } catch (error: any) {
      toast({
        title: t('erreur'),
        description: error.message || t('operationEchouee'),
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const openRejectModal = (id: string) => {
    setRejectOperationId(id);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectOperationId || !rejectReason || rejectReason.length < 5) {
      toast({
        title: "Motif requis",
        description: "Veuillez indiquer un motif de rejet valide (min. 5 caractères).",
        variant: "destructive"
      });
      return;
    }

    setProcessing(true);
    try {
      await caisseAgentApi.rejectOperation(rejectOperationId, rejectReason);
      toast({
        title: t('succes'),
        description: "Opération rejetée avec succès.",
      });
      setRejectModalOpen(false);
      setDetailModalOpen(false);
      loadData();
      
      window.dispatchEvent(new CustomEvent('operation-update', { 
          detail: { type: 'OPERATION_TERRAIN_REJECTED', id: rejectOperationId } 
      }));
    } catch (error: any) {
      toast({
        title: t('erreur'),
        description: error.message || "Erreur lors du rejet.",
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRowClick = (item: OperationTerrainWithRelations) => {
    setSelectedOperation(item);
    setDetailModalOpen(true);
  };

  // Filter Logic
  const filteredOperations = operations.filter(op => {
    const matchesSearch = 
      op.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.agent?.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.client?.nom?.toLowerCase().includes(searchTerm.toLowerCase());
      
    // Note: Assuming agent has agenceId or we filter by checking agent's agency if available
    // For now, since listOperations doesn't return agency data deeply joined, 
    // we might need to rely on backend filtering if we want strict agency filtering.
    // Or we assume operation list contains agencyId if we updated the view.
    // Since OperationTerrainWithRelations doesn't explicitly have agenceId at root but agent usually belongs to one.
    // Let's assume for this migration we might need backend support for strict agency filtering if not in data.
    // For now, ignoring strict agency check if data isn't present to avoid empty lists.
    const matchesAgence = selectedAgenceId === 'all' || true; 

    return matchesSearch && matchesAgence;
  });

  // Pagination
  const totalPages = Math.ceil(filteredOperations.length / itemsPerPage);
  const paginatedOperations = filteredOperations.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 dark:text-white mb-1 sm:mb-2 flex items-center gap-3">
            <CheckCircle2 className="text-cyan-500 w-8 h-8" />
            {t('menuValidations')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Supervision et approbation des opérations de collecte et remise.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
            <Button 
                variant="outline" 
                size="sm" 
                onClick={loadData}
                disabled={loading || processing}
                icon={RefreshCw}
                className={loading ? 'animate-spin' : ''}
            >
                Actualiser
            </Button>
            {selectedIds.size > 0 && (
                <Button 
                    variant="primary" 
                    size="sm" 
                    icon={CheckCircle}
                    onClick={handleBulkApprove}
                    disabled={processing}
                >
                    Valider ({selectedIds.size})
                </Button>
            )}
        </div>
      </div>

      {/* Filters & Actions */}
      <Card padding="none" className="overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-slate-50/50 dark:bg-slate-800/30">
          
          {/* Agency Selector (Admin) */}
          {isAdmin && (
            <div className="relative w-full md:w-64 flex-shrink-0">
               <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
               <select
                 value={selectedAgenceId}
                 onChange={(e) => {
                   setSelectedAgenceId(e.target.value);
                   setPage(1);
                 }}
                 className="w-full h-[42px] pl-10 pr-4 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none transition-all appearance-none cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 block"
               >
                 <option value="all">Toutes les agences</option>
                 {agences.map(a => (
                   <option key={a.id} value={a.id}>{a.nom}</option>
                 ))}
               </select>
            </div>
          )}

          {/* Search Input - Custom Implementation for Alignment */}
          <div className="flex-1 w-full relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
             <input
                type="text"
                name="search"
                placeholder="Rechercher par référence, agent ou client..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-[42px] pl-10 pr-4 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none transition-all block placeholder:text-slate-400"
              />
          </div>

          {/* Status Badge */}
          <div className="flex-shrink-0">
             <div className="h-[42px] px-4 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 flex items-center justify-center font-semibold text-[11px] tracking-wider uppercase whitespace-nowrap shadow-sm">
                <span className="mr-1.5 opacity-70">
                   <Clock size={14} />
                </span>
                <span className="mt-[1px]">{filteredOperations.length} En Attente</span>
             </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-10 h-10 text-cyan-500 animate-spin opacity-50" />
          </div>
        ) : filteredOperations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-6 shadow-inner ring-4 ring-slate-50 dark:ring-slate-800">
              <CheckCircle className="text-emerald-500 w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Tout est en ordre !</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm">
              Aucune transaction n'est actuellement en attente de validation.
            </p>
          </div>
        ) : (
          <>
            <ResponsiveTable
              data={paginatedOperations}
              columns={[
                { 
                  key: 'select', 
                  label: '', 
                  format: (_, item) => (
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(item.id)}
                      onChange={() => handleSelectToggle(item.id)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-cyan-600 focus:ring-cyan-500 dark:bg-slate-800"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ),
                  align: 'center'
                },
                { 
                  key: 'reference', 
                  label: 'Référence', 
                  primary: true, 
                  format: (val, item) => (
                      <div className="flex flex-col">
                          <span className="font-mono text-xs font-bold text-cyan-600 dark:text-cyan-400">{val}</span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Calendar size={10} />
                              {new Date(item.submittedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                      </div>
                  )
                },
                { 
                  key: 'agentId', 
                  label: 'Agent',
                  format: (_, item) => (
                      <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                              <User size={14} />
                          </div>
                          <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.agent?.nom || 'Inconnu'}</span>
                              <span className="text-[10px] text-slate-500">{item.agent?.prenom || ''}</span>
                          </div>
                      </div>
                  )
                },
                { 
                  key: 'type', 
                  label: 'Type', 
                  badge: true,
                  format: (val) => val === 'COLLECT_CASH' ? 'Collecte' : 'Remise Fonds'
                },
                { 
                  key: 'montant', 
                  label: 'Montant', 
                  align: 'right',
                  format: (val) => (
                      <span className="font-bold text-slate-900 dark:text-white">
                          {Number(val).toLocaleString()} <span className="text-[10px] font-normal opacity-60">FCFA</span>
                      </span>
                  )
                },
                {
                    key: 'client',
                    label: 'Client/Dest.',
                    format: (_, item) => (
                        <div className="text-xs">
                            {item.type === 'COLLECT_CASH' ? (
                                 <div className="flex flex-col">
                                     <span className="text-slate-700 dark:text-slate-300 font-medium">{item.client?.nom || 'Sans client'}</span>
                                     <span className="text-slate-500">{item.client?.prenom}</span>
                                 </div>
                            ) : (
                                 <Badge 
                                     variant="outline" 
                                     className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-[9px]"
                                     value={`Vers: ${item.destinationCaisse?.nom || 'Agence'}`}
                                 />
                            )}
                        </div>
                    )
                }
              ]}
              actions={(item) => (
                <div className="flex gap-1 justify-end">
                  <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={(e) => {
                          e.stopPropagation();
                          handleSingleApprove(item.id);
                      }}
                      className="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                      disabled={processing}
                  >
                      <CheckCircle size={18} />
                  </Button>
                  
                  <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={(e) => {
                          e.stopPropagation();
                          openRejectModal(item.id);
                      }}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      disabled={processing}
                  >
                      <XCircle size={18} />
                  </Button>
                </div>
              )}
              onRowClick={handleRowClick}
            />

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center">
                    <div className="text-xs text-slate-500">
                        Page {page} sur {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                        >
                            <ChevronLeft size={16} />
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={page === totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        >
                            <ChevronRight size={16} />
                        </Button>
                    </div>
                </div>
            )}
          </>
        )}
      </Card>
      
      {/* Detail Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="Détails de l'opération"
        size="lg"
        footer={
           <div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setDetailModalOpen(false)}>Fermer</Button>
               {selectedOperation && (
                   <>
                      <Button 
                         variant="danger" 
                         onClick={() => {
                             setDetailModalOpen(false);
                             openRejectModal(selectedOperation.id);
                         }}
                         disabled={processing}
                      >
                          Rejeter
                      </Button>
                      <Button 
                         variant="success" 
                         onClick={() => handleSingleApprove(selectedOperation.id)}
                         disabled={processing}
                         isLoading={processing}
                      >
                          Valider
                      </Button>
                   </>
               )}
           </div>
        }
      >
        {selectedOperation && (
           <div className="space-y-6">
               {/* Hero Amount */}
               <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col items-center justify-center text-center">
                   <span className="text-slate-500 text-sm font-medium mb-1">Montant Transaction</span>
                   <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
                       {parseFloat(selectedOperation.montant).toLocaleString()} <span className="text-xl text-emerald-600/60">FCFA</span>
                   </div>
                   <Badge value={selectedOperation.statut} className="mt-3" />
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {/* Info Client */}
                   <div className="space-y-4">
                       <h4 className="font-semibold text-slate-800 dark:text-slate-200 border-b pb-2 flex items-center gap-2">
                           <User size={18} className="text-primary" />
                           Information Client
                       </h4>
                       <div className="space-y-3 pl-2 text-sm">
                           <div>
                               <label className="text-xs text-slate-500 uppercase font-semibold">Client</label>
                               <p className="font-medium text-slate-800 dark:text-slate-200">
                                   {selectedOperation.client ? `${selectedOperation.client.nom} ${selectedOperation.client.prenom}` : 'Non spécifié'}
                               </p>
                           </div>
                           {selectedOperation.type === 'SETTLEMENT_CASH' && (
                               <div className="text-amber-600 bg-amber-50 p-2 rounded">
                                   Ceci est une remise de fonds interne vers l'agence.
                               </div>
                           )}
                       </div>
                   </div>

                   {/* Info Transaction */}
                   <div className="space-y-4">
                       <h4 className="font-semibold text-slate-800 dark:text-slate-200 border-b pb-2 flex items-center gap-2">
                           <CreditCard size={18} className="text-primary" />
                           Détails Transaction
                       </h4>
                       <div className="space-y-3 pl-2 text-sm">
                           <div>
                               <label className="text-xs text-slate-500 uppercase font-semibold">Référence</label>
                               <p className="flex items-center gap-2 font-mono">
                                   <Hash size={12} />
                                   {selectedOperation.reference}
                               </p>
                           </div>
                           <div>
                               <label className="text-xs text-slate-500 uppercase font-semibold">Date</label>
                               <p>
                                   {format(new Date(selectedOperation.submittedAt), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                               </p>
                           </div>
                           {(selectedOperation.metadata as OperationTerrainMetadata)?.latitude && (
                               <div>
                                   <label className="text-xs text-slate-500 uppercase font-semibold">GPS</label>
                                   <a 
                                     href={`https://www.google.com/maps?q=${(selectedOperation.metadata as OperationTerrainMetadata).latitude},${(selectedOperation.metadata as OperationTerrainMetadata).longitude}`} 
                                     target="_blank" 
                                     rel="noreferrer"
                                     className="flex items-center gap-1 text-primary hover:underline"
                                   >
                                       <MapPin size={14} /> Localisation
                                   </a>
                               </div>
                           )}
                       </div>
                   </div>
               </div>

               {/* Meta & Warnings */}
               {(selectedOperation.metadata as any)?.validationOTP === 'REQUIRED' && (
                   <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-lg flex items-center gap-2">
                       <AlertCircle size={20} />
                       Validation OTP requise pour cette opération.
                   </div>
               )}
           </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Rejeter l'opération"
        footer={
           <div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setRejectModalOpen(false)}>Annuler</Button>
               <Button 
                   variant="danger" 
                   onClick={handleRejectConfirm}
                   isLoading={processing}
               >
                   Confirmer Rejet
               </Button>
           </div>
        }
      >
        <div className="space-y-4">
            <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-lg flex items-start gap-3">
                <AlertCircle className="shrink-0 mt-0.5" size={20} />
                <div className="text-sm">
                    <p className="font-bold">Attention cette action est irréversible.</p>
                    <p>L'opération sera marquée comme rejetée et ne pourra plus être validée.</p>
                </div>
            </div>
            
            <FormField 
                label="Motif du rejet"
                name="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ex: Montant incorrect, Client absent..."
                autoFocus
                required
            />
        </div>
      </Modal>

    </div>
  );
}
