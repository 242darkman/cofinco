import React, { useState, useMemo, useCallback } from 'react';
import { X, Percent, Calendar, DollarSign, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { escapeHtml } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';

interface Compte {
  id: string;
  numero_compte: string;
  solde: number;
  taux_interet?: number;
  date_ouverture?: string;
  clients: {
    id: string;
    nom: string;
  } | null;
}

interface EpargneInterestCalculatorProps {
  compte: Compte;
  onClose: () => void;
  onSuccess: () => void;
}

type Periode = 'month' | 'quarter' | 'year';

const PERIODE_CONFIG: Record<Periode, { days: number; label: string; description: string }> = {
  month: { days: 30, label: 'Mensuel', description: '30 jours' },
  quarter: { days: 90, label: 'Trimestriel', description: '90 jours' },
  year: { days: 365, label: 'Annuel', description: '365 jours' },
};

export default function EpargneInterestCalculator({ compte, onClose, onSuccess }: EpargneInterestCalculatorProps) {
  const [loading, setLoading] = useState(false);
  const [periode, setPeriode] = useState<Periode>('month');
  const [showConfirm, setShowConfirm] = useState(false);

  // Default values for optional properties
  const tauxInteret = compte.taux_interet ?? 0;
  const dateOuverture = compte.date_ouverture ?? new Date().toISOString();

  // Memoized calculations
  const { interets, nouveauSolde, rendement, joursOuvert } = useMemo(() => {
    const periodeEnJours = PERIODE_CONFIG[periode].days;
    const calculatedInterets = compte.solde * (tauxInteret / 100) * (periodeEnJours / 365);
    const calculatedNouveauSolde = compte.solde + calculatedInterets;
    const calculatedRendement = compte.solde > 0 ? (calculatedInterets / compte.solde) * 100 : 0;
    const days = Math.floor((new Date().getTime() - new Date(dateOuverture).getTime()) / (1000 * 60 * 60 * 24));

    return {
      interets: calculatedInterets,
      nouveauSolde: calculatedNouveauSolde,
      rendement: calculatedRendement,
      joursOuvert: days,
    };
  }, [compte.solde, tauxInteret, dateOuverture, periode]);

  const handlePayInterests = useCallback(async () => {
    if (interets <= 0) {
      toast.warning('Le montant des intérêts doit être supérieur à 0');
      return;
    }

    setLoading(true);

    try {
      // Single atomic call: creates mouvement + GL posting + transaction record
      await compteEpargneApi.crediterInterets(compte.id, {
        montant: interets,
        periode: PERIODE_CONFIG[periode].label,
        tauxInteret,
        observations: `Intérêts créditeurs - ${PERIODE_CONFIG[periode].label} (${tauxInteret}%)`,
      });

      toast.success(`Intérêts de ${formatMoney(interets)} crédités avec succès`);
      onSuccess();
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors du paiement des intérêts');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  }, [compte, interets, periode, tauxInteret, onSuccess]);

  const handlePeriodeChange = useCallback((newPeriode: Periode) => {
    setPeriode(newPeriode);
  }, []);

  const handleSubmit = useCallback(() => {
    if (interets <= 0) {
      toast.warning('Aucun intérêt à créditer');
      return;
    }
    setShowConfirm(true);
  }, [interets]);

  // Escape client name for XSS protection
  const safeClientName = compte.clients ? escapeHtml(compte.clients.nom) : 'Client inconnu';
  const safeNumeroCompte = escapeHtml(compte.numero_compte);

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interest-calculator-title"
    >
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border-b border-slate-700 p-6 flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg" aria-hidden="true">
              <Percent className="text-emerald-400" size={24} />
            </div>
            <div>
              <h2 id="interest-calculator-title" className="text-2xl font-bold text-white">
                Calculateur d'Intérêts
              </h2>
              <p className="text-slate-400 text-sm">{safeNumeroCompte}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700/50 transition"
            aria-label="Fermer"
            disabled={loading}
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Account Info */}
          <div className="bg-slate-700/50 rounded-lg p-4" role="region" aria-label="Informations du compte">
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-slate-400 text-sm mb-1">Client</div>
                <div className="text-white font-semibold">{safeClientName}</div>
              </div>
              <div>
                <div className="text-slate-400 text-sm mb-1">Solde actuel</div>
                <div className="text-2xl font-bold text-green-400">
                  {formatMoney(compte.solde)}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-sm mb-1">Taux d'intérêt annuel</div>
                <div className="text-white font-bold">{compte.taux_interet}%</div>
              </div>
              <div>
                <div className="text-slate-400 text-sm mb-1">Ouvert depuis</div>
                <div className="text-white">{joursOuvert} jours</div>
              </div>
            </div>
          </div>

          {/* Period Selection */}
          <fieldset>
            <legend className="block text-sm font-semibold text-slate-300 mb-3">
              <Calendar size={16} className="inline mr-2" aria-hidden="true" />
              Période de Calcul
            </legend>
            <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Sélectionner la période">
              {(Object.keys(PERIODE_CONFIG) as Periode[]).map((key) => {
                const config = PERIODE_CONFIG[key];
                const isSelected = periode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handlePeriodeChange(key)}
                    disabled={loading}
                    className={`px-4 py-3 rounded-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {config.label}
                    <div className="text-xs mt-1 opacity-75">{config.description}</div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Results */}
          <div
            className="bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/50 rounded-lg p-6"
            role="region"
            aria-label="Résultats du calcul"
            aria-live="polite"
          >
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-2 text-emerald-400 text-sm mb-2">
                  <TrendingUp size={16} aria-hidden="true" />
                  <span>Intérêts Calculés</span>
                </div>
                <div className="text-3xl font-bold text-white break-words">
                  {formatMoney(interets)}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 text-green-400 text-sm mb-2">
                  <DollarSign size={16} aria-hidden="true" />
                  <span>Nouveau Solde</span>
                </div>
                <div className="text-3xl font-bold text-green-400 break-words">
                  {formatMoney(nouveauSolde)}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 text-cyan-400 text-sm mb-2">
                  <Percent size={16} aria-hidden="true" />
                  <span>Rendement</span>
                </div>
                <div className="text-3xl font-bold text-cyan-400">
                  {rendement.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          {/* Calculation Formula */}
          <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4" role="note">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-blue-400 flex-shrink-0 mt-1" size={20} aria-hidden="true" />
              <div className="text-sm text-slate-300">
                <p className="font-semibold text-white mb-1">Calcul des Intérêts</p>
                <p className="text-slate-400">
                  Formule: Solde × Taux × (Jours / 365)
                </p>
                <p className="text-slate-400 mt-1">
                  = {compte.solde.toLocaleString('fr-FR')} × {compte.taux_interet}% × ({PERIODE_CONFIG[periode].days} / 365)
                </p>
                <p className="text-slate-400 mt-1">
                  = <span className="text-white font-bold">{formatMoney(interets)}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || interets <= 0}
              className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                  Traitement...
                </>
              ) : (
                'Créditer les Intérêts'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        title="Confirmer le crédit d'intérêts"
        message={`Voulez-vous créditer ${formatMoney(interets)} d'intérêts sur le compte ${safeNumeroCompte} ? Le nouveau solde sera de ${formatMoney(nouveauSolde)}.`}
        confirmText="Créditer"
        cancelText="Annuler"
        onConfirm={handlePayInterests}
        onClose={() => setShowConfirm(false)}
        variant="success"
      />
    </div>
  );
}
