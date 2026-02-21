import type { StepComponentProps } from "../types";
import { PAYMENT_METHOD_OPTIONS, FEE_COLLECTION_MODE_OPTIONS } from "../constants";

export default function StepPayment({ formData, updateField }: StepComponentProps) {
  const togglePaymentMethod = (method: string) => {
    const current = formData.allowedPaymentMethods;
    const next = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];
    if (next.length === 0) return; // at least one method
    updateField("allowedPaymentMethods", next);
    // If default method was removed, reset to first available
    if (!next.includes(formData.defaultPaymentMethod)) {
      updateField("defaultPaymentMethod", next[0]);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-content-primary mb-2">
          Methodes de paiement autorisees
        </label>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => togglePaymentMethod(o.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                formData.allowedPaymentMethods.includes(o.value)
                  ? "bg-accent text-white"
                  : "bg-surface-subtle border border-edge-subtle text-content-muted hover:border-edge"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Methode par defaut
        </label>
        <select
          value={formData.defaultPaymentMethod}
          onChange={(e) => updateField("defaultPaymentMethod", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          {PAYMENT_METHOD_OPTIONS.filter((o) =>
            formData.allowedPaymentMethods.includes(o.value)
          ).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.cashMustGoToCaisse}
          onChange={(e) => updateField("cashMustGoToCaisse", e.target.checked)}
          className="accent-accent"
        />
        <span className="text-sm text-content-primary">Les especes doivent transiter par la caisse</span>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Commission plateforme (%)
          </label>
          <input
            type="number"
            value={formData.tauxPlateforme}
            onChange={(e) => updateField("tauxPlateforme", e.target.value)}
            min="0"
            max="100"
            step="0.1"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Max tours d'avance
          </label>
          <input
            type="number"
            value={formData.maxAdvanceTours}
            onChange={(e) => updateField("maxAdvanceTours", e.target.value)}
            min="0"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
          <p className="text-[10px] text-content-muted mt-1">Nombre max de cotisations payees d'avance</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Moment de collecte des frais
        </label>
        <select
          value={formData.feeCollectionMode}
          onChange={(e) => updateField("feeCollectionMode", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          {FEE_COLLECTION_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
