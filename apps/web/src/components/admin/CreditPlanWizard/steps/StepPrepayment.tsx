import type { StepComponentProps } from "../types";
import { PREPAYMENT_FEE_TYPE_OPTIONS } from "../constants";

export default function StepPrepayment({ formData, updateField }: StepComponentProps) {
  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.prepaymentAllowed}
          onChange={(e) => updateField("prepaymentAllowed", e.target.checked)}
          className="rounded border-input-border"
        />
        <span className="text-sm font-medium text-content-primary">
          Autoriser le remboursement anticipé
        </span>
      </label>

      {formData.prepaymentAllowed && (
        <div className="space-y-4 pl-1 border-l-2 border-accent/30 ml-2">
          <div className="pl-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Frais de remboursement anticipé
              </label>
              <select
                value={formData.prepaymentFeeType}
                onChange={(e) => updateField("prepaymentFeeType", e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              >
                {PREPAYMENT_FEE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {formData.prepaymentFeeType !== "NONE" && (
              <div>
                <label className="block text-sm font-medium text-content-primary mb-1">
                  Valeur {formData.prepaymentFeeType.startsWith("PERCENTAGE") ? "(%)" : "(montant)"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.prepaymentFeeValue}
                  onChange={(e) => updateField("prepaymentFeeValue", e.target.value)}
                  className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
                />
              </div>
            )}

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.prepaymentInterestRebate}
                onChange={(e) => updateField("prepaymentInterestRebate", e.target.checked)}
                className="rounded border-input-border"
              />
              <span className="text-sm text-content-primary">
                Remise sur les intérêts non courus
              </span>
            </label>
          </div>
        </div>
      )}

      {!formData.prepaymentAllowed && (
        <p className="text-sm text-content-muted">
          Le remboursement anticipé est désactivé pour ce plan.
          Le client devra respecter l'échéancier complet.
        </p>
      )}
    </div>
  );
}
