/**
 * Types du composant AgentPlanning (modèle de données local).
 */

export interface Planning {
  id: string;
  agentId: string;
  datePlanning: string;
  heureDebut: string;
  heureFin: string;
  typeActivite: string;
  zone: string;
  statut: string;
  notes: string;
}

export type ViewMode = 'list' | 'calendar';
