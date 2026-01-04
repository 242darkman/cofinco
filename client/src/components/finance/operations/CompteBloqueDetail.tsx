import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Lock, Calendar, DollarSign, Percent, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { compteBloqueApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';

interface CompteBloqueDetailProps {
  compteId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export default function CompteBloqueDetail({ compteId, onClose, onUpdate }: CompteBloqueDetailProps) {
  const [compte, setCompte] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirmWithdraw, setShowConfirmWithdraw] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  useEffect(() => {
    loadCompteDetails();
  }, [compteId]);

  const loadCompteDetails = useCallback(async () => {
    try {
      const [compteData, transactionsData] = await Promise.all([
        compteBloqueApi.getById(compteId),
        compteBloqueApi.getTransactions(compteId)
      ]);

      setCompte(compteData);
      setTransactions(transactionsData || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement du compte'));
    } finally {
      setLoading(false);
    }
  }, [compteId]);

  const calculateInterets = () => {
    if (!compte) return { interetsTotal: 0, interetsAcquis: 0 };

    const montant = compte.montant_initial;
    const taux = compte.taux_interet / 100;
    const dureeTotale = compte.duree_mois / 12;

    const interetsTotal = montant * taux * dureeTotale;

    const dateOuverture = new Date(compte.date_ouverture);
    const aujourdhui = new Date();
    const dateEcheance = new Date(compte.date_echeance);

    const joursEcoules = Math.floor((aujourdhui.getTime() - dateOuverture.getTime()) / (1000 * 60 * 60 * 24));
    const joursTotaux = Math.floor((dateEcheance.getTime() - dateOuverture.getTime()) / (1000 * 60 * 60 * 24));

    const pourcentageEcoule = Math.min(joursEcoules / joursTotaux, 1);
    const interetsAcquis = interetsTotal * pourcentageEcoule;

    return { interetsTotal, interetsAcquis };
  };

  const getJoursRestants = () => {
    if (!compte) return 0;
    const dateEcheance = new Date(compte.date_echeance);
    const aujourdhui = new Date();
    const jours = Math.floor((dateEcheance.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(jours, 0);
  };

  const isEchu = () => {
    return getJoursRestants() === 0;
  };

  const handleWithdraw = useCallback(async (isAnticipe: boolean) => {
    if (!compte) return;

    setWithdrawLoading(true);

    try {
      const { interetsTotal, interetsAcquis } = calculateInterets();

      let montantFinal = compte.montant_initial;
      let penalite = 0;

      if (isEchu()) {
        montantFinal += interetsTotal;
      } else if (isAnticipe) {
        penalite = interetsAcquis * (compte.penalite_retrait_anticipe / 100);
        montantFinal += (interetsAcquis - penalite);
      }

      await compteBloqueApi.withdraw(compte.id, {
        isAnticipe,
        montantFinal,
        penalite,
        interetsTotal,
        clientId: compte.clients?.id
      });

      toast.success(isAnticipe ? 'Retrait anticipé effectué' : 'Compte clôturé avec succès');
      onUpdate();
      onClose();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du retrait'));
    } finally {
      setWithdrawLoading(false);
    }
  }, [compte, onUpdate, onClose]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="text-white">Chargement...</div>
      </div>
    );
  }

  if (!compte) return null;

  const { interetsTotal, interetsAcquis } = calculateInterets();
  const joursRestants = getJoursRestants();
  const estEchu = isEchu();
  const pourcentageProgression = ((compte.duree_mois * 30 - joursRestants) / (compte.duree_mois * 30)) * 100;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">{compte.numero_compte}</h2>
            <p className="text-slate-400 text-sm mt-1">Compte Bloqué - {compte.clients.nom}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className={`rounded-lg p-6 border-2 ${
            estEchu ? 'bg-green-500/20 border-green-500' :
            compte.statut === 'Retiré Anticipé' ? 'bg-blue-500/20 border-blue-500' :
            'bg-emerald-500/20 border-emerald-500'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {estEchu ? (
                  <CheckCircle className="text-green-400" size={32} />
                ) : (
                  <Clock className="text-emerald-400" size={32} />
                )}
                <div>
                  <h3 className="text-2xl font-bold text-white">
                    {estEchu ? 'Compte Échu' : compte.statut}
                  </h3>
                  <p className="text-slate-300">
                    {estEchu ? 'Prêt pour le retrait' : `${joursRestants} jours restants`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-slate-400 text-sm">Montant actuel</div>
                <div className="text-3xl font-bold text-green-400">{compte.montant_actuel.toLocaleString()} FCFA</div>
              </div>
            </div>

            <div className="w-full bg-slate-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  estEchu ? 'bg-green-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(pourcentageProgression, 100)}%` }}
              />
            </div>
            <div className="text-right text-sm font-bold text-white mt-1">
              {pourcentageProgression.toFixed(1)}% du terme écoulé
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-400 text-sm mb-2">
                <DollarSign size={16} />
                <span>Montant Initial</span>
              </div>
              <div className="text-2xl font-bold text-white">{compte.montant_initial.toLocaleString()} FCFA</div>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-400 text-sm mb-2">
                <Percent size={16} />
                <span>Intérêts Totaux</span>
              </div>
              <div className="text-2xl font-bold text-green-400">{interetsTotal.toLocaleString()} FCFA</div>
              <div className="text-xs text-slate-400 mt-1">À échéance</div>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-emerald-400 text-sm mb-2">
                <Clock size={16} />
                <span>Intérêts Acquis</span>
              </div>
              <div className="text-2xl font-bold text-emerald-400">{interetsAcquis.toLocaleString()} FCFA</div>
              <div className="text-xs text-slate-400 mt-1">Actuellement</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-700/50 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="text-cyan-400" size={20} />
                <h3 className="text-lg font-bold text-white">Informations du Compte</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Date d'ouverture:</span>
                  <span className="text-white">{new Date(compte.date_ouverture).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Date d'échéance:</span>
                  <span className="text-white font-bold">{new Date(compte.date_echeance).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Durée:</span>
                  <span className="text-white">{compte.duree_mois} mois</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Taux d'intérêt:</span>
                  <span className="text-white font-bold">{compte.taux_interet}% / an</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pénalité retrait anticipé:</span>
                  <span className="text-white">{compte.penalite_retrait_anticipe}%</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="text-green-400" size={20} />
                <h3 className="text-lg font-bold text-white">Estimation à l'Échéance</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-slate-400 text-sm mb-1">Montant total</div>
                  <div className="text-3xl font-bold text-green-400">
                    {(compte.montant_initial + interetsTotal).toLocaleString()} FCFA
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-sm mb-1">Rendement total</div>
                  <div className="text-xl font-bold text-white">
                    {((interetsTotal / compte.montant_initial) * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {compte.description && (
            <div className="bg-slate-700/50 rounded-lg p-4">
              <p className="text-slate-300">{compte.description}</p>
            </div>
          )}

          {compte.statut === 'Actif' && (
            <div className="flex gap-3">
              {!estEchu && (
                <button
                  onClick={() => setShowConfirmWithdraw(true)}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={20} />
                  Retrait Anticipé
                </button>
              )}
              {estEchu && (
                <button
                  onClick={() => handleWithdraw(false)}
                  disabled={withdrawLoading}
                  className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle size={20} />
                  {withdrawLoading ? 'Traitement...' : 'Clôturer et Retirer'}
                </button>
              )}
            </div>
          )}

          {transactions.length > 0 && (
            <div className="bg-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4">Historique des Transactions</h3>
              <div className="space-y-2">
                {transactions.map(transaction => (
                  <div
                    key={transaction.id}
                    className="bg-slate-600/50 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-white font-semibold">{transaction.type_transaction}</div>
                      <div className="text-xs text-slate-400">
                        {new Date(transaction.date_transaction).toLocaleString('fr-FR')}
                      </div>
                      {transaction.description && (
                        <div className="text-xs text-slate-400 mt-1">{transaction.description}</div>
                      )}
                    </div>
                    <div className={`text-xl font-bold ${
                      transaction.montant > 0 ? 'text-green-400' : 'text-blue-400'
                    }`}>
                      {transaction.montant > 0 ? '+' : ''}{transaction.montant.toLocaleString()} FCFA
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {showConfirmWithdraw && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg border border-blue-500 p-6 max-w-md">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="text-blue-400" size={32} />
                <h3 className="text-xl font-bold text-white">Retrait Anticipé</h3>
              </div>
              <div className="space-y-3 mb-6">
                <p className="text-slate-300">
                  Vous êtes sur le point de retirer ce compte avant son échéance.
                </p>
                <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
                  <p className="text-blue-400 font-semibold mb-2">Pénalité applicable:</p>
                  <p className="text-white">
                    {compte.penalite_retrait_anticipe}% sur les intérêts acquis = {' '}
                    {(interetsAcquis * (compte.penalite_retrait_anticipe / 100)).toLocaleString()} FCFA
                  </p>
                  <p className="text-slate-300 mt-2">
                    Montant que vous recevrez: {' '}
                    <span className="font-bold text-white">
                      {(compte.montant_initial + interetsAcquis - (interetsAcquis * (compte.penalite_retrait_anticipe / 100))).toLocaleString()} FCFA
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmWithdraw(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleWithdraw(true)}
                  disabled={withdrawLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition disabled:opacity-50"
                >
                  {withdrawLoading ? 'Traitement...' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
