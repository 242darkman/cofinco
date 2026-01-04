export interface SecurityCode {
  id: string;
  code: string;
  generatedBy: string;
  assignedTo: string | null;
  agence: string | null;
  validFrom: string;
  validUntil: string;
  maxUses: number | null;
  usageCount: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

export interface CodePermission {
  id: string;
  userId: string;
  grantedBy: string;
  agence: string | null;
  canGenerateCaisseCodes: boolean;
  maxCodeDurationHours: number;
  isActive: boolean;
  validUntil: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  nom: string;
  email: string;
  role: string;
  agence?: string;
}
