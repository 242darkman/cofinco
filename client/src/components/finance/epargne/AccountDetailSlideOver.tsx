
import React, { useState, useEffect } from 'react';
import {
  X, User, TrendingUp, TrendingDown, Calendar,
  DollarSign, Percent, Lock, Download, Copy,
  CreditCard, ExternalLink, ArrowUpRight, ArrowDownLeft,
  AlertTriangle, Banknote
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '../../ui/sheet';
import TabGroup from '../../ui/TabGroup';
import Badge from '../../ui/Badge';
import { Button, IconButton } from '../../ui';
import { compteEpargneApi, transactionEpargneApi, clientApi } from '../../../lib/api-client';
import { TransactionRowActions } from '../shared/TransactionRowActions';
import { ReceiptViewer } from '../shared/ReceiptViewer';
import { useReceiptActions } from '../../../hooks/finance/useReceiptActions';
import { getAccountBalance, getAccountUiConfig, getMonthlyInterestEstimate, getRealBalance, getPendingDepositAmount } from '../../../lib/account-config';
import { getStatusLabel, ALL_STATUS_LABELS } from '../../../lib/status-labels';
import { isDepositType, isWithdrawalType } from '@shared/enum/status-constants';
import StatementExportModal from './StatementExportModal';
import { formatClientName } from '../../../lib/format';
import { useLocation } from 'wouter';

// Mapping EN -> FR pour les types de compte
const TYPE_COMPTE_LABELS: Record<string, string> = {
  'CURRENT': 'Courant',
  'SAVINGS': 'Épargne',
  'BLOCKED': 'Bloqué',
};

const getTypeCompteLabel = (type: string): string => {
  return TYPE_COMPTE_LABELS[type] || type;
};

interface AccountDetailSlideOverProps {
  compteId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountDetailSlideOver({ compteId, isOpen, onClose }: AccountDetailSlideOverProps) {
  const [, navigate] = useLocation();
  const [compte, setCompte] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('transactions');
  const [showExportModal, setShowExportModal] = useState(false);
  const [stats, setStats] = useState({
    totalDepots: 0,
    totalRetraits: 0,
    nombreTransactions: 0
  });

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
    if (isOpen && compteId) {
      loadCompteDetails();
    }
  }, [isOpen, compteId]);

  const loadCompteDetails = async () => {
    if (!compteId) return;
    setLoading(true);
    try {
      // Parallel fetching for speed
      const [comptesResponse, transactionsData, clientsResponse] = await Promise.all([
        compteEpargneApi.getAll(),
        transactionEpargneApi.getByCompte(compteId),
        clientApi.getAllList()
      ]);

      // Handle Data
      const comptesResponseAny = comptesResponse as any;
      const comptesData = Array.isArray(comptesResponse) ? comptesResponse : (comptesResponseAny.data || []);
      const clientsData = Array.isArray(clientsResponse) ? clientsResponse : ((clientsResponse as any).data || []);

      const compteData = comptesData.find((c: any) => c.id === compteId);
      
      if (compteData) {
        // Resolve client
        const clientId = compteData.client_id || compteData.clientId;
        let client = clientsData.find((c: any) => c.id === clientId);
        if (!client && compteData.clients) client = compteData.clients;

        setCompte({
          ...compteData,
          clients: client || { nom: 'Inconnu', email: '', phone: '' }
        });
      }

      if (transactionsData) {
        // Normalize transactions
         const normalizedTransactions = transactionsData.map((t: any) => {
            const rawType = t.typePaiement || t.type_paiement || 'Autre';
            // Try to translate using the raw enum value
            const translatedLabel = getStatusLabel(rawType, ALL_STATUS_LABELS);
            
            return {
              ...t,
              montant: Number(t.montant) || 0,
              solde_apres: Number(t.solde_apres || t.soldeApres || 0),
              type_transaction: translatedLabel !== rawType ? translatedLabel : rawType.replace(/ (Épargne|Courant|Bloqué)$/, ''),
              date_transaction: t.createdAt || t.created_at || new Date().toISOString(),
              description: t.observations || t.typePaiement,
              reference: t.billingReference || t.billing_reference || t.id?.substring(0, 8)
            };
          });
          
          setTransactions(normalizedTransactions);
          
          // KPIs using type-safe helper functions
          const kpi = normalizedTransactions.reduce((acc: { totalDepots: number; totalRetraits: number; nombreTransactions: number }, t: { montant: number; type_transaction: string; typePaiement?: string }) => {
             const m = Number(t.montant) || 0;
             const rawType = t.typePaiement || t.type_transaction || '';

             // Use helper functions that check enum values + fallback patterns
             if (isDepositType(rawType) || (m > 0 && !isWithdrawalType(rawType))) {
               acc.totalDepots += Math.abs(m);
             } else if (isWithdrawalType(rawType) || m < 0) {
               acc.totalRetraits += Math.abs(m);
             }

             acc.nombreTransactions++;
             return acc;
          }, { totalDepots: 0, totalRetraits: 0, nombreTransactions: 0 });
          setStats(kpi);
      }

    } catch (e) {
      console.error("Error loading details", e);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { key: 'transactions', label: 'Historique', icon: Calendar },
    { key: 'details', label: 'Infos & Titulaire', icon: User },
  ];

  if (!compte && !loading) return null;

  const uiConfig = compte ? getAccountUiConfig(compte, 'staff') : {
      theme: 'blue', type: 'Compte', interestRate: 0, statusLabel: 'Actif', isLocked: false,
      accentClassName: '', bgClassName: '', badgeClassName: '', icon: CreditCard, isPendingActivation: false
  };

  const balance = compte ? getAccountBalance(compte) : 0;
  const realBalance = compte ? getRealBalance(compte) : 0;
  const pendingAmount = compte ? getPendingDepositAmount(compte) : 0;
  const isPending = uiConfig.isPendingActivation;

  // Gradient based on type
  const getGradient = () => {
    const type = compte?.type_compte || '';
    if (type.includes('Épargne')) return 'bg-gradient-to-br from-emerald-600 to-teal-800';
    if (type.includes('Bloqué')) return 'bg-gradient-to-br from-slate-700 to-slate-900';
    return 'bg-gradient-to-br from-blue-600 to-indigo-900';
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col bg-slate-900 border-l border-slate-800">
          
          {/* 1. Sticky Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur z-10 sticky top-0">
             <div className="flex items-center gap-3">
               <div>
                  <div className="flex items-center gap-2">
                     <SheetTitle className="font-mono text-lg font-bold text-white tracking-tight">
                        {compte?.numero_compte || 'Chargement...'}
                     </SheetTitle>
                     {compte?.numero_compte && (
                        <button 
                           onClick={() => navigator.clipboard.writeText(compte.numero_compte)}
                           className="text-slate-500 hover:text-white transition-colors"
                           title="Copier le numéro"
                        >
                           <Copy size={14} />
                        </button>
                     )}
                  </div>
                  <SheetDescription className="sr-only">
                    Détails du compte et historique des transactions
                  </SheetDescription>
                  <div className="text-xs text-slate-400">{getTypeCompteLabel(compte?.type_compte || '')}</div>
               </div>
               {compte && (
                 <Badge 
                    value={uiConfig.statusLabel} 
                    icon={uiConfig.isLocked ? <Lock size={10} /> : undefined} 
                    size="sm"
                 />
               )}
             </div>
             
             <div className="flex gap-2">
                <Button 
                   variant="ghost" 
                   size="sm"
                   onClick={() => setShowExportModal(true)}
                   className="hidden sm:flex"
                   icon={Download}
                >
                   Relevé
                </Button>
                <IconButton 
                   icon={Download} 
                   variant="ghost" 
                   onClick={() => setShowExportModal(true)}
                   className="sm:hidden" 
                   aria-label="Exporter Relevé"
                />
                {/* Close handled by SheetPrimitive but added strictly if needed or default X works */}
             </div>
          </div>

          <div className="flex-1 overflow-y-auto">
             {loading ? (
                <div className="p-8 flex justify-center">
                   <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
             ) : (
                <div className="p-4 space-y-6">
                   
                   {/* 2. Hero Section (Virtual Card) - Different for PENDING_ACTIVATION */}
                   {isPending ? (
                     // PENDING ACTIVATION: Special "funds not yet deposited" card
                     <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-amber-500/50 bg-slate-900 p-6">
                       {/* Hatched pattern background to signify "not yet real" */}
                       <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(135deg,#fff_25%,transparent_25%,transparent_50%,#fff_50%,#fff_75%,transparent_75%,transparent)] bg-[length:20px_20px]" />

                       <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                         <div className="space-y-2 flex-1">
                           <div className="flex items-center gap-2 text-amber-500 font-bold text-xs uppercase tracking-wider">
                             <AlertTriangle size={14} />
                             <span>Activation Requise</span>
                           </div>

                           <div className="flex items-center gap-3 opacity-60">
                             <Lock size={24} className="text-slate-400" />
                             <span className="text-4xl font-mono text-slate-300 line-through decoration-slate-600">
                               {pendingAmount.toLocaleString('fr-FR')} <span className="text-lg font-sans">FCFA</span>
                             </span>
                           </div>

                           <p className="text-sm text-slate-500 max-w-sm">
                             Ce montant est en attente. Le solde réel du compte est de <strong className="text-white">0 FCFA</strong> tant que le versement initial n'est pas validé.
                           </p>
                         </div>

                         {/* Primary Action: Go to cash register */}
                         <button
                           onClick={() => {
                             onClose();
                             navigate(`/caisse?ref=${compte.numero_compte}&amount=${pendingAmount}`);
                           }}
                           className="flex items-center gap-3 px-6 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl shadow-lg shadow-amber-900/20 transition-all hover:scale-[1.02]"
                         >
                           <Banknote size={20} />
                           <span>Encaisser maintenant</span>
                         </button>
                       </div>

                       {/* Footer info */}
                       <div className="relative z-10 flex justify-between items-end text-sm mt-6 pt-4 border-t border-slate-800">
                         <div>
                           <div className="text-xs text-slate-600 uppercase tracking-wider mb-0.5">Titulaire</div>
                           <div className="text-slate-400">{formatClientName(compte.clients?.nom, compte.clients?.prenom)}</div>
                         </div>
                         <div className="text-right">
                           <div className="text-xs text-slate-600 uppercase tracking-wider mb-0.5">Ouverture</div>
                           <div className="text-slate-400">{new Date(compte.date_ouverture || compte.createdAt).toLocaleDateString()}</div>
                         </div>
                       </div>
                     </div>
                   ) : (
                     // ACTIVE: Standard balance card
                     <div className={`rounded-2xl p-6 text-white shadow-xl relative overflow-hidden ${getGradient()}`}>
                        <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                        <div className="relative z-10">
                           <div className="flex justify-between items-start mb-6">
                              <p className="opacity-80 text-sm font-medium">Solde Disponible</p>
                              {(() => {
                                 const Icon = uiConfig.icon;
                                 return <Icon className="text-white/80" />;
                              })()}
                           </div>

                           <h1 className="text-4xl font-bold font-mono tracking-tight mb-8">
                              {realBalance.toLocaleString('fr-FR')} <span className="text-lg opacity-60 font-sans">FCFA</span>
                           </h1>

                           <div className="flex justify-between items-end text-sm opacity-90 font-medium">
                              <div>
                                 <div className="text-xs opacity-60 uppercase tracking-wider mb-0.5">Titulaire</div>
                                 <div>{formatClientName(compte.clients?.nom, compte.clients?.prenom)}</div>
                              </div>
                              <div className="text-right">
                                 <div className="text-xs opacity-60 uppercase tracking-wider mb-0.5">Ouverture</div>
                                 <div>{new Date(compte.date_ouverture || compte.createdAt).toLocaleDateString()}</div>
                              </div>
                           </div>
                        </div>
                     </div>
                   )}

                   {/* KPIs (In/Out) */}
                   <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <ArrowDownLeft size={16} />
                         </div>
                         <div>
                            <div className="text-xs text-slate-500">Entrées</div>
                            <div className="text-sm font-bold text-emerald-400">+{stats.totalDepots.toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                            <ArrowUpRight size={16} />
                         </div>
                         <div>
                            <div className="text-xs text-slate-500">Sorties</div>
                            <div className="text-sm font-bold text-red-400">-{stats.totalRetraits.toLocaleString()}</div>
                         </div>
                      </div>
                   </div>

                   {/* 3. Tabs & Content */}
                   <TabGroup 
                      tabs={tabs} 
                      activeTab={activeTab} 
                      onTabChange={setActiveTab} 
                      variant="underline"
                      fullWidth
                   />

                   <div className="mt-4">
                      {activeTab === 'transactions' && (
                         <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2">
                               <h3 className="text-sm font-semibold text-white">Dernières opérations</h3>
                               <span className="text-xs text-slate-500">{transactions.length} transactions</span>
                            </div>
                            
                            {transactions.length === 0 ? (
                               <div className="text-center py-10 text-slate-500 bg-slate-800/30 rounded-xl border border-slate-800">
                                  Aucune transaction
                               </div>
                            ) : (
                               transactions.map((t) => {
                                  const isDebit = isWithdrawalType(t.typePaiement) || t.montant < 0;
                                  return (
                                  <div key={t.id} className="bg-slate-800/30 border border-slate-700/50 p-3 rounded-xl flex items-center justify-between hover:bg-slate-800/50 transition-colors group">
                                     <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                           !isDebit ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                        }`}>
                                           {!isDebit ? <TrendingUp size={18}/> : <TrendingDown size={18}/>}
                                        </div>
                                        <div>
                                           <div className="font-medium text-slate-200 text-sm">{t.type_transaction}</div>
                                           <div className="text-xs text-slate-500">
                                             {new Date(t.date_transaction).toLocaleDateString()} • {new Date(t.date_transaction).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                           </div>
                                        </div>
                                     </div>
                                     <div className="text-right">
                                        <div className={`font-mono font-bold text-sm ${!isDebit ? 'text-emerald-400' : 'text-red-400'}`}>
                                           {!isDebit ? '+' : '-'}{Math.abs(t.montant).toLocaleString()}
                                        </div>
                                        {/* Actions opacity 0 until hover */}
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity"> 
                                            <TransactionRowActions
                                               factureId={t.factureId}
                                               transactionId={t.id}
                                               onView={handleView}
                                               onDownload={handleDownload}
                                               onShare={handleShare}
                                               compact
                                            />
                                        </div>
                                     </div>
                                  </div>
                                  );
                               })
                            )}
                         </div>
                      )}

                      {activeTab === 'details' && (
                         <div className="space-y-6">
                            <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                               <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                  <User size={16} className="text-cyan-400"/>
                                  Information Titulaire
                               </h3>
                               <div className="space-y-3 text-sm">
                                  <div className="flex justify-between py-2 border-b border-slate-700/50">
                                     <span className="text-slate-500">Nom Complet</span>
                                     <span className="text-white font-medium">{formatClientName(compte.clients?.nom, compte.clients?.prenom)}</span>
                                  </div>
                                  <div className="flex justify-between py-2 border-b border-slate-700/50">
                                     <span className="text-slate-500">Téléphone</span>
                                     <span className="text-white">{compte.clients?.phone || compte.clients?.telephone || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between py-2">
                                     <span className="text-slate-500">Email</span>
                                     <span className="text-white">{compte.clients?.email || 'N/A'}</span>
                                  </div>
                               </div>
                            </div>

                            <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                               <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                  <CreditCard size={16} className="text-emerald-400"/>
                                  Détails Compte
                               </h3>
                               <div className="space-y-3 text-sm">
                                  <div className="flex justify-between py-2 border-b border-slate-700/50">
                                     <span className="text-slate-500">Numéro</span>
                                     <span className="text-white font-mono">{compte.numero_compte}</span>
                                  </div>
                                  <div className="flex justify-between py-2 border-b border-slate-700/50">
                                     <span className="text-slate-500">Date d'ouverture</span>
                                     <span className="text-white">{new Date(compte.date_ouverture).toLocaleDateString()}</span>
                                  </div>
                                  {uiConfig.interestRate > 0 && (
                                     <div className="flex justify-between py-2 border-b border-slate-700/50">
                                        <span className="text-slate-500">Taux d'intérêt</span>
                                        <div className="flex items-center gap-1 text-emerald-400 font-bold">
                                           <Percent size={12}/>
                                           {uiConfig.interestRate}%
                                        </div>
                                     </div>
                                  )}
                               </div>
                            </div>
                         </div>
                      )}
                   </div>
                </div>
             )}
          </div>
        </SheetContent>
      </Sheet>

      {compte && (
        <StatementExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          compte={compte}
          transactions={transactions}
        />
      )}

      {/* Receipt Viewer */}
      <ReceiptViewer
        isOpen={isViewerOpen}
        onClose={handleCloseViewer}
        factureId={viewingFactureId || ''}
        format="a4"
      />
    </>
  );
}
