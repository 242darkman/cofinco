/**
 * Résultat d'un lettrage manuel ou automatique.
 */
export interface LettrageResult {
  lettrageKey: string;
  totalDebit: number;
  totalCredit: number;
  lignesCount: number;
}

/**
 * Agrégat de balance âgée pour les lignes non lettrées.
 */
export interface BalanceAgeeEntry {
  tranche: string;
  joursMin: number;
  joursMax: number | null;
  nbLignes: number;
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

/**
 * Ligne comptable non lettrée exposée aux écrans de rapprochement.
 */
export interface LigneNonLettree {
  id: string;
  ecritureId: string;
  dateEcriture: string;
  numeroPiece: string;
  libelle: string;
  debit: number;
  credit: number;
  numeroCompte: string;
  refExterne: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Définition d'une tranche de balance âgée.
 */
export interface BalanceAgeeTranche {
  label: string;
  min: number;
  max: number | null;
}
