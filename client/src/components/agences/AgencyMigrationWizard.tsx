import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Users, Receipt, AlertTriangle, CheckCircle,
  ArrowRight, Loader2, Shield, Calendar, Play, X, AlertCircle,
  FileText, Ban, RefreshCw, Download, Eye, RotateCcw, Info, Pencil
} from 'lucide-react';
import { Modal, Button, SearchableSelect, ProgressBar, Badge } from '../ui';
import { api } from '../../lib/api-client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { addPdfLogoHeader, addPdfLogoFooter } from '@/lib/pdf-logo';
import { useBranding } from '@/contexts/BrandingContext';
import { formatMoney as formatCurrency } from '@shared/config/currency';
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
  statut: string;
  progress: number;
  currentStep?: string;
  error?: string;
  logs?: Array<{ step: string; timestamp: string; success: boolean; count?: number }>;
  report?: any;
  scheduledAt?: string;
  completedAt?: string;
  targetClientsAgencyId?: string;
  targetEmployeesAgencyId?: string;
  targetTreasuryAgencyId?: string;
  dryRunResult?: DryRunResult;
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

const ACTIVE_MIGRATION_STATUSES = ['DRAFT', 'PENDING', 'SCHEDULED', 'PRE_FLIGHT_CHECK', 'PROCESSING', 'FAILED'];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Brouillon', color: 'bg-surface-muted0' },
  PENDING: { label: 'En attente', color: 'bg-status-warning' },
  SCHEDULED: { label: 'Planifié', color: 'bg-status-info' },
  PRE_FLIGHT_CHECK: { label: 'Vérifications', color: 'bg-status-info' },
  PROCESSING: { label: 'En cours', color: 'bg-status-warning' },
  COMPLETED: { label: 'Terminé', color: 'bg-status-success' },
  FAILED: { label: 'Échoué', color: 'bg-status-danger' },
  CANCELLED: { label: 'Annulé', color: 'bg-surface-muted0' },
};

// ============================================
// COMPONENT
// ============================================

