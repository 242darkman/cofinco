import { addDays, addWeeks, addMonths, format } from 'date-fns';
import { 
  StatutEcheanceCredit, 
  StatutEcheanceCreditType, 
  STATUT_ECHEANCE_CREDIT_LABELS,
  FrequenceRemboursement,
  FrequenceRemboursementType
} from '@shared/enum/status-constants';

export interface Installment {
  number: number;
  dueDate: Date;
  amount: number;
  status: StatutEcheanceCreditType;
  remainingBalance: number;
}

export interface LoanParams {
  principal: number;
  annualRate: number;
  frequency: FrequenceRemboursementType;
  startDate: Date | string;
  totalInstallments: number;
  totalPaid: number;
}

/**
 * Generates a full payment schedule based on loan parameters and payment history.
 */
export function generateLoanSchedule(params: LoanParams): Installment[] {
  const { principal, annualRate, frequency, startDate, totalInstallments, totalPaid } = params;
  const start = new Date(startDate);
  const totalWithInterest = principal * (1 + annualRate / 100);
  const installmentAmount = totalWithInterest / totalInstallments;
  
  const schedule: Installment[] = [];

  for (let i = 1; i <= totalInstallments; i++) {
    let dueDate: Date;
    
    switch (frequency) {
      case FrequenceRemboursement.DAILY:
        dueDate = addDays(start, i);
        break;
      case FrequenceRemboursement.WEEKLY:
        dueDate = addWeeks(start, i);
        break;
      case FrequenceRemboursement.MONTHLY:
        dueDate = addMonths(start, i);
        break;
      case FrequenceRemboursement.QUARTERLY:
        dueDate = addMonths(start, i * 3);
        break;
      case FrequenceRemboursement.BI_MONTHLY:
        dueDate = addMonths(start, i * 2);
        break;
      default:
        dueDate = addDays(start, i);
    }

    // Determine status based on totalPaid
    let status: StatutEcheanceCreditType = StatutEcheanceCredit.UPCOMING;
    
    // If we've paid more than the cumulative due for this installment, it's paid
    const cumulativeDue = installmentAmount * i;
    
    if (totalPaid >= totalWithInterest - 0.01) {
      status = StatutEcheanceCredit.SETTLED;
    } else if (totalPaid >= cumulativeDue - 0.01) {
      status = StatutEcheanceCredit.PAID;
    } else if (new Date() > dueDate) {
      status = StatutEcheanceCredit.LATE;
    }

    // Solde théorique restant après cette échéance
    const theoreticalBalance = Math.max(0, totalWithInterest - cumulativeDue);

    schedule.push({
      number: i,
      dueDate,
      amount: installmentAmount,
      status,
      remainingBalance: theoreticalBalance
    });
  }

  return schedule;
}

/** Helper to get French label for display */
export function getInstallmentStatusLabel(status: StatutEcheanceCreditType): string {
  return STATUT_ECHEANCE_CREDIT_LABELS[status];
}
