export interface ServiceResult<T = any> {
  success: boolean;
  errorCode?: string;
  error?: string;
  transfert?: any;
  document?: any;
  data?: any;
  alreadyExists?: boolean;
}

export interface ListParams {
  agenceId?: string;
  role?: string;
  userId?: string;
  statut?: string | string[];
  type?: string;
  coffreSourceId?: string;
  coffreDestinationId?: string;
  dateDebut?: Date | string;
  dateFin?: Date | string;
  montantMin?: string | number;
  montantMax?: string | number;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
