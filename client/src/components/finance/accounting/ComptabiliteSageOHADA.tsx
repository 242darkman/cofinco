import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, FileText, BarChart3, TrendingUp, Download, Building2,
  Calculator, DollarSign, Filter, Search, Calendar, Lock, Settings,
  ChevronDown, ChevronRight, Printer, Mail, PieChart, Activity, Plus, CheckCircle,
  RotateCcw, AlertTriangle, X
} from 'lucide-react';
import SaisieEcriture from './SaisieEcriture';
import BalanceGenerale from './BalanceGenerale';
import GrandLivre from './GrandLivre';
import CompteResultat from './CompteResultat';
import DeclarationTVA from './DeclarationTVA';
import TableauTresorerie from './TableauTresorerie';
import TAFIRE from './TAFIRE';
import CoffreOperationsPanel from './CoffreOperationsPanel';
import PayrollSummaryPanel from './PayrollSummaryPanel';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import TabGroup from '../../ui/TabGroup';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts';
import {
  useChartOfAccounts,
  useJournaux,
  useJournauxStats,
  useJournalEntries,
  useBilanStats,
  usePeriods,
  useClosePeriod,
  useAccountingWebSocket,
} from '../../../hooks/accounting/useAccounting';
import { comptabiliteKeys } from '../../../lib/query-keys';

// ============================================
// INTERFACES
// ============================================
interface CompteOHADA {
  id: string;
  numero_compte: string;
  intitule: string;
  classe: number;
  type_compte: 'Actif' | 'Passif' | 'Charge' | 'Produit' | 'Capitaux';
  sens_normal: 'Débit' | 'Crédit';
  niveau: number;
  actif: boolean;
  description: string;
  solde_actuel: number;
}

type TabKey = 'plan' | 'journaux' | 'ecritures' | 'balance' | 'grandlivre' | 'bilan' | 'resultat' | 'tva' | 'tresorerie' | 'tafire' | 'liasse' | 'rapports';

interface JournalFromApi {
  id: string;
  code: string;
  intitule: string;
  type_journal?: string;
  actif?: boolean;
}

interface JournalDisplay {
  id: string;
  code: string;
  label: string;
  color: string;
  count: number;
}

interface JournalEntryFromApi {
  id: string;
  date: string;
  numero_piece: string;
  libelle: string;
  journal_id: string;
  total_debit: number;
  total_credit: number;
}

// ============================================
// DONNÉES ET CONSTANTES
// ============================================
const tabs = [
  { key: 'plan', label: 'Plan OHADA', icon: BookOpen },
  { key: 'journaux', label: 'Journaux', icon: FileText },
  { key: 'ecritures', label: 'Écritures', icon: Calculator },
  { key: 'balance', label: 'Balance', icon: BarChart3 },
  { key: 'grandlivre', label: 'Grand Livre', icon: BookOpen },
  { key: 'bilan', label: 'Bilan', icon: PieChart },
  { key: 'resultat', label: 'Résultat', icon: TrendingUp },
  { key: 'tva', label: 'TVA', icon: DollarSign },
  { key: 'liasse', label: 'Liasse', icon: FileText },
  { key: 'rapports', label: 'Rapports', icon: Download },
];

const classesOHADA = [
  { numero: 1, label: 'Comptes de ressources durables', color: 'from-blue-500 to-blue-600' },
  { numero: 2, label: 'Comptes d\'actif immobilisé', color: 'from-emerald-500 to-emerald-600' },
  { numero: 3, label: 'Comptes de stocks', color: 'from-amber-500 to-amber-600' },
  { numero: 4, label: 'Comptes de tiers', color: 'from-purple-500 to-purple-600' },
  { numero: 5, label: 'Comptes de trésorerie', color: 'from-cyan-500 to-cyan-600' },
  { numero: 6, label: 'Comptes de charges', color: 'from-red-500 to-red-600' },
  { numero: 7, label: 'Comptes de produits', color: 'from-green-500 to-green-600' },
  { numero: 8, label: 'Autres comptes', color: 'from-slate-500 to-slate-600' },
];

const JOURNAL_COLORS: Record<string, string> = {
  CAISSE: 'from-purple-500 to-purple-600',
  BANK: 'from-blue-500 to-blue-600',
  ACHAT: 'from-orange-500 to-orange-600',
  VENTE: 'from-green-500 to-green-600',
  OD: 'from-slate-500 to-slate-600',
  MMTN: 'from-amber-500 to-amber-600',
  MAIR: 'from-red-500 to-red-600',
  CRED: 'from-cyan-500 to-cyan-600',
  EPGN: 'from-emerald-500 to-emerald-600',
};
const DEFAULT_JOURNAL_COLOR = 'from-indigo-500 to-indigo-600';

