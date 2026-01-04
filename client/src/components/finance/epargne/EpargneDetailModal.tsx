import React, { useState, useEffect } from 'react';
import { X, User, TrendingUp, TrendingDown, Calendar, DollarSign, Percent } from 'lucide-react';
import { compteEpargneApi, transactionEpargneApi, clientApi } from '../../../lib/api-client';

interface EpargneDetailModalProps {
  compteId: string;
  onClose: () => void;
}

export default function EpargneDetailModal({ compteId, onClose }: EpargneDetailModalProps) {
  const [compte, setCompte] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalDepots: 0,
    totalRetraits: 0,
    totalInterets: 0,
    nombreTransactions: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompteDetails();
  }, [compteId]);

  const loadCompteDetails = async () => {
    try {
      const [comptesData, transactionsData, clientsData] = await Promise.all([
        compteEpargneApi.getAll(),
        transactionEpargneApi.getByCompte(compteId),
        clientApi.getAll()
      ]);

      const compteData = comptesData.find((c: any) => c.id === compteId);
      if (compteData) {
        const clientData = clientsData.find((c: any) => c.id === compteData.client_id);
        setCompte({
          ...compteData,
          clients: clientData || { nom: 'Inconnu', email: '', phone: '' }
        });
      }

      if (transactionsData) {
        setTransactions(transactionsData);

        const statsCalc = transactionsData.reduce((acc: any, t: any) => {
          if (t.type_transaction === 'Dépôt') acc.totalDepots += t.montant;
          else if (t.type_transaction === 'Retrait') acc.totalRetraits += Math.abs(t.montant);
          else if (t.type_transaction === 'Intérêts') acc.totalInterets += t.montant;
          acc.nombreTransactions++;
          return acc;
        }, { totalDepots: 0, totalRetraits: 0, totalInterets: 0, nombreTransactions: 0 });

        setStats(statsCalc);
      }
    } catch (error) {
      console.error('Erreur chargement détails compte:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateInterets = () => {
    if (!compte) return 0;

    const dateOuverture = new Date(compte.date_ouverture);
    const aujourdhui = new Date();
    const joursDiff = Math.floor((aujourdhui.getTime() - dateOuverture.getTime()) / (1000 * 60 * 60 * 24));
    const anneeDiff = joursDiff / 365;

    const interetsEstimes = compte.solde * (compte.taux_interet / 100) * anneeDiff;
    return interetsEstimes;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="text-white">Chargement...</div>
      </div>
    );
  }

  if (!compte) return null;

  const interetsEstimes = calculateInterets();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">{compte.numero_compte}</h2>
            <p className="text-slate-400 text-sm mt-1">{compte.type_compte}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/50 rounded-lg p-4">
              <div className="text-green-400 text-sm mb-1">Solde Actuel</div>
              <div className="text-2xl font-bold text-white break-words">{compte.solde.toLocaleString()} FCFA</div>
            </div>

            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/50 rounded-lg p-4">
              <div className="text-blue-400 text-sm mb-1">Total Dépôts</div>
              <div className="text-2xl font-bold text-white break-words">{stats.totalDepots.toLocaleString()} FCFA</div>
            </div>

            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/50 rounded-lg p-4">
              <div className="text-blue-400 text-sm mb-1">Total Retraits</div>
              <div className="text-2xl font-bold text-white break-words">{stats.totalRetraits.toLocaleString()} FCFA</div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border border-emerald-500/50 rounded-lg p-4">
              <div className="text-emerald-400 text-sm mb-1">Intérêts Estimés</div>
              <div className="text-2xl font-bold text-white break-words">{interetsEstimes.toLocaleString()} FCFA</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-700/50 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <User className="text-cyan-400" size={20} />
                <h3 className="text-lg font-bold text-white">Titulaire du Compte</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Nom:</span>
                  <span className="text-white font-semibold">{compte.clients.nom}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Email:</span>
                  <span className="text-white">{compte.clients.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Téléphone:</span>
                  <span className="text-white">{compte.clients.phone}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Percent className="text-blue-400" size={20} />
                <h3 className="text-lg font-bold text-white">Informations du Compte</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Date d'ouverture:</span>
                  <span className="text-white">{new Date(compte.date_ouverture).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Taux d'intérêt:</span>
                  <span className="text-white font-bold">{compte.taux_interet}% / an</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Statut:</span>
                  <span className={`font-bold ${
                    compte.statut === 'Actif' ? 'text-green-400' :
                    compte.statut === 'Suspendu' ? 'text-cyan-400' :
                    'text-blue-400'
                  }`}>{compte.statut}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Transactions:</span>
                  <span className="text-white">{stats.nombreTransactions}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-700/50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="text-green-400" size={20} />
                <h3 className="text-lg font-bold text-white">Historique des Transactions</h3>
              </div>
              <span className="text-slate-400 text-sm">{transactions.length} transaction{transactions.length > 1 ? 's' : ''}</span>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                Aucune transaction enregistrée
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {transactions.map(transaction => (
                  <div
                    key={transaction.id}
                    className="bg-slate-600/50 rounded-lg p-4 hover:bg-slate-600/70 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          transaction.type_transaction === 'Dépôt' ? 'bg-green-500/20' :
                          transaction.type_transaction === 'Retrait' ? 'bg-blue-500/20' :
                          'bg-blue-500/20'
                        }`}>
                          {transaction.type_transaction === 'Dépôt' ? (
                            <TrendingUp className="text-green-400" size={20} />
                          ) : transaction.type_transaction === 'Retrait' ? (
                            <TrendingDown className="text-blue-400" size={20} />
                          ) : (
                            <DollarSign className="text-blue-400" size={20} />
                          )}
                        </div>

                        <div>
                          <div className="text-white font-semibold">{transaction.type_transaction}</div>
                          <div className="text-xs text-slate-400">
                            {new Date(transaction.date_transaction).toLocaleString('fr-FR')}
                          </div>
                          {transaction.reference && (
                            <div className="text-xs text-slate-500">Réf: {transaction.reference}</div>
                          )}
                          {transaction.description && (
                            <div className="text-xs text-slate-400 mt-1">{transaction.description}</div>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`text-xl font-bold ${
                          transaction.montant > 0 ? 'text-green-400' : 'text-blue-400'
                        }`}>
                          {transaction.montant > 0 ? '+' : ''}{transaction.montant.toLocaleString()} FCFA
                        </div>
                        <div className="text-xs text-slate-400">
                          Solde: {transaction.solde_apres.toLocaleString()} FCFA
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 p-6">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
