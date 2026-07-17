/**
 * Types du composant SaisieEcriture (modèle de données local).
 */

export interface Compte {
  id: string;
  numeroCompte: string;
  intitule: string;
  sensNormal: 'Débit' | 'Crédit';
}

export interface Journal {
  id: string;
  code: string;
  intitule: string;
}

export interface LigneEcriture {
  id?: string;
  compte_id: string;
  numero_compte: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
}
