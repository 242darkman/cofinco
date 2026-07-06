import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { FormField, SelectField, SearchableSelect } from '../../../ui';
import PhotoCapture from '../components/PhotoCapture';
import type { StepComponentProps } from '../types';

function capitalizeWords(str: string): string {
  return str.replace(/(^|\s)\S/g, c => c.toUpperCase());
}

export default function StepIdentite({
  formData, updateField, errors, markTouched, isConversion, referenceData, files, setFiles,
  onAsyncError, clearAsyncError,
}: StepComponentProps) {
  const paysOptions = referenceData.paysList.map(p => ({
    value: p.id,
    label: p.nomFr || p.nomEn,
    emoji: p.iso2 ? String.fromCodePoint(...[...p.iso2.toUpperCase()].map(c => c.charCodeAt(0) + 127397)) : undefined,
  }));

  // Fetch localities when birth country changes
  useEffect(() => {
    if (formData.paysNaissanceId) {
      referenceData.fetchLocalitiesByPays(formData.paysNaissanceId);
    }
  }, [formData.paysNaissanceId]);

  // Build a type lookup map: uuid -> 'CITY' | 'DISTRICT'
  const localityTypeMap = useRef(new Map<string, 'CITY' | 'DISTRICT'>());

  const lieuNaissanceOptions = useMemo(() => {
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

  const handlePaysNaissanceChange = (val: string | number) => {
    updateField('paysNaissanceId', val);
    if (val !== formData.paysNaissanceId) {
      updateField('lieuNaissance', '');
      updateField('lieuNaissanceLocalityId', '');
      updateField('lieuNaissanceLocalityType', '');
    }
  };

  const handleLieuNaissanceChange = (val: string | number) => {
    const id = String(val);
    updateField('lieuNaissanceLocalityId', id);
    const type = localityTypeMap.current.get(id) || 'CITY';
    updateField('lieuNaissanceLocalityType', type);
    // Also store the display name in lieuNaissance for backward compatibility
    const selected = referenceData.localitiesList.find(l => l.id === id);
    if (selected) {
      updateField('lieuNaissance', selected.name);
    }
  };

  // Clear nom async error when user modifies nom or prenom
  const prevNomRef = useRef(formData.nom);
  const prevPrenomRef = useRef(formData.prenom);
  useEffect(() => {
    if (formData.nom !== prevNomRef.current || formData.prenom !== prevPrenomRef.current) {
      prevNomRef.current = formData.nom;
      prevPrenomRef.current = formData.prenom;
      clearAsyncError?.('nom');
    }
  }, [formData.nom, formData.prenom, clearAsyncError]);

  // Real-time uniqueness check for nom + prenom on blur
  const checkingNomRef = useRef(false);
  const checkNomUniqueness = useCallback(async () => {
    const nom = formData.nom.trim();
    const prenom = formData.prenom.trim();
    if (nom.length < 2 || prenom.length < 2 || !onAsyncError) return;
    if (checkingNomRef.current) return;
    checkingNomRef.current = true;
    try {
      const res = await fetch('/api/clients/check-uniqueness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nom, prenom }),
      });
      const data = await res.json();
      if (!data.available && data.field === 'nom') {
        onAsyncError('nom', data.message);
      }
    } catch { /* ignore network errors */ }
    finally { checkingNomRef.current = false; }
  }, [formData.nom, formData.prenom, onAsyncError]);

  const handleNomBlur = useCallback(() => {
    markTouched('nom');
    checkNomUniqueness();
  }, [markTouched, checkNomUniqueness]);

  const handlePrenomBlur = useCallback(() => {
    markTouched('prenom');
    checkNomUniqueness();
  }, [markTouched, checkNomUniqueness]);

  return (
    <div className="space-y-5">
      {/* Photo centered at top */}
      {!isConversion && (
        <div className="flex justify-center">
          <PhotoCapture
            file={files?.photo || null}
            onFileChange={(f) => setFiles?.(prev => ({ ...prev, photo: f }))}
          />
        </div>
      )}

      {/* Nom / Prénom */}
      <div className="grid grid-cols-2 gap-5">
        <FormField
          label="Nom" name="nom" value={formData.nom}
          onChange={(e) => updateField('nom', e.target.value.toUpperCase())}
          onBlur={handleNomBlur}
          error={errors.nom} required readOnly={isConversion} className="py-1"
          placeholder="MALONGA"
        />
        <FormField
          label="Prénom" name="prenom" value={formData.prenom}
          onChange={(e) => updateField('prenom', capitalizeWords(e.target.value))}
          onBlur={handlePrenomBlur}
          error={errors.prenom} required readOnly={isConversion} className="py-1"
          placeholder="Jean"
        />
      </div>

      {/* Sexe / Date de naissance */}
      <div className="grid grid-cols-2 gap-5">
        <SelectField
          label="Sexe" name="sexe" value={formData.sexe}
          onChange={(e) => updateField('sexe', e.target.value)}
          options={[{ value: 'M', label: 'Masculin' }, { value: 'F', label: 'Féminin' }]}
          disabled={isConversion}
        />
        <FormField
          label="Date de Naissance" name="dateNaissance" type="date"
          value={formData.dateNaissance}
          onChange={(e) => updateField('dateNaissance', e.target.value)}
          readOnly={isConversion} className="py-1" required
        />
      </div>

      {/* Lieu de Naissance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <SearchableSelect
          label="Pays de Naissance" name="paysNaissanceId"
          options={paysOptions}
          value={formData.paysNaissanceId}
          onChange={handlePaysNaissanceChange}
          placeholder="Rechercher un pays..."
          required
        />
        <SearchableSelect
          label="Lieu de Naissance" name="lieuNaissanceLocalityId"
          options={lieuNaissanceOptions}
          value={formData.lieuNaissanceLocalityId}
          onChange={handleLieuNaissanceChange}
          placeholder={formData.paysNaissanceId ? 'Rechercher une localité...' : 'Sélectionnez un pays d\'abord'}
          disabled={!formData.paysNaissanceId}
          isLoading={referenceData.localitiesLoading}
          required
        />
      </div>

      {/* Nationalité */}
      <SearchableSelect
        label="Nationalité" name="nationaliteId"
        options={paysOptions}
        value={formData.nationaliteId}
        onChange={(val) => updateField('nationaliteId', val)}
        placeholder="Rechercher un pays..."
        required
      />
    </div>
  );
}
