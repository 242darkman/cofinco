import { useState, useEffect } from 'react';

export interface Avantage {
  id: number;
  nom: string;
  type: string;
  montantParDefaut: number;
  description: string;
  eligibleContrats?: string[] | any;
}

export function useAvantages() {
  const [avantagesList, setAvantagesList] = useState<Avantage[]>([]);
  const [selectedEmployes, setSelectedEmployes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchAvantages();
  }, []);

  const fetchAvantages = async () => {
    try {
        const res = await fetch('/api/hr/avantages');
        if (res.ok) {
            const data = await res.json();
            setAvantagesList(data);
        }
    } catch (e) {
        console.error("Error fetching avantages", e);
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const toggleEmployeSelection = (employeId: string) => {
    setSelectedEmployes(prev =>
      prev.includes(employeId) ? prev.filter(id => id !== employeId) : [...prev, employeId]
    );
  };

  const createAvantage = async (data: { nom: string; type: string; montantParDefaut: number; description?: string; eligibleContrats?: string[] }) => {
    try {
      const response = await fetch('/api/hr/avantages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Erreur lors de la création');
      const created = await response.json();
      setAvantagesList(prev => [...prev, created]);
      return true;
    } catch (err) {
      console.error('Erreur création avantage:', err);
      return false;
    }
  };

  const updateAvantage = async (id: number, data: Partial<Omit<Avantage, 'id'>>) => {
    try {
      const response = await fetch(`/api/hr/avantages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Erreur lors de la mise à jour');
      const updated = await response.json();
      setAvantagesList(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
      return true;
    } catch (err) {
      console.error('Erreur mise à jour avantage:', err);
      return false;
    }
  };

  const deleteAvantage = async (id: number) => {
    try {
      const response = await fetch(`/api/hr/avantages/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Erreur lors de la suppression');
      setAvantagesList(prev => prev.filter(a => a.id !== id));
      return true;
    } catch (err) {
      console.error('Erreur suppression avantage:', err);
      return false;
    }
  };

  const applyAvantageToSelected = async (avantageId: number) => {
    if (selectedEmployes.length === 0) {
      showSuccess('Veuillez sélectionner au moins un employé');
      return;
    }
    
    setLoading(true);
    try {
        // Apply to all selected employees
        const avantage = avantagesList.find(a => a.id === avantageId);
        const montant = avantage?.montantParDefaut || 0;

        const promises = selectedEmployes.map(employeId => 
            fetch('/api/hr/avantages/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employeId, avantageId, montant })
            })
        );
        
        await Promise.all(promises);
        showSuccess(`Avantage attribué à ${selectedEmployes.length} employé(s)!`);
        setSelectedEmployes([]); // Reset selection
    } catch (error) {
        console.error("Error assigning avantages", error);
    } finally {
        setLoading(false);
    }
  };

  return {
    avantagesList,
    selectedEmployes,
    successMessage,
    toggleEmployeSelection,
    applyAvantageToSelected,
    createAvantage,
    updateAvantage,
    deleteAvantage,
    showSuccess
  };
}