const rapportsDisponibles = [
  { id: 'balance', label: 'Balance générale', icon: BarChart3, color: 'from-blue-500 to-blue-600' },
  { id: 'grandlivre', label: 'Grand Livre', icon: BookOpen, color: 'from-emerald-500 to-emerald-600' },
  { id: 'bilan', label: 'Bilan OHADA', icon: PieChart, color: 'from-purple-500 to-purple-600' },
  { id: 'resultat', label: 'Compte de résultat', icon: TrendingUp, color: 'from-green-500 to-green-600' },
  { id: 'tresorerie', label: 'Tableau de trésorerie', icon: DollarSign, color: 'from-cyan-500 to-cyan-600' },
  { id: 'tafire', label: 'TAFIRE', icon: Activity, color: 'from-orange-500 to-orange-600' },
];

// ============================================
// COMPOSANT PRINCIPAL
// ============================================
interface ComptabiliteSageOHADAProps {
  activeView?: string;
}

const ComptabiliteSageOHADA: React.FC<ComptabiliteSageOHADAProps> = ({ activeView }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('plan');
  const [expandedClasses, setExpandedClasses] = useState<number[]>([]);
  const [selectedJournal, setSelectedJournal] = useState<JournalDisplay | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [reversingEntryId, setReversingEntryId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [bilanDateFin, setBilanDateFin] = useState(new Date().toISOString().split('T')[0]);

  // Real-time WebSocket invalidation
  useAccountingWebSocket();

  // Callback for child components to invalidate accounting data
  const invalidateAccounting = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: comptabiliteKeys.all });
  }, [queryClient]);

  const handleReverseEntry = useCallback(async () => {
    if (!reversingEntryId || !reversalReason.trim()) return;
    setReversalLoading(true);
    setReversalError(null);
    try {
      const res = await fetch(`/api/comptabilite/entries/${reversingEntryId}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reversalReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Erreur extourne' }));
        throw new Error(err.message);
      }
      setReversingEntryId(null);
      setReversalReason('');
      invalidateAccounting();
    } catch (e: any) {
      setReversalError(e.message || 'Erreur extourne');
    } finally {
      setReversalLoading(false);
    }
  }, [reversingEntryId, reversalReason, invalidateAccounting]);

  // React Query: chart of accounts
  const { data: comptesData, isLoading: loading } = useChartOfAccounts();
  const comptes: CompteOHADA[] = comptesData || [];

  // React Query: journals + stats
  const { data: journauxData } = useJournaux();
  const { data: statsData } = useJournauxStats();

  // Derive journauxDisplay from React Query data
  const journauxDisplay: JournalDisplay[] = useMemo(() => {
    if (!journauxData) return [];
    return journauxData.map((j: JournalFromApi) => {
      const stat = Array.isArray(statsData)
        ? statsData.find((s) => s.code === j.code)
        : null;
      return {
        id: j.id,
        code: j.code,
        label: j.intitule,
        color: JOURNAL_COLORS[j.code] || DEFAULT_JOURNAL_COLOR,
        count: stat ? Number(stat.count) : 0,
      };
    });
  }, [journauxData, statsData]);

  // React Query: journal entries (reactive to selectedJournal)
  const { data: journalEntriesData, isLoading: journalEntriesLoading } = useJournalEntries(
    selectedJournal?.id
  );
  const journalEntries: JournalEntryFromApi[] = journalEntriesData || [];

  // React Query: bilan stats
  const { data: bilanStats, isLoading: bilanLoading } = useBilanStats(bilanDateFin);

  // React Query: periods
  const currentYear = new Date().getFullYear();
  const { data: periodsData } = usePeriods(currentYear);
  const closePeriodMutation = useClosePeriod();

  useEffect(() => {
    if (activeView) {
      switch (activeView) {
        case 'compta-journal':
          setActiveTab('journaux');
          break;
        case 'compta-bilan':
          setActiveTab('bilan');
          break;
        case 'compta-tresorerie':
          setActiveTab('rapports');
          break;
        default:
          setActiveTab('plan');
      }
    }
  }, [activeView]);

  const handleSelectJournal = useCallback((journal: JournalDisplay) => {
    setSelectedJournal(journal);
  }, []);

  const toggleClasse = (numero: number) => {
    setExpandedClasses(prev =>
      prev.includes(numero)
        ? prev.filter(n => n !== numero)
        : [...prev, numero]
    );
  };

  const getComptesByClasse = (classeNumero: number) => {
    let filtered = comptes.filter(c =>
      c.classe === classeNumero || (c.numero_compte && parseInt(String(c.numero_compte).charAt(0)) === classeNumero)
    );

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(c =>
        c.numero_compte.includes(term) ||
        c.intitule.toLowerCase().includes(term)
      );
    }

    return filtered;
  };

  // Count classes that have accounts
  const classesUtilisees = classesOHADA.filter(cl =>
    comptes.some(c => c.classe === cl.numero || (c.numero_compte && parseInt(String(c.numero_compte).charAt(0)) === cl.numero))
  ).length;

  // ============================================
  // TAB: Plan OHADA - ADAPTATIF SIDEBAR
  // ============================================
  const renderPlanOHADA = () => (
    <div className="space-y-3">
      {/* Header compact - UNE SEULE LIGNE avec overflow scroll si nécessaire */}
      <div className="bg-gradient-to-r from-blue-600 to-emerald-600 rounded-xl p-3">
        <div className="flex items-center gap-3 overflow-x-auto">
          {/* Titre - ne shrink pas */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-bold text-white leading-tight whitespace-nowrap">Plan Comptable OHADA</h2>
              <p className="text-[10px] text-white/80 whitespace-nowrap">SYSCOHADA révisé</p>
            </div>
          </div>

          {/* Séparateur */}
          <div className="w-px h-10 bg-white/20 flex-shrink-0" />

          {/* Stats inline - compacts */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-white/80" />
              <div>
                <div className="text-base font-bold text-white leading-none">{comptes.length}</div>
                <div className="text-[9px] text-white/70">Comptes</div>
              </div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <Lock className="w-4 h-4 text-white/80" />
              <div>
                <div className="text-base font-bold text-white leading-none">{classesUtilisees}</div>
                <div className="text-[9px] text-white/70">Classes</div>
              </div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <Activity className="w-4 h-4 text-white/80" />
              <div>
                <div className="text-base font-bold text-white leading-none">{comptes.filter(c => c.actif !== false).length}</div>
                <div className="text-[9px] text-white/70">Actifs</div>
              </div>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1 min-w-4" />

          {/* Actions - à droite */}
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              className="bg-white/20 border-transparent hover:bg-white/30 text-white"
            >
              Exporter
            </Button>
          </div>
        </div>
      </div>

      {/* Barre de recherche - largeur limitée */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Rechercher un compte..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 
            bg-slate-800 border border-slate-700 rounded-lg 
            text-sm text-white placeholder-slate-400
            focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Classes - Accordéon compact */}
      <div className="space-y-1">
        {classesOHADA.map((classe) => {
          const comptesClasse = getComptesByClasse(classe.numero);
          const isExpanded = expandedClasses.includes(classe.numero);
          
          return (
            <div key={classe.numero} className="rounded-lg overflow-hidden">
              <button
                onClick={() => toggleClasse(classe.numero)}
                className={`w-full bg-gradient-to-r ${classe.color} 
                  px-3 py-2
                  flex items-center gap-3 text-white
                  hover:opacity-90 transition-all duration-200`}
              >
                <span className="font-bold text-sm w-5">{classe.numero}</span>
                <span className="text-sm font-medium flex-1 text-left truncate">{classe.label}</span>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full flex-shrink-0">
                  {comptesClasse.length}
                </span>
                {isExpanded 
                  ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> 
                  : <ChevronRight className="w-4 h-4 flex-shrink-0" />
                }
              </button>

              {isExpanded && (
                <div className="bg-slate-800/80 p-3">
                  {comptesClasse.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-400 text-xs border-b border-slate-700">
                            <th className="pb-2 pr-4 font-medium w-24">N° Compte</th>
                            <th className="pb-2 pr-4 font-medium">Intitulé</th>
                            <th className="pb-2 pr-4 font-medium w-20 hidden md:table-cell">Type</th>
                            <th className="pb-2 font-medium w-16 hidden lg:table-cell">Solde</th>
                          </tr>
                        </thead>
                        <tbody className="text-white">
                          {comptesClasse.map((compte) => (
                            <tr 
                              key={compte.id} 
                              className="border-b border-slate-700/50 hover:bg-slate-700/30"
                            >
                              <td className="py-1.5 pr-4 font-mono text-xs text-blue-400">{compte.numero_compte}</td>
                              <td className="py-1.5 pr-4 text-xs">{compte.intitule}</td>
                              <td className="py-1.5 pr-4 hidden md:table-cell">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px]
                                  ${compte.type_compte === 'Actif' ? 'bg-blue-500/20 text-blue-400' :
                                    compte.type_compte === 'Passif' ? 'bg-purple-500/20 text-purple-400' :
                                    compte.type_compte === 'Charge' ? 'bg-red-500/20 text-red-400' :
                                    'bg-green-500/20 text-green-400'
                                  }`}
                                >
                                  {compte.type_compte}
                                </span>
                              </td>
                              <td className="py-1.5 hidden lg:table-cell text-white font-mono text-[10px]">
                                {compte.solde_actuel != null ? compte.solde_actuel.toLocaleString() : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-xs text-center py-4">
                      Aucun compte dans cette classe
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ============================================
  // TAB: Journaux - ADAPTATIF
  // ============================================
  const totalEcrituresJournaux = journauxDisplay.reduce((sum, j) => sum + j.count, 0);

  const renderJournaux = () => (
    <div className="space-y-3">
      {/* Header compact */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-3">
        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 flex-shrink-0">
            <FileText className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-bold text-white leading-tight whitespace-nowrap">Journaux Comptables</h2>
              <p className="text-[10px] text-white/80 whitespace-nowrap">Gestion des écritures</p>
            </div>
          </div>

          <div className="w-px h-10 bg-white/20 flex-shrink-0" />

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <FileText className="w-4 h-4 text-white/80" />
              <div>
                <div className="text-base font-bold text-white leading-none">{journauxDisplay.length}</div>
                <div className="text-[9px] text-white/70">Journaux</div>
              </div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-white/80" />
              <div>
                <div className="text-base font-bold text-white leading-none">{totalEcrituresJournaux}</div>
                <div className="text-[9px] text-white/70">Écritures</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu */}
      {selectedJournal ? (
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              onClick={() => { setSelectedJournal(null); }}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Retour
            </button>
            <h3 className="text-sm font-bold text-white">
              {selectedJournal.code} - {selectedJournal.label}
              <span className="ml-2 text-xs text-slate-400 font-normal">
                ({journalEntries.length} écriture{journalEntries.length !== 1 ? 's' : ''})
              </span>
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs border-b border-slate-700">
                  <th className="pb-2 pr-4 font-medium w-24">Date</th>
                  <th className="pb-2 pr-4 font-medium w-28 hidden sm:table-cell">N° Pièce</th>
                  <th className="pb-2 pr-4 font-medium">Libellé</th>
                  <th className="pb-2 pr-4 font-medium text-right w-28">Débit</th>
                  <th className="pb-2 pr-4 font-medium text-right w-28">Crédit</th>
                  <th className="pb-2 font-medium text-center w-20 hidden md:table-cell">Actions</th>
                </tr>
              </thead>
              <tbody className="text-white text-xs divide-y divide-slate-700/50">
                {journalEntriesLoading ? (
                  <>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`skel-${i}`} className="animate-pulse">
                        <td className="py-3 pr-4"><div className="h-3 bg-slate-700 rounded w-20" /></td>
                        <td className="py-3 pr-4 hidden sm:table-cell"><div className="h-3 bg-slate-700 rounded w-16" /></td>
                        <td className="py-3 pr-4"><div className="h-3 bg-slate-700 rounded w-40" /></td>
                        <td className="py-3 pr-4 text-right"><div className="h-3 bg-slate-700 rounded w-20 ml-auto" /></td>
                        <td className="py-3 pr-4 text-right"><div className="h-3 bg-slate-700 rounded w-20 ml-auto" /></td>
                        <td className="py-3"><div className="h-3 bg-slate-700 rounded w-8 mx-auto" /></td>
                      </tr>
                    ))}
                  </>
                ) : journalEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Aucune écriture dans ce journal
                    </td>
                  </tr>
                ) : (
                  journalEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="py-2 pr-4 text-slate-300">
                        {entry.date ? new Date(entry.date).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="py-2 pr-4 font-mono text-cyan-400 hidden sm:table-cell">
                        {entry.numero_piece || '-'}
                      </td>
                      <td className="py-2 pr-4 text-white truncate max-w-[200px]">
                        {entry.libelle || '-'}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-green-400">
                        {Number(entry.total_debit || 0).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-cyan-400">
                        {Number(entry.total_credit || 0).toLocaleString()}
                      </td>
                      <td className="py-2 text-center hidden md:table-cell">
                        <button
                          onClick={() => {
                            setReversingEntryId(entry.id);
                            setReversalReason('');
                            setReversalError(null);
                          }}
                          className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                          title="Extourner cette écriture"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {journalEntries.length > 0 && (
                <tfoot className="bg-slate-700/50">
                  <tr>
                    <td colSpan={3} className="py-2 px-4 text-right text-xs font-bold text-white">TOTAUX</td>

                    <td className="py-2 pr-4 text-right font-mono font-bold text-green-400 text-xs">
                      {journalEntries.reduce((sum, e) => sum + Number(e.total_debit || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-mono font-bold text-cyan-400 text-xs">
                      {journalEntries.reduce((sum, e) => sum + Number(e.total_credit || 0), 0).toLocaleString()}
                    </td>
                    <td className="hidden md:table-cell" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Reversal (Extourne) Dialog */}
          {reversingEntryId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-slate-800 rounded-xl p-5 w-full max-w-md mx-4 border border-slate-700 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-amber-500/20 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    </div>
                    <h3 className="text-sm font-bold text-white">Extourner l'écriture</h3>
                  </div>
                  <button
                    onClick={() => setReversingEntryId(null)}
                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-400 mb-3">
                  Cette action va créer une écriture inverse pour annuler l'écriture sélectionnée.
                  L'opération est irréversible.
                </p>

                <label className="block text-xs text-slate-300 mb-1 font-medium">Motif d'extourne *</label>
                <textarea
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Ex: Erreur de saisie, double enregistrement..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                  rows={3}
                />

                {reversalError && (
                  <p className="text-xs text-red-400 mt-2">{reversalError}</p>
                )}

                <div className="flex gap-2 mt-4 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReversingEntryId(null)}
                    className="text-xs"
                  >
                    Annuler
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={RotateCcw}
                    onClick={handleReverseEntry}
                    className="text-xs bg-amber-600 hover:bg-amber-700"
                    disabled={!reversalReason.trim() || reversalLoading}
                  >
                    {reversalLoading ? 'Extourne...' : 'Confirmer l\'extourne'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {journauxDisplay.length === 0 ? (
            <div className="col-span-full text-center py-8 text-slate-400 text-sm">
              Aucun journal configuré
            </div>
          ) : (
            journauxDisplay.map((journal) => (
              <button
                key={journal.code}
                onClick={() => handleSelectJournal(journal)}
                className={`
                  bg-gradient-to-br ${journal.color}
                  rounded-lg p-3
                  text-white text-left
                  hover:scale-[1.02] hover:shadow-lg
                  transition-all duration-200
                `}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-bold">{journal.code}</span>
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">
                    {journal.count}
                  </span>
                </div>
                <span className="text-xs font-medium line-clamp-2 opacity-90">
                  {journal.label}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );

  // ============================================
  // TAB: Bilan - ADAPTATIF
  // ============================================
  const handleExportBilanExcel = () => {
    try {
      const data = [
        ['BILAN OHADA - COFIN&CO-M'],
        [`Date: ${new Date().toLocaleDateString('fr-FR')}`],
        [],
        ['ACTIF'],
        ['Poste', 'Montant (FCFA)'],
        ['Actif immobilisé', bilanStats?.actif?.immobilise || 0],
        ['Actif circulant', bilanStats?.actif?.circulant || 0],
        ['Trésorerie-Actif', bilanStats?.actif?.tresorerie || 0],
        ['TOTAL ACTIF', bilanStats?.actif?.total || 0],
        [],
        ['PASSIF'],
        ['Poste', 'Montant (FCFA)'],
        ['Capitaux propres', bilanStats?.passif?.capitaux || 0],
        ['Dettes financières', bilanStats?.passif?.dettes || 0],
        ['Passif circulant', bilanStats?.passif?.circulant || 0],
        ['TOTAL PASSIF', bilanStats?.passif?.total || 0],
      ];

      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Bilan OHADA');
      XLSX.writeFile(wb, `Bilan_OHADA_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Erreur export Excel:', error);
    }
  };

  const handleExportBilanPDF = () => {
    try {
      const doc = new jsPDF('portrait');

      doc.setFontSize(20);
      doc.setTextColor(30, 58, 138);
      doc.text('BILAN OHADA', 105, 20, { align: 'center' });

      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text('COFIN&CO-M - Système Comptable OHADA', 105, 30, { align: 'center' });
      doc.text(`Édité le: ${new Date().toLocaleDateString('fr-FR')}`, 105, 38, { align: 'center' });

      doc.setDrawColor(30, 58, 138);
      doc.line(20, 44, 190, 44);

      let y = 55;

      // ACTIF
      doc.setFillColor(59, 130, 246);
      doc.rect(20, y, 170, 10, 'F');
      doc.setTextColor(255);
      doc.setFontSize(12);
      doc.text('ACTIF', 25, y + 7);
      y += 15;

      doc.setTextColor(0);
      doc.setFontSize(10);
      const actifItems = [
        { label: 'Actif immobilisé', val: bilanStats?.actif?.immobilise || 0 },
        { label: 'Actif circulant', val: bilanStats?.actif?.circulant || 0 },
        { label: 'Trésorerie-Actif', val: bilanStats?.actif?.tresorerie || 0 },
      ];

      actifItems.forEach(item => {
        doc.text(item.label, 30, y);
        doc.text(item.val.toLocaleString('fr-FR') + ' FCFA', 170, y, { align: 'right' });
        y += 8;
      });

      doc.setFontSize(11);
      doc.setTextColor(59, 130, 246);
      doc.text('TOTAL ACTIF', 30, y + 3);
      doc.text((bilanStats?.actif?.total || 0).toLocaleString('fr-FR') + ' FCFA', 170, y + 3, { align: 'right' });
      y += 20;

      // PASSIF
      doc.setFillColor(147, 51, 234);
      doc.rect(20, y, 170, 10, 'F');
      doc.setTextColor(255);
      doc.setFontSize(12);
      doc.text('PASSIF', 25, y + 7);
      y += 15;

      doc.setTextColor(0);
      doc.setFontSize(10);
      const passifItems = [
        { label: 'Capitaux propres', val: bilanStats?.passif?.capitaux || 0 },
        { label: 'Dettes financières', val: bilanStats?.passif?.dettes || 0 },
        { label: 'Passif circulant', val: bilanStats?.passif?.circulant || 0 },
      ];

      passifItems.forEach(item => {
        doc.text(item.label, 30, y);
        doc.text(item.val.toLocaleString('fr-FR') + ' FCFA', 170, y, { align: 'right' });
        y += 8;
      });

      doc.setFontSize(11);
      doc.setTextColor(147, 51, 234);
      doc.text('TOTAL PASSIF', 30, y + 3);
      doc.text((bilanStats?.passif?.total || 0).toLocaleString('fr-FR') + ' FCFA', 170, y + 3, { align: 'right' });

      // Équilibre
      y += 20;
      const isEquilibre = Math.abs((bilanStats?.actif?.total || 0) - (bilanStats?.passif?.total || 0)) < 1;
      if (isEquilibre) {
        doc.setFillColor(34, 197, 94);
      } else {
        doc.setFillColor(239, 68, 68);
      }
      doc.rect(20, y, 170, 10, 'F');
      doc.setTextColor(255);
      doc.setFontSize(10);
      doc.text(isEquilibre ? 'Bilan équilibré' : 'Bilan déséquilibré', 105, y + 7, { align: 'center' });

      doc.save(`Bilan_OHADA_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Erreur export PDF:', error);
    }
  };

  const renderBilan = () => (
    <div className="space-y-3">
      {/* Header compact */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-3">
        <div className="flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 flex-shrink-0">
            <PieChart className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-bold text-white leading-tight whitespace-nowrap">Bilan OHADA</h2>
              <p className="text-[10px] text-white/80 whitespace-nowrap">Situation patrimoniale</p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0 items-center">
            <input
              type="date"
              value={bilanDateFin}
              onChange={(e) => setBilanDateFin(e.target.value)}
              className="h-8 text-xs bg-white/15 border border-white/20 rounded-lg px-2 text-white"
            />
            {bilanLoading && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              onClick={handleExportBilanExcel}
              className="bg-white/20 border-transparent hover:bg-white/30 text-white"
            >
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Printer}
              onClick={handleExportBilanPDF}
              className="bg-white/20 border-transparent hover:bg-white/30 text-white"
            >
              PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Structure du bilan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Actif */}
        <div className="bg-slate-800 rounded-xl p-3">
          <h3 className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
            <ChevronRight className="w-4 h-4" />
            ACTIF
          </h3>
          <div className="space-y-1.5">
            {[
                { label: 'Actif immobilisé', val: bilanStats?.actif?.immobilise || 0 },
                { label: 'Actif circulant', val: bilanStats?.actif?.circulant || 0 },
                { label: 'Trésorerie-Actif', val: bilanStats?.actif?.tresorerie || 0 }
            ].map((item, i) => (
              <div
                key={i}
                className="flex justify-between items-center p-2 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <span className="text-xs text-slate-300">{item.label}</span>
                <span className="text-xs font-mono text-white">{(item.val).toLocaleString()} FCFA</span>
              </div>
            ))}
            <div className="flex justify-between items-center p-2 bg-blue-500/20 rounded-lg mt-2">
              <span className="text-xs font-bold text-blue-400">TOTAL ACTIF</span>
              <span className="text-xs font-mono font-bold text-blue-400">{(bilanStats?.actif?.total || 0).toLocaleString()} FCFA</span>
            </div>
          </div>
        </div>

        {/* Passif */}
        <div className="bg-slate-800 rounded-xl p-3">
          <h3 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
            <ChevronRight className="w-4 h-4" />
            PASSIF
          </h3>
          <div className="space-y-1.5">
            {[
                { label: 'Capitaux propres', val: bilanStats?.passif?.capitaux || 0 },
                { label: 'Dettes financières', val: bilanStats?.passif?.dettes || 0 },
                { label: 'Passif circulant', val: bilanStats?.passif?.circulant || 0 }
            ].map((item, i) => (
              <div
                key={i}
                className="flex justify-between items-center p-2 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <span className="text-xs text-slate-300">{item.label}</span>
                <span className="text-xs font-mono text-white">{(item.val).toLocaleString()} FCFA</span>
              </div>
            ))}
            <div className="flex justify-between items-center p-2 bg-purple-500/20 rounded-lg mt-2">
              <span className="text-xs font-bold text-purple-400">TOTAL PASSIF</span>
              <span className="text-xs font-mono font-bold text-purple-400">{(bilanStats?.passif?.total || 0).toLocaleString()} FCFA</span>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Chart */}
      <Card variant="default" padding="sm" className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1 bg-indigo-500/20 rounded">
            <BarChart3 size={14} className="text-indigo-400" />
          </div>
          <h3 className="text-xs font-bold text-white">Comparaison Actif / Passif</h3>
          {bilanStats && (
            <Badge
              value={Math.abs((bilanStats?.actif?.total || 0) - (bilanStats?.passif?.total || 0)) < 1 ? 'Équilibré' : 'Déséquilibré'}
              variant={Math.abs((bilanStats?.actif?.total || 0) - (bilanStats?.passif?.total || 0)) < 1 ? 'success' : 'danger'}
              size="sm"
              className="ml-auto text-[9px]"
            />
          )}
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart
            data={[
              { name: 'Immobilisé', actif: bilanStats?.actif?.immobilise || 0, passif: 0 },
              { name: 'Capitaux', actif: 0, passif: bilanStats?.passif?.capitaux || 0 },
              { name: 'Circulant', actif: bilanStats?.actif?.circulant || 0, passif: bilanStats?.passif?.circulant || 0 },
              { name: 'Dettes', actif: 0, passif: bilanStats?.passif?.dettes || 0 },
              { name: 'Trésorerie', actif: bilanStats?.actif?.tresorerie || 0, passif: 0 },
            ]}
            margin={{ left: 5, right: 5, top: 5, bottom: 5 }}
          >
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              formatter={(value: number) => `${value.toLocaleString()} FCFA`}
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
              itemStyle={{ color: '#e2e8f0' }}
            />
            <Bar dataKey="actif" name="Actif" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="passif" name="Passif" fill="#a855f7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );

  // ============================================
  // TAB: Liasse fiscale - ADAPTATIF
  // ============================================
  const renderLiasse = () => (
    <div className="space-y-3">
      {/* Header compact */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-xl p-3">
        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 flex-shrink-0">
            <FileText className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-bold text-white leading-tight whitespace-nowrap">Liasse Fiscale OHADA</h2>
              <p className="text-[10px] text-white/80 whitespace-nowrap">États financiers</p>
            </div>
          </div>
        </div>
      </div>

      {/* États financiers - grille compacte */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {[
          { id: 'bilan', tab: 'bilan' as TabKey, label: 'Bilan', desc: 'Actif/Passif', icon: PieChart, color: 'from-blue-500 to-blue-600' },
          { id: 'resultat', tab: 'resultat' as TabKey, label: 'Résultat', desc: 'Charges/Produits', icon: TrendingUp, color: 'from-green-500 to-green-600' },
          { id: 'tafire', tab: 'tafire' as TabKey, label: 'TAFIRE', desc: 'Tableau financier', icon: Activity, color: 'from-purple-500 to-purple-600' },
          { id: 'annexes', tab: null, label: 'Annexes', desc: 'Notes', icon: FileText, color: 'from-cyan-500 to-cyan-600' },
          { id: 'flux', tab: 'tresorerie' as TabKey, label: 'Trésorerie', desc: 'Flux', icon: DollarSign, color: 'from-orange-500 to-orange-600' },
          { id: 'variation', tab: null, label: 'Variation', desc: 'Capitaux', icon: BarChart3, color: 'from-pink-500 to-pink-600' },
        ].map((etat) => {
          const Icon = etat.icon;
          return (
            <button
              key={etat.id}
              onClick={() => etat.tab && setActiveTab(etat.tab)}
              className={`
                bg-gradient-to-br ${etat.color}
                rounded-lg p-3
                text-white text-left
                hover:scale-[1.02] hover:shadow-lg
                transition-all duration-200
                ${!etat.tab ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              disabled={!etat.tab}
            >
              <Icon className="w-5 h-5 mb-2" />
              <div className="text-xs font-bold">{etat.label}</div>
              <div className="text-[10px] opacity-80">{etat.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ============================================
  // TAB: Rapports - ADAPTATIF avec téléchargements fonctionnels
  // ============================================
  const handleRapportDownload = (rapportId: string) => {
    switch (rapportId) {
      case 'balance':
        setActiveTab('balance');
        break;
      case 'grandlivre':
        setActiveTab('grandlivre');
        break;
      case 'bilan':
        handleExportBilanPDF();
        break;
      case 'resultat':
        setActiveTab('resultat');
        break;
      case 'tresorerie':
        setActiveTab('tresorerie');
        break;
      case 'tafire':
        setActiveTab('tafire');
        break;
      default:
        break;
    }
  };

  const renderRapports = () => (
    <div className="space-y-3">
      {/* Header compact */}
      <div className="bg-gradient-to-r from-teal-600 to-cyan-600 rounded-xl p-3">
        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Download className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-bold text-white leading-tight whitespace-nowrap">Rapports & Exports</h2>
              <p className="text-[10px] text-white/80 whitespace-nowrap">Téléchargements</p>
            </div>
          </div>
        </div>
      </div>

      {/* Grille des rapports - compacte */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {rapportsDisponibles.map((rapport) => {
          const Icon = rapport.icon;
          return (
            <button
              key={rapport.id}
              onClick={() => handleRapportDownload(rapport.id)}
              className={`
                bg-gradient-to-br ${rapport.color}
                rounded-lg p-3
                text-white text-left
                hover:scale-[1.02] hover:shadow-lg
                transition-all duration-200
              `}
            >
              <Icon className="w-5 h-5 mb-2" />
              <div className="text-xs font-bold line-clamp-1">{rapport.label}</div>
              <div className="text-[10px] opacity-80 flex items-center gap-1 mt-1">
                <Download className="w-3 h-3" />
                Télécharger
              </div>
            </button>
          );
        })}
      </div>

      {/* Synthèses Opérationnelles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <CoffreOperationsPanel />
        <PayrollSummaryPanel />
      </div>

      {/* Clôture des Périodes */}
      <div className="mt-6 bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Clôture des Périodes — {currentYear}</h3>
          </div>
          <Badge
            variant="info"
            size="sm"
            rawValue
            value={(() => {
              const periods = periodsData as Array<{ month: number; status: string }> | undefined;
              const closed = periods?.filter(p => p.status === 'closed').length ?? 0;
              return `${closed}/12 clôturées`;
            })()}
          />
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {Array.from({ length: 12 }, (_, i) => {
            const month = i + 1;
            const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
            const periods = periodsData as Array<{ id: string; month: number; status: string; closed_at?: string }> | undefined;
            const period = periods?.find(p => p.month === month);
            const isClosed = period?.status === 'closed';

            return (
              <div
                key={month}
                className={`rounded-lg border p-2 text-center transition-colors ${
                  isClosed
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-slate-700/30 border-slate-600/30'
                }`}
              >
                <div className="text-xs font-bold text-white mb-1">{monthNames[i]}</div>
                {isClosed ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-[9px] text-emerald-400">Clôturée</span>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm(`Clôturer la période ${monthNames[i]} ${currentYear} ? Cette action est irréversible.`)) {
                        closePeriodMutation.mutate({ year: currentYear, month });
                      }
                    }}
                    disabled={closePeriodMutation.isPending}
                    className="mt-0.5 px-2 py-1 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 text-[10px] font-medium rounded transition-colors disabled:opacity-50"
                  >
                    {closePeriodMutation.isPending ? '...' : 'Clôturer'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {closePeriodMutation.isError && (
          <div className="mt-3 flex items-center gap-2 text-red-400 text-xs bg-red-500/10 rounded-lg p-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Erreur lors de la clôture : {(closePeriodMutation.error as Error)?.message || 'Erreur inconnue'}</span>
          </div>
        )}
      </div>
    </div>
  );

  // Render du contenu selon l'onglet actif
  const renderContent = () => {
    switch (activeTab) {
      case 'plan': return renderPlanOHADA();
      case 'journaux': return renderJournaux();
      case 'ecritures': return <SaisieEcriture onSuccess={invalidateAccounting} />;
      case 'balance': return <BalanceGenerale />;
      case 'grandlivre': return <GrandLivre />;
      case 'bilan': return renderBilan();
      case 'resultat': return <CompteResultat />;
      case 'tva': return <DeclarationTVA />;
      case 'tresorerie': return <TableauTresorerie />;
      case 'tafire': return <TAFIRE />;
      case 'liasse': return renderLiasse();
      case 'rapports': return renderRapports();
      default: return renderPlanOHADA();
    }
  };

  // ============================================
  // RENDER PRINCIPAL
  // ============================================
  return (
    <div className="flex flex-col h-full bg-slate-900 min-h-0 space-y-4">
      {/* Navigation tabs using TabGroup */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
         <TabGroup 
            tabs={tabs.map(t => ({ key: t.key, label: t.label, icon: t.icon }))}
            activeTab={activeTab}
            onTabChange={(id) => {
               setActiveTab(id as TabKey);
               setSelectedJournal(null);
            }}
         />
      </div>

      {/* Contenu principal */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-0.5">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              {/* Header skeleton */}
              <div className="h-20 bg-slate-800 rounded-xl" />
              {/* Stats row skeleton */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 bg-slate-800 rounded-lg" />
                ))}
              </div>
              {/* Table skeleton */}
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/30 overflow-hidden">
                <div className="h-10 bg-slate-700/50" />
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-slate-700/20">
                    <div className="h-3 bg-slate-700 rounded w-16" />
                    <div className="h-3 bg-slate-700 rounded w-24" />
                    <div className="h-3 bg-slate-700 rounded flex-1" />
                    <div className="h-3 bg-slate-700 rounded w-20" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            renderContent()
          )}
        </div>
      </div>
    </div>
  );
};

export default ComptabiliteSageOHADA;