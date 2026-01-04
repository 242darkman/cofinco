import React, { useState, useEffect } from 'react';
import {
  BookOpen, FileText, BarChart3, TrendingUp, Download, Building2,
  Calculator, DollarSign, Filter, Search, Calendar, Lock, Settings,
  ChevronDown, ChevronRight, Printer, Mail, PieChart, Activity, Plus, CheckCircle
} from 'lucide-react';
import SaisieEcriture from './SaisieEcriture';
import BalanceGenerale from './BalanceGenerale';
import GrandLivre from './GrandLivre';
import CompteResultat from './CompteResultat';
import DeclarationTVA from './DeclarationTVA';
import TableauTresorerie from './TableauTresorerie';
import TAFIRE from './TAFIRE';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import TabGroup from '../../ui/TabGroup';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';

// ============================================
// INTERFACES
// ============================================
interface CompteOHADA {
  id: string;
  numero_compte: string;
  intitule: string;
  classe: number;
  type_compte: 'Actif' | 'Passif' | 'Charge' | 'Produit' | 'Capitaux'; // Updated to match new component
  sens_normal: 'Débit' | 'Crédit';
  niveau: number;
  actif: boolean;
  description: string;
  solde_actuel: number; // Added for stats
}

type TabKey = 'plan' | 'journaux' | 'ecritures' | 'balance' | 'grandlivre' | 'bilan' | 'resultat' | 'tva' | 'tresorerie' | 'tafire' | 'liasse' | 'rapports';

interface JournalEcriture {
  id: string;
  date: string;
  piece: string;
  libelle: string;
  compte: string;
  debit: number;
  credit: number;
}

interface JournalType {
  code: string;
  label: string;
  color: string;
  count: number;
  ecritures: JournalEcriture[];
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

const journauxTypes: JournalType[] = [
  { code: 'AC', label: 'Journal des Achats', color: 'from-orange-500 to-orange-600', count: 45, ecritures: [] },
  { code: 'VE', label: 'Journal des Ventes', color: 'from-green-500 to-green-600', count: 78, ecritures: [] },
  { code: 'BQ', label: 'Journal de Banque', color: 'from-blue-500 to-blue-600', count: 156, ecritures: [] },
  { code: 'CA', label: 'Journal de Caisse', color: 'from-purple-500 to-purple-600', count: 89, ecritures: [] },
  { code: 'OD', label: 'Opérations Diverses', color: 'from-slate-500 to-slate-600', count: 23, ecritures: [] },
  { code: 'AN', label: 'A Nouveaux', color: 'from-cyan-500 to-cyan-600', count: 12, ecritures: [] },
];

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
  const [activeTab, setActiveTab] = useState<TabKey>('plan');
  const [comptes, setComptes] = useState<CompteOHADA[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedClasses, setExpandedClasses] = useState<number[]>([]);
  const [selectedJournal, setSelectedJournal] = useState<JournalType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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

  useEffect(() => {
    fetchComptes();
  }, []);

