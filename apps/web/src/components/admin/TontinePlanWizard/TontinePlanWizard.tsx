import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "../../../lib/toast";
import { ConfirmDialog } from "../../ui";

import { STEPS, TOTAL_STEPS } from "./constants";
import { useTontinePlanForm } from "./hooks/useTontinePlanForm";
import { useTontinePlanValidation } from "./hooks/useTontinePlanValidation";
import { useSchedulePreview } from "./hooks/useSchedulePreview";

import WizardStepper from "./components/WizardStepper";
import WizardFooter from "./components/WizardFooter";

import StepGeneral from "./steps/StepGeneral";
import StepCalendar from "./steps/StepCalendar";
import StepDistribution from "./steps/StepDistribution";
import StepPenalties from "./steps/StepPenalties";
import StepEntryExit from "./steps/StepEntryExit";
import StepPayment from "./steps/StepPayment";
import StepGovernance from "./steps/StepGovernance";
import StepSummary from "./steps/StepSummary";

import type { TontinePlan } from "@shared/schema/tontines";

interface TontinePlanWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<TontinePlan>) => Promise<void>;
  editPlan?: TontinePlan;
}

export default function TontinePlanWizard({ isOpen, onClose, onSave, editPlan }: TontinePlanWizardProps) {
  const isEditMode = !!editPlan;

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const { formData, updateField, clearDraft, resetForm } = useTontinePlanForm(editPlan);
  const { isStepValid, isFormValid } = useTontinePlanValidation(formData);
  const { preview, previewLoading, previewError, generatePreview } = useSchedulePreview();

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
      const payload: Partial<TontinePlan> & { expectedVersion?: number } = {
        actif: formData.actif,
        nom: formData.nom,
        description: formData.description || null,
        montantCotisation: formData.montantCotisation,
        nombreMembres: parseInt(formData.nombreMembres),
        frequence: formData.frequence,
        intervalleCotisation: parseInt(formData.intervalleCotisation) || 1,
        distributionType: formData.distributionType,

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

        agenceId: formData.agenceId || null,
      };

      if (isEditMode && (editPlan as any)?.version != null) {
        (payload as any).expectedVersion = (editPlan as any).version;
      }

      await onSave(payload);
      clearDraft();
      onClose();
      toast.success(isEditMode ? "Modele mis a jour" : "Modele cree avec succes");
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
                {isEditMode ? "Modifier le modele de tontine" : "Nouveau modele de tontine"}
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

              {step === 1 && <StepGeneral {...stepProps} />}
              {step === 2 && <StepCalendar {...stepProps} />}
              {step === 3 && <StepDistribution {...stepProps} />}
              {step === 4 && <StepPenalties {...stepProps} />}
              {step === 5 && <StepEntryExit {...stepProps} />}
              {step === 6 && <StepPayment {...stepProps} />}
              {step === 7 && <StepGovernance {...stepProps} />}
              {step === 8 && (
                <StepSummary
                  {...stepProps}
                  preview={preview}
                  previewLoading={previewLoading}
                  previewError={previewError}
                  onGeneratePreview={() => generatePreview(formData)}
                />
              )}
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
