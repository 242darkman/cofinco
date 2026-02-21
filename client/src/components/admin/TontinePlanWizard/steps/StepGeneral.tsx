import type { StepComponentProps } from "../types";
import { FREQUENCE_OPTIONS, DISTRIBUTION_TYPE_OPTIONS } from "../constants";
import { currencySymbol } from "@shared/config/currency";

export default function StepGeneral({ formData, updateField }: StepComponentProps) {
  const sym = currencySymbol();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between p-3 rounded-lg border border-input-border bg-input">
        <div>
          <span className="text-sm font-medium text-content-primary">Modele actif</span>
          <p className="text-[10px] text-content-muted">Les modeles inactifs ne sont pas proposables lors de la creation de tontine</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={formData.actif}
          onClick={() => updateField("actif", !formData.actif)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            formData.actif ? "bg-status-success" : "bg-content-muted/30"
          }`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            formData.actif ? "translate-x-4" : "translate-x-0.5"
          }`} />
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Nom du modele <span className="text-status-danger">*</span>
        </label>
        <input
          type="text"
          value={formData.nom}
          onChange={(e) => updateField("nom", e.target.value)}
          placeholder="Ex : Tontine Hebdo 10K"
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => updateField("description", e.target.value)}
          rows={2}
          placeholder="Description du modele de tontine..."
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Montant cotisation ({sym}) <span className="text-status-danger">*</span>
          </label>
          <input
            type="number"
            value={formData.montantCotisation}
            onChange={(e) => updateField("montantCotisation", e.target.value)}
            placeholder="Ex : 10000"
            min="0"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Nombre de membres <span className="text-status-danger">*</span>
          </label>
          <input
            type="number"
            value={formData.nombreMembres}
            onChange={(e) => updateField("nombreMembres", e.target.value)}
            placeholder="Ex : 10"
            min="2"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">Frequence</label>
          <select
            value={formData.frequence}
            onChange={(e) => updateField("frequence", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          >
            {FREQUENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">Intervalle</label>
          <input
            type="number"
            value={formData.intervalleCotisation}
            onChange={(e) => updateField("intervalleCotisation", e.target.value)}
            min="1"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
          <p className="text-[10px] text-content-muted mt-1">Nombre de periodes entre chaque cotisation</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">Type de distribution</label>
        <div className="space-y-2">
          {DISTRIBUTION_TYPE_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                formData.distributionType === o.value
                  ? "border-accent bg-accent/5"
                  : "border-input-border bg-input hover:border-edge"
              }`}
            >
              <input
                type="radio"
                name="distributionType"
                value={o.value}
                checked={formData.distributionType === o.value}
                onChange={(e) => updateField("distributionType", e.target.value)}
                className="mt-0.5 accent-accent"
              />
              <div>
                <span className="text-sm font-medium text-content-primary">{o.label}</span>
                <p className="text-[10px] text-content-muted">{o.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
