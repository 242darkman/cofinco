import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { X, Save, AlertTriangle, Upload, User, Users } from 'lucide-react';
import { Employe, EmployeFormData } from '../../hooks/hr/useEmployes';
import { Modal, FormField, SelectField, Button, ConfirmDialog } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import { useMinIOUpload } from '../../hooks/useMinIOUpload';
import { StatutUser } from '@shared/enum/status-constants';

// Patterns de validation
const VALIDATION_PATTERNS = {
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  phone: /^\+?[0-9]{8,15}$/, // Format international ou local (8-15 chiffres, + optionnel)
  cnss: /^[A-Z0-9]{6,20}$/i, // Format alphanumérique (6-20 caractères)
  matricule: /^[A-Z0-9-]{3,20}$/i, // Format alphanumérique avec tirets
};

// Âge minimum légal pour embauche (18 ans)
const MIN_AGE_EMBAUCHE = 18;
// Âge maximum réaliste (70 ans)
const MAX_AGE_EMBAUCHE = 70;

interface EmployeeFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EmployeFormData) => Promise<{ success: boolean; error?: string }>;
  editingEmploye: Employe | null;
  initialData: EmployeFormData;
  allEmployes?: Employe[]; // Liste des employés pour sélection du manager
}

export default function EmployeeForm({
  isOpen,
  onClose,
  onSave,
  editingEmploye,
  initialData,
  allEmployes = []
}: EmployeeFormProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canSaveEmployees = editingEmploye
    ? (hasPermission('rh', 'edit') || hasPermission('employes', 'edit'))
    : (hasPermission('rh', 'create') || hasPermission('employes', 'create'));

  const [formData, setFormData] = useState<EmployeFormData>(initialData);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialData.photoProfile || null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  // Référence pour détecter les modifications non sauvegardées
  const initialDataRef = useRef<string>(JSON.stringify(initialData));

  // Détection des modifications non sauvegardées
  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(formData) !== initialDataRef.current;
  }, [formData]);

  // Détection des références circulaires dans la hiérarchie
  // Vérifie si sélectionner `potentialManagerId` créerait une boucle
  const wouldCreateCircularReference = useCallback((potentialManagerId: string): boolean => {
    if (!editingEmploye?.id) return false; // Nouvel employé, pas de risque

    // Parcourir la chaîne hiérarchique du manager potentiel
    let currentId: string | null | undefined = potentialManagerId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === editingEmploye.id) {
        // Cercle détecté: le manager potentiel a l'employé actuel dans sa hiérarchie
        return true;
      }
      if (visited.has(currentId)) {
        // Boucle infinie détectée (données corrompues)
        break;
      }
      visited.add(currentId);

      // Trouver le manager du manager actuel
      const currentEmp = allEmployes.find(e => e.id === currentId);
      currentId = currentEmp?.managerId;
    }

    return false;
  }, [allEmployes, editingEmploye?.id]);

  // Liste des managers disponibles (exclure soi-même, les inactifs et ceux qui créeraient une boucle)
  const availableManagers = useMemo(() => {
    return allEmployes.filter(emp =>
      emp.id !== editingEmploye?.id && // Ne peut pas être son propre manager
      emp.statut === StatutUser.ACTIVE && // Seulement les employés actifs
      !wouldCreateCircularReference(emp.id) // Pas de référence circulaire
    ).map(emp => ({
      value: emp.id,
      label: `${emp.nom} ${emp.prenom} - ${emp.poste}`
    }));
  }, [allEmployes, editingEmploye?.id, wouldCreateCircularReference]);

  // Fonction de validation
  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    // Validation email (optionnel mais doit être valide si renseigné)
    if (formData.email && !VALIDATION_PATTERNS.email.test(formData.email)) {
      errors.email = 'Format email invalide (ex: nom@domaine.com)';
    }

    // Validation téléphone (optionnel mais doit être valide si renseigné)
    if (formData.phone) {
      const cleanPhone = formData.phone.replace(/[\s.-]/g, ''); // Nettoyer espaces, points, tirets
      if (!VALIDATION_PATTERNS.phone.test(cleanPhone)) {
        errors.phone = 'Format téléphone invalide (8-15 chiffres, + optionnel)';
      }
    }

    // Validation CNSS (optionnel mais doit être valide si renseigné)
    if (formData.numeroCnss && !VALIDATION_PATTERNS.cnss.test(formData.numeroCnss)) {
      errors.numeroCnss = 'Format CNSS invalide (6-20 caractères alphanumériques)';
    }

    // Validation matricule (obligatoire)
    if (!formData.matricule || !VALIDATION_PATTERNS.matricule.test(formData.matricule)) {
      errors.matricule = 'Matricule requis (3-20 caractères alphanumériques)';
    }

    // Validation salaire (doit être positif)
    const salary = parseFloat(formData.salaireBase);
    if (isNaN(salary) || salary < 0) {
      errors.salaireBase = 'Salaire invalide (doit être un nombre positif)';
    }

    // Validation cohérence des dates
    if (formData.dateNaissance && formData.dateEmbauche) {
      const birthDate = new Date(formData.dateNaissance);
      const hireDate = new Date(formData.dateEmbauche);
      const today = new Date();

      // Calcul de l'âge à l'embauche
      const ageAtHire = Math.floor((hireDate.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

      // Vérifier que la date de naissance est dans le passé
      if (birthDate >= today) {
        errors.dateNaissance = 'La date de naissance doit être dans le passé';
      }

      // Vérifier que la date d'embauche n'est pas dans le futur lointain (max +1 mois)
      const maxFutureHire = new Date();
      maxFutureHire.setMonth(maxFutureHire.getMonth() + 1);
      if (hireDate > maxFutureHire) {
        errors.dateEmbauche = "La date d'embauche ne peut pas être trop éloignée dans le futur";
      }

      // Vérifier l'âge minimum légal
      if (ageAtHire < MIN_AGE_EMBAUCHE) {
        errors.dateNaissance = `L'employé doit avoir au moins ${MIN_AGE_EMBAUCHE} ans à l'embauche (actuellement: ${ageAtHire} ans)`;
      }

      // Vérifier l'âge maximum réaliste
      if (ageAtHire > MAX_AGE_EMBAUCHE) {
        errors.dateNaissance = `L'âge à l'embauche semble incorrect (${ageAtHire} ans)`;
      }

      // Vérifier que l'embauche est après la naissance
      if (hireDate <= birthDate) {
        errors.dateEmbauche = "La date d'embauche doit être après la date de naissance";
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation avant soumission
    if (!validateForm()) {
      toast.error('Veuillez corriger les erreurs de validation');
      return;
    }

    setSaving(true);

    const result = await onSave(formData);
    setSaving(false);

    if (result.success) {
      toast.success('Employé sauvegardé avec succès');
      onClose();
    } else {
      toast.error(result.error || 'Erreur lors de la sauvegarde');
    }
  }, [formData, onSave, onClose, validateForm]);

  const updateField = (field: keyof EmployeFormData, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Mise à jour de la référence et reset du formulaire quand initialData change
  useEffect(() => {
    setFormData(initialData);
    setPhotoPreview(initialData.photoProfile || editingEmploye?.photoProfile || null);
    initialDataRef.current = JSON.stringify(initialData);
    setValidationErrors({});
  }, [initialData, editingEmploye]);

  // Gestion de la fermeture avec confirmation si modifications non sauvegardées
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedConfirm(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  const confirmClose = useCallback(() => {
    setShowUnsavedConfirm(false);
    onClose();
  }, [onClose]);

  const { uploadFile, isUploading } = useMinIOUpload({
    path: 'employees',
    isPublic: true,
    onError: (err) => toast.error(`Erreur upload: ${err.message}`)
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('La photo ne doit pas dépasser 2 Mo');
        return;
      }
      
      const url = await uploadFile(file);
      if (url) {
        setPhotoPreview(url);
        updateField('photoProfile', url);
      }
    }
  };

  const removePhoto = () => {
    setPhotoPreview(null);
    updateField('photoProfile', '');
  };

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={editingEmploye ? 'Modifier Employé' : 'Nouvel Employé'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photo Upload Section */}
        <div className="flex flex-col items-center gap-4 pb-4 border-b border-slate-700">
          <div className="relative">
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Photo de profil"
                className="w-24 h-24 rounded-full object-cover border-4 border-slate-600 shadow-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center border-4 border-slate-600 shadow-lg">
                <User size={40} className="text-white" />
              </div>
            )}
            {photoPreview && (
              <button
                type="button"
                onClick={removePhoto}
                className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg"
                title="Supprimer la photo"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <label className="cursor-pointer px-3 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-2 text-sm">
              <Upload size={16} />
              Uploader
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">JPG, PNG ou GIF. Max 2 Mo</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Matricule"
            name="matricule"
            type="text"
            value={formData.matricule}
            onChange={(e) => updateField('matricule', e.target.value)}
            required
            pattern="[A-Za-z0-9-]{3,20}"
            error={validationErrors.matricule}
          />
          
          <SelectField
            label="Sexe"
            name="sexe"
            value={formData.sexe}
            onChange={(e) => updateField('sexe', e.target.value as 'M' | 'F')}
            options={[
              { value: 'M', label: 'Masculin' },
              { value: 'F', label: 'Féminin' }
            ]}
            required
          />

          <FormField
            label="Nom"
            name="nom"
            type="text"
            value={formData.nom}
            onChange={(e) => updateField('nom', e.target.value)}
            required
          />

          <FormField
            label="Prénom"
            name="prenom"
            type="text"
            value={formData.prenom}
            onChange={(e) => updateField('prenom', e.target.value)}
            required
          />

          <FormField
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            pattern="[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
            error={validationErrors.email}
            placeholder="nom@domaine.com"
          />

          <FormField
            label="Téléphone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            pattern="\+?[0-9]{8,15}"
            error={validationErrors.phone}
            placeholder="+243 XXX XXX XXX"
          />

          <FormField
            label="Date de Naissance"
            name="dateNaissance"
            type="date"
            value={formData.dateNaissance}
            onChange={(e) => updateField('dateNaissance', e.target.value)}
            error={validationErrors.dateNaissance}
          />

          <FormField
            label="Date d'Embauche"
            name="dateEmbauche"
            type="date"
            value={formData.dateEmbauche}
            onChange={(e) => updateField('dateEmbauche', e.target.value)}
            required
            error={validationErrors.dateEmbauche}
          />

          <FormField
            label="Adresse"
            name="adresse"
            type="text"
            value={formData.adresse}
            onChange={(e) => updateField('adresse', e.target.value)}
          />

          <FormField
            label="Ville"
            name="ville"
            type="text"
            value={formData.ville}
            onChange={(e) => updateField('ville', e.target.value)}
          />

          <FormField
            label="Département"
            name="departement"
            type="text"
            value={formData.departement}
            onChange={(e) => updateField('departement', e.target.value)}
          />

          <FormField
            label="Poste"
            name="poste"
            type="text"
            value={formData.poste}
            onChange={(e) => updateField('poste', e.target.value)}
            required
          />

          <SelectField
            label="Type de Contrat"
            name="typeContrat"
            value={formData.typeContrat}
            onChange={(e) => updateField('typeContrat', e.target.value)}
            options={[
              { value: 'CDI', label: 'CDI' },
              { value: 'CDD', label: 'CDD' },
              { value: 'Stage', label: 'Stage' },
              { value: 'Freelance', label: 'Freelance' },
              { value: 'Temporaire', label: 'Temporaire' }
            ]}
            required
          />

          <FormField
            label="Salaire de Base (FCFA)"
            name="salaireBase"
            type="number"
            value={formData.salaireBase}
            onChange={(e) => updateField('salaireBase', e.target.value)}
            required
            min="0"
            error={validationErrors.salaireBase}
          />

          <FormField
            label="Numéro CNSS"
            name="numeroCnss"
            type="text"
            value={formData.numeroCnss}
            onChange={(e) => updateField('numeroCnss', e.target.value.toUpperCase())}
            pattern="[A-Za-z0-9]{6,20}"
            error={validationErrors.numeroCnss}
            placeholder="Ex: CNSS123456"
          />
        </div>

        {/* Section Hiérarchie - Sélection du Supérieur */}
        <div className="pt-4 border-t border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-indigo-400" />
            <h4 className="text-sm font-semibold text-white">Rattachement Hiérarchique</h4>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <SelectField
              label="Supérieur Hiérarchique (Manager)"
              name="managerId"
              value={formData.managerId || ''}
              onChange={(e) => updateField('managerId', e.target.value || null)}
              options={[
                { value: '', label: '— Aucun (Niveau Direction) —' },
                ...availableManagers
              ]}
              helperText="Sélectionnez le supérieur direct de cet employé pour l'organigramme"
            />
            {formData.managerId && (
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 p-2 rounded-lg">
                <User size={14} className="text-indigo-400" />
                <span>
                  Cet employé sera rattaché à{' '}
                  <span className="text-indigo-300 font-medium">
                    {availableManagers.find(m => m.value === formData.managerId)?.label || 'Manager sélectionné'}
                  </span>
                  {' '}dans l'organigramme
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={saving}
          >
            <X size={18} />
            Annuler
          </Button>
          {canSaveEmployees ? (
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
            >
              <Save size={18} />
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          ) : (
            <div className="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle size={16} />
              Permission requise
            </div>
          )}
        </div>
      </form>
    </Modal>

    {/* Confirmation pour modifications non sauvegardées */}
    <ConfirmDialog
      isOpen={showUnsavedConfirm}
      onClose={() => setShowUnsavedConfirm(false)}
      onConfirm={confirmClose}
      title="Modifications non sauvegardées"
      message="Vous avez des modifications non sauvegardées. Êtes-vous sûr de vouloir quitter sans sauvegarder ?"
      variant="warning"
      confirmText="Quitter sans sauvegarder"
      cancelText="Continuer l'édition"
    />
    </>
  );
}
