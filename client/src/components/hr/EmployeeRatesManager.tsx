import React, { useState, useEffect } from 'react';
import { DollarSign, Users, Save } from 'lucide-react';
import { Card, Button, FormField, SelectField } from '../ui';

interface EmployeeRatesManagerProps {
  employeId?: string; // If provided, edit single employee
}

export default function EmployeeRatesManager({ employeId }: EmployeeRatesManagerProps) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedMode, setSelectedMode] = useState('Mensuel');
  const [tauxHoraire, setTauxHoraire] = useState('');
  const [tauxJournalier, setTauxJournalier] = useState('');
  const [salaireBase, setSalaireBase] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkMode, setBulkMode] = useState(!employeId);

  useEffect(() => {
    if (!employeId) {
      fetchEmployees();
    } else {
      fetchEmployeeData(employeId);
    }
  }, [employeId]);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employes');
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (e) {
      console.error("Erreur chargement employés:", e);
    }
  };

  const fetchEmployeeData = async (id: string) => {
    try {
      const res = await fetch(`/api/employes/${id}`);
      if (res.ok) {
        const emp = await res.json();
        setSelectedMode(emp.modeCalculPaie || 'Mensuel');
        setTauxHoraire(emp.tauxHoraire?.toString() || '');
        setTauxJournalier(emp.tauxJournalier?.toString() || '');
        setSalaireBase(emp.salaireBase?.toString() || '');
      }
    } catch (e) {
      console.error("Erreur chargement employé:", e);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        modeCalculPaie: selectedMode,
        tauxHoraire: selectedMode === 'Horaire' ? parseInt(tauxHoraire) : 0,
        tauxJournalier: selectedMode === 'Journalier' ? parseInt(tauxJournalier) : 0,
        salaireBase: selectedMode === 'Mensuel' ? parseInt(salaireBase) : 0,
      };

      if (bulkMode) {
        // Apply to all employees
        for (const emp of employees) {
          await fetch(`/api/hr/employes/${emp.id}/rates`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        alert(`Taux appliqués à ${employees.length} employés`);
      } else {
        // Single employee
        const res = await fetch(`/api/hr/employes/${employeId}/rates`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          alert('Taux mis à jour');
        }
      }
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <DollarSign className="w-6 h-6 text-emerald-400" />
        <h3 className="text-base sm:text-lg font-bold text-white">
          Gestion des Taux {bulkMode && '(Tous les employés)'}
        </h3>
      </div>

      <Card className="p-4 sm:p-6">
        {!employeId && (
          <div className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={bulkMode}
              onChange={(e) => setBulkMode(e.target.checked)}
              className="w-4 h-4"
            />
            <label className="text-sm text-slate-300">
              Appliquer à tous les employés ({employees.length})
            </label>
          </div>
        )}

        <div className="space-y-4">
          <SelectField
            label="Mode de Calcul Paie"
            name="modeCalculPaie"
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value)}
            options={[
              { value: 'Mensuel', label: 'Mensuel (Salaire fixe)' },
              { value: 'Horaire', label: 'Horaire (Basé sur heures travaillées)' },
              { value: 'Journalier', label: 'Journalier (Basé sur jours présents)' }
            ]}
          />

          {selectedMode === 'Horaire' && (
            <FormField
              label="Taux Horaire (FCFA)"
              name="tauxHoraire"
              type="number"
              value={tauxHoraire}
              onChange={(e) => setTauxHoraire(e.target.value)}
              placeholder="Ex: 2500"
            />
          )}

          {selectedMode === 'Journalier' && (
            <FormField
              label="Taux Journalier (FCFA)"
              name="tauxJournalier"
              type="number"
              value={tauxJournalier}
              onChange={(e) => setTauxJournalier(e.target.value)}
              placeholder="Ex: 15000"
            />
          )}

          {selectedMode === 'Mensuel' && (
            <FormField
              label="Salaire de Base (FCFA)"
              name="salaireBase"
              type="number"
              value={salaireBase}
              onChange={(e) => setSalaireBase(e.target.value)}
              placeholder="Ex: 350000"
            />
          )}

          <Button
            variant="primary"
            fullWidth
            icon={Save}
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
