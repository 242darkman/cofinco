import React from 'react';
import { User, Upload, Link, Building2, AlertTriangle } from 'lucide-react';
import FormField from '../../ui/FormField';
import SelectField from '../../ui/SelectField';
import SearchableSelect from '../../ui/SearchableSelect';
import Button from '../../ui/Button';
import { resolveStorageUrl } from '@/lib/format';

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
  localitiesList: Array<{ id: string; type: 'CITY' | 'DISTRICT'; name: string; regionName?: string | null }>;
  localitiesLoading: boolean;
  fetchLocalitiesByPays: (paysId: string) => void;
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
  localitiesList,
  localitiesLoading,
  fetchLocalitiesByPays,
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

  // Prepare localities options
  const lieuNaissanceOptions = localitiesList.map(loc => ({
    value: loc.id,
    label: loc.name,
    subLabel: [loc.type === 'DISTRICT' ? 'District' : null, loc.regionName].filter(Boolean).join(' · ') || undefined,
  }));

  // User select options
  const userOptions = unlinkedUsers.map(u => ({
    value: u.id,
    label: `${u.nom} ${u.prenom || ''}`.trim(),
    subLabel: [u.email, u.telephone].filter(Boolean).join(' · ') || undefined,
    image: u.photoProfile || undefined,
  }));

  // Handle pays de naissance change
  const handlePaysNaissanceChange = (value: string | number) => {
    const paysId = String(value);
    updateField('paysNaissanceId', paysId);
    // Clear lieu de naissance when pays changes
    updateField('lieuNaissanceLocalityId', null);
    updateField('lieuNaissanceLocalityType', null);
    updateField('lieuNaissance', null);
    // Fetch localities for new pays
    if (paysId) {
      fetchLocalitiesByPays(paysId);
      // Auto-set nationalité if empty
      if (!formData.nationaliteId) {
        updateField('nationaliteId', paysId);
      }
    }
  };

  // Handle lieu de naissance change
  const handleLieuNaissanceChange = (value: string | number) => {
    const localityId = String(value);
    const locality = localitiesList.find(l => l.id === localityId);
    if (locality) {
      updateField('lieuNaissanceLocalityId', localityId);
      updateField('lieuNaissanceLocalityType', locality.type);
      updateField('lieuNaissance', locality.name);
    } else {
      updateField('lieuNaissanceLocalityId', null);
      updateField('lieuNaissanceLocalityType', null);
      updateField('lieuNaissance', null);
    }
  };

  return (
    <div className="space-y-6">
      {/* User Linking - Creation Mode Only */}
      {isCreationMode && (
        <div className="border border-accent/30 rounded-xl p-6 bg-accent/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
              <Link className="text-accent" size={20} />
            </div>
            <h3 className="text-lg font-semibold text-content-primary">Lier à un compte utilisateur</h3>
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
            <div className="mt-4 p-4 bg-surface rounded-lg border border-edge">
              <div className="flex items-start gap-4">
                {selectedUser.photoProfile ? (
                  <img
                    src={resolveStorageUrl(selectedUser.photoProfile)}
                    alt={selectedUser.nom}
                    className="w-16 h-16 rounded-full object-cover border-2 border-accent"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-surface-subtle flex items-center justify-center border-2 border-edge">
                    <User className="text-content-muted" size={28} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-content-primary text-lg">
                    {selectedUser.nom} {selectedUser.prenom || ''}
                  </div>
                  {selectedUser.email && (
                    <div className="text-sm text-content-secondary mt-1">{selectedUser.email}</div>
                  )}
                  {selectedUser.telephone && (
                    <div className="text-sm text-content-muted mt-1">{selectedUser.telephone}</div>
                  )}
                  {selectedUser.agenceNom && (
                    <div className="text-xs text-content-muted mt-2 flex items-center gap-2">
                      <Building2 size={14} />
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
      <div className="border border-edge rounded-xl p-6 bg-surface/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-surface-elevated flex items-center justify-center">
            <Building2 className="text-content-secondary" size={20} />
          </div>
          <h3 className="text-lg font-semibold text-content-primary">Affectation</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Agency */}
          {isCreationMode ? (
            // Creation mode: read-only from selected user
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
                Agence
                <span className="text-status-danger ml-1">*</span>
              </label>
              {selectedUser?.agenceId ? (
                <div className="w-full px-4 py-2.5 bg-surface-subtle border border-edge rounded-lg text-content-primary text-sm">
                  {selectedUser.agenceNom} {selectedUser.agenceCode && `(${selectedUser.agenceCode})`}
                </div>
              ) : (
                <div className="w-full px-4 py-2.5 bg-status-warning-bg border border-status-warning/30 rounded-lg text-status-warning text-sm flex items-center gap-2">
                  <AlertTriangle size={16} />
                  Aucune agence assignée à l'utilisateur
                </div>
              )}
            </div>
          ) : (
            // Edit mode: editable select
            <SelectField
              label="Agence"
              name="agenceId"
              value={agenceId}
              onChange={(e) => setAgenceId(e.target.value)}
              options={agences.map(a => ({ value: a.id, label: `${a.nom} (${a.code})` }))}
              required
              error={validationErrors.agenceId}
              containerClassName="py-1"
            />
          )}

          {/* Matricule */}
          <FormField
            label="Matricule"
            name="matricule"
            value={formData.matricule || ''}
            onChange={(e) => updateField('matricule', e.target.value)}
            placeholder="Généré automatiquement"
            disabled
            readOnly
            containerClassName="py-1"
          />
        </div>
      </div>

      {/* Identité */}
      <div className="border border-edge rounded-xl p-6 bg-surface/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-surface-elevated flex items-center justify-center">
            <User className="text-content-secondary" size={20} />
          </div>
          <h3 className="text-lg font-semibold text-content-primary">Identité</h3>
        </div>

        {/* Photo Upload */}
        <div className="mb-6">
          <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-3">
            Photo de profil
          </label>
          <div className="flex items-center gap-4">
            <div className="relative">
              {photoPreview || formData.photoProfile ? (
                <img
                  src={photoPreview || resolveStorageUrl(formData.photoProfile)}
                  alt="Photo de profil"
                  className="w-16 h-16 rounded-full object-cover border-2 border-edge"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-surface-subtle flex items-center justify-center border-2 border-edge">
                  <User className="text-content-muted" size={28} />
                </div>
              )}
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-surface/80 rounded-full">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
                disabled={isUploading}
              />
              <div className="px-4 py-2 bg-surface-elevated border border-edge rounded-lg hover:bg-surface transition-colors flex items-center gap-2 text-sm font-medium text-content-secondary">
                <Upload size={16} />
                {photoPreview || formData.photoProfile ? 'Changer la photo' : 'Télécharger une photo'}
              </div>
            </label>
          </div>
        </div>

        {/* Nom + Prénom */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
            containerClassName="py-1"
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
            containerClassName="py-1"
          />
        </div>

        {/* Sexe + Email + Téléphone */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            containerClassName="py-1"
          />
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
            containerClassName="py-1"
          />
          <FormField
            label="Téléphone"
            name="phone"
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="06 XXX XX XX"
            readOnly={isFieldReadOnly}
            disabled={isFieldReadOnly}
            error={validationErrors.phone}
            containerClassName="py-1"
          />
        </div>

        {/* Date de Naissance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormField
            label="Date de naissance"
            name="dateNaissance"
            type="date"
            value={formData.dateNaissance || ''}
            onChange={(e) => updateField('dateNaissance', e.target.value)}
            error={validationErrors.dateNaissance}
            containerClassName="py-1"
          />
        </div>

        {/* Pays de Naissance */}
        <div className="mb-4">
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
        </div>

        {/* Lieu de Naissance */}
        <div className="mb-4">
          <SearchableSelect
            label="Lieu de naissance"
            name="lieuNaissanceLocalityId"
            options={lieuNaissanceOptions}
            value={formData.lieuNaissanceLocalityId || ''}
            onChange={handleLieuNaissanceChange}
            placeholder={
              !formData.paysNaissanceId
                ? 'Sélectionnez d\'abord un pays'
                : 'Rechercher une ville ou district...'
            }
            disabled={!formData.paysNaissanceId}
            isLoading={localitiesLoading}
            error={validationErrors.lieuNaissanceLocalityId}
            showAvatarInTrigger={false}
          />
        </div>

        {/* Nationalité */}
        <div className="mb-4">
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

        {/* Adresse + Ville */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Adresse"
            name="adresse"
            value={formData.adresse || ''}
            onChange={(e) => updateField('adresse', e.target.value)}
            placeholder="Adresse complète"
            error={validationErrors.adresse}
            containerClassName="py-1"
          />
          <FormField
            label="Ville"
            name="ville"
            value={formData.ville || ''}
            onChange={(e) => updateField('ville', e.target.value)}
            placeholder="Ville"
            error={validationErrors.ville}
            containerClassName="py-1"
          />
        </div>
      </div>
    </div>
  );
}
