import type { ReactNode } from "react";
import type { StepComponentProps } from "../types";
import type { PreviewResult } from "../hooks/useSchedulePreview";
import SchedulePreview from "../components/SchedulePreview";
import {
  TYPE_CREDIT_OPTIONS,
  DUREE_UNITE_OPTIONS,
  FREQUENCE_OPTIONS,
  AMORTIZATION_OPTIONS,
  INTEREST_METHOD_OPTIONS,
  INTEREST_RATE_PERIOD_OPTIONS,
  FIRST_DUE_RULE_OPTIONS,
  CALENDAR_MODE_OPTIONS,
  FEE_TYPE_OPTIONS,
  PENALTY_APPLICATION_OPTIONS,
  PREPAYMENT_FEE_TYPE_OPTIONS,
  GUARANTEE_RELEASE_OPTIONS,
  COLLATERAL_TYPE_OPTIONS,
} from "../constants";
import { currencySymbol } from "@shared/config/currency";

interface StepSummaryProps extends StepComponentProps {
  preview: PreviewResult | null;
  previewLoading: boolean;
  previewError: string | null;
  onGeneratePreview: (
    formData: StepComponentProps["formData"],
    fees: StepComponentProps["fees"],
    principal: string,
    disbursementDate: string,
  ) => Promise<void>;
}

function findLabel(options: { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between py-1">
      <span className="text-xs text-content-secondary">{label}</span>
      <span className="text-xs font-medium text-content-primary">{value}</span>
    </div>
  );
}

export default function StepSummary({
  formData,
  fees,
  preview,
  previewLoading,
  previewError,
  onGeneratePreview,
}: StepSummaryProps) {
  const sym = currencySymbol();

  return (
    <div className="space-y-5">
      {/* Plan info */}
      <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
        <h4 className="text-sm font-semibold text-content-primary mb-2">Informations générales</h4>
        <SummaryRow label="Nom" value={formData.nom} />
        <SummaryRow label="Type" value={findLabel(TYPE_CREDIT_OPTIONS, formData.typeCredit)} />
        <SummaryRow label="Description" value={formData.description} />
        {formData.montantMin && <SummaryRow label={`Montant min (${sym})`} value={formData.montantMin} />}
        {formData.montantMax && <SummaryRow label={`Montant max (${sym})`} value={formData.montantMax} />}
      </div>

      {/* Duration & Interest */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Durée & Remboursement</h4>
          <SummaryRow
            label="Durée"
            value={`${formData.dureeValeur} ${findLabel(DUREE_UNITE_OPTIONS, formData.dureeUnite).toLowerCase()}`}
          />
          <SummaryRow label="Fréquence" value={findLabel(FREQUENCE_OPTIONS, formData.frequenceRemboursement)} />
          <SummaryRow label="Amortissement" value={findLabel(AMORTIZATION_OPTIONS, formData.amortizationType)} />
          <SummaryRow label="Paiements partiels" value={formData.allowPartialPayments ? "Oui" : "Non"} />
        </div>

        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Intérêts</h4>
          <SummaryRow label="Méthode" value={findLabel(INTEREST_METHOD_OPTIONS, formData.interestMethod)} />
          <SummaryRow label="Taux" value={`${formData.tauxInteret}%`} />
          <SummaryRow label="Période" value={findLabel(INTEREST_RATE_PERIOD_OPTIONS, formData.interestRatePeriod)} />
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
        <h4 className="text-xs font-semibold text-content-secondary mb-2">Première Échéance & Calendrier</h4>
        <SummaryRow label="Règle" value={findLabel(FIRST_DUE_RULE_OPTIONS, formData.firstDueRule)} />
        <SummaryRow label="Calendrier" value={findLabel(CALENDAR_MODE_OPTIONS, formData.calendarMode)} />
        {formData.firstDueRule === "AFTER_N_DAYS" && (
          <SummaryRow label="Jours de grâce" value={formData.gracePeriodDays} />
        )}
      </div>

      {/* Fees */}
      {fees.length > 0 && (
        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">
            Frais ({fees.length})
          </h4>
          {fees.map((fee, i) => (
            <SummaryRow
              key={i}
              label={fee.label || findLabel(FEE_TYPE_OPTIONS, fee.feeType)}
              value={
                fee.calcType === "PERCENTAGE"
                  ? `${fee.value}%`
                  : `${fee.value} ${sym}`
              }
            />
          ))}
        </div>
      )}

      {/* Penalties & Prepayment */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Pénalités</h4>
          <SummaryRow label="Frais de retard" value={formData.lateFeeEnabled ? "Actif" : "Désactivé"} />
          {formData.lateFeeEnabled && (
            <>
              <SummaryRow
                label="Montant"
                value={
                  formData.lateFeeType === "PERCENTAGE"
                    ? `${formData.lateFeeValue}%`
                    : `${formData.lateFeeValue} ${sym}`
                }
              />
              <SummaryRow label="Application" value={findLabel(PENALTY_APPLICATION_OPTIONS, formData.penaltyApplication)} />
            </>
          )}
        </div>

        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Remboursement anticipé</h4>
          <SummaryRow label="Autorisé" value={formData.prepaymentAllowed ? "Oui" : "Non"} />
          {formData.prepaymentAllowed && formData.prepaymentFeeType !== "NONE" && (
            <SummaryRow
              label="Frais"
              value={`${formData.prepaymentFeeValue} (${findLabel(PREPAYMENT_FEE_TYPE_OPTIONS, formData.prepaymentFeeType)})`}
            />
          )}
        </div>
      </div>

      {/* Eligibility */}
      {(formData.minSegment || formData.minScoreGlobal || formData.kycRequired || formData.collateralRequired) && (
        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Éligibilité & Garanties</h4>
          {formData.minSegment && <SummaryRow label="Segment min" value={formData.minSegment} />}
          {formData.minScoreGlobal && <SummaryRow label="Score min" value={formData.minScoreGlobal} />}
          {formData.kycRequired && <SummaryRow label="KYC" value="Requis" />}
          {formData.collateralRequired && (
            <>
              <SummaryRow label="Garantie" value="Requise" />
              {formData.collateralTypes.length > 0 && (
                <SummaryRow
                  label="Types"
                  value={formData.collateralTypes
                    .map((t) => findLabel(COLLATERAL_TYPE_OPTIONS, t))
                    .join(", ")}
                />
              )}
              {formData.guaranteeDepositPercent && (
                <SummaryRow label="Dépôt garantie" value={`${formData.guaranteeDepositPercent}%`} />
              )}
              <SummaryRow label="Libération" value={findLabel(GUARANTEE_RELEASE_OPTIONS, formData.guaranteeReleaseRule)} />
            </>
          )}
        </div>
      )}

      {/* Schedule Preview */}
      <div className="border-t border-edge-subtle pt-4">
        <h4 className="text-sm font-medium text-content-primary mb-3">Aperçu de l'échéancier</h4>
        <SchedulePreview
          formData={formData}
          fees={fees}
          preview={preview}
          loading={previewLoading}
          error={previewError}
          onGenerate={onGeneratePreview}
        />
      </div>
    </div>
  );
}
