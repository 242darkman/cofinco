import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Users, Receipt, AlertTriangle, CheckCircle,
  ArrowRight, Loader2, Shield, Calendar, Play, X, AlertCircle,
  FileText, Clock, Ban, RefreshCw, Download, Eye, RotateCcw
} from 'lucide-react';
import { Modal, Button, SearchableSelect, ProgressBar, Badge } from '../ui';
import { api } from '../../lib/api-client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { addPdfLogoHeader, addPdfLogoFooter } from '@/lib/pdf-logo';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries } from '@/lib/lazy-export';

// ============================================
// TYPES
// ============================================

interface Agency {
  id: string;
  nom: string;
  ville?: string;
  codeAgence: string;
}

interface PreFlightCheck {
  type: string;
  passed: boolean;
  blocking: boolean;
  message: string;
  details?: any;
  resolution?: string;
}

interface DryRunResult {
  volumetry: {
    clients: number;
    comptes: number;
    credits: number;
    demandesCredit: number;
    tontines: number;
    employes: number;
    sessionsCaisse: number;
  };
  preFlightChecks: PreFlightCheck[];
  conflicts: Array<{
    type: string;
    entityId: string;
    description: string;
    resolution: string;
  }>;
  financials: {
    soldesCoffresTransferes: number;
    totalSoldesComptes: number;
    totalCreditsEnCours: number;
    totalDemandesEnAttente: number;
  };
  warnings: string[];
  canProceed: boolean;
  blockingReasons: string[];
}

interface MigrationStatus {
  id: string;
  reference: string;
  status: string;
  progress: number;
  currentStep?: string;
  error?: string;
  logs?: Array<{ step: string; timestamp: string; success: boolean; count?: number }>;
  report?: any;
  scheduledAt?: string;
  completedAt?: string;
}

interface MigrationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  sourceAgence: Agency;
  onSuccess: () => void;
}

// ============================================
// CONSTANTS
// ============================================

const STEPS = [
  { id: 'clients', title: 'Clients', icon: Users },
  { id: 'employees', title: 'Personnel', icon: Building2 },
  { id: 'treasury', title: 'Trésorerie', icon: Receipt },
  { id: 'schedule', title: 'Planification', icon: Calendar },
  { id: 'analysis', title: 'Analyse', icon: Eye },
  { id: 'confirm', title: 'Confirmation', icon: Shield }
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Brouillon', color: 'bg-slate-500' },
  PENDING: { label: 'En attente', color: 'bg-yellow-500' },
  SCHEDULED: { label: 'Planifié', color: 'bg-blue-500' },
  PRE_FLIGHT_CHECK: { label: 'Vérifications', color: 'bg-purple-500' },
  PROCESSING: { label: 'En cours', color: 'bg-orange-500' },
  COMPLETED: { label: 'Terminé', color: 'bg-green-500' },
  FAILED: { label: 'Échoué', color: 'bg-red-500' },
  CANCELLED: { label: 'Annulé', color: 'bg-gray-500' },
};

// ============================================
// COMPONENT
// ============================================

