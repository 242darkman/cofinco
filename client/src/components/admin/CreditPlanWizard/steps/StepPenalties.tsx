import type { StepComponentProps } from "../types";
import { LATE_FEE_TYPE_OPTIONS, PENALTY_APPLICATION_OPTIONS } from "../constants";
import { currencySymbol } from "@shared/config/currency";

export default function StepPenalties({ formData, updateField }: StepComponentProps) {
  const sym = currencySymbol();

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.lateFeeEnabled}
          onChange={(e) => updateField("lateFeeEnabled", e.target.checked)}
          className="rounded border-input-border"
        />
        <span className="text-sm font-medium text-content-primary">
          Activer les frais de retard
        </span>
      </label>

      {formData.lateFeeEnabled && (
        <div className="space-y-4 pl-1 border-l-2 border-accent/30 ml-2">
          <div className="pl-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Jours de grâce avant pénalité
              </label>
              <input
                type="number"
                value={formData.lateFeeGraceDays}
                onChange={(e) => updateField("lateFeeGraceDays", e.target.value)}
                min={0}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content-primary mb-1">
                  Type de frais
                </label>
                <select
                  value={formData.lateFeeType}
                  onChange={(e) => updateField("lateFeeType", e.target.value)}
                  className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
                >
                  {LATE_FEE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-primary mb-1">
                  Valeur {formData.lateFeeType === "PERCENTAGE" ? "(%)" : `(${sym})`}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.lateFeeValue}
                  onChange={(e) => updateField("lateFeeValue", e.target.value)}
                  className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Application de la pénalité
              </label>
              <select
                value={formData.penaltyApplication}
                onChange={(e) => updateField("penaltyApplication", e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              >
                {PENALTY_APPLICATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Plafond des pénalités ({sym})
              </label>
              <input
                type="number"
                value={formData.penaltyCap}
                onChange={(e) => updateField("penaltyCap", e.target.value)}
                placeholder="Laisser vide pour aucun plafond"
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>

            <div className="border-t border-edge-subtle pt-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.lateInterestEnabled}
                  onChange={(e) => updateField("lateInterestEnabled", e.target.checked)}
                  className="rounded border-input-border"
                />
                <span className="text-sm text-content-primary">
                  Activer les intérêts de retard
                </span>
              </label>

              {formData.lateInterestEnabled && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-content-primary mb-1">
                    Taux d'intérêt de retard (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={formData.lateInterestRate}
                    onChange={(e) => updateField("lateInterestRate", e.target.value)}
                    className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
