import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, Search, Download, Printer, Filter, Calendar as CalendarIcon, ArrowRight, TrendingUp, ArrowDownRight, ArrowUpRight, DollarSign } from 'lucide-react';
import PageHeader from '../../ui/PageHeader';
import StatCard from '../../ui/StatCard';
import ResponsiveTable from '../../ui/ResponsiveTable';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { comptabiliteApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';

interface MouvementCompte {
  date: string;
  numero_piece: string;
  libelle: string;
  debit: number;
  credit: number;
  solde: number;
}

export default function GrandLivre() {
  const [comptes, setComptes] = useState<any[]>([]);
  const [compteSelectionne, setCompteSelectionne] = useState('');
  const [mouvements, setMouvements] = useState<MouvementCompte[]>([]);
  const [dateDebut, setDateDebut] = useState('2024-01-01');
  const [dateFin, setDateFin] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const fetchComptes = useCallback(async () => {
    try {
      const data = await comptabiliteApi.getPlanOhada();
      setComptes(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des comptes'));
      setComptes([]);
    }
  }, []);

  const fetchMouvements = useCallback(async () => {
    if (!compteSelectionne) return;
    setLoading(true);
    try {
      const data = await comptabiliteApi.getGrandLivre(compteSelectionne, { dateDebut, dateFin });
      let solde = 0;
      const mouvementsAvecSolde: MouvementCompte[] = (data || []).map((ligne: any) => {
        solde += (ligne.debit || 0) - (ligne.credit || 0);
        return {
          date: ligne.date_ecriture || ligne.date,
          numero_piece: ligne.numero_piece,
          libelle: ligne.libelle,
          debit: ligne.debit || 0,
          credit: ligne.credit || 0,
          solde: solde
        };
      });
      setMouvements(mouvementsAvecSolde);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement du grand livre'));
      setMouvements([]);
    } finally {
      setLoading(false);
    }
  }, [compteSelectionne, dateDebut, dateFin]);

  useEffect(() => {
    fetchComptes();
  }, [fetchComptes]);

  useEffect(() => {
    if (compteSelectionne) {
      fetchMouvements();
    } else {
      setMouvements([]);
    }
  }, [compteSelectionne, fetchMouvements]);

  const compteInfo = comptes.find(c => c.id === compteSelectionne);
  const totalDebit = mouvements.reduce((sum, m) => sum + m.debit, 0);
  const totalCredit = mouvements.reduce((sum, m) => sum + m.credit, 0);
  const soldeFinal = mouvements.length > 0 ? mouvements[mouvements.length - 1].solde : 0;

  const handleExportExcel = useCallback(() => {
    if (!compteInfo || mouvements.length === 0) {
      toast.warning('Aucune donnée à exporter');
      return;
    }

    try {
      const data = mouvements.map(m => ({
        'Date': new Date(m.date).toLocaleDateString('fr-FR'),
        'N° Pièce': m.numero_piece,
        'Libellé': m.libelle,
        'Débit': m.debit,
        'Crédit': m.credit,
        'Solde': m.solde
      }));

      // Add totals row
      data.push({
        'Date': 'TOTAUX',
        'N° Pièce': '',
        'Libellé': '',
        'Débit': totalDebit,
        'Crédit': totalCredit,
        'Solde': soldeFinal
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();

      // Add header info
      XLSX.utils.sheet_add_aoa(ws, [
        [`Grand Livre - Compte ${compteInfo.numero_compte} - ${compteInfo.intitule}`],
        [`Période: ${dateDebut} au ${dateFin}`],
        []
      ], { origin: 'A1' });

      XLSX.utils.book_append_sheet(wb, ws, 'Grand Livre');
      XLSX.writeFile(wb, `Grand_Livre_${compteInfo.numero_compte}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Export Excel réussi');
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'export Excel"));
    }
  }, [compteInfo, mouvements, totalDebit, totalCredit, soldeFinal, dateDebut, dateFin]);

  const handleExportPDF = useCallback(() => {
    if (!compteInfo || mouvements.length === 0) {
      toast.warning('Aucune donnée à exporter');
      return;
    }

    try {
      const doc = new jsPDF('landscape');

      // Header
      doc.setFontSize(20);
      doc.setTextColor(30, 58, 138);
      doc.text('GRAND LIVRE', 148, 20, { align: 'center' });

      doc.setFontSize(14);
      doc.setTextColor(50);
      doc.text(`Compte: ${compteInfo.numero_compte} - ${compteInfo.intitule}`, 148, 30, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Période: ${dateDebut} au ${dateFin}`, 148, 38, { align: 'center' });
      doc.text(`Édité le: ${new Date().toLocaleDateString('fr-FR')}`, 148, 44, { align: 'center' });

      // Line separator
      doc.setDrawColor(30, 58, 138);
      doc.line(20, 50, 277, 50);

      // Table header
      doc.setFontSize(9);
      doc.setTextColor(255);
      doc.setFillColor(30, 58, 138);
      doc.rect(20, 55, 257, 10, 'F');
      doc.text('Date', 25, 62);
      doc.text('N° Pièce', 55, 62);
      doc.text('Libellé', 90, 62);
      doc.text('Débit', 180, 62);
      doc.text('Crédit', 210, 62);
      doc.text('Solde', 245, 62);

      // Table content
      doc.setTextColor(0);
      let y = 72;
      const maxRows = Math.min(mouvements.length, 25);

      mouvements.slice(0, maxRows).forEach((m) => {
        doc.setFontSize(8);
        doc.text(new Date(m.date).toLocaleDateString('fr-FR'), 25, y);
        doc.text(m.numero_piece || '', 55, y);
        doc.text((m.libelle || '').substring(0, 45), 90, y);
        doc.text(m.debit > 0 ? m.debit.toLocaleString('fr-FR') : '-', 180, y);
        doc.text(m.credit > 0 ? m.credit.toLocaleString('fr-FR') : '-', 210, y);
        doc.text(m.solde.toLocaleString('fr-FR'), 245, y);
        y += 7;
      });

      if (mouvements.length > maxRows) {
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`... et ${mouvements.length - maxRows} autres mouvements`, 25, y);
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

      doc.save(`Grand_Livre_${compteInfo.numero_compte}_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Export PDF réussi');
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'export PDF"));
    }
  }, [compteInfo, mouvements, totalDebit, totalCredit, soldeFinal, dateDebut, dateFin]);

  const columns = [
    {
      label: 'Libellé',
      key: 'libelle',
      primary: true, // Make Libellé primary for cleaner mobile cards
      format: (val: string) => <span className="text-white font-medium line-clamp-2 text-xs sm:text-sm">{val}</span>
    },
    {
      label: 'Date',
      key: 'date',
      format: (val: string) => (
        <span className="flex items-center gap-1 text-slate-400 text-xs text-[10px] sm:text-xs">
          <CalendarIcon size={12} />
          {new Date(val).toLocaleDateString('fr-FR')}
        </span>
      )
    },
    {
      label: 'Pièce',
      key: 'numero_piece',
      hideOnMobile: true, // Hide on mobile card summary, or keep if critical
      format: (val: string) => <span className="font-mono text-cyan-400 text-[10px] sm:text-xs">{val}</span>
    },
    {
      label: 'Débit',
      key: 'debit',
      format: (val: number) => val > 0 ? <span className="text-white font-mono text-xs">{val.toLocaleString()}</span> : <span className="text-slate-600 text-xs">-</span>
    },
    {
      label: 'Crédit',
      key: 'credit',
      format: (val: number) => val > 0 ? <span className="text-white font-mono text-xs">{val.toLocaleString()}</span> : <span className="text-slate-600 text-xs">-</span>
    },
    {
      label: 'Solde',
      key: 'solde',
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
                        onChange={(e) => setCompteSelectionne(e.target.value)}
                        className="w-full bg-slate-900/50 text-white text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500 transition-colors"
                      >
                        <option value="">Sélectionner un compte...</option>
                        {comptes.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.numero_compte} - {c.intitule}
                          </option>
                        ))}
                    </select>
                 </div>
                 
                 <div className="flex gap-2 self-end sm:self-center">
                    <Button
                        variant="outline"
                        size="sm"
                        icon={Download}
                        onClick={handleExportExcel}
                        disabled={!compteSelectionne || mouvements.length === 0}
                        className="bg-slate-900/50 border-slate-700 hover:bg-slate-800"
                    >
                        <span className="hidden sm:inline">Excel</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        icon={Printer}
                        onClick={handleExportPDF}
                        disabled={!compteSelectionne || mouvements.length === 0}
                        className="bg-slate-900/50 border-slate-700 hover:bg-slate-800"
                    >
                        <span className="hidden sm:inline">PDF</span>
                    </Button>
                 </div>
            </div>

            {/* Bottom Row: Dates */}
            <div className="flex gap-3 pt-2 border-t border-slate-700/50">
                 <div className="flex-1">
                   <label className="text-[10px] uppercase text-slate-500 font-bold mb-1.5">Début</label>
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
          {/* Stats Carousel - Mobile Optimized */}
          {/* Stats Carousel - Mobile Optimized */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
             <StatCard 
               title="Total Débits" 
               value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 }).format(totalDebit)}
               icon={ArrowDownRight} 
               color="warning" 
               subtitle="Cumul débit"
               className="bg-slate-800/50 border-slate-700/50"
             />
             <StatCard 
               title="Total Crédits" 
               value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 }).format(totalCredit)}
               icon={ArrowUpRight} 
               color="success" 
               subtitle="Cumul crédit"
               className="bg-slate-800/50 border-slate-700/50"
             />
             <StatCard 
               title="Solde Final" 
               value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 }).format(soldeFinal)}
               icon={DollarSign} 
               color={soldeFinal >= 0 ? 'success' : 'primary'} 
               subtitle={compteInfo?.intitule}
               className="bg-slate-800/50 border-slate-700/50 shadow-lg shadow-blue-500/5"
             />
          </div>

          <div className="bg-slate-900/50 rounded-xl overflow-hidden">
              <ResponsiveTable
                data={mouvements}
                columns={columns}
                loading={loading}
                emptyMessage="Aucun mouvement sur cette période."
                mobileBreakpoint="md"
              />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
           <div className="bg-slate-800 p-4 rounded-full mb-4">
             <BookOpen className="w-8 h-8 text-blue-400" />
           </div>
           <p className="text-sm font-medium text-white">Sélectionnez un compte</p>
           <p className="text-xs text-slate-400 max-w-[200px] mt-1">Choisissez un compte ci-dessus pour afficher le grand livre.</p>
        </div>
      )}
    </div>
  );
}
