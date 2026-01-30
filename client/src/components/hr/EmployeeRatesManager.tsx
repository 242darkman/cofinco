import React, { useState, useEffect } from 'react';
import { DollarSign, Users, Save, History, Calendar, ArrowRight } from 'lucide-react';
import { Card, Button, FormField, SelectField, TabGroup } from '../ui';
import { toast } from '../../lib/toast';

interface RateHistoryEntry {
  id: string;
  salaireBase: string;
  tauxHoraire: string | null;
  tauxJournalier: string | null;
  modeCalcul: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  motifChangement: string | null;
  createdByName: string | null;
  createdAt: string;
}

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'edit' | 'history'>('edit');
  const [rateHistory, setRateHistory] = useState<RateHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [motifChangement, setMotifChangement] = useState('');

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

  const fetchRateHistory = async (id: string) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/hr/salary-rates/history/${id}`);
      if (res.ok) {
        const data = await res.json();
        setRateHistory(data);
      }
    } catch (e) {
      console.error("Erreur chargement historique:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (employeId && activeTab === 'history') {
      fetchRateHistory(employeId);
    }
  }, [employeId, activeTab]);

  const validateRates = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (selectedMode === 'Horaire') {
      const val = parseInt(tauxHoraire);
      if (!tauxHoraire || isNaN(val)) {
        newErrors.tauxHoraire = 'Valeur requise';
      } else if (val < 0) {
        newErrors.tauxHoraire = 'Le taux ne peut pas être négatif';
      } else if (val > 1000000) {
        newErrors.tauxHoraire = 'Valeur trop élevée (max 1 000 000)';
      }
    }

    if (selectedMode === 'Journalier') {
      const val = parseInt(tauxJournalier);
      if (!tauxJournalier || isNaN(val)) {
        newErrors.tauxJournalier = 'Valeur requise';
      } else if (val < 0) {
        newErrors.tauxJournalier = 'Le taux ne peut pas être négatif';
      } else if (val > 10000000) {
        newErrors.tauxJournalier = 'Valeur trop élevée (max 10 000 000)';
      }
    }

    if (selectedMode === 'Mensuel') {
      const val = parseInt(salaireBase);
      if (!salaireBase || isNaN(val)) {
        newErrors.salaireBase = 'Valeur requise';
      } else if (val < 0) {
        newErrors.salaireBase = 'Le salaire ne peut pas être négatif';
      } else if (val > 100000000) {
        newErrors.salaireBase = 'Valeur trop élevée (max 100 000 000)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateRates()) {
      toast.error('Veuillez corriger les erreurs de saisie');
      return;
    }

    setLoading(true);
    try {
      if (bulkMode) {
        // Bulk mode: Use old endpoint without history
        const payload = {
          modeCalculPaie: selectedMode,
          tauxHoraire: selectedMode === 'Horaire' ? parseInt(tauxHoraire) : 0,
          tauxJournalier: selectedMode === 'Journalier' ? parseInt(tauxJournalier) : 0,
          salaireBase: selectedMode === 'Mensuel' ? parseInt(salaireBase) : 0,
        };
        for (const emp of employees) {
          await fetch(`/api/hr/employes/${emp.id}/rates`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        toast.success(`Taux appliqués à ${employees.length} employés`);
      } else {
        // Single employee: Use new endpoint with history tracking
        const payload = {
          employeId,
          salaireBase: selectedMode === 'Mensuel' ? parseInt(salaireBase) : 0,
          tauxHoraire: selectedMode === 'Horaire' ? parseInt(tauxHoraire) : null,
          tauxJournalier: selectedMode === 'Journalier' ? parseInt(tauxJournalier) : null,
          modeCalcul: selectedMode === 'Mensuel' ? 'MONTHLY' : selectedMode === 'Horaire' ? 'HOURLY' : 'DAILY',
          effectiveFrom,
          motifChangement: motifChangement || null,
        };
        const res = await fetch('/api/hr/salary-rates/change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          toast.success('Taux mis à jour avec historique');
          setMotifChangement('');
          if (activeTab === 'history') {
            fetchRateHistory(employeId!);
          }
        } else {
          const err = await res.json();
          toast.error(err.error || 'Erreur lors de la mise à jour');
        }
      }
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatAmount = (amount: string | null) => {
    if (!amount) return '-';
    return parseInt(amount).toLocaleString('fr-FR') + ' FCFA';
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <DollarSign className="w-6 h-6 text-emerald-400" />
        <h3 className="text-base sm:text-lg font-bold text-white">
          Gestion des Taux {bulkMode && '(Tous les employés)'}
        </h3>
      </div>

      {/* Tabs for single employee mode */}
      {employeId && (
        <TabGroup
          tabs={[
            { key: 'edit', label: 'Modifier', icon: DollarSign },
            { key: 'history', label: 'Historique', icon: History },
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as 'edit' | 'history')}
        />
      )}

      {/* History Tab */}
      {employeId && activeTab === 'history' && (
        <Card className="p-4 sm:p-6">
          <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <History size={16} className="text-blue-400" />
            Historique des modifications de taux
          </h4>
          {loadingHistory ? (
            <div className="text-center text-slate-400 py-8">Chargement...</div>
          ) : rateHistory.length === 0 ? (
            <div className="text-center text-slate-400 py-8">Aucun historique disponible</div>
          ) : (
            <div className="space-y-3">
              {rateHistory.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`p-3 rounded-lg border ${
                    !entry.effectiveTo
                      ? 'bg-emerald-900/20 border-emerald-500/30'
                      : 'bg-slate-800 border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      <span className="text-sm text-white font-medium">
                        {formatDate(entry.effectiveFrom)}
                        {entry.effectiveTo && (
                          <>
                            <ArrowRight size={12} className="inline mx-2 text-slate-500" />
                            {formatDate(entry.effectiveTo)}
                          </>
                        )}
                      </span>
                      {!entry.effectiveTo && (
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
                          Actuel
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">Mode: </span>
                      <span className="text-white">
                        {entry.modeCalcul === 'MONTHLY' ? 'Mensuel' : entry.modeCalcul === 'HOURLY' ? 'Horaire' : 'Journalier'}
                      </span>
                    </div>
                    {entry.modeCalcul === 'MONTHLY' && (
                      <div>
                        <span className="text-slate-400">Salaire: </span>
                        <span className="text-emerald-400 font-medium">{formatAmount(entry.salaireBase)}</span>
                      </div>
                    )}
                    {entry.modeCalcul === 'HOURLY' && entry.tauxHoraire && (
                      <div>
                        <span className="text-slate-400">Taux horaire: </span>
                        <span className="text-emerald-400 font-medium">{formatAmount(entry.tauxHoraire)}</span>
                      </div>
                    )}
                    {entry.modeCalcul === 'DAILY' && entry.tauxJournalier && (
                      <div>
                        <span className="text-slate-400">Taux journalier: </span>
                        <span className="text-emerald-400 font-medium">{formatAmount(entry.tauxJournalier)}</span>
                      </div>
                    )}
                  </div>
                  {entry.motifChangement && (
                    <div className="mt-2 text-xs text-slate-400 italic">
                      Motif: {entry.motifChangement}
                    </div>
                  )}
                  {entry.createdByName && (
                    <div className="mt-1 text-xs text-slate-500">
                      Par: {entry.createdByName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Edit Tab */}
      {(activeTab === 'edit' || !employeId) && (
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
            <div>
              <FormField
                label="Taux Horaire (FCFA)"
                name="tauxHoraire"
                type="number"
                value={tauxHoraire}
                onChange={(e) => { setTauxHoraire(e.target.value); setErrors(prev => ({ ...prev, tauxHoraire: '' })); }}
                placeholder="Ex: 2500"
              />
              {errors.tauxHoraire && <p className="text-xs text-red-400 mt-1">{errors.tauxHoraire}</p>}
            </div>
          )}

          {selectedMode === 'Journalier' && (
            <div>
              <FormField
                label="Taux Journalier (FCFA)"
                name="tauxJournalier"
                type="number"
                value={tauxJournalier}
                onChange={(e) => { setTauxJournalier(e.target.value); setErrors(prev => ({ ...prev, tauxJournalier: '' })); }}
                placeholder="Ex: 15000"
              />
              {errors.tauxJournalier && <p className="text-xs text-red-400 mt-1">{errors.tauxJournalier}</p>}
            </div>
          )}

          {selectedMode === 'Mensuel' && (
            <div>
              <FormField
                label="Salaire de Base (FCFA)"
                name="salaireBase"
                type="number"
                value={salaireBase}
                onChange={(e) => { setSalaireBase(e.target.value); setErrors(prev => ({ ...prev, salaireBase: '' })); }}
                placeholder="Ex: 350000"
              />
              {errors.salaireBase && <p className="text-xs text-red-400 mt-1">{errors.salaireBase}</p>}
            </div>
          )}

          {/* Date d'effet et motif pour mode employé unique */}
          {employeId && !bulkMode && (
            <div className="border-t border-slate-700 pt-4 mt-4 space-y-4">
              <FormField
                label="Date d'effet"
                name="effectiveFrom"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
              <FormField
                label="Motif du changement (optionnel)"
                name="motifChangement"
                value={motifChangement}
                onChange={(e) => setMotifChangement(e.target.value)}
                placeholder="Ex: Révision annuelle, promotion..."
              />
            </div>
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
      )}
    </div>
  );
}