export function AgencyMigrationWizard({ isOpen, onClose, sourceAgence, onSuccess }: MigrationWizardProps) {
  const queryClient = useQueryClient();

  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [targetClients, setTargetClients] = useState<string | number>('');
  const [targetEmployees, setTargetEmployees] = useState<string | number>('');
  const [targetTreasury, setTargetTreasury] = useState<string | number>('');
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [executeNow, setExecuteNow] = useState(true);
  const [migrationId, setMigrationId] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dryRunFailed, setDryRunFailed] = useState(false);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [pollCount, setPollCount] = useState(0);

  // Fetch available agencies (excluding source)
  const { data: agences } = useQuery({
    queryKey: ['agences', 'migration', sourceAgence.id],
    queryFn: async () => {
      const res = await api.get<Agency[]>('/agences?statut=Actif');
      return res.filter((a: Agency) => a.id !== sourceAgence.id);
    },
    enabled: isOpen
  });

  // Exponential backoff: 2s, 4s, 8s, 16s, capped at 30s
  const getPollingInterval = useCallback(() => {
    if (!migrationId) return false;
    const interval = Math.min(2000 * Math.pow(2, pollCount), 30000);
    return interval;
  }, [migrationId, pollCount]);

  // Poll migration status with exponential backoff
  const { data: migrationStatus } = useQuery({
    queryKey: ['migration-status', migrationId],
    queryFn: async () => {
      if (!migrationId) return null;
      setPollCount(prev => prev + 1);
      return api.get<MigrationStatus>(`/agences/migrations/${migrationId}/status`);
    },
    enabled: !!migrationId,
    refetchInterval: getPollingInterval(),
  });

  // Reset poll count on status change (back to fast polling on transitions)
  useEffect(() => {
    if (migrationStatus?.status === 'PROCESSING' || migrationStatus?.status === 'PRE_FLIGHT_CHECK') {
      setPollCount(0);
    }
  }, [migrationStatus?.status]);

  // Handle migration completion
  useEffect(() => {
    if (migrationStatus?.status === 'COMPLETED') {
      toast.success('Migration terminée avec succès !');
      onSuccess();
    } else if (migrationStatus?.status === 'FAILED') {
      toast.error(`Erreur: ${migrationStatus.error}`);
    }
  }, [migrationStatus?.status, onSuccess]);

  // Mutations
  const createMigrationMutation = useMutation({
    mutationFn: async (data: {
      targetAgenceClients?: string;
      targetAgenceEmployes?: string;
      targetAgenceCoffre?: string;
      scheduledAt?: string;
    }) => {
      return api.post<MigrationStatus>(`/agences/${sourceAgence.id}/migrations`, data);
    },
    onSuccess: (data) => {
      setMigrationId(data.id);
      toast.success(`Migration créée (Réf: ${data.reference})`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la création de la migration');
    }
  });

  const dryRunMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post<DryRunResult>(`/agences/migrations/${id}/dry-run`);
    },
    onSuccess: (data) => {
      setDryRunResult(data);
      setDryRunFailed(false);
      setIsAnalyzing(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'analyse');
      setDryRunFailed(true);
      setIsAnalyzing(false);
    }
  });

  const submitMigrationMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/agences/migrations/${id}/submit`);
    },
    onSuccess: () => {
      toast.success('Migration soumise');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la soumission');
    }
  });

  const executeMigrationMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/agences/migrations/${id}/execute`);
    },
    onSuccess: () => {
      toast.success('Migration démarrée');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors du lancement');
    }
  });

  const cancelMigrationMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return api.post(`/agences/migrations/${id}/cancel`, { reason });
    },
    onSuccess: () => {
      toast.info('Migration annulée');
      setMigrationId(null);
      setDryRunResult(null);
      setCurrentStep(0);
      setShowCancelPrompt(false);
      setCancelReason('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'annulation');
    }
  });

  const rollbackMigrationMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post<{ success: boolean; report: any }>(`/agences/migrations/${id}/rollback`);
    },
    onSuccess: () => {
      toast.success('Rollback effectué avec succès');
      queryClient.invalidateQueries({ queryKey: ['migration-status', migrationId] });
      onSuccess();
    },
    onError: (error: any) => {
      const msg = error.message || 'Erreur lors du rollback';
      toast.error(msg);
    }
  });

  // Helpers
  const agencyOptions = agences?.map((a: Agency) => ({
    value: a.id,
    label: a.nom,
    subLabel: a.ville || a.codeAgence
  })) || [];

  const canProceed = () => {
    switch (currentStep) {
      case 0: return !!targetClients;
      case 1: return !!targetEmployees;
      case 2: return !!targetTreasury;
      case 3: return executeNow || !!scheduledAt;
      case 4: return dryRunResult?.canProceed ?? false;
      default: return true;
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(amount);
  };

  // Navigation
  const handleNext = async () => {
    if (currentStep === 3) {
      // Créer la migration et lancer le dry run
      setIsAnalyzing(true);
      setDryRunFailed(false);
      try {
        const migration = await createMigrationMutation.mutateAsync({
          targetAgenceClients: targetClients as string,
          targetAgenceEmployes: targetEmployees as string,
          targetAgenceCoffre: targetTreasury as string,
          scheduledAt: !executeNow && scheduledAt ? new Date(scheduledAt).toISOString() : undefined
        });
        await dryRunMutation.mutateAsync(migration.id);
        setCurrentStep(4);
      } catch (error) {
        setIsAnalyzing(false);
      }
    } else if (currentStep === 5) {
      // Confirmer et lancer
      if (migrationId) {
        await submitMigrationMutation.mutateAsync(migrationId);
        if (executeNow) {
          await executeMigrationMutation.mutateAsync(migrationId);
        }
      }
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleRetryDryRun = async () => {
    if (!migrationId) return;
    setIsAnalyzing(true);
    setDryRunFailed(false);
    try {
      await dryRunMutation.mutateAsync(migrationId);
    } catch {
      // Error already handled in mutation onError
    }
  };

  const handleBack = () => {
    if (currentStep === 4 && migrationId) {
      setShowCancelPrompt(true);
    } else if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleCancelConfirm = () => {
    if (!migrationId || !cancelReason.trim()) return;
    cancelMigrationMutation.mutate({ id: migrationId, reason: cancelReason.trim() });
  };

  // Derived state (must be before keyboard effect)
  const isProcessing = migrationStatus?.status === 'PROCESSING' ||
    migrationStatus?.status === 'PRE_FLIGHT_CHECK';
  const isCompleted = migrationStatus?.status === 'COMPLETED';
  const isFailed = migrationStatus?.status === 'FAILED';
  const isScheduled = migrationStatus?.status === 'SCHEDULED';

  // Rollback eligibility: within 24h of completion
  const canRollback = isCompleted && migrationStatus?.completedAt &&
    (Date.now() - new Date(migrationStatus.completedAt).getTime()) < 24 * 60 * 60 * 1000;
  const rollbackHoursLeft = migrationStatus?.completedAt
    ? Math.max(0, 24 - (Date.now() - new Date(migrationStatus.completedAt).getTime()) / (1000 * 60 * 60))
    : 0;

  // PDF report generation
  const handleDownloadReport = useCallback(async () => {
    if (!migrationStatus?.report) {
      toast.error('Aucun rapport disponible');
      return;
    }

    try {
      // P4.1: Lazy-load PDF library
      const { jsPDF, autoTable } = await loadPDFLibraries();
      const report = migrationStatus.report;
      const doc = new jsPDF();
      const H = doc.internal.pageSize.getHeight();

      // Header with logo
      const completedDate = migrationStatus.completedAt
        ? format(new Date(migrationStatus.completedAt), "d MMM yyyy 'à' HH:mm", { locale: fr })
        : undefined;
      let y = addPdfLogoHeader(doc, {
        title: "Rapport de Migration d'Agence",
        subtitle: `Réf: ${migrationStatus.reference} — Statut: ${migrationStatus.status}`,
        dateRight: completedDate ? `Terminée le: ${completedDate}` : undefined,
      });

      // Source agency info
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text('Agence source', 14, y);
      y += 7;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(`${sourceAgence.nom} (${sourceAgence.codeAgence})`, 14, y);
      y += 12;

      // Volumetry table
      if (report.volumetry) {
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text('Données Migrées', 14, y);
        y += 4;

        const volData = Object.entries(report.volumetry as Record<string, number>)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => {
            const labels: Record<string, string> = {
              clients: 'Clients', comptes: 'Comptes', credits: 'Crédits',
              demandesCredit: 'Demandes de crédit', tontines: 'Tontines',
              employes: 'Employés', sessionsCaisse: 'Sessions caisse',
              mouvementsFinanciers: 'Mouvements financiers',
              operationsCaisse: 'Opérations caisse',
              virementsProgrammes: 'Virements programmés',
            };
            return [labels[k] || k, String(v)];
          });

        autoTable(doc, {
          head: [['Type d\'entité', 'Nombre']],
          body: volData,
          startY: y,
          theme: 'striped',
          headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 4 },
          bodyStyles: { fontSize: 8, textColor: [30, 41, 59], cellPadding: 3 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });

        y = (doc as any).lastAutoTable?.finalY + 12 || y + 40;
      }

      // Financials table
      if (report.financials) {
        const fmtMoney = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(v);

        if (y + 60 > H) { doc.addPage(); y = 20; }

        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text('Impact Financier', 14, y);
        y += 4;

        const finData = [
          ['Soldes coffres transférés', fmtMoney(report.financials.soldesCoffresTransferes || 0)],
          ['Total soldes comptes', fmtMoney(report.financials.totalSoldesComptes || 0)],
          ['Crédits en cours', fmtMoney(report.financials.totalCreditsEnCours || 0)],
          ['Demandes en attente', fmtMoney(report.financials.totalDemandesEnAttente || 0)],
        ];

        autoTable(doc, {
          head: [['Indicateur', 'Montant']],
          body: finData,
          startY: y,
          theme: 'striped',
          headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 4 },
          bodyStyles: { fontSize: 8, textColor: [30, 41, 59], cellPadding: 3 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });

        y = (doc as any).lastAutoTable?.finalY + 12 || y + 40;
      }

      // Migration logs
      if (migrationStatus.logs && migrationStatus.logs.length > 0) {
        if (y + 40 > H) { doc.addPage(); y = 20; }

        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text('Journal d\'Exécution', 14, y);
        y += 4;

        const logData = migrationStatus.logs.map(log => [
          log.step,
          log.success ? 'Succès' : 'Échec',
          log.count !== undefined ? String(log.count) : '-',
          format(new Date(log.timestamp), 'HH:mm:ss', { locale: fr }),
        ]);

        autoTable(doc, {
          head: [['Étape', 'Résultat', 'Éléments', 'Heure']],
          body: logData,
          startY: y,
          theme: 'striped',
          headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 4 },
          bodyStyles: { fontSize: 8, textColor: [30, 41, 59], cellPadding: 3 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
        });
      }

      // Footer with logo
      addPdfLogoFooter(doc, 'Rapport de Migration');

      doc.save(`rapport-migration-${migrationStatus.reference}-${Date.now()}.pdf`);
      toast.success('Rapport PDF téléchargé');
    } catch (error) {
      console.error('Error generating migration PDF:', error);
      toast.error('Erreur lors de la génération du rapport PDF');
    }
  }, [migrationStatus, sourceAgence]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Don't intercept during async states
      if (isProcessing || isCompleted || isFailed || isScheduled) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'Enter':
          if (canProceed()) {
            e.preventDefault();
            handleNext();
          }
          break;
        case 'ArrowLeft':
          if (currentStep > 0) {
            e.preventDefault();
            handleBack();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep, isProcessing, isCompleted, isFailed, isScheduled]);

  // Reset on close
  const handleClose = () => {
    if (!isProcessing) {
      setCurrentStep(0);
      setTargetClients('');
      setTargetEmployees('');
      setTargetTreasury('');
      setScheduledAt('');
      setExecuteNow(true);
      setMigrationId(null);
      setDryRunResult(null);
      setDryRunFailed(false);
      setShowCancelPrompt(false);
      setCancelReason('');
      setPollCount(0);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Fermeture et Migration : ${sourceAgence.nom}`}
      size="xl"
    >
      <div className="space-y-6">
        {/* Stepper Header */}
        <div className="flex justify-between relative overflow-x-auto pb-2">
          <div className="absolute top-5 left-0 w-full h-0.5 bg-slate-700 -z-10" />
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === currentStep;
            const isCompleted = idx < currentStep;

            return (
              <div key={step.id} className="flex flex-col items-center bg-slate-800 px-2 min-w-[70px]">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors
                  ${isActive ? 'border-blue-500 bg-blue-500/20 text-blue-400' :
                    isCompleted ? 'border-green-500 bg-green-500/20 text-green-400' :
                      'border-slate-600 bg-slate-800 text-slate-500'}
                `}>
                  <Icon size={18} />
                </div>
                <span className={`text-xs mt-2 font-medium text-center ${isActive ? 'text-white' : 'text-slate-500'}`}>
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="min-h-[350px] py-4">
          {/* Processing State */}
          {isProcessing && (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
              <Loader2 className="animate-spin text-blue-500" size={48} />
              <h3 className="text-xl font-bold text-white">Migration en cours...</h3>
              <p className="text-slate-400 text-sm">{migrationStatus?.currentStep || 'Initialisation'}</p>
              <div className="w-full max-w-md">
                <ProgressBar value={migrationStatus?.progress || 0} max={100} color="primary" size="md" />
              </div>
              <p className="text-slate-400 text-center">
                Ne fermez pas cette fenêtre. Progression: {migrationStatus?.progress || 0}%
              </p>

              {/* Steps Log */}
              {migrationStatus?.logs && migrationStatus.logs.length > 0 && (
                <div className="w-full max-w-md mt-4 bg-slate-900 rounded-lg p-4 max-h-40 overflow-y-auto">
                  {migrationStatus.logs.map((log, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm py-1">
                      {log.success ? (
                        <CheckCircle className="text-green-500 shrink-0" size={14} />
                      ) : (
                        <X className="text-red-500 shrink-0" size={14} />
                      )}
                      <span className="text-slate-300">{log.step}</span>
                      {log.count !== undefined && (
                        <span className="text-slate-500">({log.count})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Completed State */}
          {isCompleted && (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="text-green-500" size={48} />
              </div>
              <h3 className="text-xl font-bold text-white">Migration Terminée !</h3>
              <p className="text-slate-400 text-center">
                L'agence {sourceAgence.nom} a été fermée avec succès.<br />
                Toutes les données ont été transférées.
              </p>

              {migrationStatus?.report && (
                <div className="w-full max-w-md bg-slate-900 rounded-lg p-4 mt-4">
                  <h4 className="font-medium text-white mb-3">Résumé de la Migration</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-400">Clients migrés:</span>
                    <span className="text-white">{migrationStatus.report.volumetry?.clients || 0}</span>
                    <span className="text-slate-400">Comptes migrés:</span>
                    <span className="text-white">{migrationStatus.report.volumetry?.comptes || 0}</span>
                    <span className="text-slate-400">Crédits migrés:</span>
                    <span className="text-white">{migrationStatus.report.volumetry?.credits || 0}</span>
                    <span className="text-slate-400">Fonds transférés:</span>
                    <span className="text-white">{formatMoney(migrationStatus.report.financials?.soldesCoffresTransferes || 0)}</span>
                  </div>
                </div>
              )}

              {canRollback && (
                <div className="w-full max-w-md bg-amber-500/10 rounded-lg p-4 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={18} />
                    <div className="flex-1">
                      <h4 className="font-medium text-amber-400 text-sm">Rollback disponible</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Vous pouvez annuler cette migration dans les {Math.floor(rollbackHoursLeft)}h{Math.round((rollbackHoursLeft % 1) * 60).toString().padStart(2, '0')} restantes.
                        Cette action restaurera toutes les données à leur état d'origine.
                      </p>
                      <Button
                        variant="danger"
                        size="sm"
                        className="mt-3"
                        onClick={() => migrationId && rollbackMigrationMutation.mutate(migrationId)}
                        disabled={rollbackMigrationMutation.isPending}
                        icon={RotateCcw}
                      >
                        {rollbackMigrationMutation.isPending ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          'Annuler la Migration (Rollback)'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={handleClose} icon={X}>
                  Fermer
                </Button>
                <Button
                  variant="primary"
                  onClick={handleDownloadReport}
                  icon={Download}
                >
                  Télécharger le Rapport
                </Button>
              </div>
            </div>
          )}

          {/* Failed State */}
          {isFailed && (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
              <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                <X className="text-red-500" size={48} />
              </div>
              <h3 className="text-xl font-bold text-white">Migration Échouée</h3>
              <p className="text-red-400 text-center">{migrationStatus?.error}</p>
              <p className="text-slate-400 text-sm text-center">
                La migration a été annulée. Aucune donnée n'a été modifiée.
              </p>
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={handleClose} icon={X}>
                  Fermer
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (migrationId) {
                      executeMigrationMutation.mutate(migrationId);
                    }
                  }}
                  icon={RefreshCw}
                >
                  Réessayer
                </Button>
              </div>
            </div>
          )}

          {/* Scheduled State */}
          {isScheduled && (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
              <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Calendar className="text-blue-500" size={48} />
              </div>
              <h3 className="text-xl font-bold text-white">Migration Planifiée</h3>
              <p className="text-slate-400 text-center">
                La migration sera exécutée automatiquement le:<br />
                <span className="text-white font-medium">
                  {migrationStatus?.scheduledAt &&
                    format(new Date(migrationStatus.scheduledAt), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}
                </span>
              </p>
              <p className="text-amber-400 text-sm text-center flex items-center gap-2">
                <AlertCircle size={16} />
                L'agence est maintenant en mode "Lecture seule"
              </p>
              <div className="flex gap-3 mt-4">
                <Button
                  variant="danger"
                  onClick={() => setShowCancelPrompt(true)}
                  icon={Ban}
                >
                  Annuler la Planification
                </Button>
                <Button variant="outline" onClick={handleClose} icon={X}>
                  Fermer
                </Button>
              </div>
            </div>
          )}

          {/* Wizard Steps */}
          {!isProcessing && !isCompleted && !isFailed && !isScheduled && (
            <>
              {/* Step 0: Clients */}
              {currentStep === 0 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                  <div className="bg-blue-500/10 p-4 rounded-lg flex gap-3 border border-blue-500/20 font-sans">
                    <Users className="text-blue-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-blue-400">Transfert de la Clientèle</h4>
                      <p className="text-sm text-slate-300">
                        Sélectionnez l'agence qui reprendra la gestion des clients, comptes, crédits et tontines de {sourceAgence.nom}.
                      </p>
                    </div>
                  </div>
                  <SearchableSelect
                    label="Agence de destination (Clients)"
                    name="targetClients"
                    value={targetClients}
                    onChange={(val) => setTargetClients(val)}
                    options={agencyOptions}
                    placeholder="Rechercher une agence..."
                  />
                </div>
              )}

              {/* Step 1: Employees */}
              {currentStep === 1 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                  <div className="bg-purple-500/10 p-4 rounded-lg flex gap-3 border border-purple-500/20 font-sans">
                    <Building2 className="text-purple-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-purple-400">Réaffectation du Personnel</h4>
                      <p className="text-sm text-slate-300">
                        Les employés seront rattachés administrativement à la nouvelle agence.
                      </p>
                    </div>
                  </div>
                  <SearchableSelect
                    label="Agence d'affectation (Employés)"
                    name="targetEmployees"
                    value={targetEmployees}
                    onChange={(val) => setTargetEmployees(val)}
                    options={agencyOptions}
                    placeholder="Rechercher une agence..."
                  />
                </div>
              )}

              {/* Step 2: Treasury */}
              {currentStep === 2 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                  <div className="bg-amber-500/10 p-4 rounded-lg flex gap-3 border border-amber-500/20 font-sans">
                    <Receipt className="text-amber-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-amber-400">Transfert de Fonds (Trésorerie)</h4>
                      <p className="text-sm text-slate-300">
                        Le solde du coffre-fort sera transféré comptablement vers le coffre de l'agence cible.
                      </p>
                    </div>
                  </div>
                  <SearchableSelect
                    label="Agence de destination (Fonds)"
                    name="targetTreasury"
                    value={targetTreasury}
                    onChange={(val) => setTargetTreasury(val)}
                    options={agencyOptions}
                    placeholder="Rechercher une agence (ex: Siège)..."
                  />
                </div>
              )}

              {/* Step 3: Schedule */}
              {currentStep === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="bg-indigo-500/10 p-4 rounded-lg flex gap-3 border border-indigo-500/20 font-sans">
                    <Calendar className="text-indigo-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-indigo-400">Planification de l'Exécution</h4>
                      <p className="text-sm text-slate-300">
                        Choisissez quand effectuer la migration. Une planification différée permet de préparer l'équipe.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="flex items-center gap-3 p-4 bg-slate-900 rounded-lg cursor-pointer border border-slate-700 hover:border-blue-500 transition-colors">
                      <input
                        type="radio"
                        name="schedule"
                        checked={executeNow}
                        onChange={() => setExecuteNow(true)}
                        className="w-5 h-5 text-blue-500"
                      />
                      <div>
                        <span className="font-medium text-white">Exécuter maintenant</span>
                        <p className="text-sm text-slate-400">La migration démarrera immédiatement après confirmation</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 bg-slate-900 rounded-lg cursor-pointer border border-slate-700 hover:border-blue-500 transition-colors">
                      <input
                        type="radio"
                        name="schedule"
                        checked={!executeNow}
                        onChange={() => setExecuteNow(false)}
                        className="w-5 h-5 text-blue-500"
                      />
                      <div className="flex-1">
                        <span className="font-medium text-white">Planifier pour plus tard</span>
                        <p className="text-sm text-slate-400">L'agence passera en mode "lecture seule" jusqu'à la migration</p>
                      </div>
                    </label>

                    {!executeNow && (
                      <div className="ml-8 mt-2">
                        <label className="block text-sm text-slate-400 mb-2">Date et heure d'exécution</label>
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          min={new Date().toISOString().slice(0, 16)}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Analysis (Dry Run) */}
              {currentStep === 4 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                  {isAnalyzing ? (
                    <div className="flex flex-col items-center justify-center p-8">
                      <Loader2 className="animate-spin text-blue-500 mb-4" size={40} />
                      <p className="text-slate-300">Analyse en cours...</p>
                    </div>
                  ) : dryRunFailed ? (
                    <div className="flex flex-col items-center justify-center p-8 space-y-4">
                      <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                        <X className="text-red-500" size={32} />
                      </div>
                      <h4 className="text-lg font-bold text-white">Échec de l'analyse</h4>
                      <p className="text-slate-400 text-sm text-center">
                        L'analyse préalable a échoué. Vous pouvez réessayer sans avoir à recréer la migration.
                      </p>
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={handleBack} icon={X}>
                          Annuler
                        </Button>
                        <Button
                          variant="primary"
                          onClick={handleRetryDryRun}
                          disabled={dryRunMutation.isPending}
                          icon={RefreshCw}
                        >
                          Réessayer l'analyse
                        </Button>
                      </div>
                    </div>
                  ) : dryRunResult ? (
                    <>
                      {/* Pre-flight checks */}
                      <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                        <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                          <Shield size={18} />
                          Vérifications Préalables
                        </h4>
                        <div className="space-y-2">
                          {dryRunResult.preFlightChecks.map((check, idx) => (
                            <div key={idx} className="flex items-start gap-3 p-2 rounded bg-slate-800">
                              {check.passed ? (
                                <CheckCircle className="text-green-500 shrink-0 mt-0.5" size={18} />
                              ) : check.blocking ? (
                                <X className="text-red-500 shrink-0 mt-0.5" size={18} />
                              ) : (
                                <AlertCircle className="text-yellow-500 shrink-0 mt-0.5" size={18} />
                              )}
                              <div className="flex-1">
                                <span className={check.passed ? 'text-green-400' : check.blocking ? 'text-red-400' : 'text-yellow-400'}>
                                  {check.message}
                                </span>
                                {!check.passed && check.resolution && (
                                  <p className="text-xs text-slate-400 mt-1">{check.resolution}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Volumetry */}
                      <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                        <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                          <FileText size={18} />
                          Données à Migrer
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-3 bg-slate-800 rounded-lg">
                            <div className="text-2xl font-bold text-blue-400">{dryRunResult.volumetry.clients}</div>
                            <div className="text-xs text-slate-400">Clients</div>
                          </div>
                          <div className="text-center p-3 bg-slate-800 rounded-lg">
                            <div className="text-2xl font-bold text-green-400">{dryRunResult.volumetry.comptes}</div>
                            <div className="text-xs text-slate-400">Comptes</div>
                          </div>
                          <div className="text-center p-3 bg-slate-800 rounded-lg">
                            <div className="text-2xl font-bold text-amber-400">{dryRunResult.volumetry.credits}</div>
                            <div className="text-xs text-slate-400">Crédits</div>
                          </div>
                          <div className="text-center p-3 bg-slate-800 rounded-lg">
                            <div className="text-2xl font-bold text-purple-400">{dryRunResult.volumetry.employes}</div>
                            <div className="text-xs text-slate-400">Employés</div>
                          </div>
                        </div>
                      </div>

                      {/* Financials */}
                      <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                        <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                          <Receipt size={18} />
                          Impact Financier
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Solde coffre à transférer:</span>
                            <span className="text-white font-medium">{formatMoney(dryRunResult.financials.soldesCoffresTransferes)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Total soldes comptes:</span>
                            <span className="text-white font-medium">{formatMoney(dryRunResult.financials.totalSoldesComptes)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Crédits en cours:</span>
                            <span className="text-white font-medium">{formatMoney(dryRunResult.financials.totalCreditsEnCours)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Demandes en attente:</span>
                            <span className="text-white font-medium">{formatMoney(dryRunResult.financials.totalDemandesEnAttente)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Warnings */}
                      {dryRunResult.warnings.length > 0 && (
                        <div className="bg-yellow-500/10 rounded-lg p-4 border border-yellow-500/20">
                          <h4 className="font-medium text-yellow-400 mb-2 flex items-center gap-2">
                            <AlertTriangle size={18} />
                            Avertissements
                          </h4>
                          <ul className="text-sm text-slate-300 space-y-1">
                            {dryRunResult.warnings.map((w, idx) => (
                              <li key={idx}>• {w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Can Proceed? */}
                      {!dryRunResult.canProceed && (
                        <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
                          <h4 className="font-medium text-red-400 mb-2 flex items-center gap-2">
                            <Ban size={18} />
                            Migration Bloquée
                          </h4>
                          <ul className="text-sm text-slate-300 space-y-1">
                            {dryRunResult.blockingReasons.map((r, idx) => (
                              <li key={idx}>• {r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}

              {/* Step 5: Confirmation */}
              {currentStep === 5 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="bg-red-500/10 p-4 rounded-lg flex gap-3 border border-red-500/20">
                    <AlertTriangle className="text-red-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-red-400">Attention : Action Irréversible</h4>
                      <p className="text-sm text-slate-300">
                        Une fois confirmée, l'agence <strong>{sourceAgence.nom}</strong> sera définitivement fermée.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-lg p-4 space-y-3 border border-slate-700">
                    <h4 className="font-medium text-white border-b border-slate-700 pb-2">Récapitulatif Final</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Clients, Comptes, Crédits vers:</span>
                        <span className="text-white">{agences?.find((a: Agency) => a.id === targetClients)?.nom}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Employés vers:</span>
                        <span className="text-white">{agences?.find((a: Agency) => a.id === targetEmployees)?.nom}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Fonds vers:</span>
                        <span className="text-white">{agences?.find((a: Agency) => a.id === targetTreasury)?.nom}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Exécution:</span>
                        <span className="text-white">
                          {executeNow ? 'Immédiate' : format(new Date(scheduledAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {dryRunResult && (
                    <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-xl font-bold text-blue-400">{dryRunResult.volumetry.clients}</div>
                          <div className="text-xs text-slate-400">Clients</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold text-green-400">{dryRunResult.volumetry.comptes}</div>
                          <div className="text-xs text-slate-400">Comptes</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold text-amber-400">{dryRunResult.volumetry.credits}</div>
                          <div className="text-xs text-slate-400">Crédits</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold text-purple-400">{formatMoney(dryRunResult.financials.soldesCoffresTransferes)}</div>
                          <div className="text-xs text-slate-400">Fonds</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isProcessing && !isCompleted && !isFailed && !isScheduled && (
          <div className="space-y-2 pt-4 border-t border-slate-700">
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={currentStep === 0 ? handleClose : handleBack}
                disabled={createMigrationMutation.isPending || dryRunMutation.isPending}
              >
                {currentStep === 0 ? 'Annuler' : 'Retour'}
              </Button>

              <Button
                variant={currentStep === 5 ? 'danger' : 'primary'}
                onClick={handleNext}
                disabled={!canProceed() || createMigrationMutation.isPending || dryRunMutation.isPending || submitMigrationMutation.isPending}
                icon={currentStep === 5 ? (executeNow ? Play : Calendar) : ArrowRight}
              >
                {createMigrationMutation.isPending || dryRunMutation.isPending ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : currentStep === 3 ? (
                  'Analyser'
                ) : currentStep === 5 ? (
                  executeNow ? 'Lancer la Migration' : 'Planifier la Migration'
                ) : (
                  'Suivant'
                )}
              </Button>
            </div>
            <p className="text-xs text-slate-600 text-center">
              Raccourcis : ← Retour · → ou Entrée pour avancer
            </p>
          </div>
        )}

        {/* Cancel Reason Prompt */}
        {showCancelPrompt && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40" onClick={() => setShowCancelPrompt(false)} />
            <div className="relative z-[210] bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md shadow-xl animate-in fade-in zoom-in-95">
              <h4 className="font-bold text-white mb-2">Raison de l'annulation</h4>
              <p className="text-sm text-slate-400 mb-4">
                Veuillez indiquer la raison de l'annulation de cette migration.
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Changement de stratégie, erreur de sélection d'agence..."
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white text-sm focus:border-blue-500 focus:outline-none resize-none"
                rows={3}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && cancelReason.trim()) {
                    e.preventDefault();
                    handleCancelConfirm();
                  }
                }}
              />
              <div className="flex justify-end gap-3 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowCancelPrompt(false);
                    setCancelReason('');
                  }}
                >
                  Retour
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleCancelConfirm}
                  disabled={!cancelReason.trim() || cancelMigrationMutation.isPending}
                  icon={Ban}
                >
                  {cancelMigrationMutation.isPending ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    'Confirmer l\'annulation'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
