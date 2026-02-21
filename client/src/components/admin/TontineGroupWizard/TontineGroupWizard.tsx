import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { toast } from "../../../lib/toast";
import { ConfirmDialog } from "../../ui";

import { STEPS, TOTAL_STEPS } from "./constants";
import { useTontineGroupForm } from "./hooks/useTontineGroupForm";
import { useTontineGroupValidation } from "./hooks/useTontineGroupValidation";
import { useSchedulePreview } from "../TontinePlanWizard/hooks/useSchedulePreview";

import WizardStepper from "./components/WizardStepper";
import WizardFooter from "./components/WizardFooter";

import StepTemplate from "./steps/StepTemplate";
import StepGeneral from "./steps/StepGeneral";
import StepLifecycle from "./steps/StepLifecycle";
import StepOverrides from "./steps/StepOverrides";
import StepMembers from "./steps/StepMembers";
import StepPayoutOrder from "./steps/StepPayoutOrder";
import StepPreview from "./steps/StepPreview";
import StepSummary from "./steps/StepSummary";

import type { Tontine } from "@shared/schema/tontines";
import type { MemberEntry } from "./types";

interface TontineGroupPayload extends Partial<Tontine> {
  members: MemberEntry[];
  payoutOrder: string[];
}

interface TontineGroupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TontineGroupPayload) => Promise<void>;
  editTontine?: Tontine;
  preSelectedPlanId?: string;
}

