import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { X, CheckCircle, XCircle, AlertCircle, FileText, DollarSign, User, TrendingUp, Loader2, Shield, AlertTriangle, ChevronDown, ChevronUp, Briefcase, MessageSquare, UserCheck, RefreshCw, Clock } from 'lucide-react';
import { demandeCreditApi } from '../../../lib/api-client';
import { usePermissions } from '../../auth/ProtectedFeature';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney, formatClientName } from '../../../lib/format';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { ReevaluationEligibilityCheck } from './ReevaluationEligibilityCheck';
import { ReevaluationModal } from './ReevaluationModal';
import { CreditTimeline } from './CreditTimeline';

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

  const isFinished = (demande.statut.toLowerCase() === 'approuvée' || 
                      demande.statut.toLowerCase() === 'décaissée' || 
                      demande.statut.toLowerCase() === 'déboursé' ||
                      demande.statut.toLowerCase() === 'approuve' ||
                      demande.statut.toLowerCase() === 'approved');
  
  const isRejected = (demande.statut.toLowerCase() === 'rejetée' || 
                      demande.statut.toLowerCase() === 'rejete' || 
                      demande.statut.toLowerCase() === 'rejected');

  const isCancelled = (demande.statut.toLowerCase() === 'annulée' || 
                       demande.statut.toLowerCase() === 'annule' || 
                       demande.statut.toLowerCase() === 'cancelled');

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

  // Safe escaped values - Use formatClientName for consistent formatting
  const safeClientName = useMemo(() => {
    const formatted = formatClientName(demande.clients.nom, demande.clients.prenom);
    return escapeHtml(formatted);
  }, [demande.clients.nom, demande.clients.prenom]);

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
  }, [action, commentaire, guarantees, reimbursementAmount, demande.montant_frais_engagement]);

  const handleApprove = useCallback(async () => {
    setLoading(true);

    try {
      // Prepare approval data to save on the demand
      const updateData = {
        statut: 'Approuvée',
        montant_approuve: montantBase,
        // We can store guarantees/comments if the backend schema supports it, 
        // or just rely on the status change for now. 
        // Ideally, we adds fields to Demande schema for approval details, 
        // but for now we'll stick to updating the status and essentials.
        commentaire_approbation: sanitizeInput(commentaire)
      };

      await demandeCreditApi.update(demande.id, updateData);

      toast.success(`Crédit approuvé. Dossier transféré à la Commission Crédit pour décaissement.`);
      onSuccess();
    } catch (error) {
      const errorMessage = handleApiError(error, "Erreur lors de l'approbation du crédit");
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setShowConfirmApprove(false);
    }
  }, [demande, montantBase, commentaire, onSuccess]);
  
  const handleReject = useCallback(async () => {
    setLoading(true);

    try {
      const payload: any = {
        statut: 'Rejetée',
        motif_rejet: sanitizeInput(commentaire)
      };

      // Add reimbursement if entered
      if (reimbursementAmount) {
         const amount = parseFloat(reimbursementAmount);
         // Client-side validation is good, but API should also handle it.
         // We trust validateForm has prevented this call if invalid.
         payload.montantRemboursement = amount;
      }

      await demandeCreditApi.update(demande.id, payload);

      const successMessage = reimbursementAmount 
        ? `Demande rejetée. Une demande de remboursement de ${formatMoney(Number(reimbursementAmount))} a été créée pour validation.`
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

  const getEndettementColor = useCallback((taux: number) => {
    if (taux > 50) return 'text-red-400';
    if (taux > 40) return 'text-amber-400';
    return 'text-green-400';
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-modal-title"
      >
        <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center z-10">
            <div>
              <h2 id="approval-modal-title" className="text-2xl font-bold text-white">
                Analyse de Demande
              </h2>
              <p className="text-slate-400 text-sm mt-1">{demande.numero_demande}</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700 transition"
              aria-label="Fermer"
              disabled={loading}
            >
              <X size={24} />
            </button>
          </div>

          {/* ====== FEES STATUS BANNER - Above the Fold ====== */}
          <div className={`mx-6 mt-4 p-4 rounded-xl flex items-center gap-4 ${
              demande.frais_engagement_payes 
                ? 'bg-emerald-500/10 border border-emerald-500/30' 
                : 'bg-amber-500/10 border border-amber-500/30'
          }`}>
              <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                  demande.frais_engagement_payes ? 'bg-emerald-500/20' : 'bg-amber-500/20'
              }`}>
                  {demande.frais_engagement_payes ? (
                      <CheckCircle className="text-emerald-400" size={24} />
                  ) : (
                      <AlertCircle className="text-amber-400" size={24} />
                  )}
              </div>
              <div className="flex-1">
                  <h4 className={`font-bold text-sm ${
                      demande.frais_engagement_payes ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                      {demande.frais_engagement_payes ? 'Frais de Dossier Payés ✅' : 'Frais de Dossier en Attente ⚠️'}
                  </h4>
                  <p className={`text-xs ${
                      demande.frais_engagement_payes ? 'text-emerald-300/80' : 'text-amber-300/80'
                  }`}>
                      {demande.frais_engagement_payes 
                          ? `Montant payé : ${formatMoney(demande.montant_frais_engagement || 0)}`
                          : demande.montant_frais_engagement 
                              ? `Montant dû : ${formatMoney(demande.montant_frais_engagement)}`
                              : 'Le client doit régler les frais avant traitement.'
                      }
                  </p>
              </div>
          </div>
          {/* ====== END FEES STATUS BANNER ====== */}

          <div className="p-6 space-y-6">
            {/* Client & Demande Info */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Client Info */}
              <div className="bg-slate-700/50 rounded-lg p-4" role="region" aria-label="Informations client">
                <div className="flex items-center gap-2 mb-3">
                  <User className="text-cyan-400" size={20} aria-hidden="true" />
                  <h3 className="text-lg font-bold text-white">Informations Client</h3>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Nom:</dt>
                    <dd className="text-white font-semibold">{safeClientName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Email:</dt>
                    <dd className="text-white">{demande.clients.email || 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Téléphone:</dt>
                    <dd className="text-white">{demande.clients.phone}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Taux Remboursement:</dt>
                    <dd className="text-green-400 font-bold">{demande.clients.taux_remboursement ?? 0}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Crédits en cours:</dt>
                    <dd className="text-white">{formatMoney(demande.clients.credit_total ?? 0)}</dd>
                  </div>
                </dl>
              </div>

              {/* Demande Info */}
              <div className="bg-slate-700/50 rounded-lg p-4" role="region" aria-label="Détails de la demande">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="text-blue-400" size={20} aria-hidden="true" />
                  <h3 className="text-lg font-bold text-white">Détails de la Demande</h3>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Date:</dt>
                    <dd className="text-white">
                      {new Date(demande.created_at || demande.date_demande).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Type:</dt>
                    <dd className="text-white">{demande.type_credit || 'Standard'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Montant:</dt>
                    <dd className="text-white font-bold">{formatMoney(demande.montant_demande)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Durée:</dt>
                    <dd className="text-white">{demande.duree_valeur} {demande.duree_unite === 'Jour' ? 'jours' : demande.duree_unite === 'Semaine' ? 'semaines' : 'mois'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Échéances:</dt>
                    <dd className="text-white">{nombreEcheancesCalc} paiements ({demande.frequence_remboursement})</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Taux:</dt>
                    <dd className="text-white">{demande.taux_interet}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Mensualité/Quotidien:</dt>
                    <dd className="text-green-400 font-bold">{formatMoney(mensualite)}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Objet du Crédit */}
            <div className="bg-slate-700/50 rounded-lg p-4">
              <h3 className="text-lg font-bold text-white mb-3">Objet du Crédit</h3>
              <p className="text-slate-300">{escapeHtml(demande.objet_credit)}</p>
            </div>

            {/* Motif Rejet (si applicable) */}
            {isRejected && demande.motif_rejet && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
                <h3 className="text-lg font-bold text-red-400 mb-2 flex items-center gap-2">
                   <XCircle size={18} /> Motif du Rejet
                </h3>
                <p className="text-slate-300 italic">"{demande.motif_rejet}"</p>
              </div>
            )}

            {/* Reevaluation Section for rejected demands */}
            {isRejected && !isCancelled && (
              <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4">
                <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2">
                  <RefreshCw size={18} /> Réévaluation de la demande
                </h3>
                <ReevaluationEligibilityCheck
                  demandeId={demande.id}
                  onEligibilityChange={setIsEligibleForReevaluation}
                />
                
                <button
                  onClick={() => setShowReevaluationModal(true)}
                  className="mt-4 w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2"
                >
                  <RefreshCw size={20} />
                  Gérer la Réévaluation
                </button>
              </div>
            )}

            {/* Financial Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="region" aria-label="Indicateurs financiers">
              <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/50 rounded-lg p-4">
                <div className="text-green-400 text-sm mb-1">Revenus</div>
                <div className="text-xl md:text-2xl font-bold text-white break-words">
                  {formatMoney(demande.revenus_mensuels ?? 0)}
                </div>
                {demande.type_revenu === 'Journalier' && demande.revenu_journalier && (
                  <div className="text-[10px] text-green-300/70 mt-1 italic">
                    {formatMoney(demande.revenu_journalier)}/j
                  </div>
                )}
              </div>

              <div className="bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 border border-cyan-500/50 rounded-lg p-4">
                <div className="text-cyan-400 text-sm mb-1">Charges</div>
                <div className="text-xl md:text-2xl font-bold text-white break-words">
                  {formatMoney(demande.charges_mensuelles ?? 0)}
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border border-emerald-500/50 rounded-lg p-4">
                <div className="text-emerald-400 text-sm mb-1">Endettement</div>
                <div className={`text-2xl font-bold ${getEndettementColor(tauxEndettement)}`}>
                  {tauxEndettement.toFixed(1)}%
                </div>
                {tauxEndettement > 40 && (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertTriangle size={12} className="text-amber-400" aria-hidden="true" />
                    <span className="text-xs text-amber-400">Attention</span>
                  </div>
                )}
              </div>
            </div>

            {enquetes.length > 0 && (
              <div className="space-y-4">
                 <h3 className="text-lg font-bold text-purple-400 flex items-center gap-2">
                    <Shield size={18} /> Résultats des Enquêtes ({enquetes.length})
                 </h3>
                 {enquetes.map((enquete, index) => {
                   const isExpanded = expandedEnquete === (enquete.id || `enquete-${index}`);
                   const enqueteId = enquete.id || `enquete-${index}`;
                   const isLatest = index === 0;

                   // Determine status styling
                   const getStatutStyle = (statut: string) => {
                     const s = (statut || '').toLowerCase();
                     if (s.includes('approuv') || s === 'approved') return { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400', label: 'Approuvé' };
                     if (s.includes('rejet') || s === 'rejected') return { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', label: 'Rejeté' };
                     if (s.includes('cours') || s === 'in_progress') return { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', label: 'En cours' };
                     if (s.includes('reduit') || s === 'reduced') return { bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'text-amber-400', label: 'Réduit' };
                     return { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', label: 'En attente' };
                   };

                   const statutStyle = getStatutStyle(enquete.statut);

                   return (
                     <div
                       key={enqueteId}
                       className={`${statutStyle.bg} border ${statutStyle.border} rounded-xl overflow-hidden transition-all duration-300 ${!isLatest && !isExpanded ? 'opacity-60' : ''}`}
                     >
                       {/* Header - Always visible */}
                       <button
                         onClick={() => setExpandedEnquete(isExpanded ? null : enqueteId)}
                         className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                         aria-expanded={isExpanded}
                       >
                         <div className="flex items-center gap-4">
                           <div className={`w-12 h-12 rounded-full ${statutStyle.bg} border ${statutStyle.border} flex items-center justify-center`}>
                             <Shield className={statutStyle.text} size={22} />
                           </div>
                           <div className="text-left">
                             <div className="flex items-center gap-2">
                               <span className="text-white font-bold">Enquête #{enquetes.length - index}</span>
                               {isLatest && (
                                 <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full border border-cyan-500/30">
                                   Dernière
                                 </span>
                               )}
                             </div>
                             <div className="flex items-center gap-3 mt-1">
                               <span className={`text-sm ${statutStyle.text} font-semibold`}>{statutStyle.label}</span>
                               <span className="text-slate-500">•</span>
                               <span className="text-slate-400 text-sm">
                                 {new Date(enquete.created_at || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                               </span>
                             </div>
                           </div>
                         </div>

                         <div className={`p-2 rounded-lg transition-colors ${isExpanded ? 'bg-white/10' : 'bg-transparent'}`}>
                           {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                         </div>
                       </button>

                       {/* Expandable Content */}
                       <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                         <div className="px-4 pb-4 space-y-4 border-t border-slate-700/50">
                           {/* Montant demandé */}
                           {enquete.montant_demande && (
                             <div className="pt-4 flex items-center gap-3 bg-slate-800/30 rounded-lg p-3">
                               <DollarSign size={20} className="text-cyan-400" />
                               <div>
                                 <div className="text-xs text-slate-400">Montant évalué lors de l'enquête</div>
                                 <div className="text-xl font-bold text-cyan-400">{formatMoney(enquete.montant_demande)}</div>
                               </div>
                             </div>
                           )}

                           {/* Financial Overview */}
                           <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                             <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                               <DollarSign size={16} className="mx-auto mb-1 text-green-400" />
                               <div className="text-lg font-bold text-white">
                                 {(() => {
                                   const typeRevenu = enquete.type_revenu || enquete.typeRevenu;
                                   if (typeRevenu === 'Journalier' && (enquete.revenu_journalier || enquete.revenuJournalier)) {
                                     return formatMoney(enquete.revenu_journalier || enquete.revenuJournalier || 0);
                                   }
                                   return formatMoney(enquete.revenu_mensuel || enquete.revenuMensuel || 0);
                                 })()}
                               </div>
                               <div className="text-xs text-slate-400">
                                 {(enquete.type_revenu || enquete.typeRevenu) === 'Journalier' ? 'Revenu/Jour' : 'Revenu Mensuel'}
                               </div>
                             </div>
                             <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                               <TrendingUp size={16} className="mx-auto mb-1 text-cyan-400" />
                               <div className="text-lg font-bold text-white">{formatMoney(enquete.charges_mensuelles || enquete.chargesMensuelles || 0)}</div>
                               <div className="text-xs text-slate-400">Charges</div>
                             </div>
                             <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                               <Briefcase size={16} className="mx-auto mb-1 text-purple-400" />
                               <div className="text-lg font-bold text-white">{formatMoney(enquete.capacite_remboursement || enquete.capaciteRemboursement || 0)}</div>
                               <div className="text-xs text-slate-400">Capacité Remb.</div>
                             </div>
                           </div>

                           {/* Activité & Situation */}
                           <div className="grid md:grid-cols-2 gap-4">
                             {/* Left Column - Activité */}
                             <div className="bg-slate-800/30 rounded-lg p-4">
                               <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                                 <Briefcase size={14} className="text-amber-400" /> Activité Professionnelle
                               </h4>
                               <dl className="space-y-2 text-sm">
                                 {(enquete.categorie_activite || enquete.categorieActivite) && (
                                   <div className="flex justify-between items-center">
                                     <dt className="text-slate-400">Catégorie:</dt>
                                     <dd className="text-amber-400 font-semibold">{enquete.categorie_activite || enquete.categorieActivite}</dd>
                                   </div>
                                 )}
                                 {(enquete.type_activite || enquete.typeActivite) && (
                                   <div className="flex justify-between items-center">
                                     <dt className="text-slate-400">Type:</dt>
                                     <dd className="text-white font-medium">{enquete.type_activite || enquete.typeActivite}</dd>
                                   </div>
                                 )}
                                 <div className="flex justify-between items-center">
                                   <dt className="text-slate-400">Ancienneté:</dt>
                                   <dd className="text-white font-medium">
                                     {(() => {
                                       const mois = enquete.anciennete_activite || enquete.ancienneteActivite;
                                       if (!mois) return 'Non spécifié';
                                       if (mois >= 12) {
                                         const ans = Math.floor(mois / 12);
                                         const reste = mois % 12;
                                         return reste > 0 ? `${ans} an${ans > 1 ? 's' : ''} et ${reste} mois` : `${ans} an${ans > 1 ? 's' : ''}`;
                                       }
                                       return `${mois} mois`;
                                     })()}
                                   </dd>
                                 </div>
                                 {(enquete.objet_credit || enquete.objetCredit) && (
                                   <div className="pt-2 border-t border-slate-700/50">
                                     <dt className="text-slate-400 text-xs mb-1">Description:</dt>
                                     <dd className="text-slate-300 text-xs italic">"{enquete.objet_credit || enquete.objetCredit}"</dd>
                                   </div>
                                 )}
                               </dl>
                             </div>

                             {/* Right Column - Situation Financière */}
                             <div className="bg-slate-800/30 rounded-lg p-4">
                               <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                                 <DollarSign size={14} className="text-green-400" /> Situation Financière
                               </h4>
                               <dl className="space-y-2 text-sm">
                                 <div className="flex justify-between items-center">
                                   <dt className="text-slate-400">Type de revenu:</dt>
                                   <dd className="text-white font-medium">{enquete.type_revenu || enquete.typeRevenu || 'Non spécifié'}</dd>
                                 </div>
                                 {(enquete.type_revenu || enquete.typeRevenu) === 'Journalier' && (enquete.revenu_journalier || enquete.revenuJournalier) && (
                                   <>
                                     <div className="flex justify-between items-center">
                                       <dt className="text-slate-400">Revenu journalier:</dt>
                                       <dd className="text-green-400 font-semibold">{formatMoney(enquete.revenu_journalier || enquete.revenuJournalier)}/j</dd>
                                     </div>
                                     <div className="flex justify-between items-center bg-green-500/10 -mx-2 px-2 py-1 rounded">
                                       <dt className="text-slate-400">Revenu mensuel (calculé):</dt>
                                       <dd className="text-green-400 font-bold">{formatMoney(enquete.revenu_mensuel || enquete.revenuMensuel || 0)}</dd>
                                     </div>
                                   </>
                                 )}
                                 {(enquete.type_revenu || enquete.typeRevenu) !== 'Journalier' && (
                                   <div className="flex justify-between items-center">
                                     <dt className="text-slate-400">Revenu mensuel:</dt>
                                     <dd className="text-green-400 font-semibold">{formatMoney(enquete.revenu_mensuel || enquete.revenuMensuel || 0)}</dd>
                                   </div>
                                 )}
                                 <div className="flex justify-between items-center">
                                   <dt className="text-slate-400">Autres prêts:</dt>
                                   <dd className="text-white font-medium">{formatMoney(enquete.autre_prets || enquete.autrePrets || 0)}</dd>
                                 </div>
                                 <div className="flex justify-between items-center">
                                   <dt className="text-slate-400">Personnes à charge:</dt>
                                   <dd className="text-white font-medium">{enquete.personnes_charge ?? enquete.personnesCharge ?? 0}</dd>
                                 </div>
                                 {(enquete.type_habitation || enquete.typeHabitation) && (
                                   <div className="flex justify-between items-center">
                                     <dt className="text-slate-400">Habitation:</dt>
                                     <dd className="text-white font-medium">{enquete.type_habitation || enquete.typeHabitation}</dd>
                                   </div>
                                 )}
                               </dl>
                             </div>
                           </div>

                           {/* Evaluation & Recommandation */}
                           <div className="space-y-3">
                             {enquete.evaluation_activite && (
                               <div className="bg-slate-800/30 rounded-lg p-4">
                                 <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                                   <Briefcase size={14} className="text-amber-400" /> Évaluation de l'Activité
                                 </h4>
                                 <p className="text-slate-300 text-sm leading-relaxed">{enquete.evaluation_activite}</p>
                               </div>
                             )}

                             {(enquete.recommandation || enquete.observations) && (
                               <div className={`rounded-lg p-4 ${statutStyle.bg} border ${statutStyle.border}`}>
                                 <h4 className={`text-sm font-semibold ${statutStyle.text} mb-2 flex items-center gap-2`}>
                                   <MessageSquare size={14} /> Recommandation de l'Agent
                                 </h4>
                                 <p className="text-white text-sm leading-relaxed italic">
                                   "{enquete.recommandation || enquete.observations || 'Aucune recommandation spécifique'}"
                                 </p>
                               </div>
                             )}
                           </div>

                           {/* Agent Info */}
                           {enquete.created_by && (
                             <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
                               <UserCheck size={14} className="text-slate-500" />
                               <span className="text-xs text-slate-500">
                                 Enquête réalisée par l'agent terrain
                               </span>
                             </div>
                           )}
                         </div>
                       </div>
                     </div>
                   );
                 })}
              </div>
            )}

            {/* Workflow Timeline */}
            <div className="bg-slate-700/30 rounded-lg p-6">
               <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Clock size={18} className="text-amber-400" />
                  Historique du Workflow
               </h3>
               <CreditTimeline demandeId={demande.id} compact />
            </div>

            {/* Approval Form */}
            {action === 'approve' && (
              <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="text-green-400" size={20} aria-hidden="true" />
                  <h3 className="text-lg font-bold text-green-400">Approbation du Crédit</h3>
                </div>

                <div>
                  <label htmlFor="commentaire-approval" className="block text-sm font-semibold text-slate-300 mb-2">
                    Commentaire d'Analyse
                  </label>
                  <textarea
                    id="commentaire-approval"
                    value={commentaire}
                    onChange={(e) => setCommentaire(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    rows={3}
                    placeholder="Notes d'analyse et conditions..."
                    maxLength={1000}
                    disabled={loading}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-semibold text-slate-300">Garanties (optionnel)</label>
                    <button
                      type="button"
                      onClick={addGuarantee}
                      disabled={loading || guarantees.length >= 5}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500"
                      aria-label="Ajouter une garantie"
                    >
                      + Ajouter
                    </button>
                  </div>

                  {guarantees.map((guarantee, index) => (
                    <div key={index} className="bg-slate-700/50 rounded-lg p-3 mb-3">
                      <div className="grid md:grid-cols-3 gap-3">
                        <div>
                          <label htmlFor={`guarantee-type-${index}`} className="sr-only">
                            Type de garantie {index + 1}
                          </label>
                          <select
                            id={`guarantee-type-${index}`}
                            value={guarantee.type_garantie}
                            onChange={(e) => updateGuarantee(index, 'type_garantie', e.target.value)}
                            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            disabled={loading}
                          >
                            {GUARANTEE_TYPES.map(type => (
                              <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`guarantee-desc-${index}`} className="sr-only">
                            Description garantie {index + 1}
                          </label>
                          <input
                            id={`guarantee-desc-${index}`}
                            type="text"
                            value={guarantee.description}
                            onChange={(e) => updateGuarantee(index, 'description', e.target.value)}
                            placeholder="Description"
                            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            maxLength={200}
                            disabled={loading}
                          />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label htmlFor={`guarantee-value-${index}`} className="sr-only">
                              Valeur estimée garantie {index + 1}
                            </label>
                            <input
                              id={`guarantee-value-${index}`}
                              type="number"
                              inputMode="numeric"
                              min="0"
                              max={VALIDATION_LIMITS.MAX_CREDIT}
                              value={guarantee.valeur_estimee}
                              onChange={(e) => updateGuarantee(index, 'valeur_estimee', e.target.value)}
                              placeholder="Valeur (FCFA)"
                              className={`w-full bg-slate-700 border ${errors[`guarantee_${index}`] ? 'border-red-500' : 'border-slate-600'} rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500`}
                              disabled={loading}
                              aria-invalid={!!errors[`guarantee_${index}`]}
                            />
                            {errors[`guarantee_${index}`] && (
                              <p className="text-red-400 text-xs mt-1" role="alert">{errors[`guarantee_${index}`]}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeGuarantee(index)}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition focus:outline-none focus:ring-2 focus:ring-red-500"
                            aria-label={`Supprimer garantie ${index + 1}`}
                            disabled={loading}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rejection Form */}
            {action === 'reject' && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="text-red-400" size={20} aria-hidden="true" />
                  <h3 className="text-lg font-bold text-red-400">Rejet de la Demande</h3>
                </div>
                <label htmlFor="commentaire-reject" className="block text-sm font-semibold text-slate-300 mb-2">
                  Motif du Rejet <span className="text-red-400">*</span>
                </label>
                  <textarea
                    id="commentaire-reject"
                    value={commentaire}
                    onChange={(e) => {
                      setCommentaire(e.target.value);
                      if (errors.commentaire) setErrors(prev => ({ ...prev, commentaire: '' }));
                    }}
                    className={`w-full bg-slate-700 border ${errors.commentaire ? 'border-red-500' : 'border-slate-600'} rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500`}
                    rows={3}
                    placeholder="Expliquer les raisons du rejet..."
                    maxLength={1000}
                    disabled={loading}
                    aria-invalid={!!errors.commentaire}
                    aria-describedby={errors.commentaire ? 'reject-error' : undefined}
                  />
                  {errors.commentaire && (
                    <p id="reject-error" className="text-red-400 text-sm mt-1" role="alert">{errors.commentaire}</p>
                  )}

                {/* Refund Input - Only if fees paid */}
                {(demande.frais_engagement_payes || (demande.montant_frais_engagement && demande.montant_frais_engagement > 0)) && (
                   <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600">
                      <div className="flex justify-between items-center mb-2">
                        <label htmlFor="reimbursement-amount" className="text-sm font-semibold text-slate-300">
                          Remboursement des Frais (Optionnel)
                        </label>
                        <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                          Payé: {formatMoney(demande.montant_frais_engagement || 0)}
                        </span>
                      </div>
                      
                      <div className="relative">
                        <input
                          id="reimbursement-amount"
                          type="number"
                          value={reimbursementAmount}
                          onChange={(e) => setReimbursementAmount(e.target.value)}
                          className={`w-full bg-slate-700 border ${errors.reimbursement ? 'border-red-500' : 'border-slate-600'} rounded-lg pl-3 pr-10 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500`}
                          placeholder="Montant du remboursement"
                          min="0"
                          max={demande.montant_frais_engagement}
                          disabled={loading}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                          FCFA
                        </div>
                      </div>
                      {errors.reimbursement ? (
                        <p className="text-red-400 text-xs mt-1">{errors.reimbursement}</p>
                      ) : (
                        <p className="text-slate-400 text-xs mt-1">
                          Laissez vide si aucun remboursement. Le montant sera crédité sur le compte courant du client.
                        </p>
                      )}
                   </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              {showActions ? (
                !action ? (
                  canApproveCredits ? (
                    <>
                      <button
                        onClick={() => setAction('reject')}
                        disabled={loading}
                        className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                      >
                        <XCircle size={20} aria-hidden="true" />
                        Rejeter
                      </button>
                      <button
                        onClick={() => setAction('approve')}
                        disabled={loading}
                        className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                      >
                        <CheckCircle size={20} aria-hidden="true" />
                        Approuver
                      </button>
                    </>
                  ) : (
                    <div className="flex-1 px-6 py-3 bg-slate-700 text-slate-400 rounded-lg text-center flex items-center justify-center gap-2">
                      <AlertCircle size={20} aria-hidden="true" />
                      Vous n'avez pas la permission d'approuver les crédits
                    </div>
                  )
                ) : (
                  <>
                    <button
                      onClick={handleCancel}
                      disabled={loading}
                      className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-50"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleSubmitAction}
                      disabled={loading}
                      className={`flex-1 px-6 py-3 ${
                        action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                      } text-white rounded-lg font-semibold transition disabled:opacity-50 focus:outline-none focus:ring-2 ${
                        action === 'approve' ? 'focus:ring-green-500' : 'focus:ring-red-500'
                      } flex items-center justify-center gap-2`}
                    >
                      {loading ? (
                        <>
                          <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                          Traitement...
                        </>
                      ) : action === 'approve' ? (
                        'Confirmer Approbation'
                      ) : (
                        'Confirmer Rejet'
                      )}
                    </button>
                  </>
                )
              ) : (
                <div className="flex-1 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
                  >
                    Fermer le dossier
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog - Approval */}
      <ConfirmDialog
        isOpen={showConfirmApprove}
        title="Confirmer l'approbation du crédit"
        message={`Vous êtes sur le point d'approuver un crédit de ${formatMoney(montantBase)} pour ${safeClientName}. Le dossier sera envoyé en Commission Crédit pour décaissement.`}
        confirmText="Confirmer Approbation"
        cancelText="Annuler"
        onConfirm={handleApprove}
        onClose={() => setShowConfirmApprove(false)}
        variant="success"
      />

      {/* Confirmation Dialog - Rejection */}
      <ConfirmDialog
        isOpen={showConfirmReject}
        title="Confirmer le rejet de la demande"
        message={`Vous êtes sur le point de rejeter la demande de crédit de ${safeClientName} pour un montant de ${formatMoney(demande.montant_demande)}. Le client sera notifié du rejet.`}
        confirmText="Confirmer le rejet"
        cancelText="Annuler"
        onConfirm={handleReject}
        onClose={() => setShowConfirmReject(false)}
        variant="danger"
      />

      {/* Reevaluation Modal */}
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
            toast.success('Demande de réévaluation soumise avec succès');
            onSuccess();
          }}
        />
      )}
    </>
  );
}
