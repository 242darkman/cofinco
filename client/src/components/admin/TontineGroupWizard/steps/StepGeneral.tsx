import { useState, useEffect } from "react";
import type { StepComponentProps } from "../types";
import { currencySymbol } from "@shared/config/currency";
import {
  FREQUENCE_OPTIONS,
  DISTRIBUTION_TYPE_OPTIONS,
} from "../../TontinePlanWizard/constants";
import { userApi } from "../../../../lib/api-client";

export default function StepGeneral({ formData, updateField }: StepComponentProps) {
  const sym = currencySymbol();
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    userApi.getAll()
      .then((data) => setUsers(data || []))
      .catch(() => setUsers([]));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">
          Nom du groupe <span className="text-status-danger">*</span>
        </label>
        <input
          type="text"
          value={formData.nom}
          onChange={(e) => updateField("nom", e.target.value)}
          placeholder="Ex : Tontine des Commercants"
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => updateField("description", e.target.value)}
          rows={2}
          placeholder="Description du groupe..."
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

      <div className="grid grid-cols-3 gap-4">
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
          <p className="text-[10px] text-content-muted mt-1">Periodes entre chaque cotisation</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1">Type de distribution</label>
          <select
            value={formData.distributionType}
            onChange={(e) => updateField("distributionType", e.target.value)}
            className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
          >
            {DISTRIBUTION_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-content-primary mb-1">Gestionnaire</label>
        <select
          value={formData.gestionnaireId}
          onChange={(e) => updateField("gestionnaireId", e.target.value)}
          className="w-full px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm focus:border-input-focus focus:outline-none"
        >
          <option value="">— Aucun gestionnaire —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.nom || u.name || u.username || u.email}</option>
          ))}
        </select>
        <p className="text-[10px] text-content-muted mt-1">Utilisateur responsable de la gestion de cette tontine</p>
      </div>
    </div>
  );
}
