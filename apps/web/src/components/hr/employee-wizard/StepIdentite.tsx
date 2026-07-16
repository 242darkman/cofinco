import React from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { User, Upload, Link, Building2, AlertTriangle, Globe, MapPin, Heart } from 'lucide-react';
import FormField from '../../ui/FormField';
import SelectField from '../../ui/SelectField';
import SearchableSelect from '../../ui/SearchableSelect';
import BirthPlaceField, { type BirthPlaceValue } from './BirthPlaceField';
import { resolveStorageUrl, formatPhoneInput, stripPhoneFormat } from '@/lib/format';

const SITUATION_FAMILIALE_OPTIONS = [
  { value: 'CELIBATAIRE', label: 'Célibataire' },
  { value: 'MARIE', label: 'Marié(e)' },
  { value: 'VEUF', label: 'Veuf(ve)' },
  { value: 'DIVORCE', label: 'Divorcé(e)' },
];

interface StepIdentiteProps {
  formData: any;
  updateField: (field: string, value: string | null) => void;
  editingEmploye: any | null;
  // User linking (creation mode)
  unlinkedUsers: Array<{
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    sexe: string | null;
    photoProfile: string | null;
    agenceId: string | null;
    agenceNom: string | null;
    agenceCode: string | null;
  }>;
  selectedUserId: string | null;
  setSelectedUserId: (id: string | null) => void;
  selectedUser: StepIdentiteProps['unlinkedUsers'][0] | null;
  loadingUsers: boolean;
  // Agency
  agenceId: string;
  setAgenceId: (id: string) => void;
  agences: Array<{ id: string; nom: string; code: string }>;
  // Photo
  photoPreview: string | null;
  handlePhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading: boolean;
  // Geography reference data
  paysList: Array<{ id: string; nomFr: string; nomEn: string; iso2: string | null }>;
  // Ville (address city) search
  villesList: Array<{ id: string; nom: string; regionNom: string | null }>;
  villesLoading: boolean;
  onVilleSearch: (query: string) => void;
  // Validation
  validationErrors: Record<string, string>;
}

