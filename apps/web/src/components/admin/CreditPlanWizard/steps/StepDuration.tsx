import type { StepComponentProps } from "../types";
import { DUREE_UNITE_OPTIONS, FREQUENCE_OPTIONS, AMORTIZATION_OPTIONS } from "../constants";

export default function StepDuration({ formData, updateField }: StepComponentProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Durée <span className="text-status-danger">*</span>
          </label>
          <input
            type="number"
            value={formData.dureeValeur}
            onChange={(e) => updateField("dureeValeur", e.target.value)}
            min={1}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Unité <span className="text-status-danger">*</span>
          </label>
          <select
            value={formData.dureeUnite}
            onChange={(e) => updateField("dureeUnite", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          >
            {DUREE_UNITE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Fréquence de remboursement <span className="text-status-danger">*</span>
        </label>
        <select
          value={formData.frequenceRemboursement}
          onChange={(e) => updateField("frequenceRemboursement", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          {FREQUENCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">Type d'amortissement</label>
        <div className="space-y-2">
          {AMORTIZATION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                formData.amortizationType === opt.value
                  ? "border-accent bg-accent/5"
                  : "border-edge-subtle bg-surface-subtle/50 hover:border-edge"
              }`}
            >
              <input
                type="radio"
                name="amortizationType"
                value={opt.value}
                checked={formData.amortizationType === opt.value}
                onChange={(e) => updateField("amortizationType", e.target.value)}
                className="text-accent mt-0.5"
              />
              <div>
                <span className="text-sm text-content-primary">{opt.label}</span>
                {opt.description && (
                  <p className="text-[10px] text-content-muted mt-0.5">{opt.description}</p>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.allowPartialPayments}
          onChange={(e) => updateField("allowPartialPayments", e.target.checked)}
          className="rounded border-input-border"
        />
        <span className="text-sm text-content-primary">Autoriser les paiements partiels</span>
      </label>
    </div>
  );
}
