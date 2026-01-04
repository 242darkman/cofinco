import { useState, useEffect } from 'react';

export interface Employe {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  email: string | null;
  phone: string | null;
  dateNaissance: string | null;
  sexe: 'M' | 'F';
  adresse: string | null;
  ville: string | null;
  statut: string;
  dateEmbauche: string;
  departement: string | null;
  poste: string;
  typeContrat: 'CDI' | 'CDD' | 'Stage' | 'Freelance' | 'Temporaire';
  salaireBase: string;
  numeroCnss: string | null;
  createdAt: string;
  photoProfile?: string | null;
}

export interface EmployeFormData {
  matricule: string;
  nom: string;
  prenom: string;
  email: string;
  phone: string;
  dateNaissance: string;
  sexe: 'M' | 'F';
  adresse: string;
  ville: string;
  dateEmbauche: string;
  departement: string;
  poste: string;
  typeContrat: 'CDI' | 'CDD' | 'Stage' | 'Freelance' | 'Temporaire';
  salaireBase: string;
  numeroCnss: string;
  photoProfile?: string;
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
      
      // L'API retourne EmployeWithUser { ...employe, user: { nom, prenom, statut, ... } }
      // On aplatit les données pour correspondre au type Employe attendu par le composant
      const flattenedData = (data || []).map((item: any) => ({
        id: item.id,
        matricule: item.matricule,
        poste: item.poste,
        departement: item.departement,
        dateEmbauche: item.dateEmbauche,
        typeContrat: item.typeContrat,
        salaireBase: item.salaireBase ? String(item.salaireBase) : '0',
        numeroCnss: item.numeroCnss || null,
        createdAt: item.createdAt,
        // Données utilisateur aplaties depuis item.user
        nom: item.user?.nom || '',
        prenom: item.user?.prenom || '',
        email: item.user?.email || null,
        phone: item.user?.telephone || null,
        dateNaissance: item.user?.dateNaissance || null,
        sexe: item.user?.sexe || 'M',
        adresse: item.user?.adresse || null,
        ville: item.user?.ville || null,
        statut: item.user?.statut || 'Actif',
        photoProfile: item.user?.photoProfile || null,
      }));
      
      setEmployes(flattenedData);
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
      
      const payload = {
        ...formData,
        salaireBase: normalizedSalary || '0'
      };

      const response = await fetch('/api/employes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur');
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
      
      const payload = {
        ...formData,
        salaireBase: normalizedSalary || '0'
      };

      const response = await fetch(`/api/employes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur');
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
    switch (statut) {
      case 'Actif': return 'text-green-400 bg-green-500/20';
      case 'Congé': return 'text-blue-400 bg-blue-500/20';
      case 'Suspendu': return 'text-cyan-400 bg-cyan-500/20';
      case 'Inactif': return 'text-slate-400 bg-slate-500/20';
      case 'Démissionné': return 'text-blue-400 bg-blue-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getStats = () => ({
    total: employes.length,
    actifs: employes.filter(e => e.statut === 'Actif').length,
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
