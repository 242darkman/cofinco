import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "../../../lib/toast";
import { ConfirmDialog } from "../../ui";

import { STEPS, TOTAL_STEPS } from "./constants";
import { useCreditPlanForm } from "./hooks/useCreditPlanForm";
import { useCreditPlanValidation } from "./hooks/useCreditPlanValidation";
import { useSchedulePreview } from "./hooks/useSchedulePreview";

import WizardStepper from "./components/WizardStepper";
import WizardFooter from "./components/WizardFooter";

import StepGeneral from "./steps/StepGeneral";
import StepDuration from "./steps/StepDuration";
import StepInterest from "./steps/StepInterest";
import StepCalendar from "./steps/StepCalendar";
import StepFees from "./steps/StepFees";
import StepPenalties from "./steps/StepPenalties";
import StepPrepayment from "./steps/StepPrepayment";
import StepEligibility from "./steps/StepEligibility";
import StepSummary from "./steps/StepSummary";

interface CreditPlanWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  editPlan?: any;
}

export default function CreditPlanWizard({ isOpen, onClose, onSave, editPlan }: CreditPlanWizardProps) {
  const isEditMode = !!editPlan;

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const { formData, fees, setFees, updateField, clearDraft, resetForm } = useCreditPlanForm(editPlan);
  const { isStepValid, isFormValid } = useCreditPlanValidation(formData);
  const { preview, loading: previewLoading, error: previewError, generatePreview } = useSchedulePreview();

  const stepProps = { formData, updateField, fees, setFees };

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
      const payload: any = {
        nom: formData.nom,
        description: formData.description || null,
        typeCredit: formData.typeCredit,
        montantMin: formData.montantMin || null,
        montantMax: formData.montantMax || null,
        dureeValeur: parseInt(formData.dureeValeur),
        dureeUnite: formData.dureeUnite,
        frequenceRemboursement: formData.frequenceRemboursement,
        tauxInteret: formData.tauxInteret,
        interestMethod: formData.interestMethod,
        interestRatePeriod: formData.interestRatePeriod,
        dayCountConvention: formData.dayCountConvention,
        interestRoundingMode: formData.interestRoundingMode,
        interestRoundingUnit: parseInt(formData.interestRoundingUnit) || 1,
        amortizationType: formData.amortizationType,
        allowPartialPayments: formData.allowPartialPayments,
        firstDueRule: formData.firstDueRule,
        gracePeriodDays: parseInt(formData.gracePeriodDays) || 0,
        preferredWeekday: formData.preferredWeekday ? parseInt(formData.preferredWeekday) : null,
        calendarMode: formData.calendarMode,
        weekdaysMask: formData.weekdaysMask,
        shiftNonWorkingDay: formData.shiftNonWorkingDay,
        holidayCalendarId: formData.holidayCalendarId || null,
        allowManualFirstDueDate: formData.allowManualFirstDueDate,
        lateFeeEnabled: formData.lateFeeEnabled,
        lateFeeGraceDays: parseInt(formData.lateFeeGraceDays) || 0,
        lateFeeType: formData.lateFeeType,
        lateFeeValue: formData.lateFeeValue || "0",
        lateInterestEnabled: formData.lateInterestEnabled,
        lateInterestRate: formData.lateInterestRate || null,
        penaltyCap: formData.penaltyCap || null,
        penaltyApplication: formData.penaltyApplication,
        prepaymentAllowed: formData.prepaymentAllowed,
        prepaymentFeeType: formData.prepaymentFeeType,
        prepaymentFeeValue: formData.prepaymentFeeValue || null,
        prepaymentInterestRebate: formData.prepaymentInterestRebate,
        minSegment: formData.minSegment || null,
        minScoreGlobal: formData.minScoreGlobal ? parseInt(formData.minScoreGlobal) : null,
        minPointsFidelite: formData.minPointsFidelite ? parseInt(formData.minPointsFidelite) : null,
        minTauxRemboursement: formData.minTauxRemboursement || null,
        kycRequired: formData.kycRequired,
        maxDebtToIncomeRatio: formData.maxDebtToIncomeRatio || null,
        requireSavingsAccount: formData.requireSavingsAccount,
        collateralRequired: formData.collateralRequired,
        collateralTypes: formData.collateralTypes.length > 0 ? formData.collateralTypes : null,
        guaranteeDepositPercent: formData.guaranteeDepositPercent || null,
        guaranteeDepositMin: formData.guaranteeDepositMin || null,
        guaranteeReleaseRule: formData.guaranteeReleaseRule,
        effectiveFrom: formData.effectiveFrom || null,
        effectiveTo: formData.effectiveTo || null,
        conditions: formData.conditions ? formData.conditions.split("\n").filter(Boolean) : null,
        documentsRequis: formData.documentsRequis ? formData.documentsRequis.split("\n").filter(Boolean) : null,
        agenceId: formData.agenceId || null,
        fees: fees
          .filter((f) => f.value)
          .map((f, i) => ({
            feeType: f.feeType,
            label: f.label || null,
            calcType: f.calcType,
            value: f.value,
            minAmount: f.minAmount || null,
            maxAmount: f.maxAmount || null,
            collectionMode: f.collectionMode,
            isRefundable: f.isRefundable,
            accountingCode: f.accountingCode || null,
            sortOrder: i,
          })),
      };

      if (isEditMode && editPlan?.version != null) {
        payload.expectedVersion = editPlan.version;
      }

      await onSave(payload);
      clearDraft();
      onClose();
      toast.success(isEditMode ? "Plan mis à jour" : "Plan créé avec succès");
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
                {isEditMode ? "Modifier le plan de crédit" : "Nouveau plan de crédit"}
              </h2>
              <button onClick={handleClose} className="p-1">
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
                  Étape {step} sur {TOTAL_STEPS}
                  {!isStepValid(step) && " · Remplissez les champs obligatoires"}
                </p>
              </div>

              {step === 1 && <StepGeneral {...stepProps} />}
              {step === 2 && <StepDuration {...stepProps} />}
              {step === 3 && <StepInterest {...stepProps} />}
              {step === 4 && <StepCalendar {...stepProps} />}
              {step === 5 && <StepFees {...stepProps} />}
              {step === 6 && <StepPenalties {...stepProps} />}
              {step === 7 && <StepPrepayment {...stepProps} />}
              {step === 8 && <StepEligibility {...stepProps} />}
              {step === 9 && (
                <StepSummary
                  {...stepProps}
                  preview={preview}
                  previewLoading={previewLoading}
                  previewError={previewError}
                  onGeneratePreview={generatePreview}
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
          ? "Vous avez des modifications non enregistrées. Voulez-vous vraiment quitter ?"
          : "Un brouillon a été sauvegardé automatiquement. Vous pourrez reprendre la saisie en rouvrant le formulaire."
        }
        variant="warning"
        confirmText="Quitter"
        cancelText="Continuer"
      />
    </>
  );
}
