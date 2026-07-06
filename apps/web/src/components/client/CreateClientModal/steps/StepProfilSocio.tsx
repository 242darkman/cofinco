import React, { useMemo, useCallback } from 'react';
import { FormField, SelectField, SearchableSelect } from '../../../ui';
import {
  SITUATION_MATRIMONIALE_OPTIONS,
  NIVEAU_EDUCATION_OPTIONS,
  TYPE_CLIENT_OPTIONS,
} from '@shared/enum/status-constants';
import type { StepComponentProps } from '../types';

const AUTRE_PROFESSION_ID = '__AUTRE__';

function computeAncienneteMois(dateDebut: string): number | null {
  if (!dateDebut) return null;
  const parts = dateDebut.split('-');
  const year = parseInt(parts[0], 10);
  const month = parts.length >= 2 ? parseInt(parts[1], 10) : 1;
  if (isNaN(year)) return null;
  const now = new Date();
  const diffMonths = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  return Math.max(0, diffMonths);
}

function formatAnciennete(months: number | null): string {
  if (months === null) return '';
  if (months < 1) return 'Moins d\'un mois';
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${remainingMonths} mois`;
  if (remainingMonths === 0) return `${years} an${years > 1 ? 's' : ''}`;
  return `${years} an${years > 1 ? 's' : ''} et ${remainingMonths} mois`;
}

export default function StepProfilSocio({
  formData, updateField, errors, markTouched,
  catalogProfessions, catalogActivityTypes, catalogLoading, onCatalogFilter,
}: StepComponentProps) {
  // Build profession options for SearchableSelect
  const professionOptions = useMemo(() => {
    const opts = (catalogProfessions || []).map(p => ({ value: p.id, label: p.nom }));
    opts.push({ value: AUTRE_PROFESSION_ID, label: 'Autre (saisie libre)' });
    return opts;
  }, [catalogProfessions]);

  // Build activity type options for SearchableSelect
  const activityTypeOptions = useMemo(() => {
    return (catalogActivityTypes || []).map(a => ({ value: a.id, label: a.nom }));
  }, [catalogActivityTypes]);

  // Find current activity type code for auto-entrepreneur detection
  const currentActivityCode = useMemo(() => {
    if (!formData.activityTypeId || !catalogActivityTypes) return null;
    const found = catalogActivityTypes.find(a => a.id === formData.activityTypeId);
    return found?.code || null;
  }, [formData.activityTypeId, catalogActivityTypes]);

  const isAutoEntrepreneur = currentActivityCode === 'AUTO_ENTREPRENEUR' || currentActivityCode === 'INDEPENDANT';
  const isAutreProfession = formData.professionId === AUTRE_PROFESSION_ID;

  // Handle profession change (cascade filter)
  const handleProfessionChange = useCallback((value: string | number) => {
    const val = String(value);
    updateField('professionId', val);
    if (val === AUTRE_PROFESSION_ID) {
      // "Autre" selected -- don't filter
      return;
    }
    // Clear "autre" text if switching from Autre
    if (formData.professionId === AUTRE_PROFESSION_ID) {
      updateField('professionAutreTexte', '');
    }
    // Cascade: filter activity types and sectors based on profession
    if (val && onCatalogFilter) {
      onCatalogFilter({ professionId: val });
    }
  }, [updateField, formData.professionId, onCatalogFilter]);

  // Handle activity type change
  const handleActivityTypeChange = useCallback((value: string | number) => {
    const val = String(value);
    updateField('activityTypeId', val);
    // Check if this is auto-entrepreneur type
    const selected = (catalogActivityTypes || []).find(a => a.id === val);
    if (selected && (selected.code === 'AUTO_ENTREPRENEUR' || selected.code === 'INDEPENDANT')) {
      updateField('employeur', 'Indépendant');
    } else if (isAutoEntrepreneur && formData.employeur === 'Indépendant') {
      updateField('employeur', '');
    }
    // Cascade: filter professions and sectors based on activity type
    if (val && onCatalogFilter) {
      onCatalogFilter({ activityTypeId: val, sectorId: formData.sectorId || undefined });
    }
  }, [updateField, catalogActivityTypes, isAutoEntrepreneur, formData.employeur, formData.sectorId, onCatalogFilter]);

  // Compute anciennete from dateDebutActivite
  const ancienneteMois = useMemo(() => computeAncienneteMois(formData.dateDebutActivite), [formData.dateDebutActivite]);
  const ancienneteLabel = useMemo(() => formatAnciennete(ancienneteMois), [ancienneteMois]);

  const handleDateDebutChange = (value: string) => {
    updateField('dateDebutActivite', value);
    const months = computeAncienneteMois(value);
    updateField('ancienneteActiviteMois', months !== null ? String(months) : '');
  };

  return (
    <div className="space-y-5">
      {/* Situation personnelle */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <SelectField
          label="Situation matrimoniale" name="situationMatrimoniale" value={formData.situationMatrimoniale}
          onChange={(e) => updateField('situationMatrimoniale', e.target.value)}
          options={SITUATION_MATRIMONIALE_OPTIONS} placeholder="Sélectionner..." required
        />
        <FormField
          label="Personnes à charge" name="nombrePersonnesCharge"
          inputMode="numeric" pattern="[0-9]*"
          value={formData.nombrePersonnesCharge}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, '');
            updateField('nombrePersonnesCharge', v);
          }}
          onBlur={() => markTouched('nombrePersonnesCharge')}
          error={errors.nombrePersonnesCharge} className="py-1" placeholder="0" required
        />
        <SelectField
          label="Niveau d'éducation" name="niveauEducation" value={formData.niveauEducation}
          onChange={(e) => updateField('niveauEducation', e.target.value)}
          options={NIVEAU_EDUCATION_OPTIONS} placeholder="Sélectionner..."
        />
      </div>

      {/* Type client */}
      <SelectField
        label="Type de client" name="typeClient" value={formData.typeClient}
        onChange={(e) => updateField('typeClient', e.target.value)}
        options={TYPE_CLIENT_OPTIONS}
      />

      {/* Professionnel - Profession & Employeur */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <SearchableSelect
            label="Profession" name="professionId"
            options={professionOptions}
            value={formData.professionId}
            onChange={handleProfessionChange}
            placeholder={catalogLoading ? 'Chargement...' : 'Rechercher une profession...'}
            disabled={catalogLoading}
          />
          {isAutreProfession && (
            <FormField
              label="Précisez la profession" name="professionAutreTexte"
              value={formData.professionAutreTexte}
              onChange={(e) => updateField('professionAutreTexte', e.target.value)}
              className="py-1 mt-2" placeholder="Saisir la profession..."
            />
          )}
        </div>
        <FormField
          label="Employeur" name="employeur" value={formData.employeur}
          onChange={(e) => updateField('employeur', e.target.value)}
          onBlur={() => markTouched('employeur')}
          error={errors.employeur}
          className="py-1" placeholder={isAutoEntrepreneur ? 'Indépendant' : 'Nom de l\'entreprise'}
          readOnly={isAutoEntrepreneur}
          required={!!formData.professionId && !isAutoEntrepreneur}
        />
      </div>

      {/* Type d'activite & Date debut */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <SearchableSelect
          label="Type d'activité" name="activityTypeId"
          options={activityTypeOptions}
          value={formData.activityTypeId}
          onChange={handleActivityTypeChange}
          placeholder={catalogLoading ? 'Chargement...' : 'Sélectionner...'}
          disabled={catalogLoading}
        />
        <div>
          <FormField
            label="Début de l'activité" name="dateDebutActivite" type="month"
            value={formData.dateDebutActivite}
            onChange={(e) => handleDateDebutChange(e.target.value)}
            className="py-1"
          />
          {ancienneteLabel && (
            <p className="text-[10px] text-content-muted mt-1">
              Ancienneté : {ancienneteLabel}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
