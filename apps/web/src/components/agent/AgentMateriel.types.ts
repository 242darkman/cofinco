/**
 * Types du composant AgentMateriel (modèle de données local).
 */

export interface Maintenance {
  date: string;
  description: string;
  cout: number;
}

export interface Materiel {
  id: string;
  agent_id: string;
  type_materiel: string;
  nom_materiel: string;
  numero_serie: string;
  date_attribution: string;
  date_retour?: string;
  etat: string;
  valeur: number;
  date_garantie_fin?: string;
  duree_amortissement_mois?: number;
  prochaine_maintenance?: string;
  historique_maintenances?: Maintenance[];
  notes: string;
  agent?: {
    nom: string;
    prenom: string;
  };
}
