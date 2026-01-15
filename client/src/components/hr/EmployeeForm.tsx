import React, { useState, useCallback } from 'react';
import { X, Save, AlertTriangle, Camera, Upload, User } from 'lucide-react';
import { Employe, EmployeFormData } from '../../hooks/hr/useEmployes';
import { Modal, FormField, SelectField, Button } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import { useMinIOUpload } from '../../hooks/useMinIOUpload';

interface EmployeeFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EmployeFormData) => Promise<{ success: boolean; error?: string }>;
  editingEmploye: Employe | null;
  initialData: EmployeFormData;
}

export default function EmployeeForm({
  isOpen,
  onClose,
  onSave,
  editingEmploye,
  initialData
}: EmployeeFormProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canSaveEmployees = editingEmploye
    ? (hasPermission('rh', 'edit') || hasPermission('employes', 'edit'))
    : (hasPermission('rh', 'create') || hasPermission('employes', 'create'));

  const [formData, setFormData] = useState<EmployeFormData>(initialData);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialData.photoProfile || null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const result = await onSave(formData);
    setSaving(false);

    if (result.success) {
      toast.success('Employé sauvegardé avec succès');
      onClose();
    } else {
      toast.error(result.error || 'Erreur lors de la sauvegarde');
    }
  }, [formData, onSave, onClose]);

  const updateField = (field: keyof EmployeFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  React.useEffect(() => {
    setFormData(initialData);
    setPhotoPreview(initialData.photoProfile || (editingEmploye as any)?.photoProfile || null);
  }, [initialData, editingEmploye]);

  const { uploadFile, isUploading } = useMinIOUpload({
    path: 'employees',
    isPublic: true,
    onError: (err) => toast.error(`Erreur upload: ${err.message}`)
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('La photo ne doit pas dépasser 2 Mo');
        return;
      }
      
      const url = await uploadFile(file);
      if (url) {
        setPhotoPreview(url);
        updateField('photoProfile', url);
      }
    }
  };

  const removePhoto = () => {
    setPhotoPreview(null);
    updateField('photoProfile', '');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingEmploye ? 'Modifier Employé' : 'Nouvel Employé'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photo Upload Section */}
        <div className="flex flex-col items-center gap-4 pb-4 border-b border-slate-700">
          <div className="relative">
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Photo de profil"
                className="w-24 h-24 rounded-full object-cover border-4 border-slate-600 shadow-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center border-4 border-slate-600 shadow-lg">
                <User size={40} className="text-white" />
              </div>
            )}
            {photoPreview && (
              <button
                type="button"
                onClick={removePhoto}
                className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg"
                title="Supprimer la photo"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <label className="cursor-pointer px-3 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-2 text-sm">
              <Upload size={16} />
              Uploader
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">JPG, PNG ou GIF. Max 2 Mo</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Matricule"
            name="matricule"
            type="text"
            value={formData.matricule}
            onChange={(e) => updateField('matricule', e.target.value)}
            required
          />
          
          <SelectField
            label="Sexe"
            name="sexe"
            value={formData.sexe}
            onChange={(e) => updateField('sexe', e.target.value as 'M' | 'F')}
            options={[
              { value: 'M', label: 'Masculin' },
              { value: 'F', label: 'Féminin' }
            ]}
            required
          />

          <FormField
            label="Nom"
            name="nom"
            type="text"
            value={formData.nom}
            onChange={(e) => updateField('nom', e.target.value)}
            required
          />

          <FormField
            label="Prénom"
            name="prenom"
            type="text"
            value={formData.prenom}
            onChange={(e) => updateField('prenom', e.target.value)}
            required
          />

          <FormField
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
          />

          <FormField
            label="Téléphone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
          />

          <FormField
            label="Date de Naissance"
            name="dateNaissance"
            type="date"
            value={formData.dateNaissance}
            onChange={(e) => updateField('dateNaissance', e.target.value)}
          />

          <FormField
            label="Date d'Embauche"
            name="dateEmbauche"
            type="date"
            value={formData.dateEmbauche}
            onChange={(e) => updateField('dateEmbauche', e.target.value)}
            required
          />

          <FormField
            label="Adresse"
            name="adresse"
            type="text"
            value={formData.adresse}
            onChange={(e) => updateField('adresse', e.target.value)}
          />

          <FormField
            label="Ville"
            name="ville"
            type="text"
            value={formData.ville}
            onChange={(e) => updateField('ville', e.target.value)}
          />

          <FormField
            label="Département"
            name="departement"
            type="text"
            value={formData.departement}
            onChange={(e) => updateField('departement', e.target.value)}
          />

          <FormField
            label="Poste"
            name="poste"
            type="text"
            value={formData.poste}
            onChange={(e) => updateField('poste', e.target.value)}
            required
          />

          <SelectField
            label="Type de Contrat"
            name="typeContrat"
            value={formData.typeContrat}
            onChange={(e) => updateField('typeContrat', e.target.value)}
            options={[
              { value: 'CDI', label: 'CDI' },
              { value: 'CDD', label: 'CDD' },
              { value: 'Stage', label: 'Stage' },
              { value: 'Freelance', label: 'Freelance' },
              { value: 'Temporaire', label: 'Temporaire' }
            ]}
            required
          />

          <FormField
            label="Salaire de Base (FCFA)"
            name="salaireBase"
            type="number"
            value={formData.salaireBase}
            onChange={(e) => updateField('salaireBase', e.target.value)}
            required
          />

          <FormField
            label="Numéro CNSS"
            name="numeroCnss"
            type="text"
            value={formData.numeroCnss}
            onChange={(e) => updateField('numeroCnss', e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            <X size={18} />
            Annuler
          </Button>
          {canSaveEmployees ? (
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
            >
              <Save size={18} />
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          ) : (
            <div className="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle size={16} />
              Permission requise
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
