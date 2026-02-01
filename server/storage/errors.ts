
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