export default function TontineGroupWizard({ isOpen, onClose, onSave, editTontine, preSelectedPlanId }: TontineGroupWizardProps) {
  const isEditMode = !!editTontine;

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const { formData, updateField, applyPlan, clearDraft, resetForm } = useTontineGroupForm(editTontine);
  const { isStepValid, isFormValid } = useTontineGroupValidation(formData);
  const { preview, previewLoading, previewError, generatePreview } = useSchedulePreview();

  // Auto-apply plan template when launched from plan card
  useEffect(() => {
    if (preSelectedPlanId && isOpen && !isEditMode && !formData.planId) {
      import("../../../lib/api-client").then(({ tontinePlanApi }) => {
        tontinePlanApi.getById(preSelectedPlanId).then((plan: any) => {
          if (plan) applyPlan(plan);
        }).catch(() => {});
      });
    }
  }, [preSelectedPlanId, isOpen, isEditMode]);

  const stepProps = { formData, updateField };

  const handleClose = () => {
    const hasData = formData.nom.trim();
    if (hasData) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    if (isSubmitting || !isFormValid) return;
    setIsSubmitting(true);

    try {
      const payload: TontineGroupPayload & { expectedVersion?: number } = {
        nom: formData.nom,
        description: formData.description || null,
        montantCotisation: formData.montantCotisation,
        nombreMembres: parseInt(formData.nombreMembres),
        frequence: formData.frequence,
        intervalleCotisation: parseInt(formData.intervalleCotisation) || 1,
        distributionType: formData.distributionType,
        agenceId: formData.agenceId || null,
        gestionnaireId: formData.gestionnaireId || null,
        planId: formData.planId || null,

        dateDebut: formData.dateDebut ? new Date(formData.dateDebut).toISOString() : null,
        dateFin: formData.dateFin ? new Date(formData.dateFin).toISOString() : null,
        endRule: formData.endRule,
        roundCount: formData.roundCount ? parseInt(formData.roundCount) : null,
        minMembersToStart: parseInt(formData.minMembersToStart) || 3,

        // Config fields (overridden or inherited)
        firstContributionRule: formData.firstContributionRule,
        gracePeriodContribution: parseInt(formData.gracePeriodContribution) || 0,
        collectionCalendarMode: formData.collectionCalendarMode,
        weekdaysMask: formData.weekdaysMask,
        shiftNonWorkingDay: formData.shiftNonWorkingDay,
        holidayCalendarId: formData.holidayCalendarId || null,
        timezone: formData.timezone,
        preferredWeekday: formData.preferredWeekday ? parseInt(formData.preferredWeekday) : null,

        payoutFrequency: formData.payoutFrequency,
        payoutDayRule: formData.payoutDayRule || null,
        payoutOrderMode: formData.payoutOrderMode,
        allowSwapPayoutOrder: formData.allowSwapPayoutOrder,
        swapRequiresApproval: formData.swapRequiresApproval,
        payoutRequiresContribPaid: formData.payoutRequiresContribPaid,
        allowPartialDistribution: formData.allowPartialDistribution,
        distributionMinThresholdPct: formData.distributionMinThresholdPct || "50",

        penaltyEnabled: formData.penaltyEnabled,
        penaltyType: formData.penaltyType,
        penaltyValue: formData.penaltyValue || "0",
        penaltyApplication: formData.penaltyApplication,
        penaltyCap: formData.penaltyCap || null,
        lateGracePeriodDays: parseInt(formData.lateGracePeriodDays) || 0,
        maxMissedContributions: parseInt(formData.maxMissedContributions) || 0,
        arrearsPolicy: formData.arrearsPolicy,
        suspensionPolicy: formData.suspensionPolicy,
        defaultPolicy: formData.defaultPolicy,
        maxLateBeforeSuspend: parseInt(formData.maxLateBeforeSuspend) || 3,
        maxLateBeforeExclude: parseInt(formData.maxLateBeforeExclude) || 5,
        penaltyDeductedFromPayout: formData.penaltyDeductedFromPayout,
        penaltyAsRevenue: formData.penaltyAsRevenue,
        autoPenaltyPriority: formData.autoPenaltyPriority,

        joinFeeEnabled: formData.joinFeeEnabled,
        joinFeeAmount: formData.joinFeeAmount || "0",
        exitAllowed: formData.exitAllowed,
        exitFeePercent: formData.exitFeePercent || "0",
        exitNoticePeriods: parseInt(formData.exitNoticePeriods) || 0,
        replacementAllowed: formData.replacementAllowed,
        transferMembershipAllowed: formData.transferMembershipAllowed,
        allowMidCycleJoin: formData.allowMidCycleJoin,

        allowedPaymentMethods: formData.allowedPaymentMethods,
        defaultPaymentMethod: formData.defaultPaymentMethod,
        cashMustGoToCaisse: formData.cashMustGoToCaisse,
        tauxPlateforme: formData.tauxPlateforme || "0",
        feeCollectionMode: formData.feeCollectionMode,
        maxAdvanceTours: parseInt(formData.maxAdvanceTours) || 3,

        rolesEnabled: formData.rolesEnabled,
        groupRoles: formData.groupRoles,
        approvalsRequiredFor: formData.approvalsRequiredFor,
        minKycLevel: formData.minKycLevel,
        minSegmentRequired: formData.minSegmentRequired || null,

        // Members & order
        members: formData.members,
        payoutOrder: formData.payoutOrder,
      };

      // A5: Optimistic locking — send expectedVersion when editing
      if (isEditMode && editTontine?.version != null) {
        payload.expectedVersion = editTontine.version;
      }

      await onSave(payload);
      clearDraft();
      onClose();
      toast.success(isEditMode ? "Tontine mise a jour" : "Tontine creee avec succes");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erreur lors de l'enregistrement");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const animClass =
    direction === "forward"
      ? "animate-in slide-in-from-right fade-in duration-300"
      : "animate-in slide-in-from-left fade-in duration-300";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] bg-surface-base border border-edge rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header + Stepper */}
          <div className="bg-surface-base border-b border-edge px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg sm:text-xl font-bold text-content-primary">
                {isEditMode ? "Modifier la tontine" : "Nouvelle tontine"}
              </h2>
              <button onClick={handleClose} className="p-1" aria-label="Fermer">
                <X className="text-content-muted hover:text-content-primary w-5 h-5" />
              </button>
            </div>
            <WizardStepper currentStep={step} onGoToStep={(n) => {
              setDirection(n > step ? "forward" : "backward");
              setStep(n);
            }} />
          </div>

          {/* Body */}
          <div className="wizard-form flex-1 overflow-y-auto px-4 sm:px-6 py-5">
            <div key={step} className={animClass}>
              <div className="mb-5">
                <h3 className="text-sm font-bold text-content-primary">
                  {STEPS[step - 1]?.label}
                </h3>
                <p className="text-[10px] text-content-muted">
                  Etape {step} sur {TOTAL_STEPS}
                  {!isStepValid(step) && " · Remplissez les champs obligatoires"}
                </p>
              </div>

              {step === 1 && <StepTemplate {...stepProps} onApplyPlan={applyPlan} />}
              {step === 2 && <StepGeneral {...stepProps} />}
              {step === 3 && <StepLifecycle {...stepProps} />}
              {step === 4 && <StepOverrides {...stepProps} />}
              {step === 5 && <StepMembers {...stepProps} />}
              {step === 6 && <StepPayoutOrder {...stepProps} />}
              {step === 7 && (
                <StepPreview
                  {...stepProps}
                  preview={preview}
                  previewLoading={previewLoading}
                  previewError={previewError}
                  onGeneratePreview={() => generatePreview(formData as any)}
                />
              )}
              {step === 8 && <StepSummary {...stepProps} />}
            </div>
          </div>

          {/* Footer */}
          <WizardFooter
            step={step}
            setStep={setStep}
            setDirection={setDirection}
            isStepValid={isStepValid}
            isFormValid={isFormValid}
            isSubmitting={isSubmitting}
            onSave={handleSave}
            onCancel={handleClose}
            isEditMode={isEditMode}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={() => {
          clearDraft();
          resetForm();
          setShowCloseConfirm(false);
          onClose();
        }}
        title="Quitter la saisie ?"
        message={isEditMode
          ? "Vous avez des modifications non enregistrees. Voulez-vous vraiment quitter ?"
          : "Un brouillon a ete sauvegarde automatiquement. Vous pourrez reprendre la saisie en rouvrant le formulaire."
        }
        variant="warning"
        confirmText="Quitter"
        cancelText="Continuer"
      />
    </>
  );
}
