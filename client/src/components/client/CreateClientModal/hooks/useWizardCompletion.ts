import { useMemo } from 'react';
import { FIELD_WEIGHTS, STEPS } from '../constants';
import type { CreateClientFormData, FileState } from '../types';

function isFieldFilled(formData: CreateClientFormData, files: FileState, key: string): boolean {
  // File fields
  if (key === 'file_idFront') return !!files.idFront;
  if (key === 'file_photo') return !!files.photo;
  if (key === 'file_proofOfAddress') return !!files.proofOfAddress;

  // References
  if (key === 'referencesPersonnes') return formData.referencesPersonnes.length > 0;

  // Boolean fields
  if (key === 'consentementDonnees') return formData.consentementDonnees;
  if (key === 'isPep') return true; // always "filled" (default false is valid)

  // String fields
  const val = (formData as any)[key];
  if (val === undefined || val === null) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  return !!val;
}

/**
 * Which step does a field belong to? (for per-step completion)
 */
const FIELD_STEP: Record<string, number> = {
  nom: 1, prenom: 1, sexe: 1, dateNaissance: 1, lieuNaissance: 1, nationaliteId: 1, paysNaissanceId: 1, file_photo: 1,
  telephoneRaw: 2, email: 2, adresseDomicile: 2, villeId: 2, paysResidenceId: 2, statutLogement: 2,
  situationMatrimoniale: 3, nombrePersonnesCharge: 3, niveauEducation: 3, typeClient: 3,
  professionId: 3, employeur: 3, activityTypeId: 3, dateDebutActivite: 3,
  sourceFonds: 4, revenuMensuel: 4, sectorId: 4, agentReferentId: 4,
  referencesPersonnes: 5, isPep: 5, pepDetails: 5, consentementDonnees: 5,
  typePiece: 6, numeroPiece: 6, dateExpirationPiece: 6, paysEmissionId: 6, file_idFront: 6, file_proofOfAddress: 6,
};

export function useWizardCompletion(formData: CreateClientFormData, files: FileState) {
  return useMemo(() => {
    let totalWeight = 0;
    let filledWeight = 0;
    const stepFilled: Record<number, number> = {};
    const stepTotal: Record<number, number> = {};

    for (const [key, weight] of Object.entries(FIELD_WEIGHTS)) {
      if (weight <= 0) continue;
      totalWeight += weight;
      const stepNum = FIELD_STEP[key] || 0;

      if (!stepTotal[stepNum]) stepTotal[stepNum] = 0;
      if (!stepFilled[stepNum]) stepFilled[stepNum] = 0;
      stepTotal[stepNum] += weight;

      if (isFieldFilled(formData, files, key)) {
        filledWeight += weight;
        stepFilled[stepNum] += weight;
      }
    }

    const percent = totalWeight > 0 ? Math.round((filledWeight / totalWeight) * 100) : 0;

    // Per-step completion (for step indicators)
    const stepCompletion: Record<number, number> = {};
    for (const step of STEPS) {
      const total = stepTotal[step.num] || 1;
      const filled = stepFilled[step.num] || 0;
      stepCompletion[step.num] = Math.round((filled / total) * 100);
    }

    return { percent, stepCompletion };
  }, [formData, files]);
}
