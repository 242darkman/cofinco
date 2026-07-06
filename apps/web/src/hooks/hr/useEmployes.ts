import { useState, useEffect } from 'react';
import { StatutUser } from '@shared/enum/status-constants';

export interface Employe {
  id: string;
  userId: string;
  matricule: string;
  nom: string;
  prenom: string;
  email: string | null;
  phone: string | null;
  dateNaissance: string | null;
  sexe: 'M' | 'F';
  adresse: string | null;
  ville: string | null;
  lieuNaissance: string | null;
  lieuNaissanceLocalityId?: string | null;
  lieuNaissanceLocalityType?: string | null;
  nationaliteId: string | null;
  paysNaissanceId: string | null;
  nationaliteNom?: string | null;
  paysNaissanceNom?: string | null;
  statut: string;
  dateEmbauche: string;
  departement: string | null;
  poste: string;
  typeContrat: 'CDI' | 'CDD' | 'Stage' | 'Freelance' | 'Temporaire';
  salaireBase: string;
  numeroCnss: string | null;
  createdAt: string;
  photoProfile?: string | null;
  managerId?: string | null;
  managerNom?: string | null;
  agenceId?: string | null;
  agence?: {
    id: string;
    nom: string;
    typeAgence: 'MAIN' | 'SECONDARY' | 'KIOSK';
    codeAgence: string;
  } | null;
  modeCalculPaie?: 'MONTHLY' | 'HOURLY' | 'DAILY';
  jobPositionId?: string | null;
  // Pièce d'identité
  typePiece?: string | null;
  numeroPiece?: string | null;
  dateExpirationPiece?: string | null;
  paysEmissionId?: string | null;
  // Paiement
  paymentMethod?: string | null;
  paymentDetails?: string | null;
  // Situation familiale & fiscale
  situationFamiliale?: 'CELIBATAIRE' | 'MARIE' | 'VEUF' | 'DIVORCE' | null;
  nombreEnfantsCharge?: number | null;
  niu?: string | null;
  // Coordonnées bancaires
  bankName?: string | null;
  bankCode?: string | null;
  branchCode?: string | null;
  bankAccountNumber?: string | null;
  accountKey?: string | null;
  // Dates contrat
  dateFinContrat?: string | null;
  dateFinEssai?: string | null;
  dureeEssaiMois?: number | null;
  prochaineMedicale?: string | null;
  // Sortie
  typeCompte?: 'employe' | 'client' | 'both';
  dateSortie?: string | null;
  motifSortie?: 'DEMISSION' | 'LICENCIEMENT' | 'FIN_CDD' | 'RETRAITE' | 'DECES' | null;
  jobPosition?: {
    id: string;
    code: string;
    name: string;
    department: {
      id: string;
      code: string;
      name: string;
    };
  } | null;
}

export interface EmployeFormData {
  matricule: string;
  nom: string;
  prenom: string;
  email: string;
  phone: string;
  dateNaissance: string;
  sexe: 'M' | 'F';
  lieuNaissance: string;
  lieuNaissanceLocalityId?: string | null;
  lieuNaissanceLocalityType?: string | null;
  nationaliteId?: string | null;
  paysNaissanceId?: string | null;
  adresse: string;
  ville: string;
  dateEmbauche: string;
  departement: string;
  poste: string;
  typeContrat: 'CDI' | 'CDD' | 'Stage' | 'Freelance' | 'Temporaire';
  salaireBase: string;
  numeroCnss: string;
  photoProfile?: string;
  managerId?: string | null;
  // Workflow Admin/RH
  userId?: string | null;
  agenceId?: string | null;
  modeCalculPaie?: 'MONTHLY' | 'HOURLY' | 'DAILY';
  jobPositionId?: string | null;
  // Pièce d'identité
  typePiece?: string | null;
  numeroPiece?: string | null;
  dateExpirationPiece?: string | null;
  paysEmissionId?: string | null;
  // Paiement
  paymentMethod?: string | null;
  paymentDetails?: string | null;
  // Situation familiale & fiscale
  situationFamiliale?: 'CELIBATAIRE' | 'MARIE' | 'VEUF' | 'DIVORCE';
  nombreEnfantsCharge?: string;
  niu?: string;
  // Coordonnées bancaires
  bankName?: string;
  bankCode?: string;
  branchCode?: string;
  bankAccountNumber?: string;
  accountKey?: string;
  // Dates contrat
  dateFinContrat?: string | null;
  dateFinEssai?: string | null;
  dureeEssaiMois?: string | null;
  prochaineMedicale?: string | null;
  // Sortie
  dateSortie?: string | null;
  motifSortie?: 'DEMISSION' | 'LICENCIEMENT' | 'FIN_CDD' | 'RETRAITE' | 'DECES' | null;
}

