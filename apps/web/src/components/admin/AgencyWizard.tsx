import React, { useState, useCallback, useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Building2, MapPin, Users, ChevronLeft, ChevronRight, Check, Eye } from 'lucide-react';
import Modal from '../ui/Modal';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import { CascadingGeoSelect, type GeoSelection } from '../shared/CascadingGeoSelect';
import { agenceApi } from '../../lib/api-client';
import { toast } from '../../lib/toast';
import { TypeAgence } from '@shared/enum/status-constants';

const TYPE_OPTIONS = [
  { value: TypeAgence.SECONDARY, label: 'Secondaire' },
  { value: TypeAgence.MAIN, label: 'Siège' },
  { value: TypeAgence.KIOSK, label: 'Kiosque' },
];

interface StepDef {
  num: number;
  key: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
}

const STEPS: StepDef[] = [
  { num: 1, key: 'identity', shortLabel: 'Identité', icon: Building2 },
  { num: 2, key: 'location', shortLabel: 'Localisation', icon: MapPin },
  { num: 3, key: 'contact', shortLabel: 'Contact & Revue', icon: Users },
];

interface AgencyFormData {
  codeAgence: string;
  nom: string;
  typeAgence: string;
  adresse: string;
  geo: GeoSelection;
  telephone: string;
  email: string;
  responsableNom: string;
  responsablePhone: string;
  notes: string;
}

const initialFormData: AgencyFormData = {
  codeAgence: '',
  nom: '',
  typeAgence: TypeAgence.SECONDARY,
  adresse: '',
  geo: { paysId: '', regionId: '', villeId: '' },
  telephone: '',
  email: '',
  responsableNom: '',
  responsablePhone: '',
  notes: '',
};

interface AgencyWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: (agencyId: string) => void;
}

