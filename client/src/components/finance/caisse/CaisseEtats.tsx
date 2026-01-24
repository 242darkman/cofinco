import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button, Card } from '../../ui';
import { computeSessionStatus, getSessionStatusLabel } from '../../../lib/format';
import { SessionCaisse, CaisseTransaction } from '../../../types/finance';
import { ReportsToolbar, CashJournal, DailySummary, DiscrepancyReport, type ReportType } from './etats';
import {
  exportJournalPDF,
  exportJournalExcel,
  exportSynthesePDF,
  exportSyntheseExcel,
  exportEcartsPDF,
  exportEcartsExcel,
} from './etats/exports';

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

  // Configuration export commune
  const exportConfig = {
    dateDebut,
    dateFin,
  };

  // Export PDF - adapté au type de rapport actif
  const exporterPDF = () => {
    try {
      switch (typeRapport) {
        case 'journal':
          exportJournalPDF(sessions, transactions, exportConfig);
          break;
        case 'synthese':
          exportSynthesePDF(sessions, transactions, exportConfig);
          break;
        case 'ecarts':
          exportEcartsPDF(sessions, exportConfig);
          break;
        default:
          exportJournalPDF(sessions, transactions, exportConfig);
      }
    } catch (error) {
      console.error('Erreur export PDF:', error);
      alert("Une erreur est survenue lors de l'export PDF.");
    }
  };

  // Export Excel - adapté au type de rapport actif
  const exporterExcel = () => {
    try {
      switch (typeRapport) {
        case 'journal':
          exportJournalExcel(sessions, transactions, exportConfig);
          break;
        case 'synthese':
          exportSyntheseExcel(sessions, transactions, exportConfig);
          break;
        case 'ecarts':
          exportEcartsExcel(sessions, exportConfig);
          break;
        default:
          exportJournalExcel(sessions, transactions, exportConfig);
      }
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
