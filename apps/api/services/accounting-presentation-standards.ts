/**
 * Standards de présentation des états comptables.
 *
 * Ce registre sépare les règles de présentation (rubriques, préfixes,
 * éliminations) de l'algorithme de consolidation. Un nouveau référentiel peut
 * ainsi être ajouté sans modifier le coeur de calcul.
 */

export type AccountingPresentationStandardCode = 'OHADA';

export type AccountNumberFilter = (numeroCompte: string) => boolean;

export interface BilanSectionDefinition {
  classe: number;
  titre: string;
  filter?: AccountNumberFilter;
}

export interface ResultatSectionDefinition {
  prefix: string;
  titre: string;
}

export interface InterAgencyEliminationPair {
  debitPrefix: string;
  creditPrefix: string;
}

export interface AccountingPresentationStandard {
  code: AccountingPresentationStandardCode;
  libelle: string;
  bilan: {
    actif: BilanSectionDefinition[];
    passif: BilanSectionDefinition[];
  };
  compteResultat: {
    charges: ResultatSectionDefinition[];
    produits: ResultatSectionDefinition[];
  };
  eliminations: {
    bilanInterAgences: InterAgencyEliminationPair[];
    compteResultatInternePrefixes: string[];
  };
}

export const DEFAULT_ACCOUNTING_PRESENTATION_STANDARD: AccountingPresentationStandardCode = 'OHADA';

const OHADA_PRESENTATION_STANDARD: AccountingPresentationStandard = {
  code: 'OHADA',
  libelle: 'OHADA / SYSCOHADA',
  bilan: {
    actif: [
      { classe: 2, titre: 'Immobilisations (Classe 2)' },
      { classe: 3, titre: 'Stocks (Classe 3)' },
      { classe: 4, titre: 'Créances (Classe 4)', filter: (n: string) => n.startsWith('41') || n.startsWith('42') || n.startsWith('43') || n.startsWith('44') || n.startsWith('45') || n.startsWith('46') || n.startsWith('47') || n.startsWith('409') },
      { classe: 5, titre: 'Trésorerie Actif (Classe 5)', filter: (n: string) => n.startsWith('5') && !n.startsWith('56') },
    ],
    passif: [
      { classe: 1, titre: 'Capitaux propres et ressources (Classe 1)' },
      { classe: 4, titre: 'Dettes (Classe 4)', filter: (n: string) => (n.startsWith('40') && !n.startsWith('409')) || n.startsWith('48') || n.startsWith('49') },
      { classe: 5, titre: 'Trésorerie Passif (Classe 5)', filter: (n: string) => n.startsWith('56') },
    ],
  },
  compteResultat: {
    charges: [
      { prefix: '60', titre: 'Achats et variations de stocks' },
      { prefix: '61', titre: 'Transports' },
      { prefix: '62', titre: 'Services extérieurs A' },
      { prefix: '63', titre: 'Services extérieurs B' },
      { prefix: '64', titre: 'Impôts et taxes' },
      { prefix: '65', titre: 'Autres charges' },
      { prefix: '66', titre: 'Charges de personnel' },
      { prefix: '67', titre: 'Frais financiers et charges assimilées' },
      { prefix: '68', titre: 'Dotations aux amortissements et provisions' },
      { prefix: '69', titre: 'Dotations aux provisions financières' },
    ],
    produits: [
      { prefix: '70', titre: 'Ventes' },
      { prefix: '71', titre: 'Production stockée' },
      { prefix: '72', titre: 'Production immobilisée' },
      { prefix: '73', titre: 'Variation de stocks de produits' },
      { prefix: '75', titre: 'Autres produits' },
      { prefix: '76', titre: 'Produits financiers' },
      { prefix: '77', titre: 'Revenus financiers' },
      { prefix: '78', titre: 'Reprises de provisions et amortissements' },
      { prefix: '79', titre: 'Reprises de provisions financières' },
    ],
  },
  eliminations: {
    bilanInterAgences: [
      { debitPrefix: '185', creditPrefix: '485' },
      { debitPrefix: '181', creditPrefix: '481' },
      { debitPrefix: '271', creditPrefix: '181' },
    ],
    compteResultatInternePrefixes: ['186', '486', '7086', '6086'],
  },
};

export const ACCOUNTING_PRESENTATION_STANDARDS: Record<
  AccountingPresentationStandardCode,
  AccountingPresentationStandard
> = {
  OHADA: OHADA_PRESENTATION_STANDARD,
};

/**
 * Retourne la définition de présentation comptable à appliquer.
 */
export function getAccountingPresentationStandard(
  code: AccountingPresentationStandardCode = DEFAULT_ACCOUNTING_PRESENTATION_STANDARD,
): AccountingPresentationStandard {
  return ACCOUNTING_PRESENTATION_STANDARDS[code];
}
