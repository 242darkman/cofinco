import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { X, Save, AlertTriangle, Upload, User, Users, Link, Building2 } from 'lucide-react';
import { Employe, EmployeFormData } from '../../hooks/hr/useEmployes';
import { Modal, FormField, SelectField, Button, ConfirmDialog } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import { useMinIOUpload } from '../../hooks/useMinIOUpload';
import { StatutUser } from '@shared/enum/status-constants';
import { agenceApi } from '../../lib/api-client';
import { resolveStorageUrl } from '@/lib/format';

// Patterns de validation
const VALIDATION_PATTERNS = {
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  phone: /^\+?[0-9]{8,15}$/, // Format international ou local (8-15 chiffres, + optionnel)
  cnss: /^[A-Z0-9]{6,20}$/i, // Format alphanumérique (6-20 caractères)
  matricule: /^EMP-[A-Z]{3}-\d{4}-[A-Z0-9]{4}$/i, // Format: EMP-XXX-YYYY-XXXX
};

// Âge minimum légal pour embauche (18 ans)
const MIN_AGE_EMBAUCHE = 18;
// Âge maximum réaliste (70 ans)
const MAX_AGE_EMBAUCHE = 70;

// Interface pour les users non liés à un employé
interface UnlinkedUser {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  sexe: string | null;
  photoProfile: string | null;
  // Agence affectée (récupérée depuis user_agences)
  agenceId: string | null;
  agenceNom: string | null;
  agenceCode: string | null;
}

// Interface pour les agences
interface Agence {
  id: string;
  nom: string;
  code: string;
}

// Modes de calcul de paie
const MODE_CALCUL_PAIE_OPTIONS = [
  { value: 'MONTHLY', label: 'Mensuel' },
  { value: 'HOURLY', label: 'Horaire' },
  { value: 'DAILY', label: 'Journalier' },
];

