import type { ReactNode } from "react";
import type { StepComponentProps } from "../types";
import type { SchedulePreview } from "../hooks/useSchedulePreview";
import { Loader2, CalendarDays } from "lucide-react";
import { currencySymbol } from "@shared/config/currency";
import {
  FREQUENCE_OPTIONS,
  DISTRIBUTION_TYPE_OPTIONS,
  FIRST_CONTRIBUTION_RULE_OPTIONS,
  CALENDAR_MODE_OPTIONS,
  PAYOUT_FREQUENCY_OPTIONS,
  PAYOUT_ORDER_MODE_OPTIONS,
  PENALTY_TYPE_OPTIONS,
  PENALTY_APPLICATION_OPTIONS,
  ARREARS_POLICY_OPTIONS,
  SUSPENSION_POLICY_OPTIONS,
  DEFAULT_POLICY_OPTIONS,
  FEE_COLLECTION_MODE_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  KYC_LEVEL_OPTIONS,
  SEGMENT_OPTIONS,
} from "../constants";

interface StepSummaryProps extends StepComponentProps {
  preview: SchedulePreview | null;
  previewLoading: boolean;
  previewError: string | null;
  onGeneratePreview: () => void;
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
  preview,
  previewLoading,
  previewError,
  onGeneratePreview,
}: StepSummaryProps) {
  const sym = currencySymbol();

  return (
    <div className="space-y-4">
      {/* General */}
      <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
        <h4 className="text-sm font-semibold text-content-primary mb-2">Informations generales</h4>
        <SummaryRow label="Nom" value={formData.nom} />
        <SummaryRow label="Description" value={formData.description} />
        <SummaryRow label={`Cotisation (${sym})`} value={formData.montantCotisation} />
        <SummaryRow label="Membres" value={formData.nombreMembres} />
        <SummaryRow label="Frequence" value={findLabel(FREQUENCE_OPTIONS, formData.frequence)} />
        {formData.intervalleCotisation !== "1" && (
          <SummaryRow label="Intervalle" value={`x${formData.intervalleCotisation}`} />
        )}
        <SummaryRow label="Distribution" value={findLabel(DISTRIBUTION_TYPE_OPTIONS, formData.distributionType)} />
      </div>

      {/* Calendar & Distribution */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Calendrier</h4>
          <SummaryRow label="1ere cotisation" value={findLabel(FIRST_CONTRIBUTION_RULE_OPTIONS, formData.firstContributionRule)} />
          <SummaryRow label="Calendrier" value={findLabel(CALENDAR_MODE_OPTIONS, formData.collectionCalendarMode)} />
          <SummaryRow label="Fuseau" value={formData.timezone} />
        </div>

        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Distribution</h4>
          <SummaryRow label="Frequence" value={findLabel(PAYOUT_FREQUENCY_OPTIONS, formData.payoutFrequency)} />
          <SummaryRow label="Ordre" value={findLabel(PAYOUT_ORDER_MODE_OPTIONS, formData.payoutOrderMode)} />
          <SummaryRow label="Echange" value={formData.allowSwapPayoutOrder ? "Oui" : "Non"} />
          <SummaryRow label="Partielle" value={formData.allowPartialDistribution ? `Oui (min ${formData.distributionMinThresholdPct}%)` : "Non"} />
        </div>
      </div>

      {/* Penalties & Entry/Exit */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Penalites</h4>
          {formData.penaltyEnabled ? (
            <>
              <SummaryRow
                label="Montant"
                value={
                  formData.penaltyType === "PERCENT"
                    ? `${formData.penaltyValue}%`
                    : `${formData.penaltyValue} ${sym}`
                }
              />
              <SummaryRow label="Application" value={findLabel(PENALTY_APPLICATION_OPTIONS, formData.penaltyApplication)} />
              <SummaryRow label="Grace" value={`${formData.lateGracePeriodDays} jours`} />
              <SummaryRow label="Arrieres" value={findLabel(ARREARS_POLICY_OPTIONS, formData.arrearsPolicy)} />
              <SummaryRow label="Suspension" value={findLabel(SUSPENSION_POLICY_OPTIONS, formData.suspensionPolicy)} />
              <SummaryRow label="Defaut" value={findLabel(DEFAULT_POLICY_OPTIONS, formData.defaultPolicy)} />
            </>
          ) : (
            <span className="text-xs text-content-muted">Desactivees</span>
          )}
        </div>

        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Adhesion & Sortie</h4>
          <SummaryRow label="Frais adhesion" value={formData.joinFeeEnabled ? `${formData.joinFeeAmount} ${sym}` : "Non"} />
          <SummaryRow label="Sortie" value={formData.exitAllowed ? "Autorisee" : "Interdite"} />
          {formData.exitAllowed && formData.exitFeePercent !== "0" && (
            <SummaryRow label="Frais sortie" value={`${formData.exitFeePercent}%`} />
          )}
          <SummaryRow label="Remplacement" value={formData.replacementAllowed ? "Oui" : "Non"} />
          <SummaryRow label="Adhesion mi-cycle" value={formData.allowMidCycleJoin ? "Oui" : "Non"} />
        </div>
      </div>

      {/* Payment & Governance */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Paiement</h4>
          <SummaryRow
            label="Methodes"
            value={formData.allowedPaymentMethods
              .map((m) => findLabel(PAYMENT_METHOD_OPTIONS, m))
              .join(", ")}
          />
          <SummaryRow label="Defaut" value={findLabel(PAYMENT_METHOD_OPTIONS, formData.defaultPaymentMethod)} />
          {formData.tauxPlateforme !== "0" && (
            <SummaryRow label="Commission" value={`${formData.tauxPlateforme}%`} />
          )}
          <SummaryRow label="Collecte frais" value={findLabel(FEE_COLLECTION_MODE_OPTIONS, formData.feeCollectionMode)} />
          <SummaryRow label="Avance max" value={`${formData.maxAdvanceTours} tours`} />
        </div>

        <div className="bg-surface-subtle rounded-lg p-4 space-y-1">
          <h4 className="text-xs font-semibold text-content-secondary mb-2">Gouvernance</h4>
          <SummaryRow label="Roles" value={formData.rolesEnabled ? "Actifs" : "Desactives"} />
          {formData.rolesEnabled && (
            <SummaryRow label="Roles definis" value={formData.groupRoles.join(", ")} />
          )}
          <SummaryRow label="KYC" value={findLabel(KYC_LEVEL_OPTIONS, formData.minKycLevel)} />
          {formData.minSegmentRequired && (
            <SummaryRow label="Segment min" value={findLabel(SEGMENT_OPTIONS, formData.minSegmentRequired)} />
          )}
        </div>
      </div>

      {/* Schedule Preview */}
      <div className="border-t border-edge-subtle pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-content-primary">Apercu du calendrier</h4>
          <button
            type="button"
            onClick={onGeneratePreview}
            disabled={previewLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {previewLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CalendarDays className="w-3.5 h-3.5" />
            )}
            Generer
          </button>
        </div>

        {previewError && (
          <p className="text-xs text-status-danger bg-status-danger-bg px-3 py-2 rounded-lg">{previewError}</p>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="flex gap-4 text-xs text-content-secondary">
              <span>{preview.totalPeriods} periodes</span>
              <span>{preview.totalRounds} tours</span>
              <span>Fin : {preview.cycleEndDate}</span>
            </div>

            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-base">
                  <tr className="text-left text-content-muted border-b border-edge-subtle">
                    <th className="pb-1.5 pr-2">#</th>
                    <th className="pb-1.5 pr-2">Cotisation</th>
                    <th className="pb-1.5">Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.contributions.map((c, i) => {
                    const payout = preview.payouts.find((p) => p.periodNumber === c.periodNumber);
                    return (
                      <tr key={i} className="border-b border-edge-subtle/50">
                        <td className="py-1.5 pr-2 text-content-muted">{c.periodNumber}</td>
                        <td className="py-1.5 pr-2 text-content-primary">{c.dueDate}</td>
                        <td className="py-1.5 text-content-primary">{payout?.dueDate ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!preview && !previewError && !previewLoading && (
          <p className="text-xs text-content-muted">Cliquez sur "Generer" pour voir un apercu du calendrier de cotisations et distributions.</p>
        )}
      </div>
    </div>
  );
}
