import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, User, FileText, TrendingUp, Download, PieChart, Clock, CalendarClock, Settings } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { creditApi, clientApi, compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { Button, StatCard, TabGroup } from '../../ui';
import { formatMoney, parseMoney, formatClientName } from '../../../lib/format';
import { generateLoanSchedule, getInstallmentStatusLabel } from '../../../lib/credit-logic';
import { StatutEcheanceCredit, TypeCompte } from '@shared/enum/status-constants';
import { CreditSchedulePDF } from '../../ui/printable/CreditScheduleTemplate';
import { fr } from 'date-fns/locale';
import { format } from 'date-fns';
import { SkeletonCard } from '../../ui/Skeleton';
import { CreditTimeline } from './CreditTimeline';
import { typeCreditLabel } from '../../../lib/credit-labels';

interface Credit {
  id: string;
  clientId: string;
  numeroCredit: string;
  montant: string | number;
  taux: string | number;
  soldeRestant: string | number;
  typeCredit?: string;
  objetCredit?: string;
  dateDebut?: string;
  duree?: number;
  echeance?: string;
  statut: string;
  observations?: string;
  garanties?: string;
  nombre_echeances_total?: number;
  nombre_echeances_payees?: number;
  fraisEngagementPayes?: boolean;
  remboursementAutomatique?: boolean;
  remboursementCompteId?: string;
  prochaineEcheance?: string;
  montantEcheance?: number;
  demandeId?: string;
}

interface Client {
  id: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  score?: number;
  segment?: string;
  numeroCompte?: string;
}

interface CreditDetailModalProps {
  creditId: string;
  onClose: () => void;
}

export default function CreditDetailModal({ creditId, onClose }: CreditDetailModalProps) {
  const [credit, setCredit] = useState<Credit | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule'>('overview');
  // Auto-repayment states
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingAutoRepay, setUpdatingAutoRepay] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Echeancier-${credit?.numeroCredit || 'Credit'}`,
  });

  const loadCreditDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const creditData = await creditApi.getById(creditId);
      setCredit(creditData);

      if (creditData.clientId) {
        try {
          const clientData = await clientApi.getById(creditData.clientId);
          setClient(clientData);
          
          // Load accounts for auto-repayment
          const accountsData = await compteEpargneApi.getByClient(creditData.clientId);
          setAccounts(accountsData || []);
        } catch (clientError) {
          console.warn('Client non trouvé:', clientError);
        }
      }
    } catch (err) {
      const errorMessage = handleApiError(err, 'Erreur lors du chargement du crédit');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAutoRepayment = async (enabled: boolean, accountId?: string) => {
    if (!credit) return;
    setUpdatingAutoRepay(true);
    try {
        await creditApi.update(credit.id, {
            remboursementAutomatique: enabled,
            remboursementCompteId: enabled ? accountId : null
        });
        
        // Optimistic update
        setCredit(prev => prev ? ({ 
            ...prev, 
            remboursementAutomatique: enabled,
            remboursementCompteId: enabled ? accountId : undefined
        }) : null);
        
        toast.success("Configuration mise à jour");
    } catch (error) {
        toast.error(handleApiError(error, "Erreur mise à jour"));
    } finally {
        setUpdatingAutoRepay(false);
    }
  };

  useEffect(() => {
    loadCreditDetails();
  }, [creditId]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const financialData = useMemo(() => {
    if (!credit) return null;

    const montant = parseMoney(credit.montant);
    const taux = parseMoney(credit.taux);
    const soldeRestantRaw = credit.soldeRestant !== undefined && credit.soldeRestant !== null 
      ? parseMoney(credit.soldeRestant) 
      : montant;
    
    const soldeRestant = soldeRestantRaw;
    const totalAvecInterets = montant * (1 + taux / 100);
    const totalPaye = Math.max(0, totalAvecInterets - soldeRestant);
    const progression = totalAvecInterets > 0 ? ((totalPaye / totalAvecInterets) * 100) : 0;

    const schedule = generateLoanSchedule({
      principal: montant,
      annualRate: taux,
      frequency: (credit.echeance || 'Mensuel') as any,
      startDate: credit.dateDebut ? new Date(credit.dateDebut) : new Date(),
      totalInstallments: credit.duree || 0,
      totalPaid: totalPaye
    });

    const installmentAmount = schedule.length > 0 ? schedule[0].amount : 0;

    return { 
      montant, 
      taux, 
      soldeRestant, 
      totalAvecInterets, 
      totalPaye, 
      progression: Math.min(progression, 100),
      schedule,
      installmentAmount
    };
  }, [credit]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-surface-base rounded-xl border border-edge w-full max-w-4xl p-4 sm:p-6 space-y-4">
          <div className="flex justify-between items-center">
            <SkeletonCard className="h-6 sm:h-8 w-40 sm:w-48" />
            <SkeletonCard className="h-6 sm:h-8 w-6 sm:w-8 rounded-full" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} className="h-20" />)}
          </div>
          <SkeletonCard className="h-48 sm:h-64" />
        </div>
      </div>
    );
  }

  if (error || !credit) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-surface-base rounded-xl border border-edge p-6 text-center max-w-md">
          <p className="text-status-danger mb-4 text-sm">{error || 'Crédit non trouvé'}</p>
          <Button onClick={onClose} variant="primary">Fermer</Button>
        </div>
      </div>
    );
  }

  const stats = financialData!;
  const { montant, taux, soldeRestant, totalAvecInterets, totalPaye, progression } = stats;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-surface-base rounded-xl sm:rounded-2xl border border-edge w-full max-w-6xl max-h-[98vh] sm:max-h-[95vh] flex flex-col sm:flex-row overflow-hidden shadow-2xl">

        {/* Left Sidebar: Timeline - Hidden on mobile, visible on lg+ */}
        <div className="hidden lg:flex lg:w-64 xl:w-72 border-r border-edge bg-surface-base/50 flex-col">
           <div className="p-3 border-b border-edge bg-surface/80">
              <h3 className="text-xs font-bold text-content-secondary uppercase tracking-wider flex items-center gap-1.5">
                 <Clock size={14} className="text-status-info" />
                 Parcours
              </h3>
           </div>
           <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              {credit.demandeId ? (
                 <CreditTimeline demandeId={credit.demandeId} compact />
              ) : (
                 <div className="text-center py-6 text-content-muted italic text-xs">
                    Liaison demande indisponible
                 </div>
              )}
           </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-surface">
        {/* Header - Compact */}
        <div className="p-3 sm:p-4 border-b border-edge shrink-0">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-xl font-bold text-content-primary uppercase tracking-tight">
                  Dossier Crédit
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide shrink-0 ${
                    credit.fraisEngagementPayes
                    ? 'bg-status-success-bg text-status-success border-status-success/20'
                    : 'bg-status-warning-bg text-status-warning border-status-warning/20'
                }`}>
                    {credit.fraisEngagementPayes ? 'Frais Payes' : 'Frais Non Payes'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-content-muted font-medium mt-1 truncate">
                #{credit.numeroCredit} - {client ? formatClientName(client.nom, client.prenom) : 'Sans client'}
              </p>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <Button
                 variant="ghost"
                 size="sm"
                 icon={Download}
                 onClick={() => handlePrint()}
                 className="text-content-muted hover:text-content-primary hidden sm:flex"
              >
                <span className="hidden md:inline">PDF</span>
              </Button>
              <button
                onClick={() => handlePrint()}
                className="sm:hidden p-1.5 text-content-muted hover:text-content-primary transition hover:bg-surface-elevated rounded-lg"
              >
                <Download size={18} />
              </button>
              <button onClick={onClose} className="text-content-muted hover:text-content-primary transition p-1.5 hover:bg-surface-elevated rounded-lg">
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs navigation - Compact */}
        <div className="px-3 sm:px-4 border-b border-edge shrink-0 bg-surface/50">
          <TabGroup
            tabs={[
              { key: 'overview', label: "Vue d'ensemble" },
              { key: 'schedule', label: "Échéancier complet" }
            ]}
            activeTab={activeTab}
            onTabChange={(key) => setActiveTab(key as any)}
            variant="pills"
            className="py-1.5"
          />
        </div>

        <div className="p-3 sm:p-4 md:p-5 overflow-y-auto flex-grow custom-scrollbar">
          {activeTab === 'overview' ? (
            <div className="space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Financial Summary - Compact Responsive Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                <StatCard
                  title="Capital"
                  value={<span className="tabular-nums text-sm sm:text-base">{formatMoney(montant)}</span>}
                  color="primary"
                  variant="glass"
                  className="p-3"
                />
                <StatCard
                  title="Reste à payer"
                  value={<span className="tabular-nums text-sm sm:text-base">{formatMoney(soldeRestant)}</span>}
                  color="warning"
                  variant="glass"
                  className="p-3"
                />
                <StatCard
                  title="Déjà remboursé"
                  value={<span className="tabular-nums text-sm sm:text-base">{formatMoney(totalPaye)}</span>}
                  color="success"
                  variant="glass"
                  className="p-3"
                />
                <StatCard
                  title="Taux d'intérêt"
                  value={<span className="text-sm sm:text-base">{taux}%</span>}
                  color="neutral"
                  variant="glass"
                  className="p-3"
                />
              </div>

              {/* Details Grid - Compact & Responsive */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                {client && (
                  <div className="bg-surface/40 rounded-lg p-3 border border-edge-subtle">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <User size={14} className="text-status-info" />
                      <span className="text-content-secondary text-xs font-medium">Client</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-content-muted text-xs">Nom</span>
                        <span className="text-content-primary font-medium text-xs truncate ml-2">{formatClientName(client.nom, client.prenom)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-content-muted text-xs">Téléphone</span>
                        <span className="text-content-secondary text-xs">{client.telephone || '-'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Auto Repayment Config - Compact */}
                <div className="bg-surface/40 rounded-lg p-3 border border-edge-subtle">
                   <div className="flex items-center gap-1.5 mb-2.5">
                      <Settings size={14} className="text-status-info" />
                      <span className="text-content-secondary text-xs font-medium">Automatisation</span>
                   </div>

                   <div className="space-y-3">
                      <div className="flex items-center justify-between">
                         <span className="text-content-muted text-xs">Remboursement Auto</span>
                         <label className="relative inline-flex items-center cursor-pointer">
                            <input
                               type="checkbox"
                               checked={!!credit.remboursementAutomatique}
                               onChange={(e) => handleUpdateAutoRepayment(e.target.checked, credit.remboursementCompteId || accounts.find(a => a.typeCompte === TypeCompte.CURRENT)?.id)}
                               className="sr-only peer"
                               disabled={updatingAutoRepay}
                            />
                            <div className="w-8 h-4 bg-edge-strong peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-status-info rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[2px] after:bg-white after:shadow-md after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-status-info"></div>
                         </label>
                      </div>

                      {credit.remboursementAutomatique && (
                         <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                             <span className="text-[10px] text-content-muted uppercase tracking-wider font-bold">Compte Source</span>
                             <select
                                value={credit.remboursementCompteId || ''}
                                onChange={(e) => handleUpdateAutoRepayment(true, e.target.value)}
                                className="w-full bg-surface-base border border-edge rounded-lg px-2 py-1.5 text-xs text-content-primary focus:outline-none focus:border-status-info"
                                disabled={updatingAutoRepay}
                             >
                                <option value="" disabled>Sélectionner un compte</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                        {acc.numeroCompte} ({acc.typeCompte}) - {formatMoney(acc.soldeCourant || 0)}
                                    </option>
                                ))}
                             </select>

                             {credit.prochaineEcheance && (
                                 <div className="flex items-center gap-1.5 text-[10px] text-status-info bg-status-info-bg p-1.5 rounded">
                                     <CalendarClock size={10} />
                                     Prochain: {new Date(credit.prochaineEcheance).toLocaleDateString()}
                                 </div>
                             )}
                         </div>
                      )}
                   </div>
                </div>

                <div className="bg-surface/40 rounded-lg p-3 border border-edge-subtle md:col-span-2">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <FileText size={14} className="text-status-info" />
                    <span className="text-content-secondary text-xs font-medium">Contrat</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="flex flex-col">
                      <span className="text-content-muted text-xs mb-0.5">Type</span>
                      <span className="text-content-primary font-medium text-xs">{typeCreditLabel(credit.typeCredit)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-content-muted text-xs mb-0.5">Durée</span>
                      <span className="text-content-secondary text-xs">
                        {credit.duree} {credit.echeance === 'Journalier' ? 'jours' : credit.echeance === 'Hebdomadaire' ? 'sem' : 'mois'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-content-muted text-xs mb-0.5">Échéance</span>
                      <div>
                        <span className="text-content-primary font-semibold text-xs">{formatMoney(stats.installmentAmount)}</span>
                        <span className="text-content-muted text-[10px] ml-0.5">
                          /{credit.echeance === 'Journalier' ? 'j' : credit.echeance === 'Hebdomadaire' ? 's' : 'm'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress Section - Compact */}
              <div className="bg-surface/40 rounded-lg p-3 border border-edge-subtle">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-status-success" />
                    <span className="text-content-secondary text-xs font-medium">Progression</span>
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-content-primary tabular-nums">{progression.toFixed(0)}%</span>
                </div>

                {/* Progress Bar - Compact */}
                <div className="relative h-1.5 bg-surface-elevated/50 rounded-full overflow-hidden mb-3">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-status-success to-status-success rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${progression}%` }}
                  />
                </div>

                {/* Summary Row - Compact */}
                <div className="flex items-center justify-between text-xs sm:text-sm flex-wrap gap-2">
                  <div>
                    <span className="text-content-muted">Total dû</span>
                    <span className="text-content-primary font-semibold ml-1.5 tabular-nums">{formatMoney(totalAvecInterets)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-content-muted">Restant</span>
                    <span className="text-status-warning font-semibold ml-1.5 tabular-nums">{formatMoney(soldeRestant)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
               <div className="flex justify-between items-center mb-3 sm:mb-4">
                  <h3 className="text-sm sm:text-lg font-bold text-content-primary flex items-center gap-1.5 uppercase tracking-tight">
                     <Clock className="text-status-info" size={16} /> Plan de Remboursement
                  </h3>
               </div>

               <div className="overflow-x-auto rounded-lg border border-edge bg-surface-base/30">
                  <table className="w-full text-left min-w-[500px]">
                     <thead>
                        <tr className="bg-surface text-content-muted text-[9px] sm:text-[10px] font-black uppercase tracking-widest border-b border-edge">
                           <th className="px-2 sm:px-3 py-2 sm:py-3">N°</th>
                           <th className="px-3 sm:px-4 py-2 sm:py-3">Date</th>
                           <th className="px-3 sm:px-4 py-2 sm:py-3 text-right">Montant</th>
                           <th className="px-3 sm:px-4 py-2 sm:py-3 text-right hidden sm:table-cell">Solde</th>
                           <th className="px-2 sm:px-3 py-2 sm:py-3 text-center">État</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-edge/50">
                        {stats.schedule.map((item) => (
                           <tr key={item.number} className={`hover:bg-surface-elevated/20 transition-colors ${item.status === StatutEcheanceCredit.SETTLED ? 'opacity-30' : ''}`}>
                              <td className="px-2 sm:px-3 py-2 sm:py-3 text-content-muted font-mono text-[10px] sm:text-xs">{item.number}</td>
                              <td className="px-3 sm:px-4 py-2 sm:py-3 font-bold text-content-primary whitespace-nowrap text-[10px] sm:text-sm">
                                 {format(item.dueDate, 'dd MMM yyyy', { locale: fr })}
                              </td>
                              <td className="px-3 sm:px-4 py-2 sm:py-3 text-right font-mono text-content-primary whitespace-nowrap text-[10px] sm:text-sm">
                                 {formatMoney(item.amount)}
                              </td>
                              <td className="px-3 sm:px-4 py-2 sm:py-3 text-right font-mono text-status-info whitespace-nowrap hidden sm:table-cell text-xs sm:text-sm">
                                 {formatMoney(item.remainingBalance)}
                              </td>
                              <td className="px-2 sm:px-3 py-2 sm:py-3 text-center">
                                 <span className={`
                                    px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-wider border
                                    ${item.status === StatutEcheanceCredit.PAID || item.status === StatutEcheanceCredit.SETTLED ? 'bg-status-success-bg text-status-success border-status-success/20' :
                                      item.status === StatutEcheanceCredit.LATE ? 'bg-status-danger-bg text-status-danger border-status-danger/20' :
                                      'bg-surface-elevated/50 text-content-muted border-edge-strong'}
                                 `}>
                                    {getInstallmentStatusLabel(item.status)}
                                 </span>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>

               <div className="mt-4 p-3 bg-status-info/5 rounded-lg border border-status-info/10 flex gap-2 sm:gap-3">
                  <PieChart className="text-status-info shrink-0" size={16} />
                  <div className="text-[10px] sm:text-xs text-content-muted italic">
                     Les échéances passées sont marquées comme <span className="text-status-success font-bold">PAYÉ</span> si le capital correspondant a été amorti. Un remboursement total par anticipation solde l'ensemble de l'échéancier.
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Action Button Footer - Compact */}
        <div className="p-3 sm:p-4 border-t border-edge shrink-0 bg-surface/80">
          <Button onClick={onClose} variant="ghost" className="w-full uppercase font-black tracking-widest py-2 text-xs sm:text-sm">
            Fermer le Dossier
          </Button>
        </div>
        </div> {/* End Main Content */}
      </div>

      {/* Hidden Download-ready Printable Schedule (offscreen, not display:none) */}
      {credit && client && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-10000px',
            top: '0',
            width: '210mm',
            background: 'white',
            zIndex: -1,
          }}
        >
          <CreditSchedulePDF 
            ref={printRef}
            credit={credit}
            client={client}
            schedule={stats.schedule}
          />
        </div>
      )}
    </div>
  );
}
