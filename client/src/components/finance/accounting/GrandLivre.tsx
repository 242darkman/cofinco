import React, { useState, useCallback, useMemo } from 'react';
import { BookOpen, Search, Download, Printer, Filter, Calendar as CalendarIcon, ArrowRight, TrendingUp, ArrowDownRight, ArrowUpRight, DollarSign, ChevronLeft, ChevronRight, RefreshCw, FileText, Info, ExternalLink } from 'lucide-react';
import PageHeader from '../../ui/PageHeader';
import StatCard from '../../ui/StatCard';
import ResponsiveTable from '../../ui/ResponsiveTable';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import { toast, handleApiError } from '../../../lib/toast';
import { addPdfLogoHeader } from '../../../lib/pdf-logo';
import { useChartOfAccounts, useGrandLivre, useAccountingWebSocket } from '../../../hooks/accounting/useAccounting';
// P4.1: Lazy-load heavy export libraries
import { loadExportLibraries } from '../../../lib/lazy-export';

interface GrandLivreEntry {
  id: string;
  dateEcriture: string;
  numeroPiece: string;
  journalCode: string;
  journalIntitule: string;
  ecritureLibelle: string;
  ligneLibelle: string;
  debit: number;
  credit: number;
  soldeProgressif: number;
  sourceType?: string;
  sourceId?: string;
  refExterne?: string;
}

