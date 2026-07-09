import React from 'react';
import { FormField, Switch } from '../../../ui';
import { Shield, AlertTriangle } from 'lucide-react';
import ReferencesEditor from '../components/ReferencesEditor';
import type { StepComponentProps } from '../types';

export default function StepReferencesConformite({
  formData, updateField, errors,
}: StepComponentProps) {
  return (
    <div className="space-y-5">
      {/* Références */}
      <ReferencesEditor
        references={formData.referencesPersonnes}
        onChange={(refs) => updateField('referencesPersonnes', refs)}
        errors={errors}
      />

      {/* Séparateur */}
      <div className="border-t border-edge" />

      {/* PEP */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-status-warning" />
              <span className="text-xs font-semibold text-content-primary">Personne Politiquement Exposée (PEP)</span>
            </div>
            <p className="text-[10px] text-content-muted">
              Le client est-il une personne politiquement exposée ou un proche d'une PEP ?
            </p>
          </div>
          <Switch
            checked={formData.isPep}
            onChange={(checked) => updateField('isPep', checked)}
          />
        </div>

        {formData.isPep && (
          <FormField
            label="Détails PEP" name="pepDetails" value={formData.pepDetails}
            onChange={(e) => updateField('pepDetails', e.target.value)}
            className="py-1" placeholder="Fonction, relation avec la PEP..."
          />
        )}
      </div>

      {/* Séparateur */}
      <div className="border-t border-edge" />

      {/* Consentement RGPD */}
      <div className="flex items-start gap-3 p-3 border border-edge rounded-lg bg-surface-subtle/30">
        <div className="mt-0.5">
          <Shield size={16} className="text-accent" />
        </div>
        <div className="flex-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.consentementDonnees}
              onChange={(e) => updateField('consentementDonnees', e.target.checked)}
              className="w-4 h-4 rounded border-input-border text-accent focus:ring-accent/30"
            />
            <span className="text-xs font-medium text-content-primary">
              Consentement au traitement des données <span className="text-status-danger">*</span>
            </span>
          </label>
          <p className="text-[10px] text-content-muted mt-1 ml-6">
            Le client autorise la collecte et le traitement de ses données personnelles
            conformément à la politique de confidentialité et à la réglementation en vigueur.
          </p>
        </div>
      </div>
    </div>
  );
}
