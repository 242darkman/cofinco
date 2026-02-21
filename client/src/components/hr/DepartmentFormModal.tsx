import React, { useState, useEffect } from 'react';
import { Modal, FormField, TextareaField, Button } from '../ui';
import type { Department } from '../../hooks/hr/usePositionManager';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  department?: Department | null;
  onSave: (data: { code: string; name: string; description?: string }) => Promise<void>;
  isSaving?: boolean;
}

const EMPTY_FORM = { code: '', name: '', description: '' };

export default function DepartmentFormModal({ isOpen, onClose, department, onSave, isSaving }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when modal opens or department changes
  useEffect(() => {
    if (isOpen) {
      setForm(
        department
          ? { code: department.code, name: department.name, description: department.description || '' }
          : EMPTY_FORM
      );
      setErrors({});
    }
  }, [isOpen, department]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.code.trim()) newErrors.code = 'Le code est requis';
    else if (form.code.length > 30) newErrors.code = '30 caracteres maximum';
    if (!form.name.trim()) newErrors.name = 'Le nom est requis';
    else if (form.name.length > 120) newErrors.name = '120 caracteres maximum';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSave({
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
    });
    onClose();
  };

  const isEditing = !!department;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Modifier le departement' : 'Nouveau departement'}
      size="md"
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
        <FormField
          label="Code"
          name="code"
          value={form.code}
          onChange={handleChange}
          placeholder="Ex: DIR, FIN, RH"
          maxLength={30}
          required
          error={errors.code}
        />
        <FormField
          label="Nom"
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Ex: Direction Generale"
          maxLength={120}
          required
          error={errors.name}
        />
        <TextareaField
          label="Description"
          name="description"
          value={form.description}
          onChange={handleChange}
          placeholder="Description du departement (optionnel)"
          rows={3}
        />
      </form>
    </Modal>
  );
}