  const fetchComptes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/comptabilite/comptes');
      if (res.ok) {
        const data = await res.json();
        setComptes(data || []);
      } else {
        setComptes([]);
      }
    } catch (error) {
      console.error('Erreur chargement comptes:', error);
      setComptes([]);
    } finally {
      setLoading(false);
    }
  };

  // Add stats fetching
  const [journauxStats, setJournauxStats] = useState<any[]>([]);
  const [bilanStats, setBilanStats] = useState<any>(null);

  useEffect(() => {
    const fetchStats = async () => {
        try {
            const [resJournaux, resBilan] = await Promise.all([
                fetch('/api/comptabilite/journaux-stats'),
                fetch('/api/comptabilite/bilan-synthetique')
            ]);
            
            if (resJournaux.ok) setJournauxStats(await resJournaux.json());
            if (resBilan.ok) setBilanStats(await resBilan.json());
        } catch (e) {
            console.error("Error fetching stats", e);
        }
    };
    fetchStats();
  }, []);

  // Merge real stats with static config
  const journauxDisplay = journauxTypes.map(j => {
      const stat = Array.isArray(journauxStats) ? journauxStats.find(s => s.code === j.code) : null;
      return { ...j, count: stat ? stat.count : 0 };
  });

  const toggleClasse = (numero: number) => {
    setExpandedClasses(prev =>
      prev.includes(numero)
        ? prev.filter(n => n !== numero)
        : [...prev, numero]
    );
  };

  const getComptesByClasse = (classeNumero: number) => {
    // Basic mapping if 'classe' is not explicitly on the object but solvable by numero_compte
    // Assuming backend returns objects with 'classe' or we derive it:
    return comptes.filter(c => c.classe === classeNumero || (c.numero_compte && parseInt(String(c.numero_compte).charAt(0)) === classeNumero));
  };

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
                <div className="text-base font-bold text-white leading-none">8</div>
                <div className="text-[9px] text-white/70">Classes</div>
              </div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <Activity className="w-4 h-4 text-white/80" />
              <div>
                <div className="text-base font-bold text-white leading-none">100%</div>
                <div className="text-[9px] text-white/70">Conforme</div>
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
                                {compte.solde_actuel ? compte.solde_actuel.toLocaleString() : '-'}
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

          {/* Stats Placeholder - could be real data */}
           <div className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <FileText className="w-4 h-4 text-white/80" />
              <div>
                <div className="text-base font-bold text-white leading-none">{journauxTypes.length}</div>
                <div className="text-[9px] text-white/70">Journaux</div>
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
              onClick={() => setSelectedJournal(null)}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Retour
            </button>
            <h3 className="text-sm font-bold text-white">{selectedJournal.label}</h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs border-b border-slate-700">
                  <th className="pb-2 pr-4 font-medium w-20">Date</th>
                  <th className="pb-2 pr-4 font-medium w-16 hidden sm:table-cell">Pièce</th>
                  <th className="pb-2 pr-4 font-medium">Libellé</th>
                  <th className="pb-2 pr-4 font-medium text-right w-20">Débit</th>
                  <th className="pb-2 font-medium text-right w-20">Crédit</th>
                </tr>
              </thead>
              <tbody className="text-white text-xs">
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Aucune écriture dans ce journal
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {journauxDisplay.map((journal) => (
            <button
              key={journal.code}
              onClick={() => setSelectedJournal(journal)}
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
          ))}
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
          <div className="flex gap-2 flex-shrink-0">
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
          { id: 'bilan', label: 'Bilan', desc: 'Actif/Passif', icon: PieChart, color: 'from-blue-500 to-blue-600' },
          { id: 'resultat', label: 'Résultat', desc: 'Charges/Produits', icon: TrendingUp, color: 'from-green-500 to-green-600' },
          { id: 'tafire', label: 'TAFIRE', desc: 'Tableau financier', icon: Activity, color: 'from-purple-500 to-purple-600' },
          { id: 'annexes', label: 'Annexes', desc: 'Notes', icon: FileText, color: 'from-cyan-500 to-cyan-600' },
          { id: 'flux', label: 'Trésorerie', desc: 'Flux', icon: DollarSign, color: 'from-orange-500 to-orange-600' },
          { id: 'variation', label: 'Variation', desc: 'Capitaux', icon: BarChart3, color: 'from-pink-500 to-pink-600' },
        ].map((etat) => {
          const Icon = etat.icon;
          return (
            <button
              key={etat.id}
              className={`
                bg-gradient-to-br ${etat.color} 
                rounded-lg p-3
                text-white text-left
                hover:scale-[1.02] hover:shadow-lg
                transition-all duration-200
              `}
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
    </div>
  );

  // Render du contenu selon l'onglet actif
  const renderContent = () => {
    switch (activeTab) {
      case 'plan': return renderPlanOHADA();
      case 'journaux': return renderJournaux();
      case 'ecritures': return <SaisieEcriture onSuccess={fetchComptes} />;
      case 'balance': return <BalanceGenerale />;
      case 'grandlivre': return <GrandLivre />;
      case 'bilan': return renderBilan();
      case 'resultat': return <CompteResultat comptes={comptes} loading={loading} />;
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
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
              <span className="text-sm">Chargement...</span>
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