import React, { useState, useEffect } from 'react';
import { X, User, TrendingUp, TrendingDown, Calendar, DollarSign, Percent, Lock } from 'lucide-react';
import { compteEpargneApi, transactionEpargneApi, clientApi } from '../../../lib/api-client';
import { TransactionRowActions } from '../shared/TransactionRowActions';
import { ReceiptViewer } from '../shared/ReceiptViewer';
import { useReceiptActions } from '../../../hooks/finance/useReceiptActions';
import Badge from '../../ui/Badge';
import { getAccountBalance, getAccountUiConfig, getMonthlyInterestEstimate } from '../../../lib/account-config';

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
  
  // Receipt actions hook
  const {
    viewingFactureId,
    isViewerOpen,
    handleView,
    handleDownload,
    handleShare,
    handleCloseViewer
  } = useReceiptActions();

  useEffect(() => {
    console.log('EpargneDetailModal compteId changed:', compteId);
    loadCompteDetails();
  }, [compteId]);

  const loadCompteDetails = async () => {
    try {
      const [comptesResponse, transactionsData, clientsResponse] = await Promise.all([
        compteEpargneApi.getAll(),
        transactionEpargneApi.getByCompte(compteId),
        clientApi.getAllList()
      ]);

      // Handle paginated response format: { data, total, page, limit, totalPages }
      const comptesResponseAny = comptesResponse as any;
      const comptesData = Array.isArray(comptesResponse) ? comptesResponse : (comptesResponseAny.data || []);
      const clientsAny = clientsResponse as any;
      const clientsData = Array.isArray(clientsAny) ? clientsAny : (clientsAny.data || []);

      const compteData = comptesData.find((c: any) => c.id === compteId);
      if (compteData) {
        // Robust client finding
        const clientId = compteData.client_id || compteData.clientId;
        let clientData = null;
        
        if (clientId) {
          clientData = clientsData.find((c: any) => c.id === clientId);
        }
        
        // If client not found in list, try to use embedded client data if available
        if (!clientData && compteData.clients) {
          clientData = compteData.clients;
        }

        setCompte({
          ...compteData,
          clients: clientData || { nom: 'Inconnu', email: 'N/A', phone: 'N/A' }
        });
      }

      if (transactionsData) {
        // Normalize transaction fields from backend (typePaiement -> type_transaction, createdAt -> date_transaction)
        const normalizedTransactions = transactionsData.map((t: any) => {
          // Extract base transaction type by removing account type suffixes
          let typeTransaction = (t.typePaiement || t.type_paiement || '')
            .replace(' Épargne', '')
            .replace(' Courant', '')
            .replace(' Bloqué', '')
            .trim();
          
          // Fallback to 'Autre' if empty
          if (!typeTransaction) typeTransaction = 'Autre';
          
          return {
            ...t,
            type_transaction: typeTransaction,
            date_transaction: t.createdAt || t.created_at || new Date().toISOString(),
            description: t.observations || t.typePaiement || t.type_paiement,
            reference: t.billingReference || t.billing_reference || t.id?.substring(0, 8)
          };
        });
        setTransactions(normalizedTransactions);

        const statsCalc = normalizedTransactions.reduce((acc: any, t: any) => {
          const montant = Number(t.montant) || 0;
          if (t.type_transaction === 'Dépôt') acc.totalDepots += montant;
          else if (t.type_transaction === 'Retrait') acc.totalRetraits += Math.abs(montant);
          else if (t.type_transaction === 'Intérêts') acc.totalInterets += montant;
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

    // Use default interest rate if missing
    const tauxInteret = getAccountUiConfig(compte, 'staff').interestRate;
    
    // Validate date
    const dateOuvertureStr = compte.date_ouverture || compte.createdAt || compte.created_at;
    if (!dateOuvertureStr) return 0;
    
    const dateOuverture = new Date(dateOuvertureStr);
    if (isNaN(dateOuverture.getTime())) return 0;

    const aujourdhui = new Date();
    const joursDiff = Math.floor((aujourdhui.getTime() - dateOuverture.getTime()) / (1000 * 60 * 60 * 24));
    
    // Avoid negative diff if date is in future (timezone issues)
    if (joursDiff <= 0) return 0;
    
    const anneeDiff = joursDiff / 365;

    const solde = getAccountBalance(compte);
    const interetsEstimes = solde * (tauxInteret / 100) * anneeDiff;
    return interetsEstimes || 0; // Return 0 if NaN
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="text-white">Chargement...</div>
      </div>
    );
  }

  if (!compte) return null;

  const uiConfig = getAccountUiConfig(compte, 'staff');
  const balance = getAccountBalance(compte);
  const monthlyEstimate = getMonthlyInterestEstimate(balance, uiConfig.interestRate);
  const showInterest = uiConfig.interestRate > 0;
  const interetsEstimes = calculateInterets();

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-[9999] p-2 sm:p-4"
      onClick={(e) => {
        // Close modal when clicking on backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-slate-800 rounded-t-2xl sm:rounded-xl border border-slate-700 w-full sm:max-w-4xl max-h-[90dvh] sm:max-h-[90vh] overflow-y-auto shadow-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="sm:hidden flex justify-center pt-2">
          <div className="h-1.5 w-10 rounded-full bg-slate-600/70" />
        </div>
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-5 sm:p-6 flex justify-between items-center z-10">
          <div>
            <h2 className="text-2xl font-bold text-white">{compte.numero_compte || compte.numeroCompte}</h2>
            <p className="text-slate-400 text-sm mt-1">{compte.type_compte || compte.typeCompte}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X size={24} />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          <div className={`grid gap-4 ${showInterest ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
            <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/50 rounded-lg p-4">
              <div className="text-green-400 text-sm mb-1">Solde Actuel</div>
              <div className="text-2xl font-bold text-white break-words">{balance.toLocaleString('fr-FR')} FCFA</div>
            </div>

            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/50 rounded-lg p-4">
              <div className="text-blue-400 text-sm mb-1">Total Dépôts</div>
              <div className="text-2xl font-bold text-white break-words">{stats.totalDepots.toLocaleString()} FCFA</div>
            </div>

            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/50 rounded-lg p-4">
              <div className="text-blue-400 text-sm mb-1">Total Retraits</div>
              <div className="text-2xl font-bold text-white break-words">{stats.totalRetraits.toLocaleString()} FCFA</div>
            </div>

            {showInterest && (
              <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/50 rounded-lg p-4">
                <div className="text-amber-300 text-sm mb-1">Intérêts Estimés</div>
                <div className="text-2xl font-bold text-white break-words">{interetsEstimes.toLocaleString('fr-FR')} FCFA</div>
              </div>
            )}
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
                  <span className="text-white font-semibold">{compte.clients?.nom || 'Inconnu'} {compte.clients?.prenom || ''}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Email:</span>
                  <span className="text-white">{compte.clients?.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Téléphone:</span>
                  <span className="text-white">{compte.clients?.phone || compte.clients?.telephone || 'N/A'}</span>
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
                  <span className="text-white">
                    {compte.date_ouverture ? new Date(compte.date_ouverture).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                {showInterest && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Taux d'intérêt:</span>
                    <span className="text-white font-bold">{uiConfig.interestRate}% / an</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Statut:</span>
                  <Badge value={uiConfig.statusLabel} icon={uiConfig.isLocked ? <Lock size={12} /> : undefined} />
                </div>
                {showInterest && monthlyEstimate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Profits estimés:</span>
                    <span className="text-amber-300 font-semibold">
                      +{monthlyEstimate.toLocaleString('fr-FR')} FCFA/mois
                    </span>
                  </div>
                )}
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

                      <div className="flex items-center gap-3">
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
                        
                        {/* Receipt actions */}
                        <TransactionRowActions
                          factureId={transaction.factureId}
                          transactionId={transaction.id}
                          onView={handleView}
                          onDownload={handleDownload}
                          onShare={handleShare}
                        />
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
      
      {/* Receipt Viewer Modal */}
      <ReceiptViewer
        isOpen={isViewerOpen}
        onClose={handleCloseViewer}
        factureId={viewingFactureId || ''}
        format="a4"
      />
    </div>
  );
}
