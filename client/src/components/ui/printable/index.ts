// Templates d'impression pour tickets et factures
export { ReceiptTemplate } from './ReceiptTemplate';
export type {
  ReceiptData,
  InternalTransactionType,
  InternalTransactionInfo,
} from './ReceiptTemplate';

export { InternalOperationReceipt } from './InternalOperationReceipt';
export type { InternalOperationReceiptData } from './InternalOperationReceipt';

export { InvoiceTemplate } from './InvoiceTemplate';
export { TransferHistoryPrintTemplate } from './TransferHistoryPrintTemplate';
export type { TransferHistoryData } from './TransferHistoryPrintTemplate';
export { CreditSchedulePDF } from './CreditScheduleTemplate';
export { ClosingReportTemplate } from './ClosingReportTemplate';
export { EnqueteReportTemplate } from './EnqueteReportTemplate';
export type { EnqueteReportData } from './EnqueteReportTemplate';
