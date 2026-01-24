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
  numero_demande: string;
  client_id: string;
  montant_demande: number;
  montant_approuve?: number | null;
  // V2 duration fields
  duree_valeur: number;
  duree_unite: 'Jour' | 'Semaine' | 'Mois';
  nombre_echeances?: number;
  taux_interet: number;
  type_credit: string | null;
  objet_credit: string;
  statut: string;
  motif_rejet?: string;
  revenus_mensuels?: number;
  type_revenu?: string;
  revenu_journalier?: number;
  charges_mensuelles?: number;
  capacite_remboursement?: number;
  frequence_remboursement: string;
  date_demande: string;
  created_at?: string;
  frais_engagement_payes?: boolean;
  montant_frais_engagement?: number;
  clients: {
    nom: string;
    prenom?: string;
    email?: string;
    phone: string;
    taux_remboursement?: number;
    credit_total?: number;
    photo_url?: string;
  };
  deleted_at?: string | null;
}

interface CreditApprovalModalProps {
  demande: Demande;
  onClose: () => void;
  onSuccess: () => void;
  onManageReevaluation?: () => void;
}

interface Guarantee {
  type_garantie: string;
  description: string;
  valeur_estimee: string;
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
         .then(res => res.json())
         .then(data => {
           const enquetesList = Array.isArray(data) ? data : (data ? [data] : []);
           setEnquetes(enquetesList);
           // Auto-expand the latest enquete for better UX
           if (enquetesList.length > 0 && enquetesList[0]?.id) {
             setExpandedEnquete(enquetesList[0].id);
           }
         })
         .catch(err => console.warn("No enquete found", err));
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
  const feesNeedRepayment = hasRefundPaid && !demande.frais_engagement_payes;

  // Can request reevaluation if:
  // - rejected (not definitively)
  // - eligible
  // - fees are paid (or never refunded)
  const canRequestReevaluation = isRejected && !isDefinitivelyRejected && isEligibleForReevaluation && !feesNeedRepayment;

  // Can initiate refund if:
  // - rejected
  // - fees were paid
  // - no refund already exists (or was cancelled/rejected)
  const canInitiateRefund = isRejected && demande.frais_engagement_payes &&
                            demande.montant_frais_engagement && demande.montant_frais_engagement > 0 &&
                            !hasAnyRefund;

  const showActions = (!isFinished && !isRejected && !isCancelled) || isReevaluating;

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
    const base = demande.montant_demande;
    const rev = demande.revenus_mensuels ?? 0;
    
    // V2: Use duree_valeur and duree_unite
    const dureeValeur = demande.duree_valeur || 0;
    const dureeUnite = demande.duree_unite || 'Mois';
    const frequence = demande.frequence_remboursement;

    // Calculate number of payments
    const nombreEcheances = demande.nombre_echeances || calculerNombreEcheances(frequence, dureeValeur, dureeUnite);

    // Simple interest calculation (matching CreditRequestForm)
    const total = base * (1 + demande.taux_interet / 100);
    const mens = nombreEcheances > 0 ? total / nombreEcheances : 0;
    
    // Calculate debt ratio (convert to monthly equivalent)
    let montantMensuelEquivalent = mens;
    if (frequence === 'Journalier') {
      montantMensuelEquivalent = mens * 30;
    } else if (frequence === 'Hebdomadaire') {
      montantMensuelEquivalent = mens * 4;
    } else if (frequence === 'Bimensuel') {
      montantMensuelEquivalent = mens * 2;
    } else if (frequence === 'Trimestriel') {
      montantMensuelEquivalent = mens / 3;
    }
    const endettement = rev > 0 ? (montantMensuelEquivalent / rev) * 100 : 0;

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
    const revenu = demande.revenus_mensuels ?? 0;
    const charges = demande.charges_mensuelles ?? 0; // Note: charges might need to come from survey if not in demande
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
    const reliability = demande.clients.taux_remboursement ?? 0;
    if (reliability >= 90) {
        score += 30;
        analysis.push("Historique client excellent.");
    } else if (reliability >= 50) {
        score += 10;
    } else {
        analysis.push("Historique de remboursement fragile.");
    }

