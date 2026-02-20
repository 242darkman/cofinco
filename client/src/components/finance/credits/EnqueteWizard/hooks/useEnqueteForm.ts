import { useState, useEffect, useCallback, useRef } from 'react';
import type { EnqueteFormData, CreditPlanInfo, ClientSituation } from '../types';
import { DEFAULT_ENQUETE_FORM, ENQUETE_AUTO_SAVE_KEY } from '../constants';

interface UseEnqueteFormOptions {
  initialData?: any;
  clientId?: string;
  readOnly?: boolean;
}

function buildInitialForm(opts: UseEnqueteFormOptions): EnqueteFormData {
  const d = opts.initialData;
  if (!d) return { ...DEFAULT_ENQUETE_FORM, client_id: opts.clientId || '' };

  // Revenue pre-fill logic
  const getRevenuMensuel = () => {
    if (d.revenus_mensuels || d.revenuMensuel) return (d.revenus_mensuels || d.revenuMensuel).toString();
    if (d.revenu_mensuel) return d.revenu_mensuel.toString();
    if (d.revenu_journalier || d.revenuJournalier) {
      const j = parseFloat(d.revenu_journalier || d.revenuJournalier);
      return (j * 26).toString();
    }
    if (d.client?.revenuMensuel) return d.client.revenuMensuel.toString();
    if (d.client?.revenuJournalier) return (parseFloat(d.client.revenuJournalier) * 26).toString();
    return '';
  };

  const getTypeRevenu = () => {
    if (d.typeRevenu || d.type_revenu) return d.typeRevenu || d.type_revenu;
    if (d.client?.typeRevenu) return d.client.typeRevenu === 'DAILY' ? 'Journalier' : 'Mensuel';
    return 'Mensuel';
  };

  return {
    demandeId: d.demandeId || d.id || '',
    client_id: opts.clientId || d.clientId || d.client_id || '',

    // Step 1 — pre-fill from clientSituation or enquete's own data
    situationMatrimoniale: d.situationMatrimoniale || d.clientSituation?.situationMatrimoniale || '',
    personnesCharge: (d.personnesCharge ?? d.clientSituation?.nombrePersonnesCharge ?? '').toString(),
    typeHabitation: d.typeHabitation || d.clientSituation?.statutLogement || '',

    // Step 2
    geoLatitude: d.geoLatitude ? parseFloat(d.geoLatitude) : null,
    geoLongitude: d.geoLongitude ? parseFloat(d.geoLongitude) : null,
    geoAccuracy: d.geoAccuracy ? parseFloat(d.geoAccuracy) : null,
    geoTimestamp: d.geoTimestamp ? new Date(d.geoTimestamp) : null,
    photos_activite: d.photosActivite || d.photos_activite || [],
    photos_geotagged: d.photosGeotagged || d.photos_geotagged || [],

    // Step 3
    montant_demande: (d.montantDemande || d.montant_demande || '').toString(),
    categorie_activite: d.categorieActivite || d.categorie_activite || '',
    type_activite: d.typeActivite || d.type_activite || d.client?.typeActivite || '',
    anciennete_activite: (d.ancienneteActivite || d.anciennete_activite || '').toString(),
    description_activite: d.objetCredit || d.objet_credit || d.descriptionActivite || d.description_activite || d.client?.profession || '',
    type_revenu: getTypeRevenu(),
    revenu_journalier: (d.revenuJournalier || d.revenu_journalier || d.client?.revenuJournalier || '').toString(),
    revenu_mensuel_declare: getRevenuMensuel(),
    jours_travail_mois: (d.joursTravailMois || d.jours_travail_mois || '26').toString(),
    charges_mensuelles: (d.chargesMensuelles || d.charges_mensuelles || '').toString(),
    autres_credits: d.autresCredits || d.autres_credits || [],

    // Step 4
    garanties_proposees: d.garantiesProposees || d.garanties_proposees || [],
    documents_justificatifs: d.documentsJustificatifs || d.documents_justificatifs || [],

    // Step 5
    agentRecommendation: d.agentRecommendation || '',
    recommendedAmount: (d.recommendedAmount || d.montantDemande || d.montant_demande || '').toString(),
    riskLevel: d.riskLevel || '',
    riskFactors: d.riskFactors || [],
    observations: d.observations || '',
  };
}

export function useEnqueteForm(opts: UseEnqueteFormOptions) {
  const [formData, setFormData] = useState<EnqueteFormData>(() => buildInitialForm(opts));
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const updateField = useCallback(<K extends keyof EnqueteFormData>(key: K, value: EnqueteFormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  // Auto-save to sessionStorage (debounced 500ms)
  useEffect(() => {
    if (opts.readOnly) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(ENQUETE_AUTO_SAVE_KEY, JSON.stringify(formData));
      } catch { /* quota exceeded */ }
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [formData, opts.readOnly]);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(ENQUETE_AUTO_SAVE_KEY);
  }, []);

  // Extract creditPlan from initialData
  const creditPlan: CreditPlanInfo | null = opts.initialData?.creditPlan || null;
  const clientSituation: ClientSituation | null = opts.initialData?.clientSituation || null;

  return { formData, setFormData, updateField, clearDraft, creditPlan, clientSituation };
}
