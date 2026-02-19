import React, { useState, useCallback, useMemo, useEffect } from 'react'; // v2.1 redesign

import { 
  X, CheckCircle, XCircle, AlertCircle, FileText, DollarSign, User, TrendingUp, 
  Loader2, Shield, AlertTriangle, ChevronDown, ChevronUp, Briefcase, MessageSquare, 
  UserCheck, RefreshCw, Clock, Trash2, Calendar, CreditCard, MapPin, Phone, Mail, 
  LayoutDashboard, ArrowRight, Wallet, Percent, PiggyBank 
} from 'lucide-react';
import { demandeCreditApi } from '../../../lib/api-client';
import { usePermissions } from '../../auth/ProtectedFeature';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney, formatClientName } from '../../../lib/format';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { Badge, ConfirmDialog } from '../../ui';
import { ReevaluationEligibilityCheck } from './ReevaluationEligibilityCheck';
import { ReevaluationModal } from './ReevaluationModal';
import { CreditTimeline } from './CreditTimeline';
import { StatutDemande } from '@shared/enum/status-constants';

interface Demande {
  id: string;
  numeroDemande: string;
  clientId: string;
  montantDemande: number;
  montantApprouve?: number | null;
  // V2 duration fields
  dureeValeur: number;
  dureeUnite: 'Jour' | 'Semaine' | 'Mois';
  nombreEcheances?: number;
  tauxInteret: number;
  typeCredit: string | null;
  objetCredit: string;
  statut: string;
  motifRejet?: string;
  revenusMensuels?: number;
  typeRevenu?: string;
  revenuJournalier?: number;
  chargesMensuelles?: number;
  capaciteRemboursement?: number;
  frequenceRemboursement: string;
  dateDemande: string;
  createdAt?: string;
  fraisEngagementPayes?: boolean;
  montantFraisEngagement?: number;
  clients: {
    nom: string;
    prenom?: string;
    email?: string;
    phone: string;
    tauxRemboursement?: number;
    creditTotal?: number;
    photoUrl?: string;
  };
  deletedAt?: string | null;
}

interface CreditApprovalModalProps {
  demande: Demande;
  onClose: () => void;
  onSuccess: () => void;
  onManageReevaluation?: () => void;
}

interface Guarantee {
  typeGarantie: string;
  description: string;
  valeurEstimee: string;
}

const GUARANTEE_TYPES = [
  { value: 'Hypothèque', label: 'Hypothèque' },
  { value: 'Gage', label: 'Gage' },
  { value: 'Caution', label: 'Caution' },
  { value: 'Nantissement', label: 'Nantissement' },
  { value: 'Aval', label: 'Aval' },
  { value: 'Dépôt', label: 'Dépôt' },
] as const;