export function AgencyWizard({ open, onClose, onCreated }: AgencyWizardProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<AgencyFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    setStep(1);
    setErrors({});
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const updateField = useCallback(<K extends keyof AgencyFormData>(key: K, value: AgencyFormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // Step validation
  const isStepValid = useCallback((stepNum: number): boolean => {
    switch (stepNum) {
      case 1:
        return !!(formData.codeAgence.trim() && formData.nom.trim() && formData.typeAgence);
      case 2:
        return !!(formData.geo.villeId); // Ville is the minimum
      case 3:
        return true; // Contact is optional at creation (DRAFT)
      default:
        return false;
    }
  }, [formData]);

  const isFormValid = useMemo(() =>
    STEPS.every(s => isStepValid(s.num)),
    [isStepValid]
  );

  const handleSubmit = useCallback(async () => {
    if (!isFormValid || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const result = await agenceApi.create({
        codeAgence: formData.codeAgence.trim(),
        nom: formData.nom.trim(),
        typeAgence: formData.typeAgence,
        adresse: formData.adresse.trim() || undefined,
        villeId: formData.geo.villeId || undefined,
        telephone: formData.telephone.trim() || undefined,
        email: formData.email.trim() || undefined,
        responsableNom: formData.responsableNom.trim() || undefined,
        responsablePhone: formData.responsablePhone.trim() || undefined,
        latitude: formData.geo.latitude,
        longitude: formData.geo.longitude,
        notes: formData.notes.trim() || undefined,
      });

      toast.success(`Agence "${formData.nom}" créée en brouillon`);
      handleClose();
      onCreated(result.id);
    } catch (error: any) {
      const message = error?.message || "Erreur lors de la création";
      toast.error(message);
      if (message.includes("code agence")) {
        setErrors({ codeAgence: "Ce code agence existe déjà" });
        setStep(1);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, isFormValid, isSubmitting, handleClose, onCreated]);

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Nouvelle agence"
      size="lg"
    >
      {/* Stepper */}
      <div className="hidden sm:flex items-center justify-between px-4 py-3 border-b border-edge overflow-x-auto">
        {STEPS.map((s, i) => {
          const isPast = step > s.num;
          const isCurrent = step === s.num;
          const isClickable = isPast;
          const Icon = s.icon;

          return (
            <div key={s.key} className="flex items-center">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && setStep(s.num)}
                className={`flex flex-col items-center gap-1 group ${isClickable ? "cursor-pointer" : "cursor-default"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200
                    ${isPast ? "bg-accent text-white" : ""}
                    ${isCurrent ? "bg-accent text-white ring-4 ring-accent/20 scale-110 shadow-lg" : ""}
                    ${!isPast && !isCurrent ? "bg-surface-subtle/50 border border-edge-subtle text-content-muted" : ""}
                    ${isClickable ? "hover:ring-2 hover:ring-accent/30" : ""}
                  `}
                >
                  {isPast ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={`text-[10px] leading-tight text-center max-w-[70px] ${isCurrent ? "text-accent font-semibold" : "text-content-muted"}`}>
                  {s.shortLabel}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-6 h-px mx-1 ${isPast ? "bg-accent" : "bg-edge-subtle"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile dots */}
      <div className="flex sm:hidden items-center justify-center gap-1.5 py-2 border-b border-edge">
        {STEPS.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={step <= s.num}
            onClick={() => step > s.num && setStep(s.num)}
            className={`rounded-full transition-all duration-200
              ${step === s.num ? "w-6 h-2 bg-accent" : "w-2 h-2"}
              ${step > s.num ? "bg-accent/60" : ""}
              ${step < s.num ? "bg-edge-subtle" : ""}
            `}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="p-6 space-y-4 min-h-[300px]">
        {step === 1 && (
          <>
            <h3 className="text-sm font-semibold text-content-primary mb-3">Identité de l'agence</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Code Agence"
                name="codeAgence"
                value={formData.codeAgence}
                onChange={(e) => updateField('codeAgence', e.target.value)}
                placeholder="AG-XXX"
                required
                error={errors.codeAgence}
              />
              <SelectField
                label="Type d'agence"
                name="typeAgence"
                value={formData.typeAgence}
                onChange={(e) => updateField('typeAgence', e.target.value)}
                options={TYPE_OPTIONS}
                required
              />
            </div>
            <FormField
              label="Nom de l'agence"
              name="nom"
              value={formData.nom}
              onChange={(e) => updateField('nom', e.target.value)}
              placeholder="Agence..."
              required
              error={errors.nom}
            />
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="text-sm font-semibold text-content-primary mb-3">Localisation</h3>
            <CascadingGeoSelect
              value={formData.geo}
              onChange={(geo) => updateField('geo', geo)}
            />
            <FormField
              label="Adresse"
              name="adresse"
              value={formData.adresse}
              onChange={(e) => updateField('adresse', e.target.value)}
              placeholder="Adresse complète"
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Latitude"
                name="latitude"
                type="number"
                value={formData.geo.latitude?.toString() || ''}
                onChange={(e) => updateField('geo', { ...formData.geo, latitude: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Auto-rempli"
                disabled={!!formData.geo.villeId}
              />
              <FormField
                label="Longitude"
                name="longitude"
                type="number"
                value={formData.geo.longitude?.toString() || ''}
                onChange={(e) => updateField('geo', { ...formData.geo, longitude: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Auto-rempli"
                disabled={!!formData.geo.villeId}
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3 className="text-sm font-semibold text-content-primary mb-3">Contact & Responsable</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Téléphone"
                name="telephone"
                value={formData.telephone}
                onChange={(e) => updateField('telephone', e.target.value)}
                placeholder="+242 06 XXX XX XX"
              />
              <FormField
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="email@exemple.com"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Responsable"
                name="responsableNom"
                value={formData.responsableNom}
                onChange={(e) => updateField('responsableNom', e.target.value)}
                placeholder="Nom du responsable"
              />
              <FormField
                label="Tél. responsable"
                name="responsablePhone"
                value={formData.responsablePhone}
                onChange={(e) => updateField('responsablePhone', e.target.value)}
                placeholder="+242 06 XXX XX XX"
              />
            </div>
            <FormField
              label="Notes"
              name="notes"
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Notes ou observations..."
            />

            {/* Review summary */}
            <div className="mt-4 p-4 rounded-lg bg-surface-subtle border border-edge-subtle">
              <h4 className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Résumé
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <span className="text-content-muted">Code:</span>{' '}
                  <span className="font-medium text-content-primary">{formData.codeAgence || '—'}</span>
                </div>
                <div>
                  <span className="text-content-muted">Type:</span>{' '}
                  <span className="font-medium text-content-primary">
                    {TYPE_OPTIONS.find(t => t.value === formData.typeAgence)?.label || '—'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-content-muted">Nom:</span>{' '}
                  <span className="font-medium text-content-primary">{formData.nom || '—'}</span>
                </div>
                {formData.geo.regionNom && (
                  <div className="col-span-2">
                    <span className="text-content-muted">Localisation:</span>{' '}
                    <span className="font-medium text-content-primary">{formData.geo.regionNom}</span>
                  </div>
                )}
                {formData.adresse && (
                  <div className="col-span-2">
                    <span className="text-content-muted">Adresse:</span>{' '}
                    <span className="font-medium text-content-primary">{formData.adresse}</span>
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-content-muted">
                L'agence sera créée en <span className="font-semibold text-status-warning">brouillon</span>.
                Vous pourrez ensuite compléter la checklist et la soumettre pour activation.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 px-6 py-4 border-t border-edge bg-surface-subtle/30">
        <div className="flex-1">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 px-3 py-2 text-sm text-content-secondary hover:text-content-primary rounded-lg hover:bg-surface-subtle transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Précédent
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-content-secondary hover:text-content-primary rounded-lg hover:bg-surface-subtle transition-colors"
          >
            Annuler
          </button>
          {step === STEPS.length ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors
                bg-btn-success text-white hover:bg-btn-success/90
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Spinner size="xs" tone="current" />}
              Créer l'agence
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={!isStepValid(step)}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors
                bg-accent text-white hover:bg-accent/90
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Suivant
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
