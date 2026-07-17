/**
 * Types du composant PresenceTracker (modèle de données local).
 */

import type { Employe } from '../../hooks/hr/useEmployes';

export interface PresenceRecord {
  id: number;
  employeId: string;
  nom?: string;
  prenom?: string;
  poste?: string;
  statut: string;
  heureArrivee: string | null;
  heureDepart: string | null;
  pauseDebut: string | null;
  pauseFin: string | null;
}

export interface PresenceStats {
  totalEmployes: number;
  presents: number;
  retards: number;
  absents: number;
  tauxPresence: number;
  liste: PresenceRecord[];
}

export interface EmployePresenceData extends Employe {
  presenceStatus: string;
  presenceColor: 'success' | 'warning' | 'danger' | 'neutral';
  arrivalTime: string;
}
