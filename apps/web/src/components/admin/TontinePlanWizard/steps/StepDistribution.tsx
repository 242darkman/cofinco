import type { StepComponentProps } from "../types";
import {
  PAYOUT_FREQUENCY_OPTIONS,
  PAYOUT_ORDER_MODE_OPTIONS,
} from "../constants";

export default function StepDistribution({ formData, updateField }: StepComponentProps) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Frequence des distributions
        </label>
        <select
          value={formData.payoutFrequency}
          onChange={(e) => updateField("payoutFrequency", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          {PAYOUT_FREQUENCY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {formData.payoutFrequency === "CUSTOM" && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Regle de jour de distribution
          </label>
          <input
            type="text"
            value={formData.payoutDayRule}
            onChange={(e) => updateField("payoutDayRule", e.target.value)}
            placeholder="Ex : LAST_DAY_OF_MONTH"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Ordre de distribution
        </label>
        <select
          value={formData.payoutOrderMode}
          onChange={(e) => updateField("payoutOrderMode", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          {PAYOUT_ORDER_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.allowSwapPayoutOrder}
            onChange={(e) => updateField("allowSwapPayoutOrder", e.target.checked)}
            className="accent-accent"
          />
          <span className="text-sm text-content-primary">Autoriser l'echange de tours entre membres</span>
        </label>

        {formData.allowSwapPayoutOrder && (
          <label className="flex items-center gap-3 cursor-pointer ml-6">
            <input
              type="checkbox"
              checked={formData.swapRequiresApproval}
              onChange={(e) => updateField("swapRequiresApproval", e.target.checked)}
              className="accent-accent"
            />
            <span className="text-sm text-content-secondary">L'echange necessite une approbation</span>
          </label>
        )}
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.payoutRequiresContribPaid}
          onChange={(e) => updateField("payoutRequiresContribPaid", e.target.checked)}
          className="accent-accent"
        />
        <span className="text-sm text-content-primary">La cotisation doit etre payee pour recevoir la distribution</span>
      </label>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.allowPartialDistribution}
          onChange={(e) => updateField("allowPartialDistribution", e.target.checked)}
          className="accent-accent"
        />
        <span className="text-sm text-content-primary">Autoriser les distributions partielles</span>
      </label>

      {formData.allowPartialDistribution && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Seuil minimum de distribution (%)
          </label>
          <input
            type="number"
            value={formData.distributionMinThresholdPct}
            onChange={(e) => updateField("distributionMinThresholdPct", e.target.value)}
            min="0"
            max="100"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
          <p className="text-[10px] text-content-muted mt-1">
            Pourcentage minimum de cotisations collectees pour distribuer
          </p>
        </div>
      )}
    </div>
  );
}
