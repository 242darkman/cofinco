/**
 * ReevaluationCockpit — Cockpit décisionnel 2 colonnes
 */

import React, { useState, useEffect } from 'react';
import { Loader2, XCircle, History } from 'lucide-react';
import { toast } from 'sonner';
import { StatutReevaluation } from '@shared/enum/status-constants';
import { useCan } from '@/contexts/AbilityContext';
import { Actions } from '@shared/ability/actions';
import { Subjects } from '@shared/ability/subjects';
import { useWebSocket } from '@/hooks/useWebSocket';
import { CreditTimeline } from '../CreditTimeline';

import type { Reevaluation, AuditLog, ActionContext, Actors } from './types';
import { STATUT_CONFIG, DEFAULT_STATUT_CONFIG } from './types';

import { ReevaluationHeader, type ViewMode } from './components/ReevaluationHeader';
import { StatusStepper, type StepDefinition } from './components/StatusStepper';
import { StepDetailModal } from './components/StepDetailModal';
import { StatusAlert } from './components/StatusAlert';
import { ComparisonCards } from './components/ComparisonCards';
import { NewElementsSection } from './components/NewElementsSection';
import { GuaranteesAccordion } from './components/GuaranteesAccordion';
import { CommitteeDecisionCard } from './components/CommitteeDecisionCard';
import { ConfidenceIndicator } from './components/ConfidenceIndicator';
import { RecentActions } from './components/RecentActions';
import { FinalDecisionCard } from './components/FinalDecisionCard';
import { DecisionModal } from './components/DecisionModal';
import { AuditHistoryDrawer } from './components/AuditHistoryDrawer';

interface ReevaluationCockpitProps {
  reevaluationId: string;
  onBack?: () => void;
  onStatusChange?: (statut: string) => void;
}

