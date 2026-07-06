
export interface InsufficientFundsErrorData {
  code: "INSUFFICIENT_FUNDS";
  message: string;
  required: number;
  current: number;
  deficit: number;
  coffreId: string;
  coffreCode: string;
  coffreName?: string;
}

export class DecaissementInsufficientFundsError extends Error {
  public readonly code = "INSUFFICIENT_FUNDS" as const;
  public readonly httpStatus = 400;
  public readonly data: InsufficientFundsErrorData;

  constructor(
    required: number,
    current: number,
    coffreId: string,
    coffreCode: string,
    coffreName?: string
  ) {
    const deficit = required - current;
    const message = `Solde du coffre insuffisant pour cette opération`;
    super(message);
    this.name = "DecaissementInsufficientFundsError";
    this.data = {
      code: "INSUFFICIENT_FUNDS",
      message,
      required,
      current,
      deficit,
      coffreId,
      coffreCode,
      coffreName,
    };
  }
}

/**
 * Generic insufficient funds error for any entity type.
 * Used by the liquidity guard and update*Solde functions
 * to enforce zero negative balance.
 */
export type LiquidityEntityType = "compte" | "caisse" | "coffre" | "session" | "tontine" | "mobile_money";

export class InsufficientFundsError extends Error {
  public readonly code = "INSUFFICIENT_FUNDS" as const;
  public readonly httpStatus = 422;
  public readonly entityType: LiquidityEntityType;
  public readonly entityId: string;
  public readonly currentBalance: number;
  public readonly requestedAmount: number;
  public readonly deficit: number;

  constructor(
    entityType: LiquidityEntityType,
    entityId: string,
    currentBalance: number,
    requestedAmount: number,
  ) {
    const deficit = requestedAmount - currentBalance;
    const message = `Liquidité insuffisante pour effectuer cette opération. Disponible: ${currentBalance.toLocaleString("fr-FR")}, Demandé: ${requestedAmount.toLocaleString("fr-FR")}`;
    super(message);
    this.name = "InsufficientFundsError";
    this.entityType = entityType;
    this.entityId = entityId;
    this.currentBalance = currentBalance;
    this.requestedAmount = requestedAmount;
    this.deficit = deficit;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      entityType: this.entityType,
      entityId: this.entityId,
      available: this.currentBalance,
      requested: this.requestedAmount,
      deficit: this.deficit,
    };
  }
}
