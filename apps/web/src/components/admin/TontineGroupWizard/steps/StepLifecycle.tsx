import type { StepComponentProps } from "../types";
import { END_RULE_OPTIONS } from "../constants";

const STATUT_OPTIONS = [
  { value: "DRAFT", label: "Brouillon", description: "La tontine est en cours de configuration" },
  { value: "ACTIVE", label: "Active", description: "La tontine est operationnelle" },
];

export default function StepLifecycle({ formData, updateField }: StepComponentProps) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Statut initial
        </label>
        <div className="grid grid-cols-2 gap-3">
          {STATUT_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                formData.statut === o.value
                  ? "border-accent bg-accent/5"
                  : "border-input-border bg-input hover:border-edge"
              }`}
            >
              <input
                type="radio"
                name="statut"
                value={o.value}
                checked={formData.statut === o.value}
                onChange={(e) => updateField("statut", e.target.value)}
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Date de debut <span className="text-status-danger">*</span>
          </label>
          <input
            type="date"
            value={formData.dateDebut}
            onChange={(e) => updateField("dateDebut", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Date de fin (optionnel)
          </label>
          <input
            type="date"
            value={formData.dateFin}
            onChange={(e) => updateField("dateFin", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Regle de fin de cycle
        </label>
        <select
          value={formData.endRule}
          onChange={(e) => updateField("endRule", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          {END_RULE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {(formData.endRule === "AFTER_N_ROUNDS" || formData.endRule === "AFTER_N_PERIODS") && (
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">
            Nombre de {formData.endRule === "AFTER_N_ROUNDS" ? "tours" : "periodes"}
          </label>
          <input
            type="number"
            value={formData.roundCount}
            onChange={(e) => updateField("roundCount", e.target.value)}
            min="1"
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Minimum de membres pour demarrer
        </label>
        <input
          type="number"
          value={formData.minMembersToStart}
          onChange={(e) => updateField("minMembersToStart", e.target.value)}
          min="2"
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        />
        <p className="text-[10px] text-content-muted mt-1">
          La tontine ne demarrera pas tant que ce nombre n'est pas atteint
        </p>
      </div>
    </div>
  );
}
