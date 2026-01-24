import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button, Card } from '../../ui';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { computeSessionStatus, getSessionStatusLabel } from '../../../lib/format';
import { SessionCaisse, CaisseTransaction } from '../../../types/finance';
import { ReportsToolbar, CashJournal, DailySummary, DiscrepancyReport, type ReportType } from './etats';

export default function CaisseEtats({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<SessionCaisse[]>([]);
  const [transactions, setTransactions] = useState<CaisseTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateDebut, setDateDebut] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [dateFin, setDateFin] = useState(new Date().toISOString().slice(0, 10));
  const [typeRapport, setTypeRapport] = useState<ReportType>('journal');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Charger les sessions
  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/sessions-caisse?dateDebut=${dateDebut}&dateFin=${dateFin}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Erreur lors du chargement');
      const data = await res.json();
      setSessions(data || []);
    } catch (error) {
      console.error('Erreur chargement sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [dateDebut, dateFin]);

  // Charger les transactions pour toutes les sessions
  const loadTransactions = useCallback(async () => {
    if (sessions.length === 0) {
      setTransactions([]);
      return;
    }

    try {
      // Charger les opérations pour chaque session
      const allTransactions: CaisseTransaction[] = [];

      for (const session of sessions) {
        const res = await fetch(`/api/operations-caisse?sessionId=${session.id}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const ops = await res.json();
          allTransactions.push(...ops);
        }
      }

      setTransactions(allTransactions);
    } catch (error) {
      console.error('Erreur chargement transactions:', error);
    }
  }, [sessions]);

  useEffect(() => {
    setCurrentPage(1);
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (sessions.length > 0) {
      loadTransactions();
    }
  }, [sessions, loadTransactions]);

  useEffect(() => {
    const handleRealTimeUpdate = () => {
      loadSessions();
    };

    window.addEventListener('caisse-update', handleRealTimeUpdate);
    return () => window.removeEventListener('caisse-update', handleRealTimeUpdate);
  }, [loadSessions]);

  // Helpers
  const resolveSessionStatus = (session: SessionCaisse) =>
    session.computedStatus || computeSessionStatus(session);
  const resolveOpenedAt = (session: SessionCaisse) => session.openedAt || session.opened_at || '';

  // Export PDF
  const exporterPDF = () => {
    try {
      const doc = new jsPDF();

      // Header
      doc.setFontSize(22);
      doc.setTextColor(41, 128, 185);
      doc.text('COFINCO', 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text('Système de Gestion Financière', 14, 25);

      doc.setFontSize(16);
      doc.setTextColor(0);
      doc.text('États Financiers - Rapport de Caisse', 14, 40);

      doc.setFontSize(10);
      doc.text(
        `Période: ${new Date(dateDebut).toLocaleDateString('fr-FR')} au ${new Date(dateFin).toLocaleDateString('fr-FR')}`,
        14,
        48
      );
      doc.text(`Généré le: ${new Date().toLocaleString('fr-FR')}`, 14, 53);

      // Data Table
      const tableColumn = ['Date', 'Solde Initial', 'Entrées', 'Sorties', 'Théorique', 'Réel', 'Écart', 'Statut'];
      const tableRows = sessions.map((session) => {
        const diff = Number(session.solde_theorique) - Number(session.solde_initial);
        const entrees = diff > 0 ? diff : 0;
        const sorties = diff < 0 ? Math.abs(diff) : 0;

        return [
          new Date(resolveOpenedAt(session)).toLocaleDateString('fr-FR'),
          Number(session.solde_initial).toLocaleString('fr-FR'),
          entrees > 0 ? `+${entrees.toLocaleString('fr-FR')}` : '-',
          sorties > 0 ? `-${sorties.toLocaleString('fr-FR')}` : '-',
          Number(session.solde_theorique).toLocaleString('fr-FR'),
          session.solde_reel ? Number(session.solde_reel).toLocaleString('fr-FR') : '-',
          Number(session.ecart || 0).toLocaleString('fr-FR'),
          getSessionStatusLabel(resolveSessionStatus(session) as any),
        ];
      });

      // Totals
      const totalMouvements = sessions.reduce(
        (acc, s) => {
          const diff = Number(s.solde_theorique) - Number(s.solde_initial);
          if (diff > 0) acc.entrees += diff;
          else acc.sorties += Math.abs(diff);
          return acc;
        },
        { entrees: 0, sorties: 0 }
      );

      const totalsRow = [
        'TOTAUX',
        sessions.reduce((sum, s) => sum + Number(s.solde_initial), 0).toLocaleString('fr-FR'),
        `+${totalMouvements.entrees.toLocaleString('fr-FR')}`,
        `-${totalMouvements.sorties.toLocaleString('fr-FR')}`,
        sessions.reduce((sum, s) => sum + Number(s.solde_theorique), 0).toLocaleString('fr-FR'),
        sessions.reduce((sum, s) => sum + Number(s.solde_reel || 0), 0).toLocaleString('fr-FR'),
        sessions.reduce((sum, s) => sum + Number(s.ecart || 0), 0).toLocaleString('fr-FR'),
        '',
      ];

      tableRows.push(totalsRow);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 60,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { halign: 'center' },
          1: { halign: 'right' },
          2: { halign: 'right', textColor: [39, 174, 96] },
          3: { halign: 'right', textColor: [192, 57, 43] },
          4: { halign: 'right' },
          5: { halign: 'right', fontStyle: 'bold' },
          6: { halign: 'right' },
          7: { halign: 'center' },
        },
        didParseCell: (data: any) => {
          if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
          }
        },
      });

      doc.save(`etats_financiers_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Erreur export PDF:', error);
      alert("Une erreur est survenue lors de l'export PDF.");
    }
  };

  // Export Excel
  const exporterExcel = () => {
    try {
      const data = sessions.map((session) => {
        const diff = Number(session.solde_theorique) - Number(session.solde_initial);
        const entrees = diff > 0 ? diff : 0;
        const sorties = diff < 0 ? Math.abs(diff) : 0;

        return {
          Date: new Date(resolveOpenedAt(session)).toLocaleDateString('fr-FR'),
          'Solde Initial': Number(session.solde_initial),
          Entrées: entrees,
          Sorties: sorties,
          'Solde Théorique': Number(session.solde_theorique),
          'Solde Réel': session.solde_reel ? Number(session.solde_reel) : 0,
          Écart: Number(session.ecart || 0),
          Statut: getSessionStatusLabel(resolveSessionStatus(session) as any),
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'États Financiers');

      // Auto-width columns
      const wscols = Object.keys(data[0] || {}).map((key) => ({ wch: Math.max(key.length + 5, 15) }));
      worksheet['!cols'] = wscols;

      XLSX.writeFile(workbook, `etats_financiers_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      console.error('Erreur export Excel:', error);
      alert("Une erreur est survenue lors de l'export Excel.");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500 font-sans selection:bg-cyan-500/30">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="rounded-full w-10 h-10 p-0 flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">États Financiers</h2>
            <p className="text-xs text-slate-400 font-medium whitespace-nowrap">Rapports & Analyses</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <ReportsToolbar
        dateDebut={dateDebut}
        dateFin={dateFin}
        typeRapport={typeRapport}
        onDateDebutChange={setDateDebut}
        onDateFinChange={setDateFin}
        onTypeRapportChange={setTypeRapport}
        onExportPDF={exporterPDF}
        onExportExcel={exporterExcel}
        loading={loading}
      />

      {/* Content based on report type */}
      {typeRapport === 'journal' && (
        <CashJournal
          sessions={sessions}
          transactions={transactions}
          loading={loading}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      )}

      {typeRapport === 'synthese' && (
        <DailySummary sessions={sessions} transactions={transactions} loading={loading} />
      )}

      {typeRapport === 'ecarts' && (
        <DiscrepancyReport
          sessions={sessions}
          loading={loading}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      )}

      {/* Empty state */}
      {!loading && sessions.length === 0 && (
        <Card className="bg-slate-900/80 border-slate-800 py-16 text-center">
          <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText size={32} className="text-slate-600" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Aucune donnée disponible</h3>
          <p className="text-slate-500 text-sm">Sélectionnez une période différente pour voir les états.</p>
        </Card>
      )}
    </div>
  );
}
