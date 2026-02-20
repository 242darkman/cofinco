import type { StepComponentProps } from "../types";
import {
  INTEREST_METHOD_OPTIONS,
  INTEREST_RATE_PERIOD_OPTIONS,
  DAY_COUNT_OPTIONS,
  ROUNDING_MODE_OPTIONS,
  ROUNDING_UNIT_OPTIONS,
} from "../constants";

export default function StepInterest({ formData, updateField }: StepComponentProps) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Méthode d'intérêt
        </label>
        <div className="grid grid-cols-2 gap-3">
          {INTEREST_METHOD_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                formData.interestMethod === opt.value
                  ? "border-accent bg-accent/5"
                  : "border-edge-subtle bg-surface-subtle/50 hover:border-edge"
              }`}
            >
              <input
                type="radio"
                name="interestMethod"
                value={opt.value}
                checked={formData.interestMethod === opt.value}
                onChange={(e) => updateField("interestMethod", e.target.value)}
                className="text-accent"
              />
              <span className="text-sm text-content-primary">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Taux d'intérêt (%) <span className="text-status-danger">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.tauxInteret}
            onChange={(e) => updateField("tauxInteret", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">Période du taux</label>
          <select
            value={formData.interestRatePeriod}
            onChange={(e) => updateField("interestRatePeriod", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          >
            {INTEREST_RATE_PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {formData.interestMethod === "DECLINING_BALANCE" && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Convention de comptage des jours
          </label>
          <select
            value={formData.dayCountConvention}
            onChange={(e) => updateField("dayCountConvention", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          >
            {DAY_COUNT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="border-t border-edge-subtle pt-4">
        <h4 className="text-sm font-medium text-content-primary mb-3">Arrondis</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-content-secondary mb-1">Mode</label>
            <select
              value={formData.interestRoundingMode}
              onChange={(e) => updateField("interestRoundingMode", e.target.value)}
              className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
            >
              {ROUNDING_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">Unité d'arrondi</label>
            <select
              value={formData.interestRoundingUnit}
              onChange={(e) => updateField("interestRoundingUnit", e.target.value)}
              className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
            >
              {ROUNDING_UNIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
