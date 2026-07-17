/**
 * Hook du formulaire de création d'évacuation de coffre : état, données
 * dérivées, validation et soumission (création + envoi optionnel).
 */

import { useState, useMemo } from 'react';
import { StatutCoffre, TypeDestinationEvacuation, MotifEvacuation } from '@shared/enum/status-constants';
import { toast } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';

export interface CoffreFort {
  id: string;
  code: string;
  nom: string;
  ownerType: 'AGENCE' | 'SIEGE';
  solde: string;
  statut: string;
  agenceNom?: string;
}

export function useCreateEvacuation(coffres: CoffreFort[], onSuccess: (evacuation: any) => void) {
  // État du formulaire
  const [coffreSourceId, setCoffreSourceId] = useState('');
  const [typeDestination, setTypeDestination] = useState<string>(TypeDestinationEvacuation.BANQUE);
  const [montant, setMontant] = useState('');
  const [motifEvacuation, setMotifEvacuation] = useState<string>(MotifEvacuation.EXCEDENT_ENCAISSE);
  const [motifDetail, setMotifDetail] = useState('');

  // Champs spécifiques à la destination
  const [banqueNom, setBanqueNom] = useState('');
  const [banqueCompte, setBanqueCompte] = useState('');
  const [banqueNumeroComptable, setBanqueNumeroComptable] = useState('512');
  const [coffreDestinationId, setCoffreDestinationId] = useState('');
  const [transporteurNom, setTransporteurNom] = useState('');
  const [transporteurContact, setTransporteurContact] = useState('');
  const [transporteurReference, setTransporteurReference] = useState('');

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitAndSend, setSubmitAndSend] = useState(false);

  // Coffres actifs
  const activeCoffres = useMemo(() => {
    return coffres.filter(c => c.statut === StatutCoffre.ACTIVE);
  }, [coffres]);

  // Coffres destination (source exclue)
  const destinationCoffres = useMemo(() => {
    return activeCoffres.filter(c => c.id !== coffreSourceId);
  }, [activeCoffres, coffreSourceId]);

  const coffreSource = useMemo(() => {
    return activeCoffres.find(c => c.id === coffreSourceId);
  }, [activeCoffres, coffreSourceId]);

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!coffreSourceId) newErrors.coffreSourceId = 'Sélectionnez le coffre source';
    if (!montant || Number(montant) <= 0) newErrors.montant = 'Montant invalide';
    if (coffreSource && Number(montant) > Number(coffreSource.solde)) {
      newErrors.montant = `Montant supérieur au solde (${formatMoney(coffreSource.solde)})`;
    }
    if (motifDetail.trim().length < 10) newErrors.motifDetail = 'Détail trop court (min 10 caractères)';

    // Validation de la destination
    if (typeDestination === TypeDestinationEvacuation.BANQUE) {
      if (!banqueNom.trim()) newErrors.banqueNom = 'Nom de la banque requis';
      if (!banqueCompte.trim()) newErrors.banqueCompte = 'Numéro de compte requis';
    } else if (typeDestination === TypeDestinationEvacuation.COFFRE_CENTRAL) {
      if (!coffreDestinationId) newErrors.coffreDestinationId = 'Sélectionnez le coffre destination';
    } else if (typeDestination === TypeDestinationEvacuation.TRANSPORTEUR) {
      if (!transporteurNom.trim()) newErrors.transporteurNom = 'Nom du transporteur requis';
      if (!transporteurContact.trim()) newErrors.transporteurContact = 'Contact requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      const data: any = {
        coffreSourceId,
        typeDestination,
        montant: Number(montant),
        motifEvacuation,
        motifDetail: motifDetail.trim(),
      };

      if (typeDestination === TypeDestinationEvacuation.BANQUE) {
        data.banqueNom = banqueNom.trim();
        data.banqueCompte = banqueCompte.trim();
        data.banqueNumeroComptable = banqueNumeroComptable.trim() || undefined;
      } else if (typeDestination === TypeDestinationEvacuation.COFFRE_CENTRAL) {
        data.coffreDestinationId = coffreDestinationId;
      } else if (typeDestination === TypeDestinationEvacuation.TRANSPORTEUR) {
        data.transporteurNom = transporteurNom.trim();
        data.transporteurContact = transporteurContact.trim();
        data.transporteurReference = transporteurReference.trim() || undefined;
      }

      const res = await fetch('/api/evacuations-coffre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (result.success) {
        // Soumission automatique si demandée
        if (submitAndSend && result.data?.id) {
          const submitRes = await fetch(`/api/evacuations-coffre/${result.data.id}/submit`, {
            method: 'POST',
            credentials: 'include',
          });
          const submitResult = await submitRes.json();
          if (!submitResult.success) {
            toast.warning('Créée mais échec soumission: ' + (submitResult.error || ''));
          }
        }
        onSuccess(result.data);
      } else {
        toast.error(result.error || 'Erreur lors de la création');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  return {
    coffreSourceId, setCoffreSourceId,
    typeDestination, setTypeDestination,
    montant, setMontant,
    motifEvacuation, setMotifEvacuation,
    motifDetail, setMotifDetail,
    banqueNom, setBanqueNom,
    banqueCompte, setBanqueCompte,
    banqueNumeroComptable, setBanqueNumeroComptable,
    coffreDestinationId, setCoffreDestinationId,
    transporteurNom, setTransporteurNom,
    transporteurContact, setTransporteurContact,
    transporteurReference, setTransporteurReference,
    loading,
    errors,
    submitAndSend, setSubmitAndSend,
    activeCoffres,
    destinationCoffres,
    coffreSource,
    handleSubmit,
  };
}

export type CreateEvacuationController = ReturnType<typeof useCreateEvacuation>;
