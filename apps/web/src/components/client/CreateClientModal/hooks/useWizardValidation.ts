import { useState, useMemo, useCallback } from 'react';
import { STEPS } from '../constants';
import type { CreateClientFormData, FileState } from '../types';

export function useWizardValidation(
  formData: CreateClientFormData,
  files: FileState,
  isAdmin: boolean,
  isConversion: boolean,
) {
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  const markTouched = useCallback((field: string) => {
    setTouchedFields(prev => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  }, []);

  const errors = useMemo(() => {
    const errs: Record<string, string> = {};

    // Nom
    if (touchedFields.has('nom') && formData.nom.trim().length < 2)
      errs.nom = 'Le nom est requis (min 2 caractères)';

    // Prénom
    if (touchedFields.has('prenom') && formData.prenom.trim().length < 2)
      errs.prenom = 'Le prénom est requis (min 2 caractères)';

    // Téléphone
    if (touchedFields.has('telephoneRaw') && formData.telephoneRaw.trim().length < 6)
      errs.telephoneRaw = 'Numéro de téléphone invalide';

    // Email (optionnel mais doit être valide si renseigné)
    if (touchedFields.has('email') && formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      errs.email = 'Adresse email invalide';

    // Agence (admin)
    if (isAdmin && touchedFields.has('agenceId') && !formData.agenceId)
      errs.agenceId = "L'agence est requise";

    // Nombre personnes à charge (positif)
    if (touchedFields.has('nombrePersonnesCharge') && formData.nombrePersonnesCharge) {
      const n = parseInt(formData.nombrePersonnesCharge, 10);
      if (isNaN(n) || n < 0) errs.nombrePersonnesCharge = 'Nombre invalide';
    }

    // Revenu (positif)
    const revenuKey = formData.typeRevenu === 'Mensuel' ? 'revenuMensuel' : 'revenuJournalier';
    const revenuVal = formData[revenuKey];
    if (touchedFields.has(revenuKey) && revenuVal) {
      const n = parseFloat(revenuVal);
      if (isNaN(n) || n < 0) errs[revenuKey] = 'Montant invalide';
    }

    // Employeur conditionnel : validation simplifiée pour le catalogue
    if (touchedFields.has('employeur') && formData.professionId) {
      if (!formData.employeur.trim()) {
        errs.employeur = "L'employeur est requis si une profession est renseignée";
      }
    }

    // Références validation
    formData.referencesPersonnes.forEach((ref, i) => {
      if (ref.nom && ref.nom.trim().length < 2)
        errs[`ref_${i}_nom`] = 'Nom requis (min 2 caractères)';
      if (ref.telephone && ref.telephone.trim().length < 8)
        errs[`ref_${i}_telephone`] = 'Téléphone invalide (min 8 chiffres)';
    });

    return errs;
  }, [formData, touchedFields, isAdmin]);

  const isStepValid = useCallback((stepNum: number): boolean => {
    const step = STEPS.find(s => s.num === stepNum);
    if (!step) return true;

    // Check requiredFields from constants
    for (const field of step.requiredFields) {
      const val = (formData as any)[field];
      if (!val || (typeof val === 'string' && val.trim().length === 0)) return false;
    }

    // Règles supplémentaires par étape
    switch (stepNum) {
      case 1:
        if (!isConversion) {
          return formData.nom.trim().length >= 2 && formData.prenom.trim().length >= 2;
        }
        return true;
      case 2:
        return formData.telephoneRaw.trim().length >= 6;
      case 3: {
        // Employeur conditionnel : validation simplifiée pour le catalogue
        // La logique spécifique auto-entrepreneur est gérée dans le composant d'étape
        return true;
      }
      case 4: {
        // Revenu obligatoire (mensuel ou journalier selon le type)
        const revenuKey = formData.typeRevenu === 'Mensuel' ? 'revenuMensuel' : 'revenuJournalier';
        if (!formData[revenuKey] || formData[revenuKey].trim().length === 0) return false;
        if (isAdmin && !formData.agenceId.trim()) return false;
        return true;
      }
      case 6: {
        // Date d'expiration obligatoire sauf pour le permis de conduire
        const noExpirationRequired = formData.typePiece === 'PERMIS_CONDUIRE';
        if (!noExpirationRequired && !formData.dateExpirationPiece) return false;
        if (isConversion) return true;
        if (!files.idFront) return false;
        if (formData.typePiece === 'CNI' && !files.idBack) return false;
        return true;
      }
      default:
        return true;
    }
  }, [formData, files, isAdmin, isConversion]);

  const isFormValid = useMemo(() => {
    return isStepValid(1) && isStepValid(2) && isStepValid(3) && isStepValid(4) && isStepValid(5) && isStepValid(6);
  }, [isStepValid]);

  return { errors, touchedFields, markTouched, isStepValid, isFormValid };
}
