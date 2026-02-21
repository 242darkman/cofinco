import React from 'react';
import { Building2, Briefcase, Calendar, AlertTriangle } from 'lucide-react';
import FormField from '../../ui/FormField';
import SelectField from '../../ui/SelectField';

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
          <FormField
            label="Fin Période d'Essai"
            name="dateFinEssai"
            type="date"
            value={formData.dateFinEssai || ''}
            onChange={(e) => updateField('dateFinEssai', e.target.value || null)}
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
    </div>
  );
};

export default StepContrat;
