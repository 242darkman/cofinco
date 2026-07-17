/**
 * Types du composant ComptabiliteSageOHADA (modèle de données local).
 */

export interface CompteOHADA {
  id: string;
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: 'Actif' | 'Passif' | 'Charge' | 'Produit' | 'Capitaux';
  sensNormal: 'Débit' | 'Crédit';
  niveau: number;
  actif: boolean;
  description: string;
  soldeActuel: number;
}

export type TabKey = 'plan' | 'journaux' | 'ecritures' | 'balance' | 'grandlivre' | 'bilan' | 'resultat' | 'tva' | 'tresorerie' | 'tafire' | 'liasse' | 'rapports';

export interface JournalFromApi {
  id: string;
  code: string;
  intitule: string;
  typeJournal?: string;
  actif?: boolean;
}

export interface JournalDisplay {
  id: string;
  code: string;
  label: string;
  color: string;
  count: number;
}

export interface JournalEntryFromApi {
  id: string;
  date: string;
  numeroPiece: string;
  libelle: string;
  journalId: string;
  totalDebit: number;
  totalCredit: number;
}
