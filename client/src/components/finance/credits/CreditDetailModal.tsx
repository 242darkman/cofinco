import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, User, FileText, TrendingUp, Download, PieChart, Clock } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { creditApi, clientApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { Button, StatCard, TabGroup } from '../../ui';
import { formatMoney, parseMoney } from '../../../lib/format';
import { escapeHtml } from '../../../lib/sanitize';
import { generateLoanSchedule } from '../../../lib/credit-logic';
import { CreditSchedulePDF } from '../../ui/printable/CreditScheduleTemplate';
import { fr } from 'date-fns/locale';
import { format } from 'date-fns';
import { SkeletonCard } from '../../ui/Skeleton';

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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule'>('overview');
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
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-4xl p-6 space-y-6">
          <div className="flex justify-between items-center">
            <SkeletonCard className="h-8 w-48" />
            <SkeletonCard className="h-8 w-8 rounded-full" />
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} className="h-24" />)}
          </div>
          <SkeletonCard className="h-64 h-full" />
        </div>
      </div>
    );
  }

  if (error || !credit) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center max-w-md">
          <p className="text-red-400 mb-4">{error || 'Crédit non trouvé'}</p>
          <Button onClick={onClose} variant="primary">Fermer</Button>
        </div>
      </div>
    );
  }

  const stats = financialData!;
  const { montant, taux, soldeRestant, totalAvecInterets, totalPaye, progression } = stats;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-slate-700 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Dossier Crédit</h2>
            <p className="text-slate-400 font-medium">#{credit.numeroCredit} - {client ? `${client.nom} ${client.prenom || ''}` : 'Sans client'}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
               variant="ghost" 
               size="sm" 
               icon={Download}
               onClick={() => handlePrint()}
               className="text-slate-400 hover:text-white"
            >
              Échéancier PDF
            </Button>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition p-2 hover:bg-slate-700 rounded-lg">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Tabs navigation */}
        <div className="px-6 border-b border-slate-700 shrink-0 bg-slate-800/50">
          <TabGroup
            tabs={[
              { key: 'overview', label: "Vue d'ensemble" },
              { key: 'schedule', label: "Échéancier complet" }
            ]}
            activeTab={activeTab}
            onTabChange={(key) => setActiveTab(key as any)}
            variant="pills"
            className="py-2"
          />
        </div>

        <div className="p-6 overflow-y-auto flex-grow custom-scrollbar">
          {activeTab === 'overview' ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Financial Summary - Clean Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  title="Capital"
                  value={<span className="tabular-nums">{formatMoney(montant)}</span>}
                  color="primary"
                  variant="glass"
                />
                <StatCard
                  title="Reste à payer"
                  value={<span className="tabular-nums">{formatMoney(soldeRestant)}</span>}
                  color="warning"
                  variant="glass"
                />
                <StatCard
                  title="Déjà remboursé"
                  value={<span className="tabular-nums">{formatMoney(totalPaye)}</span>}
                  color="success"
                  variant="glass"
                />
                <StatCard
                  title="Taux d'intérêt"
                  value={`${taux}%`}
                  color="neutral"
                  variant="glass"
                />
              </div>

              {/* Two Column details - Clean Design */}
              <div className="grid md:grid-cols-2 gap-4">
                {client && (
                  <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
                    <div className="flex items-center gap-2 mb-4">
                      <User size={16} className="text-blue-400" />
                      <span className="text-slate-300 text-sm font-medium">Client</span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-sm">Nom</span>
                        <span className="text-white font-medium text-sm">{client.nom} {client.prenom}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-sm">Téléphone</span>
                        <span className="text-slate-300 text-sm">{client.telephone || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-sm">Score</span>
                        <span className={`text-sm font-semibold ${client.score && client.score >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {client.score || 0}/100
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText size={16} className="text-blue-400" />
                    <span className="text-slate-300 text-sm font-medium">Contrat</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-sm">Type</span>
                      <span className="text-white font-medium text-sm">{credit.typeCredit || 'Standard'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-sm">Durée</span>
                      <span className="text-slate-300 text-sm">
                        {credit.duree} {credit.echeance === 'Journalier' ? 'jours' : credit.echeance === 'Hebdomadaire' ? 'semaines' : 'mois'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-sm">Échéance</span>
                      <div className="text-right">
                        <span className="text-white font-semibold text-sm">{formatMoney(stats.installmentAmount)}</span>
                        <span className="text-slate-500 text-xs ml-1">
                          /{credit.echeance === 'Journalier' ? 'jour' : credit.echeance === 'Hebdomadaire' ? 'sem' : 'mois'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress Section - Minimal Design */}
              <div className="bg-slate-800/40 rounded-xl p-4 sm:p-5 border border-slate-700/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-emerald-400" />
                    <span className="text-slate-300 text-sm font-medium">Progression</span>
                  </div>
                  <span className="text-2xl font-bold text-white tabular-nums">{progression.toFixed(0)}%</span>
                </div>

                {/* Progress Bar - Sleek Design */}
                <div className="relative h-2 bg-slate-700/50 rounded-full overflow-hidden mb-5">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${progression}%` }}
                  />
                </div>

                {/* Summary Row */}
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-slate-500">Total dû</span>
                    <span className="text-white font-semibold ml-2 tabular-nums">{formatMoney(totalAvecInterets)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500">Restant</span>
                    <span className="text-amber-400 font-semibold ml-2 tabular-nums">{formatMoney(soldeRestant)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2 uppercase tracking-tight">
                     <Clock className="text-blue-400" size={22} /> Plan de Remboursement
                  </h3>
               </div>

               <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/30">
                  <table className="w-full text-left min-w-[600px]">
                     <thead>
                        <tr className="bg-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-700">
                           <th className="px-4 py-4">N°</th>
                           <th className="px-6 py-4">Date</th>
                           <th className="px-6 py-4 text-right">Montant</th>
                           <th className="px-6 py-4 text-right">Solde Progressif</th>
                           <th className="px-4 py-4 text-center">État</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-700/50">
                        {stats.schedule.map((item) => (
                           <tr key={item.number} className={`hover:bg-slate-700/20 transition-colors ${item.status === 'Soldé' ? 'opacity-30' : ''}`}>
                              <td className="px-4 py-4 text-slate-500 font-mono text-xs">{item.number}</td>
                              <td className="px-6 py-4 font-bold text-white whitespace-nowrap">
                                 {format(item.dueDate, 'dd MMM yyyy', { locale: fr })}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-white whitespace-nowrap">
                                 {formatMoney(item.amount)}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-blue-400 whitespace-nowrap">
                                 {formatMoney(item.remainingBalance)}
                              </td>
                              <td className="px-4 py-4 text-center">
                                 <span className={`
                                    px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border
                                    ${item.status === 'Payé' || item.status === 'Soldé' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                                      item.status === 'Retard' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                                      'bg-slate-700/50 text-slate-500 border-slate-600'}
                                 `}>
                                    {item.status}
                                 </span>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>

               <div className="mt-8 p-6 bg-blue-500/5 rounded-xl border border-blue-500/10 flex gap-4">
                  <PieChart className="text-blue-400 shrink-0" size={24} />
                  <div className="text-sm text-slate-400 italic">
                     Les échéances passées sont marquées comme <span className="text-green-400 font-bold">PAYÉ</span> si le capital correspondant a été amorti. Un remboursement total par anticipation solde l'ensemble de l'échéancier.
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Action Button Footer */}
        <div className="p-6 border-t border-slate-700 shrink-0 bg-slate-800/80">
          <Button onClick={onClose} variant="ghost" className="w-full uppercase font-black tracking-widest py-3">
            Fermer le Dossier
          </Button>
        </div>
      </div>

      {/* Hidden Download-ready Printable Schedule */}
      {credit && client && (
        <div style={{ display: 'none' }}>
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
