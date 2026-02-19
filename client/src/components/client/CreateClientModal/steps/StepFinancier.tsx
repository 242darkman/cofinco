import React, { useMemo, useCallback } from 'react';
import { FormField, SelectField, SearchableSelect } from '../../../ui';
import { SOURCE_FONDS_OPTIONS, CLIENT_ORIGIN_OPTIONS } from '@shared/enum/status-constants';
import { currencySymbol } from '@shared/config/currency';
import type { StepComponentProps } from '../types';

/** Format a numeric string with space thousand separators (e.g. "215420" → "215 420") */
function formatNumber(val: string): string {
  if (!val) return '';
  return val.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const SEGMENT_OPTIONS = [
  { value: 'Standard', label: 'Standard' },
  { value: 'Premium', label: 'Premium' },
  { value: 'VIP', label: 'VIP' },
  { value: 'Entreprise', label: 'Entreprise' },
];

export default function StepFinancier({
  formData, updateField, errors, markTouched, isConversion, isAdmin, referenceData,
  catalogSectors, catalogLoading, onCatalogFilter,
}: StepComponentProps) {
  // Build sector options with parent info as sub-label
  const sectorOptions = useMemo(() => {
    return (catalogSectors || []).map(s => ({
      value: s.id,
      label: s.parentNom ? `${s.nom} (${s.parentNom})` : s.nom,
    }));
  }, [catalogSectors]);

  const agencesOptions = referenceData.agences.map(a => ({ value: a.id, label: a.nom }));
  const agentsOptions = referenceData.agentsReferents.map(a => ({
    value: a.id,
    label: `${a.nom} ${a.prenom}`.trim(),
  }));

  const handleSectorChange = useCallback((value: string | number) => {
    const val = String(value);
    updateField('sectorId', val);
    // Cascade: filter professions and activity types based on sector
    if (val && onCatalogFilter) {
      onCatalogFilter({ sectorId: val, professionId: formData.professionId || undefined });
    }
  }, [updateField, formData.professionId, onCatalogFilter]);

  return (
    <div className="space-y-5">
      {/* Source de fonds */}
      <SelectField
        label="Source de fonds" name="sourceFonds" value={formData.sourceFonds}
        onChange={(e) => updateField('sourceFonds', e.target.value)}
        options={SOURCE_FONDS_OPTIONS} placeholder="Sélectionner..." required
      />

      {/* Type revenu + Montant */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">Type de revenu <span className="text-status-danger">*</span></label>
          <div className="flex rounded-xl overflow-hidden border border-input-border h-[2.75rem]">
            {(['Mensuel', 'Journalier'] as const).map((type) => (
              <button
                key={type} type="button"
                onClick={() => updateField('typeRevenu', type)}
                className={`flex-1 px-4 text-sm font-medium transition-colors ${
                  formData.typeRevenu === type
                    ? 'bg-accent text-white'
                    : 'bg-input text-content-secondary hover:bg-surface-subtle'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <FormField
          label={`Revenu ${formData.typeRevenu.toLowerCase()} (${currencySymbol()})`}
          name={formData.typeRevenu === 'Mensuel' ? 'revenuMensuel' : 'revenuJournalier'}
          inputMode="numeric"
          value={formatNumber(formData.typeRevenu === 'Mensuel' ? formData.revenuMensuel : formData.revenuJournalier)}
          onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); updateField(
            formData.typeRevenu === 'Mensuel' ? 'revenuMensuel' : 'revenuJournalier',
            v
          ); }}
          onBlur={() => markTouched(formData.typeRevenu === 'Mensuel' ? 'revenuMensuel' : 'revenuJournalier')}
          error={errors.revenuMensuel || errors.revenuJournalier}
          className="py-1" placeholder="150 000" required
        />
      </div>

      {/* Secteur & Segment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <SearchableSelect
          label="Secteur / Marché" name="sectorId"
          options={sectorOptions}
          value={formData.sectorId}
          onChange={handleSectorChange}
          placeholder={catalogLoading ? 'Chargement...' : 'Sélectionner...'}
          required
          disabled={catalogLoading}
        />
        <SelectField
          label="Segment" name="segment" value={formData.segment}
          onChange={(e) => updateField('segment', e.target.value)}
          options={SEGMENT_OPTIONS}
        />
      </div>

      {/* Agence (admin) & Agent */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {isAdmin && (
          <SearchableSelect
            label="Agence" name="agenceId"
            options={agencesOptions}
            value={formData.agenceId}
            onChange={(val) => { updateField('agenceId', val); markTouched('agenceId'); }}
            placeholder="Sélectionner l'agence..."
            required
            error={errors.agenceId}
          />
        )}
        <SearchableSelect
          label="Agent référent" name="agentReferentId"
          options={agentsOptions}
          value={formData.agentReferentId}
          onChange={(val) => updateField('agentReferentId', val)}
          placeholder="Sélectionner l'agent..."
        />
      </div>

      {/* Origine client */}
      <SelectField
        label="Origine client" name="clientOrigin" value={formData.clientOrigin}
        onChange={(e) => updateField('clientOrigin', e.target.value)}
        options={CLIENT_ORIGIN_OPTIONS}
        disabled={isConversion}
      />
    </div>
  );
}
