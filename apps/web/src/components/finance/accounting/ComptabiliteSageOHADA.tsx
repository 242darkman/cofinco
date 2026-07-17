import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
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
import RapportsOHADA from './RapportsOHADA';
import CoffreOperationsPanel from './CoffreOperationsPanel';
import PayrollSummaryPanel from './PayrollSummaryPanel';
import TabGroup from '../../ui/TabGroup';
// jsPDF et ExcelJS sont lazy-loadés dans les composants enfants
import { exportBilanExcel, exportBilanPDF } from './exports/bilanOHADAExports';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import { useDocumentBranding } from '@/hooks/useDocumentBranding';
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
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: 'Actif' | 'Passif' | 'Charge' | 'Produit' | 'Capitaux';
  sensNormal: 'Débit' | 'Crédit';
  niveau: number;
  actif: boolean;
  description: string;
  soldeActuel: number;
}

type TabKey = 'plan' | 'journaux' | 'ecritures' | 'balance' | 'grandlivre' | 'bilan' | 'resultat' | 'tva' | 'tresorerie' | 'tafire' | 'liasse' | 'rapports';

interface JournalFromApi {
  id: string;
  code: string;
  intitule: string;
  typeJournal?: string;
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
  numeroPiece: string;
  libelle: string;
  journalId: string;
  totalDebit: number;
  totalCredit: number;
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
  { numero: 1, label: 'Comptes de ressources durables', color: 'from-status-info to-status-info' },
  { numero: 2, label: 'Comptes d\'actif immobilisé', color: 'from-status-success to-status-success' },
  { numero: 3, label: 'Comptes de stocks', color: 'from-status-warning to-status-warning' },
  { numero: 4, label: 'Comptes de tiers', color: 'from-status-info to-status-info' },
  { numero: 5, label: 'Comptes de trésorerie', color: 'from-accent to-accent' },
  { numero: 6, label: 'Comptes de charges', color: 'from-status-danger to-status-danger' },
  { numero: 7, label: 'Comptes de produits', color: 'from-status-success to-status-success' },
  { numero: 8, label: 'Autres comptes', color: 'from-content-muted to-content-muted' },
];

const JOURNAL_COLORS: Record<string, string> = {
  CAISSE: 'from-status-info to-status-info',
  BANK: 'from-status-info to-status-info',
  ACHAT: 'from-status-warning to-status-warning',
  VENTE: 'from-status-success to-status-success',
  OD: 'from-content-muted to-content-muted',
  MMTN: 'from-status-warning to-status-warning',
  MAIR: 'from-status-danger to-status-danger',
  CRED: 'from-accent to-accent',
  EPGN: 'from-status-success to-status-success',
};
const DEFAULT_JOURNAL_COLOR = 'from-accent to-accent';

const rapportsDisponibles = [
  { id: 'balance', label: 'Balance générale', icon: BarChart3, color: 'from-status-info to-status-info' },
  { id: 'grandlivre', label: 'Grand Livre', icon: BookOpen, color: 'from-status-success to-status-success' },
  { id: 'bilan', label: 'Bilan OHADA', icon: PieChart, color: 'from-status-info to-status-info' },
  { id: 'resultat', label: 'Compte de résultat', icon: TrendingUp, color: 'from-status-success to-status-success' },
  { id: 'tresorerie', label: 'Tableau de trésorerie', icon: DollarSign, color: 'from-accent to-accent' },
  { id: 'tafire', label: 'TAFIRE', icon: Activity, color: 'from-status-warning to-status-warning' },
];

// ============================================
// COMPOSANT PRINCIPAL
// ============================================
interface ComptabiliteSageOHADAProps {
  activeView?: string;
}

