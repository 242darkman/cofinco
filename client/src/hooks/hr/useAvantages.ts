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
    showSuccess
  };
}
