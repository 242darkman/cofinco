import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { X, CheckCircle, XCircle, AlertCircle, FileText, DollarSign, User, TrendingUp, Loader2, Shield, AlertTriangle } from 'lucide-react';
import { creditApi, demandeCreditApi } from '../../../lib/api-client';
import { usePermissions } from '../../auth/ProtectedFeature';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import ConfirmDialog from '../../ui/ConfirmDialog';

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
  score_credit: number | null;
  revenus_mensuels?: number;
  type_revenu?: string;
  revenu_journalier?: number;
  charges_mensuelles?: number;
  capacite_remboursement?: number;
  frequence_remboursement: string;
  date_demande: string;
  created_at?: string;
  clients: {
    nom: string;
    prenom?: string;
    email?: string;
    phone: string;
    score?: number;
    taux_remboursement?: number;
    credit_total?: number;
    photo_url?: string;
  };
}

interface CreditApprovalModalProps {
  demande: Demande;
  onClose: () => void;
  onSuccess: () => void;
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

export default function CreditApprovalModal({ demande, onClose, onSuccess }: CreditApprovalModalProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canApproveCredits = hasPermission('credits', 'approve');

  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [loading, setLoading] = useState(false);
  const [guarantees, setGuarantees] = useState<Guarantee[]>([]);
  const [showConfirmApprove, setShowConfirmApprove] = useState(false);
  const [showConfirmReject, setShowConfirmReject] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isReevaluating, setIsReevaluating] = useState(false);
  const [enquetes, setEnquetes] = useState<any[]>([]);

  useEffect(() => {
    if (demande?.id) {
       fetch(`/api/demandes-credit/${demande.id}/enquete`)
         .then(res => res.json())
         .then(data => setEnquetes(Array.isArray(data) ? data : [data]))
         .catch(err => console.warn("No enquete found", err));
    }
  }, [demande?.id]);

  const latestEnquete = enquetes.length > 0 ? enquetes[0] : null;

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
  const { montantBase, mensualite, montantTotal, nombreEcheancesCalc, tauxEndettement, revenus } = useMemo(() => {
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
      montantTotal: total,
      nombreEcheancesCalc: nombreEcheances,
      tauxEndettement: isFinite(endettement) ? endettement : 0,
      revenus: rev,
    };
  }, [demande]);

  // Safe escaped values
  const safeClientName = useMemo(() => {
    const full = `${demande.clients.nom} ${demande.clients.prenom || ''}`.trim();
    return escapeHtml(full);
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
  }, [action, commentaire, guarantees]);

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
      await demandeCreditApi.update(demande.id, {
        statut: 'Rejetée',
        motif_rejet: sanitizeInput(commentaire)
      });

      toast.success('Demande de crédit rejetée');
      onSuccess();
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors du rejet');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setShowConfirmReject(false);
    }
  }, [demande.id, commentaire, onSuccess]);

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

  const getScoreColor = useCallback((score: number) => {
    if (score >= 70) return 'text-green-400';
    if (score >= 50) return 'text-cyan-400';
    return 'text-red-400';
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
                    <dt className="text-slate-400">Score Client:</dt>
                    <dd className={`font-bold ${getScoreColor(demande.clients.score ?? 0)}`}>
                      {demande.clients.score ?? 0}/100
                    </dd>
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
            {isRejected && demande.motif_rejet && !isReevaluating && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
                <h3 className="text-lg font-bold text-red-400 mb-2 flex items-center gap-2">
                   <XCircle size={18} /> Motif du Rejet Précédent
                </h3>
                <p className="text-slate-300 italic">"{demande.motif_rejet}"</p>
              </div>
            )}

            {/* Financial Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="region" aria-label="Indicateurs financiers">
              <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/50 rounded-lg p-4">
                <div className="text-blue-400 text-sm mb-1">Score Crédit</div>
                <div className={`text-2xl font-bold ${getScoreColor(demande.score_credit ?? 0)}`}>
                  {demande.score_credit ?? 0}/100
                </div>
              </div>

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
                    <Shield size={18} /> Historique des Enquêtes ({enquetes.length})
                 </h3>
                 {enquetes.map((enquete, index) => (
                   <div key={enquete.id || index} className={`bg-purple-500/10 border border-purple-500/50 rounded-lg p-4 ${index !== 0 ? 'opacity-75' : ''}`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-purple-300 uppercase">Enquête #{enquetes.length - index}</span>
                        <span className="text-xs text-slate-400">{new Date(enquete.created_at || Date.now()).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <dl className="grid md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div className="flex justify-between">
                              <dt className="text-slate-400">Statut:</dt>
                              <dd className="text-white font-bold">{enquete.statut}</dd>
                          </div>
                          <div className="flex justify-between">
                              <dt className="text-slate-400">Note Globale:</dt>
                              <dd className="text-white font-bold">{enquete.score_global || '-'}/100</dd>
                          </div>
                          <div className="col-span-2 mt-2">
                              <dt className="text-slate-400 block mb-1">Recommandation Agent:</dt>
                              <dd className="text-white bg-slate-800/50 p-2 rounded italic">"{enquete.recommandation || enquete.evaluation_activite || 'Aucune recommandation'}"</dd>
                          </div>
                      </dl>
                   </div>
                 ))}
              </div>
            )}

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
                  {isRejected && canApproveCredits && (
                    <button
                      onClick={() => setIsReevaluating(true)}
                      className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                    >
                      <AlertTriangle size={20} /> Réévaluer cette demande
                    </button>
                  )}
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
    </>
  );
}
