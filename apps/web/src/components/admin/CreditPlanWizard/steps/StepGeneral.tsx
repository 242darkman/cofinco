import type { StepComponentProps } from "../types";
import { TYPE_CREDIT_OPTIONS } from "../constants";
import { currencySymbol } from "@shared/config/currency";

export default function StepGeneral({ formData, updateField }: StepComponentProps) {
  const sym = currencySymbol();

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Nom du plan <span className="text-status-danger">*</span>
        </label>
        <input
          type="text"
          value={formData.nom}
          onChange={(e) => updateField("nom", e.target.value)}
          placeholder="Ex : Prêt Express 30J"
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">Type de crédit</label>
        <select
          value={formData.typeCredit}
          onChange={(e) => updateField("typeCredit", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          {TYPE_CREDIT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => updateField("description", e.target.value)}
          rows={3}
          placeholder="Description du plan de crédit..."
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Montant Min ({sym})
          </label>
          <input
            type="number"
            value={formData.montantMin}
            onChange={(e) => updateField("montantMin", e.target.value)}
            placeholder="Ex : 50000"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Montant Max ({sym})
          </label>
          <input
            type="number"
            value={formData.montantMax}
            onChange={(e) => updateField("montantMax", e.target.value)}
            placeholder="Ex : 5000000"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