export default function CreditApprovalModal({ demande, onClose, onSuccess, onManageReevaluation }: CreditApprovalModalProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canApproveCredits = hasPermission('credits', 'approve');

  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [loading, setLoading] = useState(false);
  const [guarantees, setGuarantees] = useState<Guarantee[]>([]);
  const [showConfirmApprove, setShowConfirmApprove] = useState(false);
  const [showConfirmReject, setShowConfirmReject] = useState(false);
  const [reimbursementAmount, setReimbursementAmount] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isReevaluating, setIsReevaluating] = useState(false);
  const [showReevaluationModal, setShowReevaluationModal] = useState(false);
  const [isEligibleForReevaluation, setIsEligibleForReevaluation] = useState(false);
  const [enquetes, setEnquetes] = useState<any[]>([]);
  const [expandedEnquete, setExpandedEnquete] = useState<string | null>(null);
  
  // Scheduled disbursement
  const [scheduledDisbursement, setScheduledDisbursement] = useState(false);
  const [disbursementDate, setDisbursementDate] = useState('');

  // Refund modal for already rejected demandes
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundLoading, setRefundLoading] = useState(false);

  // Track existing refund for this demande
  const [existingRefund, setExistingRefund] = useState<{
    id: string;
    statut: string;
    montantRemboursable: number;
    montantEncaisse: number;
    paymentMethod?: string;
    paidAt?: string;
  } | null>(null);

  // Fetch existing refund info
  useEffect(() => {
    if (demande?.id) {
      fetch(`/api/demandes-credit/${demande.id}/refund-status`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.refund) {
            setExistingRefund(data.refund);
          }
        })
        .catch(() => { /* No refund exists */ });
    }
  }, [demande?.id]);

  useEffect(() => {
    if (demande?.id) {
       fetch(`/api/demandes-credit/${demande.id}/enquete`)
         .then(res => {
           if (!res.ok) return null;
           return res.json();
         })
         .then(data => {
           if (!data) return;
           const enquetesList = Array.isArray(data) ? data : (data ? [data] : []);
           setEnquetes(enquetesList);
           // Auto-expand the latest enquete for better UX
           if (enquetesList.length > 0 && enquetesList[0]?.id) {
             setExpandedEnquete(enquetesList[0].id);
           }
         })
         .catch(() => { /* No enquete for this demande */ });
    }
  }, [demande?.id]);

  const isFinished = (demande.statut === StatutDemande.APPROVED || 
                      demande.statut === StatutDemande.DISBURSED || 
                      demande.statut === StatutDemande.CLOSED ||
                      demande.statut === StatutDemande.APPROVED_AFTER_REEVALUATION ||
                      demande.statut.toLowerCase() === 'déboursé' || 
                      demande.statut.toLowerCase() === 'approved');
  
  const isRejected = (demande.statut === StatutDemande.REJECTED ||
                      demande.statut === StatutDemande.DEFINITIVELY_REJECTED ||
                      demande.statut.toLowerCase() === 'rejected');

  const isDefinitivelyRejected = demande.statut === StatutDemande.DEFINITIVELY_REJECTED;

  const isCancelled = (demande.statut === StatutDemande.CANCELLED ||
                       demande.statut.toLowerCase() === 'annulée' ||
                       demande.statut.toLowerCase() === 'cancelled');

  // Check if refund was already made (paid or in progress)
  const hasRefundInProgress = existingRefund && ['SUBMITTED', 'APPROVED', 'PENDING_CAISSE'].includes(existingRefund.statut);
  const hasRefundPaid = existingRefund?.statut === 'PAID';
  const hasAnyRefund = hasRefundInProgress || hasRefundPaid;

  // Fees need to be repaid if a refund was made
  const feesNeedRepayment = hasRefundPaid && !demande.fraisEngagementPayes;

  // Can request reevaluation if:
  // - rejected (not definitively)
  // - eligible
  // - fees are paid (or never refunded)
  const canRequestReevaluation = isRejected && !isDefinitivelyRejected && isEligibleForReevaluation && !feesNeedRepayment;

  // Can initiate refund if:
  // - rejected
  // - fees were paid
  // - no refund already exists (or was cancelled/rejected)
  const canInitiateRefund = isRejected && demande.fraisEngagementPayes &&
                            demande.montantFraisEngagement && demande.montantFraisEngagement > 0 &&
                            !hasAnyRefund;

  const isPendingFees = demande.statut === StatutDemande.PENDING_FEES;
  const showActions = ((!isFinished && !isRejected && !isCancelled && !isPendingFees) || isReevaluating);

  // Helper: convert V2 duration to days
  const convertDureeEnJours = (valeur: number, unite: string): number => {
    switch (unite) {
      case 'Jour': return valeur;
      case 'Semaine': return valeur * 7;
      case 'Mois': return valeur * 30;
      default: return valeur;
    }
  };

  // Helper: calculate number of payments from V2 duration + frequency
  const calculerNombreEcheances = (frequence: string, dureeValeur: number, dureeUnite: string): number => {
    const joursTotal = convertDureeEnJours(dureeValeur, dureeUnite);
    switch (frequence) {
      case 'Journalier': return joursTotal;
      case 'Hebdomadaire': return Math.ceil(joursTotal / 7);
      case 'Bimensuel': return Math.ceil(joursTotal / 15);
      case 'Mensuel': return Math.ceil(joursTotal / 30);
      case 'Trimestriel': return Math.ceil(joursTotal / 90);
      default: return joursTotal;
    }
  };

  // Memoized financial calculations - V2
  const { montantBase, mensualite, nombreEcheancesCalc, tauxEndettement } = useMemo(() => {
    const base = Number(demande.montantDemande) || 0;
    const rev = Number(demande.revenusMensuels) || 0;
    
    // V2: Use duree_valeur and duree_unite
    const dureeValeur = demande.dureeValeur || 0;
    const dureeUnite = demande.dureeUnite || 'Mois';
    const frequence = demande.frequenceRemboursement;

    // Calculate number of payments
    const nombreEcheances = demande.nombreEcheances || calculerNombreEcheances(frequence, dureeValeur, dureeUnite);

    // Simple interest calculation (matching CreditRequestForm)
    const total = base * (1 + demande.tauxInteret / 100);
    const mens = nombreEcheances > 0 ? total / nombreEcheances : 0;
    
    // Calculate debt ratio (convert to monthly equivalent)
    const freq = (frequence || '').toUpperCase();
    let montantMensuelEquivalent = mens;
    if (freq === 'DAILY') {
      montantMensuelEquivalent = mens * 30;
    } else if (freq === 'WEEKLY') {
      montantMensuelEquivalent = mens * 4;
    } else if (freq === 'BI_MONTHLY') {
      montantMensuelEquivalent = mens * 2;
    } else if (freq === 'QUARTERLY') {
      montantMensuelEquivalent = mens / 3;
    }
    const charges = Number(demande.chargesMensuelles) || 0;
    const totalDettesMensuelles = charges + montantMensuelEquivalent;
    const endettement = rev > 0 ? (totalDettesMensuelles / rev) * 100 : 0;

    return {
      montantBase: base,
      mensualite: isFinite(mens) ? mens : 0,
      nombreEcheancesCalc: nombreEcheances,
      tauxEndettement: isFinite(endettement) ? endettement : 0,
    };
  }, [demande]);

  // Solvency Analysis - Dynamic Calculation
  const { solvencyScore, solvencyColor, solvencyAnalysis } = useMemo(() => {
    let score = 0;
    const analysis: string[] = [];

    // 1. Debt Ratio (Max 40 pts)
    if (tauxEndettement < 30) {
        score += 40;
        analysis.push("Endettement faible (< 30%).");
    } else if (tauxEndettement < 45) {
        score += 20;
        analysis.push("Endettement modéré.");
    } else {
        analysis.push("Endettement critique (> 45%).");
    }

    // 2. Residual Income (Max 30 pts)
    const revenu = Number(demande.revenusMensuels) || 0;
    const charges = Number(demande.chargesMensuelles) || 0;
    // Using a simple estimate: Residual = Income - Estimated Charges (default 30% if unknown) - New Loan Payment
    const estimatedCharges = charges > 0 ? charges : (revenu * 0.3);
    const resteAVivre = revenu - estimatedCharges - mensualite;

    if (resteAVivre > 150000) {
        score += 30;
        analysis.push("Reste à vivre confortable.");
    } else if (resteAVivre > 50000) {
        score += 15;
    } else {
        analysis.push("Reste à vivre faible.");
    }

    // 3. Reliability (Max 30 pts)
    const reliability = demande.clients.tauxRemboursement ?? 0;
    if (reliability >= 90) {
        score += 30;
        analysis.push("Historique client excellent.");
    } else if (reliability >= 50) {
        score += 10;
    } else {
        analysis.push("Historique de remboursement fragile.");
    }

    // Determine Color & Verbal Dictum
    let color = 'text-status-danger';
    if (score >= 70) color = 'text-status-success';
    else if (score >= 40) color = 'text-status-warning';

    return {
        solvencyScore: score,
        solvencyColor: color,
        solvencyAnalysis: analysis.join(" ")
    };
  }, [tauxEndettement, demande.revenusMensuels, demande.chargesMensuelles, mensualite, demande.clients.tauxRemboursement]);

  // Safe escaped values - Use formatClientName for consistent formatting
  const safeClientName = useMemo(() => {
    const formatted = formatClientName(demande.clients.nom, demande.clients.prenom);
    return escapeHtml(formatted);
  }, [demande.clients.nom, demande.clients.prenom]);

  // Convert storage key to display URL for avatars
  const getAvatarUrl = (photoUrl: string | null | undefined): string | null => {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('http') || photoUrl.startsWith('data:')) {
      return photoUrl;
    }
    return `/api/storage/files/${encodeURIComponent(photoUrl)}`;
  };

  const clientAvatarUrl = useMemo(() => getAvatarUrl(demande.clients.photoUrl), [demande.clients.photoUrl]);

  const addGuarantee = useCallback(() => {
    setGuarantees(prev => [...prev, { typeGarantie: 'Hypothèque', description: '', valeurEstimee: '' }]);
  }, []);

  const removeGuarantee = useCallback((index: number) => {
    setGuarantees(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateGuarantee = useCallback((index: number, field: keyof Guarantee, value: string) => {
    setGuarantees(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (action === 'reject' && !commentaire.trim()) {
      newErrors.commentaire = 'Le motif du rejet est obligatoire';
    }

    if (action === 'reject' && reimbursementAmount) {
         const val = Number(reimbursementAmount);
         const max = Number(demande.montantFraisEngagement || 0);
         if (isNaN(val) || val < 0) {
             newErrors.reimbursement = 'Montant invalide';
         } else if (val > max) {
             newErrors.reimbursement = `Ne peut excéder ${formatMoney(max)}`;
         }
    }

    // Validate scheduled disbursement
    if (action === 'approve' && scheduledDisbursement) {
      if (!disbursementDate) {
        newErrors.disbursementDate = 'Date de décaissement requise';
      } else {
        const selectedDate = new Date(disbursementDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate <= today) {
          newErrors.disbursementDate = 'La date doit être dans le futur';
        }
      }
    }

    // Validate guarantee values
    guarantees.forEach((g, index) => {
      if (g.valeurEstimee) {
        const valeur = parseFloat(g.valeurEstimee);
        const validation = validateAmount(valeur, { min: 0, max: VALIDATION_LIMITS.MAX_CREDIT });
        if (!validation.isValid) {
          newErrors[`guarantee_${index}`] = validation.error || 'Valeur invalide';
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [action, commentaire, guarantees, reimbursementAmount, demande.montantFraisEngagement, scheduledDisbursement, disbursementDate]);

  const handleApprove = useCallback(async () => {
    setLoading(true);

    try {
      // Prepare approval data to save on the demand
      const updateData: any = {
        statut: 'APPROVED',
        montant_approuve: montantBase,
        commentaire_approbation: sanitizeInput(commentaire),
        decaissement_automatique: scheduledDisbursement,
        date_decaissement_programme: scheduledDisbursement && disbursementDate ? new Date(disbursementDate).toISOString() : null,
      };

      await demandeCreditApi.update(demande.id, updateData);

      const successMessage = scheduledDisbursement
        ? `Crédit approuvé. Décaissement programmé pour le ${new Date(disbursementDate).toLocaleDateString('fr-FR')}.`
        : `Crédit approuvé. Dossier transféré à la Commission Crédit pour décaissement.`;
      
      toast.success(successMessage);
      onSuccess();
    } catch (error) {
      const errorMessage = handleApiError(error, "Erreur lors de l'approbation du crédit");
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setShowConfirmApprove(false);
    }
  }, [demande, montantBase, commentaire, scheduledDisbursement, disbursementDate, onSuccess]);
  
  const handleReject = useCallback(async () => {
    setLoading(true);

    try {
      // Si remboursement demandé, on met à jour la demande pour déclencher le process de remboursement
      // (selon API)
      const payload: any = {
        statut: 'REJECTED',
        motif_rejet: sanitizeInput(commentaire)
      };

      // Add reimbursement if entered
      if (reimbursementAmount) {
         const amount = parseFloat(reimbursementAmount);
         payload.montantRemboursement = amount;
      }

      await demandeCreditApi.update(demande.id, payload);

      const successMessage = reimbursementAmount 
        ? `Demande rejetée. Remboursement de ${formatMoney(Number(reimbursementAmount))} initié.`
        : 'Demande de crédit rejetée';
      
      toast.success(successMessage, { duration: 5000 });
      onSuccess();
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors du rejet');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setShowConfirmReject(false);
    }
  }, [demande.id, commentaire, reimbursementAmount, onSuccess]);

  const handleSubmitAction = useCallback(() => {
    if (!validateForm()) {
      toast.warning('Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    if (action === 'approve') {
      setShowConfirmApprove(true);
    } else if (action === 'reject') {
      setShowConfirmReject(true);
    }
  }, [action, validateForm]);

  const handleCancel = useCallback(() => {
    setAction(null);
    setCommentaire('');
    setGuarantees([]);
    setErrors({});
  }, []);

  // Handler to initiate refund for already rejected demandes
  const handleInitiateRefund = useCallback(async () => {
    if (!refundAmount || Number(refundAmount) <= 0) {
      toast.warning('Veuillez entrer un montant à rembourser');
      return;
    }

    const amount = Number(refundAmount);
    const maxAmount = demande.montantFraisEngagement || 0;

    if (amount > maxAmount) {
      toast.error(`Le montant ne peut pas dépasser ${formatMoney(maxAmount)}`);
      return;
    }

    setRefundLoading(true);
    try {
      const response = await fetch(`/api/demandes-credit/${demande.id}/initiate-refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          montantRemboursement: amount,
          motif: demande.motifRejet || 'Remboursement des frais suite au rejet'
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Erreur lors de la création du remboursement');
      }

      toast.success(`Demande de remboursement de ${formatMoney(amount)} créée`, {
        description: 'La demande est en attente de validation.'
      });
      setShowRefundModal(false);
      setRefundAmount('');
      onSuccess();
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors de la création du remboursement');
      toast.error(errorMessage);
    } finally {
      setRefundLoading(false);
    }
  }, [demande.id, demande.montantFraisEngagement, demande.motifRejet, refundAmount, onSuccess]);

  const getEndettementColor = useCallback((taux: number) => {
    if (taux > 50) return 'text-status-danger';
    if (taux > 40) return 'text-status-warning';
    return 'text-status-success';
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface-base rounded-xl border border-edge w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
                        {/* === HEADER COMPACT === */}
        {/* === HEADER COMPACT === */}
        <div className="bg-surface/80 border-b border-edge p-4 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold text-content-primary flex items-center gap-2">
                        Analyse Crédit
                        <Badge value={demande.statut} size="sm" />
                    </h2>
                    <span className="text-content-muted text-xs font-mono">{demande.numeroDemande}</span>
                </div>
                {/* Status Fees - Compact Pill */}
                <div className={`hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
                    demande.fraisEngagementPayes
                    ? 'bg-status-success-bg border-status-success/30 text-status-success'
                    : 'bg-status-warning-bg border-status-warning/30 text-status-warning'
                }`}>
                    {demande.fraisEngagementPayes ? (
                        <><CheckCircle size={12} /> Frais Payés: {formatMoney(demande.montantFraisEngagement || 0)}</>
                    ) : (
                        <><AlertCircle size={12} /> Frais dus: {formatMoney(demande.montantFraisEngagement || 0)}</>
                    )}
                </div>
                {/* Refund Status Pill */}
                {existingRefund && (
                    <div className={`hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
                        existingRefund.statut === 'PAID'
                            ? 'bg-accent/10 border-accent/30 text-accent'
                            : 'bg-status-info-bg border-status-info/30 text-status-info'
                    }`}>
                        {existingRefund.statut === 'PAID' ? (
                            <><Wallet size={12} /> Remboursé: {formatMoney(existingRefund.montantRemboursable)}</>
                        ) : existingRefund.statut === 'PENDING_CAISSE' ? (
                            <><Clock size={12} /> Remb. en caisse</>
                        ) : (
                            <><Wallet size={12} /> Remb. en cours</>
                        )}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                 <ReevaluationEligibilityCheck
                    demandeId={demande.id}
                    onEligibilityChange={(isEligible) => setIsEligibleForReevaluation(isEligible)}
                 />
                <button
                onClick={onClose}
                className="text-content-muted hover:text-content-primary p-2 rounded-lg hover:bg-surface-elevated transition"
                disabled={loading}
                >
                <X size={20} />
                </button>
            </div>
        </div>

        {/* === SCROLLABLE CONTENT === */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
            
            {/* 1. TOP STATS ROW (KPIs) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface rounded-lg p-3 border border-edge hover:border-status-info/50 transition-colors">
                    <div className="flex items-center gap-2 text-content-muted text-xs mb-1">
                        <DollarSign size={14} className="text-status-info" /> Montant Demandé
                    </div>
                    <div className="text-lg md:text-xl font-bold text-content-primary">{formatMoney(demande.montantDemande)}</div>
                </div>
                <div className="bg-surface rounded-lg p-3 border border-edge hover:border-status-info/50 transition-colors">
                    <div className="flex items-center gap-2 text-content-muted text-xs mb-1">
                        <Wallet size={14} className="text-status-info" />
                        {['Journalier', 'DAILY'].includes(demande.frequenceRemboursement) ? 'Échéance Journalière' :
                         ['Hebdomadaire', 'WEEKLY'].includes(demande.frequenceRemboursement) ? 'Échéance Hebdo' :
                         ['Bimensuel', 'BIMONTHLY'].includes(demande.frequenceRemboursement) ? 'Échéance Bimensuelle' :
                         ['Trimestriel', 'QUARTERLY'].includes(demande.frequenceRemboursement) ? 'Échéance Trimestrielle' :
                         'Mensualité Est'}
                    </div>
                    <div className="text-lg md:text-xl font-bold text-content-primary">{formatMoney(mensualite)}</div>
                </div>
                <div className="bg-surface rounded-lg p-3 border border-edge hover:border-status-success/50 transition-colors">
                    <div className="flex items-center gap-2 text-content-muted text-xs mb-1">
                        <PiggyBank size={14} className="text-status-success" /> Revenus Net
                    </div>
                    <div className="text-lg md:text-xl font-bold text-content-primary">{formatMoney(demande.revenusMensuels ?? 0)}</div>
                    <div className="text-[10px] text-content-muted">Charges: {formatMoney(Number(demande.chargesMensuelles) || 0)}</div>
                </div>
                <div className="bg-surface rounded-lg p-3 border border-edge hover:border-status-warning/50 transition-colors">
                    <div className="flex items-center gap-2 text-content-muted text-xs mb-1">
                        <Percent size={14} className="text-status-warning" /> Endettement
                    </div>
                    <div className={`text-lg md:text-xl font-bold ${getEndettementColor(tauxEndettement)}`}>
                        {tauxEndettement.toFixed(1)}%
                    </div>
                    {tauxEndettement > 40 && <div className="text-[10px] text-status-warning font-medium">Attention</div>}
                </div>
            </div>

            {/* 2. MAIN GRID (Client + Details) */}
            <div className="grid md:grid-cols-3 gap-5">
                {/* LEFT: Client Profile */}
                <div className="md:col-span-1 space-y-3">
                    <div className="bg-surface rounded-xl overflow-hidden border border-edge">
                        <div className="h-20 bg-gradient-to-r from-status-info to-surface-base relative">
                             <div className="absolute -bottom-8 left-4 w-16 h-16 rounded-full bg-surface border-4 border-edge flex items-center justify-center overflow-hidden">
                                {clientAvatarUrl ? (
                                    <img
                                      src={clientAvatarUrl}
                                      alt={safeClientName}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.onerror = null;
                                        target.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2364748b" stroke-width="1.5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>')}`;
                                      }}
                                    />
                                ) : (
                                    <User size={30} className="text-content-muted" />
                                )}
                             </div>
                        </div>
                        <div className="pt-10 px-4 pb-4">
                            <h3 className="font-bold text-content-primary text-lg leading-tight">{safeClientName}</h3>
                            <div className="flex items-center gap-2 text-xs text-content-muted mt-1">
                                <Mail size={12} /> {demande.clients.email || 'Pas d\'email'}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-content-muted mt-1">
                                <Phone size={12} /> {demande.clients.phone || 'Pas de téléphone'}
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-edge grid grid-cols-2 gap-2 text-center">
                                <div>
                                    <div className="text-[10px] text-content-muted uppercase tracking-wider">Score Remb.</div>
                                    <div className="text-status-success font-bold">{demande.clients.tauxRemboursement ?? 0}%</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-content-muted uppercase tracking-wider">En cours</div>
                                    <div className="text-content-primary font-bold text-xs">{formatMoney(demande.clients.creditTotal ?? 0)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Objet Credit Card */}
                    <div className="bg-surface rounded-xl p-4 border border-edge">
                         <div className="flex items-center gap-2 mb-2 text-status-warning font-semibold text-sm">
                             <Briefcase size={14} /> Objet du crédit
                         </div>
                         <p className="text-content-secondary text-sm leading-relaxed italic">
                             "{escapeHtml(demande.objetCredit)}"
                         </p>
                    </div>

                    {/* Solvency Analysis Card (Dynamic) */}
                    <div className="bg-surface rounded-xl p-4 border border-edge">
                        <div className="flex items-center justify-between mb-3">
                             <div className="flex items-center gap-2 text-content-secondary font-semibold text-sm">
                                 <TrendingUp size={14} className={solvencyColor} /> Score Solvabilité
                             </div>
                             <span className={`text-xl font-bold ${solvencyColor}`}>{solvencyScore}/100</span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-surface-elevated/50 rounded-full h-2 mb-3">
                            <div 
                                className={`h-2 rounded-full transition-all duration-1000 ${
                                    solvencyScore >= 70 ? 'bg-status-success' : 
                                    solvencyScore >= 40 ? 'bg-status-warning' : 'bg-status-danger'
                                }`} 
                                style={{ width: `${solvencyScore}%` }}
                            ></div>
                        </div>

                        <p className="text-xs text-content-muted leading-relaxed">
                            {solvencyAnalysis || "Analyse en cours..."}
                        </p>
                    </div>
                </div>

                {/* RIGHT: Request Details & Verification */}
                <div className="md:col-span-2 space-y-4">
                     {/* Details Grid */}
                     <div className="bg-surface/50 rounded-xl p-4 border border-edge">
                        <h4 className="text-sm font-semibold text-content-secondary mb-3 uppercase tracking-wide flex items-center gap-2">
                             <LayoutDashboard size={14} /> Caractéristiques
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-2">
                            <div>
                                <div className="text-xs text-content-muted mb-1">Date Demande</div>
                                <div className="text-sm text-content-primary font-medium flex items-center gap-1">
                                    <Calendar size={12} className="text-content-muted" />
                                    {new Date(demande.createdAt || demande.dateDemande).toLocaleDateString('fr-FR')}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-content-muted mb-1">Durée</div>
                                <div className="text-sm text-content-primary font-medium">
                                    {demande.dureeValeur} <span className="text-content-muted lowercase">
                                        {['Jour', 'day', 'Day', 'JOUR', 'DAY'].includes(demande.dureeUnite)
                                            ? (demande.dureeValeur === 1 ? 'jour' : 'jours') :
                                         ['Semaine', 'week', 'Week', 'SEMAINE', 'WEEK'].includes(demande.dureeUnite)
                                            ? (demande.dureeValeur === 1 ? 'semaine' : 'semaines') :
                                         ['Mois', 'month', 'Month', 'MOIS', 'MONTH'].includes(demande.dureeUnite)
                                            ? 'mois' : demande.dureeUnite}
                                    </span>
                                </div>
                            </div>
                             <div>
                                <div className="text-xs text-content-muted mb-1">Nb Échéances</div>
                                <div className="text-sm text-content-primary font-medium">
                                    {nombreEcheancesCalc} <span className="text-content-muted text-xs">
                                        ({demande.frequenceRemboursement === 'DAILY' ? 'Journalier' : 
                                          demande.frequenceRemboursement === 'WEEKLY' ? 'Hebdomadaire' : 
                                          demande.frequenceRemboursement === 'MONTHLY' ? 'Mensuel' : 
                                          demande.frequenceRemboursement})
                                    </span>
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-content-muted mb-1">Taux Intérêt</div>
                                <div className="text-sm text-content-primary font-medium">{demande.tauxInteret}%</div>
                            </div>
                            <div>
                                <div className="text-xs text-content-muted mb-1">Type Crédit</div>
                                <div className="text-sm text-content-primary font-medium truncate">
                                    {demande.typeCredit === 'PERSONAL' ? 'Personnel' : 
                                     demande.typeCredit === 'BUSINESS' ? 'Business' : 
                                     (demande.typeCredit || 'Standard')}
                                </div>
                            </div>
                        </div>
                     </div>

                     {/* Enquêtes Section (Compact) */}
                     {enquetes.length > 0 && (
                         <div className="bg-surface/50 rounded-xl border border-edge overflow-hidden">
                             <div className="p-3 bg-surface/80 border-b border-edge flex justify-between items-center">
                                 <h4 className="text-sm font-semibold text-status-info flex items-center gap-2">
                                     <Shield size={14} /> Vérification Terrain ({enquetes.length})
                                 </h4>
                             </div>
                             
                             <div className="divide-y divide-edge/50">
                                 {enquetes.map((enquete, idx) => (
                                     <div key={enquete.id || idx} className="p-3 hover:bg-surface-elevated/30 transition-colors">
                                         <div 
                                            className="flex items-center justify-between cursor-pointer"
                                            onClick={() => setExpandedEnquete(expandedEnquete === (enquete.id || idx) ? null : (enquete.id || idx))}
                                         >
                                             <div className="flex items-center gap-3">
                                                 <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                                     (enquete.statut || '').toLowerCase().includes('appro') ? 'bg-status-success-bg text-status-success' : 'bg-surface-subtle/20 text-content-muted'
                                                 }`}>
                                                     <Shield size={14} />
                                                 </div>
                                                 <div>
                                                     <div className="text-sm text-content-primary font-medium">Enquête #{enquetes.length - idx}</div>
                                                     <div className="text-[10px] text-content-muted">
                                                         {new Date(enquete.createdAt).toLocaleDateString()} - Agent {enquete.createdByName || 'Terrain'}
                                                     </div>
                                                 </div>
                                             </div>
                                             {expandedEnquete === (enquete.id || idx) ? <ChevronUp size={16} className="text-content-muted" /> : <ChevronDown size={16} className="text-content-muted" />}
                                         </div>
                                         
                                         {/* Enhanced Expanded View - RESTORED FULL DETAILS */}
                                         {expandedEnquete === (enquete.id || idx) && (
                                             <div className="mt-3 pl-11 pr-2 pb-1 text-sm space-y-3 animation-fade-in border-t border-edge-subtle pt-3">
                                                 {/* Financial Grid */}
                                                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                     <div className="bg-surface-base/50 p-2 rounded border border-edge-subtle text-center">
                                                         <div className="text-xs text-content-muted">Revenus Estimés</div>
                                                         <div className="text-status-success font-bold">
                                                            {formatMoney(enquete.revenuMensuel || 0)}
                                                         </div>
                                                     </div>
                                                     <div className="bg-surface-base/50 p-2 rounded border border-edge-subtle text-center">
                                                         <div className="text-xs text-content-muted">Charges</div>
                                                         <div className="text-content-primary font-bold">
                                                             {formatMoney(enquete.chargesMensuelles || 0)}
                                                         </div>
                                                     </div>
                                                     <div className="bg-surface-base/50 p-2 rounded border border-edge-subtle text-center">
                                                         <div className="text-xs text-content-muted">Capacité Remb.</div>
                                                         <div className="text-status-info font-bold">
                                                             {formatMoney(
                                                                 (enquete.capaciteRemboursement) 
                                                                 ?? Math.max(0, (enquete.revenuMensuel || 0) - (enquete.chargesMensuelles || 0))
                                                             )}
                                                         </div>
                                                     </div>
                                                 </div>

                                                 {/* Activity Details */}
                                                 <div className="grid md:grid-cols-2 gap-4 text-xs">
                                                     <div className="space-y-2">
                                                         <div>
                                                             <span className="text-content-muted">Activité:</span>{' '}
                                                             <span className="text-content-primary">{enquete.typeActivite || 'N/A'}</span>
                                                         </div>
                                                         <div>
                                                             <span className="text-content-muted">Catégorie:</span>{' '}
                                                             <span className="text-status-warning">{enquete.categorieActivite || 'N/A'}</span>
                                                         </div>
                                                          <div>
                                                             <span className="text-content-muted">Ancienneté:</span>{' '}
                                                             <span className="text-content-primary">{enquete.ancienneteActivite} mois</span>
                                                         </div>
                                                     </div>
                                                     <div className="space-y-2">
                                                          <div>
                                                             <span className="text-content-muted">Habitation:</span>{' '}
                                                             <span className="text-content-primary">{enquete.typeHabitation || 'N/A'}</span>
                                                         </div>
                                                         <div>
                                                             <span className="text-content-muted">Pers. à charge:</span>{' '}
                                                             <span className="text-content-primary">{enquete.personnesCharge ?? 0}</span>
                                                         </div>
                                                         <div>
                                                             <span className="text-content-muted">Autres prêts:</span>{' '}
                                                             <span className="text-content-primary">{formatMoney(enquete.autrePrets || 0)}</span>
                                                         </div>
                                                     </div>
                                                 </div>

                                                 {/* Analysis & Comments - RESTORED EVALUATION */}
                                                 <div className="space-y-2">
                                                     {enquete.evaluationActivite && (
                                                         <div className="bg-surface-base/50 p-3 rounded border border-edge-subtle">
                                                             <span className="text-content-muted block mb-1 text-xs uppercase font-semibold flex items-center gap-2">
                                                                <Briefcase size={12} className="text-status-warning" /> Analyse de l'Activité
                                                             </span>
                                                             <p className="text-content-secondary text-sm leading-relaxed">
                                                                 {enquete.evaluationActivite}
                                                             </p>
                                                         </div>
                                                     )}
                                                     
                                                     <div className="bg-surface-base/50 p-3 rounded border border-edge-subtle">
                                                         <span className="text-content-muted block mb-1 text-xs uppercase font-semibold flex items-center gap-2">
                                                            <MessageSquare size={12} className="text-status-info" /> Avis / Recommandation
                                                         </span>
                                                         <p className="text-content-primary italic text-sm">
                                                             "{enquete.recommandation || enquete.observations || 'Aucune observation'}"
                                                         </p>
                                                     </div>
                                                 </div>
                                                 
                                                 {/* Agent */}
                                                 {enquete.createdBy && (
                                                     <div className="flex items-center gap-2 justify-end text-xs text-content-muted">
                                                         <UserCheck size={12} />
                                                         Vérifié par {enquete.createdByName || 'Agent Terrain'}
                                                     </div>
                                                 )}
                                             </div>
                                         )}
                                     </div>
                                 ))}
                             </div>
                         </div>
                     )}

                     {/* Workflow Timeline (Collapsed by default logic if needed, but keeping it visible as requested) */}
                     {/* We can make it compact */}
                     <div className="bg-surface/30 rounded-xl p-4 border border-edge">
                         <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-content-secondary">
                             <Clock size={14} className="text-status-warning" /> Historique
                         </div>
                         <CreditTimeline demandeId={demande.id} compact />
                     </div>
                </div>
            </div>

            {/* ACTION AREA - Contextual Forms */}
            {showActions && action && (
                <div className="bg-surface rounded-xl p-4 border border-edge-strong shadow-lg animate-in fade-in slide-in-from-bottom-4">
                    {action === 'approve' ? (
                        <div className="space-y-4">
                            <h3 className="font-bold text-status-success flex items-center gap-2">
                                <CheckCircle size={18} /> Finaliser l'approbation
                            </h3>
                            
                            <textarea
                                value={commentaire}
                                onChange={(e) => setCommentaire(e.target.value)}
                                className="w-full bg-surface-base border border-edge rounded-lg p-3 text-content-primary text-sm focus:ring-2 focus:ring-status-success outline-none"
                                rows={2}
                                placeholder="Ajouter une note d'approbation (optionnel)..."
                            />

                            <div className="flex gap-4 items-start bg-surface-base/50 p-3 rounded-lg border border-edge-subtle">
                                <input
                                  type="checkbox"
                                  checked={scheduledDisbursement}
                                  onChange={(e) => setScheduledDisbursement(e.target.checked)}
                                  className="mt-1 w-4 h-4 rounded border-edge-strong bg-surface text-status-success focus:ring-status-success"
                                />
                                <div className="flex-1">
                                    <span className="text-sm font-medium text-content-primary block">Programmer le décaissement automatique</span>
                                    {scheduledDisbursement && (
                                        <input
                                            type="date"
                                            value={disbursementDate}
                                            onChange={(e) => setDisbursementDate(e.target.value)}
                                            min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                                            className="mt-2 bg-surface border border-edge-strong rounded px-2 py-1 text-content-primary text-sm w-full sm:w-auto"
                                            required
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <h3 className="font-bold text-status-danger flex items-center gap-2">
                                <XCircle size={18} /> Motiver le rejet
                            </h3>
                            <textarea
                                value={commentaire}
                                onChange={(e) => setCommentaire(e.target.value)}
                                className="w-full bg-surface-base border border-status-danger/30 rounded-lg p-3 text-content-primary text-sm focus:ring-2 focus:ring-status-danger outline-none"
                                rows={2}
                                placeholder="Raison du rejet (Obligatoire)..."
                            />
                            {/* Refund option if fees paid */}
                            {demande.fraisEngagementPayes && demande.montantFraisEngagement && demande.montantFraisEngagement > 0 && (
                                <div className="bg-status-warning-bg p-3 rounded-lg border border-status-warning/30 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-status-warning flex items-center gap-2">
                                            <Wallet size={16} /> Remboursement des frais
                                        </label>
                                        <span className="text-xs text-content-muted">
                                            Payés: {formatMoney(demande.montantFraisEngagement)}
                                        </span>
                                    </div>

                                    {/* Quick selection buttons */}
                                    <div className="grid grid-cols-4 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setReimbursementAmount('')}
                                            className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                                                reimbursementAmount === ''
                                                    ? 'bg-surface-elevated border-edge-strong text-content-primary'
                                                    : 'bg-surface/50 border-edge text-content-muted hover:bg-surface-elevated'
                                            }`}
                                        >
                                            Aucun
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReimbursementAmount(String(Math.round(demande.montantFraisEngagement! * 0.5)))}
                                            className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                                                reimbursementAmount === String(Math.round(demande.montantFraisEngagement! * 0.5))
                                                    ? 'bg-status-warning-bg border-status-warning text-status-warning'
                                                    : 'bg-surface/50 border-edge text-content-muted hover:bg-surface-elevated'
                                            }`}
                                        >
                                            50%
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReimbursementAmount(String(demande.montantFraisEngagement))}
                                            className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                                                reimbursementAmount === String(demande.montantFraisEngagement)
                                                    ? 'bg-status-success-bg border-status-success text-status-success'
                                                    : 'bg-surface/50 border-edge text-content-muted hover:bg-surface-elevated'
                                            }`}
                                        >
                                            100%
                                        </button>
                                        <input
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={reimbursementAmount}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value.replace(/[^0-9]/g, ''); setReimbursementAmount(v); }}
                                            className="w-full bg-surface-base border border-edge-strong rounded-lg px-2 py-2 text-content-primary text-xs text-center focus:ring-1 focus:ring-status-warning focus:border-status-warning outline-none"
                                            placeholder="Autre"
                                        />
                                    </div>

                                    {/* Summary */}
                                    {reimbursementAmount && Number(reimbursementAmount) > 0 && (
                                        <div className="flex items-center justify-between text-xs bg-surface/50 rounded p-2">
                                            <span className="text-content-muted">À rembourser:</span>
                                            <span className="text-status-success font-bold">{formatMoney(Number(reimbursementAmount))}</span>
                                        </div>
                                    )}

                                    {errors.reimbursement && (
                                        <p className="text-xs text-status-danger">{errors.reimbursement}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* === FOOTER ACTIONS === */}
        <div className="bg-surface border-t border-edge p-4 flex flex-col sm:flex-row gap-3 shrink-0">
             {showActions ? (
                !action ? (
                    canApproveCredits ? (
                        <>
                            <button
                                onClick={() => setAction('reject')}
                                disabled={loading}
                                className="flex-1 px-4 py-2.5 bg-surface-elevated hover:bg-status-danger/90 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2"
                            >
                                <XCircle size={18} /> Rejeter
                            </button>
                            <button
                                onClick={() => setAction('approve')}
                                disabled={loading}
                                className="flex-1 px-4 py-2.5 bg-status-success hover:bg-status-success text-white rounded-lg font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-status-success/20"
                            >
                                <CheckCircle size={18} /> Approuver le crédit
                            </button>
                        </>
                    ) : (
                         <div className="w-full text-center text-content-muted text-sm py-2">
                             Modération uniquement (Permissions insuffisantes)
                         </div>
                    )
                ) : (
                    <>
                        <button
                            onClick={handleCancel}
                            className="px-6 py-2.5 bg-surface-elevated text-content-primary rounded-lg font-medium hover:bg-surface-subtle transition"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleSubmitAction}
                            disabled={loading}
                            className={`flex-1 px-4 py-2.5 ${
                                action === 'approve' ? 'bg-status-success hover:bg-status-success' : 'bg-status-danger hover:bg-status-danger'
                            } text-content-primary rounded-lg font-bold transition flex items-center justify-center gap-2`}
                        >
                            {loading && <Loader2 size={16} className="animate-spin" />}
                            Confirmer {action === 'approve' ? 'Approbation' : 'Rejet'}
                        </button>
                    </>
                )
             ) : (
                <div className="flex flex-col gap-2 w-full">
                    {/* Warning: fees need to be repaid before reevaluation */}
                    {feesNeedRepayment && isRejected && !isDefinitivelyRejected && (
                        <div className="bg-status-warning-bg border border-status-warning/30 rounded-lg p-2 text-center">
                            <p className="text-xs text-status-warning flex items-center justify-center gap-2">
                                <AlertCircle size={14} />
                                Les frais ont été remboursés. Pour demander une réévaluation, le client doit d'abord repayer les frais.
                            </p>
                        </div>
                    )}
                    {/* Info: refund already in progress */}
                    {hasRefundInProgress && (
                        <div className="bg-status-info-bg border border-status-info/30 rounded-lg p-2 text-center">
                            <p className="text-xs text-status-info flex items-center justify-center gap-2">
                                <Wallet size={14} />
                                Remboursement de {formatMoney(existingRefund?.montantRemboursable || 0)} en cours de traitement
                            </p>
                        </div>
                    )}
                    <div className="flex gap-3">
                        {canInitiateRefund && (
                            <button
                                onClick={() => setShowRefundModal(true)}
                                className="flex-1 px-4 py-2.5 bg-status-warning hover:bg-status-warning text-white rounded-lg font-bold transition flex items-center justify-center gap-2"
                            >
                                <Wallet size={18} /> Rembourser les frais
                            </button>
                        )}
                        {canRequestReevaluation && (
                            <button
                                onClick={() => setShowReevaluationModal(true)}
                                className="flex-1 px-4 py-2.5 bg-status-info hover:bg-status-info text-white rounded-lg font-bold transition flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={18} /> Réévaluation
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className={`${canRequestReevaluation || canInitiateRefund ? 'px-6' : 'flex-1'} py-2.5 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg font-medium transition`}
                        >
                            {canRequestReevaluation || canInitiateRefund ? 'Fermer' : 'Fermer le dossier'}
                        </button>
                    </div>
                </div>
             )}
        </div>
      </div>
      
      {/* Modals & Dialogs */}
      <ConfirmDialog
        isOpen={showConfirmApprove}
        title="Confirmer l'approbation"
        message={`Approuver le crédit de ${formatMoney(montantBase)} pour ${safeClientName} ?`}
        confirmText="Oui, Approuver"
        cancelText="Annuler"
        onConfirm={handleApprove}
        onClose={() => setShowConfirmApprove(false)}
        variant="success"
      />

      <ConfirmDialog
        isOpen={showConfirmReject}
        title="Confirmer le rejet"
        message="Êtes-vous sûr de vouloir rejeter cette demande ?"
        confirmText="Oui, Rejeter"
        cancelText="Annuler"
        onConfirm={handleReject}
        onClose={() => setShowConfirmReject(false)}
        variant="danger"
      />

      {showReevaluationModal && (
        <ReevaluationModal
          demande={{
            id: demande.id,
            numeroDemande: demande.numeroDemande,
            clientId: demande.clientId,
            montantDemande: String(demande.montantDemande),
            motifRejet: demande.motifRejet,
            dureeValeur: demande.dureeValeur,
            dureeUnite: demande.dureeUnite,
          }}
          isOpen={showReevaluationModal}
          onClose={() => setShowReevaluationModal(false)}
          onSuccess={() => {
            setShowReevaluationModal(false);
            toast.success('Réévaluation soumise');
            onSuccess();
          }}
        />
      )}

      {/* Refund Modal for already rejected demandes */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-surface rounded-xl border border-edge w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-edge flex justify-between items-center">
              <h3 className="text-lg font-bold text-content-primary flex items-center gap-2">
                <Wallet className="text-status-warning" size={20} />
                Rembourser les frais
              </h3>
              <button
                onClick={() => { setShowRefundModal(false); setRefundAmount(''); }}
                className="p-1.5 hover:bg-surface-elevated rounded-lg transition"
              >
                <X className="text-content-muted" size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Info */}
              <div className="bg-status-warning-bg border border-status-warning/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="text-status-warning flex-shrink-0 mt-0.5" size={16} />
                  <div className="text-sm">
                    <p className="text-status-warning font-medium">Demande rejetée</p>
                    <p className="text-content-secondary text-xs mt-1">
                      Le client peut être remboursé intégralement ou partiellement.
                      Le paiement pourra se faire en espèces, Mobile Money ou virement.
                    </p>
                  </div>
                </div>
              </div>

              {/* Amount info */}
              <div className="bg-surface-elevated/50 rounded-lg p-3 flex justify-between items-center">
                <span className="text-content-muted text-sm">Frais payés</span>
                <span className="text-content-primary font-bold">{formatMoney(demande.montantFraisEngagement || 0)}</span>
              </div>

              {/* Quick selection buttons */}
              <div className="space-y-2">
                <label className="text-xs text-content-muted">Montant à rembourser</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundAmount(String(Math.round((demande.montantFraisEngagement || 0) * 0.5)))}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                      refundAmount === String(Math.round((demande.montantFraisEngagement || 0) * 0.5))
                        ? 'bg-status-warning-bg border-status-warning text-status-warning'
                        : 'bg-surface border-edge-strong text-content-secondary hover:bg-surface-elevated'
                    }`}
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundAmount(String(demande.montantFraisEngagement || 0))}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                      refundAmount === String(demande.montantFraisEngagement || 0)
                        ? 'bg-status-success-bg border-status-success text-status-success'
                        : 'bg-surface border-edge-strong text-content-secondary hover:bg-surface-elevated'
                    }`}
                  >
                    100%
                  </button>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={refundAmount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value.replace(/[^0-9]/g, ''); setRefundAmount(v); }}
                    className="w-full bg-surface-base border border-edge-strong rounded-lg px-3 py-2.5 text-content-primary text-sm text-center focus:ring-1 focus:ring-status-warning focus:border-status-warning outline-none"
                    placeholder="Autre"
                  />
                </div>
              </div>

              {/* Summary */}
              {refundAmount && Number(refundAmount) > 0 && (
                <div className="bg-status-success-bg border border-status-success/30 rounded-lg p-3 flex justify-between items-center">
                  <span className="text-content-secondary text-sm">À rembourser</span>
                  <span className="text-status-success font-bold text-lg">{formatMoney(Number(refundAmount))}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-edge flex gap-3 justify-end">
              <button
                onClick={() => { setShowRefundModal(false); setRefundAmount(''); }}
                className="px-4 py-2 text-content-secondary hover:bg-surface-elevated rounded-lg transition"
                disabled={refundLoading}
              >
                Annuler
              </button>
              <button
                onClick={handleInitiateRefund}
                disabled={refundLoading || !refundAmount || Number(refundAmount) <= 0}
                className="px-6 py-2 bg-status-warning hover:bg-status-warning disabled:bg-surface-elevated disabled:text-content-muted text-white font-medium rounded-lg transition flex items-center gap-2"
              >
                {refundLoading ? <Loader2 className="animate-spin" size={16} /> : <DollarSign size={16} />}
                Créer la demande
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
