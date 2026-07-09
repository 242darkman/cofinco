import React, { useState, useCallback, useMemo } from 'react';
import { BookOpen, Search, Download, Printer, Filter, Calendar as CalendarIcon, ArrowRight, TrendingUp, ArrowDownRight, ArrowUpRight, DollarSign, ChevronLeft, ChevronRight, RefreshCw, FileText, Info, ExternalLink } from 'lucide-react';
import PageHeader from '../../ui/PageHeader';
import StatCard from '../../ui/StatCard';
import ResponsiveTable from '../../ui/ResponsiveTable';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import { toast, handleApiError } from '../../../lib/toast';
import { addPdfLogoHeader } from '../../../lib/pdf-logo';
import { useBranding } from '../../../contexts/BrandingContext';
import { useChartOfAccounts, useGrandLivre, useAccountingWebSocket } from '../../../hooks/accounting/useAccounting';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries } from '../../../lib/lazy-export';
import { currencyCode } from '@shared/config/currency';

import {
  exportGrandLivreExcel,
  exportGrandLivrePDF,
  GrandLivreEntryExport,
  GrandLivreDataExport
} from './exports/grandLivreExports';

interface GrandLivreEntry extends GrandLivreEntryExport {}
interface GrandLivreData extends GrandLivreDataExport {}