// Génération du matricule automatique
const generateMatricule = (agenceCode: string): string => {
  const year = new Date().getFullYear();
  const randomHex = Math.random().toString(16).substring(2, 6).toUpperCase();
  // Prendre les 3 premières lettres du code agence ou nom
  const agencePrefix = agenceCode
    .replace(/[^A-Za-z]/g, '')
    .substring(0, 3)
    .toUpperCase()
    .padEnd(3, 'X');
  return `EMP-${agencePrefix}-${year}-${randomHex}`;
};

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

  // Nouveaux états pour la liaison User et génération matricule
  const [unlinkedUsers, setUnlinkedUsers] = useState<UnlinkedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UnlinkedUser | null>(null);
  const [agences, setAgences] = useState<Agence[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [modeCalculPaie, setModeCalculPaie] = useState<'MONTHLY' | 'HOURLY' | 'DAILY'>('MONTHLY');
  const [agenceId, setAgenceId] = useState<string>('');

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

    // En mode création, vérifier qu'un user est sélectionné
    if (!editingEmploye && !selectedUserId) {
      errors.userId = 'Veuillez sélectionner un compte utilisateur à lier';
    }

    // Validation agence
    // En mode création: l'agence vient de l'utilisateur sélectionné
    // En mode édition: l'agence est sélectionnable
    if (!editingEmploye) {
      // Vérifier que l'utilisateur sélectionné a une agence affectée
      if (selectedUser && !selectedUser.agenceId) {
        errors.agenceId = "L'utilisateur sélectionné n'a pas d'agence affectée. Veuillez d'abord lui assigner une agence dans Administration.";
      }
    } else {
      // En mode édition, l'agence est requise
      if (!agenceId) {
        errors.agenceId = "L'agence est requise pour le matricule";
      }
    }

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

    // Validation matricule (obligatoire et format auto-généré)
    if (!formData.matricule) {
      errors.matricule = 'Matricule requis (sélectionnez une agence pour le générer)';
    } else if (!VALIDATION_PATTERNS.matricule.test(formData.matricule)) {
      errors.matricule = 'Format matricule invalide (EMP-XXX-YYYY-XXXX)';
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
  }, [formData, editingEmploye, selectedUserId, selectedUser, agenceId]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation avant soumission
    if (!validateForm()) {
      toast.error('Veuillez corriger les erreurs de validation');
      return;
    }

    setSaving(true);

    // Enrichir formData avec les nouveaux champs
    const enrichedData = {
      ...formData,
      userId: selectedUserId, // Lier au user sélectionné
      agenceId: agenceId,
      modeCalculPaie: modeCalculPaie,
    };

    const result = await onSave(enrichedData as any);
    setSaving(false);

    if (result.success) {
      toast.success('Employé sauvegardé avec succès');
      onClose();
    } else {
      toast.error(result.error || 'Erreur lors de la sauvegarde');
    }
  }, [formData, onSave, onClose, validateForm, selectedUserId, agenceId, modeCalculPaie]);

  const updateField = (field: keyof EmployeFormData, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Mise à jour de la référence et reset du formulaire quand initialData change
  useEffect(() => {
    setFormData(initialData);
    setPhotoPreview(initialData.photoProfile || editingEmploye?.photoProfile || null);
    initialDataRef.current = JSON.stringify(initialData);
    setValidationErrors({});
    // Reset user selection for new employee
    if (!editingEmploye) {
      setSelectedUserId(null);
      setSelectedUser(null);
      setAgenceId('');
      setModeCalculPaie('MONTHLY');
    }
  }, [initialData, editingEmploye]);

  // Charger les agences
  useEffect(() => {
    const loadAgences = async () => {
      try {
        const data = await agenceApi.getAll({ statut: 'ACTIVE' });
        setAgences(data.map((a: any) => ({
          id: a.id,
          nom: a.nom,
          code: a.code || a.nom.substring(0, 3).toUpperCase(),
        })));
      } catch (error) {
        console.error('Erreur chargement agences:', error);
      }
    };
    loadAgences();
  }, []);

  // Charger les users non liés à un employé (uniquement en mode création)
  useEffect(() => {
    if (editingEmploye) return; // Ne pas charger en mode édition

    const loadUnlinkedUsers = async () => {
      setLoadingUsers(true);
      try {
        // Récupérer tous les users
        const usersRes = await fetch('/api/users', { credentials: 'include' });
        const allUsers: any[] = await usersRes.json();

        // Récupérer tous les employés pour filtrer
        const employesRes = await fetch('/api/employes', { credentials: 'include' });
        const allEmployesData: any[] = await employesRes.json();

        // Récupérer toutes les agences pour la correspondance
        const agencesRes = await fetch('/api/agences', { credentials: 'include' });
        const allAgences: any[] = await agencesRes.json();
        const agenceMap = new Map(allAgences.map((a: any) => [a.id, a]));

        // IDs des users déjà liés à un employé
        const linkedUserIds = new Set(allEmployesData.map((e: any) => e.userId));

        // Filtrer pour ne garder que les users sans employé et avec typeCompte = 'employe'
        // Et récupérer leur agence affectée
        const unlinkedPromises = allUsers
          .filter((u: any) =>
            !linkedUserIds.has(u.id) &&
            u.typeCompte === 'employe' &&
            u.statut === StatutUser.ACTIVE
          )
          .map(async (u: any) => {
            // Récupérer l'agence affectée de l'utilisateur
            let userAgence = null;
            try {
              const userAgencesRes = await fetch(`/api/users/${u.id}/agences`, { credentials: 'include' });
              if (userAgencesRes.ok) {
                const userAgences: any[] = await userAgencesRes.json();
                // Prendre la première agence affectée (ou agence principale)
                if (userAgences.length > 0) {
                  const agenceId = userAgences[0].agenceId || userAgences[0].id;
                  userAgence = agenceMap.get(agenceId);
                }
              }
            } catch {
              // Ignorer les erreurs de récupération d'agence
            }

            return {
              id: u.id,
              nom: u.nom,
              prenom: u.prenom,
              email: u.email,
              telephone: u.telephone,
              sexe: u.sexe,
              photoProfile: u.photoProfile,
              // Agence affectée
              agenceId: userAgence?.id || null,
              agenceNom: userAgence?.nom || null,
              agenceCode: userAgence?.code || userAgence?.nom?.substring(0, 3).toUpperCase() || null,
            };
          });

        const unlinked = await Promise.all(unlinkedPromises);
        setUnlinkedUsers(unlinked);
      } catch (error) {
        console.error('Erreur chargement users non liés:', error);
      } finally {
        setLoadingUsers(false);
      }
    };

    if (isOpen && !editingEmploye) {
      loadUnlinkedUsers();
    }
  }, [isOpen, editingEmploye]);

  // Quand un user est sélectionné, mettre à jour les champs d'identité ET l'agence
  useEffect(() => {
    if (selectedUserId) {
      const user = unlinkedUsers.find(u => u.id === selectedUserId);
      if (user) {
        setSelectedUser(user);
        // Mettre à jour les champs du formulaire avec les données du user
        setFormData(prev => ({
          ...prev,
          nom: user.nom,
          prenom: user.prenom || '',
          email: user.email || '',
          phone: user.telephone || '',
          sexe: (user.sexe as 'M' | 'F') || 'M',
          photoProfile: user.photoProfile || '',
        }));
        if (user.photoProfile) {
          setPhotoPreview(user.photoProfile);
        }

        // Auto-peupler l'agence depuis l'affectation de l'utilisateur
        if (user.agenceId) {
          setAgenceId(user.agenceId);
          // Générer automatiquement le matricule
          const newMatricule = generateMatricule(user.agenceCode || user.agenceNom || 'XXX');
          updateField('matricule', newMatricule);
        } else {
          // L'utilisateur n'a pas d'agence affectée - afficher un warning
          setAgenceId('');
          updateField('matricule', '');
        }
      }
    } else {
      setSelectedUser(null);
      // Reset agence et matricule quand aucun user n'est sélectionné
      if (!editingEmploye) {
        setAgenceId('');
        updateField('matricule', '');
      }
    }
  }, [selectedUserId, unlinkedUsers, editingEmploye]);

  // Note: Le matricule est maintenant généré automatiquement dans le useEffect de sélection du user

  // Libellé dynamique pour le taux de paiement
  const tauxPaiementLabel = useMemo(() => {
    switch (modeCalculPaie) {
      case 'HOURLY': return 'Taux Horaire (FCFA/h)';
      case 'DAILY': return 'Taux Journalier (FCFA/jour)';
      default: return 'Salaire de Base (FCFA/mois)';
    }
  }, [modeCalculPaie]);

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
        {/* Section 1: Liaison avec un compte utilisateur (mode création uniquement) */}
        {!editingEmploye && (
          <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Link size={18} className="text-indigo-400" />
              <h4 className="text-sm font-semibold text-white">Lier à un compte utilisateur</h4>
            </div>

            <SelectField
              label="Sélectionner un compte utilisateur"
              name="userId"
              value={selectedUserId || ''}
              onChange={(e) => setSelectedUserId(e.target.value || null)}
              options={[
                { value: '', label: loadingUsers ? 'Chargement...' : '-- Sélectionner un utilisateur --' },
                ...unlinkedUsers.map(u => ({
                  value: u.id,
                  label: `${u.prenom || ''} ${u.nom} ${u.email ? `(${u.email})` : ''}`.trim()
                }))
              ]}
              error={validationErrors.userId}
              helperText={unlinkedUsers.length === 0 && !loadingUsers
                ? "Aucun compte utilisateur disponible. Créez d'abord un compte dans Administration > Gestion Profils."
                : "Seuls les comptes utilisateurs sans fiche employé sont affichés."
              }
              required
            />

            {selectedUser && (
              <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center overflow-hidden">
                  {selectedUser.photoProfile ? (
                    <img src={resolveStorageUrl(selectedUser.photoProfile)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={24} className="text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-white">{selectedUser.prenom} {selectedUser.nom}</p>
                  <p className="text-xs text-slate-400">{selectedUser.email || 'Pas d\'email'}</p>
                  <p className="text-xs text-slate-500">{selectedUser.telephone || 'Pas de téléphone'}</p>
                </div>
                <div className="text-emerald-400 text-xs font-medium">Sélectionné ✓</div>
              </div>
            )}
          </div>
        )}

        {/* Section 2: Agence et Matricule */}
        <div className="p-4 bg-slate-800/30 border border-slate-700 rounded-xl space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={18} className="text-cyan-400" />
            <h4 className="text-sm font-semibold text-white">Affectation & Matricule</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* En mode création: afficher l'agence de l'utilisateur (lecture seule) */}
            {!editingEmploye ? (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-300">
                  Agence d'affectation
                  <span className="ml-1 text-xs text-slate-500">(définie par l'Admin)</span>
                </label>
                {selectedUser ? (
                  selectedUser.agenceId ? (
                    <div className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                      <Building2 size={16} className="text-cyan-400" />
                      <span className="text-white font-medium">{selectedUser.agenceNom}</span>
                      <span className="text-xs text-slate-400">({selectedUser.agenceCode})</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                      <AlertTriangle size={16} className="text-amber-400" />
                      <span className="text-amber-400 text-sm">
                        Cet utilisateur n'a pas d'agence affectée.
                        Veuillez d'abord assigner une agence dans Administration.
                      </span>
                    </div>
                  )
                ) : (
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 text-slate-500 text-sm">
                    Sélectionnez d'abord un utilisateur ci-dessus
                  </div>
                )}
              </div>
            ) : (
              /* En mode édition: permettre de changer l'agence */
              <SelectField
                label="Agence d'affectation *"
                name="agenceId"
                value={agenceId}
                onChange={(e) => setAgenceId(e.target.value)}
                options={[
                  { value: '', label: '-- Sélectionner une agence --' },
                  ...agences.map(a => ({ value: a.id, label: a.nom }))
                ]}
                error={validationErrors.agenceId}
                required
              />
            )}

            <FormField
              label="Matricule (auto-généré)"
              name="matricule"
              type="text"
              value={formData.matricule}
              onChange={(e) => updateField('matricule', e.target.value)}
              required
              readOnly={!editingEmploye}
              error={validationErrors.matricule}
              className={!editingEmploye ? 'bg-slate-700/50 cursor-not-allowed' : ''}
              helperText={editingEmploye ? 'Modifiable en édition' : 'Généré automatiquement à partir de l\'agence'}
            />
          </div>
        </div>

        {/* Section 3: Identité (lecture seule si user sélectionné, éditable sinon) */}
        <div className="p-4 bg-slate-800/30 border border-slate-700 rounded-xl space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <User size={18} className="text-slate-400" />
            <h4 className="text-sm font-semibold text-white">Identité</h4>
            {selectedUser && !editingEmploye && (
              <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded-full">
                Récupéré du compte utilisateur
              </span>
            )}
          </div>

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
              {photoPreview && !selectedUser && (
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
            {!selectedUser && (
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
            )}
            <p className="text-xs text-slate-500">JPG, PNG ou GIF. Max 2 Mo</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Nom"
              name="nom"
              type="text"
              value={formData.nom}
              onChange={(e) => updateField('nom', e.target.value)}
              required
              readOnly={!!selectedUser && !editingEmploye}
              className={selectedUser && !editingEmploye ? 'bg-slate-700/50 cursor-not-allowed' : ''}
            />

            <FormField
              label="Prénom"
              name="prenom"
              type="text"
              value={formData.prenom}
              onChange={(e) => updateField('prenom', e.target.value)}
              required
              readOnly={!!selectedUser && !editingEmploye}
              className={selectedUser && !editingEmploye ? 'bg-slate-700/50 cursor-not-allowed' : ''}
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
              disabled={!!selectedUser && !editingEmploye}
            />

            <FormField
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              readOnly={!!selectedUser && !editingEmploye}
              className={selectedUser && !editingEmploye ? 'bg-slate-700/50 cursor-not-allowed' : ''}
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
              readOnly={!!selectedUser && !editingEmploye}
              className={selectedUser && !editingEmploye ? 'bg-slate-700/50 cursor-not-allowed' : ''}
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
          </div>
        </div>

        {/* Section 4: Contrat RH */}
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h4 className="text-sm font-semibold text-white">Contrat & Rémunération</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Date d'Embauche *"
              name="dateEmbauche"
              type="date"
              value={formData.dateEmbauche}
              onChange={(e) => updateField('dateEmbauche', e.target.value)}
              required
              error={validationErrors.dateEmbauche}
            />

            <SelectField
              label="Type de Contrat *"
              name="typeContrat"
              value={formData.typeContrat}
              onChange={(e) => updateField('typeContrat', e.target.value)}
              options={[
                { value: 'CDI', label: 'CDI - Contrat à Durée Indéterminée' },
                { value: 'CDD', label: 'CDD - Contrat à Durée Déterminée' },
                { value: 'Stage', label: 'Stage' },
              ]}
              required
            />

            <FormField
              label="Département"
              name="departement"
              type="text"
              value={formData.departement}
              onChange={(e) => updateField('departement', e.target.value)}
              placeholder="Ex: Finance, IT, Commercial..."
            />

            <FormField
              label="Poste *"
              name="poste"
              type="text"
              value={formData.poste}
              onChange={(e) => updateField('poste', e.target.value)}
              required
              placeholder="Ex: Caissier Principal, Agent Commercial..."
            />

            <SelectField
              label="Mode de Calcul Paie *"
              name="modeCalculPaie"
              value={modeCalculPaie}
              onChange={(e) => setModeCalculPaie(e.target.value as 'MONTHLY' | 'HOURLY' | 'DAILY')}
              options={MODE_CALCUL_PAIE_OPTIONS}
              required
              helperText="Détermine le type de rémunération"
            />

            <FormField
              label={tauxPaiementLabel + ' *'}
              name="salaireBase"
              type="number"
              value={formData.salaireBase}
              onChange={(e) => updateField('salaireBase', e.target.value)}
              required
              min="0"
              error={validationErrors.salaireBase}
              placeholder={modeCalculPaie === 'HOURLY' ? '2500' : modeCalculPaie === 'DAILY' ? '15000' : '150000'}
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
              helperText="Numéro CNSS (optionnel)"
            />
          </div>
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
