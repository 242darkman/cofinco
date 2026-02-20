import React, { useState, useCallback, useRef } from 'react';
import { X, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useReactToPrint } from 'react-to-print';
import { EnqueteReportTemplate } from '../../../ui/printable/EnqueteReportTemplate';
import { saveEnqueteOffline } from '../../../../lib/offline-db';
import { formatClientName } from '../../../../lib/format';
import { ENQUETE_STEPS, TOTAL_ENQUETE_STEPS } from './constants';
import { useEnqueteForm } from './hooks/useEnqueteForm';
import { useEnqueteValidation } from './hooks/useEnqueteValidation';
import EnqueteStepper from './components/EnqueteStepper';
import EnqueteFooter from './components/EnqueteFooter';
import PlanRequirementsBanner from './components/PlanRequirementsBanner';
import EnqueteTimeline from './components/EnqueteTimeline';
import StepClientSituation from './steps/StepClientSituation';
import StepGeolocalisation from './steps/StepGeolocalisation';
import StepActiviteRevenus from './steps/StepActiviteRevenus';
import StepGarantiesDocuments from './steps/StepGarantiesDocuments';
import StepAnalyseRecommandation from './steps/StepAnalyseRecommandation';
import type { EnqueteWizardProps } from './types';

export default function EnqueteWizard({ clientId, clientNom, initialData, onClose, onSave, readOnly = false }: EnqueteWizardProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });

  const { formData, updateField, clearDraft, creditPlan } = useEnqueteForm({
    initialData,
    clientId,
    readOnly,
  });

  const { isStepValid, isFormValid, markTouched, getFieldError } = useEnqueteValidation(formData, creditPlan);

  const handleSubmit = useCallback(async () => {
    if (readOnly || !isFormValid()) return;
    setIsSubmitting(true);
    try {
      const payload = {
        clientId: formData.client_id,
        demandeId: formData.demandeId,
        montantDemande: formData.montant_demande,
        objetCredit: formData.description_activite,
        categorieActivite: formData.categorie_activite,
        typeActivite: formData.type_activite,
        ancienneteActivite: formData.anciennete_activite,
        typeRevenu: formData.type_revenu === 'Journalier' ? 'DAILY' : 'MONTHLY',
        revenuMensuel: formData.revenu_mensuel_declare,
        revenuJournalier: formData.revenu_journalier,
        joursTravailMois: formData.jours_travail_mois,
        chargesMensuelles: formData.charges_mensuelles,
        autresCredits: formData.autres_credits,
        garantiesProposees: formData.garanties_proposees,
        photosActivite: formData.photos_activite,
        photosGeotagged: formData.photos_geotagged,
        documentsJustificatifs: formData.documents_justificatifs,
        geoLatitude: formData.geoLatitude,
        geoLongitude: formData.geoLongitude,
        geoAccuracy: formData.geoAccuracy,
        geoTimestamp: formData.geoTimestamp?.toISOString(),
        // Step 1 — client situation
        situationMatrimoniale: formData.situationMatrimoniale,
        personnesCharge: formData.personnesCharge,
        typeHabitation: formData.typeHabitation,
        // Step 5 — agent recommendation
        agentRecommendation: formData.agentRecommendation,
        recommendedAmount: formData.recommendedAmount,
        riskLevel: formData.riskLevel,
        riskFactors: formData.riskFactors,
        observations: formData.observations,
        statut: 'PENDING',
      };

      if (!navigator.onLine) {
        await saveEnqueteOffline(payload);
        toast.success('Enquête sauvegardée hors-ligne', { description: 'Elle sera synchronisée automatiquement.' });
      } else {
        await onSave(payload);
      }
      clearDraft();
    } catch (err: any) {
      toast.error('Erreur lors de la soumission', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, readOnly, isFormValid, onSave, clearDraft]);

  const animClass = direction === 'forward'
    ? 'animate-in slide-in-from-right fade-in duration-300'
    : 'animate-in slide-in-from-left fade-in duration-300';

  const currentStepDef = ENQUETE_STEPS.find(s => s.num === step)!;

  const stepProps = {
    formData,
    updateField,
    readOnly,
    creditPlan,
    clientNom,
    markTouched,
    getFieldError,
  };

  const renderStep = () => {
    switch (step) {
      case 1: return <StepClientSituation {...stepProps} clientId={clientId} initialData={initialData} />;
      case 2: return <StepGeolocalisation {...stepProps} initialData={initialData} />;
      case 3: return <StepActiviteRevenus {...stepProps} />;
      case 4: return <StepGarantiesDocuments {...stepProps} />;
      case 5: return <StepAnalyseRecommandation {...stepProps} />;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gradient-to-br from-surface-base to-surface border border-edge rounded-xl max-w-4xl w-full h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-surface-base/95 backdrop-blur-sm border-b border-edge px-4 py-3 flex-shrink-0 z-10">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold text-content-primary">
                {readOnly ? 'Détails de l\'Enquête' : 'Enquête de Crédit'}
              </h2>
              <p className="text-content-muted text-xs">
                {clientNom || 'Client'}
                {readOnly && <span className="ml-2 text-status-success">(Lecture seule)</span>}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {readOnly && initialData?.statut && (
                <button
                  onClick={() => handlePrint()}
                  className="p-1.5 hover:bg-surface-elevated rounded-lg transition text-content-muted hover:text-accent"
                  title="Imprimer le rapport"
                >
                  <Printer size={18} />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-surface-elevated rounded-lg transition text-content-muted hover:text-content-primary"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <EnqueteStepper currentStep={step} />
          {creditPlan && <div className="mt-2"><PlanRequirementsBanner creditPlan={creditPlan} compact /></div>}
          {readOnly && initialData && (
            <div className="mt-2">
              <EnqueteTimeline
                enquete={{
                  statut: initialData.statut || 'IN_PROGRESS',
                  assignedAt: initialData.assignedAt,
                  startedAt: initialData.startedAt,
                  submittedAt: initialData.submittedAt,
                  reviewedAt: initialData.reviewedAt,
                  closedAt: initialData.closedAt,
                  agentRecommendation: initialData.agentRecommendation,
                  createdByName: initialData.createdByName,
                }}
                compact
              />
            </div>
          )}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-4">
          <fieldset disabled={readOnly} className="space-y-4">
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-content-primary">{currentStepDef.label}</h3>
              <p className="text-xs text-content-muted">Étape {step}/{TOTAL_ENQUETE_STEPS}</p>
            </div>
            <div key={step} className={animClass}>
              {renderStep()}
            </div>
          </fieldset>
        </div>

        {/* Footer */}
        <EnqueteFooter
          step={step}
          setStep={setStep}
          setDirection={setDirection}
          isStepValid={isStepValid}
          isFormValid={isFormValid()}
          isSubmitting={isSubmitting}
          readOnly={readOnly}
          onSubmit={handleSubmit}
          onClose={onClose}
        />
      </div>

      {/* Hidden print template */}
      {readOnly && initialData && (
        <EnqueteReportTemplate
          ref={printRef}
          enquete={{
            id: initialData.id || '',
            statut: initialData.statut || '',
            assignedAt: initialData.assignedAt,
            startedAt: initialData.startedAt,
            submittedAt: initialData.submittedAt,
            reviewedAt: initialData.reviewedAt,
            createdByName: initialData.createdByName,
            situationMatrimoniale: formData.situationMatrimoniale,
            personnesCharge: formData.personnesCharge,
            typeHabitation: formData.typeHabitation,
            categorieActivite: formData.categorie_activite,
            typeActivite: formData.type_activite,
            ancienneteActivite: formData.anciennete_activite,
            evaluationActivite: initialData.evaluationActivite,
            revenuMensuel: formData.revenu_mensuel_declare,
            revenuJournalier: formData.revenu_journalier,
            chargesMensuelles: formData.charges_mensuelles,
            autresCredits: formData.autres_credits,
            capaciteRemboursement: initialData.capaciteRemboursement,
            garantiesProposees: formData.garanties_proposees,
            documentsJustificatifs: formData.documents_justificatifs,
            geoLatitude: formData.geoLatitude,
            geoLongitude: formData.geoLongitude,
            agentRecommendation: formData.agentRecommendation,
            recommendedAmount: formData.recommendedAmount,
            riskLevel: formData.riskLevel,
            riskFactors: formData.riskFactors,
            observations: formData.observations,
            supervisorNotes: initialData.supervisorNotes,
          }}
          client={{
            nom: initialData.clientNom || clientNom || '',
            prenom: initialData.clientPrenom,
            telephone: initialData.clientTelephone,
            email: initialData.clientEmail,
          }}
          demande={{
            numeroDemande: initialData.numeroDemande || '',
            montantDemande: Number(formData.montant_demande) || 0,
            objetCredit: formData.description_activite,
            dureeValeur: initialData.dureeValeur,
            dureeUnite: initialData.dureeUnite,
            tauxInteret: initialData.tauxInteret,
            frequenceRemboursement: initialData.frequenceRemboursement,
          }}
          creditPlan={creditPlan}
        />
      )}
    </div>
  );
}
