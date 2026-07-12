/**
 * Payloads des événements d'identité, sécurité, scoring et opérations terrain.
 */
export interface UserPasswordResetData {
  userId: string;
  resetByUserId?: string;
}

export interface SessionForceClosedData {
  sessions: Array<{
    sessionId: string;
    caisseId: string;
    caissierId?: string;
    hoursInactive: number;
  }>;
}

export interface ClientCreatedData {
  clientId: string;
  clientNom: string;
  clientPrenom?: string;
  telephone?: string;
  email?: string;
  agenceId?: string;
  agenceNom?: string;
  numeroCompte?: string;
}

export interface UserRegisteredData {
  userId: string;
  username: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  agenceId?: string;
  generatedPassword?: string;
}

export interface UserPasswordChangedData {
  userId: string;
  userName: string;
  email?: string;
}

export interface EmployeeCreatedData {
  employeId: string;
  userId: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  matricule: string;
  username?: string;
  agenceId?: string;
  agenceNom?: string;
}

export interface ProspectionCreatedData {
  prospectionId: string;
  agentId: string;
  agentNom?: string;
  userId?: string;
  nomProspect: string;
  telephone?: string;
  localisation?: string;
  agenceId?: string;
}

export interface PaiementTerrainValidatedData {
  paiementId: string;
  clientId?: string;
  agentId?: string;
  montant: string;
  typePaiement: string;
  methodePaiement: string;
  reference?: string;
  creditId?: string;
  compteId?: string;
  agenceId?: string;
}

export interface SystemJobFailedData {
  jobName: string;
  jobId?: string;
  error: string;
  timestamp: string;
}

export interface ClientSegmentChangedData {
  clientId: string;
  clientName?: string;
  previousSegment: string;
  newSegment: string;
  scoreGlobal: number;
  agenceId?: string;
}
