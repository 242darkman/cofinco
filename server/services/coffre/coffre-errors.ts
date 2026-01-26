/**
 * Erreurs structurées pour les opérations Coffre-fort & Caisse
 * Chaque erreur a un code, httpStatus et data pour un traitement uniforme.
 */

export class CoffreInactifError extends Error {
  public readonly code = "COFFRE_INACTIF" as const;
  public readonly httpStatus = 409;
  public readonly data: {
    code: "COFFRE_INACTIF";
    coffreId: string;
    statut: string;
  };

  constructor(coffreId: string, statut: string) {
    super(`Le coffre-fort est inactif (statut: ${statut})`);
    this.name = "CoffreInactifError";
    this.data = { code: "COFFRE_INACTIF", coffreId, statut };
  }
}

export class CoffreInsufficientFundsError extends Error {
  public readonly code = "COFFRE_INSUFFICIENT_FUNDS" as const;
  public readonly httpStatus = 409;
  public readonly data: {
    code: "COFFRE_INSUFFICIENT_FUNDS";
    coffreId: string;
    available: number;
    requested: number;
    deficit: number;
  };

  constructor(coffreId: string, available: number, requested: number) {
    const deficit = requested - available;
    super(`Solde du coffre insuffisant (disponible: ${available}, requis: ${requested}, déficit: ${deficit})`);
    this.name = "CoffreInsufficientFundsError";
    this.data = { code: "COFFRE_INSUFFICIENT_FUNDS", coffreId, available, requested, deficit };
  }
}

export class CoffreSoldeMinimumError extends Error {
  public readonly code = "COFFRE_SOLDE_MINIMUM" as const;
  public readonly httpStatus = 409;
  public readonly data: {
    code: "COFFRE_SOLDE_MINIMUM";
    coffreId: string;
    soldeApresOperation: number;
    soldeMinimum: number;
  };

  constructor(coffreId: string, soldeApresOperation: number, soldeMinimum: number) {
    super(`L'opération ferait passer le solde (${soldeApresOperation}) en dessous du minimum requis (${soldeMinimum})`);
    this.name = "CoffreSoldeMinimumError";
    this.data = { code: "COFFRE_SOLDE_MINIMUM", coffreId, soldeApresOperation, soldeMinimum };
  }
}

export class CoffrePlafondJournalierError extends Error {
  public readonly code = "COFFRE_PLAFOND_JOURNALIER" as const;
  public readonly httpStatus = 409;
  public readonly data: {
    code: "COFFRE_PLAFOND_JOURNALIER";
    entityType: "coffre" | "caisse";
    entityId: string;
    direction: "DEBIT" | "CREDIT";
    dailyTotal: number;
    requested: number;
    plafond: number;
  };

  constructor(
    entityType: "coffre" | "caisse",
    entityId: string,
    direction: "DEBIT" | "CREDIT",
    dailyTotal: number,
    requested: number,
    plafond: number
  ) {
    super(
      `Plafond journalier ${direction} dépassé pour ${entityType} ` +
      `(total jour: ${dailyTotal}, demandé: ${requested}, plafond: ${plafond})`
    );
    this.name = "CoffrePlafondJournalierError";
    this.data = { code: "COFFRE_PLAFOND_JOURNALIER", entityType, entityId, direction, dailyTotal, requested, plafond };
  }
}

export class CaisseInactiveError extends Error {
  public readonly code = "CAISSE_INACTIVE" as const;
  public readonly httpStatus = 409;
  public readonly data: {
    code: "CAISSE_INACTIVE";
    caisseId: string;
    statut: string;
  };

  constructor(caisseId: string, statut: string) {
    super(`La caisse est inactive (statut: ${statut})`);
    this.name = "CaisseInactiveError";
    this.data = { code: "CAISSE_INACTIVE", caisseId, statut };
  }
}

export class CaisseInsufficientFundsError extends Error {
  public readonly code = "CAISSE_INSUFFICIENT_FUNDS" as const;
  public readonly httpStatus = 409;
  public readonly data: {
    code: "CAISSE_INSUFFICIENT_FUNDS";
    caisseId: string;
    available: number;
    requested: number;
    deficit: number;
  };

  constructor(caisseId: string, available: number, requested: number) {
    const deficit = requested - available;
    super(`Solde de la caisse insuffisant (disponible: ${available}, requis: ${requested}, déficit: ${deficit})`);
    this.name = "CaisseInsufficientFundsError";
    this.data = { code: "CAISSE_INSUFFICIENT_FUNDS", caisseId, available, requested, deficit };
  }
}

/**
 * Type union pour toutes les erreurs coffre/caisse
 */
export type CoffreCaisseError =
  | CoffreInactifError
  | CoffreInsufficientFundsError
  | CoffreSoldeMinimumError
  | CoffrePlafondJournalierError
  | CaisseInactiveError
  | CaisseInsufficientFundsError;

/**
 * Type guard pour identifier les erreurs coffre/caisse
 */
export function isCoffreCaisseError(error: unknown): error is CoffreCaisseError {
  return error instanceof Error && 'code' in error && 'httpStatus' in error && 'data' in error;
}