    // Determine Color & Verbal Dictum
    let color = 'text-red-500';
    if (score >= 70) color = 'text-emerald-500';
    else if (score >= 40) color = 'text-amber-500';

    return {
        solvencyScore: score,
        solvencyColor: color,
        solvencyAnalysis: analysis.join(" ")
    };
  }, [tauxEndettement, demande.revenus_mensuels, demande.charges_mensuelles, mensualite, demande.clients.taux_remboursement]);

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

  const clientAvatarUrl = useMemo(() => getAvatarUrl(demande.clients.photo_url), [demande.clients.photo_url]);

  const addGuarantee = useCallback(() => {
    setGuarantees(prev => [...prev, { type_garantie: 'Hypothèque', description: '', valeur_estimee: '' }]);
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
         const max = Number(demande.montant_frais_engagement || 0);
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
      if (g.valeur_estimee) {
        const valeur = parseFloat(g.valeur_estimee);
        const validation = validateAmount(valeur, { min: 0, max: VALIDATION_LIMITS.MAX_CREDIT });
        if (!validation.isValid) {
          newErrors[`guarantee_${index}`] = validation.error || 'Valeur invalide';
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [action, commentaire, guarantees, reimbursementAmount, demande.montant_frais_engagement, scheduledDisbursement, disbursementDate]);

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
        : 'Demande de crédit rejetée avec succès.';
      
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
    const maxAmount = demande.montant_frais_engagement || 0;

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
          motif: demande.motif_rejet || 'Remboursement des frais suite au rejet'
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
  }, [demande.id, demande.montant_frais_engagement, demande.motif_rejet, refundAmount, onSuccess]);

  const getEndettementColor = useCallback((taux: number) => {
    if (taux > 50) return 'text-red-400';
    if (taux > 40) return 'text-amber-400';
    return 'text-emerald-400';
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
                        {/* === HEADER COMPACT === */}
        {/* === HEADER COMPACT === */}
        <div className="bg-slate-800/80 border-b border-slate-700 p-4 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Analyse Crédit
                        <Badge value={demande.statut} size="sm" />
                    </h2>
                    <span className="text-slate-400 text-xs font-mono">{demande.numero_demande}</span>
                </div>
                {/* Status Fees - Compact Pill */}
                <div className={`hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
                    demande.frais_engagement_payes
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                    {demande.frais_engagement_payes ? (
                        <><CheckCircle size={12} /> Frais Payés: {formatMoney(demande.montant_frais_engagement || 0)}</>
                    ) : (
                        <><AlertCircle size={12} /> Frais dus: {formatMoney(demande.montant_frais_engagement || 0)}</>
                    )}
                </div>
                {/* Refund Status Pill */}
                {existingRefund && (
                    <div className={`hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
                        existingRefund.statut === 'PAID'
                            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                            : 'bg-purple-500/10 border-purple-500/30 text-purple-400'
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
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700 transition"
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
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 hover:border-blue-500/50 transition-colors">
                    <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                        <DollarSign size={14} className="text-blue-400" /> Montant Demandé
                    </div>
                    <div className="text-lg md:text-xl font-bold text-white">{formatMoney(demande.montant_demande)}</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 hover:border-purple-500/50 transition-colors">
                    <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                        <Wallet size={14} className="text-purple-400" /> Mensualité Est
                    </div>
                    <div className="text-lg md:text-xl font-bold text-white">{formatMoney(mensualite)}</div>
                    <div className="text-[10px] text-slate-500">
                        {demande.frequence_remboursement === 'DAILY' ? 'Journalier' : 
                         demande.frequence_remboursement === 'WEEKLY' ? 'Hebdomadaire' : 
                         demande.frequence_remboursement === 'MONTHLY' ? 'Mensuel' : 
                         demande.frequence_remboursement}
                    </div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 hover:border-emerald-500/50 transition-colors">
                    <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                        <PiggyBank size={14} className="text-emerald-400" /> Revenus Net
                    </div>
                    <div className="text-lg md:text-xl font-bold text-white">{formatMoney(demande.revenus_mensuels ?? 0)}</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 hover:border-amber-500/50 transition-colors">
                    <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                        <Percent size={14} className="text-amber-400" /> Endettement
                    </div>
                    <div className={`text-lg md:text-xl font-bold ${getEndettementColor(tauxEndettement)}`}>
                        {tauxEndettement.toFixed(1)}%
                    </div>
                    {tauxEndettement > 40 && <div className="text-[10px] text-amber-500 font-medium">Attention</div>}
                </div>
            </div>

            {/* 2. MAIN GRID (Client + Details) */}
            <div className="grid md:grid-cols-3 gap-5">
                {/* LEFT: Client Profile */}
                <div className="md:col-span-1 space-y-3">
                    <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                        <div className="h-20 bg-gradient-to-r from-blue-900 to-slate-900 relative">
                             <div className="absolute -bottom-8 left-4 w-16 h-16 rounded-full bg-slate-800 border-4 border-slate-800 flex items-center justify-center overflow-hidden">
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
                                    <User size={30} className="text-slate-500" />
                                )}
                             </div>
                        </div>
                        <div className="pt-10 px-4 pb-4">
                            <h3 className="font-bold text-white text-lg leading-tight">{safeClientName}</h3>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                                <Mail size={12} /> {demande.clients.email || 'Pas d\'email'}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                                <Phone size={12} /> {demande.clients.phone || 'Pas de téléphone'}
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-2 gap-2 text-center">
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">Score Remb.</div>
                                    <div className="text-emerald-400 font-bold">{demande.clients.taux_remboursement ?? 0}%</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">En cours</div>
                                    <div className="text-white font-bold text-xs">{formatMoney(demande.clients.credit_total ?? 0)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Objet Credit Card */}
                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                         <div className="flex items-center gap-2 mb-2 text-amber-400 font-semibold text-sm">
                             <Briefcase size={14} /> Objet du crédit
                         </div>
                         <p className="text-slate-300 text-sm leading-relaxed italic">
                             "{escapeHtml(demande.objet_credit)}"
                         </p>
                    </div>

                    {/* Solvency Analysis Card (Dynamic) */}
                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                        <div className="flex items-center justify-between mb-3">
                             <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
                                 <TrendingUp size={14} className={solvencyColor} /> Score Solvabilité
                             </div>
                             <span className={`text-xl font-bold ${solvencyColor}`}>{solvencyScore}/100</span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-slate-700/50 rounded-full h-2 mb-3">
                            <div 
                                className={`h-2 rounded-full transition-all duration-1000 ${
                                    solvencyScore >= 70 ? 'bg-emerald-500' : 
                                    solvencyScore >= 40 ? 'bg-amber-500' : 'bg-red-500'
                                }`} 
                                style={{ width: `${solvencyScore}%` }}
                            ></div>
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed">
                            {solvencyAnalysis || "Analyse en cours..."}
                        </p>
                    </div>
                </div>

                {/* RIGHT: Request Details & Verification */}
                <div className="md:col-span-2 space-y-4">
                     {/* Details Grid */}
                     <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                        <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide flex items-center gap-2">
                             <LayoutDashboard size={14} /> Caractéristiques
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-2">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Date Demande</div>
                                <div className="text-sm text-white font-medium flex items-center gap-1">
                                    <Calendar size={12} className="text-slate-600" />
                                    {new Date(demande.created_at || demande.date_demande).toLocaleDateString('fr-FR')}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Durée</div>
                                <div className="text-sm text-white font-medium">
                                    {demande.duree_valeur} <span className="text-slate-400 lowercase">
                                        {['Jour', 'day', 'Day', 'JOUR', 'DAY'].includes(demande.duree_unite)
                                            ? (demande.duree_valeur === 1 ? 'jour' : 'jours') :
                                         ['Semaine', 'week', 'Week', 'SEMAINE', 'WEEK'].includes(demande.duree_unite)
                                            ? (demande.duree_valeur === 1 ? 'semaine' : 'semaines') :
                                         ['Mois', 'month', 'Month', 'MOIS', 'MONTH'].includes(demande.duree_unite)
                                            ? 'mois' : demande.duree_unite}
                                    </span>
                                </div>
                            </div>
                             <div>
                                <div className="text-xs text-slate-500 mb-1">Nb Échéances</div>
                                <div className="text-sm text-white font-medium">
                                    {nombreEcheancesCalc} <span className="text-slate-400 text-xs">
                                        ({demande.frequence_remboursement === 'DAILY' ? 'Journalier' : 
                                          demande.frequence_remboursement === 'WEEKLY' ? 'Hebdomadaire' : 
                                          demande.frequence_remboursement === 'MONTHLY' ? 'Mensuel' : 
                                          demande.frequence_remboursement})
                                    </span>
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Taux Intérêt</div>
                                <div className="text-sm text-white font-medium">{demande.taux_interet}%</div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Type Crédit</div>
                                <div className="text-sm text-white font-medium truncate">
                                    {demande.type_credit === 'PERSONAL' ? 'Personnel' : 
                                     demande.type_credit === 'BUSINESS' ? 'Business' : 
                                     (demande.type_credit || 'Standard')}
                                </div>
                            </div>
                        </div>
                     </div>

                     {/* Enquêtes Section (Compact) */}
                     {enquetes.length > 0 && (
                         <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                             <div className="p-3 bg-slate-800/80 border-b border-slate-700 flex justify-between items-center">
                                 <h4 className="text-sm font-semibold text-purple-400 flex items-center gap-2">
                                     <Shield size={14} /> Vérification Terrain ({enquetes.length})
                                 </h4>
                             </div>
                             
                             <div className="divide-y divide-slate-700/50">
                                 {enquetes.map((enquete, idx) => (
                                     <div key={enquete.id || idx} className="p-3 hover:bg-slate-700/30 transition-colors">
                                         <div 
                                            className="flex items-center justify-between cursor-pointer"
                                            onClick={() => setExpandedEnquete(expandedEnquete === (enquete.id || idx) ? null : (enquete.id || idx))}
                                         >
                                             <div className="flex items-center gap-3">
                                                 <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                                     (enquete.statut || '').toLowerCase().includes('appro') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/20 text-slate-400'
                                                 }`}>
                                                     <Shield size={14} />
                                                 </div>
                                                 <div>
                                                     <div className="text-sm text-white font-medium">Enquête #{enquetes.length - idx}</div>
                                                     <div className="text-[10px] text-slate-400">
                                                         {new Date(enquete.created_at).toLocaleDateString()} - Agent {enquete.created_by_name || 'Terrain'}
                                                     </div>
                                                 </div>
                                             </div>
                                             {expandedEnquete === (enquete.id || idx) ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                                         </div>
                                         
                                         {/* Enhanced Expanded View - RESTORED FULL DETAILS */}
                                         {expandedEnquete === (enquete.id || idx) && (
                                             <div className="mt-3 pl-11 pr-2 pb-1 text-sm space-y-3 animation-fade-in border-t border-slate-700/50 pt-3">
                                                 {/* Financial Grid */}
                                                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                     <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50 text-center">
                                                         <div className="text-xs text-slate-500">Revenus Estimés</div>
                                                         <div className="text-emerald-400 font-bold">
                                                            {formatMoney(enquete.revenu_mensuel || enquete.revenuMensuel || 0)}
                                                         </div>
                                                     </div>
                                                     <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50 text-center">
                                                         <div className="text-xs text-slate-500">Charges</div>
                                                         <div className="text-white font-bold">
                                                             {formatMoney(enquete.charges_mensuelles || enquete.chargesMensuelles || 0)}
                                                         </div>
                                                     </div>
                                                     <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50 text-center">
                                                         <div className="text-xs text-slate-500">Capacité Remb.</div>
                                                         <div className="text-purple-400 font-bold">
                                                             {formatMoney(
                                                                 (enquete.capacite_remboursement || enquete.capaciteRemboursement) 
                                                                 ?? Math.max(0, (enquete.revenu_mensuel || enquete.revenuMensuel || 0) - (enquete.charges_mensuelles || enquete.chargesMensuelles || 0))
                                                             )}
                                                         </div>
                                                     </div>
                                                 </div>

                                                 {/* Activity Details */}
                                                 <div className="grid md:grid-cols-2 gap-4 text-xs">
                                                     <div className="space-y-2">
                                                         <div>
                                                             <span className="text-slate-500">Activité:</span>{' '}
                                                             <span className="text-white">{enquete.type_activite || enquete.typeActivite || 'N/A'}</span>
                                                         </div>
                                                         <div>
                                                             <span className="text-slate-500">Catégorie:</span>{' '}
                                                             <span className="text-amber-400">{enquete.categorie_activite || enquete.categorieActivite || 'N/A'}</span>
                                                         </div>
                                                          <div>
                                                             <span className="text-slate-500">Ancienneté:</span>{' '}
                                                             <span className="text-white">{enquete.anciennete_activite || enquete.ancienneteActivite} mois</span>
                                                         </div>
                                                     </div>
                                                     <div className="space-y-2">
                                                          <div>
                                                             <span className="text-slate-500">Habitation:</span>{' '}
                                                             <span className="text-white">{enquete.type_habitation || enquete.typeHabitation || 'N/A'}</span>
                                                         </div>
                                                         <div>
                                                             <span className="text-slate-500">Pers. à charge:</span>{' '}
                                                             <span className="text-white">{enquete.personnes_charge ?? enquete.personnesCharge ?? 0}</span>
                                                         </div>
                                                         <div>
                                                             <span className="text-slate-500">Autres prêts:</span>{' '}
                                                             <span className="text-white">{formatMoney(enquete.autre_prets || enquete.autrePrets || 0)}</span>
                                                         </div>
                                                     </div>
                                                 </div>

                                                 {/* Analysis & Comments - RESTORED EVALUATION */}
                                                 <div className="space-y-2">
                                                     {enquete.evaluation_activite && (
                                                         <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50">
                                                             <span className="text-slate-500 block mb-1 text-xs uppercase font-semibold flex items-center gap-2">
                                                                <Briefcase size={12} className="text-amber-400" /> Analyse de l'Activité
                                                             </span>
                                                             <p className="text-slate-300 text-sm leading-relaxed">
                                                                 {enquete.evaluation_activite}
                                                             </p>
                                                         </div>
                                                     )}
                                                     
                                                     <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50">
                                                         <span className="text-slate-500 block mb-1 text-xs uppercase font-semibold flex items-center gap-2">
                                                            <MessageSquare size={12} className="text-purple-400" /> Avis / Recommandation
                                                         </span>
                                                         <p className="text-white italic text-sm">
                                                             "{enquete.recommandation || enquete.observations || 'Aucune observation'}"
                                                         </p>
                                                     </div>
                                                 </div>
                                                 
                                                 {/* Agent */}
                                                 {enquete.created_by && (
                                                     <div className="flex items-center gap-2 justify-end text-xs text-slate-500">
                                                         <UserCheck size={12} />
                                                         Vérifié par {enquete.created_by_name || 'Agent Terrain'}
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
                     <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700">
                         <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-300">
                             <Clock size={14} className="text-amber-400" /> Historique
                         </div>
                         <CreditTimeline demandeId={demande.id} compact />
                     </div>
                </div>
            </div>

            {/* ACTION AREA - Contextual Forms */}
            {showActions && action && (
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-600 shadow-lg animate-in fade-in slide-in-from-bottom-4">
                    {action === 'approve' ? (
                        <div className="space-y-4">
                            <h3 className="font-bold text-green-400 flex items-center gap-2">
                                <CheckCircle size={18} /> Finaliser l'approbation
                            </h3>
                            
                            <textarea
                                value={commentaire}
                                onChange={(e) => setCommentaire(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                rows={2}
                                placeholder="Ajouter une note d'approbation (optionnel)..."
                            />

                            <div className="flex gap-4 items-start bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                                <input
                                  type="checkbox"
                                  checked={scheduledDisbursement}
                                  onChange={(e) => setScheduledDisbursement(e.target.checked)}
                                  className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-800 text-green-600 focus:ring-green-500"
                                />
                                <div className="flex-1">
                                    <span className="text-sm font-medium text-white block">Programmer le décaissement automatique</span>
                                    {scheduledDisbursement && (
                                        <input
                                            type="date"
                                            value={disbursementDate}
                                            onChange={(e) => setDisbursementDate(e.target.value)}
                                            min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                                            className="mt-2 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm w-full sm:w-auto"
                                            required
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <h3 className="font-bold text-red-400 flex items-center gap-2">
                                <XCircle size={18} /> Motiver le rejet
                            </h3>
                            <textarea
                                value={commentaire}
                                onChange={(e) => setCommentaire(e.target.value)}
                                className="w-full bg-slate-900 border border-red-900/50 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
                                rows={2}
                                placeholder="Raison du rejet (Obligatoire)..."
                            />
                            {/* Refund option if fees paid */}
                            {demande.frais_engagement_payes && demande.montant_frais_engagement && demande.montant_frais_engagement > 0 && (
                                <div className="bg-amber-900/10 p-3 rounded-lg border border-amber-500/30 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-amber-400 flex items-center gap-2">
                                            <Wallet size={16} /> Remboursement des frais
                                        </label>
                                        <span className="text-xs text-slate-400">
                                            Payés: {formatMoney(demande.montant_frais_engagement)}
                                        </span>
                                    </div>

                                    {/* Quick selection buttons */}
                                    <div className="grid grid-cols-4 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setReimbursementAmount('')}
                                            className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                                                reimbursementAmount === ''
                                                    ? 'bg-slate-700 border-slate-500 text-white'
                                                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700'
                                            }`}
                                        >
                                            Aucun
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReimbursementAmount(String(Math.round(demande.montant_frais_engagement! * 0.5)))}
                                            className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                                                reimbursementAmount === String(Math.round(demande.montant_frais_engagement! * 0.5))
                                                    ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                                                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700'
                                            }`}
                                        >
                                            50%
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReimbursementAmount(String(demande.montant_frais_engagement))}
                                            className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                                                reimbursementAmount === String(demande.montant_frais_engagement)
                                                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700'
                                            }`}
                                        >
                                            100%
                                        </button>
                                        <input
                                            type="number"
                                            value={reimbursementAmount}
                                            onChange={(e) => setReimbursementAmount(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-white text-xs text-center focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                                            placeholder="Autre"
                                            max={demande.montant_frais_engagement}
                                        />
                                    </div>

                                    {/* Summary */}
                                    {reimbursementAmount && Number(reimbursementAmount) > 0 && (
                                        <div className="flex items-center justify-between text-xs bg-slate-800/50 rounded p-2">
                                            <span className="text-slate-400">À rembourser:</span>
                                            <span className="text-emerald-400 font-bold">{formatMoney(Number(reimbursementAmount))}</span>
                                        </div>
                                    )}

                                    {errors.reimbursement && (
                                        <p className="text-xs text-red-400">{errors.reimbursement}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* === FOOTER ACTIONS === */}
        <div className="bg-slate-800 border-t border-slate-700 p-4 flex flex-col sm:flex-row gap-3 shrink-0">
             {showActions ? (
                !action ? (
                    canApproveCredits ? (
                        <>
                            <button
                                onClick={() => setAction('reject')}
                                disabled={loading}
                                className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-red-600/90 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2"
                            >
                                <XCircle size={18} /> Rejeter
                            </button>
                            <button
                                onClick={() => setAction('approve')}
                                disabled={loading}
                                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                            >
                                <CheckCircle size={18} /> Approuver le crédit
                            </button>
                        </>
                    ) : (
                         <div className="w-full text-center text-slate-500 text-sm py-2">
                             Modération uniquement (Permissions insuffisantes)
                         </div>
                    )
                ) : (
                    <>
                        <button
                            onClick={handleCancel}
                            className="px-6 py-2.5 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-600 transition"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleSubmitAction}
                            disabled={loading}
                            className={`flex-1 px-4 py-2.5 ${
                                action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                            } text-white rounded-lg font-bold transition flex items-center justify-center gap-2`}
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
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-center">
                            <p className="text-xs text-amber-400 flex items-center justify-center gap-2">
                                <AlertCircle size={14} />
                                Les frais ont été remboursés. Pour demander une réévaluation, le client doit d'abord repayer les frais.
                            </p>
                        </div>
                    )}
                    {/* Info: refund already in progress */}
                    {hasRefundInProgress && (
                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-2 text-center">
                            <p className="text-xs text-purple-400 flex items-center justify-center gap-2">
                                <Wallet size={14} />
                                Remboursement de {formatMoney(existingRefund?.montantRemboursable || 0)} en cours de traitement
                            </p>
                        </div>
                    )}
                    <div className="flex gap-3">
                        {canInitiateRefund && (
                            <button
                                onClick={() => setShowRefundModal(true)}
                                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold transition flex items-center justify-center gap-2"
                            >
                                <Wallet size={18} /> Rembourser les frais
                            </button>
                        )}
                        {canRequestReevaluation && (
                            <button
                                onClick={() => setShowReevaluationModal(true)}
                                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={18} /> Réévaluation
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className={`${canRequestReevaluation || canInitiateRefund ? 'px-6' : 'flex-1'} py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition`}
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
            numeroDemande: demande.numero_demande,
            clientId: demande.client_id,
            montantDemande: String(demande.montant_demande),
            motifRejet: demande.motif_rejet,
            dureeValeur: demande.duree_valeur,
            dureeUnite: demande.duree_unite,
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
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Wallet className="text-amber-400" size={20} />
                Rembourser les frais
              </h3>
              <button
                onClick={() => { setShowRefundModal(false); setRefundAmount(''); }}
                className="p-1.5 hover:bg-slate-700 rounded-lg transition"
              >
                <X className="text-slate-400" size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Info */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="text-amber-400 flex-shrink-0 mt-0.5" size={16} />
                  <div className="text-sm">
                    <p className="text-amber-400 font-medium">Demande rejetée</p>
                    <p className="text-slate-300 text-xs mt-1">
                      Le client peut être remboursé intégralement ou partiellement.
                      Le paiement pourra se faire en espèces, Mobile Money ou virement.
                    </p>
                  </div>
                </div>
              </div>

              {/* Amount info */}
              <div className="bg-slate-700/50 rounded-lg p-3 flex justify-between items-center">
                <span className="text-slate-400 text-sm">Frais payés</span>
                <span className="text-white font-bold">{formatMoney(demande.montant_frais_engagement || 0)}</span>
              </div>

              {/* Quick selection buttons */}
              <div className="space-y-2">
                <label className="text-xs text-slate-400">Montant à rembourser</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundAmount(String(Math.round((demande.montant_frais_engagement || 0) * 0.5)))}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                      refundAmount === String(Math.round((demande.montant_frais_engagement || 0) * 0.5))
                        ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                        : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundAmount(String(demande.montant_frais_engagement || 0))}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                      refundAmount === String(demande.montant_frais_engagement || 0)
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    100%
                  </button>
                  <input
                    type="number"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm text-center focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    placeholder="Autre"
                    max={demande.montant_frais_engagement || 0}
                  />
                </div>
              </div>

              {/* Summary */}
              {refundAmount && Number(refundAmount) > 0 && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex justify-between items-center">
                  <span className="text-slate-300 text-sm">À rembourser</span>
                  <span className="text-emerald-400 font-bold text-lg">{formatMoney(Number(refundAmount))}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-700 flex gap-3 justify-end">
              <button
                onClick={() => { setShowRefundModal(false); setRefundAmount(''); }}
                className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition"
                disabled={refundLoading}
              >
                Annuler
              </button>
              <button
                onClick={handleInitiateRefund}
                disabled={refundLoading || !refundAmount || Number(refundAmount) <= 0}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition flex items-center gap-2"
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
