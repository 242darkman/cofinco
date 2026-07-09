import type { StepComponentProps } from "../types";
import {
  SEGMENT_OPTIONS,
  COLLATERAL_TYPE_OPTIONS,
  GUARANTEE_RELEASE_OPTIONS,
} from "../constants";
import { currencySymbol } from "@shared/config/currency";

export default function StepEligibility({ formData, updateField }: StepComponentProps) {
  const sym = currencySymbol();

  const toggleCollateralType = (value: string) => {
    const current = formData.collateralTypes;
    if (current.includes(value)) {
      updateField("collateralTypes", current.filter((t) => t !== value));
    } else {
      updateField("collateralTypes", [...current, value]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Éligibilité */}
      <div>
        <h4 className="text-sm font-medium text-content-primary mb-3">Critères d'éligibilité</h4>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-content-secondary mb-1">Segment minimum</label>
              <select
                value={formData.minSegment}
                onChange={(e) => updateField("minSegment", e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              >
                {SEGMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-content-secondary mb-1">Score global minimum</label>
              <input
                type="number"
                value={formData.minScoreGlobal}
                onChange={(e) => updateField("minScoreGlobal", e.target.value)}
                placeholder="Ex : 60"
                min={0}
                max={100}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-content-secondary mb-1">Points fidélité minimum</label>
              <input
                type="number"
                value={formData.minPointsFidelite}
                onChange={(e) => updateField("minPointsFidelite", e.target.value)}
                placeholder="Optionnel"
                min={0}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-content-secondary mb-1">Taux remboursement min (%)</label>
              <input
                type="number"
                step="0.01"
                value={formData.minTauxRemboursement}
                onChange={(e) => updateField("minTauxRemboursement", e.target.value)}
                placeholder="Ex : 85"
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-content-secondary mb-1">Ratio dette/revenu max</label>
              <input
                type="number"
                step="0.01"
                value={formData.maxDebtToIncomeRatio}
                onChange={(e) => updateField("maxDebtToIncomeRatio", e.target.value)}
                placeholder="Ex : 0.40"
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.kycRequired}
                  onChange={(e) => updateField("kycRequired", e.target.checked)}
                  className="rounded border-input-border"
                />
                <span className="text-sm text-content-primary">KYC requis</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.requireSavingsAccount}
                  onChange={(e) => updateField("requireSavingsAccount", e.target.checked)}
                  className="rounded border-input-border"
                />
                <span className="text-sm text-content-primary">Compte épargne requis</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Garanties */}
      <div className="border-t border-edge-subtle pt-4">
        <label className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={formData.collateralRequired}
            onChange={(e) => updateField("collateralRequired", e.target.checked)}
            className="rounded border-input-border"
          />
          <span className="text-sm font-medium text-content-primary">Garantie requise</span>
        </label>

        {formData.collateralRequired && (
          <div className="space-y-4 pl-1 border-l-2 border-accent/30 ml-2">
            <div className="pl-4 space-y-4">
              <div>
                <label className="block text-xs text-content-secondary mb-2">Types de garantie acceptés</label>
                <div className="flex flex-wrap gap-2">
                  {COLLATERAL_TYPE_OPTIONS.map((opt) => {
                    const active = formData.collateralTypes.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleCollateralType(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          active
                            ? "bg-accent text-white"
                            : "bg-surface-subtle border border-edge-subtle text-content-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-content-secondary mb-1">
                    Dépôt de garantie (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.guaranteeDepositPercent}
                    onChange={(e) => updateField("guaranteeDepositPercent", e.target.value)}
                    placeholder="Ex : 10"
                    className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-content-secondary mb-1">
                    Dépôt minimum ({sym})
                  </label>
                  <input
                    type="number"
                    value={formData.guaranteeDepositMin}
                    onChange={(e) => updateField("guaranteeDepositMin", e.target.value)}
                    placeholder="Optionnel"
                    className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-content-secondary mb-1">
                  Libération de la garantie
                </label>
                <select
                  value={formData.guaranteeReleaseRule}
                  onChange={(e) => updateField("guaranteeReleaseRule", e.target.value)}
                  className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
                >
                  {GUARANTEE_RELEASE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Gouvernance */}
      <div className="border-t border-edge-subtle pt-4">
        <h4 className="text-sm font-medium text-content-primary mb-3">Gouvernance</h4>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-content-secondary mb-1">Date d'effet</label>
              <input
                type="date"
                value={formData.effectiveFrom}
                onChange={(e) => updateField("effectiveFrom", e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-content-secondary mb-1">Date de fin</label>
              <input
                type="date"
                value={formData.effectiveTo}
                onChange={(e) => updateField("effectiveTo", e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-content-secondary mb-1">
              Conditions particulières <span className="text-content-muted">(une par ligne)</span>
            </label>
            <textarea
              value={formData.conditions}
              onChange={(e) => updateField("conditions", e.target.value)}
              rows={3}
              placeholder="Ex : Résidence dans la zone de couverture&#10;Ancienneté client > 6 mois"
              className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-content-secondary mb-1">
              Documents requis <span className="text-content-muted">(un par ligne)</span>
            </label>
            <textarea
              value={formData.documentsRequis}
              onChange={(e) => updateField("documentsRequis", e.target.value)}
              rows={3}
              placeholder="Ex : Pièce d'identité&#10;Justificatif de domicile&#10;Bulletin de salaire"
              className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
