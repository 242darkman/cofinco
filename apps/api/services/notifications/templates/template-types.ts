import type {
  CreditApplicationReceivedVars,
  CreditApprovalVars,
  CreditDisbursementVars,
  CreditInvestigationAssignedVars,
  CreditOverdueVars,
  CreditPaidOffVars,
  CreditPaymentReminderVars,
  CreditRefundApprovedVars,
  CreditRefundPaidVars,
  CreditRejectionVars,
} from "./template-credit-vars";
import type {
  HrLeaveRequestedVars,
  HrLeaveStatusVars,
  HrSanctionCreatedVars,
  HrSanctionFinalizedVars,
  HrSanctionNotifiedVars,
  PayslipAvailableVars,
} from "./template-hr-vars";
import type {
  AccountActivatedVars,
  AccountBlockedVars,
  AccountClosedVars,
  AccountCreatedVars,
  AccountDepositVars,
  AccountUnblockedVars,
  AccountWithdrawalVars,
  InterestCapitalizedVars,
  SavingsConfirmedVars,
} from "./template-account-vars";
import type {
  TontineContributionOverdueVars,
  TontineContributionReceivedVars,
  TontineCycleStartedVars,
  TontineDistributionApprovedVars,
  TontineDistributionPaidVars,
  TontineMemberJoinedVars,
  TontinePenaltyAppliedVars,
  TontineReminderVars,
} from "./template-tontine-vars";
import type {
  PaiementTerrainValidatedVars,
  PaymentReminderVars,
  ProspectionCreatedVars,
  ReceiptDepositVars,
  ReceiptWithdrawalVars,
  ScheduledTransferExecutedVars,
  ScheduledTransferFailedVars,
  TransferExecutedVars,
  TransferRejectedVars,
  TransferRequestedVars,
  TransferScheduledVars,
} from "./template-operation-vars";
import type {
  AccessCodeExpiringVars,
  AccessCodeGeneratedVars,
  ClientWelcomeVars,
  EmployeeWelcomeVars,
  OtpCodeVars,
  PasswordResetVars,
  SessionForceClosedVars,
  TempPermissionExpiredVars,
  TempPermissionExpiringVars,
  TempPermissionGrantedVars,
  TempPermissionRevokedVars,
  UserPasswordChangedVars,
  UserRegisteredVars,
  WelcomeVars,
} from "./template-security-vars";

/**
 * Union des variables acceptées par le moteur de rendu des notifications.
 *
 * Chaque payload détaillé est défini dans le module de domaine correspondant ;
 * cette union sert uniquement de contrat transversal pour les appels génériques.
 */
export type TemplateVariables =
  | CreditApprovalVars
  | CreditRejectionVars
  | CreditDisbursementVars
  | CreditOverdueVars
  | CreditApplicationReceivedVars
  | CreditInvestigationAssignedVars
  | CreditPaymentReminderVars
  | CreditPaidOffVars
  | CreditRefundApprovedVars
  | CreditRefundPaidVars
  | OtpCodeVars
  | TransferScheduledVars
  | TransferExecutedVars
  | HrLeaveStatusVars
  | PayslipAvailableVars
  | WelcomeVars
  | PasswordResetVars
  | PaymentReminderVars
  | SavingsConfirmedVars
  | TontineReminderVars
  | TontineMemberJoinedVars
  | TontineContributionReceivedVars
  | TontineContributionOverdueVars
  | TontinePenaltyAppliedVars
  | TontineDistributionApprovedVars
  | TontineDistributionPaidVars
  | TontineCycleStartedVars
  | AccountCreatedVars
  | AccountActivatedVars
  | AccountDepositVars
  | AccountWithdrawalVars
  | AccountBlockedVars
  | AccountUnblockedVars
  | AccountClosedVars
  | InterestCapitalizedVars
  | TransferRequestedVars
  | TransferRejectedVars
  | ScheduledTransferExecutedVars
  | ScheduledTransferFailedVars
  | HrLeaveRequestedVars
  | SessionForceClosedVars
  | ClientWelcomeVars
  | UserRegisteredVars
  | UserPasswordChangedVars
  | EmployeeWelcomeVars
  | ProspectionCreatedVars
  | PaiementTerrainValidatedVars
  | ReceiptDepositVars
  | ReceiptWithdrawalVars
  | HrSanctionCreatedVars
  | HrSanctionNotifiedVars
  | HrSanctionFinalizedVars
  | TempPermissionGrantedVars
  | TempPermissionExpiringVars
  | TempPermissionExpiredVars
  | TempPermissionRevokedVars
  | AccessCodeGeneratedVars
  | AccessCodeExpiringVars;
