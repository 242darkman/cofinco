import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  clientSearchApi,
  compteEpargneApi,
  creditApi,
} from '../../../../lib/api-client';
import {
  StatutCredit,
  StatutParticipationTontine,
  TypeOperationCaisse,
  TypeOperationTerrain,
  isActiveStatus,
} from '@shared/enum/status-constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientTontineInfo {
  id: string;
  tontineId: string;
  clientId: string;
  statut: string;
  totalCotisations: string;
  tontine: {
    id: string;
    nom: string;
    montantCotisation: string;
    frequence: string;
    statut: string;
  };
}

export interface ClientCreditInfo {
  id: string;
  numeroCredit: string;
  montant?: string | number;
  solde_restant?: string | number;
  soldeRestant?: string | number;
  statut?: string;
  [key: string]: unknown;
}

export interface ClientAccountInfo {
  id: string;
  typeCompte?: string;
  soldeCourant?: string | number;
  numeroCompte?: string;
  statut?: string;
  [key: string]: unknown;
}

type AccountType = 'SAVINGS' | 'CURRENT' | 'BLOCKED';

export interface AvailableOperation {
  value: string;
  label: string;
  group: 'tontines' | 'credits' | 'comptes' | 'divers';
  isEntree: boolean;
}

export interface UseClientOperationsResult {
  // Client data
  clientCredits: ClientCreditInfo[];
  clientTontines: ClientTontineInfo[];
  clientAccounts: ClientAccountInfo[];
  activeTontinesCount: number;
  loading: boolean;

  // Availability checks
  hasCredits: boolean;
  hasCreditsForDisbursement: boolean;
  hasTontines: boolean;
  hasAccountType: (type: AccountType) => boolean;

  // Filtered operations (for CaissePaiementModal dropdown)
  availableCaisseOperations: AvailableOperation[];

  // Filtered terrain operations (for CollectCashModal)
  availableTerrainOperations: Array<{ value: string; label: string }>;
}

// ---------------------------------------------------------------------------
// Labels for terrain operations (matches CollectCashModal)
// ---------------------------------------------------------------------------