export default function StepIdentite({
  formData,
  updateField,
  editingEmploye,
  unlinkedUsers,
  selectedUserId,
  setSelectedUserId,
  selectedUser,
  loadingUsers,
  agenceId,
  setAgenceId,
  agences,
  photoPreview,
  handlePhotoUpload,
  isUploading,
  paysList,
  villesList,
  villesLoading,
  onVilleSearch,
  validationErrors,
}: StepIdentiteProps) {
  const isCreationMode = !editingEmploye;
  const isFieldReadOnly = !!selectedUser && !editingEmploye;

  // Prepare pays options with flag emojis
  const paysOptions = paysList.map(p => ({
    value: p.id,
    label: p.nomFr || p.nomEn,
    emoji: p.iso2 ? String.fromCodePoint(...[...p.iso2.toUpperCase()].map(c => c.charCodeAt(0) + 127397)) : undefined,
  }));

  // Prepare ville options for address city
  const villeOptions = villesList.map(v => ({
    value: v.nom,
    label: v.nom,
    subLabel: v.regionNom || undefined,
    hideAvatar: true,
  }));

  // User select options
  const userOptions = unlinkedUsers.map(u => ({
    value: u.id,
    label: `${u.nom} ${u.prenom || ''}`.trim(),
    subLabel: [u.email, u.telephone].filter(Boolean).join(' · ') || undefined,
    image: u.photoProfile || undefined,
  }));

  // Handle pays de naissance change — le lieu de naissance est réinitialisé et
  // rechargé par BirthPlaceField (qui réagit au pays via son hook interne).
  const handlePaysNaissanceChange = (value: string | number) => {
    const paysId = String(value);
    updateField('paysNaissanceId', paysId);
    updateField('lieuNaissanceLocalityId', null);
    updateField('lieuNaissanceLocalityType', null);
    updateField('lieuNaissance', null);
    // Auto-renseigne la nationalité si vide
    if (paysId && !formData.nationaliteId) {
      updateField('nationaliteId', paysId);
    }
  };

  return (
    <div className="space-y-6">
      {/* User Linking - Creation Mode Only */}
      {isCreationMode && (
        <div className="border border-accent/30 rounded-xl p-5 bg-accent/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center">
              <Link className="text-accent" size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-content-primary">Lier à un compte utilisateur</h3>
              <p className="text-[11px] text-content-muted">Sélectionnez un utilisateur existant sans fiche employé</p>
            </div>
          </div>

          <SearchableSelect
            label="Utilisateur"
            name="userId"
            options={userOptions}
            value={selectedUserId || ''}
            onChange={(value) => setSelectedUserId(String(value))}
            placeholder="Rechercher un utilisateur non lié..."
            isLoading={loadingUsers}
            error={validationErrors.userId}
            required
            showAvatarInTrigger={true}
          />

          {/* User Preview Card */}
          {selectedUser && (
            <div className="mt-3 p-3 bg-surface rounded-lg border border-edge">
              <div className="flex items-center gap-3">
                {selectedUser.photoProfile ? (
                  <img
                    src={resolveStorageUrl(selectedUser.photoProfile)}
                    alt={selectedUser.nom}
                    className="w-12 h-12 rounded-full object-cover border-2 border-accent"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-surface-subtle flex items-center justify-center border-2 border-edge">
                    <User className="text-content-muted" size={22} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-content-primary text-sm">
                    {selectedUser.nom} {selectedUser.prenom || ''}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {selectedUser.email && (
                      <span className="text-xs text-content-secondary truncate">{selectedUser.email}</span>
                    )}
                    {selectedUser.telephone && (
                      <span className="text-xs text-content-muted">{selectedUser.telephone}</span>
                    )}
                  </div>
                  {selectedUser.agenceNom && (
                    <div className="text-[11px] text-content-muted mt-1 flex items-center gap-1.5">
                      <Building2 size={12} />
                      {selectedUser.agenceNom} {selectedUser.agenceCode && `(${selectedUser.agenceCode})`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Affectation (Agency + Matricule) */}
      <div className="border border-edge rounded-xl p-5 bg-surface/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-surface-elevated flex items-center justify-center">
            <Building2 className="text-content-secondary" size={18} />
          </div>
          <h3 className="text-sm font-bold text-content-primary">Affectation</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Agency */}
          {isCreationMode ? (
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
                Agence
                <span className="text-status-danger ml-1">*</span>
              </label>
              {selectedUser?.agenceId ? (
                <div className="w-full px-3 py-2.5 bg-surface-subtle border border-edge rounded-lg text-content-primary text-sm">
                  {selectedUser.agenceNom} {selectedUser.agenceCode && `(${selectedUser.agenceCode})`}
                </div>
              ) : (
                <div className="w-full px-3 py-2.5 bg-status-warning-bg border border-status-warning/30 rounded-lg text-status-warning text-sm flex items-center gap-2">
                  <AlertTriangle size={14} />
                  Aucune agence assignée
                </div>
              )}
            </div>
          ) : (
            <SelectField
              label="Agence"
              name="agenceId"
              value={agenceId}
              onChange={(e) => setAgenceId(e.target.value)}
              options={agences.map(a => ({ value: a.id, label: `${a.nom} (${a.code})` }))}
              required
              error={validationErrors.agenceId}
            />
          )}

          <FormField
            label="Matricule"
            name="matricule"
            value={formData.matricule || ''}
            onChange={(e) => updateField('matricule', e.target.value)}
            placeholder="Généré automatiquement"
            disabled
            readOnly
          />
        </div>
      </div>

      {/* Identité */}
      <div className="border border-edge rounded-xl p-5 bg-surface/30">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-surface-elevated flex items-center justify-center">
            <User className="text-content-secondary" size={18} />
          </div>
          <h3 className="text-sm font-bold text-content-primary">Identité</h3>
        </div>

        {/* Photo + Nom/Prénom row */}
        <div className="flex items-start gap-5 mb-5">
          {/* Photo Upload - compact */}
          <div className="shrink-0">
            <div className="relative group">
              {photoPreview || formData.photoProfile ? (
                <img
                  src={photoPreview || resolveStorageUrl(formData.photoProfile)}
                  alt="Photo"
                  className="w-20 h-20 rounded-xl object-cover border-2 border-edge"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-surface-subtle flex items-center justify-center border-2 border-dashed border-edge">
                  <User className="text-content-muted" size={28} />
                </div>
              )}
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-surface/80 rounded-xl">
                  <Spinner size="sm" />
                </div>
              )}
              <label className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 rounded-xl cursor-pointer transition-colors group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                  disabled={isUploading}
                />
                <Upload size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </label>
            </div>
            <p className="text-[10px] text-content-muted text-center mt-1.5">Photo</p>
          </div>

          {/* Nom + Prénom */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label="Nom"
              name="nom"
              value={formData.nom || ''}
              onChange={(e) => updateField('nom', e.target.value)}
              placeholder="Nom de famille"
              required
              readOnly={isFieldReadOnly}
              disabled={isFieldReadOnly}
              error={validationErrors.nom}
            />
            <FormField
              label="Prénom"
              name="prenom"
              value={formData.prenom || ''}
              onChange={(e) => updateField('prenom', e.target.value)}
              placeholder="Prénom"
              required
              readOnly={isFieldReadOnly}
              disabled={isFieldReadOnly}
              error={validationErrors.prenom}
            />
          </div>
        </div>

        {/* Sexe + Date naissance + Situation matrimoniale */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <SelectField
            label="Sexe"
            name="sexe"
            value={formData.sexe || ''}
            onChange={(e) => updateField('sexe', e.target.value)}
            options={[
              { value: 'M', label: 'Masculin' },
              { value: 'F', label: 'Féminin' },
            ]}
            placeholder="Sélectionner..."
            required
            error={validationErrors.sexe}
          />
          <FormField
            label="Date de naissance"
            name="dateNaissance"
            type="date"
            value={formData.dateNaissance || ''}
            onChange={(e) => updateField('dateNaissance', e.target.value)}
            error={validationErrors.dateNaissance}
          />
          <SelectField
            label="Situation matrimoniale"
            name="situationFamiliale"
            value={formData.situationFamiliale || ''}
            onChange={(e) => updateField('situationFamiliale', e.target.value)}
            options={SITUATION_FAMILIALE_OPTIONS}
            placeholder="Sélectionner..."
            error={validationErrors.situationFamiliale}
          />
        </div>

        {/* Email + Téléphone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            label="Email"
            name="email"
            type="email"
            value={formData.email || ''}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="exemple@email.com"
            readOnly={isFieldReadOnly}
            disabled={isFieldReadOnly}
            error={validationErrors.email}
          />
          <FormField
            label="Téléphone"
            name="phone"
            type="tel"
            value={formatPhoneInput(formData.phone || '')}
            onChange={(e) => updateField('phone', stripPhoneFormat(e.target.value))}
            placeholder="+242 06 XXX XX XX"
            readOnly={isFieldReadOnly}
            disabled={isFieldReadOnly}
            error={validationErrors.phone}
          />
        </div>
      </div>

      {/* Naissance & Nationalité */}
      <div className="border border-edge rounded-xl p-5 bg-surface/30">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-surface-elevated flex items-center justify-center">
            <Globe className="text-content-secondary" size={18} />
          </div>
          <h3 className="text-sm font-bold text-content-primary">Naissance & Nationalité</h3>
        </div>

        {/* Pays + Lieu de naissance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <SearchableSelect
            label="Pays de naissance"
            name="paysNaissanceId"
            options={paysOptions}
            value={formData.paysNaissanceId || ''}
            onChange={handlePaysNaissanceChange}
            placeholder="Rechercher un pays..."
            error={validationErrors.paysNaissanceId}
            showAvatarInTrigger={false}
          />
          <BirthPlaceField
            paysId={formData.paysNaissanceId || null}
            localityId={formData.lieuNaissanceLocalityId || null}
            lieuNaissance={formData.lieuNaissance || ''}
            onChange={(v: BirthPlaceValue) => {
              updateField('lieuNaissanceLocalityId', v.lieuNaissanceLocalityId);
              updateField('lieuNaissanceLocalityType', v.lieuNaissanceLocalityType);
              updateField('lieuNaissance', v.lieuNaissance);
            }}
            error={validationErrors.lieuNaissanceLocalityId}
          />
        </div>

        {/* Nationalité */}
        <div className="sm:w-1/2">
          <SearchableSelect
            label="Nationalité"
            name="nationaliteId"
            options={paysOptions}
            value={formData.nationaliteId || ''}
            onChange={(value) => updateField('nationaliteId', String(value))}
            placeholder="Rechercher une nationalité..."
            error={validationErrors.nationaliteId}
            showAvatarInTrigger={false}
          />
        </div>
      </div>

      {/* Adresse */}
      <div className="border border-edge rounded-xl p-5 bg-surface/30">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-surface-elevated flex items-center justify-center">
            <MapPin className="text-content-secondary" size={18} />
          </div>
          <h3 className="text-sm font-bold text-content-primary">Adresse</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            label="Adresse"
            name="adresse"
            value={formData.adresse || ''}
            onChange={(e) => updateField('adresse', e.target.value)}
            placeholder="Adresse complète"
            error={validationErrors.adresse}
          />
          <SearchableSelect
            label="Ville"
            name="ville"
            options={villeOptions}
            value={formData.ville || ''}
            onChange={(value) => updateField('ville', String(value))}
            onSearchChange={onVilleSearch}
            isLoading={villesLoading}
            placeholder="Rechercher une ville..."
            error={validationErrors.ville}
            showAvatarInTrigger={false}
          />
        </div>
      </div>
    </div>
  );
}
