import { useState, useEffect, useCallback } from 'react';
import { 
  compteEpargneApi, 
  tontineApi, 
  echeanceCreditApi
} from '../../../../lib/api-client';
import { TypeCompte } from '@shared/enum/status-constants';

export type InfoCardKind = 'balance' | 'tontine_due' | 'loan_due' | 'withdrawable' | 'disbursement' | 'tontine_payout' | 'none';

export interface InfoCardData {
  kind: InfoCardKind;
  title: string;
  amount: number | null;
  subtitle?: string;
  loading?: boolean;
  isValid?: boolean;
}

interface UseOperationInfoProps {
  clientId?: string;
  typeOperation: 'Dépôt' | 'Retrait' | null;
  subType: string | null;
  selectedClient: any;
  tontinesActives?: any[];
  creditsActifs?: any[];
  comptesClient?: any[];
}

export function useOperationInfo({
  clientId,
  typeOperation,
  subType,
  selectedClient,
  tontinesActives = [],
  creditsActifs = [],
  comptesClient = []
}: UseOperationInfoProps) {
  // State now tracks WHICH subType the suggestion belongs to
  const [suggestionState, setSuggestionState] = useState<{
    key: string;
    value: string | null
  }>({ key: '', value: null });

  const [infoCardData, setInfoCardData] = useState<InfoCardData | null>(null);
  const [loading, setLoading] = useState(false);

  // Determine current key for validation
  const currentKey = `${typeOperation}-${subType}`;

  // Determine configuration based on operation type
  const getConfig = useCallback(() => {
    if (!typeOperation || !subType) return null;

    if (typeOperation === 'Dépôt') {
      if (subType.includes('Courant')) return { kind: 'balance', title: 'Solde actuel' };
      if (subType.includes('Épargne') || subType.includes('Epargne')) return { kind: 'balance', title: 'Solde épargne' };
      if (subType.includes('Bloqué') || subType.includes('Bloque')) return { kind: 'balance', title: 'Solde bloqué' };
      if (subType.includes('Tontine')) return { kind: 'tontine_due', title: 'Cotisation à payer' };
      if (subType.includes('Remboursement') || subType.includes('Crédit')) return { kind: 'loan_due', title: 'Prochain paiement' };
    } else {
      if (subType.includes('Courant')) return { kind: 'withdrawable', title: 'Disponible retrait' };
      if (subType.includes('Épargne') || subType.includes('Epargne')) return { kind: 'withdrawable', title: 'Disponible retrait' };
      if (subType.includes('Décaissement')) return { kind: 'disbursement', title: 'À décaisser' };
      if (subType.includes('Distribution')) return { kind: 'tontine_payout', title: 'À récupérer' };
    }

    return { kind: 'balance', title: 'Information' };
  }, [typeOperation, subType]);

  const fetchInfo = useCallback(async () => {
    if (!clientId || !typeOperation || !subType || !selectedClient) {
      setInfoCardData(null);
      setSuggestionState({ key: currentKey, value: null });
      return;
    }

    const config = getConfig();
    if (!config) return;

    setLoading(true);
    // Note: We don't reset infoCardData immediately here to avoid flashing empty state if we want to keep previous?
    // Actually better to show loading state or keep previous stale data until new one arrives?
    // For suggestion, we MUST reset or invalidate it. The `currentKey` check in return does that.

    // Set loading card
    setInfoCardData({
      kind: config.kind as InfoCardKind,
      title: config.title,
      amount: null,
      loading: true
    });

    try {
      let amount: number | null = null;
      let subtitle: string | undefined;
      let suggestion: string | null = null;

      switch (config.kind) {
        case 'balance':
        case 'withdrawable': {
            let targetType: string = TypeCompte.CURRENT;
            if (subType.includes('Épargne') || subType.includes('Epargne')) targetType = TypeCompte.SAVINGS;
            else if (subType.includes('Bloqué') || subType.includes('Bloque')) targetType = TypeCompte.BLOCKED;

            const compte = comptesClient.find((c: any) => c.typeCompte === targetType);

            if (compte) {
                amount = parseFloat(compte.soldeCourant || '0');
                if (config.kind === 'balance') {
                     subtitle = `Compte ${compte.numeroCompte || ''}`;
                } else {
                     // For withdrawals, maybe check withdrawal limits?
                     subtitle = `Max: ${amount}`;
                     // Suggest max withdrawable? No, that's dangerous.
                }
            } else {
                subtitle = 'Aucun compte trouvé';
            }
            break;
        }

        case 'tontine_due': {
            // Logic for tontine contribution
            // Ideally we should know WHICH tontine if there are multiple.
            // For now, we take the first active one or aggregate?
            // The prompt says "if we select tontine deposit... we must see the contribution he hasn't made yet"

            if (tontinesActives.length > 0) {
                // If specific tontine selection logic exists in parent, it might be better to pass selectedTontine.
                // But simplified: take the first one for now as per previous code logic
                const tontine = tontinesActives[0];
                amount = parseFloat(tontine.montantCotisation || '0');
                subtitle = tontine.nom || 'Tontine';
                suggestion = amount.toString();
            } else {
                subtitle = 'Aucune tontine active';
            }
            break;
        }

        case 'loan_due': {
            // Logic for loan repayment
            // Check for next installment
            // creditsActifs is passed. We might need to fetch the schedule for the first active credit.
            if (creditsActifs.length > 0) {
                const credit = creditsActifs[0];
                try {
                    const echeance = await echeanceCreditApi.getProchaine(credit.id);
                    if (echeance) {
                        amount = parseFloat(echeance.montantTotal || '0');
                        suggestion = amount.toString();
                        subtitle = `Échéance du ${new Date(echeance.dateEcheance).toLocaleDateString('fr-FR')}`;
                    } else {
                        subtitle = 'Aucune échéance due';
                    }
                } catch (e) {
                    console.error("Error fetching loan schedule", e);
                    subtitle = "Erreur chargement échéance";
                }
            } else {
                subtitle = 'Aucun crédit actif';
            }
            break;
        }

        case 'disbursement': {
             // Logic for credit disbursement
             // We need to find PENDING disbursements.
             // Relying on `credits` endpoint or specific pending-disbursements endpoint used in previous code
             // The user mentioned using robust existing endpoints.
             // If `salesApi` or `creditApi` has something for this?
             // Checking the previous file, it used `fetch('/api/credits/pending-disbursements')`.
             // I'll try to stick to that but wraps it safely, or if `creditApi` has it.
             try {
                const response = await fetch('/api/credits/pending-disbursements', { credentials: 'include' });
                if (response.ok) {
                    const data = await response.json();
                    const pending = data?.data?.find((d: any) =>
                        (d.clientId === clientId) ||
                        (d.client?.id === clientId)
                    );

                    if (pending) {
                         amount = parseFloat(pending.montant || '0');
                         suggestion = amount.toString();
                         subtitle = `Crédit #${pending.numeroCredit || '?'}`;
                    } else {
                        subtitle = 'Aucun décaissement en attente';
                    }
                }
             } catch (e) {
                 console.error("Error fetching pending disbursements", e);
             }
             break;
        }

        case 'tontine_payout': {
             // Logic for tontine distribution (retrait)
             // Need to check APPROVED distribution requests
             for (const tontine of tontinesActives) {
                try {
                  const requests = await tontineApi.getDistributionRequests(tontine.id, { status: 'APPROVED' });
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const reqAny = requests as any;
                  const forClient = reqAny.data ? reqAny.data.find((r: any) =>
                    r.beneficiaryClientId === clientId ||
                    r.beneficiary_client_id === clientId
                  ) : (Array.isArray(requests) ? requests.find((r: any) =>
                    r.beneficiaryClientId === clientId ||
                    r.beneficiary_client_id === clientId
                  ) : null);

                  if (forClient) {
                    amount = parseFloat(forClient.amountApproved || forClient.amount_approved || forClient.amount || '0');
                    subtitle = tontine.nom;
                    suggestion = amount.toString();
                    break;
                  }
                } catch (err) {
                  console.error('Erreur chargement distributions:', err);
                }
             }
             if (amount === null) {
                subtitle = 'Aucune distribution à récupérer';
             }
             break;
        }
      }

      setInfoCardData({
        kind: config.kind as InfoCardKind,
        title: config.title,
        amount,
        subtitle,
        loading: false
      });

      setSuggestionState({ key: currentKey, value: suggestion });

    } catch (error) {
      console.error('Error in useOperationInfo:', error);
      setInfoCardData({
        kind: config.kind as InfoCardKind,
        title: config.title,
        amount: null,
        subtitle: 'Erreur',
        loading: false
      });
    } finally {
        setLoading(false);
    }

  }, [clientId, typeOperation, subType, selectedClient, tontinesActives, creditsActifs, comptesClient, getConfig, currentKey]);

  // Trigger fetch when dependencies change
  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  // Derived state: only return suggestion if keys match
  const suggestedAmount = suggestionState.key === currentKey ? suggestionState.value : null;

  return { infoCardData, suggestedAmount, loading };
}
