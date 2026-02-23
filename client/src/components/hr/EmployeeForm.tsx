import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Save, ChevronLeft, ChevronRight, User, FileText, Briefcase, Banknote, Check } from 'lucide-react';
import { Employe, EmployeFormData } from '../../hooks/hr/useEmployes';
import { Modal, Button, ConfirmDialog } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import { useEntityUpload } from '../../hooks/useEntityUpload';
import { StatutUser } from '@shared/enum/status-constants';
import { normalizePhone } from '@shared/utils/phone';
import { agenceApi, paysApi, localityApi, villeApi } from '../../lib/api-client';
import StepIdentite from './employee-wizard/StepIdentite';
import StepDocuments from './employee-wizard/StepDocuments';
import StepContrat from './employee-wizard/StepContrat';
import StepRemuneration from './employee-wizard/StepRemuneration';

// Patterns de validation
const VALIDATION_PATTERNS = {
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  phone: /^\+?[0-9]{8,15}$/,
  cnss: /^[A-Z0-9-]{6,20}$/i,
};

const MIN_AGE_EMBAUCHE = 18;
const MAX_AGE_EMBAUCHE = 70;

// Wizard steps config
const STEPS = [
  { key: 'identite', label: 'Identité', icon: User },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'contrat', label: 'Contrat', icon: Briefcase },
  { key: 'remuneration', label: 'Rémunération', icon: Banknote },
] as const;

type StepKey = typeof STEPS[number]['key'];

// Interfaces
interface UnlinkedUser {
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
}

interface Agence {
  id: string;
  nom: string;
  code: string;
}

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
  salaireMin?: number | null;
  salaireMax?: number | null;
  department: { id: string; code: string; name: string };
}

interface PaysOption {
  id: string;
  nomFr: string;
  nomEn: string;
  iso2: string | null;
}

interface LocalityOption {
  id: string;
  type: 'CITY' | 'DISTRICT';
  name: string;
  regionName?: string | null;
}

interface EmployeeFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EmployeFormData) => Promise<{ success: boolean; error?: string }>;
  editingEmploye: Employe | null;
  initialData: EmployeFormData;
  allEmployes?: Employe[];
}

