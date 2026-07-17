/**
 * Types du composant AgentGeolocalisation (modèle de données local).
 */

export interface GeoLocation {
  id: string;
  agent_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: string;
  activity_type: string;
}

export interface Agent {
  id: string;
  nom: string;
  prenom: string;
  zone_affectation: string;
  statut: string;
}
