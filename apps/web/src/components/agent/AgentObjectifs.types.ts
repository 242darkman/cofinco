/**
 * Types du composant AgentObjectifs (modèle de données local).
 */

export interface Objectif {
  id: string;
  agentId: string;
  periode: string;
  typeObjectif: string;
  valeurObjectif: number;
  valeurRealisee: number;
  unite: string;
  statut: string;
  recompense: number;
  avantageId: number | null;
  avantageEmployeId: number | null;
  primeStatut: string;
  createdAt: string;
  agent?: {
    nom: string;
    prenom: string;
  };
}