const TERRAIN_ALL_OPTIONS: Array<{ value: string; label: string; requires?: 'credits' | 'tontines' | AccountType }> = [
  { value: TypeOperationTerrain.LOAN_REPAYMENT, label: 'Remboursement Crédit', requires: 'credits' },
  { value: TypeOperationTerrain.SAVINGS_DEPOSIT, label: 'Dépôt Épargne', requires: 'SAVINGS' },
  { value: TypeOperationTerrain.DEPOSIT_CURRENT, label: 'Dépôt Compte Courant', requires: 'CURRENT' },
  { value: TypeOperationTerrain.WITHDRAWAL_SAVINGS, label: 'Retrait Compte Épargne', requires: 'SAVINGS' },
  { value: TypeOperationTerrain.WITHDRAWAL_CURRENT, label: 'Retrait Compte Courant', requires: 'CURRENT' },
  { value: TypeOperationTerrain.TONTINE_CONTRIBUTION, label: 'Cotisation Tontine', requires: 'tontines' },
  { value: TypeOperationTerrain.ENGAGEMENT_FEE, label: 'Frais Engagement Crédit' },
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useClientOperations(clientId: string | undefined | null): UseClientOperationsResult {
  const [clientCredits, setClientCredits] = useState<ClientCreditInfo[]>([]);
  const [clientTontines, setClientTontines] = useState<ClientTontineInfo[]>([]);
  const [clientAccounts, setClientAccounts] = useState<ClientAccountInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch all client data when clientId changes
  useEffect(() => {
    if (!clientId) {
      setClientCredits([]);
      setClientTontines([]);
      setClientAccounts([]);
      return;
    }

    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [credits, tontines, comptes] = await Promise.all([
          clientSearchApi.getCredits(clientId, { statut: 'Accordé' }).catch(() => []),
          clientSearchApi.getTontines(clientId).catch(() => []),
          compteEpargneApi.getByClient(clientId).catch(() => []),
        ]);
        if (cancelled) return;
        setClientCredits(credits || []);
        setClientTontines(tontines || []);
        setClientAccounts(comptes || []);
      } catch {
        if (!cancelled) {
          setClientCredits([]);
          setClientTontines([]);
          setClientAccounts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [clientId]);

  // Derived: active tontines
  const activeTontines = useMemo(
    () => clientTontines.filter(
      t => t.statut === StatutParticipationTontine.ACTIVE || isActiveStatus(t.statut)
    ),
    [clientTontines]
  );

  // Derived: active credits (for repayment)
  const activeCredits = useMemo(
    () => clientCredits.filter(
      c => c.statut === StatutCredit.ACTIVE || c.statut === StatutCredit.LATE
    ),
    [clientCredits]
  );

  // Derived: credits awaiting disbursement
  const creditsForDisbursement = useMemo(
    () => clientCredits.filter(
      c => c.statut === StatutCredit.WAITING_DISBURSEMENT
    ),
    [clientCredits]
  );

  const hasCredits = activeCredits.length > 0;
  const hasCreditsForDisbursement = creditsForDisbursement.length > 0;
  const hasTontines = activeTontines.length > 0;

  const hasAccountType = useCallback(
    (type: AccountType) => clientAccounts.some(a => a.typeCompte === type),
    [clientAccounts]
  );

  // Available caisse operations (for CaissePaiementModal)
  const availableCaisseOperations = useMemo<AvailableOperation[]>(() => {
    if (!clientId) return [];
    const ops: AvailableOperation[] = [];

    // Tontines
    if (hasTontines) {
      ops.push({ value: TypeOperationCaisse.TONTINE_CONTRIBUTION, label: 'Cotisation Tontine', group: 'tontines', isEntree: true });
      ops.push({ value: TypeOperationCaisse.TONTINE_WITHDRAWAL, label: 'Retrait Tontine', group: 'tontines', isEntree: false });
    }

    // Credits
    if (hasCredits) {
      ops.push({ value: TypeOperationCaisse.LOAN_REPAYMENT, label: 'Remboursement Prêt', group: 'credits', isEntree: true });
    }
    if (hasCreditsForDisbursement) {
      ops.push({ value: TypeOperationCaisse.CREDIT_DISBURSEMENT, label: 'Décaissement Prêt', group: 'credits', isEntree: false });
    }

    // Comptes
    if (hasAccountType('SAVINGS')) {
      ops.push({ value: TypeOperationCaisse.DEPOSIT_SAVINGS, label: 'Versement Épargne', group: 'comptes', isEntree: true });
      ops.push({ value: TypeOperationCaisse.WITHDRAWAL_SAVINGS, label: 'Retrait Épargne', group: 'comptes', isEntree: false });
    }
    if (hasAccountType('CURRENT')) {
      ops.push({ value: TypeOperationCaisse.DEPOSIT_CURRENT, label: 'Versement Courant', group: 'comptes', isEntree: true });
      ops.push({ value: TypeOperationCaisse.WITHDRAWAL_CURRENT, label: 'Retrait Courant', group: 'comptes', isEntree: false });
    }
    if (hasAccountType('BLOCKED')) {
      ops.push({ value: TypeOperationCaisse.DEPOSIT_BLOCKED, label: 'Versement Compte Bloqué', group: 'comptes', isEntree: true });
      ops.push({ value: TypeOperationCaisse.WITHDRAWAL_BLOCKED, label: 'Retrait Compte Bloqué', group: 'comptes', isEntree: false });
    }

    // Divers — always available
    ops.push({ value: TypeOperationCaisse.MISC_COLLECTION, label: 'Encaissement Divers', group: 'divers', isEntree: true });
    ops.push({ value: TypeOperationCaisse.MISC_DISBURSEMENT, label: 'Décaissement Divers', group: 'divers', isEntree: false });

    return ops;
  }, [clientId, hasTontines, hasCredits, hasCreditsForDisbursement, hasAccountType]);

  // Available terrain operations (for CollectCashModal)
  const availableTerrainOperations = useMemo(() => {
    if (!clientId) return [];
    return TERRAIN_ALL_OPTIONS.filter(opt => {
      if (!opt.requires) return true;
      if (opt.requires === 'credits') return hasCredits;
      if (opt.requires === 'tontines') return hasTontines;
      return hasAccountType(opt.requires);
    }).map(({ value, label }) => ({ value, label }));
  }, [clientId, hasCredits, hasTontines, hasAccountType]);

  return {
    clientCredits: activeCredits,
    clientTontines: activeTontines,
    clientAccounts,
    activeTontinesCount: activeTontines.length,
    loading,
    hasCredits,
    hasCreditsForDisbursement,
    hasTontines,
    hasAccountType,
    availableCaisseOperations,
    availableTerrainOperations,
  };
}
