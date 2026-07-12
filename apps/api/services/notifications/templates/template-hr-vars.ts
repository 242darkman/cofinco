/**
 * Variables de rendu pour les notifications RH et disciplinaires.
 */
export interface HrLeaveStatusVars {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  approverName?: string;
}

export interface PayslipAvailableVars {
  employeeName: string;
  month: string;
  year: string;
}

export interface HrSanctionCreatedVars {
  employeeName: string;
  sanctionType: string;
  gravite: string;
  motif: string;
}

export interface HrSanctionNotifiedVars {
  employeeName: string;
  sanctionType: string;
  gravite: string;
}

export interface HrSanctionFinalizedVars {
  employeeName: string;
  sanctionType: string;
  gravite: string;
}

export interface HrLeaveRequestedVars {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysRequested: string;
}
