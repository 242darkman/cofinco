import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, ArrowRight, ArrowRightLeft, Plus, CheckCircle, Clock, X, AlertTriangle, Send, Wallet, Printer } from 'lucide-react';
import { usePermissions } from '../../auth/ProtectedFeature';
import { Button, Card, Badge, Pagination, Modal, StatCard, ResponsiveTable } from '@/components/ui';
import { caisseTransfertApi, agenceApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SkeletonCard } from '../../ui/Skeleton';
import { usePrinter } from '../../../hooks/useReceiptPrinter';
import { TransferHistoryPrintTemplate, TransferHistoryData } from '../../ui/printable/TransferHistoryPrintTemplate';
import { StatutTransfertCaisse } from '@shared/enum/status-constants';

interface Transfert {
  id: string;
  reference: string;
  montant: number;
  motif: string;
  statut: string;
  dateCreation: string;
  dateReception?: string;
  dateValidation?: string;
  observations: string;
  agenceSourceId: string;
  agenceDestId: string;
  agenceSource?: { id: string; nom: string };
  agenceDest?: { id: string; nom: string };
  agenceSourceNom?: string;
  agenceDestNom?: string;
  createdByNom?: string;
  createdByPrenom?: string;
  createdByUsername?: string;
}

interface CaisseTransfertsProps {
  onBack: () => void;
  session: any;
  soldeActuel: number;
}

