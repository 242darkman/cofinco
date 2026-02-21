import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Modal, FormField, SelectField, TextareaField, Button } from '../ui';
import type { Department, JobPosition } from '../../hooks/hr/usePositionManager';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  position?: JobPosition | null;
  departments: Department[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  isSaving?: boolean;
}

const QUALIFICATION_OPTIONS = [
  { value: 'OUVRIER', label: 'Ouvrier' },
  { value: 'EMPLOYE', label: 'Employe' },
  { value: 'AGENT_MAITRISE', label: 'Agent de maitrise' },
  { value: 'CADRE', label: 'Cadre' },
  { value: 'CADRE_SUPERIEUR', label: 'Cadre superieur' },
];

interface FormState {
  departmentId: string;
  code: string;
  name: string;
  description: string;
  qualification: string;
  salaireMin: string;
  salaireMax: string;
  responsabilites: string;
  competencesRequises: string[];
  effectifPrevu: string;
}

const EMPTY_FORM: FormState = {
  departmentId: '',
  code: '',
  name: '',
  description: '',
  qualification: '',
  salaireMin: '',
  salaireMax: '',
  responsabilites: '',
  competencesRequises: [],
  effectifPrevu: '',
};

export default function PositionFormModal({ isOpen, onClose, position, departments, onSave, isSaving }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [competenceInput, setCompetenceInput] = useState('');

  // Reset form when modal opens or position changes
  useEffect(() => {
    if (isOpen) {
      if (position) {
        setForm({
          departmentId: position.departmentId,
          code: position.code,
          name: position.name,
          description: position.description || '',
          qualification: position.qualification || '',
          salaireMin: position.salaireMin != null ? String(position.salaireMin) : '',
          salaireMax: position.salaireMax != null ? String(position.salaireMax) : '',
          responsabilites: position.responsabilites || '',
          competencesRequises: position.competencesRequises || [],
          effectifPrevu: position.effectifPrevu != null ? String(position.effectifPrevu) : '',
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setErrors({});
      setCompetenceInput('');
    }
  }, [isOpen, position]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const addCompetence = () => {
    const trimmed = competenceInput.trim();
    if (trimmed && !form.competencesRequises.includes(trimmed)) {
      setForm(prev => ({
        ...prev,
        competencesRequises: [...prev.competencesRequises, trimmed],
      }));
    }
    setCompetenceInput('');
  };

  const removeCompetence = (index: number) => {
    setForm(prev => ({
      ...prev,
      competencesRequises: prev.competencesRequises.filter((_, i) => i !== index),
    }));
  };

  const handleCompetenceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCompetence();
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.departmentId) newErrors.departmentId = 'Le departement est requis';
    if (!form.code.trim()) newErrors.code = 'Le code est requis';
    if (!form.name.trim()) newErrors.name = 'Le nom est requis';
    if (form.salaireMin && form.salaireMax) {
      const min = Number(form.salaireMin);
      const max = Number(form.salaireMax);
      if (min > max) newErrors.salaireMax = 'Le salaire max doit etre superieur au salaire min';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSave({
      departmentId: form.departmentId,
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      qualification: form.qualification || null,
      salaireMin: form.salaireMin ? Number(form.salaireMin) : null,
      salaireMax: form.salaireMax ? Number(form.salaireMax) : null,
      responsabilites: form.responsabilites.trim() || null,
      competencesRequises: form.competencesRequises.length > 0 ? form.competencesRequises : null,
      effectifPrevu: form.effectifPrevu ? Number(form.effectifPrevu) : null,
    });
    onClose();
  };

  const isEditing = !!position;

  const departmentOptions = departments.map(d => ({
    value: d.id,
    label: `${d.code} - ${d.name}`,
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Modifier le poste' : 'Nouveau poste'}
      size="lg"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Annuler
          </Button>
          <Button variant="primary" onClick={handleSubmit} isLoading={isSaving}>
            {isEditing ? 'Enregistrer' : 'Creer'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Department + Code */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label="Departement"
            name="departmentId"
            value={form.departmentId}
            onChange={handleChange}
            options={departmentOptions}
            placeholder="Selectionner un departement"
            required
            error={errors.departmentId}
          />
          <FormField
            label="Code"
            name="code"
            value={form.code}
            onChange={handleChange}
            placeholder="Ex: DEV-SR, COMP-01"
            required
            error={errors.code}
          />
        </div>

        {/* Name */}
        <FormField
          label="Intitule du poste"
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Ex: Developpeur Senior"
          required
          error={errors.name}
        />

        {/* Description */}
        <TextareaField
          label="Description"
          name="description"
          value={form.description}
          onChange={handleChange}
          placeholder="Description du poste (optionnel)"
          rows={3}
        />

        {/* Qualification + Effectif */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label="Qualification"
            name="qualification"
            value={form.qualification}
            onChange={handleChange}
            options={QUALIFICATION_OPTIONS}
            placeholder="Selectionner..."
          />
          <FormField
            label="Effectif prevu"
            name="effectifPrevu"
            type="number"
            min={0}
            value={form.effectifPrevu}
            onChange={handleChange}
            placeholder="Ex: 5"
          />
        </div>

        {/* Salary range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Salaire minimum"
            name="salaireMin"
            type="number"
            min={0}
            value={form.salaireMin}
            onChange={handleChange}
            placeholder="Ex: 150 000 FCFA"
          />
          <FormField
            label="Salaire maximum"
            name="salaireMax"
            type="number"
            min={0}
            value={form.salaireMax}
            onChange={handleChange}
            placeholder="Ex: 500 000 FCFA"
            error={errors.salaireMax}
          />
        </div>

        {/* Responsabilites */}
        <TextareaField
          label="Responsabilites"
          name="responsabilites"
          value={form.responsabilites}
          onChange={handleChange}
          placeholder="Responsabilites principales du poste"
          rows={3}
        />

        {/* Competences requises (tag input) */}
        <div>
          <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
            Competences requises
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={competenceInput}
              onChange={(e) => setCompetenceInput(e.target.value)}
              onKeyDown={handleCompetenceKeyDown}
              placeholder="Taper puis Entree pour ajouter"
              className="flex-1 px-4 py-2 sm:py-2.5 bg-input-bg border border-input-border rounded-lg text-input-text text-sm sm:text-base placeholder:text-input-placeholder focus:outline-none focus:ring-2 focus:border-input-focus focus:ring-input-focus/30"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addCompetence}>
              Ajouter
            </Button>
          </div>
          {form.competencesRequises.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {form.competencesRequises.map((comp, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/30"
                >
                  {comp}
                  <button
                    type="button"
                    onClick={() => removeCompetence(i)}
                    className="hover:text-status-danger transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
