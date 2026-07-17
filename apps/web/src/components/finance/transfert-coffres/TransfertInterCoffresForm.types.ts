/**
 * Types du composant TransfertInterCoffresForm (modèle de données local).
 */

export interface CoffreFort {
  id: string;
  code: string;
  nom: string;
  ownerType: 'AGENCE' | 'SIEGE';
  solde: string;
  plafondEncaisse?: string;
  soldeMinimum?: string;
  statut: string;
  agenceNom?: string;
}

export interface AgentTransport {
  nom: string;
  contact: string;
}