interface GrandLivreData {
  compteId: string;
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: string;
  sensNormal: string;
  soldeOuverture: number;
  totalDebits: number;
  totalCredits: number;
  soldeFinal: number;
  entries: GrandLivreEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export default function GrandLivre() {
  const [compteSelectionne, setCompteSelectionne] = useState('');
  const [dateDebut, setDateDebut] = useState(new Date().getFullYear() + '-01-01');
  const [dateFin, setDateFin] = useState(new Date().toISOString().split('T')[0]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  // Real-time WebSocket invalidation
  useAccountingWebSocket();

  // React Query: chart of accounts for the dropdown
  const { data: comptesData } = useChartOfAccounts();
  const comptes = comptesData || [];

  // React Query: grand livre data
  const { data: grandLivreData, isLoading: loading, refetch: fetchGrandLivre } = useGrandLivre(
    compteSelectionne || undefined,
    { dateDebut, dateFin, page, pageSize }
  );

  // Reset page when account or dates change
  const handleCompteChange = useCallback((newCompte: string) => {
    setCompteSelectionne(newCompte);
    setPage(1);
  }, []);

  const entries = grandLivreData?.entries || [];
  const totalDebit = grandLivreData?.totalDebits || 0;
  const totalCredit = grandLivreData?.totalCredits || 0;
  const soldeFinal = grandLivreData?.soldeFinal || 0;
  const soldeOuverture = grandLivreData?.soldeOuverture || 0;
  const pagination = grandLivreData?.pagination;

  const handleExportExcel = useCallback(async () => {
    if (!grandLivreData || entries.length === 0) {
      toast.warning('Aucune donnee a exporter');
      return;
    }

    try {
      // P4.1: Lazy-load export library
      const { XLSX } = await loadExportLibraries();

      const data = entries.map(m => ({
        'Date': new Date(m.dateEcriture).toLocaleDateString('fr-FR'),
        'N Piece': m.numeroPiece,
        'Journal': m.journalCode,
        'Libelle': m.ecritureLibelle || m.ligneLibelle,
        'Debit': m.debit,
        'Credit': m.credit,
        'Solde': m.soldeProgressif
      }));

      // Add totals row
      data.push({
        'Date': 'TOTAUX',
        'N Piece': '',
        'Journal': '',
        'Libelle': '',
        'Debit': totalDebit,
        'Credit': totalCredit,
        'Solde': soldeFinal
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();

      // Add header info
      XLSX.utils.sheet_add_aoa(ws, [
        [`Grand Livre - Compte ${grandLivreData.numeroCompte} - ${grandLivreData.intitule}`],
        [`Periode: ${dateDebut} au ${dateFin}`],
        [`Solde d'ouverture: ${soldeOuverture.toLocaleString('fr-FR')} FCFA`],
        []
      ], { origin: 'A1' });

      XLSX.utils.book_append_sheet(wb, ws, 'Grand Livre');
      XLSX.writeFile(wb, `Grand_Livre_${grandLivreData.numeroCompte}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Export Excel reussi');
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'export Excel"));
    }
  }, [grandLivreData, entries, totalDebit, totalCredit, soldeFinal, soldeOuverture, dateDebut, dateFin]);

  const handleExportPDF = useCallback(async () => {
    if (!grandLivreData || entries.length === 0) {
      toast.warning('Aucune donnee a exporter');
      return;
    }

    try {
      // P4.1: Lazy-load PDF library
      const { jsPDF } = await loadExportLibraries();
      const doc = new jsPDF('landscape');

      // Header with logo
      const startY = addPdfLogoHeader(doc, {
        title: 'GRAND LIVRE',
        subtitle: `Compte: ${grandLivreData.numeroCompte} - ${grandLivreData.intitule}`,
        dateRight: `Période: ${dateDebut} au ${dateFin}`,
      });

      // Solde d'ouverture
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Solde d'ouverture: ${soldeOuverture.toLocaleString('fr-FR')} FCFA`, 14, startY);

      // Table header
      const tableY = startY + 8;
      doc.setFontSize(9);
      doc.setTextColor(255);
      doc.setFillColor(30, 58, 138);
      doc.rect(20, tableY, 257, 10, 'F');
      doc.text('Date', 25, tableY + 7);
      doc.text('N Piece', 50, tableY + 7);
      doc.text('Journal', 80, tableY + 7);
      doc.text('Libelle', 100, tableY + 7);
      doc.text('Debit', 180, tableY + 7);
      doc.text('Credit', 210, tableY + 7);
      doc.text('Solde', 245, tableY + 7);

      // Table content
      doc.setTextColor(0);
      let y = tableY + 17;
      const maxRows = Math.min(entries.length, 25);

      entries.slice(0, maxRows).forEach((m) => {
        doc.setFontSize(8);
        doc.text(new Date(m.dateEcriture).toLocaleDateString('fr-FR'), 25, y);
        doc.text(m.numeroPiece || '', 50, y);
        doc.text(m.journalCode || '', 80, y);
        doc.text((m.ecritureLibelle || m.ligneLibelle || '').substring(0, 40), 100, y);
        doc.text(m.debit > 0 ? m.debit.toLocaleString('fr-FR') : '-', 180, y);
        doc.text(m.credit > 0 ? m.credit.toLocaleString('fr-FR') : '-', 210, y);
        doc.text(m.soldeProgressif.toLocaleString('fr-FR'), 245, y);
        y += 7;
      });

      if (entries.length > maxRows) {
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`... et ${entries.length - maxRows} autres mouvements`, 25, y);
        y += 10;
      }

      // Totals
      y += 5;
      doc.setFillColor(30, 58, 138);
      doc.rect(20, y - 5, 257, 12, 'F');
      doc.setFontSize(10);
      doc.setTextColor(255);
      doc.text('TOTAUX', 25, y + 3);
      doc.text(totalDebit.toLocaleString('fr-FR') + ' FCFA', 180, y + 3);
      doc.text(totalCredit.toLocaleString('fr-FR') + ' FCFA', 210, y + 3);
      doc.text(soldeFinal.toLocaleString('fr-FR') + ' FCFA', 245, y + 3);

      doc.save(`Grand_Livre_${grandLivreData.numeroCompte}_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Export PDF reussi');
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'export PDF"));
    }
  }, [grandLivreData, entries, totalDebit, totalCredit, soldeFinal, soldeOuverture, dateDebut, dateFin]);

  const columns = [
    {
      label: 'Libelle',
      key: 'ecritureLibelle',
      primary: true,
      format: (val: string, row: GrandLivreEntry) => (
        <div>
          <span className="text-white font-medium line-clamp-2 text-xs sm:text-sm">{val || row.ligneLibelle}</span>
          {row.sourceType && (
            <span className="text-[10px] text-cyan-400/70 flex items-center gap-1 mt-0.5">
              <ExternalLink size={10} />
              {row.sourceType}
            </span>
          )}
        </div>
      )
    },
    {
      label: 'Date',
      key: 'dateEcriture',
      format: (val: string) => (
        <span className="flex items-center gap-1 text-slate-400 text-xs text-[10px] sm:text-xs">
          <CalendarIcon size={12} />
          {new Date(val).toLocaleDateString('fr-FR')}
        </span>
      )
    },
    {
      label: 'Piece',
      key: 'numeroPiece',
      hideOnMobile: true,
      format: (val: string, row: GrandLivreEntry) => (
        <div>
          <span className="font-mono text-cyan-400 text-[10px] sm:text-xs">{val}</span>
          {row.journalCode && (
            <span className="block text-[9px] text-slate-500">{row.journalCode}</span>
          )}
        </div>
      )
    },
    {
      label: 'Debit',
      key: 'debit',
      format: (val: number) => val > 0 ? <span className="text-amber-400 font-mono text-xs font-medium">{val.toLocaleString()}</span> : <span className="text-slate-600 text-xs">-</span>
    },
    {
      label: 'Credit',
      key: 'credit',
      format: (val: number) => val > 0 ? <span className="text-emerald-400 font-mono text-xs font-medium">{val.toLocaleString()}</span> : <span className="text-slate-600 text-xs">-</span>
    },
    {
      label: 'Solde',
      key: 'soldeProgressif',
      format: (val: number) => (
        <span className={`font-mono font-bold text-xs ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {val.toLocaleString()}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-4">
      {/* Filters & Actions Card */}
      <Card padding="sm" className="bg-slate-800/80">
        <div className="flex flex-col gap-3">
            {/* Top Row: Account & Actions */}
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                 <div className="flex-1">
                     <label className="text-[10px] uppercase text-slate-500 font-bold mb-1.5 flex items-center gap-1">
                        <BookOpen size={10} /> Compte
                     </label>
                     <select
                        value={compteSelectionne}
                        onChange={(e) => handleCompteChange(e.target.value)}
                        className="w-full bg-slate-900/50 text-white text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500 transition-colors"
                      >
                        <option value="">Selectionner un compte...</option>
                        {comptes.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.numeroCompte} - {c.intitule}
                          </option>
                        ))}
                    </select>
                 </div>

                 <div className="flex gap-2 self-end sm:self-center">
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={RefreshCw}
                        onClick={() => fetchGrandLivre()}
                        disabled={!compteSelectionne || loading}
                        className={`bg-slate-900/50 border-slate-700 hover:bg-slate-800 ${loading ? 'animate-spin' : ''}`}
                        title="Rafraichir"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        icon={Download}
                        onClick={handleExportExcel}
                        disabled={!compteSelectionne || entries.length === 0}
                        className="bg-slate-900/50 border-slate-700 hover:bg-slate-800"
                    >
                        <span className="hidden sm:inline">Excel</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        icon={Printer}
                        onClick={handleExportPDF}
                        disabled={!compteSelectionne || entries.length === 0}
                        className="bg-slate-900/50 border-slate-700 hover:bg-slate-800"
                    >
                        <span className="hidden sm:inline">PDF</span>
                    </Button>
                 </div>
            </div>

            {/* Bottom Row: Dates */}
            <div className="flex gap-3 pt-2 border-t border-slate-700/50">
                 <div className="flex-1">
                   <label className="text-[10px] uppercase text-slate-500 font-bold mb-1.5">Debut</label>
                   <div className="relative">
                       <input
                        type="date"
                        value={dateDebut}
                        onChange={(e) => setDateDebut(e.target.value)}
                        className="w-full bg-slate-900/50 text-white text-xs sm:text-sm pl-8 pr-2 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500"
                      />
                      <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 w-3.5 h-3.5" />
                   </div>
                 </div>
                 <div className="flex-1">
                   <label className="text-[10px] uppercase text-slate-500 font-bold mb-1.5">Fin</label>
                   <div className="relative">
                       <input
                        type="date"
                        value={dateFin}
                        onChange={(e) => setDateFin(e.target.value)}
                        className="w-full bg-slate-900/50 text-white text-xs sm:text-sm pl-8 pr-2 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500"
                      />
                      <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 w-3.5 h-3.5" />
                   </div>
                 </div>
            </div>
        </div>
      </Card>

      {compteSelectionne ? (
        <>
          {/* Account Info */}
          {grandLivreData && (
            <div className="flex items-center gap-2 px-2">
              <FileText size={14} className="text-cyan-400" />
              <span className="text-sm text-white font-medium">{grandLivreData.numeroCompte}</span>
              <span className="text-sm text-slate-400">-</span>
              <span className="text-sm text-slate-300">{grandLivreData.intitule}</span>
              <span className="text-xs text-slate-500 ml-auto">
                Classe {grandLivreData.classe} | {grandLivreData.typeCompte}
              </span>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
             {soldeOuverture !== 0 && (
               <StatCard
                 title="Solde Ouverture"
                 value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 }).format(soldeOuverture)}
                 icon={Info}
                 color="neutral"
                 subtitle="Report a nouveau"
                 className="bg-slate-800/50 border-slate-700/50"
               />
             )}
             <StatCard
               title="Total Debits"
               value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 }).format(totalDebit)}
               icon={ArrowDownRight}
               color="warning"
               subtitle={`${entries.length} mouvements`}
               className="bg-slate-800/50 border-slate-700/50"
             />
             <StatCard
               title="Total Credits"
               value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 }).format(totalCredit)}
               icon={ArrowUpRight}
               color="success"
               subtitle="Cumul credit"
               className="bg-slate-800/50 border-slate-700/50"
             />
             <StatCard
               title="Solde Final"
               value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 }).format(soldeFinal)}
               icon={DollarSign}
               color={soldeFinal >= 0 ? 'success' : 'primary'}
               subtitle={grandLivreData?.sensNormal || ''}
               className="bg-slate-800/50 border-slate-700/50 shadow-lg shadow-blue-500/5"
             />
          </div>

          {/* Table */}
          <div className="bg-slate-900/50 rounded-xl overflow-hidden">
              <ResponsiveTable
                data={entries}
                columns={columns}
                loading={loading}
                emptyMessage="Aucun mouvement sur cette periode."
                mobileBreakpoint="md"
              />
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-slate-400">
                Page {pagination.page} sur {pagination.totalPages} ({pagination.total} lignes)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ChevronLeft}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="bg-slate-800/50"
                >
                  Prec.
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ChevronRight}
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages || loading}
                  className="bg-slate-800/50"
                >
                  Suiv.
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
           <div className="bg-slate-800 p-4 rounded-full mb-4">
             <BookOpen className="w-8 h-8 text-blue-400" />
           </div>
           <p className="text-sm font-medium text-white">Selectionnez un compte</p>
           <p className="text-xs text-slate-400 max-w-[200px] mt-1">Choisissez un compte ci-dessus pour afficher le grand livre.</p>
        </div>
      )}
    </div>
  );
}
