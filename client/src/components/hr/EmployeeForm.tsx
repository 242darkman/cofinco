import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { X, Save, AlertTriangle, Upload, User, Users, Link, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Employe, EmployeFormData } from '../../hooks/hr/useEmployes';
import { Modal, FormField, SelectField, Button, ConfirmDialog } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import { useEntityUpload } from '../../hooks/useEntityUpload';
import { StatutUser } from '@shared/enum/status-constants';
import { agenceApi } from '../../lib/api-client';
import { resolveStorageUrl } from '@/lib/format';

// Patterns de validation
const VALIDATION_PATTERNS = {
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  phone: /^\+?[0-9]{8,15}$/, // Format international ou local (8-15 chiffres, + optionnel)
  cnss: /^[A-Z0-9-]{6,20}$/i, // Format alphanumérique avec tirets (6-20 caractères)
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

// Interface pour les départements et postes
interface Department {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
}

interface JobPosition {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  isActive?: boolean;
  department: {
    id: string;
    code: string;
    name: string;
  };
}

// Modes de calcul de paie
const MODE_CALCUL_PAIE_OPTIONS = [
  { value: 'MONTHLY', label: 'Mensuel' },
  { value: 'HOURLY', label: 'Horaire' },
  { value: 'DAILY', label: 'Journalier' },
];

// Génération du matricule automatique
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

  // États pour départements et postes
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobPositions, setJobPositions] = useState<JobPosition[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [selectedJobPositionId, setSelectedJobPositionId] = useState<string | null>(null);

  // Tabs state
  const [activeTab, setActiveTab] = useState<'identity' | 'contract'>('identity');

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

  // Fonction de validation - retourne l'objet errors pour usage immédiat
  const validateForm = useCallback((scope: 'all' | 'identity' | 'contract' = 'all'): Record<string, string> => {
    const errors: Record<string, string> = {};

    // --- VALIDATION IDENTITÉ (Tab 1) ---
    if (scope === 'all' || scope === 'identity') {
      // En mode création, vérifier qu'un user est sélectionné
      if (!editingEmploye && !selectedUserId) {
        errors.userId = 'Veuillez sélectionner un compte utilisateur à lier';
      }

      // Validation agence
      if (!editingEmploye) {
        if (selectedUser && !selectedUser.agenceId) {
          errors.agenceId = "L'utilisateur sélectionné n'a pas d'agence affectée.";
        }
      } else {
        if (!agenceId) {
          errors.agenceId = "L'agence est requise";
        }
      }

      // Validation email
      if (formData.email && !VALIDATION_PATTERNS.email.test(formData.email)) {
        errors.email = 'Format email invalide';
      }

      // Validation téléphone
      if (formData.phone) {
        const cleanPhone = formData.phone.replace(/[\s.-]/g, '');
        if (!VALIDATION_PATTERNS.phone.test(cleanPhone)) {
          errors.phone = 'Format téléphone invalide';
        }
      }
      
      // Validationchamps requis Identité (Nom/Prénom/Sexe auto-gérés ou requis par HTML, mais ajoutons la sécu)
      if (!formData.nom) errors.nom = 'Requis';
    }

    // --- VALIDATION CONTRAT (Tab 2) ---
    if (scope === 'all' || scope === 'contract') {
      // Validation poste
      if (!selectedJobPositionId) {
        errors.jobPositionId = 'Le poste est requis';
      }

      // Validation salaire
      const salary = parseFloat(formData.salaireBase);
      if (isNaN(salary) || salary < 0) {
        errors.salaireBase = 'Salaire invalide';
      }

      // Validation CNSS
      if (formData.numeroCnss && !VALIDATION_PATTERNS.cnss.test(formData.numeroCnss)) {
        errors.numeroCnss = 'Format CNSS invalide';
      }
      
      // Validation Date Embauche
      if (!formData.dateEmbauche) {
        errors.dateEmbauche = "Date d'embauche requise";
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

        // Vérifier que la date d'embauche n'est pas dans le futur lointain
        const maxFutureHire = new Date();
        maxFutureHire.setMonth(maxFutureHire.getMonth() + 1);
        if (hireDate > maxFutureHire) {
          errors.dateEmbauche = "La date d'embauche ne peut pas être trop éloignée";
        }

        // Vérifier l'âge minimum légal
        if (ageAtHire < MIN_AGE_EMBAUCHE) {
          errors.dateNaissance = `Age min: ${MIN_AGE_EMBAUCHE} ans (actuellement: ${ageAtHire})`;
        }

        // Vérifier l'âge maximum réaliste
        if (ageAtHire > MAX_AGE_EMBAUCHE) {
          errors.dateNaissance = `Age invalide (${ageAtHire} ans)`;
        }

        // Vérifier que l'embauche est après la naissance
        if (hireDate <= birthDate) {
          errors.dateEmbauche = "Embauche avant naissance impossible";
        }
      }
    }

    // Mise à jour des erreurs: SI on valide 'all', on remplace tout. Si on valide partiel, on merge.
    if (scope === 'all') {
      setValidationErrors(errors);
    } else {
      setValidationErrors(prev => ({ ...prev, ...errors }));
    }

    // Retourne l'objet errors pour usage immédiat (car setState est async)
    return errors;
  }, [formData, editingEmploye, selectedUserId, selectedUser, agenceId, selectedJobPositionId]);

  const handleNextTab = () => {
    // Passer directement à l'onglet suivant sans bloquer
    setActiveTab('contract');
    // Scroll top
    const modalBody = document.querySelector('.overflow-y-auto');
    if (modalBody) modalBody.scrollTop = 0;
  };

  // Vérifier si le formulaire est complet pour activer le bouton de soumission
  const isFormComplete = useMemo(() => {
    // Vérifications Tab 1 - Identité
    if (!editingEmploye && !selectedUserId) return false;
    if (!editingEmploye && selectedUser && !selectedUser.agenceId) return false;
    if (editingEmploye && !agenceId) return false;
    if (!formData.nom) return false;
    if (formData.email && !VALIDATION_PATTERNS.email.test(formData.email)) return false;
    if (formData.phone) {
      const cleanPhone = formData.phone.replace(/[\s.-]/g, '');
      if (!VALIDATION_PATTERNS.phone.test(cleanPhone)) return false;
    }

    // Vérifications Tab 2 - Contrat
    if (!selectedJobPositionId) return false;
    if (!formData.dateEmbauche) return false;
    const salary = parseFloat(formData.salaireBase);
    if (isNaN(salary) || salary < 0) return false;
    if (formData.numeroCnss && !VALIDATION_PATTERNS.cnss.test(formData.numeroCnss)) return false;

    return true;
  }, [formData, editingEmploye, selectedUserId, selectedUser, agenceId, selectedJobPositionId]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation avant soumission
    const errors = validateForm('all');
    if (Object.keys(errors).length > 0) {
      const errorMessages = Object.entries(errors)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join(', ');
      toast.error(`Veuillez corriger: ${errorMessages}`);
      return;
    }

    setSaving(true);

    // Enrichir formData avec les nouveaux champs
    const enrichedData = {
      ...formData,
      userId: selectedUserId, // Lier au user sélectionné
      agenceId: agenceId,
      modeCalculPaie: modeCalculPaie,
      jobPositionId: selectedJobPositionId, // Poste lié au département
      // Send temp entity ID so the server can relocate uploaded files
      ...(editingEmploye ? {} : { tempEntityId: tempEmployeIdRef.current }),
    };

    const result = await onSave(enrichedData as any);
    setSaving(false);

    if (result.success) {
      toast.success('Employé sauvegardé avec succès');
      onClose();
    } else {
      toast.error(result.error || 'Erreur lors de la sauvegarde');
    }
  }, [formData, onSave, onClose, validateForm, selectedUserId, agenceId, modeCalculPaie, selectedJobPositionId]);

  const updateField = (field: keyof EmployeFormData, value: string | null) => {
    // Convertir null en string vide pour éviter les warnings React controlled/uncontrolled
    setFormData(prev => ({ ...prev, [field]: value ?? '' }));
  };

  // Mise à jour de la référence et reset du formulaire quand le modal s'ouvre ou l'employé change
  // On utilise editingEmploye?.id pour éviter de se déclencher à chaque render
  // On compare le JSON stringifié de initialData pour détecter les vrais changements
  const initialDataJson = JSON.stringify(initialData);
  const prevInitialDataJsonRef = useRef<string | null>(null);

  useEffect(() => {
    // Réinitialiser la ref quand le modal se ferme
    if (!isOpen) {
      prevInitialDataJsonRef.current = null;
      return;
    }

    // Ne réinitialiser que si initialData a vraiment changé
    if (prevInitialDataJsonRef.current === initialDataJson) return;
    prevInitialDataJsonRef.current = initialDataJson;

    setFormData(initialData);
    setPhotoPreview(initialData.photoProfile || editingEmploye?.photoProfile || null);
    initialDataRef.current = initialDataJson;
    setValidationErrors({});

    // Reset user selection for new employee
    if (!editingEmploye) {
      setSelectedUserId(null);
      setSelectedUser(null);
      setAgenceId('');
      setModeCalculPaie('MONTHLY');
      setSelectedDepartmentId(null);
      setSelectedJobPositionId(null);
    } else {
      // En mode édition, charger les valeurs existantes depuis initialData
      setAgenceId(initialData.agenceId || '');
      setModeCalculPaie(initialData.modeCalculPaie || 'MONTHLY');
      // Charger le département et le poste existants
      const jobPosId = initialData.jobPositionId;
      if (jobPosId) {
        setSelectedJobPositionId(jobPosId);
        // Le département sera défini quand les jobPositions seront chargés
      } else {
        setSelectedJobPositionId(null);
        setSelectedDepartmentId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingEmploye?.id, initialDataJson]);

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

  // Charger les départements et postes
  useEffect(() => {
    const loadDepartmentsAndPositions = async () => {
      try {
        // Charger les départements
        const deptRes = await fetch('/api/departments', { credentials: 'include' });
        if (deptRes.ok) {
          const depts = await deptRes.json();
          setDepartments(depts.filter((d: Department) => d.isActive !== false));
        }

        // Charger les postes
        const posRes = await fetch('/api/job-positions', { credentials: 'include' });
        if (posRes.ok) {
          const positions = await posRes.json();
          setJobPositions(positions.filter((p: JobPosition) => p.isActive !== false));
        }
      } catch (error) {
        console.error('Erreur chargement départements/postes:', error);
      }
    };
    loadDepartmentsAndPositions();
  }, []);

  // Définir le département quand le poste est sélectionné (utile en mode édition pour charger le département initial)
  // Cet effet ne doit s'exécuter que lorsque:
  // 1. Un poste est sélectionné ET
  // 2. Le département correspondant n'est pas déjà sélectionné (pour éviter boucle infinie)
  useEffect(() => {
    if (selectedJobPositionId && jobPositions.length > 0) {
      const position = jobPositions.find(p => p.id === selectedJobPositionId);
      if (position && position.departmentId !== selectedDepartmentId) {
        setSelectedDepartmentId(position.departmentId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobPositionId, jobPositions]);

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
        } else {
          // L'utilisateur n'a pas d'agence affectée - afficher un warning
          setAgenceId('');
        }
      }
    } else {
      setSelectedUser(null);
      // Reset agence quand aucun user n'est sélectionné
      if (!editingEmploye) {
        setAgenceId('');
      }
    }
  }, [selectedUserId, unlinkedUsers, editingEmploye]);

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

  const tempEmployeIdRef = useRef(crypto.randomUUID());
  const { uploadFile, isUploading } = useEntityUpload({
    fileType: 'profile',
    entityType: 'employe',
    entityId: editingEmploye?.id || tempEmployeIdRef.current,
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
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* TAB NAVIGATION */}
        <div className="flex p-1 bg-slate-800 rounded-lg mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('identity')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'identity' 
                ? 'bg-indigo-600 text-white shadow-lg' 
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            1. Informations Personnelles
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('contract')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'contract' 
                ? 'bg-indigo-600 text-white shadow-lg' 
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            2. Contrat & Poste
          </button>
        </div>

        {/* --- TAB 1: IDENTITÉ --- */}
        {activeTab === 'identity' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
            {/* Section 1: Liaison avec un compte utilisateur (mode création uniquement) */}
            {!editingEmploye && (
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Link size={16} className="text-indigo-400" />
                  <h4 className="text-sm font-semibold text-white">Lier à un compte utilisateur</h4>
                </div>
  
                <SelectField
                  label=""
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
                />
  
                {selectedUser && (
                  <div className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center overflow-hidden">
                      {selectedUser.photoProfile ? (
                        <img src={resolveStorageUrl(selectedUser.photoProfile)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User size={20} className="text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{selectedUser.prenom} {selectedUser.nom}</p>
                      <p className="text-[10px] text-slate-400">{selectedUser.email || 'Pas d\'email'} • {selectedUser.telephone || 'Pas de téléphone'}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
  
            {/* Section 2: Agence et Matricule */}
            <div className="p-3 bg-slate-800/30 border border-slate-700 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-cyan-400" />
                <h4 className="text-sm font-semibold text-white">Affectation</h4>
              </div>
  
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* En mode création: afficher l'agence de l'utilisateur (lecture seule) */}
                {!editingEmploye ? (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-300">
                      Agence <span className="text-red-500">*</span>
                    </label>
                    {selectedUser ? (
                      selectedUser.agenceId ? (
                        <div className="flex items-center gap-2 p-2 bg-slate-700/50 rounded border border-slate-600">
                          <Building2 size={14} className="text-cyan-400" />
                          <span className="text-white text-sm font-medium">{selectedUser.agenceNom}</span>
                          <span className="text-xs text-slate-400">({selectedUser.agenceCode})</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-2 bg-amber-500/10 rounded border border-amber-500/30">
                          <AlertTriangle size={14} className="text-amber-400" />
                          <span className="text-amber-400 text-xs">Aucune agence affectée</span>
                        </div>
                      )
                    ) : (
                      <div className="p-2 bg-slate-800/50 rounded border border-slate-700 text-slate-500 text-xs">
                        Sélectionnez d'abord un utilisateur
                      </div>
                    )}
                  </div>
                ) : (
                  <SelectField
                    label="Agence d'affectation"
                    name="agenceId"
                    value={agenceId}
                    onChange={(e) => setAgenceId(e.target.value)}
                    options={[
                      { value: '', label: '-- Sélectionner --' },
                      ...agences.map(a => ({ value: a.id, label: a.nom }))
                    ]}
                    error={validationErrors.agenceId}
                    required
                  />
                )}
  
                {/* Matricule */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">Matricule</label>
                  <div className="flex items-center gap-2 p-2 bg-slate-800/50 rounded border border-slate-700 text-slate-300 text-sm">
                    {editingEmploye && formData.matricule ? formData.matricule : 'Généré automatiquement'}
                  </div>
                </div>
              </div>
            </div>
  
            {/* Section 3: Identité */}
            <div className="p-3 bg-slate-800/30 border border-slate-700 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <User size={16} className="text-slate-400" />
                <h4 className="text-sm font-semibold text-white">Identité</h4>
              </div>
  
              {/* Photo Compact */}
              <div className="flex items-center gap-4">
                 <div className="relative shrink-0">
                    {photoPreview ? (
                      <img src={resolveStorageUrl(photoPreview)} className="w-16 h-16 rounded-full object-cover border-2 border-slate-600" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600">
                        <User size={24} className="text-slate-500" />
                      </div>
                    )}
                    {!selectedUser && (
                       <label className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-500 transition-colors">
                          <Upload size={12} className="text-white" />
                          <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                       </label>
                    )}
                 </div>
                 <div className="flex-1 grid grid-cols-2 gap-3">
                   <FormField label="Nom" name="nom" value={formData.nom || ''} onChange={(e) => updateField('nom', e.target.value)} required readOnly={!!selectedUser && !editingEmploye} className="py-1" />
                   <FormField label="Prénom" name="prenom" value={formData.prenom || ''} onChange={(e) => updateField('prenom', e.target.value)} required readOnly={!!selectedUser && !editingEmploye} className="py-1" />
                 </div>
              </div>
  
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <SelectField label="Sexe" name="sexe" value={formData.sexe || 'M'} onChange={(e) => updateField('sexe', e.target.value as 'M' | 'F')} options={[{ value: 'M', label: 'Masculin' }, { value: 'F', label: 'Féminin' }]} required />
                <FormField label="Email" name="email" type="email" value={formData.email || ''} onChange={(e) => updateField('email', e.target.value)} readOnly={!!selectedUser && !editingEmploye} error={validationErrors.email} className="py-1" />
                <FormField label="Téléphone" name="phone" type="tel" value={formData.phone || ''} onChange={(e) => updateField('phone', e.target.value)} readOnly={!!selectedUser && !editingEmploye} error={validationErrors.phone} className="py-1" />
              </div>

               <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField label="Date de Naissance" name="dateNaissance" type="date" value={formData.dateNaissance || ''} onChange={(e) => updateField('dateNaissance', e.target.value)} error={validationErrors.dateNaissance} className="py-1" />
                  <FormField label="Adresse" name="adresse" value={formData.adresse || ''} onChange={(e) => updateField('adresse', e.target.value)} className="py-1" />
                  <FormField label="Ville" name="ville" value={formData.ville || ''} onChange={(e) => updateField('ville', e.target.value)} className="py-1" />
               </div>
            </div>
          </div>
        )}

        {/* --- TAB 2: CONTRAT & POSTE --- */}
        {activeTab === 'contract' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Section 4: Contrat RH */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-emerald-400" />
                <h4 className="text-sm font-semibold text-white">Contrat & Rémunération</h4>
              </div>
  
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField
                  label="Date d'Embauche"
                  name="dateEmbauche"
                  type="date"
                  value={formData.dateEmbauche || ''}
                  onChange={(e) => updateField('dateEmbauche', e.target.value)}
                  required
                  error={validationErrors.dateEmbauche}
                  className="py-1"
                />
  
                <SelectField
                  label="Type de Contrat"
                  name="typeContrat"
                  value={formData.typeContrat || 'CDI'}
                  onChange={(e) => updateField('typeContrat', e.target.value)}
                  options={[
                    { value: 'CDI', label: 'CDI' },
                    { value: 'CDD', label: 'CDD' },
                    { value: 'Stage', label: 'Stage' },
                  ]}
                  required
                />
  
                <SelectField
                  label="Département"
                  name="departmentId"
                  value={selectedDepartmentId || ''}
                  onChange={(e) => {
                    const deptId = e.target.value || null;
                    setSelectedDepartmentId(deptId);
                    setSelectedJobPositionId(null);
                  }}
                  options={[
                    { value: '', label: '...' },
                    ...departments.map(d => ({ value: d.id, label: d.name }))
                  ]}
                />
  
                <SelectField
                  label="Poste"
                  name="jobPositionId"
                  value={selectedJobPositionId || ''}
                  onChange={(e) => setSelectedJobPositionId(e.target.value || null)}
                  options={[
                    { value: '', label: '...' },
                    ...jobPositions
                      .filter(p => !selectedDepartmentId || p.departmentId === selectedDepartmentId)
                      .map(p => ({ value: p.id, label: p.name }))
                  ]}
                  required
                  disabled={!selectedDepartmentId}
                  error={validationErrors.jobPositionId}
                />
  
                <SelectField
                  label="Mode Calcul"
                  name="modeCalculPaie"
                  value={modeCalculPaie}
                  onChange={(e) => setModeCalculPaie(e.target.value as 'MONTHLY' | 'HOURLY' | 'DAILY')}
                  options={MODE_CALCUL_PAIE_OPTIONS}
                  required
                />
  
                <FormField
                  label={tauxPaiementLabel}
                  name="salaireBase"
                  type="number"
                  value={formData.salaireBase || ''}
                  onChange={(e) => updateField('salaireBase', e.target.value)}
                  min="0"
                  error={validationErrors.salaireBase}
                  className="py-1"
                />
  
                <FormField
                  label="Numéro CNSS"
                  name="numeroCnss"
                  type="text"
                  value={formData.numeroCnss || ''}
                  onChange={(e) => updateField('numeroCnss', e.target.value.toUpperCase())}
                  error={validationErrors.numeroCnss}
                  placeholder="Ex: CNSS123456"
                  className="py-1 md:col-span-2"
                />
              </div>
            </div>
  
            {/* Section Hiérarchie */}
            <div className="pt-2 border-t border-slate-700">
               <div className="grid grid-cols-1 gap-4">
                <SelectField
                  label="Supérieur Hiérarchique (Manager)"
                  name="managerId"
                  value={formData.managerId || ''}
                  onChange={(e) => updateField('managerId', e.target.value || null)}
                  options={[
                    { value: '', label: '— Aucun —' },
                    ...availableManagers
                  ]}
                />
               </div>
            </div>
          </div>
        )}

        {/* FOOTER ACTIONS */}
        <div className="flex justify-between gap-3 pt-4 border-t border-slate-700 mt-auto">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={saving}>
             Annuler
          </Button>
          
          <div className="flex gap-2">
             {activeTab === 'contract' && (
                <Button type="button" variant="secondary" onClick={() => setActiveTab('identity')}>
                  <ChevronLeft size={16} /> Précédent
                </Button>
             )}
             
             {activeTab === 'identity' ? (
                <Button type="button" variant="primary" onClick={handleNextTab}>
                  Suivant <ChevronRight size={16} />
                </Button>
             ) : (
                <Button type="submit" variant="primary" disabled={saving || !isFormComplete}>
                  <Save size={18} className="mr-2" />
                  {saving ? '...' : 'Sauvegarder'}
                </Button>
             )}
          </div>
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
