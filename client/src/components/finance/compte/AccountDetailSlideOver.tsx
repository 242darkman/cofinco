
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, User, TrendingUp, TrendingDown, Calendar,
  DollarSign, Percent, Lock, Download, Copy,
  CreditCard, ExternalLink, ArrowUpRight, ArrowDownLeft,
  AlertTriangle, Banknote
} from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '../../ui/sheet';
import TabGroup from '../../ui/TabGroup';
import Badge from '../../ui/Badge';
import { Button, IconButton } from '../../ui';
import { compteEpargneApi, transactionEpargneApi, sessionCaisseApi } from '../../../lib/api-client';
import { TransactionRowActions } from '../shared/TransactionRowActions';
import { ReceiptViewer } from '../shared/ReceiptViewer';
import { useReceiptActions } from '../../../hooks/finance/useReceiptActions';
import { getAccountBalance, getAccountUiConfig, getMonthlyInterestEstimate, getRealBalance, getPendingDepositAmount } from '../../../lib/account-config';
import { getStatusLabel, ALL_STATUS_LABELS } from '../../../lib/status-labels';
import { computeSessionStatus } from '../../../lib/format';
import { isDepositType, isWithdrawalType } from '@shared/enum/status-constants';
import StatementExportModal from './StatementExportModal';
import { formatClientName } from '../../../lib/format';
import { useLocation } from 'wouter';
import { AccountActivationModal } from '../caisse/AccountActivationModal';
import { compteKeys, caisseKeys } from '../../../lib/query-keys';

// Mapping EN -> FR pour les types de compte
const TYPE_COMPTE_LABELS: Record<string, string> = {
  'CURRENT': 'Courant',
  'SAVINGS': 'Épargne',
  'BLOCKED': 'Bloqué',
};

const getTypeCompteLabel = (type: string): string => {
  return TYPE_COMPTE_LABELS[type] || type;
};

/** Format date safely - handles null, undefined, invalid dates */
const formatDateSafe = (dateValue: any): string => {
  if (!dateValue) return '—';
  const d = new Date(dateValue);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
};

interface ActivationAccountData {
  id: string;
  numeroCompte: string;
  typeCompte: string;
  montantInitial: number;
  client: {
    id: string;
    nom: string;
    prenom: string;
  };
}

interface AccountDetailSlideOverProps {
  compteId: string | null;
  isOpen: boolean;
  onClose: () => void;
  /** Optional callback to handle activation externally (closes slideover and opens modal in parent) */
  onRequestActivation?: (account: ActivationAccountData) => void;
}

