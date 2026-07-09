import React, { useState, useEffect } from 'react';
import { Building2, Briefcase, Calendar, AlertTriangle, Plus, X, MapPin } from 'lucide-react';
import FormField from '../../ui/FormField';
import SelectField from '../../ui/SelectField';
import { toast } from '../../../lib/toast';

interface Assignment {
  id: string;
  agenceId: string;
  agenceNom: string;
  agenceCode: string;
  roleOperationnel: string | null;
  managerId: string | null;
  managerNom: string | null;
  isPrimary: boolean;
  dateDebut: string;
  dateFin: string | null;
  statut: string;
}

interface StepContratProps {
  formData: any;
  updateField: (field: string, value: string | null) => void;
  editingEmploye: any | null;
  departments: Array<{ id: string; code: string; name: string }>;
  jobPositions: Array<{ id: string; departmentId: string; code: string; name: string }>;
  selectedDepartmentId: string | null;
  setSelectedDepartmentId: (id: string | null) => void;
  selectedJobPositionId: string | null;
  setSelectedJobPositionId: (id: string | null) => void;
  availableManagers: Array<{ value: string; label: string }>;
  validationErrors: Record<string, string>;
}

const StepContrat: React.FC<StepContratProps> = ({
  formData,
  updateField,
  editingEmploye,
  departments,
  jobPositions,
  selectedDepartmentId,
  setSelectedDepartmentId,
  selectedJobPositionId,
  setSelectedJobPositionId,
  availableManagers,
  validationErrors,
}) => {
  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDepartmentId = e.target.value || null;
    setSelectedDepartmentId(newDepartmentId);
    setSelectedJobPositionId(null);
    updateField('jobPositionId', null);
  };

  const handleJobPositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPositionId = e.target.value || null;
    setSelectedJobPositionId(newPositionId);
    updateField('jobPositionId', newPositionId);
  };

  const filteredJobPositions = selectedDepartmentId
    ? jobPositions.filter((pos) => pos.departmentId === selectedDepartmentId)
    : [];

  const isNonCDI = formData.typeContrat && formData.typeContrat !== 'CDI';
  const isCDD = formData.typeContrat === 'CDD';

  // Auto-calc dateFinEssai when dureeEssaiMois or dateEmbauche changes for CDD
  const computedDateFinEssai = React.useMemo(() => {
    if (isCDD && formData.dureeEssaiMois && formData.dateEmbauche) {
      const start = new Date(formData.dateEmbauche);
      start.setMonth(start.getMonth() + parseInt(formData.dureeEssaiMois));
      return start.toISOString().split('T')[0];
    }
    return null;
  }, [isCDD, formData.dureeEssaiMois, formData.dateEmbauche]);

  // Sync computed value to form
  React.useEffect(() => {
    if (computedDateFinEssai && computedDateFinEssai !== formData.dateFinEssai) {
      updateField('dateFinEssai', computedDateFinEssai);
    }
  }, [computedDateFinEssai]);

  const contractTypeOptions = [
    { value: '', label: 'Sélectionner...', disabled: true },
    { value: 'CDI', label: 'CDI' },
    { value: 'CDD', label: 'CDD' },
    { value: 'Stage', label: 'Stage' },
  ];

  const handleContractTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    updateField('typeContrat', value);
    // Clear dateFinContrat when switching to CDI
    if (value === 'CDI') {
      updateField('dateFinContrat', null);
      updateField('dureeEssaiMois', null);
    }
  };

  const sortieMotifOptions = [
    { value: '', label: '— Aucun —' },
    { value: 'DEMISSION', label: 'Démission' },
    { value: 'LICENCIEMENT', label: 'Licenciement' },
    { value: 'FIN_CDD', label: 'Fin de CDD' },
    { value: 'RETRAITE', label: 'Retraite' },
    { value: 'DECES', label: 'Décès' },
  ];

  return (
    <div className="space-y-6">
      {/* Section 1: Contrat & Type */}
      <section className="bg-status-success-bg border-status-success/30 border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-status-success/10 rounded-lg">
            <Building2 className="w-5 h-5 text-status-success" />
          </div>
          <h3 className="text-lg font-semibold text-content-primary">Contrat</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Date d'Embauche"
            name="dateEmbauche"
            type="date"
            value={formData.dateEmbauche || ''}
            onChange={(e) => updateField('dateEmbauche', e.target.value)}
            required
            error={validationErrors.dateEmbauche}
            containerClassName="py-1"
          />

          <SelectField
            label="Type de Contrat"
            name="typeContrat"
            value={formData.typeContrat || ''}
            onChange={handleContractTypeChange}
            options={contractTypeOptions}
            required
            containerClassName="py-1"
          />
        </div>
      </section>

      {/* Section 2: Poste & Département */}
      <section className="bg-surface/30 border-edge border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-accent/10 rounded-lg">
            <Briefcase className="w-5 h-5 text-accent" />
          </div>
          <h3 className="text-lg font-semibold text-content-primary">Poste & Organisation</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <SelectField
            label="Département"
            name="departmentId"
            value={selectedDepartmentId || ''}
            onChange={handleDepartmentChange}
            options={[
              { value: '', label: 'Sélectionner...', disabled: true },
              ...departments.map((dept) => ({
                value: dept.id,
                label: `${dept.code} - ${dept.name}`,
              })),
            ]}
            containerClassName="py-1"
          />

          <SelectField
            label="Poste"
            name="jobPositionId"
            value={selectedJobPositionId || ''}
            onChange={handleJobPositionChange}
            options={[
              { value: '', label: 'Sélectionner...', disabled: true },
              ...filteredJobPositions.map((pos) => ({
                value: pos.id,
                label: `${pos.code} - ${pos.name}`,
              })),
            ]}
            required
            disabled={!selectedDepartmentId}
            error={validationErrors.jobPositionId}
            containerClassName="py-1"
          />
        </div>

        <div className="grid grid-cols-1">
          <SelectField
            label="Supérieur Hiérarchique"
            name="managerId"
            value={formData.managerId || ''}
            onChange={(e) => updateField('managerId', e.target.value || null)}
            options={[
              { value: '', label: '— Aucun —' },
              ...availableManagers,
            ]}
            containerClassName="py-1"
          />
        </div>
      </section>

      {/* Section 3: Dates clés du contrat */}
      <section className="bg-status-warning-bg border-status-warning/20 border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-status-warning/10 rounded-lg">
            <Calendar className="w-5 h-5 text-status-warning" />
          </div>
          <h3 className="text-lg font-semibold text-content-primary">Dates clés du contrat</h3>
        </div>

        <div className={`grid grid-cols-1 ${isNonCDI ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
          {isCDD && (
            <div className="py-1">
              <label className="block text-sm font-medium text-content-primary mb-1">
                Durée période d'essai (mois)
              </label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={formData.dureeEssaiMois || ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  updateField('dureeEssaiMois', v || null);
                }}
                placeholder="Ex: 3"
                className="w-full bg-input border border-input-border rounded-lg px-3 py-2 text-sm text-content-primary focus:border-input-focus focus:outline-none transition-colors"
              />
            </div>
          )}

          <FormField
            label={isCDD && computedDateFinEssai ? "Fin Période d'Essai (auto)" : "Fin Période d'Essai"}
            name="dateFinEssai"
            type="date"
            value={formData.dateFinEssai || ''}
            onChange={(e) => updateField('dateFinEssai', e.target.value || null)}
            disabled={isCDD && !!computedDateFinEssai}
            containerClassName="py-1"
          />

          {isNonCDI && (
            <FormField
              label="Fin de Contrat"
              name="dateFinContrat"
              type="date"
              value={formData.dateFinContrat || ''}
              onChange={(e) => updateField('dateFinContrat', e.target.value || null)}
              required
              containerClassName="py-1"
            />
          )}

          <FormField
            label="Prochaine Visite Médicale"
            name="prochaineMedicale"
            type="date"
            value={formData.prochaineMedicale || ''}
            onChange={(e) => updateField('prochaineMedicale', e.target.value || null)}
            containerClassName="py-1"
          />
        </div>

        {isCDD && computedDateFinEssai && (
          <p className="text-xs text-content-muted mt-2">
            Calculée automatiquement : date d'embauche + {formData.dureeEssaiMois} mois
          </p>
        )}
      </section>

      {/* Section 4: Sortie (only in edit mode) */}
      {editingEmploye && (
        <section className="bg-status-danger/5 border-status-danger/20 border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-status-danger/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-status-danger" />
            </div>
            <h3 className="text-lg font-semibold text-content-primary">Sortie</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Date de Sortie"
              name="dateSortie"
              type="date"
              value={formData.dateSortie || ''}
              onChange={(e) => updateField('dateSortie', e.target.value || null)}
              containerClassName="py-1"
            />

            <SelectField
              label="Motif de Sortie"
              name="motifSortie"
              value={formData.motifSortie || ''}
              onChange={(e) => updateField('motifSortie', e.target.value || null)}
              options={sortieMotifOptions}
              containerClassName="py-1"
            />
          </div>

          <p className="mt-4 text-xs text-content-muted">
            Si renseignée, la date de sortie permet le calcul du prorata sur le dernier mois de paie.
          </p>
        </section>
      )}
      {/* Section 5: Affectations multi-agences (edit mode only) */}
      {editingEmploye && (
        <AssignmentsSection employeId={editingEmploye.id} />
      )}
    </div>
  );
};

/** Inline component for managing multi-agency assignments */
function AssignmentsSection({ employeId }: { employeId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [agences, setAgences] = useState<Array<{ id: string; nom: string; code: string }>>([]);

  // New assignment form state
  const [newAgenceId, setNewAgenceId] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newDateDebut, setNewDateDebut] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);

  const fetchAssignments = () => {
    fetch(`/api/employes/${employeId}/assignments`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : [])
      .then(data => setAssignments(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAssignments();
    fetch('/api/agences', { credentials: 'include' })
      .then(res => res.ok ? res.json() : [])
      .then((data: any[]) => setAgences(data.filter((a: any) => a.statut === 'ACTIVE').map((a: any) => ({ id: a.id, nom: a.nom, code: a.codeAgence }))))
      .catch(() => {});
  }, [employeId]);

  const handleAdd = async () => {
    if (!newAgenceId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/employes/${employeId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agenceId: newAgenceId, roleOperationnel: newRole || null, dateDebut: newDateDebut, isPrimary: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Erreur' }));
        throw new Error(err.message);
      }
      toast.success('Affectation ajoutée');
      setShowAddForm(false);
      setNewAgenceId('');
      setNewRole('');
      fetchAssignments();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'ajout');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnd = async (assignId: string) => {
    try {
      const res = await fetch(`/api/employes/${employeId}/assignments/${assignId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Erreur');
      toast.success('Affectation terminée');
      fetchAssignments();
    } catch {
      toast.error('Erreur lors de la clôture');
    }
  };

  const activeAssignments = assignments.filter(a => a.statut === 'ACTIVE');
  const endedAssignments = assignments.filter(a => a.statut !== 'ACTIVE');
  // Exclude agencies the employee is already actively assigned to
  const availableAgences = agences.filter(a => !activeAssignments.some(aa => aa.agenceId === a.id));

  if (loading) {
    return (
      <section className="bg-surface/30 border-edge border rounded-xl p-6">
        <div className="text-xs text-content-muted">Chargement des affectations...</div>
      </section>
    );
  }

  return (
    <section className="bg-surface/30 border-edge border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/10 rounded-lg">
            <MapPin className="w-5 h-5 text-accent" />
          </div>
          <h3 className="text-lg font-semibold text-content-primary">Affectations agences</h3>
          {activeAssignments.length > 1 && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-bold">
              Multi-agence
            </span>
          )}
        </div>
        {!showAddForm && availableAgences.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
          >
            <Plus size={14} /> Ajouter
          </button>
        )}
      </div>

      {/* Active assignments */}
      {activeAssignments.length === 0 ? (
        <p className="text-xs text-content-muted py-2">Aucune affectation active.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {activeAssignments.map(a => (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-edge bg-surface-base/50">
              <div className="flex items-center gap-3">
                <Building2 size={14} className={a.isPrimary ? 'text-accent' : 'text-content-muted'} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-content-primary">{a.agenceNom}</span>
                    <span className="text-[10px] text-content-muted font-mono">({a.agenceCode})</span>
                    {a.isPrimary && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-bold">Principal</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-content-muted">
                    {a.roleOperationnel && <span>{a.roleOperationnel}</span>}
                    <span>depuis {new Date(a.dateDebut).toLocaleDateString('fr-FR')}</span>
                    {a.managerNom && <span>• Manager: {a.managerNom}</span>}
                  </div>
                </div>
              </div>
              {!a.isPrimary && (
                <button
                  type="button"
                  onClick={() => handleEnd(a.id)}
                  className="p-1.5 rounded-lg text-content-muted hover:text-status-danger hover:bg-status-danger-bg transition-colors"
                  title="Terminer cette affectation"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="p-3 rounded-lg border border-accent/30 bg-accent/5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] text-content-muted uppercase mb-1">Agence</label>
              <select
                value={newAgenceId}
                onChange={e => setNewAgenceId(e.target.value)}
                className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-sm text-content-secondary focus:ring-1 focus:ring-accent focus:outline-none"
              >
                <option value="">Sélectionner...</option>
                {availableAgences.map(a => (
                  <option key={a.id} value={a.id}>{a.nom} ({a.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-content-muted uppercase mb-1">Rôle opérationnel</label>
              <input
                type="text"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                placeholder="Ex: Chef d'agence, Caissier..."
                className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-sm text-content-secondary focus:ring-1 focus:ring-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-content-muted uppercase mb-1">Date début</label>
              <input
                type="date"
                value={newDateDebut}
                onChange={e => setNewDateDebut(e.target.value)}
                className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-sm text-content-secondary focus:ring-1 focus:ring-accent focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs text-content-muted hover:text-content-primary"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newAgenceId || submitting}
              className="px-4 py-1.5 text-xs font-bold text-white bg-accent rounded-lg hover:bg-accent-primary-hover disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}

      {/* Ended assignments (collapsed) */}
      {endedAssignments.length > 0 && (
        <details className="mt-3">
          <summary className="text-[10px] text-content-muted cursor-pointer hover:text-content-secondary">
            {endedAssignments.length} affectation(s) terminée(s)
          </summary>
          <div className="mt-2 space-y-1">
            {endedAssignments.map(a => (
              <div key={a.id} className="flex items-center gap-2 p-2 rounded border border-edge/50 bg-surface/30 opacity-60">
                <Building2 size={12} className="text-content-muted" />
                <span className="text-xs text-content-muted">{a.agenceNom}</span>
                <span className="text-[10px] text-content-muted">
                  {new Date(a.dateDebut).toLocaleDateString('fr-FR')} → {a.dateFin ? new Date(a.dateFin).toLocaleDateString('fr-FR') : '—'}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export default StepContrat;