export default function CaisseTransferts({ onBack, session, soldeActuel }: CaisseTransfertsProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateTransferts = hasPermission('caisse', 'create') || hasPermission('transferts', 'create');
  const canConfirmTransferts = hasPermission('caisse', 'edit') || hasPermission('transferts', 'edit') || hasPermission('caisse', 'manage');
  const canCancelTransferts = hasPermission('caisse', 'edit') || hasPermission('transferts', 'delete') || hasPermission('caisse', 'manage');

  // State
  const [transferts, setTransferts] = useState<Transfert[]>([]);
  const [agences, setAgences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'receive' | 'cancel'; transfert: Transfert } | null>(null);
  const [montantError, setMontantError] = useState<string | null>(null);

  // Pagination & Details
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [selectedTransfert, setSelectedTransfert] = useState<Transfert | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Printing
  const { componentRef, print, isPrinting, printData } = usePrinter();

  // Form State
  const [formData, setFormData] = useState({
    session_id: session?.id || '',
    agence_dest_id: '',
    montant: '',
    motif: '',
    observations: ''
  });

  // Chargement initial
  useEffect(() => {
    loadInitialData();

    const handleRealTimeUpdate = () => {
      loadTransferts();
    };

    window.addEventListener('caisse-update', handleRealTimeUpdate);
    return () => window.removeEventListener('caisse-update', handleRealTimeUpdate);
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadTransferts(), loadAgences()]);
    setLoading(false);
  }, []);

  const loadAgences = useCallback(async () => {
    try {
      const data = await agenceApi.getAll();
      setAgences(data || []);
    } catch (error) {
      console.error('Error loading agences', error);
      setAgences([]);
    }
  }, []);

  const loadTransferts = useCallback(async () => {
    try {
      const data = await caisseTransfertApi.getAll();
      setTransferts(data || []);
    } catch (error) {
      console.error('Erreur:', error);
      setTransferts([]);
    }
  }, []);

  // Validation du montant
  const validateMontant = useCallback((value: string): boolean => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setMontantError('Le montant doit être supérieur à 0');
      return false;
    }
    if (numValue > soldeActuel) {
      setMontantError(`Solde insuffisant (disponible: ${formatMoney(soldeActuel)})`);
      return false;
    }
    if (numValue > VALIDATION_LIMITS.MAX_AMOUNT) {
      setMontantError(`Le montant ne peut pas dépasser ${formatMoney(VALIDATION_LIMITS.MAX_AMOUNT)}`);
      return false;
    }
    setMontantError(null);
    return true;
  }, [soldeActuel]);

  // Génération de référence
  const genererReference = useCallback(() => {
    const date = new Date();
    return `TRF${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
  }, []);

  // Soumission du formulaire
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session) {
      toast.error('Session fermée ou invalide');
      return;
    }

    if (!formData.agence_dest_id) {
      toast.warning('Veuillez sélectionner une agence destinataire');
      return;
    }

    if (!validateMontant(formData.montant)) {
      return;
    }

    setLoading(true);
    const loadingId = toast.loading('Création du transfert...');

    try {
      await caisseTransfertApi.create({
        sessionId: session.id,
        agenceDestId: formData.agence_dest_id,
        montant: Number(formData.montant),
        motif: sanitizeInput(formData.motif),
        observations: sanitizeInput(formData.observations),
        reference: genererReference(),
        statut: 'en_attente'
      });

      toast.dismiss(loadingId);
      toast.success('Transfert initié avec succès');
      setSuccessMsg('Transfert initié avec succès');
      setTimeout(() => setSuccessMsg(''), 3000);

      setShowForm(false);
      loadTransferts();
      setFormData(prev => ({ ...prev, montant: '', motif: '', observations: '', agence_dest_id: '' }));
      setMontantError(null);

      window.dispatchEvent(new CustomEvent('caisse-update'));
    } catch (error) {
      toast.dismiss(loadingId);
      const errorMessage = handleApiError(error, 'Erreur lors de la création du transfert');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [session, formData, validateMontant, genererReference, loadTransferts]);

  // Préparer l'action de réception
  const prepareReception = useCallback((transfert: Transfert) => {
    setPendingAction({ type: 'receive', transfert });
    setShowConfirmDialog(true);
  }, []);

  // Préparer l'action d'annulation
  const prepareAnnulation = useCallback((transfert: Transfert) => {
    setPendingAction({ type: 'cancel', transfert });
    setShowConfirmDialog(true);
  }, []);

  // Exécuter l'action en attente
  const executeAction = useCallback(async () => {
    if (!pendingAction) return;

    setShowConfirmDialog(false);
    setLoading(true);

    const loadingId = toast.loading(
      pendingAction.type === 'receive' ? 'Confirmation de la réception...' : 'Annulation du transfert...'
    );

    try {
      if (pendingAction.type === 'receive') {
        await caisseTransfertApi.receive(pendingAction.transfert.id);
        toast.dismiss(loadingId);
        toast.success('Transfert reçu avec succès');
      } else {
        await caisseTransfertApi.cancel(pendingAction.transfert.id);
        toast.dismiss(loadingId);
        toast.success('Transfert annulé');
      }

      loadTransferts();
      window.dispatchEvent(new CustomEvent('caisse-update'));
    } catch (error) {
      toast.dismiss(loadingId);
      const errorMessage = handleApiError(error, 'Erreur lors de l\'opération');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  }, [pendingAction, loadTransferts]);

  // Direction du transfert
  const getDirection = useCallback((t: Transfert) => {
    if (t.agenceSourceId === session?.agenceId) return 'OUT';
    if (t.agenceDestId === session?.agenceId) return 'IN';
    return 'UNKNOWN';
  }, [session?.agenceId]);

  // Statistiques mémorisées
  // Statistiques calculées
  const stats = useMemo(() => {
    const validTransferts = transferts.filter(t => t.statut === StatutTransfertCaisse.VALIDATED);
    const pendingTransferts = transferts.filter(t => t.statut === StatutTransfertCaisse.PENDING);
    
    // Si on est Admin (pas de session.agenceId défini ou vue globale), on veut le volume TOTAL échangé
    // Si on est une Agence, on veut seulement CE QUI NOUS CONCERNE
    
    let volumeEnvoye = 0;
    let volumeRecu = 0;

    if (session?.agenceId) {
      // Vue Agence
      volumeEnvoye = validTransferts
        .filter(t => t.agenceSourceId === session.agenceId)
        .reduce((sum, t) => sum + (Number(t.montant) || 0), 0);

      volumeRecu = validTransferts
        .filter(t => t.agenceDestId === session.agenceId)
        .reduce((sum, t) => sum + (Number(t.montant) || 0), 0);
    } else {
      // Vue Admin / Globale : Volume Envoyé = Total des transferts validés (flux global)
      // Volume Reçu = Idem (car tout ce qui est envoyé est reçu dans un système fermé validé)
      // Ou on peut détailler autrement, mais pour l'instant : Flux Total
      const totalVolume = validTransferts.reduce((sum, t) => sum + (Number(t.montant) || 0), 0);
      volumeEnvoye = totalVolume; 
      volumeRecu = totalVolume;
    }

    return {
      total: transferts.length,
      enAttente: pendingTransferts.length,
      volumeEnvoye,
      volumeRecu
    };
  }, [transferts, session?.agenceId]);

  // Pagination Logic
  const paginatedTransferts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return transferts.slice(startIndex, startIndex + itemsPerPage);
  }, [transferts, currentPage]);

  const totalPages = Math.ceil(transferts.length / itemsPerPage);

  const openDetails = (t: Transfert) => {
    setSelectedTransfert(t);
    setShowDetailsModal(true);
  };

  // Message de confirmation mémorisé
  const confirmationMessage = useMemo(() => {
    if (!pendingAction) return '';
    const { type, transfert } = pendingAction;
    if (type === 'receive') {
      return `Confirmer la réception de ${formatMoney(Number(transfert.montant))} de ${escapeHtml(transfert.agenceSource?.nom || 'l\'agence source')} ?`;
    }
    return `Êtes-vous sûr de vouloir annuler ce transfert de ${formatMoney(Number(transfert.montant))} ?`;
  }, [pendingAction]);

  const handlePrintHistory = useCallback(() => {
    const data: TransferHistoryData = {
      title: 'Historique des Transferts',
      agencyName: session?.agence?.nom || 'Agence (Vue Globale)',
      generatedBy: session?.user?.nom ? `${session.user.nom} ${session.user.prenom || ''}` : 'Utilisateur',
      date: new Date(),
      transfers: transferts.map(t => ({
        reference: t.reference,
        date: t.dateCreation,
        source: t.agenceSourceNom || t.agenceSource?.nom || 'Source',
        destination: t.agenceDestNom || t.agenceDest?.nom || 'Dest',
        montant: Number(t.montant),
        initiator: t.createdByNom ? `${t.createdByNom} ${t.createdByPrenom || ''}` : '-',
        statut: t.statut
      })),
      stats: {
        totalCount: transferts.length,
        totalAmount: transferts.reduce((acc, t) => acc + (Number(t.montant) || 0), 0)
      }
    };
    print(data);
  }, [transferts, session, print]);



  // Définition des colonnes pour ResponsiveTable
  const columns = useMemo(() => [
    { 
      key: 'reference', 
      label: 'Référence', 
      primary: true,
      mobileClassName: 'font-mono text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded inline-block mb-1'
    },
    { 
      key: 'trajet', 
      label: 'Trajet',
      format: (_: any, t: Transfert) => (
         <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 max-w-[100px] truncate" title={t.agenceSourceNom || t.agenceSource?.nom}>
              {t.agenceSourceNom || t.agenceSource?.nom || 'Source'}
            </span>
            <ArrowRight size={12} className="text-slate-600 shrink-0" />
            <span className="text-white font-medium max-w-[100px] truncate" title={t.agenceDestNom || t.agenceDest?.nom}>
              {t.agenceDestNom || t.agenceDest?.nom || 'Dest'}
            </span>
         </div>
      ),
      mobileFormat: (_: any, t: Transfert) => (
        <div className="flex items-center gap-2 text-sm text-slate-300">
           <span className="font-medium text-slate-400">{t.agenceSourceNom || t.agenceSource?.nom}</span>
           <ArrowRight size={14} className="text-slate-600" />
           <span className="font-medium text-white">{t.agenceDestNom || t.agenceDest?.nom}</span>
        </div>
      )
    },
    { 
      key: 'montant', 
      label: 'Montant', 
      align: 'right' as const,
      format: (val: any) => <span className="font-bold text-white">{formatMoney(Number(val))}</span>,
      mobileFormat: (val: any) => <span className="text-lg font-bold text-white block mt-1">{formatMoney(Number(val))}</span>
    },
    { 
      key: 'infos', 
      label: 'Date & Initiateur',
      format: (_: any, t: Transfert) => (
        <div className="flex flex-col">
            <span className="text-slate-300">{new Date(t.dateCreation).toLocaleDateString('fr-FR')}</span>
            <span className="text-[10px] text-slate-500">
                {t.createdByNom ? `${t.createdByNom} ${t.createdByPrenom?.charAt(0)}.` : '-'}
            </span>
        </div>
      ),
      hideOnMobile: true
    },
    { 
      key: 'statut', 
      label: 'Statut', 
      badge: true,
      align: 'center' as const
    }
  ], []);

  // Actions row renderer
  const renderActions = (t: Transfert) => {
    if (t.statut !== StatutTransfertCaisse.PENDING) return null;

    return (
      <div className="flex items-center justify-end gap-2 w-full">
        {canConfirmTransferts && getDirection(t) === 'IN' && (
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); prepareReception(t); }}
            className="h-7 text-xs bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 shadow-none border border-emerald-500/20 px-2"
          >
            Reçu
          </Button>
        )}
        {canCancelTransferts && getDirection(t) === 'OUT' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); prepareAnnulation(t); }}
            className="h-7 w-7 p-0 flex items-center justify-center text-slate-400 hover:bg-slate-800 rounded-full"
          >
            <X size={14} aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  };

  // État de chargement (déplacé après les hooks pour éviter l'erreur "Rendered more hooks")
  if (loading && transferts.length === 0) {
    return (
      <div className="space-y-6" role="status" aria-label="Chargement des transferts">
        <div className="flex items-center gap-3">
          <SkeletonCard className="h-10 w-10 rounded-full" />
          <div>
            <SkeletonCard className="h-6 w-48 mb-2" />
            <SkeletonCard className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <SkeletonCard key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <SkeletonCard className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4 animate-in fade-in duration-300 overflow-y-auto overflow-x-hidden font-sans">
      {/* 1. Header & Quick Actions (Fixed) */}
      <div className="shrink-0 flex items-center justify-between gap-4 p-2 pb-0">
         <div className="flex items-center gap-3">
           <Button
             variant="ghost"
             size="sm"
             onClick={onBack}
             className="rounded-full hover:bg-slate-800 text-slate-400 h-8 w-8 p-0"
           >
             <ArrowLeft size={18} />
           </Button>
           <div>
             <h2 className="text-lg font-bold text-white leading-none">Transferts</h2>
             <p className="text-xs text-slate-500 mt-1">Inter-Agences</p>
           </div>
         </div>

         <div className="flex gap-2">
            {canCreateTransferts && (
                <Button
                    size="sm"
                    onClick={() => setShowForm(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 h-8 text-xs font-semibold"
                >
                    <Plus size={14} className="mr-1.5" />
                    Nouveau
                </Button>
            )}
             <Button
                variant="outline"
                size="sm"
                onClick={handlePrintHistory}
                className="border-slate-700 hover:bg-slate-800 text-slate-300 h-8 w-8 p-0"
                disabled={isPrinting || transferts.length === 0}
                title="Imprimer"
            >
                <Printer size={14} />
            </Button>
         </div>
      </div>

      {/* 2. Compact Stats Bar (Fixed) */}
      <div className="shrink-0 grid grid-cols-4 gap-2 px-2">
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2 flex items-center gap-3">
              <div className="p-1.5 rounded bg-blue-500/10 text-blue-400"><ArrowRightLeft size={14} /></div>
              <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Total</div>
                  <div className="text-sm font-bold text-white leading-none">{stats.total}</div>
              </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2 flex items-center gap-3">
              <div className="p-1.5 rounded bg-amber-500/10 text-amber-400"><Clock size={14} /></div>
              <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">En Attente</div>
                  <div className="text-sm font-bold text-white leading-none">{stats.enAttente}</div>
              </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2 flex items-center gap-3">
              <div className="p-1.5 rounded bg-indigo-500/10 text-indigo-400"><Send size={14} /></div>
              <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Envoyé</div>
                  <div className="text-sm font-bold text-white leading-none">{formatCompactMoney(stats.volumeEnvoye)}</div>
              </div>
          </div>
           <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2 flex items-center gap-3">
              <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400"><Wallet size={14} /></div>
              <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Reçu</div>
                  <div className="text-sm font-bold text-white leading-none">{formatCompactMoney(stats.volumeRecu)}</div>
              </div>
          </div>
      </div>

      {/* 3. Responsive Table (Scrollable Flex-1) */}
      <div className="flex-1 min-h-0 px-2 relative">
          <div className="h-full border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden flex flex-col">
             <ResponsiveTable
                data={paginatedTransferts}
                columns={columns}
                actions={renderActions}
                onRowClick={openDetails}
                loading={loading}
                emptyMessage="Aucun transfert enregistré"
                density="compact"
                className="flex-1 overflow-auto"
                headerClassName="sticky top-0 z-10 bg-slate-900 border-b border-slate-800"
                pagination={{ // Use ResponsiveTable's pagination if implemented, or we use our own footer
                    page: currentPage,
                    totalPages: totalPages,
                    onPageChange: setCurrentPage
                }}
             />
          </div>
      </div>


      {/* Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title="Détails du transfert"
        size="lg"
      >
        {selectedTransfert && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-slate-900/50 rounded-xl border border-slate-800">
              <div>
                <p className="text-sm text-slate-400 mb-1">Montant</p>
                <p className="text-3xl font-bold text-white">{formatMoney(Number(selectedTransfert.montant))}</p>
              </div>
              <Badge
                value={selectedTransfert.statut}
                variant={
                  (selectedTransfert.statut === StatutTransfertCaisse.VALIDATED) ? 'success' :
                  (selectedTransfert.statut === StatutTransfertCaisse.PENDING) ? 'warning' : 'neutral'
                }
                size="lg"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-300 border-b border-slate-800 pb-2">Informations Générales</h4>
                
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase">Référence</p>
                  <p className="font-mono text-white">{selectedTransfert.reference}</p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase">Date Création</p>
                  <p className="text-white">
                    {new Date(selectedTransfert.dateCreation).toLocaleString('fr-FR')}
                  </p>
                </div>

                {selectedTransfert.dateValidation && (
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 uppercase">Date Validation</p>
                    <p className="text-white">
                      {new Date(selectedTransfert.dateValidation).toLocaleString('fr-FR')}
                    </p>
                  </div>
                )}
                
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase">Initié par</p>
                  <p className="text-white">
                    {selectedTransfert.createdByNom 
                      ? `${selectedTransfert.createdByNom} ${selectedTransfert.createdByPrenom || ''}`
                      : 'Inconnu'}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-300 border-b border-slate-800 pb-2">Trajet</h4>
                
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase">De (Source)</p>
                  <p className="text-white font-medium">{selectedTransfert.agenceSourceNom || selectedTransfert.agenceSource?.nom || 'Agence Source'}</p>
                </div>
                
                <div className="pl-2 border-l-2 border-slate-700 my-2">
                  <ArrowRight className="text-slate-500 my-1" size={16} />
                </div>
                
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase">Vers (Destination)</p>
                  <p className="text-white font-medium">{selectedTransfert.agenceDestNom || selectedTransfert.agenceDest?.nom || 'Agence Dest'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-300 border-b border-slate-800 pb-2">Notes</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase">Motif</p>
                  <p className="text-slate-300">{selectedTransfert.motif || '-'}</p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase">Observations</p>
                  <p className="text-slate-300 italic">{selectedTransfert.observations || 'Aucune observation'}</p>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
               <Button onClick={() => setShowDetailsModal(false)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* New Transfer Modal */}
      {showForm && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-transfer-title"
        >
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg max-h-[90vh] sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-5">
            <header className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur z-10 rounded-t-2xl">
              <div>
                <h3 id="new-transfer-title" className="text-lg font-bold text-white">
                  Nouveau Transfert
                </h3>
                <p className="text-xs text-slate-400">Initier un mouvement de fonds</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setMontantError(null);
                }}
                className="rounded-full text-slate-400 hover:text-white h-10 w-10 p-0"
                aria-label="Fermer"
              >
                <X size={20} aria-hidden="true" />
              </Button>
            </header>

            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="agence-dest"
                    className="text-xs font-semibold text-indigo-400 uppercase"
                  >
                    Agence Destination
                  </label>
                  <select
                    id="agence-dest"
                    value={formData.agence_dest_id}
                    onChange={(e) => setFormData({ ...formData, agence_dest_id: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    required
                    aria-required="true"
                  >
                    <option value="">Sélectionner une agence...</option>
                    {agences.filter(a => a.id !== session?.agenceId).map(agence => (
                      <option key={agence.id} value={agence.id}>
                        {escapeHtml(agence.nom)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="montant-transfert"
                    className="text-xs font-semibold text-slate-400 uppercase"
                  >
                    Montant (FCFA)
                  </label>
                  <div className="relative">
                    <input
                      id="montant-transfert"
                      type="number"
                      value={formData.montant}
                      onChange={(e) => {
                        setFormData({ ...formData, montant: e.target.value });
                        if (e.target.value) validateMontant(e.target.value);
                      }}
                      className={`w-full pl-4 pr-12 py-3 bg-slate-950 border rounded-xl text-lg font-bold text-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all ${
                        montantError ? 'border-red-500' : 'border-slate-700'
                      }`}
                      min="0"
                      placeholder="0"
                      required
                      aria-required="true"
                      aria-invalid={!!montantError}
                      aria-describedby={montantError ? 'montant-error' : 'solde-info'}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
                      FCFA
                    </span>
                  </div>
                  {montantError ? (
                    <p id="montant-error" className="text-xs text-red-400" role="alert">
                      {montantError}
                    </p>
                  ) : (
                    <p id="solde-info" className="text-xs text-right text-emerald-500/80">
                      Solde dispo: {formatMoney(soldeActuel)}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="motif-transfert"
                    className="text-xs font-semibold text-slate-400 uppercase"
                  >
                    Motif
                  </label>
                  <input
                    id="motif-transfert"
                    type="text"
                    value={formData.motif}
                    onChange={(e) => setFormData({ ...formData, motif: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    placeholder="Ex: Approvisionnement caisse secondaire..."
                    required
                    aria-required="true"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="observations-transfert"
                    className="text-xs font-semibold text-slate-400 uppercase"
                  >
                    Observations
                  </label>
                  <textarea
                    id="observations-transfert"
                    value={formData.observations}
                    onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                    rows={3}
                    placeholder="Notes optionnelles..."
                  />
                </div>
              </div>

              <div className="pt-4 grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setMontantError(null);
                  }}
                  className="w-full border-slate-700 hover:bg-slate-800 text-slate-300"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !!montantError}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
                >
                  {loading ? (
                    'Traitement...'
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Send size={18} aria-hidden="true" /> Valider
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden Print Template (offscreen, not display:none) */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-10000px',
          top: '0',
          width: '210mm',
          background: 'white',
          zIndex: -1,
        }}
      >
        <TransferHistoryPrintTemplate 
          ref={componentRef} 
          data={printData || { 
            title: '', agencyName: '', generatedBy: '', date: new Date(), transfers: [], stats: { totalCount: 0, totalAmount: 0 } 
          }} 
        />
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title={pendingAction?.type === 'receive' ? 'Confirmer la réception' : 'Annuler le transfert'}
        message={confirmationMessage}
        onConfirm={executeAction}
        onClose={() => {
          setShowConfirmDialog(false);
          setPendingAction(null);
        }}
        variant={pendingAction?.type === 'cancel' ? 'danger' : 'success'}
        confirmText={pendingAction?.type === 'receive' ? 'Confirmer' : 'Annuler le transfert'}
        cancelText="Retour"
      />
    </div>
  );
}

function formatCompactMoney(amount: number) {
  return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
}