export function AgencyMigrationWizard({ isOpen, onClose, sourceAgence, onSuccess }: MigrationWizardProps) {
  const queryClient = useQueryClient();
  const { branding } = useBranding();

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
  const [isResuming, setIsResuming] = useState(false);
  const resumeHandled = useRef(false);
  const lastToastedStatus = useRef<string | null>(null);
  const isTerminal = useRef(false);

  // Fetch existing active migration for this agency (to resume instead of restarting)
  const { data: existingMigrations } = useQuery({
    queryKey: ['agency-migrations', sourceAgence.id],
    queryFn: async () => {
      const res = await api.get<MigrationStatus[]>(`/agences/${sourceAgence.id}/migrations`);
      return res;
    },
    enabled: isOpen,
  });

  // Auto-resume: restore wizard state from existing active migration
  useEffect(() => {
    if (!isOpen || !existingMigrations || resumeHandled.current) return;
    const active = existingMigrations.find(m => ACTIVE_MIGRATION_STATUSES.includes(m.statut));
    if (!active) return;

    resumeHandled.current = true;
    setIsResuming(true);
    setMigrationId(active.id);

    // Restore target selections
    if (active.targetClientsAgencyId) setTargetClients(active.targetClientsAgencyId);
    if (active.targetEmployeesAgencyId) setTargetEmployees(active.targetEmployeesAgencyId);
    if (active.targetTreasuryAgencyId) setTargetTreasury(active.targetTreasuryAgencyId);
    if (active.scheduledAt) {
      setScheduledAt(new Date(active.scheduledAt).toISOString().slice(0, 16));
      setExecuteNow(false);
    }

    // Restore dry run result if available
    if (active.dryRunResult) {
      setDryRunResult(active.dryRunResult);
    }

    // Jump to the appropriate step based on status
    const st = active.statut;
    if (st === 'PENDING' || st === 'SCHEDULED' || st === 'PRE_FLIGHT_CHECK' || st === 'PROCESSING' || st === 'FAILED') {
      // Live states — the existing UI handles these via migrationStatus polling
    } else if (st === 'DRAFT') {
      // Has dry run result → go to analysis step, otherwise go to schedule step
      if (active.dryRunResult) {
        setCurrentStep(4); // Analysis
      } else {
        setCurrentStep(3); // Schedule (ready to create/re-run dry run)
      }
    }

    // Suppress toast for already-known terminal states on resume
    if (st === 'FAILED' || st === 'COMPLETED') {
      lastToastedStatus.current = st;
    }

    toast.info('Migration en cours reprise');
  }, [isOpen, existingMigrations]);

  // Reset resumeHandled when wizard closes
  useEffect(() => {
    if (!isOpen) {
      resumeHandled.current = false;
      lastToastedStatus.current = null;
      isTerminal.current = false;
      setIsResuming(false);
    }
  }, [isOpen]);

  // Fetch available agencies (excluding source)
  const { data: agences } = useQuery({
    queryKey: ['agences', 'migration', sourceAgence.id],
    queryFn: async () => {
      const res = await api.get<Agency[]>('/agences?statut=ACTIVE');
      return res.filter((a: Agency) => a.id !== sourceAgence.id);
    },
    enabled: isOpen
  });

  // Exponential backoff: 2s, 4s, 8s, 16s, capped at 30s
  // Stop polling on terminal states (via isTerminal ref)
  const getPollingInterval = useCallback((): number | false => {
    if (!migrationId || isTerminal.current) return false;
    return Math.min(2000 * Math.pow(2, pollCount), 30000);
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
  // Also reset toast guard so retries can show new errors
  // Track terminal states to stop polling
  useEffect(() => {
    const st = migrationStatus?.statut;
    if (st === 'PROCESSING' || st === 'PRE_FLIGHT_CHECK') {
      setPollCount(0);
      lastToastedStatus.current = null;
      isTerminal.current = false;
    } else if (st === 'COMPLETED' || st === 'FAILED' || st === 'CANCELLED' || st === 'ROLLED_BACK') {
      isTerminal.current = true;
    }
  }, [migrationStatus?.statut]);

  // Handle migration completion (fire toast only once per status transition)
  useEffect(() => {
    const st = migrationStatus?.statut;
    if (!st || st === lastToastedStatus.current) return;

    if (st === 'COMPLETED') {
      lastToastedStatus.current = st;
      toast.success('Migration terminée');
      onSuccess();
    } else if (st === 'FAILED') {
      lastToastedStatus.current = st;
      toast.error(`Erreur: ${migrationStatus.error}`);
    }
  }, [migrationStatus?.statut, migrationStatus?.error, onSuccess]);

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
      queryClient.invalidateQueries({ queryKey: ['migration-status', migrationId] });
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
      toast.success('Rollback effectué');
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

  const formatMoney = formatCurrency;

  // Navigation
  const handleNext = async () => {
    if (currentStep === 3) {
      // Créer la migration (ou réutiliser l'existante) et lancer le dry run
      setIsAnalyzing(true);
      setDryRunFailed(false);
      try {
        let id = migrationId;
        // If the user edited targets, cancel old migration and create a fresh one
        if (id && isResuming) {
          const existing = existingMigrations?.find((m: MigrationStatus) => m.id === id);
          const targetsChanged = existing && (
            existing.targetClientsAgencyId !== targetClients ||
            existing.targetEmployeesAgencyId !== targetEmployees ||
            existing.targetTreasuryAgencyId !== targetTreasury
          );
          if (targetsChanged && existing?.statut === 'DRAFT') {
            // Cancel silently via API (bypass mutation onSuccess which resets wizard state)
            await api.post(`/agences/migrations/${id}/cancel`, { reason: 'Modification des agences cibles' });
            id = null;
            setMigrationId(null);
          }
        }
        if (!id) {
          const migration = await createMigrationMutation.mutateAsync({
            targetAgenceClients: targetClients as string,
            targetAgenceEmployes: targetEmployees as string,
            targetAgenceCoffre: targetTreasury as string,
            scheduledAt: !executeNow && scheduledAt ? new Date(scheduledAt).toISOString() : undefined
          });
          id = migration.id;
        }
        await dryRunMutation.mutateAsync(id!);
        setCurrentStep(4);
      } catch (error) {
        setIsAnalyzing(false);
      }
    } else if (currentStep === 5) {
      // Confirmer et lancer — idempotent : skip submit si déjà soumis
      if (migrationId) {
        const currentStatut = migrationStatus?.statut;
        const alreadySubmitted = currentStatut === 'PENDING' || currentStatut === 'SCHEDULED';
        if (!alreadySubmitted) {
          await submitMigrationMutation.mutateAsync(migrationId);
        }
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
    if (currentStep > 0) {
      // Going back from analysis/confirm invalidates dry run (will re-run on next pass)
      if (currentStep >= 4) {
        setDryRunResult(null);
        setDryRunFailed(false);
      }
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleCancelConfirm = () => {
    if (!migrationId || !cancelReason.trim()) return;
    cancelMigrationMutation.mutate({ id: migrationId, reason: cancelReason.trim() });
  };

  // Derived state (must be before keyboard effect)
  const isPending = migrationStatus?.statut === 'PENDING';
  const isProcessing = migrationStatus?.statut === 'PROCESSING' ||
    migrationStatus?.statut === 'PRE_FLIGHT_CHECK';
  const isCompleted = migrationStatus?.statut === 'COMPLETED';
  const isFailed = migrationStatus?.statut === 'FAILED';
  const isScheduled = migrationStatus?.statut === 'SCHEDULED';
  const isLiveState = isPending || isProcessing || isCompleted || isFailed || isScheduled;

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
        subtitle: `Réf: ${migrationStatus.reference} — Statut: ${migrationStatus.statut}`,
        dateRight: completedDate ? `Terminée le: ${completedDate}` : undefined,
        appName: branding.appName,
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
        const fmtMoney = (v: number) => formatCurrency(v);

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
      addPdfLogoFooter(doc, 'Rapport de Migration', branding.appName);

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
      if (isLiveState) return;

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
  }, [isOpen, currentStep, isLiveState]);

  // Reset on close
  const handleClose = () => {
    if (!isProcessing && !isPending) {
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
      <div className="space-y-4">
        {/* Stepper Header — hidden during live states */}
        {!isLiveState && (
          <div className="flex justify-between relative overflow-x-auto pb-1">
            <div className="absolute top-4 left-0 w-full h-0.5 bg-surface-elevated -z-10" />
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === currentStep;
              const isDone = idx < currentStep;
              // Allow clicking on completed steps to go back and edit
              const canClick = isDone && !createMigrationMutation.isPending && !dryRunMutation.isPending;

              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={!canClick}
                  onClick={() => {
                    if (!canClick) return;
                    // Going back to a step before analysis invalidates the dry run
                    if (idx < 4 && currentStep >= 4 && migrationId) {
                      setDryRunResult(null);
                      setDryRunFailed(false);
                    }
                    setCurrentStep(idx);
                  }}
                  className={`flex flex-col items-center bg-surface px-1.5 min-w-[60px] ${canClick ? 'cursor-pointer group' : 'cursor-default'}`}
                >
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors
                    ${isActive ? 'border-status-info bg-status-info-bg text-status-info' :
                      isDone ? 'border-status-success bg-status-success-bg text-status-success group-hover:border-status-info group-hover:bg-status-info-bg group-hover:text-status-info' :
                        'border-edge-strong bg-surface text-content-muted'}
                  `}>
                    {isDone ? <CheckCircle size={14} /> : <Icon size={14} />}
                  </div>
                  <span className={`text-[10px] mt-1 font-medium text-center ${isActive ? 'text-content-primary' : isDone ? 'text-status-success group-hover:text-status-info' : 'text-content-muted'}`}>
                    {step.title}
                  </span>
                  {isDone && canClick && (
                    <Pencil size={8} className="text-content-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Resume banner */}
        {isResuming && !isLiveState && migrationId && (
          <div className="flex items-center gap-2 px-3 py-2 bg-status-info-bg/50 rounded-lg border border-status-info/20 text-xs text-status-info">
            <Info size={14} className="shrink-0" />
            <span>Migration en cours reprise. Vous pouvez modifier les choix en cliquant sur les étapes précédentes.</span>
          </div>
        )}

        {/* Status badge when in live state */}
        {isLiveState && migrationStatus && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-content-muted font-mono">Réf: {migrationStatus.reference}</span>
            <Badge className={STATUS_LABELS[migrationStatus.statut]?.color || 'bg-surface-muted0'}>
              {STATUS_LABELS[migrationStatus.statut]?.label || migrationStatus.statut}
            </Badge>
          </div>
        )}

        {/* Content */}
        <div className={isLiveState ? 'py-2' : 'min-h-[320px] py-2'}>

          {/* Pending State */}
          {isPending && (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <Loader2 className="animate-spin text-status-info" size={36} />
              <h3 className="text-lg font-bold text-content-primary">Migration soumise</h3>
              <p className="text-content-muted text-sm text-center">
                En attente de démarrage du traitement...
              </p>
            </div>
          )}

          {/* Processing State */}
          {isProcessing && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="animate-spin text-status-info shrink-0" size={20} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-content-primary truncate">
                    {migrationStatus?.currentStep || 'Initialisation...'}
                  </h3>
                  <ProgressBar value={migrationStatus?.progress || 0} max={100} color="primary" size="sm" />
                </div>
                <span className="text-xs font-mono text-content-muted shrink-0">{migrationStatus?.progress || 0}%</span>
              </div>

              {/* Steps Log */}
              <div className="bg-surface-base rounded-lg border border-edge divide-y divide-edge max-h-48 overflow-y-auto">
                {migrationStatus?.logs && migrationStatus.logs.length > 0 ? (
                  migrationStatus.logs.map((log, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      {log.success ? (
                        <CheckCircle className="text-status-success shrink-0" size={12} />
                      ) : (
                        <X className="text-status-danger shrink-0" size={12} />
                      )}
                      <span className="text-content-secondary flex-1 truncate">{log.step}</span>
                      {log.count !== undefined && (
                        <span className="text-content-muted font-mono">{log.count}</span>
                      )}
                    </div>
                  ))
                ) : null}
                {/* Current step pulsing indicator */}
                {migrationStatus?.currentStep && (
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-status-info-bg/30">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-info opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-status-info" />
                    </span>
                    <span className="text-status-info flex-1 truncate">{migrationStatus.currentStep}</span>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-content-muted text-center">
                Ne fermez pas cette fenêtre pendant le traitement
              </p>
            </div>
          )}

          {/* Completed State */}
          {isCompleted && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-status-success-bg/50 rounded-lg border border-status-success/20">
                <CheckCircle className="text-status-success shrink-0" size={24} />
                <div>
                  <h3 className="text-sm font-bold text-content-primary">Migration terminée</h3>
                  <p className="text-xs text-content-muted">
                    L'agence {sourceAgence.nom} a été fermée. Toutes les données ont été transférées.
                  </p>
                </div>
              </div>

              {migrationStatus?.report && (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Clients', value: migrationStatus.report.volumetry?.clients || 0 },
                    { label: 'Comptes', value: migrationStatus.report.volumetry?.comptes || 0 },
                    { label: 'Crédits', value: migrationStatus.report.volumetry?.credits || 0 },
                    { label: 'Fonds', value: formatMoney(migrationStatus.report.financials?.soldesCoffresTransferes || 0) },
                  ].map((item) => (
                    <div key={item.label} className="bg-surface-base rounded-lg p-2 text-center border border-edge">
                      <div className="text-sm font-bold text-content-primary">{item.value}</div>
                      <div className="text-[10px] text-content-muted">{item.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {canRollback && (
                <div className="flex items-center gap-3 p-3 bg-status-warning-bg rounded-lg border border-status-warning/20">
                  <AlertTriangle className="text-status-warning shrink-0" size={16} />
                  <p className="text-xs text-content-muted flex-1">
                    Rollback possible pendant encore {Math.floor(rollbackHoursLeft)}h{Math.round((rollbackHoursLeft % 1) * 60).toString().padStart(2, '0')}
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => migrationId && rollbackMigrationMutation.mutate(migrationId)}
                    disabled={rollbackMigrationMutation.isPending}
                    icon={RotateCcw}
                  >
                    {rollbackMigrationMutation.isPending ? <Loader2 className="animate-spin" size={12} /> : 'Rollback'}
                  </Button>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={handleClose} icon={X}>
                  Fermer
                </Button>
                <Button variant="primary" size="sm" onClick={handleDownloadReport} icon={Download}>
                  Rapport PDF
                </Button>
              </div>
            </div>
          )}

          {/* Failed State */}
          {isFailed && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-status-danger-bg/50 rounded-lg border border-status-danger/20">
                <AlertCircle className="text-status-danger shrink-0" size={24} />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-content-primary">Migration Échouée</h3>
                  <p className="text-xs text-status-danger truncate">{migrationStatus?.error}</p>
                </div>
              </div>

              <p className="text-xs text-content-muted text-center">
                La transaction a été annulée. Aucune donnée n'a été modifiée.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={handleClose} icon={X}>
                  Fermer
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => migrationId && executeMigrationMutation.mutate(migrationId)}
                  icon={RefreshCw}
                >
                  Réessayer
                </Button>
              </div>
            </div>
          )}

          {/* Scheduled State */}
          {isScheduled && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-status-info-bg/50 rounded-lg border border-status-info/20">
                <Calendar className="text-status-info shrink-0" size={24} />
                <div>
                  <h3 className="text-sm font-bold text-content-primary">Migration planifiée</h3>
                  <p className="text-xs text-content-muted">
                    Exécution le{' '}
                    <span className="text-content-primary font-medium">
                      {migrationStatus?.scheduledAt &&
                        format(new Date(migrationStatus.scheduledAt), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 bg-status-warning-bg/50 rounded-lg text-xs text-status-warning">
                <AlertCircle size={14} className="shrink-0" />
                L'agence est en mode "Lecture seule" jusqu'à l'exécution
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="danger" size="sm" onClick={() => setShowCancelPrompt(true)} icon={Ban}>
                  Annuler
                </Button>
                <Button variant="outline" size="sm" onClick={handleClose} icon={X}>
                  Fermer
                </Button>
              </div>
            </div>
          )}

          {/* Wizard Steps */}
          {!isLiveState && (
            <>
              {/* Step 0: Clients */}
              {currentStep === 0 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                  <div className="bg-status-info-bg p-4 rounded-lg flex gap-3 border border-status-info/20 font-sans">
                    <Users className="text-status-info shrink-0" />
                    <div>
                      <h4 className="font-bold text-status-info">Transfert de la Clientèle</h4>
                      <p className="text-sm text-content-secondary">
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
                  <div className="bg-status-info-bg p-4 rounded-lg flex gap-3 border border-status-info/20 font-sans">
                    <Building2 className="text-status-info shrink-0" />
                    <div>
                      <h4 className="font-bold text-status-info">Réaffectation du Personnel</h4>
                      <p className="text-sm text-content-secondary">
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
                  <div className="bg-status-warning-bg p-4 rounded-lg flex gap-3 border border-status-warning/20 font-sans">
                    <Receipt className="text-status-warning shrink-0" />
                    <div>
                      <h4 className="font-bold text-status-warning">Transfert de Fonds (Trésorerie)</h4>
                      <p className="text-sm text-content-secondary">
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
                  <div className="bg-accent/10 p-4 rounded-lg flex gap-3 border border-accent/20 font-sans">
                    <Calendar className="text-accent shrink-0" />
                    <div>
                      <h4 className="font-bold text-accent">Planification de l'Exécution</h4>
                      <p className="text-sm text-content-secondary">
                        Choisissez quand effectuer la migration. Une planification différée permet de préparer l'équipe.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="flex items-center gap-3 p-4 bg-surface-base rounded-lg cursor-pointer border border-edge hover:border-status-info transition-colors">
                      <input
                        type="radio"
                        name="schedule"
                        checked={executeNow}
                        onChange={() => setExecuteNow(true)}
                        className="w-5 h-5 text-status-info"
                      />
                      <div>
                        <span className="font-medium text-content-primary">Exécuter maintenant</span>
                        <p className="text-sm text-content-muted">La migration démarrera immédiatement après confirmation</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 bg-surface-base rounded-lg cursor-pointer border border-edge hover:border-status-info transition-colors">
                      <input
                        type="radio"
                        name="schedule"
                        checked={!executeNow}
                        onChange={() => setExecuteNow(false)}
                        className="w-5 h-5 text-status-info"
                      />
                      <div className="flex-1">
                        <span className="font-medium text-content-primary">Planifier pour plus tard</span>
                        <p className="text-sm text-content-muted">L'agence passera en mode "lecture seule" jusqu'à la migration</p>
                      </div>
                    </label>

                    {!executeNow && (
                      <div className="ml-8 mt-2">
                        <label className="block text-sm text-content-muted mb-2">Date et heure d'exécution</label>
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          min={new Date().toISOString().slice(0, 16)}
                          className="w-full bg-surface border border-edge-strong rounded-lg px-4 py-2 text-content-primary focus:border-accent focus:outline-none"
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
                      <Loader2 className="animate-spin text-status-info mb-4" size={40} />
                      <p className="text-content-secondary">Analyse en cours...</p>
                    </div>
                  ) : dryRunFailed ? (
                    <div className="flex flex-col items-center justify-center p-8 space-y-4">
                      <div className="w-16 h-16 rounded-full bg-status-danger-bg flex items-center justify-center">
                        <X className="text-status-danger" size={32} />
                      </div>
                      <h4 className="text-lg font-bold text-content-primary">Échec de l'analyse</h4>
                      <p className="text-content-muted text-sm text-center">
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
                      <div className="bg-surface-base rounded-lg p-4 border border-edge">
                        <h4 className="font-medium text-content-primary mb-3 flex items-center gap-2">
                          <Shield size={18} />
                          Vérifications Préalables
                        </h4>
                        <div className="space-y-2">
                          {dryRunResult.preFlightChecks.map((check, idx) => (
                            <div key={idx} className="flex items-start gap-3 p-2 rounded bg-surface">
                              {check.passed ? (
                                <CheckCircle className="text-status-success shrink-0 mt-0.5" size={18} />
                              ) : check.blocking ? (
                                <X className="text-status-danger shrink-0 mt-0.5" size={18} />
                              ) : (
                                <AlertCircle className="text-status-warning shrink-0 mt-0.5" size={18} />
                              )}
                              <div className="flex-1">
                                <span className={check.passed ? 'text-status-success' : check.blocking ? 'text-status-danger' : 'text-status-warning'}>
                                  {check.message}
                                </span>
                                {!check.passed && check.resolution && (
                                  <p className="text-xs text-content-muted mt-1">{check.resolution}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Volumetry */}
                      <div className="bg-surface-base rounded-lg p-4 border border-edge">
                        <h4 className="font-medium text-content-primary mb-3 flex items-center gap-2">
                          <FileText size={18} />
                          Données à Migrer
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-3 bg-surface rounded-lg">
                            <div className="text-2xl font-bold text-status-info">{dryRunResult.volumetry.clients}</div>
                            <div className="text-xs text-content-muted">Clients</div>
                          </div>
                          <div className="text-center p-3 bg-surface rounded-lg">
                            <div className="text-2xl font-bold text-status-success">{dryRunResult.volumetry.comptes}</div>
                            <div className="text-xs text-content-muted">Comptes</div>
                          </div>
                          <div className="text-center p-3 bg-surface rounded-lg">
                            <div className="text-2xl font-bold text-status-warning">{dryRunResult.volumetry.credits}</div>
                            <div className="text-xs text-content-muted">Crédits</div>
                          </div>
                          <div className="text-center p-3 bg-surface rounded-lg">
                            <div className="text-2xl font-bold text-status-info">{dryRunResult.volumetry.employes}</div>
                            <div className="text-xs text-content-muted">Employés</div>
                          </div>
                        </div>
                      </div>

                      {/* Financials */}
                      <div className="bg-surface-base rounded-lg p-4 border border-edge">
                        <h4 className="font-medium text-content-primary mb-3 flex items-center gap-2">
                          <Receipt size={18} />
                          Impact Financier
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex justify-between">
                            <span className="text-content-muted">Solde coffre à transférer:</span>
                            <span className="text-content-primary font-medium">{formatMoney(dryRunResult.financials.soldesCoffresTransferes)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-content-muted">Total soldes comptes:</span>
                            <span className="text-content-primary font-medium">{formatMoney(dryRunResult.financials.totalSoldesComptes)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-content-muted">Crédits en cours:</span>
                            <span className="text-content-primary font-medium">{formatMoney(dryRunResult.financials.totalCreditsEnCours)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-content-muted">Demandes en attente:</span>
                            <span className="text-content-primary font-medium">{formatMoney(dryRunResult.financials.totalDemandesEnAttente)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Warnings */}
                      {dryRunResult.warnings.length > 0 && (
                        <div className="bg-status-warning-bg rounded-lg p-4 border border-status-warning/20">
                          <h4 className="font-medium text-status-warning mb-2 flex items-center gap-2">
                            <AlertTriangle size={18} />
                            Avertissements
                          </h4>
                          <ul className="text-sm text-content-secondary space-y-1">
                            {dryRunResult.warnings.map((w, idx) => (
                              <li key={idx}>• {w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Can Proceed? */}
                      {!dryRunResult.canProceed && (
                        <div className="bg-status-danger-bg rounded-lg p-4 border border-status-danger/20">
                          <h4 className="font-medium text-status-danger mb-2 flex items-center gap-2">
                            <Ban size={18} />
                            Migration Bloquée
                          </h4>
                          <ul className="text-sm text-content-secondary space-y-1">
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
                  <div className="bg-status-danger-bg p-4 rounded-lg flex gap-3 border border-status-danger/20">
                    <AlertTriangle className="text-status-danger shrink-0" />
                    <div>
                      <h4 className="font-bold text-status-danger">Attention : Action Irréversible</h4>
                      <p className="text-sm text-content-secondary">
                        Une fois confirmée, l'agence <strong>{sourceAgence.nom}</strong> sera définitivement fermée.
                      </p>
                    </div>
                  </div>

                  <div className="bg-surface-base rounded-lg p-4 space-y-3 border border-edge">
                    <h4 className="font-medium text-content-primary border-b border-edge pb-2">Récapitulatif Final</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-content-muted">Clients, Comptes, Crédits vers:</span>
                        <span className="text-content-primary">{agences?.find((a: Agency) => a.id === targetClients)?.nom}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-content-muted">Employés vers:</span>
                        <span className="text-content-primary">{agences?.find((a: Agency) => a.id === targetEmployees)?.nom}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-content-muted">Fonds vers:</span>
                        <span className="text-content-primary">{agences?.find((a: Agency) => a.id === targetTreasury)?.nom}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-content-muted">Exécution:</span>
                        <span className="text-content-primary">
                          {executeNow ? 'Immédiate' : format(new Date(scheduledAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {dryRunResult && (
                    <div className="bg-surface-base rounded-lg p-4 border border-edge">
                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-xl font-bold text-status-info">{dryRunResult.volumetry.clients}</div>
                          <div className="text-xs text-content-muted">Clients</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold text-status-success">{dryRunResult.volumetry.comptes}</div>
                          <div className="text-xs text-content-muted">Comptes</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold text-status-warning">{dryRunResult.volumetry.credits}</div>
                          <div className="text-xs text-content-muted">Crédits</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold text-status-info">{formatMoney(dryRunResult.financials.soldesCoffresTransferes)}</div>
                          <div className="text-xs text-content-muted">Fonds</div>
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
        {!isLiveState && (
          <div className="space-y-2 pt-4 border-t border-edge">
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
            <p className="text-xs text-content-muted text-center">
              Raccourcis : ← Retour · → ou Entrée pour avancer
            </p>
          </div>
        )}

        {/* Cancel Reason Prompt */}
        {showCancelPrompt && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40" onClick={() => setShowCancelPrompt(false)} />
            <div className="relative z-[210] bg-surface rounded-xl border border-edge p-6 w-full max-w-md shadow-xl animate-in fade-in zoom-in-95">
              <h4 className="font-bold text-content-primary mb-2">Raison de l'annulation</h4>
              <p className="text-sm text-content-muted mb-4">
                Veuillez indiquer la raison de l'annulation de cette migration.
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Changement de stratégie, erreur de sélection d'agence..."
                className="w-full bg-surface-base border border-edge-strong rounded-lg px-4 py-3 text-content-primary text-sm focus:border-accent focus:outline-none resize-none"
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