export function useEmployes() {
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEmployes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/employes', { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur chargement');
      const data = await response.json();
      
      // L'API retourne EmployeWithUser { ...employe, user: { nom, prenom, statut, ... }, jobPosition, department }
      // On aplatit les données pour correspondre au type Employe attendu par le composant
      const flattenedData = (data || []).map((item: any) => ({
        id: item.id,
        userId: item.userId,
        matricule: item.matricule,
        // Utiliser les données du jobPosition/department si disponibles, sinon fallback sur les anciens champs
        poste: item.jobPosition?.name || item.poste || '',
        departement: item.department?.name || item.departement || '',
        dateEmbauche: item.dateEmbauche,
        typeContrat: item.typeContrat,
        salaireBase: item.salaireBase ? String(item.salaireBase) : '0',
        numeroCnss: item.numeroCnss || null,
        createdAt: item.createdAt,
        managerId: item.managerId || null,
        managerNom: null, // Sera calculé après
        // Nouveaux champs
        agenceId: item.agenceId || null,
        agence: item.agence || null, // Include full agence object
        jobPositionId: item.jobPositionId || null,
        jobPosition: item.jobPosition || null,
        modeCalculPaie: item.modeCalculPaie || 'MONTHLY',
        // Données utilisateur aplaties depuis item.user
        nom: item.user?.nom || '',
        prenom: item.user?.prenom || '',
        email: item.user?.email || null,
        phone: item.user?.telephone || null,
        dateNaissance: item.user?.dateNaissance || null,
        sexe: item.user?.sexe || 'M',
        adresse: item.user?.adresse || null,
        ville: item.user?.ville || null,
        lieuNaissance: item.user?.lieuNaissance || null,
        lieuNaissanceLocalityId: item.user?.lieuNaissanceLocalityId || null,
        lieuNaissanceLocalityType: item.user?.lieuNaissanceLocalityType || null,
        nationaliteId: item.user?.nationaliteId || null,
        paysNaissanceId: item.user?.paysNaissanceId || null,
        nationaliteNom: item.nationaliteNom || null,
        paysNaissanceNom: item.paysNaissanceNom || null,
        statut: item.user?.statut || StatutUser.ACTIVE,
        photoProfile: item.user?.photoProfile || null,
        typeCompte: item.user?.typeCompte || 'employe',
        // Pièce d'identité
        typePiece: item.typePiece || null,
        numeroPiece: item.numeroPiece || null,
        dateExpirationPiece: item.dateExpirationPiece || null,
        paysEmissionId: item.paysEmissionId || null,
        // Paiement
        paymentMethod: item.paymentMethod || null,
        paymentDetails: item.paymentDetails || null,
        // Coordonnées bancaires
        bankName: item.bankName || null,
        bankCode: item.bankCode || null,
        branchCode: item.branchCode || null,
        bankAccountNumber: item.bankAccountNumber || null,
        accountKey: item.accountKey || null,
        // Situation familiale & fiscale
        situationFamiliale: item.situationFamiliale || null,
        nombreEnfantsCharge: item.nombreEnfantsCharge ?? null,
        niu: item.niu || null,
        // Dates contrat
        dateFinContrat: item.dateFinContrat || null,
        dateFinEssai: item.dateFinEssai || null,
        dureeEssaiMois: item.dureeEssaiMois ?? null,
        prochaineMedicale: item.prochaineMedicale || null,
        // Sortie
        dateSortie: item.dateSortie || null,
        motifSortie: item.motifSortie || null,
      }));

      // Dédupliquer par ID d'employé (un employé peut avoir plusieurs rôles mais ne doit apparaître qu'une fois)
      const employeMap = new Map<string, Employe>();
      for (const emp of flattenedData as Employe[]) {
        if (!employeMap.has(emp.id)) {
          employeMap.set(emp.id, emp);
        }
      }
      const uniqueEmployes = Array.from(employeMap.values());

      // Calculer le nom du manager pour chaque employé (enrichissement côté client)
      const enrichedData = uniqueEmployes.map((emp: Employe) => {
        if (emp.managerId) {
          const manager = employeMap.get(emp.managerId);
          if (manager) {
            return { ...emp, managerNom: `${manager.nom} ${manager.prenom}`.trim() };
          }
        }
        return emp;
      });

      setEmployes(enrichedData);
    } catch (error) {
      console.error('Erreur chargement employés:', error);
      setError('Impossible de charger les employés');
    } finally {
      setLoading(false);
    }
  };

  const createEmploye = async (formData: EmployeFormData) => {
    try {
      const normalizedSalary = String(formData.salaireBase)
        .replace(/\s/g, '')
        .replace(/,/g, '.')
        .replace(/[^\d.]/g, '');

      // Normaliser phone -> telephone pour le backend
      const { phone, userId, ...rest } = formData;
      const payload = {
        ...rest,
        telephone: phone, // Le backend attend "telephone"
        salaireBase: normalizedSalary || '0'
      };

      // Si userId est fourni, on lie à un utilisateur existant (pas de création d'user)
      // Sinon, on crée un nouvel utilisateur + employé
      const url = userId
        ? `/api/employes/from-user/${userId}`
        : '/api/employes';

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Erreur');
      }

      await fetchEmployes();
      return { success: true };
    } catch (error: any) {
      console.error('Erreur création employé:', error);
      return { success: false, error: error.message || 'Erreur lors de la création' };
    }
  };

  const updateEmploye = async (id: string, formData: EmployeFormData) => {
    try {
      const normalizedSalary = String(formData.salaireBase)
        .replace(/\s/g, '')
        .replace(/,/g, '.')
        .replace(/[^\d.]/g, '');
      
      // Normaliser phone -> telephone pour le backend
      const { phone, ...rest } = formData;
      const payload = {
        ...rest,
        telephone: phone, // Le backend attend "telephone"
        salaireBase: normalizedSalary || '0'
      };

      const response = await fetch(`/api/employes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Erreur');
      }

      await fetchEmployes();
      return { success: true };
    } catch (error: any) {
      console.error('Erreur modification employé:', error);
      return { success: false, error: error.message || 'Erreur lors de la modification' };
    }
  };

  const deleteEmploye = async (id: string) => {
    if (!confirm('Supprimer cet employé?')) return { success: false };

    try {
      const response = await fetch(`/api/employes/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Erreur suppression');
      await fetchEmployes();
      return { success: true };
    } catch (error) {
      console.error('Erreur suppression employé:', error);
      return { success: false, error: 'Erreur lors de la suppression' };
    }
  };

  const getStatutColor = (statut: string) => {
    if (statut === StatutUser.ACTIVE) return 'text-status-success bg-status-success-bg';
    if (statut === 'Congé') return 'text-status-info bg-status-info-bg';
    if (statut === StatutUser.SUSPENDED) return 'text-accent bg-accent/10';
    if (statut === StatutUser.INACTIVE) return 'text-content-muted bg-surface-subtle/40';
    if (statut === 'Démissionné') return 'text-status-info bg-status-info-bg';
    return 'text-content-muted bg-surface-subtle/40';
  };

  const getStats = () => ({
    total: employes.length,
    actifs: employes.filter(e => e.statut === StatutUser.ACTIVE).length,
    conges: employes.filter(e => e.statut === 'Congé').length,
    masseSalariale: employes.reduce((sum, e) => sum + parseFloat(e.salaireBase || '0'), 0)
  });

  const filterEmployes = (searchTerm: string) => {
    if (!searchTerm) return employes;
    
    const term = searchTerm.toLowerCase();
    return employes.filter(emp =>
      emp.nom.toLowerCase().includes(term) ||
      emp.prenom.toLowerCase().includes(term) ||
      emp.matricule.toLowerCase().includes(term) ||
      emp.poste.toLowerCase().includes(term)
    );
  };

  useEffect(() => {
    fetchEmployes();
  }, []);

  return {
    employes,
    loading,
    error,
    fetchEmployes,
    createEmploye,
    updateEmploye,
    deleteEmploye,
    getStatutColor,
    getStats,
    filterEmployes
  };
}
