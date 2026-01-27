import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Lock, AlertTriangle, CheckCircle, Calculator, Banknote, Coins, ArrowRight, ArrowLeft, Loader2, Vault, PiggyBank, FileText } from 'lucide-react';
import { usePermissions } from '../../auth/ProtectedFeature';
import { Button, Badge } from '@/components/ui';
import { sessionCaisseApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { sanitizeInput } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SessionCaisse } from '../../../types/finance';


interface CaisseRapprochementProps {
  session: SessionCaisse;
  onClose: () => void;
  /** Solde théorique calculé = montantOuverture + totalEntrees - totalSorties */
  soldeTheoriqueCalcule?: number;
}

// Step type for the wizard
type ClosingStep = 'freeze' | 'count' | 'transfer';

const toNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const DENOMINATIONS = [
  { name: 'billets_10000', label: '10 000', value: 10000, type: 'billet' },
  { name: 'billets_5000', label: '5 000', value: 5000, type: 'billet' },
  { name: 'billets_1000', label: '1 000', value: 1000, type: 'billet' },
  { name: 'billets_500', label: '500', value: 500, type: 'billet' },
  { name: 'billets_200', label: '200', value: 200, type: 'piece' },
  { name: 'billets_100', label: '100', value: 100, type: 'piece' },
  { name: 'billets_50', label: '50', value: 50, type: 'piece' },
  { name: 'pieces_20', label: '20', value: 20, type: 'piece' },
  { name: 'pieces_10', label: '10', value: 10, type: 'piece' },
  { name: 'pieces_5', label: '5', value: 5, type: 'piece' },
] as const;

type DenominationName = typeof DENOMINATIONS[number]['name'];

