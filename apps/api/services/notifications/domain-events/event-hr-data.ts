/**
 * Payloads des événements RH et sanctions disciplinaires.
 */
export interface HrSanctionCreatedData {
  sanctionId: number;
  employeId: string;
  employeNom: string;
  type: string;
  gravite: string;
  motif: string;
  emetteurId?: string;
  agenceId?: string;
}

export interface HrSanctionNotifiedData {
  sanctionId: number;
  employeId: string;
  employeNom: string;
  type: string;
  gravite: string;
  agenceId?: string;
}

export interface HrSanctionFinalizedData {
  sanctionId: number;
  employeId: string;
  employeNom: string;
  type: string;
  gravite: string;
  finalizedBy?: string;
  agenceId?: string;
}

export interface HrLeaveRequestedData {
  congeId: number;
  employeId: string;
  employeNom: string;
  type: string;
  dateDebut: string;
  dateFin: string;
  daysRequested: number;
  agenceId?: string;
}

export interface HrLeaveApprovedData {
  congeId: number;
  employeId: string;
  employeNom: string;
  approvedByName?: string;
  agenceId?: string;
}

export interface HrLeaveRejectedData {
  congeId: number;
  employeId: string;
  employeNom: string;
  rejectedByName?: string;
  reason?: string;
  agenceId?: string;
}

export interface HrDocumentRequestCreatedData {
  requestId: string;
  employeId: string;
  employeNom: string;
  type: string;
  urgence: boolean;
  agenceId?: string;
}
