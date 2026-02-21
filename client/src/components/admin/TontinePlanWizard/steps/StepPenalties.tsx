import type { StepComponentProps } from "../types";
import {
  PENALTY_TYPE_OPTIONS,
  PENALTY_APPLICATION_OPTIONS,
  ARREARS_POLICY_OPTIONS,
  SUSPENSION_POLICY_OPTIONS,
  DEFAULT_POLICY_OPTIONS,
} from "../constants";
import { currencySymbol } from "@shared/config/currency";

export default function StepPenalties({ formData, updateField }: StepComponentProps) {
  const sym = currencySymbol();

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.penaltyEnabled}
          onChange={(e) => updateField("penaltyEnabled", e.target.checked)}
          className="accent-accent"
        />
        <span className="text-sm font-medium text-content-primary">Activer les penalites de retard</span>
      </label>

      {formData.penaltyEnabled && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">Type</label>
              <select
                value={formData.penaltyType}
                onChange={(e) => updateField("penaltyType", e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              >
                {PENALTY_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Valeur {formData.penaltyType === "PERCENT" ? "(%)" : `(${sym})`}
              </label>
              <input
                type="number"
                value={formData.penaltyValue}
                onChange={(e) => updateField("penaltyValue", e.target.value)}
                min="0"
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">Application</label>
              <select
                value={formData.penaltyApplication}
                onChange={(e) => updateField("penaltyApplication", e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              >
                {PENALTY_APPLICATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Plafond ({sym})
              </label>
              <input
                type="number"
                value={formData.penaltyCap}
                onChange={(e) => updateField("penaltyCap", e.target.value)}
                min="0"
                placeholder="Aucun plafond"
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Jours de grace
              </label>
              <input
                type="number"
                value={formData.lateGracePeriodDays}
                onChange={(e) => updateField("lateGracePeriodDays", e.target.value)}
                min="0"
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Max cotisations manquees
              </label>
              <input
                type="number"
                value={formData.maxMissedContributions}
                onChange={(e) => updateField("maxMissedContributions", e.target.value)}
                min="0"
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
              <p className="text-[10px] text-content-muted mt-1">0 = illimite</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">
              Politique d'arrieres
            </label>
            <select
              value={formData.arrearsPolicy}
              onChange={(e) => updateField("arrearsPolicy", e.target.value)}
              className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
            >
              {ARREARS_POLICY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Politique de suspension
              </label>
              <select
                value={formData.suspensionPolicy}
                onChange={(e) => updateField("suspensionPolicy", e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              >
                {SUSPENSION_POLICY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Politique de defaut
              </label>
              <select
                value={formData.defaultPolicy}
                onChange={(e) => updateField("defaultPolicy", e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              >
                {DEFAULT_POLICY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Retards avant suspension
              </label>
              <input
                type="number"
                value={formData.maxLateBeforeSuspend}
                onChange={(e) => updateField("maxLateBeforeSuspend", e.target.value)}
                min="1"
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Retards avant exclusion
              </label>
              <input
                type="number"
                value={formData.maxLateBeforeExclude}
                onChange={(e) => updateField("maxLateBeforeExclude", e.target.value)}
                min="1"
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.penaltyDeductedFromPayout}
                onChange={(e) => updateField("penaltyDeductedFromPayout", e.target.checked)}
                className="accent-accent"
              />
              <span className="text-sm text-content-primary">Deduire la penalite de la distribution</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.penaltyAsRevenue}
                onChange={(e) => updateField("penaltyAsRevenue", e.target.checked)}
                className="accent-accent"
              />
              <span className="text-sm text-content-primary">Comptabiliser comme revenu de la plateforme</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.autoPenaltyPriority}
                onChange={(e) => updateField("autoPenaltyPriority", e.target.checked)}
                className="accent-accent"
              />
              <span className="text-sm text-content-primary">Appliquer automatiquement les penalites en priorite</span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