export default function EmployeeForm({
  isOpen,
  onClose,
  onSave,
  editingEmploye,
  initialData,
  allEmployes = [],
}: EmployeeFormProps) {
  // RBAC
  const { hasPermission } = usePermissions();
  const canSaveEmployees = editingEmploye
    ? (hasPermission('rh', 'edit') || hasPermission('employes', 'edit'))
    : (hasPermission('rh', 'create') || hasPermission('employes', 'create'));

  // Form data
  const [formData, setFormData] = useState<EmployeFormData>(initialData);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialData.photoProfile || null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  // Wizard step
  const [currentStep, setCurrentStep] = useState(0);

  // User linking (creation mode)
  const [unlinkedUsers, setUnlinkedUsers] = useState<UnlinkedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UnlinkedUser | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Org data
  const [agences, setAgences] = useState<Agence[]>([]);
  const [agenceId, setAgenceId] = useState<string>('');
  const [modeCalculPaie, setModeCalculPaie] = useState<'MONTHLY' | 'HOURLY' | 'DAILY'>('MONTHLY');

  // Departments & positions
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobPositions, setJobPositions] = useState<JobPosition[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [selectedJobPositionId, setSelectedJobPositionId] = useState<string | null>(null);

  // CNSS check
  const [checkingCnss, setCheckingCnss] = useState(false);
  const [cnssAvailable, setCnssAvailable] = useState<boolean | null>(null);
  const [cnssError, setCnssError] = useState<string | null>(null);
  const cnssDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Geography data
  const [paysList, setPaysList] = useState<PaysOption[]>([]);
  const [localitiesList, setLocalitiesList] = useState<LocalityOption[]>([]);
  const [localitiesLoading, setLocalitiesLoading] = useState(false);
  const localitiesCacheRef = useRef<Record<string, LocalityOption[]>>({});

  // Ville (address city) search
  const [villesList, setVillesList] = useState<Array<{ id: string; nom: string; regionNom: string | null }>>([]);
  const [villesLoading, setVillesLoading] = useState(false);
  const villeSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Document uploads
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, any>>({});

  // Unsaved changes tracking
  const initialDataRef = useRef<string>(JSON.stringify(initialData));
  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(formData) !== initialDataRef.current;
  }, [formData]);

  // Temp entity ID for uploads
  const tempEmployeIdRef = useRef(crypto.randomUUID());
  const { uploadFile, isUploading } = useEntityUpload({
    fileType: 'profile',
    entityType: 'employe',
    entityId: editingEmploye?.id || tempEmployeIdRef.current,
    onError: (err) => toast.error(`Erreur upload: ${err.message}`),
  });

  // --- Circular reference detection ---
  const wouldCreateCircularReference = useCallback((potentialManagerId: string): boolean => {
    if (!editingEmploye?.id) return false;
    let currentId: string | null | undefined = potentialManagerId;
    const visited = new Set<string>();
    while (currentId) {
      if (currentId === editingEmploye.id) return true;
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const currentEmp = allEmployes.find(e => e.id === currentId);
      currentId = currentEmp?.managerId;
    }
    return false;
  }, [allEmployes, editingEmploye?.id]);

  const availableManagers = useMemo(() => {
    return allEmployes
      .filter(emp =>
        emp.id !== editingEmploye?.id &&
        emp.statut === StatutUser.ACTIVE &&
        !wouldCreateCircularReference(emp.id)
      )
      .map(emp => ({
        value: emp.id,
        label: `${emp.nom} ${emp.prenom} - ${emp.poste}`,
      }));
  }, [allEmployes, editingEmploye?.id, wouldCreateCircularReference]);

  // --- Update field ---
  const updateField = useCallback((field: string, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value ?? '' }));
  }, []);

  // --- Fetch localities ---
  const fetchLocalitiesByPays = useCallback(async (paysId: string) => {
    if (localitiesCacheRef.current[paysId]) {
      setLocalitiesList(localitiesCacheRef.current[paysId]);
      return;
    }
    setLocalitiesLoading(true);
    try {
      const data = await localityApi.getAll({ paysId, limit: 500 });
      localitiesCacheRef.current[paysId] = data;
      setLocalitiesList(data);
    } catch {
      setLocalitiesList([]);
    } finally {
      setLocalitiesLoading(false);
    }
  }, []);

  // --- Fetch villes for address city ---
  const fetchVilles = useCallback(async (search?: string) => {
    setVillesLoading(true);
    try {
      const data = await villeApi.getAll({ search: search || undefined, limit: 200 });
      setVillesList(data.map((v: any) => ({ id: v.id, nom: v.nom, regionNom: v.regionNom ?? null })));
    } catch {
      setVillesList([]);
    } finally {
      setVillesLoading(false);
    }
  }, []);

  const handleVilleSearch = useCallback((query: string) => {
    if (villeSearchDebounceRef.current) clearTimeout(villeSearchDebounceRef.current);
    villeSearchDebounceRef.current = setTimeout(() => {
      fetchVilles(query.trim().length >= 2 ? query.trim() : undefined);
    }, 300);
  }, [fetchVilles]);

  // --- Validation ---
  const validateStep = useCallback((stepIndex: number): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (stepIndex === 0) {
      // Step 1: Identité
      if (!editingEmploye && !selectedUserId) {
        errors.userId = 'Veuillez sélectionner un compte utilisateur à lier';
      }
      if (!editingEmploye && selectedUser && !selectedUser.agenceId) {
        errors.agenceId = "L'utilisateur sélectionné n'a pas d'agence affectée.";
      }
      if (editingEmploye && !agenceId) {
        errors.agenceId = "L'agence est requise";
      }
      if (!formData.nom) errors.nom = 'Requis';
      if (formData.email && !VALIDATION_PATTERNS.email.test(formData.email)) {
        errors.email = 'Format email invalide';
      }
      if (formData.phone) {
        const cleanPhone = formData.phone.replace(/[\s.-]/g, '');
        if (!VALIDATION_PATTERNS.phone.test(cleanPhone)) {
          errors.phone = 'Format téléphone invalide';
        }
      }
    }

    if (stepIndex === 2) {
      // Step 3: Contrat
      if (!selectedJobPositionId) errors.jobPositionId = 'Le poste est requis';
      if (!formData.dateEmbauche) errors.dateEmbauche = "Date d'embauche requise";

      if (formData.dateNaissance && formData.dateEmbauche) {
        const birthDate = new Date(formData.dateNaissance);
        const hireDate = new Date(formData.dateEmbauche);
        const today = new Date();
        const ageAtHire = Math.floor((hireDate.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

        if (birthDate >= today) errors.dateNaissance = 'La date de naissance doit être dans le passé';
        const maxFutureHire = new Date();
        maxFutureHire.setMonth(maxFutureHire.getMonth() + 1);
        if (hireDate > maxFutureHire) errors.dateEmbauche = "La date d'embauche ne peut pas être trop éloignée";
        if (ageAtHire < MIN_AGE_EMBAUCHE) errors.dateNaissance = `Age min: ${MIN_AGE_EMBAUCHE} ans (actuellement: ${ageAtHire})`;
        if (ageAtHire > MAX_AGE_EMBAUCHE) errors.dateNaissance = `Age invalide (${ageAtHire} ans)`;
        if (hireDate <= birthDate) errors.dateEmbauche = "Embauche avant naissance impossible";
      }
    }

    if (stepIndex === 3) {
      // Step 4: Rémunération
      const salary = parseFloat(formData.salaireBase);
      if (isNaN(salary) || salary < 0) {
        errors.salaireBase = 'Salaire invalide';
      } else if (selectedJobPositionId) {
        const pos = jobPositions.find(p => p.id === selectedJobPositionId);
        if (pos) {
          if (pos.salaireMin != null && salary < pos.salaireMin) {
            errors.salaireBase = `En dessous du minimum du poste (${pos.salaireMin.toLocaleString('fr-FR')} FCFA)`;
          }
          if (pos.salaireMax != null && salary > pos.salaireMax) {
            errors.salaireBase = `Au dessus du maximum du poste (${pos.salaireMax.toLocaleString('fr-FR')} FCFA)`;
          }
        }
      }
      if (formData.numeroCnss && !VALIDATION_PATTERNS.cnss.test(formData.numeroCnss)) {
        errors.numeroCnss = 'Format CNSS invalide (6-20 caractères alphanumériques)';
      } else if (cnssAvailable === false) {
        errors.numeroCnss = cnssError || 'Ce numéro CNSS est déjà utilisé';
      }
    }

    return errors;
  }, [formData, editingEmploye, selectedUserId, selectedUser, agenceId, selectedJobPositionId, jobPositions, cnssAvailable, cnssError]);

  const validateAllSteps = useCallback((): Record<string, string> => {
    let allErrors: Record<string, string> = {};
    for (let i = 0; i < STEPS.length; i++) {
      allErrors = { ...allErrors, ...validateStep(i) };
    }
    setValidationErrors(allErrors);
    return allErrors;
  }, [validateStep]);

  // --- Navigation ---
  const handleNext = useCallback(() => {
    // Non-blocking - just proceed (validation at submit time)
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
      // Scroll modal content to top
      const modalBody = document.querySelector('.overflow-y-auto');
      if (modalBody) modalBody.scrollTop = 0;
    }
  }, [currentStep]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      const modalBody = document.querySelector('.overflow-y-auto');
      if (modalBody) modalBody.scrollTop = 0;
    }
  }, [currentStep]);

  // --- Submit ---
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard: only submit from the last step (prevents phantom submit when
    // React reuses the DOM node and "Suivant" becomes "Sauvegarder")
    if (currentStep !== STEPS.length - 1) return;

    const errors = validateAllSteps();
    if (Object.keys(errors).length > 0) {
      // Find the first step with errors and navigate there
      for (let i = 0; i < STEPS.length; i++) {
        const stepErrors = validateStep(i);
        if (Object.keys(stepErrors).length > 0) {
          setCurrentStep(i);
          break;
        }
      }
      const errorMessages = Object.entries(errors)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join(', ');
      toast.error(`Veuillez corriger: ${errorMessages}`);
      return;
    }

    setSaving(true);

    const enrichedData = {
      ...formData,
      phone: normalizePhone(formData.phone) || formData.phone,
      userId: selectedUserId,
      agenceId,
      modeCalculPaie,
      jobPositionId: selectedJobPositionId,
      ...(editingEmploye ? {} : { tempEntityId: tempEmployeIdRef.current }),
    };

    const result = await onSave(enrichedData as any);
    setSaving(false);

    if (result.success) {
      toast.success('Employé sauvegardé');
      onClose();
    } else {
      toast.error(result.error || 'Erreur lors de la sauvegarde');
    }
  }, [currentStep, formData, onSave, onClose, validateAllSteps, validateStep, selectedUserId, agenceId, modeCalculPaie, selectedJobPositionId, editingEmploye]);

  // --- Photo upload ---
  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [uploadFile, updateField]);

  // --- Document change ---
  const handleDocumentChange = useCallback((type: string, doc: any) => {
    setUploadedDocs(prev => ({ ...prev, [type]: doc }));
  }, []);

  // --- Close handling ---
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

  // --- Effects ---

  // Reset on open/close/editingEmploye change
  const initialDataJson = JSON.stringify(initialData);
  const prevInitialDataJsonRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      prevInitialDataJsonRef.current = null;
      return;
    }
    if (prevInitialDataJsonRef.current === initialDataJson) return;
    prevInitialDataJsonRef.current = initialDataJson;

    setFormData(initialData);
    setPhotoPreview(initialData.photoProfile || editingEmploye?.photoProfile || null);
    initialDataRef.current = initialDataJson;
    setValidationErrors({});
    setCnssAvailable(null);
    setCnssError(null);
    setCheckingCnss(false);
    setCurrentStep(0);
    setUploadedDocs({});

    if (!editingEmploye) {
      setSelectedUserId(null);
      setSelectedUser(null);
      setAgenceId('');
      setModeCalculPaie('MONTHLY');
      setSelectedDepartmentId(null);
      setSelectedJobPositionId(null);
    } else {
      setSelectedUserId(null);
      setSelectedUser(null);
      setUnlinkedUsers([]);
      setAgenceId(initialData.agenceId || '');
      setModeCalculPaie(initialData.modeCalculPaie || 'MONTHLY');
      const jobPosId = initialData.jobPositionId;
      if (jobPosId) {
        setSelectedJobPositionId(jobPosId);
      } else {
        setSelectedJobPositionId(null);
        setSelectedDepartmentId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingEmploye?.id, initialDataJson]);

  // Load agences
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

  // Load pays + initial villes batch
  useEffect(() => {
    const loadPays = async () => {
      try {
        const data = await paysApi.getAll({ actif: true });
        setPaysList(data);
      } catch (error) {
        console.error('Erreur chargement pays:', error);
      }
    };
    loadPays();
    fetchVilles();
  }, [fetchVilles]);

  // Load departments & positions
  useEffect(() => {
    const loadDepartmentsAndPositions = async () => {
      try {
        const deptRes = await fetch('/api/departments', { credentials: 'include' });
        if (deptRes.ok) {
          const depts = await deptRes.json();
          setDepartments(depts.filter((d: Department) => d.isActive !== false));
        }
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

  // Set department from job position (edit mode init)
  useEffect(() => {
    if (selectedJobPositionId && jobPositions.length > 0) {
      const position = jobPositions.find(p => p.id === selectedJobPositionId);
      if (position && position.departmentId !== selectedDepartmentId) {
        setSelectedDepartmentId(position.departmentId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobPositionId, jobPositions]);

  // Load localities for editing employee's paysNaissanceId
  useEffect(() => {
    if (isOpen && editingEmploye && initialData.paysNaissanceId) {
      fetchLocalitiesByPays(initialData.paysNaissanceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingEmploye?.id]);

  // Load unlinked users (creation mode only)
  useEffect(() => {
    if (editingEmploye) return;

    const loadUnlinkedUsers = async () => {
      setLoadingUsers(true);
      try {
        const usersRes = await fetch('/api/users', { credentials: 'include' });
        const allUsers: any[] = await usersRes.json();
        const employesRes = await fetch('/api/employes', { credentials: 'include' });
        const allEmployesData: any[] = await employesRes.json();
        const agencesRes = await fetch('/api/agences', { credentials: 'include' });
        const allAgences: any[] = await agencesRes.json();
        const agenceMap = new Map(allAgences.map((a: any) => [a.id, a]));
        const linkedUserIds = new Set(allEmployesData.map((e: any) => e.userId));

        const unlinkedPromises = allUsers
          .filter((u: any) =>
            !linkedUserIds.has(u.id) &&
            u.typeCompte === 'employe' &&
            u.statut === StatutUser.ACTIVE
          )
          .map(async (u: any) => {
            let userAgence = null;
            try {
              const userAgencesRes = await fetch(`/api/users/${u.id}/agences`, { credentials: 'include' });
              if (userAgencesRes.ok) {
                const userAgences: any[] = await userAgencesRes.json();
                if (userAgences.length > 0) {
                  const agId = userAgences[0].agenceId || userAgences[0].id;
                  userAgence = agenceMap.get(agId);
                }
              }
            } catch { /* ignore */ }
            return {
              id: u.id,
              nom: u.nom,
              prenom: u.prenom,
              email: u.email,
              telephone: u.telephone,
              sexe: u.sexe,
              photoProfile: u.photoProfile,
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

  // When user is selected, populate identity fields & agency
  useEffect(() => {
    if (editingEmploye) return;
    if (selectedUserId) {
      const user = unlinkedUsers.find(u => u.id === selectedUserId);
      if (user) {
        setSelectedUser(user);
        setFormData(prev => ({
          ...prev,
          nom: user.nom,
          prenom: user.prenom || '',
          email: user.email || '',
          phone: user.telephone || '',
          sexe: (user.sexe as 'M' | 'F') || 'M',
          photoProfile: user.photoProfile || '',
        }));
        if (user.photoProfile) setPhotoPreview(user.photoProfile);
        setAgenceId(user.agenceId || '');
      }
    } else {
      setSelectedUser(null);
      setAgenceId('');
    }
  }, [selectedUserId, unlinkedUsers, editingEmploye]);

  // CNSS debounced check
  useEffect(() => {
    const cnss = formData.numeroCnss?.trim();
    if (!cnss || !VALIDATION_PATTERNS.cnss.test(cnss)) {
      setCnssAvailable(null);
      setCnssError(null);
      setCheckingCnss(false);
      return;
    }
    if (cnssDebounceRef.current) clearTimeout(cnssDebounceRef.current);
    setCheckingCnss(true);
    setCnssAvailable(null);
    setCnssError(null);

    cnssDebounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ numeroCnss: cnss });
        if (editingEmploye?.id) params.set('excludeEmployeId', editingEmploye.id);
        const res = await fetch(`/api/employes/check-cnss?${params}`, { credentials: 'include' });
        const data = await res.json();
        setCnssAvailable(data.available);
        setCnssError(data.available ? null : data.message);
      } catch {
        setCnssError(null);
        setCnssAvailable(null);
      } finally {
        setCheckingCnss(false);
      }
    }, 500);

    return () => {
      if (cnssDebounceRef.current) clearTimeout(cnssDebounceRef.current);
    };
  }, [formData.numeroCnss, editingEmploye?.id]);

  // --- Selected position salary range ---
  const selectedPositionSalaryRange = useMemo(() => {
    if (!selectedJobPositionId) return null;
    const pos = jobPositions.find(p => p.id === selectedJobPositionId);
    if (!pos) return null;
    if (pos.salaireMin == null && pos.salaireMax == null) return null;
    return { min: pos.salaireMin ?? null, max: pos.salaireMax ?? null };
  }, [selectedJobPositionId, jobPositions]);

  // --- Is employee also a client? ---
  const isEmployeClient = useMemo(() => {
    if (editingEmploye?.typeCompte === 'both') return true;
    if (selectedUser) {
      // Check from user data if available
      const user = unlinkedUsers.find(u => u.id === selectedUserId);
      // We can't know typeCompte from unlinked users list, default false
      return false;
    }
    return false;
  }, [editingEmploye, selectedUser, selectedUserId, unlinkedUsers]);

  // --- Render step content ---
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <StepIdentite
            formData={formData}
            updateField={updateField}
            editingEmploye={editingEmploye}
            unlinkedUsers={unlinkedUsers}
            selectedUserId={selectedUserId}
            setSelectedUserId={setSelectedUserId}
            selectedUser={selectedUser}
            loadingUsers={loadingUsers}
            agenceId={agenceId}
            setAgenceId={setAgenceId}
            agences={agences}
            photoPreview={photoPreview}
            handlePhotoUpload={handlePhotoUpload}
            isUploading={isUploading}
            paysList={paysList}
            localitiesList={localitiesList}
            localitiesLoading={localitiesLoading}
            fetchLocalitiesByPays={fetchLocalitiesByPays}
            villesList={villesList}
            villesLoading={villesLoading}
            onVilleSearch={handleVilleSearch}
            validationErrors={validationErrors}
          />
        );
      case 1:
        return (
          <StepDocuments
            formData={formData}
            updateField={updateField}
            editingEmploye={editingEmploye}
            paysList={paysList}
            uploadedDocs={uploadedDocs}
            handleDocumentChange={handleDocumentChange}
            entityId={editingEmploye?.id || tempEmployeIdRef.current}
          />
        );
      case 2:
        return (
          <StepContrat
            formData={formData}
            updateField={updateField}
            editingEmploye={editingEmploye}
            departments={departments}
            jobPositions={jobPositions}
            selectedDepartmentId={selectedDepartmentId}
            setSelectedDepartmentId={setSelectedDepartmentId}
            selectedJobPositionId={selectedJobPositionId}
            setSelectedJobPositionId={setSelectedJobPositionId}
            availableManagers={availableManagers}
            validationErrors={validationErrors}
          />
        );
      case 3:
        return (
          <StepRemuneration
            formData={formData}
            updateField={updateField}
            editingEmploye={editingEmploye}
            modeCalculPaie={modeCalculPaie}
            setModeCalculPaie={setModeCalculPaie}
            validationErrors={validationErrors}
            checkingCnss={checkingCnss}
            cnssAvailable={cnssAvailable}
            cnssError={cnssError}
            isEmployeClient={isEmployeClient}
            salaryRange={selectedPositionSalaryRange}
          />
        );
      default:
        return null;
    }
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
          {/* Step indicator */}
          <div className="flex items-center gap-1 px-2">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;

              return (
                <React.Fragment key={step.key}>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(index)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm font-medium ${
                      isActive
                        ? 'bg-accent text-white shadow-lg'
                        : isCompleted
                          ? 'bg-status-success/10 text-status-success hover:bg-status-success/20'
                          : 'bg-surface text-content-muted hover:bg-surface-elevated hover:text-content-secondary'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isActive
                        ? 'bg-white/20'
                        : isCompleted
                          ? 'bg-status-success/20'
                          : 'bg-surface-subtle'
                    }`}>
                      {isCompleted ? (
                        <Check size={14} />
                      ) : (
                        <Icon size={14} />
                      )}
                    </div>
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 rounded-full ${
                      index < currentStep ? 'bg-status-success/40' : 'bg-edge'
                    }`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Step content */}
          <div className="animate-in fade-in duration-200">
            {renderStepContent()}
          </div>

          {/* Footer actions */}
          <div className="flex justify-between gap-3 pt-4 border-t border-edge mt-auto">
            <Button type="button" variant="secondary" onClick={handleClose} disabled={saving}>
              Annuler
            </Button>

            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button type="button" variant="secondary" onClick={handlePrev}>
                  <ChevronLeft size={16} /> Précédent
                </Button>
              )}

              {currentStep < STEPS.length - 1 ? (
                <Button key="next" type="button" variant="primary" onClick={handleNext}>
                  Suivant <ChevronRight size={16} />
                </Button>
              ) : (
                <Button key="submit" type="submit" variant="primary" disabled={saving || !canSaveEmployees}>
                  <Save size={18} className="mr-2" />
                  {saving ? '...' : 'Sauvegarder'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Modal>

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