export default function GrandLivre() {
  const { branding } = useBranding();
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
    if (!grandLivreData) return;
    await exportGrandLivreExcel(
      grandLivreData,
      entries,
      totalDebit,
      totalCredit,
      soldeFinal,
      soldeOuverture,
      dateDebut,
      dateFin
    );
  }, [grandLivreData, entries, totalDebit, totalCredit, soldeFinal, soldeOuverture, dateDebut, dateFin]);

  const handleExportPDF = useCallback(async () => {
    if (!grandLivreData) return;
    await exportGrandLivrePDF(
      grandLivreData,
      entries,
      totalDebit,
      totalCredit,
      soldeFinal,
      soldeOuverture,
      dateDebut,
      dateFin,
      branding
    );
  }, [grandLivreData, entries, totalDebit, totalCredit, soldeFinal, soldeOuverture, dateDebut, dateFin, branding]);

  const columns = [
    {
      label: 'Libelle',
      key: 'ecritureLibelle',
      primary: true,
      format: (val: string, row: GrandLivreEntry) => (
        <div>
          <span className="text-content-primary font-medium line-clamp-2 text-xs sm:text-sm">{val || row.ligneLibelle}</span>
          {row.sourceType && (
            <span className="text-[10px] text-accent/70 flex items-center gap-1 mt-0.5">
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
        <span className="flex items-center gap-1 text-content-muted text-xs text-[10px] sm:text-xs">
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
          <span className="font-mono text-accent text-[10px] sm:text-xs">{val}</span>
          {row.journalCode && (
            <span className="block text-[9px] text-content-muted">{row.journalCode}</span>
          )}
        </div>
      )
    },
    {
      label: 'Debit',
      key: 'debit',
      format: (val: number) => val > 0 ? <span className="text-status-warning font-mono text-xs font-medium">{val.toLocaleString()}</span> : <span className="text-content-muted text-xs">-</span>
    },
    {
      label: 'Credit',
      key: 'credit',
      format: (val: number) => val > 0 ? <span className="text-status-success font-mono text-xs font-medium">{val.toLocaleString()}</span> : <span className="text-content-muted text-xs">-</span>
    },
    {
      label: 'Solde',
      key: 'soldeProgressif',
      format: (val: number) => (
        <span className={`font-mono font-bold text-xs ${val >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
          {val.toLocaleString()}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-4">
      {/* Filters & Actions Card */}
      <Card padding="sm" className="bg-surface/80">
        <div className="flex flex-col gap-3">
            {/* Top Row: Account & Actions */}
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                 <div className="flex-1">
                     <label className="text-[10px] uppercase text-content-muted font-bold mb-1.5 flex items-center gap-1">
                        <BookOpen size={10} /> Compte
                     </label>
                     <select
                        value={compteSelectionne}
                        onChange={(e) => handleCompteChange(e.target.value)}
                        className="w-full bg-surface-base/50 text-content-primary text-xs sm:text-sm px-3 py-2 rounded-lg border border-edge focus:outline-none focus:border-accent transition-colors"
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
                        className={`bg-surface-base/50 border-edge hover:bg-surface ${loading ? 'animate-spin' : ''}`}
                        title="Rafraichir"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        icon={Download}
                        onClick={handleExportExcel}
                        disabled={!compteSelectionne || entries.length === 0}
                        className="bg-surface-base/50 border-edge hover:bg-surface"
                    >
                        <span className="hidden sm:inline">Excel</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        icon={Printer}
                        onClick={handleExportPDF}
                        disabled={!compteSelectionne || entries.length === 0}
                        className="bg-surface-base/50 border-edge hover:bg-surface"
                    >
                        <span className="hidden sm:inline">PDF</span>
                    </Button>
                 </div>
            </div>

            {/* Bottom Row: Dates */}
            <div className="flex gap-3 pt-2 border-t border-edge-subtle">
                 <div className="flex-1">
                   <label className="text-[10px] uppercase text-content-muted font-bold mb-1.5">Debut</label>
                   <div className="relative">
                       <input
                        type="date"
                        value={dateDebut}
                        onChange={(e) => setDateDebut(e.target.value)}
                        className="w-full bg-surface-base/50 text-content-primary text-xs sm:text-sm pl-8 pr-2 py-1.5 rounded-lg border border-edge focus:outline-none focus:border-accent"
                      />
                      <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted w-3.5 h-3.5" />
                   </div>
                 </div>
                 <div className="flex-1">
                   <label className="text-[10px] uppercase text-content-muted font-bold mb-1.5">Fin</label>
                   <div className="relative">
                       <input
                        type="date"
                        value={dateFin}
                        onChange={(e) => setDateFin(e.target.value)}
                        className="w-full bg-surface-base/50 text-content-primary text-xs sm:text-sm pl-8 pr-2 py-1.5 rounded-lg border border-edge focus:outline-none focus:border-accent"
                      />
                      <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted w-3.5 h-3.5" />
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
              <FileText size={14} className="text-accent" />
              <span className="text-sm text-content-primary font-medium">{grandLivreData.numeroCompte}</span>
              <span className="text-sm text-content-muted">-</span>
              <span className="text-sm text-content-secondary">{grandLivreData.intitule}</span>
              <span className="text-xs text-content-muted ml-auto">
                Classe {grandLivreData.classe} | {grandLivreData.typeCompte}
              </span>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
             {soldeOuverture !== 0 && (
               <StatCard
                 title="Solde Ouverture"
                 value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currencyCode(), minimumFractionDigits: 0 }).format(soldeOuverture)}
                 icon={Info}
                 color="neutral"
                 subtitle="Report a nouveau"
                 className="bg-surface/50 border-edge-subtle"
               />
             )}
             <StatCard
               title="Total Debits"
               value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currencyCode(), minimumFractionDigits: 0 }).format(totalDebit)}
               icon={ArrowDownRight}
               color="warning"
               subtitle={`${entries.length} mouvements`}
               className="bg-surface/50 border-edge-subtle"
             />
             <StatCard
               title="Total Credits"
               value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currencyCode(), minimumFractionDigits: 0 }).format(totalCredit)}
               icon={ArrowUpRight}
               color="success"
               subtitle="Cumul credit"
               className="bg-surface/50 border-edge-subtle"
             />
             <StatCard
               title="Solde Final"
               value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currencyCode(), minimumFractionDigits: 0 }).format(soldeFinal)}
               icon={DollarSign}
               color={soldeFinal >= 0 ? 'success' : 'primary'}
               subtitle={grandLivreData?.sensNormal || ''}
               className="bg-surface/50 border-edge-subtle shadow-lg shadow-status-info/5"
             />
          </div>

          {/* Table */}
          <div className="bg-surface-base/50 rounded-xl overflow-hidden">
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
              <span className="text-xs text-content-muted">
                Page {pagination.page} sur {pagination.totalPages} ({pagination.total} lignes)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ChevronLeft}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="bg-surface/50"
                >
                  Prec.
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ChevronRight}
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages || loading}
                  className="bg-surface/50"
                >
                  Suiv.
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
           <div className="bg-surface p-4 rounded-full mb-4">
             <BookOpen className="w-8 h-8 text-status-info" />
           </div>
           <p className="text-sm font-medium text-content-primary">Selectionnez un compte</p>
           <p className="text-xs text-content-muted max-w-[200px] mt-1">Choisissez un compte ci-dessus pour afficher le grand livre.</p>
        </div>
      )}
    </div>
  );
}