export function ReevaluationCockpit({ reevaluationId, onBack, onStatusChange }: ReevaluationCockpitProps) {
  // ── State ─────────────────────────────────────────────────────
  const [reevaluation, setReevaluation] = useState<Reevaluation | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [wsUpdated, setWsUpdated] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);
  const [selectedStep, setSelectedStep] = useState<StepDefinition | null>(null);
  const [actionContext, setActionContext] = useState<ActionContext | null>(null);
  const [actors, setActors] = useState<Actors | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('detailed');

  // ── CASL permissions ──────────────────────────────────────────
  const canValidateEligibility = useCan(Actions.VALIDATE_REEVALUATION, Subjects.REEVALUATION);
  const canDecide = useCan(Actions.DECIDE_REEVALUATION, Subjects.REEVALUATION);
  const canSubmitToCommittee = useCan(Actions.APPROVE, Subjects.REEVALUATION);
  const canCancel = useCan(Actions.REEVALUATE, Subjects.REEVALUATION);

  // ── WebSocket ─────────────────────────────────────────────────
  const { socket } = useWebSocket();

  useEffect(() => {
    if (reevaluationId) {
      loadReevaluation();
      loadAuditLogs();
    }
  }, [reevaluationId]);

  useEffect(() => {
    if (!socket || !reevaluationId) return;
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'REEVALUATION_UPDATE' && msg.payload?.reevaluationId === reevaluationId) {
          loadReevaluation();
          loadAuditLogs();
          setWsUpdated(true);
          setTimeout(() => setWsUpdated(false), 2500);
        }
      } catch { /* ignore */ }
    };
    socket.addEventListener('message', handler);
    return () => socket.removeEventListener('message', handler);
  }, [socket, reevaluationId]);

  // ── Data loading ──────────────────────────────────────────────
  const loadReevaluation = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error?.message || 'Erreur de chargement');
      setReevaluation(data.reevaluation);
      setActionContext(data.actionContext || null);
      setActors(data.actors || null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}/audit-logs`, { credentials: 'include' });
      const data = await response.json();
      if (data.success) setAuditLogs(data.logs || []);
    } catch {
      // silent
    }
  };

  // ── Action handlers ───────────────────────────────────────────
  const handleValidateEligibility = async () => {
    setActionLoading('eligibility');
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}/eligibility/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error?.message || 'Erreur de validation');

      if (data.eligibilite?.estEligible) {
        toast.success('Éligibilité validée ! La réévaluation peut continuer.');
      } else {
        toast.error(`Non éligible: ${data.eligibilite?.motifRefus || 'Critères non remplis'}`);
      }

      await loadReevaluation();
      await loadAuditLogs();
      onStatusChange?.(data.reevaluation?.statut);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitToCommittee = async () => {
    setActionLoading('committee');
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}/submit-to-committee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          membresConvoques: [],
          notePreparatoire: 'Dossier soumis pour évaluation en comité',
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error?.message || 'Erreur de soumission');

      const scoring = data.scoring;
      toast.success(
        <div>
          <p className="font-bold">Dossier soumis au comité</p>
          {scoring && (
            <p className="text-sm mt-1">
              Score: {scoring.scorePrecedent} → {scoring.scoreTotal}{' '}
              ({scoring.deltaScore > 0 ? '+' : ''}{scoring.deltaScore})
            </p>
          )}
        </div>,
      );

      await loadReevaluation();
      await loadAuditLogs();
      onStatusChange?.('En comité');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette réévaluation ?')) return;

    setActionLoading('cancel');
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ motif: "Annulation manuelle par l'utilisateur" }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error?.message || "Erreur d'annulation");

      toast.success('Réévaluation annulée');
      await loadReevaluation();
      await loadAuditLogs();
      onStatusChange?.('Annulée');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecisionSuccess = async () => {
    setShowDecisionModal(false);
    await loadReevaluation();
    await loadAuditLogs();
  };

  // ── Derived values ────────────────────────────────────────────
  const canAct = reevaluation
    ? [StatutReevaluation.REQUESTED, StatutReevaluation.ELIGIBILITY_CHECK].includes(reevaluation.statut as any)
      ? canValidateEligibility
      : [StatutReevaluation.AUTHORIZED, StatutReevaluation.ADDITIONAL_INVESTIGATION].includes(reevaluation.statut as any)
        ? canSubmitToCommittee
        : reevaluation.statut === StatutReevaluation.IN_COMMITTEE
          ? canDecide && !(actionContext?.hasConflictOfInterest)
          : false
    : false;

  // ── Loading / error ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  if (!reevaluation) {
    return (
      <div className="bg-status-danger-bg border border-status-danger/50 rounded-xl p-6 text-center">
        <XCircle className="mx-auto text-status-danger mb-2" size={32} />
        <p className="text-status-danger">Réévaluation introuvable</p>
      </div>
    );
  }

  const statutConfig = STATUT_CONFIG[reevaluation.statut] || DEFAULT_STATUT_CONFIG;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <ReevaluationHeader
        numeroReevaluation={reevaluation.numeroReevaluation || `Réévaluation #${reevaluation.numeroVersion}`}
        createdAt={reevaluation.createdAt}
        statut={reevaluation.statut}
        statutConfig={statutConfig}
        verrouille={reevaluation.verrouille}
        wsUpdated={wsUpdated}
        actorCreatedBy={actors?.createdBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onBack={onBack}
      />

      {/* Stepper */}
      <div className="border-b border-edge/40">
        <StatusStepper
          currentStatus={reevaluation.statut}
          onStepClick={setSelectedStep}
          actors={actors}
          reevaluation={reevaluation}
        />
      </div>

      {selectedStep && (
        <StepDetailModal
          step={selectedStep}
          logs={auditLogs}
          onClose={() => setSelectedStep(null)}
        />
      )}

      {/* 2-column layout */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Colonne gauche */}
        <div className="flex-1 min-w-0 space-y-4">
          <StatusAlert status={reevaluation.statut} canAct={canAct} />

          <ComparisonCards
            montantInitial={reevaluation.montantInitialDemande}
            scoreInitial={reevaluation.scoreRejetInitial}
            motifRejet={reevaluation.motifRejetInitial}
            montantNouveau={reevaluation.nouveauMontantDemande || reevaluation.montantInitialDemande}
            scoreNouveau={reevaluation.nouveauScore}
            deltaScore={reevaluation.deltaScore}
            elementsNouveaux={reevaluation.elementsNouveaux?.map((e: any) => e.type) || []}
          />

          {reevaluation.garantiesAdditionnelles && reevaluation.garantiesAdditionnelles.length > 0 && (
            <GuaranteesAccordion garanties={reevaluation.garantiesAdditionnelles} />
          )}

          <NewElementsSection
            elementsNouveaux={reevaluation.elementsNouveaux || []}
            justification={reevaluation.justification}
            reevaluation={reevaluation}
          />

          {reevaluation.decisionComite && (
            <CommitteeDecisionCard
              decisionComite={reevaluation.decisionComite}
              montantApprouveComite={reevaluation.montantApprouveComite}
              commentaireComite={reevaluation.commentaireComite}
              conditionsSpeciales={reevaluation.conditionsSpeciales}
              dateDecisionComite={reevaluation.dateDecisionComite}
            />
          )}

          {/* Timeline */}
          <div className="bg-surface/50 rounded-xl p-4 border border-edge">
            <h3 className="text-xs font-bold text-content-muted mb-3 flex items-center gap-2 uppercase tracking-wider">
              <History size={14} /> Historique du dossier
            </h3>
            <CreditTimeline demandeId={reevaluation.demandeId} compact />
          </div>
        </div>

        {/* Sidebar (masquée en Vue Rapide) */}
        {viewMode === 'detailed' && (
          <div className="w-full lg:w-[340px] shrink-0">
            <div className="lg:sticky lg:top-24 space-y-3">
              <ConfidenceIndicator
                scoreInitial={reevaluation.scoreRejetInitial}
                scoreNouveau={reevaluation.nouveauScore}
                deltaScore={reevaluation.deltaScore}
                garanties={reevaluation.garantiesAdditionnelles}
              />

              <RecentActions
                auditLogs={auditLogs}
                onShowFullHistory={() => setShowAuditDrawer(true)}
              />

              <FinalDecisionCard
                reevaluation={reevaluation}
                actionLoading={actionLoading}
                actionContext={actionContext}
                canValidateEligibility={canValidateEligibility}
                canDecide={canDecide}
                canSubmitToCommittee={canSubmitToCommittee}
                canCancel={canCancel}
                onValidateEligibility={handleValidateEligibility}
                onSubmitToCommittee={handleSubmitToCommittee}
                onCancel={handleCancel}
                onOpenDecisionModal={() => setShowDecisionModal(true)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Vue Rapide : boutons pleine largeur en bas */}
      {viewMode === 'quick' && (
        <FinalDecisionCard
          reevaluation={reevaluation}
          actionLoading={actionLoading}
          actionContext={actionContext}
          canValidateEligibility={canValidateEligibility}
          canDecide={canDecide}
          canSubmitToCommittee={canSubmitToCommittee}
          canCancel={canCancel}
          onValidateEligibility={handleValidateEligibility}
          onSubmitToCommittee={handleSubmitToCommittee}
          onCancel={handleCancel}
          onOpenDecisionModal={() => setShowDecisionModal(true)}
        />
      )}

      {/* Modals / Drawers */}
      {showDecisionModal && (
        <DecisionModal
          reevaluationId={reevaluationId}
          onClose={() => setShowDecisionModal(false)}
          onSuccess={handleDecisionSuccess}
        />
      )}

      <AuditHistoryDrawer
        open={showAuditDrawer}
        onOpenChange={setShowAuditDrawer}
        auditLogs={auditLogs}
      />
    </div>
  );
}
