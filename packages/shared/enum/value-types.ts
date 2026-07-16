/**
 * Types « valeur » extraits des pgEnum (unions de chaînes) pour des casts
 * sûrs (`X as XDz` plutôt que `as any`).
 */

import { statutCaisseMainEnum, statutSessionCaisseEnum, statutTransfertCaisseEnum, typeOperationCaisseEnum } from "./caisse";
import { caisseRequestCategoryEnum, caisseRequestStatusEnum, closurePayoutMethodEnum, closurePayoutStatusEnum, closureRequestStatusEnum, motifBlocageEnum, openingRequestStatusEnum, statutCompteEnum, statutOperationTerrainEnum, statutSessionAgentEnum, suspensionReasonEnum, typeCompteEnum, typeConditionnementEnum } from "./comptes";
import { amortizationTypeEnum, calendarModeEnum, dayCountConventionEnum, disbursementChannelEnum, disbursementStatusEnum, dureeUniteEnum, feeCollectionModeEnum, firstDueRuleEnum, frequenceRemboursementEnum, interestMethodEnum, interestRatePeriodEnum, methodePaiementEnum, roundingModeEnum, shiftNonWorkingDayEnum, statutCreditEnum, statutDemandeEnum, statutEcheanceCreditEnum, statutEnqueteCreditEnum, statutReevaluationEnum, statutRefundRequestEnum, typeCreditEnum, typeRevenuEnum } from "./credit";
import { sensMouvementEnum, sourceModuleEnum, statutTransactionEnum, typeEvenementEnum } from "./finance";
import { statutPaymentIntentEnum, typePaymentIntentEnum } from "./mobile-money";
import { typePaiementTerrainEnum } from "./terrain";

// ============================================
// DRIZZLE VALUE TYPES
// Extract the string union from each pgEnum for type-safe casts
// Usage: `StatutCredit.ACTIVE as StatutCreditDz` instead of `as any`
// ============================================

export type StatutCreditDz = (typeof statutCreditEnum.enumValues)[number];
export type StatutDemandeDz = (typeof statutDemandeEnum.enumValues)[number];
export type StatutTransactionDz = (typeof statutTransactionEnum.enumValues)[number];
export type StatutCompteDz = (typeof statutCompteEnum.enumValues)[number];
export type TypeCompteDz = (typeof typeCompteEnum.enumValues)[number];
export type MethodePaiementDz = (typeof methodePaiementEnum.enumValues)[number];
export type TypeOperationCaisseDz = (typeof typeOperationCaisseEnum.enumValues)[number];
export type TypePaiementTerrainDz = (typeof typePaiementTerrainEnum.enumValues)[number];
export type SourceModuleDz = (typeof sourceModuleEnum.enumValues)[number];
export type SensMouvementDz = (typeof sensMouvementEnum.enumValues)[number];
export type DisbursementChannelDz = (typeof disbursementChannelEnum.enumValues)[number];
export type DisbursementStatusDz = (typeof disbursementStatusEnum.enumValues)[number];
export type StatutTransfertCaisseDz = (typeof statutTransfertCaisseEnum.enumValues)[number];
export type FrequenceRemboursementDz = (typeof frequenceRemboursementEnum.enumValues)[number];
export type StatutEnqueteCreditDz = (typeof statutEnqueteCreditEnum.enumValues)[number];
export type StatutReevaluationDz = (typeof statutReevaluationEnum.enumValues)[number];
export type StatutEcheanceCreditDz = (typeof statutEcheanceCreditEnum.enumValues)[number];
export type StatutSessionAgentDz = (typeof statutSessionAgentEnum.enumValues)[number];
export type StatutOperationTerrainDz = (typeof statutOperationTerrainEnum.enumValues)[number];
export type SuspensionReasonDz = (typeof suspensionReasonEnum.enumValues)[number];
export type ClosureRequestStatusDz = (typeof closureRequestStatusEnum.enumValues)[number];
export type ClosurePayoutStatusDz = (typeof closurePayoutStatusEnum.enumValues)[number];
export type ClosurePayoutMethodDz = (typeof closurePayoutMethodEnum.enumValues)[number];
export type OpeningRequestStatusDz = (typeof openingRequestStatusEnum.enumValues)[number];
export type MotifBlocageDz = (typeof motifBlocageEnum.enumValues)[number];
export type CaisseRequestStatusDz = (typeof caisseRequestStatusEnum.enumValues)[number];
export type CaisseRequestCategoryDz = (typeof caisseRequestCategoryEnum.enumValues)[number];
export type InterestRatePeriodDz = (typeof interestRatePeriodEnum.enumValues)[number];
export type DayCountConventionDz = (typeof dayCountConventionEnum.enumValues)[number];
export type RoundingModeDz = (typeof roundingModeEnum.enumValues)[number];
export type AmortizationTypeDz = (typeof amortizationTypeEnum.enumValues)[number];
export type FirstDueRuleDz = (typeof firstDueRuleEnum.enumValues)[number];
export type CalendarModeDz = (typeof calendarModeEnum.enumValues)[number];
export type ShiftNonWorkingDayDz = (typeof shiftNonWorkingDayEnum.enumValues)[number];
export type FeeCollectionModeDz = (typeof feeCollectionModeEnum.enumValues)[number];
export type InterestMethodDz = (typeof interestMethodEnum.enumValues)[number];
export type StatutPaymentIntentDz = (typeof statutPaymentIntentEnum.enumValues)[number];
export type TypePaymentIntentDz = (typeof typePaymentIntentEnum.enumValues)[number];
export type StatutCaisseMainDz = (typeof statutCaisseMainEnum.enumValues)[number];
export type StatutSessionCaisseDz = (typeof statutSessionCaisseEnum.enumValues)[number];
export type TypeRevenuDz = (typeof typeRevenuEnum.enumValues)[number];
export type TypeCreditDz = (typeof typeCreditEnum.enumValues)[number];
export type DureeUniteDz = (typeof dureeUniteEnum.enumValues)[number];
export type StatutRefundRequestDz = (typeof statutRefundRequestEnum.enumValues)[number];
export type TypeEvenementDz = (typeof typeEvenementEnum.enumValues)[number];
export type TypeConditionnementDz = (typeof typeConditionnementEnum.enumValues)[number];
