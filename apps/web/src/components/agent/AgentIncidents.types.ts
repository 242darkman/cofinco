/**
 * Types du composant AgentIncidents (modèle de données local).
 */

export interface Incident {
  id: string;
  agent_id: string;
  type_incident: string;
  gravite: string;
  description: string;
  date_incident: string;
  localisation: string;
  statut: string;
  resolution: string;
  date_resolution?: string;
  pieces_jointes?: string[];
  escalade_par?: string;
  date_escalade?: string;
  agent?: { nom: string; prenom: string };
}
