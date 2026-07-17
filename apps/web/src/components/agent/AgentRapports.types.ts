/**
 * Types du composant AgentRapports (modèle de données local).
 */

export interface Rapport {
  id: string;
  agentId: string;
  periodeDebut: string;
  periodeFin: string;
  typeRapport: string;
  nombreVisites: number;
  nombreCollectes: number;
  montantTotalCollecte: number;
  tauxReussite: number;
  clientsNouveaux: number;
  incidents: number;
  kmParcourus: number;
  notes: string;
  createdAt: string;
  agent?: {
    nom: string;
    prenom: string;
  };
}
