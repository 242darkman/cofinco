import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, List } from 'lucide-react';
import SearchableSelect from '../../ui/SearchableSelect';
import FormField from '../../ui/FormField';
import { useBirthCitySearch } from '@/hooks/hr/useBirthCitySearch';

const REF_CITY_TYPE = 'REF_CITY';

export interface BirthPlaceValue {
  lieuNaissanceLocalityId: string | null;
  lieuNaissanceLocalityType: string | null;
  lieuNaissance: string;
}

interface BirthPlaceFieldProps {
  /** Pays de naissance sélectionné (filtre l'autocomplétion). */
  paysId: string | null;
  localityId: string | null;
  lieuNaissance: string;
  onChange: (value: BirthPlaceValue) => void;
  error?: string;
}

/**
 * Lieu de naissance : autocomplétion serveur du référentiel MONDIAL de villes
 * (filtré par pays) avec repli « saisie libre » quand la ville n'est pas listée.
 * - Ville choisie   → lieuNaissanceLocalityId + type REF_CITY + nom lisible.
 * - Saisie libre    → uniquement le texte lieuNaissance (locality = null).
 */
export default function BirthPlaceField({
  paysId,
  localityId,
  lieuNaissance,
  onChange,
  error,
}: BirthPlaceFieldProps) {
  const { cities, loading, onSearch } = useBirthCitySearch(paysId);
  const disabled = !paysId;

  // Mode initial : liste si une ville est référencée, sinon saisie libre si un
  // texte de naissance existe déjà (édition d'un enregistrement "Autre").
  const [freeMode, setFreeMode] = useState<boolean>(!localityId && !!lieuNaissance);

  // Repasse en mode liste quand le pays change (les localités précédentes ne sont
  // plus valides). On saute le montage pour préserver le mode initial en édition.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setFreeMode(false);
  }, [paysId]);

  const options = useMemo(() => {
    const opts = cities.map((c) => ({
      value: c.id,
      label: c.nom,
      subLabel: c.admin1Code ?? undefined,
      hideAvatar: true,
    }));
    // Édition : injecte la ville actuellement retenue si absente des résultats.
    if (localityId && lieuNaissance && !cities.some((c) => c.id === localityId)) {
      opts.unshift({ value: localityId, label: lieuNaissance, subLabel: undefined, hideAvatar: true });
    }
    return opts;
  }, [cities, localityId, lieuNaissance]);

  const selectCity = (value: string | number) => {
    const id = String(value);
    const city = cities.find((c) => c.id === id);
    onChange({
      lieuNaissanceLocalityId: id,
      lieuNaissanceLocalityType: REF_CITY_TYPE,
      lieuNaissance: city ? city.nom : lieuNaissance,
    });
  };

  const setFree = (text: string) =>
    onChange({ lieuNaissanceLocalityId: null, lieuNaissanceLocalityType: null, lieuNaissance: text });

  if (freeMode) {
    return (
      <div>
        <FormField
          label="Lieu de naissance"
          name="lieuNaissance"
          value={lieuNaissance}
          onChange={(e) => setFree(e.target.value)}
          placeholder="Saisir la ville / localité de naissance"
          disabled={disabled}
          error={error}
        />
        <button
          type="button"
          onClick={() => {
            setFreeMode(false);
            setFree('');
          }}
          className="text-[11px] text-accent hover:underline inline-flex items-center gap-1 -mt-2"
        >
          <List size={12} /> Choisir dans la liste
        </button>
      </div>
    );
  }

  return (
    <div>
      <SearchableSelect
        label="Lieu de naissance"
        name="lieuNaissanceLocalityId"
        options={options}
        value={localityId || ''}
        onChange={selectCity}
        onSearchChange={onSearch}
        isLoading={loading}
        disabled={disabled}
        placeholder={disabled ? "Sélectionnez d'abord un pays" : 'Rechercher une ville...'}
        error={error}
        showAvatarInTrigger={false}
      />
      <button
        type="button"
        onClick={() => {
          setFreeMode(true);
          setFree('');
        }}
        disabled={disabled}
        className="text-[11px] text-accent hover:underline disabled:opacity-40 inline-flex items-center gap-1 -mt-2"
      >
        <Pencil size={12} /> Ville introuvable ? La saisir manuellement
      </button>
    </div>
  );
}
