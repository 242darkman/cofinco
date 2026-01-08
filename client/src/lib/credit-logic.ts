import { addDays, addWeeks, addMonths, format } from 'date-fns';

export interface Installment {
  number: number;
  dueDate: Date;
  amount: number;
  status: 'A venir' | 'Payé' | 'Retard' | 'Soldé';
  remainingBalance: number;
}

export interface LoanParams {
  principal: number;
  annualRate: number;
  frequency: 'Journalier' | 'Hebdomadaire' | 'Bimensuel' | 'Mensuel' | 'Trimestriel';
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
      case 'Journalier':
        dueDate = addDays(start, i);
        break;
      case 'Hebdomadaire':
        dueDate = addWeeks(start, i);
        break;
      case 'Bimensuel':
        dueDate = addDays(start, i * 15);
        break;
      case 'Mensuel':
        dueDate = addMonths(start, i);
        break;
      case 'Trimestriel':
        dueDate = addMonths(start, i * 3);
        break;
      default:
        dueDate = addDays(start, i);
    }

    // Determine status based on totalPaid
    let status: Installment['status'] = 'A venir';
    
    // If we've paid more than the cumulative due for this installment, it's paid
    const cumulativeDue = installmentAmount * i;
    
    if (totalPaid >= totalWithInterest - 0.01) {
      status = 'Soldé';
    } else if (totalPaid >= cumulativeDue - 0.01) {
      status = 'Payé';
    } else if (new Date() > dueDate) {
      status = 'Retard';
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