const ComptabiliteSageOHADA: React.FC<ComptabiliteSageOHADAProps> = ({ activeView }) => {
  const branding = useDocumentBranding();
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
      c.classe === classeNumero || (c.numeroCompte && parseInt(String(c.numeroCompte).charAt(0)) === classeNumero)
    );

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(c =>
        c.numeroCompte.includes(term) ||
        c.intitule.toLowerCase().includes(term)
      );
    }

    return filtered;
  };

  // Count classes that have accounts
  const classesUtilisees = classesOHADA.filter(cl =>
    comptes.some(c => c.classe === cl.numero || (c.numeroCompte && parseInt(String(c.numeroCompte).charAt(0)) === cl.numero))
  ).length;

  // ============================================
  // TAB: Plan OHADA - ADAPTATIF SIDEBAR
  // ============================================
  const renderPlanOHADA = () => (
    <div className="space-y-3">
      {/* Header compact - UNE SEULE LIGNE avec overflow scroll si nécessaire */}
      <div className="bg-linear-to-r from-status-info to-status-success rounded-xl p-3">
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
            <button className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" />
              Exporter
            </button>
          </div>
        </div>
      </div>

      {/* Barre de recherche - largeur limitée */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
        <input
          type="text"
          placeholder="Rechercher un compte..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 
            bg-surface border border-edge rounded-lg 
            text-sm text-content-primary placeholder-content-muted
            focus:ring-2 focus:ring-status-info focus:border-transparent"
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
                className={`w-full bg-linear-to-r ${classe.color}
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
                <div className="bg-surface/80 p-3">
                  {comptesClasse.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-content-muted text-xs border-b border-edge">
                            <th className="pb-2 pr-4 font-medium w-24">N° Compte</th>
                            <th className="pb-2 pr-4 font-medium">Intitulé</th>
                            <th className="pb-2 pr-4 font-medium w-20 hidden md:table-cell">Type</th>
                            <th className="pb-2 font-medium w-16 hidden lg:table-cell">Solde</th>
                          </tr>
                        </thead>
                        <tbody className="text-content-primary">
                          {comptesClasse.map((compte) => (
                            <tr 
                              key={compte.id} 
                              className="border-b border-edge-subtle hover:bg-surface-elevated/30"
                            >
                              <td className="py-1.5 pr-4 font-mono text-xs text-status-info">{compte.numeroCompte}</td>
                              <td className="py-1.5 pr-4 text-xs">{compte.intitule}</td>
                              <td className="py-1.5 pr-4 hidden md:table-cell">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px]
                                  ${compte.typeCompte === 'Actif' ? 'bg-status-info-bg text-status-info' :
                                    compte.typeCompte === 'Passif' ? 'bg-status-info-bg text-status-info' :
                                    compte.typeCompte === 'Charge' ? 'bg-status-danger-bg text-status-danger' :
                                    'bg-status-success-bg text-status-success'
                                  }`}
                                >
                                  {compte.typeCompte}
                                </span>
                              </td>
                              <td className="py-1.5 hidden lg:table-cell text-content-primary font-mono text-[10px]">
                                {compte.soldeActuel != null ? compte.soldeActuel.toLocaleString() : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-content-muted text-xs text-center py-4">
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
      <div className="bg-linear-to-r from-status-info to-pink-600 rounded-xl p-3">
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
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              onClick={() => { setSelectedJournal(null); }}
              className="flex items-center gap-1.5 text-content-muted hover:text-content-primary text-sm"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Retour
            </button>
            <h3 className="text-sm font-bold text-content-primary">
              {selectedJournal.code} - {selectedJournal.label}
              <span className="ml-2 text-xs text-content-muted font-normal">
                ({journalEntries.length} écriture{journalEntries.length !== 1 ? 's' : ''})
              </span>
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-content-muted text-xs border-b border-edge">
                  <th className="pb-2 pr-4 font-medium w-24">Date</th>
                  <th className="pb-2 pr-4 font-medium w-28 hidden sm:table-cell">N° Pièce</th>
                  <th className="pb-2 pr-4 font-medium">Libellé</th>
                  <th className="pb-2 pr-4 font-medium text-right w-28">Débit</th>
                  <th className="pb-2 pr-4 font-medium text-right w-28">Crédit</th>
                  <th className="pb-2 font-medium text-center w-20 hidden md:table-cell">Actions</th>
                </tr>
              </thead>
              <tbody className="text-content-primary text-xs divide-y divide-edge/50">
                {journalEntriesLoading ? (
                  <>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`skel-${i}`} className="animate-pulse">
                        <td className="py-3 pr-4"><div className="h-3 bg-surface-elevated rounded w-20" /></td>
                        <td className="py-3 pr-4 hidden sm:table-cell"><div className="h-3 bg-surface-elevated rounded w-16" /></td>
                        <td className="py-3 pr-4"><div className="h-3 bg-surface-elevated rounded w-40" /></td>
                        <td className="py-3 pr-4 text-right"><div className="h-3 bg-surface-elevated rounded w-20 ml-auto" /></td>
                        <td className="py-3 pr-4 text-right"><div className="h-3 bg-surface-elevated rounded w-20 ml-auto" /></td>
                        <td className="py-3"><div className="h-3 bg-surface-elevated rounded w-8 mx-auto" /></td>
                      </tr>
                    ))}
                  </>
                ) : journalEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-content-muted">
                      Aucune écriture dans ce journal
                    </td>
                  </tr>
                ) : (
                  journalEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-surface-elevated/30 transition-colors">
                      <td className="py-2 pr-4 text-content-secondary">
                        {entry.date ? new Date(entry.date).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="py-2 pr-4 font-mono text-accent hidden sm:table-cell">
                        {entry.numeroPiece || '-'}
                      </td>
                      <td className="py-2 pr-4 text-content-primary truncate max-w-[200px]">
                        {entry.libelle || '-'}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-status-success">
                        {Number(entry.totalDebit || 0).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-accent">
                        {Number(entry.totalCredit || 0).toLocaleString()}
                      </td>
                      <td className="py-2 text-center hidden md:table-cell">
                        <button
                          onClick={() => {
                            setReversingEntryId(entry.id);
                            setReversalReason('');
                            setReversalError(null);
                          }}
                          className="p-1 rounded hover:bg-status-danger-bg text-content-muted hover:text-status-danger transition-colors"
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
                <tfoot className="bg-surface-elevated/50">
                  <tr>
                    <td colSpan={3} className="py-2 px-4 text-right text-xs font-bold text-content-primary">TOTAUX</td>

                    <td className="py-2 pr-4 text-right font-mono font-bold text-status-success text-xs">
                      {journalEntries.reduce((sum, e) => sum + Number(e.totalDebit || 0), 0).toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-mono font-bold text-accent text-xs">
                      {journalEntries.reduce((sum, e) => sum + Number(e.totalCredit || 0), 0).toLocaleString()}
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
              <div className="bg-surface rounded-xl p-5 w-full max-w-md mx-4 border border-edge shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-status-warning-bg rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-status-warning" />
                    </div>
                    <h3 className="text-sm font-bold text-content-primary">Extourner l'écriture</h3>
                  </div>
                  <button
                    onClick={() => setReversingEntryId(null)}
                    className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-content-muted mb-3">
                  Cette action va créer une écriture inverse pour annuler l'écriture sélectionnée.
                  L'opération est irréversible.
                </p>

                <label className="block text-xs text-content-secondary mb-1 font-medium">Motif d'extourne *</label>
                <textarea
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Ex: Erreur de saisie, double enregistrement..."
                  className="w-full px-3 py-2 bg-surface-base border border-edge rounded-lg text-sm text-content-primary placeholder-content-muted focus:ring-2 focus:ring-status-warning focus:border-transparent resize-none"
                  rows={3}
                />

                {reversalError && (
                  <p className="text-xs text-status-danger mt-2">{reversalError}</p>
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
                    className="text-xs bg-status-warning hover:bg-status-warning"
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
            <div className="col-span-full text-center py-8 text-content-muted text-sm">
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
  const handleExportBilanExcel = async () => {
    await exportBilanExcel(bilanStats, branding.appName);
  };

  const handleExportBilanPDF = async () => {
    await exportBilanPDF(bilanStats, branding.appName);
  };

  const renderBilan = () => (
    <div className="space-y-3">
      {/* Header compact */}
      <div className="bg-linear-to-r from-accent to-status-info rounded-xl p-3">
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
              <Spinner size="xs" tone="onAccent" />
            )}
            <button onClick={handleExportBilanExcel} className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" />
              Excel
            </button>
            <button onClick={handleExportBilanPDF} className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors">
              <Printer className="w-4 h-4" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Structure du bilan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Actif */}
        <div className="bg-surface rounded-xl p-3">
          <h3 className="text-sm font-bold text-status-info mb-3 flex items-center gap-2">
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
                className="flex justify-between items-center p-2 bg-surface-elevated/50 rounded-lg hover:bg-surface-elevated transition-colors"
              >
                <span className="text-xs text-content-secondary">{item.label}</span>
                <span className="text-xs font-mono text-content-primary">{(item.val).toLocaleString()} FCFA</span>
              </div>
            ))}
            <div className="flex justify-between items-center p-2 bg-status-info-bg rounded-lg mt-2">
              <span className="text-xs font-bold text-status-info">TOTAL ACTIF</span>
              <span className="text-xs font-mono font-bold text-status-info">{(bilanStats?.actif?.total || 0).toLocaleString()} FCFA</span>
            </div>
          </div>
        </div>

        {/* Passif */}
        <div className="bg-surface rounded-xl p-3">
          <h3 className="text-sm font-bold text-status-info mb-3 flex items-center gap-2">
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
                className="flex justify-between items-center p-2 bg-surface-elevated/50 rounded-lg hover:bg-surface-elevated transition-colors"
              >
                <span className="text-xs text-content-secondary">{item.label}</span>
                <span className="text-xs font-mono text-content-primary">{(item.val).toLocaleString()} FCFA</span>
              </div>
            ))}
            <div className="flex justify-between items-center p-2 bg-status-info-bg rounded-lg mt-2">
              <span className="text-xs font-bold text-status-info">TOTAL PASSIF</span>
              <span className="text-xs font-mono font-bold text-status-info">{(bilanStats?.passif?.total || 0).toLocaleString()} FCFA</span>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Chart */}
      <Card variant="default" padding="sm" className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1 bg-accent/10 rounded">
            <BarChart3 size={14} className="text-accent" />
          </div>
          <h3 className="text-xs font-bold text-content-primary">Comparaison Actif / Passif</h3>
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
            <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              formatter={(value) => `${Number(value).toLocaleString()} FCFA`}
              contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 11 }}
              itemStyle={{ color: 'var(--text-primary)' }}
            />
            <Bar dataKey="actif" name="Actif" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="passif" name="Passif" fill="#a855f7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );

  // ============================================
  // TAB: Liasse fiscale - États Financiers OHADA
  // ============================================
  const renderLiasse = () => <RapportsOHADA />;

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
      <div className="bg-linear-to-r from-accent to-accent rounded-xl p-3">
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
      <div className="mt-6 bg-surface/50 rounded-xl border border-edge-subtle p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-status-warning" />
            <h3 className="text-sm font-bold text-content-primary">Clôture des Périodes — {currentYear}</h3>
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
            const periods = periodsData as Array<{ id: string; month: number; status: string; closedAt?: string }> | undefined;
            const period = periods?.find(p => p.month === month);
            const isClosed = period?.status === 'closed';

            return (
              <div
                key={month}
                className={`rounded-lg border p-2 text-center transition-colors ${
                  isClosed
                    ? 'bg-status-success-bg border-status-success/30'
                    : 'bg-surface-elevated/30 border-edge-strong/30'
                }`}
              >
                <div className="text-xs font-bold text-content-primary mb-1">{monthNames[i]}</div>
                {isClosed ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <CheckCircle className="w-4 h-4 text-status-success" />
                    <span className="text-[9px] text-status-success">Clôturée</span>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm(`Clôturer la période ${monthNames[i]} ${currentYear} ? Cette action est irréversible.`)) {
                        closePeriodMutation.mutate({ year: currentYear, month });
                      }
                    }}
                    disabled={closePeriodMutation.isPending}
                    className="mt-0.5 px-2 py-1 bg-status-warning-bg hover:bg-status-warning/40 text-status-warning text-[10px] font-medium rounded transition-colors disabled:opacity-50"
                  >
                    {closePeriodMutation.isPending ? '...' : 'Clôturer'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {closePeriodMutation.isError && (
          <div className="mt-3 flex items-center gap-2 text-status-danger text-xs bg-status-danger-bg rounded-lg p-2">
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
    <div className="flex flex-col h-full bg-surface-base min-h-0 space-y-4">
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
              <div className="h-20 bg-surface rounded-xl" />
              {/* Stats row skeleton */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 bg-surface rounded-lg" />
                ))}
              </div>
              {/* Table skeleton */}
              <div className="bg-surface/50 rounded-xl border border-edge-subtle overflow-hidden">
                <div className="h-10 bg-surface-elevated/50" />
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-edge/20">
                    <div className="h-3 bg-surface-elevated rounded w-16" />
                    <div className="h-3 bg-surface-elevated rounded w-24" />
                    <div className="h-3 bg-surface-elevated rounded flex-1" />
                    <div className="h-3 bg-surface-elevated rounded w-20" />
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