export default function AccountDetailSlideOver({ compteId, isOpen, onClose, onRequestActivation }: AccountDetailSlideOverProps) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('transactions');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);

  // --- React Query: Account detail ---
  const compteQuery = useQuery({
    queryKey: compteKeys.detail(compteId || ''),
    queryFn: () => compteEpargneApi.getById(compteId!),
    enabled: isOpen && !!compteId,
  });

  const compte = compteQuery.data || null;

  // --- React Query: Transactions ---
  const transactionsQuery = useQuery({
    queryKey: compteKeys.transactions(compteId || ''),
    queryFn: () => transactionEpargneApi.getByCompte(compteId!),
    enabled: isOpen && !!compteId,
  });

  // Normalize transactions and compute KPIs
  const transactions = useMemo(() => {
    const raw = transactionsQuery.data?.data;
    if (!raw) return [];
    return raw.map((t: any) => {
      const rawType = t.typePaiement || 'Autre';
      const translatedLabel = getStatusLabel(rawType, ALL_STATUS_LABELS);
      return {
        ...t,
        montant: Number(t.montant) || 0,
        soldeApres: Number(t.soldeApres || 0),
        typeTransaction: translatedLabel !== rawType ? translatedLabel : rawType.replace(/ (Épargne|Courant|Bloqué)$/, ''),
        dateTransaction: t.createdAt || new Date().toISOString(),
        description: t.observations || t.typePaiement,
        reference: t.billingReference || t.id?.substring(0, 8)
      };
    });
  }, [transactionsQuery.data]);

  const stats = useMemo(() => {
    return transactions.reduce((acc: { totalDepots: number; totalRetraits: number; nombreTransactions: number }, t: any) => {
      const m = Number(t.montant) || 0;
      const rawType = t.typePaiement || t.typeTransaction || '';
      if (isDepositType(rawType) || (m > 0 && !isWithdrawalType(rawType))) {
        acc.totalDepots += Math.abs(m);
      } else if (isWithdrawalType(rawType) || m < 0) {
        acc.totalRetraits += Math.abs(m);
      }
      acc.nombreTransactions++;
      return acc;
    }, { totalDepots: 0, totalRetraits: 0, nombreTransactions: 0 });
  }, [transactions]);

  const loading = compteQuery.isLoading || transactionsQuery.isLoading;

  // Query for active caisse session (needed for account activation)
  const { data: sessionActive } = useQuery({
    queryKey: caisseKeys.sessionActive(),
    queryFn: async () => {
      const data = await sessionCaisseApi.getActive();
      const status = data ? computeSessionStatus(data) : null;
      if (data && status === 'OPEN') return data;
      return null;
    },
    enabled: isOpen,
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

  // Invalidation helper (replaces loadCompteDetails)
  const invalidateDetails = () => {
    if (compteId) {
      queryClient.invalidateQueries({ queryKey: compteKeys.detail(compteId) });
      queryClient.invalidateQueries({ queryKey: compteKeys.transactions(compteId) });
    }
    queryClient.invalidateQueries({ queryKey: compteKeys.lists() });
    queryClient.invalidateQueries({ queryKey: compteKeys.epargne() });
  };

  const tabs = [
    { key: 'transactions', label: 'Historique', icon: Calendar },
    { key: 'details', label: 'Infos & Titulaire', icon: User },
  ];

  if (!compte && !loading) return null;

  const uiConfig = compte ? getAccountUiConfig(compte, 'staff') : {
      theme: 'blue', type: 'Compte', interestRate: 0, statusLabel: 'Actif', isLocked: false,
      accentClassName: '', bgClassName: '', badgeClassName: '', icon: CreditCard,
      isPendingActivation: false, isPendingPayment: false, isPendingApproval: false
  };

  const balance = compte ? getAccountBalance(compte) : 0;
  const realBalance = compte ? getRealBalance(compte) : 0;
  const pendingAmount = compte ? getPendingDepositAmount(compte) : 0;
  const isPending = uiConfig.isPendingActivation;

  // Gradient based on type
  const getGradient = () => {
    const type = compte?.typeCompte || '';
    if (type.includes('Épargne')) return 'bg-gradient-to-br from-status-success to-accent';
    if (type.includes('Bloqué')) return 'bg-gradient-to-br from-surface-elevated to-surface-base';
    return 'bg-gradient-to-br from-status-info to-accent';
  };

  return (
    <>
      {/* Disable modal behavior (focus trap) and hide overlay when activation modal is open */}
      <Sheet open={isOpen} onOpenChange={onClose} modal={!showActivationModal}>
        <SheetContent side="right" hideOverlay={showActivationModal} className="w-full sm:max-w-xl p-0 flex flex-col bg-surface-base border-l border-edge">
          
          {/* 1. Sticky Header */}
          <div className="flex items-center justify-between p-4 border-b border-edge bg-surface-base/95 backdrop-blur z-10 sticky top-0">
             <div className="flex items-center gap-3">
               <div>
                  <div className="flex items-center gap-2">
                     <SheetTitle className="font-mono text-lg font-bold text-content-primary tracking-tight">
                        {compte?.numeroCompte || 'Chargement...'}
                     </SheetTitle>
                     {compte?.numeroCompte && (
                        <button 
                           onClick={() => navigator.clipboard.writeText(compte.numeroCompte)}
                           className="text-content-muted hover:text-content-primary transition-colors"
                           title="Copier le numéro"
                        >
                           <Copy size={14} />
                        </button>
                     )}
                  </div>
                  <SheetDescription className="sr-only">
                    Détails du compte et historique des transactions
                  </SheetDescription>
                  <div className="text-xs text-content-muted">{getTypeCompteLabel(compte?.typeCompte || '')}</div>
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

          <div className="flex-1 overflow-y-auto pro-scrollbar">
             {loading ? (
                <div className="p-6 flex justify-center">
                   <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
             ) : (
                <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">

                   {/* 2. Hero Section (Virtual Card) - Different for PENDING_ACTIVATION */}
                   {isPending ? (
                     // PENDING ACTIVATION: Special "funds not yet deposited" card
                     <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border-2 border-dashed border-status-warning/50 bg-surface-base p-4 sm:p-6">
                       {/* Hatched pattern background to signify "not yet real" */}
                       <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(135deg,#fff_25%,transparent_25%,transparent_50%,#fff_50%,#fff_75%,transparent_75%,transparent)] bg-[length:20px_20px]" />

                       <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                         <div className="space-y-2 flex-1">
                           <div className="flex items-center gap-2 text-status-warning font-bold text-xs uppercase tracking-wider">
                             <AlertTriangle size={14} />
                             <span>Activation Requise</span>
                           </div>

                           <div className="flex items-center gap-3 opacity-60">
                             <Lock size={24} className="text-content-muted" />
                             <span className="text-4xl font-mono text-content-secondary line-through decoration-content-muted">
                               {pendingAmount.toLocaleString('fr-FR')} <span className="text-lg font-sans">FCFA</span>
                             </span>
                           </div>

                           <p className="text-sm text-content-muted max-w-sm">
                             Ce montant est en attente. Le solde réel du compte est de <strong className="text-content-primary">0 FCFA</strong> tant que le versement initial n'est pas validé.
                           </p>
                         </div>

                         {/* Primary Action: Open activation modal */}
                         <button
                           onClick={() => {
                             if (!sessionActive) {
                               toast.warning('Pour activer un compte, veuillez d\'abord ouvrir une session de caisse');
                               return;
                             }

                             const accountData: ActivationAccountData = {
                               id: compte.id,
                               numeroCompte: compte.numeroCompte || compte.numeroCompte || '',
                               typeCompte: compte.typeCompte || compte.typeCompte || '',
                               montantInitial: getPendingDepositAmount(compte),
                               client: {
                                 id: compte.clients?.id || compte.clientId,
                                 nom: compte.clients?.nom || '',
                                 prenom: compte.clients?.prenom || '',
                               }
                             };

                             // If parent provided a callback, use it (recommended approach)
                             if (onRequestActivation) {
                               onRequestActivation(accountData);
                               return;
                             }

                             // Fallback: use internal modal
                             setShowActivationModal(true);
                           }}
                           className="flex items-center gap-3 px-6 py-4 bg-status-warning hover:bg-status-warning text-white font-bold rounded-xl shadow-lg shadow-status-warning/20 transition-all hover:scale-[1.02]"
                         >
                           <Banknote size={20} />
                           <span>Encaisser maintenant</span>
                         </button>
                       </div>

                       {/* Footer info */}
                       <div className="relative z-10 flex justify-between items-end text-sm mt-6 pt-4 border-t border-edge">
                         <div>
                           <div className="text-xs text-content-muted uppercase tracking-wider mb-0.5">Titulaire</div>
                           <div className="text-content-muted">{formatClientName(compte.clients?.nom, compte.clients?.prenom)}</div>
                         </div>
                         <div className="text-right">
                           <div className="text-xs text-content-muted uppercase tracking-wider mb-0.5">Ouverture</div>
                           <div className="text-content-muted">{formatDateSafe(compte.dateOuverture || compte.createdAt)}</div>
                         </div>
                       </div>
                     </div>
                   ) : (
                     // ACTIVE: Standard balance card - Compact & Responsive
                     <div className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 text-white shadow-xl relative overflow-hidden ${getGradient()}`}>
                        <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                        <div className="relative z-10">
                           <div className="flex justify-between items-start mb-3 sm:mb-4">
                              <p className="text-white/80 text-xs sm:text-sm font-medium">Solde Disponible</p>
                              {(() => {
                                 const Icon = uiConfig.icon;
                                 return <Icon className="text-white/70 w-5 h-5 sm:w-6 sm:h-6" />;
                              })()}
                           </div>

                           <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold font-mono tracking-tight mb-4 sm:mb-6">
                              {realBalance.toLocaleString('fr-FR')} <span className="text-sm sm:text-lg text-white/60 font-sans">FCFA</span>
                           </h1>

                           <div className="flex justify-between items-end text-xs sm:text-sm text-white/90 font-medium">
                              <div className="min-w-0 flex-1 mr-3">
                                 <div className="text-[10px] sm:text-xs text-white/60 uppercase tracking-wider mb-0.5">Titulaire</div>
                                 <div className="truncate">{formatClientName(compte.clients?.nom, compte.clients?.prenom) || '—'}</div>
                              </div>
                              <div className="text-right shrink-0">
                                 <div className="text-[10px] sm:text-xs text-white/60 uppercase tracking-wider mb-0.5">Ouverture</div>
                                 <div>{formatDateSafe(compte.dateOuverture || compte.createdAt)}</div>
                              </div>
                           </div>
                        </div>
                     </div>
                   )}

                   {/* KPIs (In/Out) - Compact */}
                   <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <div className="bg-surface/50 p-2 sm:p-3 rounded-lg sm:rounded-xl border border-edge-subtle flex items-center gap-2 sm:gap-3">
                         <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-status-success-bg flex items-center justify-center text-status-success shrink-0">
                            <ArrowDownLeft size={14} className="sm:w-4 sm:h-4" />
                         </div>
                         <div className="min-w-0">
                            <div className="text-[10px] sm:text-xs text-content-muted">Entrées</div>
                            <div className="text-xs sm:text-sm font-bold text-status-success truncate">+{stats.totalDepots.toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="bg-surface/50 p-2 sm:p-3 rounded-lg sm:rounded-xl border border-edge-subtle flex items-center gap-2 sm:gap-3">
                         <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-status-danger-bg flex items-center justify-center text-status-danger shrink-0">
                            <ArrowUpRight size={14} className="sm:w-4 sm:h-4" />
                         </div>
                         <div className="min-w-0">
                            <div className="text-[10px] sm:text-xs text-content-muted">Sorties</div>
                            <div className="text-xs sm:text-sm font-bold text-status-danger truncate">-{stats.totalRetraits.toLocaleString()}</div>
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

                   <div className="mt-3 sm:mt-4">
                      {activeTab === 'transactions' && (
                         <div className="space-y-2 sm:space-y-3">
                            <div className="flex justify-between items-center pb-1 sm:pb-2">
                               <h3 className="text-xs sm:text-sm font-semibold text-content-primary">Dernières opérations</h3>
                               <span className="text-[10px] sm:text-xs text-content-muted">{transactions.length} transactions</span>
                            </div>

                            {transactions.length === 0 ? (
                               <div className="text-center py-6 sm:py-10 text-content-muted text-xs sm:text-sm bg-surface/30 rounded-lg sm:rounded-xl border border-edge">
                                  Aucune transaction
                               </div>
                            ) : (
                               transactions.map((t) => {
                                  const isDebit = isWithdrawalType(t.typePaiement) || t.montant < 0;
                                  return (
                                  <div key={t.id} className="bg-surface/30 border border-edge-subtle p-2 sm:p-3 rounded-lg sm:rounded-xl flex items-center justify-between hover:bg-surface/50 transition-colors group">
                                     <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${
                                           !isDebit ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger'
                                        }`}>
                                           {!isDebit ? <TrendingUp size={14} className="sm:w-[18px] sm:h-[18px]"/> : <TrendingDown size={14} className="sm:w-[18px] sm:h-[18px]"/>}
                                        </div>
                                        <div className="min-w-0">
                                           <div className="font-medium text-content-secondary text-xs sm:text-sm truncate">{t.typeTransaction}</div>
                                           <div className="text-[10px] sm:text-xs text-content-muted">
                                             {new Date(t.dateTransaction).toLocaleDateString()} • {new Date(t.dateTransaction).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                           </div>
                                        </div>
                                     </div>
                                     <div className="text-right shrink-0 ml-2">
                                        <div className={`font-mono font-bold text-xs sm:text-sm ${!isDebit ? 'text-status-success' : 'text-status-danger'}`}>
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
                         <div className="space-y-3 sm:space-y-4">
                            {/* Information Titulaire - Compact */}
                            <div className="bg-surface/30 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-edge-subtle">
                               <h3 className="text-xs sm:text-sm font-semibold text-content-primary mb-2 sm:mb-3 flex items-center gap-2">
                                  <User size={14} className="text-accent sm:w-4 sm:h-4"/>
                                  Information Titulaire
                               </h3>
                               <div className="space-y-0 text-xs sm:text-sm divide-y divide-edge/50">
                                  <div className="flex justify-between items-center py-1.5 sm:py-2">
                                     <span className="text-content-muted">Nom Complet</span>
                                     <span className="text-content-primary font-medium truncate ml-2 text-right">{formatClientName(compte.clients?.nom, compte.clients?.prenom) || '—'}</span>
                                  </div>
                                  <div className="flex justify-between items-center py-1.5 sm:py-2">
                                     <span className="text-content-muted">Téléphone</span>
                                     <span className="text-content-primary font-mono text-[11px] sm:text-sm">{compte.clients?.telephone || '—'}</span>
                                  </div>
                                  <div className="flex justify-between items-center py-1.5 sm:py-2">
                                     <span className="text-content-muted">Email</span>
                                     <span className="text-content-primary truncate ml-2 text-right max-w-[160px] sm:max-w-none">{compte.clients?.email || '—'}</span>
                                  </div>
                               </div>
                            </div>

                            {/* Détails Compte - Compact */}
                            <div className="bg-surface/30 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-edge-subtle">
                               <h3 className="text-xs sm:text-sm font-semibold text-content-primary mb-2 sm:mb-3 flex items-center gap-2">
                                  <CreditCard size={14} className="text-status-success sm:w-4 sm:h-4"/>
                                  Détails Compte
                               </h3>
                               <div className="space-y-0 text-xs sm:text-sm divide-y divide-edge/50">
                                  <div className="flex justify-between items-center py-1.5 sm:py-2">
                                     <span className="text-content-muted">Numéro</span>
                                     <span className="text-content-primary font-mono text-[11px] sm:text-sm">{compte.numeroCompte}</span>
                                  </div>
                                  <div className="flex justify-between items-center py-1.5 sm:py-2">
                                     <span className="text-content-muted">Date d'ouverture</span>
                                     <span className="text-content-primary">{formatDateSafe(compte.dateOuverture || compte.createdAt)}</span>
                                  </div>
                                  {uiConfig.interestRate > 0 && (
                                     <div className="flex justify-between items-center py-1.5 sm:py-2">
                                        <span className="text-content-muted">Taux d'intérêt</span>
                                        <div className="flex items-center gap-1 text-status-success font-bold">
                                           <Percent size={10} className="sm:w-3 sm:h-3"/>
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

      {/* Account Activation Modal */}
      {showActivationModal && compte && sessionActive && (
        <AccountActivationModal
          account={{
            id: compte.id,
            numeroCompte: compte.numeroCompte || compte.numeroCompte || '',
            typeCompte: compte.typeCompte || compte.typeCompte || '',
            montantInitial: getPendingDepositAmount(compte),
            client: {
              id: compte.clients?.id || compte.clientId,
              nom: compte.clients?.nom || '',
              prenom: compte.clients?.prenom || '',
            }
          }}
          sessionId={sessionActive.id}
          caisseName={sessionActive.caisseNom}
          onClose={() => setShowActivationModal(false)}
          onSuccess={() => {
            setShowActivationModal(false);
            invalidateDetails();
          }}
        />
      )}
    </>
  );
}
