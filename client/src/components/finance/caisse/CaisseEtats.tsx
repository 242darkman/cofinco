import React, { useState, useEffect, useCallback } from 'react';
import { FileText } from 'lucide-react';
import { Card } from '../../ui';
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
  const itemsPerPage = 8;

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
    } catch {
      // Session loading failure handled by empty state
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
    } catch {
      // Transaction loading failure handled by empty state
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
    } catch {
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
    } catch {
      alert("Une erreur est survenue lors de l'export Excel.");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden font-sans selection:bg-accent-secondary/30">
      {/* Toolbar */}
      <div className="shrink-0 pb-2">
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
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {typeRapport === 'journal' ? (
            <CashJournal
              sessions={sessions}
              transactions={transactions}
              loading={loading}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
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
            </div>
          )}

          {/* Empty state */}
          {!loading && sessions.length === 0 && (
            <div className="flex items-center justify-center py-16">
                <Card className="bg-surface-base/80 border-edge py-16 text-center max-w-md w-full">
                <div className="w-16 h-16 bg-surface/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText size={32} className="text-content-muted" />
                </div>
                <h3 className="text-lg font-semibold text-content-primary mb-1">Aucune donnée disponible</h3>
                <p className="text-content-muted text-sm">Sélectionnez une période différente pour voir les états.</p>
                </Card>
            </div>
          )}
      </div>
    </div>
  );
}
