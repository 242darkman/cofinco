import React, { useState, useMemo, useCallback } from 'react';
import { X, Lock, AlertTriangle, CheckCircle, Calculator, Banknote, Coins } from 'lucide-react';
import { usePermissions } from '../../auth/ProtectedFeature';
import { Button } from '@/components/ui';
import { sessionCaisseApi, caisseIncidentApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { sanitizeInput } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';

interface SessionCaisse {
  id: string;
  solde_initial: number;
  solde_theorique: number;
  openedAt?: string;
  opened_at?: string;
}

interface CaisseRapprochementProps {
  session: SessionCaisse;
  onClose: () => void;
}

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

export default function CaisseRapprochement({ session, onClose }: CaisseRapprochementProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCloseCaisse = hasPermission('caisse', 'edit') || hasPermission('caisse', 'manage');

  const [loading, setLoading] = useState(false);
  const [observations, setObservations] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

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

  // Calcul du total mémorisé
  const soldeCalcule = useMemo(() => {
    return DENOMINATIONS.reduce((total, denom) => {
      return total + (billetage[denom.name] || 0) * denom.value;
    }, 0);
  }, [billetage]);

  const soldeTheorique = useMemo(() => toNumber(session?.solde_theorique), [session?.solde_theorique]);
  const ecart = useMemo(() => soldeCalcule - soldeTheorique, [soldeCalcule, soldeTheorique]);

  // Mise à jour du billetage
  const updateBilletage = useCallback((name: DenominationName, value: number) => {
    const sanitizedValue = Math.max(0, Math.floor(value));
    setBilletage(prev => ({ ...prev, [name]: sanitizedValue }));
  }, []);

  // Préparer la fermeture (afficher confirmation)
  const preparerFermeture = useCallback(() => {
    if (soldeCalcule <= 0) {
      toast.warning('Veuillez effectuer le billetage avant de fermer la caisse');
      return;
    }
    setShowConfirmDialog(true);
  }, [soldeCalcule]);

  // Confirmer et exécuter la fermeture
  const handleFermeture = useCallback(async () => {
    setShowConfirmDialog(false);
    setLoading(true);
    const loadingId = toast.loading('Fermeture de la caisse en cours...');

    try {
      const sanitizedObservations = sanitizeInput(observations);
      const observationsFinales = sanitizedObservations + (ecart !== 0 ? `\nÉcart de caisse: ${ecart} FCFA` : '');

      await sessionCaisseApi.close(session.id, {
        billetageFermeture: billetage,
        observations: observationsFinales
      });

      // Créer un incident si l'écart est significatif
      if (Math.abs(ecart) > 100) {
        await caisseIncidentApi.create({
          session_id: session.id,
          type_incident: 'Écart de caisse',
          montant_ecart: ecart,
          description: `Écart de ${ecart} FCFA lors de la fermeture`,
          statut: 'Ouvert'
        });

        toast.dismiss(loadingId);
        toast.warning(`Caisse fermée avec un écart de ${formatMoney(Math.abs(ecart))}`);
      } else {
        toast.dismiss(loadingId);
        toast.success('Caisse fermée avec succès');
      }

      onClose();
    } catch (error) {
      toast.dismiss(loadingId);
      const errorMessage = handleApiError(error, 'Erreur lors de la fermeture');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [session.id, soldeCalcule, ecart, observations, billetage, onClose]);

  // Message de confirmation mémorisé
  const confirmationMessage = useMemo(() => {
    let message = `Vous êtes sur le point de fermer la caisse avec un solde réel de ${formatMoney(soldeCalcule)}.`;
    if (ecart !== 0) {
      message += ` Un écart de ${formatMoney(Math.abs(ecart))} sera enregistré.`;
      if (Math.abs(ecart) > 100) {
        message += ' Un incident sera automatiquement créé.';
      }
    }
    return message;
  }, [soldeCalcule, ecart]);

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 font-sans animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rapprochement-title"
    >
      <div className="bg-slate-900 border border-slate-700/50 w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl shadow-black/50 flex flex-col">
        {/* Header */}
        <header className="shrink-0 px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
              <Lock size={20} className="text-indigo-400" aria-hidden="true" />
            </div>
            <div>
              <h3
                id="rapprochement-title"
                className="text-lg font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
              >
                Fermeture de Caisse
              </h3>
              <p className="text-xs text-slate-400 font-medium">Décompte final et vérification</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            aria-label="Fermer la fenêtre"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          {/* Stats Cards */}
          <section aria-label="Résumé des soldes">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-3.5 flex flex-col justify-between h-24">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Théorique</p>
                <div className="flex items-baseline gap-1 break-words">
                  <p className="text-lg font-bold text-slate-200">{formatMoney(soldeTheorique)}</p>
                </div>
              </div>

              <div className="col-span-1 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3.5 flex flex-col justify-between h-24">
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Réel (Compté)</p>
                <div className="flex items-baseline gap-1 break-words">
                  <p className="text-lg font-bold text-indigo-400">{formatMoney(soldeCalcule)}</p>
                </div>
              </div>

              <div
                className={`col-span-2 md:col-span-1 border rounded-xl p-3.5 flex flex-col justify-between h-24 transition-colors ${
                  ecart === 0
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : Math.abs(ecart) <= 100
                    ? 'bg-cyan-500/10 border-cyan-500/20'
                    : 'bg-rose-500/10 border-rose-500/20'
                }`}
                role="status"
                aria-label={`Écart: ${ecart} FCFA`}
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    ecart === 0
                      ? 'text-emerald-400'
                      : Math.abs(ecart) <= 100
                      ? 'text-cyan-400'
                      : 'text-rose-400'
                  }`}
                >
                  Écart
                </p>
                <div className="flex items-baseline gap-1 break-words">
                  <p
                    className={`text-lg font-bold ${
                      ecart === 0
                        ? 'text-emerald-400'
                        : Math.abs(ecart) <= 100
                        ? 'text-cyan-300'
                        : 'text-rose-400'
                    }`}
                  >
                    {ecart > 0 ? '+' : ''}
                    {formatMoney(ecart)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Ecart Warning */}
          {ecart !== 0 && (
            <div
              className={`rounded-xl p-3 flex items-start gap-3 border ${
                Math.abs(ecart) <= 100
                  ? 'bg-cyan-950/30 border-cyan-500/30 text-cyan-200'
                  : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
              }`}
              role="alert"
            >
              <AlertTriangle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">
                  {Math.abs(ecart) <= 100 ? 'Petit écart détecté' : 'Écart IMPORTANT détecté !'}
                </p>
                <p className="text-xs opacity-80 mt-1">
                  {ecart > 0
                    ? `Il y a ${formatMoney(ecart)} de TROP dans le tiroir-caisse.`
                    : `Il MANQUE ${formatMoney(Math.abs(ecart))} dans le tiroir-caisse.`}
                </p>
              </div>
            </div>
          )}

          {/* Decompte Grid */}
          <section aria-labelledby="billetage-title">
            <div className="flex items-center gap-2 mb-4">
              <Calculator size={18} className="text-slate-400" aria-hidden="true" />
              <h4 id="billetage-title" className="text-sm font-bold text-white uppercase tracking-wider">
                Billetage
              </h4>
              <div className="h-px bg-slate-800 flex-1 ml-2" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {DENOMINATIONS.map((denom) => {
                const count = billetage[denom.name];
                const total = count * denom.value;
                return (
                  <div key={denom.name} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          denom.type === 'billet'
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-slate-800/50 text-slate-500'
                        }`}
                        aria-hidden="true"
                      >
                        {denom.type === 'billet' ? <Banknote size={14} /> : <Coins size={14} />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-300">{denom.label}</p>
                        {count > 0 && (
                          <p className="text-[10px] text-indigo-400 font-bold">
                            {formatMoney(total)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-950/50 rounded-lg p-1 border border-slate-800 focus-within:border-indigo-500/50 transition-colors">
                      <button
                        onClick={() => updateBilletage(denom.name, count - 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        aria-label={`Diminuer le nombre de billets de ${denom.label}`}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={count || ''}
                        onChange={(e) => updateBilletage(denom.name, parseInt(e.target.value) || 0)}
                        className="w-12 bg-transparent text-center text-sm font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0"
                        aria-label={`Nombre de billets de ${denom.label}`}
                      />
                      <button
                        onClick={() => updateBilletage(denom.name, count + 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        aria-label={`Augmenter le nombre de billets de ${denom.label}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Observations */}
          <div className="pt-2">
            <label
              htmlFor="observations-input"
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block"
            >
              Observations
            </label>
            <textarea
              id="observations-input"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all resize-none"
              rows={2}
              placeholder="Une note à ajouter ?"
              aria-describedby="observations-hint"
            />
            <p id="observations-hint" className="sr-only">
              Ajoutez des notes ou observations sur cette fermeture de caisse
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <footer className="shrink-0 p-4 border-t border-slate-800 bg-slate-900/95 backdrop-blur flex flex-col sm:flex-row gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="w-full sm:w-auto border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
            aria-label="Annuler et fermer"
          >
            Annuler
          </Button>

          {canCloseCaisse ? (
            <Button
              onClick={preparerFermeture}
              disabled={loading || soldeCalcule <= 0}
              className={`w-full sm:flex-1 font-bold ${
                ecart === 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
              aria-label="Valider la fermeture de caisse"
            >
              {loading ? (
                'Clôture en cours...'
              ) : (
                <span className="flex items-center gap-2">
                  <Lock size={16} aria-hidden="true" /> Valider la fermeture
                </span>
              )}
            </Button>
          ) : (
            <div
              className="w-full flex items-center justify-center gap-2 text-xs font-bold text-amber-500 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20"
              role="alert"
            >
              <Lock size={14} aria-hidden="true" /> Permission requise
            </div>
          )}
        </footer>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="Confirmer la fermeture de caisse"
        message={confirmationMessage}
        onConfirm={handleFermeture}
        onClose={() => setShowConfirmDialog(false)}
        variant={Math.abs(ecart) > 100 ? 'danger' : ecart !== 0 ? 'warning' : 'success'}
        confirmText="Confirmer la fermeture"
        cancelText="Annuler"
      />
    </div>
  );
}
