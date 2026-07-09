import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Globe, MapPin, Building2 } from 'lucide-react';
import SearchableSelect, { type SearchableSelectOption } from '../ui/SearchableSelect';
import { paysApi, regionApi, villeApi } from '../../lib/api-client';

export interface GeoSelection {
  paysId: string;
  regionId: string;
  villeId: string;
  latitude?: number;
  longitude?: number;
  regionNom?: string;
}

interface CascadingGeoSelectProps {
  value: GeoSelection;
  onChange: (value: GeoSelection) => void;
  defaultPaysIso2?: string; // default "CG" for Congo
  errors?: {
    paysId?: string;
    regionId?: string;
    villeId?: string;
  };
  disabled?: boolean;
}

// Congo default
const DEFAULT_COUNTRY_ISO2 = 'CG';

export function CascadingGeoSelect({
  value,
  onChange,
  defaultPaysIso2 = DEFAULT_COUNTRY_ISO2,
  errors,
  disabled,
}: CascadingGeoSelectProps) {
  const [paysOptions, setPaysOptions] = useState<SearchableSelectOption[]>([]);
  const [regionOptions, setRegionOptions] = useState<SearchableSelectOption[]>([]);
  const [villeOptions, setVilleOptions] = useState<SearchableSelectOption[]>([]);
  const [loadingPays, setLoadingPays] = useState(false);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingVilles, setLoadingVilles] = useState(false);
  const initializedRef = useRef(false);

  // Load countries on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingPays(true);
    paysApi.getAll({ actif: true }).then((data) => {
      if (cancelled) return;
      const opts: SearchableSelectOption[] = data.map((p: any) => ({
        value: p.id,
        label: p.nomFr || p.nomEn,
        subLabel: p.iso2,
        emoji: getCountryFlag(p.iso2),
      }));
      setPaysOptions(opts);

      // Auto-select default country if no paysId set
      if (!value.paysId && defaultPaysIso2) {
        const defaultPays = data.find((p: any) => p.iso2 === defaultPaysIso2);
        if (defaultPays && !initializedRef.current) {
          initializedRef.current = true;
          onChange({ ...value, paysId: defaultPays.id });
        }
      }
    }).catch(console.error).finally(() => !cancelled && setLoadingPays(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load regions when country changes
  useEffect(() => {
    if (!value.paysId) {
      setRegionOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingRegions(true);
    regionApi.getAll({ paysId: value.paysId, actif: true }).then((data) => {
      if (cancelled) return;
      const opts: SearchableSelectOption[] = data.map((r: any) => ({
        value: r.id,
        label: r.nom,
        hideAvatar: true,
      }));
      setRegionOptions(opts);
    }).catch(console.error).finally(() => !cancelled && setLoadingRegions(false));
    return () => { cancelled = true; };
  }, [value.paysId]);

  // Load cities when region changes
  useEffect(() => {
    if (!value.regionId) {
      setVilleOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingVilles(true);
    villeApi.getAll({ regionId: value.regionId, actif: true, limit: 200 }).then((data) => {
      if (cancelled) return;
      const opts: SearchableSelectOption[] = data.map((v: any) => ({
        value: v.id,
        label: v.nom,
        subLabel: v.population ? `${Number(v.population).toLocaleString()} hab.` : undefined,
        hideAvatar: true,
      }));
      setVilleOptions(opts);
    }).catch(console.error).finally(() => !cancelled && setLoadingVilles(false));
    return () => { cancelled = true; };
  }, [value.regionId]);

  const handlePaysChange = useCallback((paysId: string | number) => {
    onChange({
      paysId: String(paysId),
      regionId: '',
      villeId: '',
      latitude: undefined,
      longitude: undefined,
      regionNom: undefined,
    });
  }, [onChange]);

  const handleRegionChange = useCallback((regionId: string | number) => {
    const region = regionOptions.find(r => r.value === regionId);
    onChange({
      ...value,
      regionId: String(regionId),
      villeId: '',
      latitude: undefined,
      longitude: undefined,
      regionNom: region?.label,
    });
  }, [onChange, value, regionOptions]);

  const handleVilleChange = useCallback((villeId: string | number) => {
    // Find the selected ville to get lat/lng
    villeApi.getById(String(villeId)).then((villeData: any) => {
      onChange({
        ...value,
        villeId: String(villeId),
        latitude: villeData.latitude ? Number(villeData.latitude) : undefined,
        longitude: villeData.longitude ? Number(villeData.longitude) : undefined,
        regionNom: villeData.regionNom || value.regionNom,
      });
    }).catch(() => {
      onChange({ ...value, villeId: String(villeId) });
    });
  }, [onChange, value]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <SearchableSelect
        label="Pays"
        name="paysId"
        options={paysOptions}
        value={value.paysId}
        onChange={handlePaysChange}
        placeholder="Sélectionner un pays..."
        isLoading={loadingPays}
        error={errors?.paysId}
        disabled={disabled}
      />
      <SearchableSelect
        label="Région"
        name="regionId"
        options={regionOptions}
        value={value.regionId}
        onChange={handleRegionChange}
        placeholder={value.paysId ? "Sélectionner une région..." : "Choisir un pays d'abord"}
        isLoading={loadingRegions}
        error={errors?.regionId}
        disabled={disabled || !value.paysId}
      />
      <SearchableSelect
        label="Ville"
        name="villeId"
        options={villeOptions}
        value={value.villeId}
        onChange={handleVilleChange}
        placeholder={value.regionId ? "Sélectionner une ville..." : "Choisir une région d'abord"}
        isLoading={loadingVilles}
        error={errors?.villeId}
        disabled={disabled || !value.regionId}
      />
    </div>
  );
}

/** Convert ISO2 country code to flag emoji */
function getCountryFlag(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return '';
  const codePoints = [...iso2.toUpperCase()].map(
    (char) => 0x1f1e6 - 65 + char.charCodeAt(0)
  );
  return String.fromCodePoint(...codePoints);
}