export default function CaisseRapprochement({ session, onClose, soldeTheoriqueCalcule }: CaisseRapprochementProps) {
  const { hasPermission } = usePermissions();
  const canCloseCaisse = hasPermission('caisse', 'close') || hasPermission('caisse', 'manage');

  // Determine initial step based on session status
  const getInitialStep = (): ClosingStep => {
    const statut = session.statut;
    if (statut === 'CLOSING_COUNT') return 'count';
    if (statut === 'CLOSING_VALIDATION') return 'transfer';
    return 'freeze';
  };

  const [step, setStep] = useState<ClosingStep>(getInitialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Freeze state
  const [freezeConfirmed, setFreezeConfirmed] = useState(false);

  // Step 2: Count state
  const [billetage, setBilletage] = useState<Record<DenominationName, number>>({
    billets_10000: 0,
    billets_5000: 0,
    billets_1000: 0,
    billets_500: 0,
    billets_200: 0,
    billets_100: 0,
    billets_50: 0,
    pieces_20: 0,
    pieces_10: 0,
    pieces_5: 0,
  });
  const [ecartJustification, setEcartJustification] = useState('');
  const [countSubmitted, setCountSubmitted] = useState(false);

  // Step 3: Transfer decision state
  const [montantVersCoffre, setMontantVersCoffre] = useState<number>(0);
  const [montantReporte, setMontantReporte] = useState<number>(0);
  const [observations, setObservations] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Calculated values
  // Le solde théorique = montant d'ouverture + entrées - sorties
  // Priorité: 1) Backend (après gel), 2) Prop calculée, 3) Fallbacks
  const soldeTheorique = useMemo(() => {
    // 1. Si déjà calculé par le backend (après gel = étape 2+)
    const fromBackend = toNumber(session?.montant_fermeture_theorique || session?.montantFermetureTheorique);
    if (fromBackend > 0) return fromBackend;

    // 2. Utiliser le solde calculé passé en prop (montantOuverture + entrées - sorties)
    // C'est la source de vérité avant le gel
    if (soldeTheoriqueCalcule !== undefined && soldeTheoriqueCalcule > 0) {
      return soldeTheoriqueCalcule;
    }

    // 3. Fallback: solde_theorique de la session
    const soldeTheoriqueField = toNumber(session?.solde_theorique);
    if (soldeTheoriqueField > 0) return soldeTheoriqueField;

    // 4. Dernier fallback: montant d'ouverture
    return toNumber((session as any)?.montant_ouverture || (session as any)?.montantOuverture || session?.solde_initial || 0);
  }, [session, soldeTheoriqueCalcule]);

  const soldeCalcule = useMemo(() => {
    return DENOMINATIONS.reduce((total, denom) => {
      return total + (billetage[denom.name] || 0) * denom.value;
    }, 0);
  }, [billetage]);

  // For step 3, use submitted physical count if available
  const montantPhysique = useMemo(() => {
    if (countSubmitted || step === 'transfer') {
      return toNumber(session?.montant_physique || session?.montantPhysique) || soldeCalcule;
    }
    return soldeCalcule;
  }, [session, soldeCalcule, countSubmitted, step]);

  const ecart = useMemo(() => montantPhysique - soldeTheorique, [montantPhysique, soldeTheorique]);

  // Auto-calculate transfer amounts when montant physique changes
  useEffect(() => {
    if (step === 'transfer' && montantPhysique > 0 && montantVersCoffre === 0 && montantReporte === 0) {
      // Default: transfer everything to coffre
      setMontantVersCoffre(montantPhysique);
      setMontantReporte(0);
    }
  }, [step, montantPhysique, montantVersCoffre, montantReporte]);

  const updateBilletage = useCallback((name: DenominationName, value: number) => {
    const sanitizedValue = Math.max(0, Math.floor(value));
    setBilletage(prev => ({ ...prev, [name]: sanitizedValue }));
  }, []);

  // ========== STEP 1: INITIATE CLOSE (Freeze) ==========
  const handleInitiateClose = async () => {
    setLoading(true);
    setError(null);

    try {
      await sessionCaisseApi.initiateClose(session.id);
      toast.success('Session gelée - Procédez au comptage');
      setStep('count');
    } catch (err: any) {
      const errorMessage = handleApiError(err, 'Erreur lors du gel de la session');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ========== STEP 2: SUBMIT COUNT ==========
  const handleSubmitCount = async () => {
    // Validate: bloquer seulement si le comptage est à 0 alors que le théorique ne l'est pas
    // (cas légitime: session ouverte à 0 FCFA sans opérations → comptage physique = 0)
    if (soldeCalcule <= 0 && soldeTheorique > 0) {
      toast.warning('Veuillez effectuer le billetage avant de continuer');
      return;
    }

    // If ecart, require justification
    if (Math.abs(soldeCalcule - soldeTheorique) > 0 && !ecartJustification.trim()) {
      setError('Un écart a été détecté. Veuillez fournir une justification.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await sessionCaisseApi.submitCount(session.id, {
        billetage,
        ecartJustification: ecartJustification.trim() || undefined,
      });

      const responseEcart = result.ecart || (soldeCalcule - soldeTheorique);

      if (Math.abs(responseEcart) > 100) {
        toast.warning(`Comptage enregistré avec un écart de ${formatMoney(Math.abs(responseEcart))} - sera audité`);
      } else {
        toast.success('Comptage validé');
      }

      setCountSubmitted(true);
      setStep('transfer');
    } catch (err: any) {
      const errorMessage = handleApiError(err, 'Erreur lors de la soumission du comptage');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ========== STEP 3: FINALIZE CLOSE ==========
  const handleFinalizeClose = async () => {
    setShowConfirmDialog(false);
    setLoading(true);
    setError(null);

    try {
      // Validate: sum must equal physical count
      const totalDecision = montantVersCoffre + montantReporte;
      if (Math.abs(totalDecision - montantPhysique) > 1) {
        setError(`La somme (${formatMoney(totalDecision)}) doit être égale au montant physique (${formatMoney(montantPhysique)})`);
        setLoading(false);
        return;
      }

      await sessionCaisseApi.finalizeClose(session.id, {
        montantVersCoffre,
        montantReporte,
        observations: sanitizeInput(observations) || undefined,
      });

      if (montantVersCoffre > 0) {
        toast.success(`Caisse fermée - Transfert de ${formatMoney(montantVersCoffre)} vers le coffre créé`);
      } else {
        toast.success(
          montantReporte > 0
            ? `Caisse fermée - ${formatMoney(montantReporte)} conservé pour demain`
            : 'Caisse fermée avec succès'
        );
      }

      onClose();
    } catch (err: any) {
      const errorMessage = handleApiError(err, 'Erreur lors de la finalisation');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ========== CANCEL CLOSE (go back to OPEN) ==========
  const handleCancelClose = async () => {
    if (step !== 'count') {
      toast.error('Impossible d\'annuler à ce stade');
      return;
    }

    setLoading(true);
    try {
      await sessionCaisseApi.cancelClose(session.id);
      toast.info('Processus de fermeture annulé');
      onClose();
    } catch (err: any) {
      const errorMessage = handleApiError(err, 'Erreur lors de l\'annulation');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Quick actions for transfer amounts
  const handleTransferAll = () => {
    setMontantVersCoffre(montantPhysique);
    setMontantReporte(0);
  };

  const handleKeepAll = () => {
    setMontantVersCoffre(0);
    setMontantReporte(montantPhysique);
  };

  const handleSplitAmount = (keepAmount: number) => {
    const keep = Math.min(keepAmount, montantPhysique);
    setMontantReporte(keep);
    setMontantVersCoffre(montantPhysique - keep);
  };

  // Validation helper
  const isTransferValid = Math.abs((montantVersCoffre + montantReporte) - montantPhysique) <= 1;

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 font-sans animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-900 border border-slate-700/50 w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl shadow-black/50 flex flex-col">
        {/* Header with Stepper */}
        <header className="shrink-0 px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-indigo-900/30 to-purple-900/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                <Lock size={20} className="text-indigo-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Fermeture Sécurisée</h3>
                <p className="text-xs text-slate-400">
                  {step === 'freeze' && 'Étape 1: Gel de la session'}
                  {step === 'count' && 'Étape 2: Comptage physique'}
                  {step === 'transfer' && 'Étape 3: Décision de trésorerie'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-center gap-2">
            <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium ${step === 'freeze' ? 'bg-white text-indigo-700' : 'bg-indigo-500/50 text-white'}`}>
              <span>1</span>
              <span className="hidden sm:inline">Gel</span>
            </div>
            <ArrowRight className="h-4 w-4 text-indigo-300" />
            <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium ${step === 'count' ? 'bg-white text-indigo-700' : step === 'transfer' ? 'bg-indigo-500/50 text-white' : 'bg-indigo-900/50 text-indigo-300'}`}>
              <span>2</span>
              <span className="hidden sm:inline">Comptage</span>
            </div>
            <ArrowRight className="h-4 w-4 text-indigo-300" />
            <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium ${step === 'transfer' ? 'bg-white text-indigo-700' : 'bg-indigo-900/50 text-indigo-300'}`}>
              <span>3</span>
              <span className="hidden sm:inline">Remise</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Error Display */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="text-red-400 shrink-0" size={20} />
              <div>
                <p className="text-sm font-medium text-red-400">{error}</p>
              </div>
            </div>
          )}

          {/* ========== STEP 1: FREEZE ========== */}
          {step === 'freeze' && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="mx-auto w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-4 ring-2 ring-amber-500/30">
                  <Lock className="w-10 h-10 text-amber-400" />
                </div>
                <h4 className="text-xl font-bold text-white mb-2">Prêt à fermer la session ?</h4>
                <p className="text-slate-400 max-w-md mx-auto">
                  Une fois la fermeture initiée, <strong className="text-amber-400">aucune nouvelle transaction</strong> ne sera autorisée.
                  Assurez-vous d'avoir terminé toutes les opérations en cours.
                </p>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Solde théorique actuel</span>
                  <span className="font-bold text-white">{formatMoney(soldeTheorique)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Session ouverte depuis</span>
                  <span className="text-slate-300">
                    {session.openedAt || session.opened_at
                      ? new Date(session.openedAt || session.opened_at!).toLocaleString('fr-FR')
                      : '-'}
                  </span>
                </div>
              </div>

              <label className="flex items-start gap-3 p-4 bg-slate-800/30 rounded-xl cursor-pointer hover:bg-slate-800/50 transition-colors">
                <input
                  type="checkbox"
                  checked={freezeConfirmed}
                  onChange={(e) => setFreezeConfirmed(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500/50"
                />
                <span className="text-sm text-slate-300">
                  Je confirme avoir vérifié qu'aucune transaction n'est en attente et souhaite procéder à la fermeture de la caisse.
                </span>
              </label>
            </div>
          )}

          {/* ========== STEP 2: COUNT ========== */}
          {step === 'count' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3.5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Théorique</p>
                  <p className="text-lg font-bold text-slate-200">{formatMoney(soldeTheorique)}</p>
                </div>

                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3.5">
                  <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">Compté</p>
                  <p className="text-lg font-bold text-indigo-400">{formatMoney(soldeCalcule)}</p>
                </div>

                <div className={`col-span-2 md:col-span-1 border rounded-xl p-3.5 ${
                  soldeCalcule === 0 ? 'bg-slate-800/30 border-slate-700/50' :
                  soldeCalcule - soldeTheorique === 0 ? 'bg-emerald-500/10 border-emerald-500/20' :
                  Math.abs(soldeCalcule - soldeTheorique) <= 100 ? 'bg-cyan-500/10 border-cyan-500/20' :
                  'bg-rose-500/10 border-rose-500/20'
                }`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                    soldeCalcule === 0 ? 'text-slate-400' :
                    soldeCalcule - soldeTheorique === 0 ? 'text-emerald-400' :
                    Math.abs(soldeCalcule - soldeTheorique) <= 100 ? 'text-cyan-400' : 'text-rose-400'
                  }`}>Écart</p>
                  <p className={`text-lg font-bold ${
                    soldeCalcule === 0 ? 'text-slate-500' :
                    soldeCalcule - soldeTheorique === 0 ? 'text-emerald-400' :
                    Math.abs(soldeCalcule - soldeTheorique) <= 100 ? 'text-cyan-300' : 'text-rose-400'
                  }`}>
                    {soldeCalcule > 0 ? (soldeCalcule - soldeTheorique > 0 ? '+' : '') : ''}{formatMoney(soldeCalcule - soldeTheorique)}
                  </p>
                </div>
              </div>

              {/* Ecart Warning */}
              {soldeCalcule > 0 && Math.abs(soldeCalcule - soldeTheorique) > 0 && (
                <div className={`rounded-xl p-4 flex items-start gap-3 border ${
                  Math.abs(soldeCalcule - soldeTheorique) <= 100
                    ? 'bg-cyan-950/30 border-cyan-500/30 text-cyan-200'
                    : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                }`}>
                  <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold mb-2">
                      {Math.abs(soldeCalcule - soldeTheorique) <= 100 ? 'Petit écart détecté' : 'Écart IMPORTANT détecté !'}
                    </p>
                    <p className="text-xs opacity-80 mb-3">
                      {soldeCalcule - soldeTheorique > 0
                        ? `Il y a ${formatMoney(soldeCalcule - soldeTheorique)} de TROP dans le tiroir-caisse.`
                        : `Il MANQUE ${formatMoney(Math.abs(soldeCalcule - soldeTheorique))} dans le tiroir-caisse.`}
                    </p>
                    <textarea
                      value={ecartJustification}
                      onChange={(e) => setEcartJustification(e.target.value)}
                      placeholder="Justification obligatoire de l'écart..."
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 outline-none"
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {/* Billetage */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Calculator size={18} className="text-slate-400" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Billetage</h4>
                  <div className="h-px bg-slate-800 flex-1 ml-2" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {DENOMINATIONS.map((denom) => {
                    const count = billetage[denom.name];
                    const total = count * denom.value;
                    return (
                      <div key={denom.name} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                            denom.type === 'billet' ? 'bg-slate-800 text-slate-300' : 'bg-slate-800/50 text-slate-500'
                          }`}>
                            {denom.type === 'billet' ? <Banknote size={14} /> : <Coins size={14} />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-300">{denom.label}</p>
                            {count > 0 && <p className="text-[10px] text-indigo-400 font-bold">{formatMoney(total)}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-950/50 rounded-lg p-1 border border-slate-800 focus-within:border-indigo-500/50 transition-colors">
                          <button
                            onClick={() => updateBilletage(denom.name, count - 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                          >-</button>
                          <input
                            type="number"
                            value={count || ''}
                            onChange={(e) => updateBilletage(denom.name, parseInt(e.target.value) || 0)}
                            className="w-12 bg-transparent text-center text-sm font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="0"
                          />
                          <button
                            onClick={() => updateBilletage(denom.name, count + 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ========== STEP 3: TRANSFER ========== */}
          {step === 'transfer' && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="text-emerald-400" size={24} />
                  <div>
                    <h4 className="text-white font-bold">Comptage validé</h4>
                    <p className="text-sm text-slate-400">Montant physique total: <strong className="text-emerald-400">{formatMoney(montantPhysique)}</strong></p>
                  </div>
                </div>
                {Math.abs(ecart) > 0 && (
                  <div className="text-sm text-amber-400 flex items-center gap-2">
                    <AlertTriangle size={14} />
                    Écart de {formatMoney(ecart)} enregistré
                  </div>
                )}
              </div>

              {/* Transfer Decision */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <FileText size={16} className="text-slate-400" />
                  Décision de trésorerie
                </h4>

                <p className="text-sm text-slate-400">
                  Répartissez le montant physique entre le coffre-fort et le fonds de roulement pour demain.
                </p>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleTransferAll}
                    className="px-3 py-1.5 text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/20 transition-colors"
                  >
                    Tout au coffre
                  </button>
                  <button
                    onClick={handleKeepAll}
                    className="px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-colors"
                  >
                    Tout garder
                  </button>
                  <button
                    onClick={() => handleSplitAmount(500000)}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/30 rounded-lg hover:bg-slate-500/20 transition-colors"
                  >
                    Garder 500k
                  </button>
                </div>

                {/* Amount Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Vault className="text-indigo-400" size={18} />
                      <label className="text-sm font-medium text-slate-300">Vers le Coffre-Fort</label>
                    </div>
                    <input
                      type="number"
                      value={montantVersCoffre || ''}
                      onChange={(e) => {
                        const value = Number(e.target.value) || 0;
                        setMontantVersCoffre(Math.max(0, value));
                        setMontantReporte(Math.max(0, montantPhysique - value));
                      }}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-lg font-bold text-white text-right focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 outline-none [appearance:textfield]"
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500 mt-2">Sera en attente de validation</p>
                  </div>

                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 mb-3">
                      <PiggyBank className="text-amber-400" size={18} />
                      <label className="text-sm font-medium text-slate-300">Fonds Reporté (J+1)</label>
                    </div>
                    <input
                      type="number"
                      value={montantReporte || ''}
                      onChange={(e) => {
                        const value = Number(e.target.value) || 0;
                        setMontantReporte(Math.max(0, value));
                        setMontantVersCoffre(Math.max(0, montantPhysique - value));
                      }}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-lg font-bold text-white text-right focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none [appearance:textfield]"
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500 mt-2">Disponible à l'ouverture demain</p>
                  </div>
                </div>

                {/* Validation */}
                <div className={`rounded-xl p-3 flex items-center justify-between ${
                  isTransferValid ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'
                }`}>
                  <span className="text-sm">
                    Total: <strong className={isTransferValid ? 'text-emerald-400' : 'text-red-400'}>
                      {formatMoney(montantVersCoffre + montantReporte)}
                    </strong> / {formatMoney(montantPhysique)}
                  </span>
                  {isTransferValid ? (
                    <Badge variant="success" value="✓ Valide" />
                  ) : (
                    <Badge variant="danger" value="✗ Invalide" />
                  )}
                </div>

                {/* Observations */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                    Observations (optionnel)
                  </label>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all resize-none"
                    rows={2}
                    placeholder="Une note à ajouter ?"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="shrink-0 p-4 border-t border-slate-800 bg-slate-900/95 backdrop-blur flex flex-col sm:flex-row gap-3">
          {step === 'freeze' && (
            <>
              <Button onClick={onClose} variant="outline" className="w-full sm:w-auto border-slate-700">
                Annuler
              </Button>
              <Button
                onClick={handleInitiateClose}
                disabled={!freezeConfirmed || loading || !canCloseCaisse}
                className="w-full sm:flex-1 bg-amber-600 hover:bg-amber-700"
              >
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Lock size={16} className="mr-2" />}
                Geler et Commencer
              </Button>
            </>
          )}

          {step === 'count' && (
            <>
              <Button onClick={handleCancelClose} variant="outline" className="w-full sm:w-auto border-slate-700" disabled={loading}>
                <ArrowLeft size={16} className="mr-2" />
                Annuler
              </Button>
              <Button
                onClick={handleSubmitCount}
                disabled={loading || (soldeCalcule <= 0 && soldeTheorique > 0) || (Math.abs(soldeCalcule - soldeTheorique) > 0 && !ecartJustification.trim())}
                className={`w-full sm:flex-1 ${soldeCalcule - soldeTheorique === 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <ArrowRight size={16} className="mr-2" />}
                Valider le Comptage
              </Button>
            </>
          )}

          {step === 'transfer' && (
            <>
              <Button onClick={onClose} variant="outline" className="w-full sm:w-auto border-slate-700">
                Annuler
              </Button>
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={loading || !isTransferValid || !canCloseCaisse}
                className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Lock size={16} className="mr-2" />}
                Finaliser la Fermeture
              </Button>
            </>
          )}
        </footer>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="Confirmer la fermeture"
        message={
          <div className="space-y-3">
            <p>Vous êtes sur le point de fermer définitivement cette session.</p>
            <div className="bg-slate-800/50 rounded-lg p-3 space-y-2 text-sm">
              {montantVersCoffre > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Transfert coffre</span>
                  <span className="font-bold text-indigo-400">{formatMoney(montantVersCoffre)}</span>
                </div>
              )}
              {montantReporte > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Fonds reporté J+1</span>
                  <span className="font-bold text-amber-400">{formatMoney(montantReporte)}</span>
                </div>
              )}
            </div>
            {montantVersCoffre > 0 && (
              <p className="text-xs text-slate-400">
                Le transfert vers le coffre sera en attente de validation par le responsable.
              </p>
            )}
          </div>
        }
        onConfirm={handleFinalizeClose}
        onClose={() => setShowConfirmDialog(false)}
        variant="success"
        confirmText="Confirmer la fermeture"
        cancelText="Annuler"
      />
    </div>
  );
}
