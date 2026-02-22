import React, { useState, useMemo, useCallback } from 'react';
import { X } from 'lucide-react';
import { usePermissions } from '../../auth/ProtectedFeature';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { toast } from '../../../lib/toast';
import { ConfirmDialog, ProgressBar } from '../../ui';

import { STEPS, TOTAL_STEPS } from './constants';
import type { EmployeeConversionData } from './types';
import { useWizardForm } from './hooks/useWizardForm';
import { useWizardValidation } from './hooks/useWizardValidation';
import { useWizardCompletion } from './hooks/useWizardCompletion';
import { useReferenceData } from './hooks/useReferenceData';
import { useCatalogOptions } from './hooks/useCatalogOptions';

import WizardStepper from './components/WizardStepper';
import WizardFooter from './components/WizardFooter';

import StepIdentite from './steps/StepIdentite';
import StepContactAdresse from './steps/StepContactAdresse';
import StepProfilSocio from './steps/StepProfilSocio';
import StepFinancier from './steps/StepFinancier';
import StepReferencesConformite from './steps/StepReferencesConformite';
import StepKycDocuments from './steps/StepKycDocuments';

async function uploadEntityFile(file: File, fileType: 'profile' | 'kyc', entityId: string): Promise<string | null> {
  const body = new FormData();
  body.append('file', file);
  body.append('fileType', fileType);
  body.append('entityType', 'client');
  body.append('entityId', entityId);
  const res = await fetch('/api/storage/entity/upload', { method: 'POST', body, credentials: 'include' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.key as string;
}

interface CreateClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  fromEmployee?: EmployeeConversionData;
}

export default function CreateClientModal({ isOpen, onClose, onSave, fromEmployee }: CreateClientModalProps) {
  const isConversion = !!fromEmployee;
  const { user } = useUserProfile();
  const { isAdmin } = usePermissions();
  const tempEntityId = useMemo(() => crypto.randomUUID(), []);

  const [step, setStep] = useState(isConversion ? 3 : 1);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [asyncErrors, setAsyncErrors] = useState<Record<string, string>>({});

  const { formData, files, setFiles, updateField, clearDraft, resetForm } = useWizardForm(fromEmployee);
  const { errors, markTouched, isStepValid, isFormValid } = useWizardValidation(formData, files, isAdmin, isConversion);
  const { percent, stepCompletion } = useWizardCompletion(formData, files);
  const referenceData = useReferenceData(isOpen, isAdmin);
  const { professions: catalogProfessions, sectors: catalogSectors, activityTypes: catalogActivityTypes, loading: catalogLoading, fetchFiltered: fetchCatalogFiltered } = useCatalogOptions(isOpen);

  const handleAsyncError = useCallback((field: string, message: string) => {
    setAsyncErrors(prev => ({ ...prev, [field]: message }));
  }, []);

  const handleClearAsyncError = useCallback((field: string) => {
    setAsyncErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const mergedErrors = useMemo(() => ({ ...errors, ...asyncErrors }), [errors, asyncErrors]);
  const hasAsyncErrors = Object.keys(asyncErrors).length > 0;

  const stepProps = {
    formData, updateField, errors: mergedErrors, markTouched,
    isConversion, isAdmin, referenceData,
    files, setFiles,
    catalogProfessions, catalogSectors, catalogActivityTypes, catalogLoading,
    onCatalogFilter: fetchCatalogFiltered,
    onAsyncError: handleAsyncError,
    clearAsyncError: handleClearAsyncError,
  };

  const handleClose = () => {
    const hasData = formData.nom.trim() || formData.prenom.trim() || formData.telephoneRaw.trim();
    if (hasData && !isConversion) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // Pre-submit uniqueness check
      const uniqueRes = await fetch('/api/clients/check-uniqueness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          telephone: formData.telephone || undefined,
          email: formData.email || undefined,
          numeroPiece: formData.numeroPiece || undefined,
        }),
      });
      const uniqueData = await uniqueRes.json();
      if (!uniqueData.available) {
        const errorField = uniqueData.field === 'telephone' ? 'telephoneRaw' : uniqueData.field;
        handleAsyncError(errorField, uniqueData.message);
        toast.error(uniqueData.message);
        // Navigate to the step containing the conflicting field
        if (uniqueData.field === 'telephone' || uniqueData.field === 'email') {
          setDirection('backward');
          setStep(2);
        } else if (uniqueData.field === 'numeroPiece') {
          setDirection('backward');
          setStep(6);
        }
        setIsSubmitting(false);
        return;
      }

      // Upload files
      let photoProfileKey: string | null = null;
      const documents: any[] = [];

      if (files.photo) {
        photoProfileKey = await uploadEntityFile(files.photo, 'profile', tempEntityId);
      }

      if (files.idFront) {
        const key = await uploadEntityFile(files.idFront, 'kyc', tempEntityId);
        if (key) {
          const docType = formData.typePiece === 'PASSPORT' ? 'PASSPORT'
            : formData.typePiece === 'PERMIS_CONDUIRE' ? 'DRIVING_LICENSE'
            : formData.typePiece === 'CARTE_RESIDENT' ? 'RESIDENT_CARD'
            : 'ID_CARD_FRONT';
          documents.push({
            id: crypto.randomUUID(), documentType: docType,
            documentName: files.idFront.name, documentUrl: key,
            status: 'pending', createdAt: new Date().toISOString(), isPrivate: true,
          });
        }
      }

      if (files.idBack && ['CNI', 'PERMIS_CONDUIRE', 'CARTE_RESIDENT'].includes(formData.typePiece)) {
        const key = await uploadEntityFile(files.idBack, 'kyc', tempEntityId);
        if (key) {
          documents.push({
            id: crypto.randomUUID(), documentType: 'ID_CARD_BACK',
            documentName: files.idBack.name, documentUrl: key,
            status: 'pending', createdAt: new Date().toISOString(), isPrivate: true,
          });
        }
      }

      if (files.proofOfAddress) {
        const key = await uploadEntityFile(files.proofOfAddress, 'kyc', tempEntityId);
        if (key) {
          documents.push({
            id: crypto.randomUUID(), documentType: 'PROOF_OF_ADDRESS',
            documentName: files.proofOfAddress.name, documentUrl: key,
            status: 'pending', createdAt: new Date().toISOString(), isPrivate: true,
          });
        }
      }

      if (isConversion && fromEmployee) {
        // Mode conversion
        const convPayload = {
          adresseDomicile: formData.adresseDomicile,
          villeId: formData.villeId || undefined,
          localityType: formData.localityType || undefined,
          paysResidenceId: formData.paysResidenceId || undefined,
          statutLogement: formData.statutLogement || undefined,
          professionId: formData.professionId && formData.professionId !== '__AUTRE__' ? formData.professionId : undefined,
          professionAutreTexte: formData.professionId === '__AUTRE__' ? formData.professionAutreTexte : undefined,
          employeur: formData.employeur || undefined,
          activityTypeId: formData.activityTypeId || undefined,
          ancienneteActiviteMois: formData.ancienneteActiviteMois ? parseInt(formData.ancienneteActiviteMois) : undefined,
          sectorId: formData.sectorId || undefined,
          typeRevenu: formData.typeRevenu,
          revenuMensuel: formData.typeRevenu === 'Mensuel' ? formData.revenuMensuel : undefined,
          revenuJournalier: formData.typeRevenu === 'Journalier' ? formData.revenuJournalier : undefined,

          agenceId: formData.agenceId || user?.agenceId,
          agentReferentId: formData.agentReferentId || undefined,
          clientOrigin: 'EMPLOYEE_CONVERSION',
          situationMatrimoniale: formData.situationMatrimoniale || undefined,
          nombrePersonnesCharge: formData.nombrePersonnesCharge ? parseInt(formData.nombrePersonnesCharge) : undefined,
          niveauEducation: formData.niveauEducation || undefined,
          typeClient: formData.typeClient || undefined,
          sourceFonds: formData.sourceFonds || undefined,
          isPep: formData.isPep,
          pepDetails: formData.isPep ? formData.pepDetails : undefined,
          consentementDonnees: formData.consentementDonnees,
          referencesPersonnes: formData.referencesPersonnes.length > 0 ? formData.referencesPersonnes : undefined,
          typePiece: formData.typePiece || undefined,
          numeroPiece: formData.numeroPiece || undefined,
          dateExpirationPiece: formData.dateExpirationPiece || undefined,
          paysEmissionId: formData.paysEmissionId || undefined,
          tempEntityId,
          documents: documents.length > 0 ? documents : undefined,
        };

        const res = await fetch(`/api/clients/from-user/${fromEmployee.userId}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify(convPayload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Erreur lors de la conversion');
        }
        const result = await res.json();
        await onSave(result);
        onClose();
      } else {
        // Mode création
        const payload = {
          nom: formData.nom, prenom: formData.prenom,
          dateNaissance: formData.dateNaissance || undefined,
          sexe: formData.sexe, lieuNaissance: formData.lieuNaissance || undefined,
          lieuNaissanceLocalityId: formData.lieuNaissanceLocalityId || undefined,
          lieuNaissanceLocalityType: formData.lieuNaissanceLocalityType || undefined,
          nationaliteId: formData.nationaliteId || undefined,
          paysNaissanceId: formData.paysNaissanceId || undefined,
          telephone: formData.telephone, email: formData.email || undefined,
          villeId: formData.villeId || undefined,
          localityType: formData.localityType || undefined,
          adresseDomicile: formData.adresseDomicile || undefined,
          paysResidenceId: formData.paysResidenceId || undefined,
          statutLogement: formData.statutLogement || undefined,
          situationMatrimoniale: formData.situationMatrimoniale || undefined,
          nombrePersonnesCharge: formData.nombrePersonnesCharge ? parseInt(formData.nombrePersonnesCharge) : undefined,
          niveauEducation: formData.niveauEducation || undefined,
          typeClient: formData.typeClient || undefined,
          professionId: formData.professionId && formData.professionId !== '__AUTRE__' ? formData.professionId : undefined,
          professionAutreTexte: formData.professionId === '__AUTRE__' ? formData.professionAutreTexte : undefined,
          employeur: formData.employeur || undefined,
          activityTypeId: formData.activityTypeId || undefined,
          ancienneteActiviteMois: formData.ancienneteActiviteMois ? parseInt(formData.ancienneteActiviteMois) : undefined,
          sourceFonds: formData.sourceFonds || undefined,
          sectorId: formData.sectorId || undefined,
          typeRevenu: formData.typeRevenu,
          revenuMensuel: formData.typeRevenu === 'Mensuel' ? formData.revenuMensuel : undefined,
          revenuJournalier: formData.typeRevenu === 'Journalier' ? formData.revenuJournalier : undefined,

          agenceId: formData.agenceId || user?.agenceId,
          agentReferentId: formData.agentReferentId || undefined,
          clientOrigin: formData.clientOrigin,
          isPep: formData.isPep,
          pepDetails: formData.isPep ? formData.pepDetails : undefined,
          consentementDonnees: formData.consentementDonnees,
          referencesPersonnes: formData.referencesPersonnes.length > 0 ? formData.referencesPersonnes : undefined,
          typePiece: formData.typePiece || undefined,
          numeroPiece: formData.numeroPiece || undefined,
          dateExpirationPiece: formData.dateExpirationPiece || undefined,
          paysEmissionId: formData.paysEmissionId || undefined,
          tempEntityId,
          photoProfile: photoProfileKey || undefined,
          documents: documents.length > 0 ? documents : undefined,
        };

        await onSave(payload);
        clearDraft();
        onClose();
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erreur lors de la création du client');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const animClass = direction === 'forward'
    ? 'animate-in slide-in-from-right fade-in duration-300'
    : 'animate-in slide-in-from-left fade-in duration-300';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] bg-surface-base border border-edge rounded-2xl shadow-2xl flex flex-col overflow-hidden">

          {/* Header + Stepper */}
          <div className="bg-surface-base border-b border-edge px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg sm:text-xl font-bold text-content-primary">
                {isConversion ? 'Convertir Employé en Client' : 'Nouveau Client'}
              </h2>
              <button onClick={handleClose} className="p-1">
                <X className="text-content-muted hover:text-content-primary w-5 h-5" />
              </button>
            </div>

            <WizardStepper
              currentStep={step}
              isConversion={isConversion}
            />
          </div>

          {/* Body */}
          <div className="wizard-form flex-1 overflow-y-auto px-4 sm:px-6 py-5">
            {/* Thin progress bar */}
            <ProgressBar
              value={percent}
              max={100}
              size="sm"
              color={percent >= 80 ? 'success' : percent >= 40 ? 'primary' : 'neutral'}
              className="mb-4"
            />

            <div key={step} className={animClass}>
              {/* Step title */}
              <div className="mb-5">
                <h3 className="text-sm font-bold text-content-primary">
                  {STEPS[step - 1]?.label}
                </h3>
                <p className="text-[10px] text-content-muted">
                  Étape {step} sur {TOTAL_STEPS} — {percent}%
                  {!isStepValid(step) && ' · Remplissez les champs obligatoires'}
                </p>
              </div>

              {step === 1 && <StepIdentite {...stepProps} />}
              {step === 2 && <StepContactAdresse {...stepProps} />}
              {step === 3 && <StepProfilSocio {...stepProps} />}
              {step === 4 && <StepFinancier {...stepProps} />}
              {step === 5 && <StepReferencesConformite {...stepProps} />}
              {step === 6 && <StepKycDocuments {...stepProps} />}
            </div>
          </div>

          {/* Footer */}
          <WizardFooter
            step={step}
            setStep={setStep}
            setDirection={setDirection}
            isStepValid={isStepValid}
            isFormValid={isFormValid && !hasAsyncErrors}
            isSubmitting={isSubmitting}
            isConversion={isConversion}
            onSave={handleSave}
            onCancel={handleClose}
          />
        </div>
      </div>

      {/* Close confirmation */}
      <ConfirmDialog
        isOpen={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={() => {
          clearDraft();
          resetForm();
          setShowCloseConfirm(false);
          onClose();
        }}
        title="Quitter la saisie ?"
        message="Un brouillon a été sauvegardé automatiquement. Vous pourrez reprendre la saisie en rouvrant le formulaire."
        variant="warning"
        confirmText="Quitter"
        cancelText="Continuer"
      />
    </>
  );
}
