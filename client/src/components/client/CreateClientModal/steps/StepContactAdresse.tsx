import React, { useMemo, useEffect, useRef } from 'react';
import { FormField, SelectField, SearchableSelect } from '../../../ui';
import PhoneInput from '../components/PhoneInput';
import { STATUT_LOGEMENT_OPTIONS } from '@shared/enum/status-constants';
import type { StepComponentProps } from '../types';

export default function StepContactAdresse({
  formData, updateField, errors, markTouched, isConversion, referenceData,
}: StepComponentProps) {
  const paysOptions = referenceData.paysList.map(p => ({
    value: p.id,
    label: p.nomFr || p.nomEn,
    emoji: p.iso2 ? String.fromCodePoint(...[...p.iso2.toUpperCase()].map(c => c.charCodeAt(0) + 127397)) : undefined,
  }));

  // Fetch localities when country changes
  useEffect(() => {
    if (formData.paysResidenceId) {
      referenceData.fetchLocalitiesByPays(formData.paysResidenceId);
    }
  }, [formData.paysResidenceId]);

  // Build a type lookup map: uuid -> 'CITY' | 'DISTRICT'
  const localityTypeMap = useRef(new Map<string, 'CITY' | 'DISTRICT'>());

  // Build locality options from merged list (cities + districts, CITY wins dedup done server-side)
  const localityOptions = useMemo(() => {
    const map = new Map<string, 'CITY' | 'DISTRICT'>();
    const opts = referenceData.localitiesList.map((loc) => {
      map.set(loc.id, loc.type);
      const subParts: string[] = [];
      if (loc.type === 'DISTRICT') subParts.push('District');
      if (loc.regionName) subParts.push(loc.regionName);
      return {
        value: loc.id,
        label: loc.name,
        subLabel: subParts.length > 0 ? subParts.join(' · ') : undefined,
      };
    });
    localityTypeMap.current = map;
    return opts;
  }, [referenceData.localitiesList]);

  const handlePaysChange = (val: string | number) => {
    updateField('paysResidenceId', val);
    if (val !== formData.paysResidenceId) {
      updateField('villeId', '');
      updateField('localityType', '');
    }
  };

  const handleLocalityChange = (val: string | number) => {
    const id = String(val);
    updateField('villeId', id);
    const type = localityTypeMap.current.get(id) || 'CITY';
    updateField('localityType', type);
  };

  return (
    <div className="space-y-5">
      {/* Téléphone & Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <PhoneInput
          value={formData.telephoneRaw}
          onChange={(raw, full) => { updateField('telephoneRaw', raw); updateField('telephone', full); }}
          onBlur={() => markTouched('telephoneRaw')}
          error={errors.telephoneRaw}
          disabled={isConversion}
        />
        <FormField
          label="Email" name="email" type="email" value={formData.email}
          onChange={(e) => updateField('email', e.target.value)}
          onBlur={() => markTouched('email')}
          error={errors.email} readOnly={isConversion} className="py-1"
          placeholder="jean.malonga@email.com"
        />
      </div>

      {/* Adresse */}
      <FormField
        label="Adresse domicile" name="adresseDomicile" value={formData.adresseDomicile}
        onChange={(e) => updateField('adresseDomicile', e.target.value)}
        className="py-1" placeholder="Quartier, Avenue, N°..." required
      />

      {/* Pays de résidence & Ville/District */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <SearchableSelect
          label="Pays de résidence" name="paysResidenceId"
          options={paysOptions}
          value={formData.paysResidenceId}
          onChange={handlePaysChange}
          placeholder="Rechercher un pays..."
          required
        />
        <SearchableSelect
          label="Ville / District" name="villeId"
          options={localityOptions}
          value={formData.villeId}
          onChange={handleLocalityChange}
          placeholder={formData.paysResidenceId ? 'Rechercher une localité...' : 'Sélectionnez un pays d\'abord'}
          disabled={!formData.paysResidenceId}
          isLoading={referenceData.localitiesLoading}
          required
        />
      </div>

      {/* Statut logement */}
      <SelectField
        label="Statut logement" name="statutLogement" value={formData.statutLogement}
        onChange={(e) => updateField('statutLogement', e.target.value)}
        options={STATUT_LOGEMENT_OPTIONS} placeholder="Sélectionner..." required
      />
    </div>
  );
}
