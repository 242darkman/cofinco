import React, { useState, useCallback, useMemo } from 'react';
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
  duree_mois: number;
  taux_interet: number;
  type_credit: string | null;
  objet_credit: string;
  statut: string;
  score_credit: number | null;
  revenus_mensuels?: number;
  charges_mensuelles?: number;
  capacite_remboursement?: number;
  date_demande: string;
  clients: {
    nom: string;
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

  // Memoized financial calculations
  const { montantBase, mensualite, montantTotal, tauxEndettement, revenus } = useMemo(() => {
    const base = demande.montant_approuve ?? demande.montant_demande;
    const taux = demande.taux_interet / 100 / 12;
    const duree = demande.duree_mois;
    const rev = demande.revenus_mensuels ?? 1;

    // Mensualité avec formule de prêt amortissable
    const mens = base * (taux * Math.pow(1 + taux, duree)) / (Math.pow(1 + taux, duree) - 1);
    const total = base * (1 + (demande.taux_interet / 100) * (duree / 12));
    const endettement = (mens / rev) * 100;

    return {
      montantBase: base,
      mensualite: isFinite(mens) ? mens : 0,
      montantTotal: total,
      tauxEndettement: isFinite(endettement) ? endettement : 0,
      revenus: rev,
    };
  }, [demande]);

  // Safe escaped values
  const safeClientName = useMemo(() => escapeHtml(demande.clients.nom), [demande.clients.nom]);

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
      const numeroSequence = Date.now().toString().slice(-8);
      const numeroCredit = `CRD-${numeroSequence}`;

      const dateDeblocage = new Date();
      const datePremiereEcheance = new Date(dateDeblocage);
      datePremiereEcheance.setMonth(datePremiereEcheance.getMonth() + 1);

      const dateDerniereEcheance = new Date(dateDeblocage);
      dateDerniereEcheance.setMonth(dateDerniereEcheance.getMonth() + demande.duree_mois);

      // Sanitize and validate guarantees
      const garantiesPayload = guarantees.map((g) => ({
        type_garantie: g.type_garantie,
        description: sanitizeInput(g.description),
        valeur_estimee: parseFloat(g.valeur_estimee) || 0,
        statut: 'Active'
      }));

      const creditData = {
        clientId: demande.client_id,
        montant: montantBase,
        taux: demande.taux_interet,
        duree: demande.duree_mois,
        typeCredit: demande.type_credit || 'Standard',
        objetCredit: sanitizeInput(demande.objet_credit),
        statut: 'Actif',
        dateDebut: dateDeblocage.toISOString().split('T')[0],
        dateFin: dateDerniereEcheance.toISOString().split('T')[0],
        dateSolvabilite: dateDerniereEcheance.toISOString().split('T')[0],
        soldeRestant: montantTotal,
        garanties: JSON.stringify(garantiesPayload),
        observations: sanitizeInput(commentaire),
        numero_credit: numeroCredit,
        demande_id: demande.id,
        montant_total: montantTotal,
        montant_echeance: mensualite,
        date_premiere_echeance: datePremiereEcheance.toISOString().split('T')[0],
        commentaire_approbation: sanitizeInput(commentaire)
      };

      await creditApi.create(creditData);
      await demandeCreditApi.update(demande.id, { statut: 'Déboursé' });

      toast.success(`Crédit ${numeroCredit} approuvé et déboursé avec succès`);
      onSuccess();
    } catch (error) {
      const errorMessage = handleApiError(error, "Erreur lors de l'approbation du crédit");
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setShowConfirmApprove(false);
    }
  }, [demande, montantBase, montantTotal, mensualite, guarantees, commentaire, onSuccess]);

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
                    <dd className="text-white">{new Date(demande.date_demande).toLocaleDateString('fr-FR')}</dd>
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
                    <dd className="text-white">{demande.duree_mois} mois</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Taux:</dt>
                    <dd className="text-white">{demande.taux_interet}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Mensualité:</dt>
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
            <div className="flex gap-3">
              {!action ? (
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
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog - Approval */}
      <ConfirmDialog
        isOpen={showConfirmApprove}
        title="Confirmer l'approbation du crédit"
        message={`Vous êtes sur le point d'approuver et débourser un crédit de ${formatMoney(montantBase)} pour ${safeClientName}. Le montant total à rembourser sera de ${formatMoney(montantTotal)} sur ${demande.duree_mois} mois. Cette action est irréversible.`}
        confirmText="Approuver et débourser"
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
