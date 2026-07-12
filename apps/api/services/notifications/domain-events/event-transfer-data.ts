/**
 * Payloads des événements de transferts immédiats et programmés.
 */
export interface TransferRequestedData {
  transfertId: string;
  reference: string;
  typeTransfert: string;
  montant: number;
  agenceId: string;
  requestedByUserId: string;
}

export interface TransferValidatedData {
  transfertId: string;
  reference: string;
  montant: number;
  agenceId: string;
  validatedByUserId: string;
}

export interface TransferRejectedData {
  transfertId: string;
  reference: string;
  montant: number;
  reason?: string;
  agenceId: string;
  rejectedByUserId: string;
}

export interface TransferExecutedData {
  transfertId: string;
  reference: string;
  typeTransfert: string;
  montant: number;
  agenceId: string;
  executedByUserId: string;
}

export interface TransferCancelledData {
  transfertId: string;
  reference: string;
  typeTransfert: string;
  montant: number;
  agenceId: string;
  reason: string;
  cancelledByUserId: string;
}

export interface TransferReversedData {
  originalTransfertId: string;
  originalReference: string;
  reversalTransfertId: string;
  reversalReference: string;
  typeTransfert: string;
  montant: number;
  agenceId: string;
  reversedByUserId: string;
  reason: string;
}

export interface ScheduledTransferExecutedData {
  scheduleId: string;
  montant: number;
  compteSourceId: string;
  compteDestId: string;
  executionKey: string;
}

export interface ScheduledTransferFailedData {
  scheduleId: string;
  montant: number;
  errorMessage: string;
  retryCount: number;
  maxRetries: number;
  disabled: boolean;
}
