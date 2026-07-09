/**
 * DSF Service — Déclaration Statistique et Fiscale (CEMAC format)
 *
 * Generates DSF schedules (tableaux) from GL data for tax filing.
 * Covers Bilan Actif/Passif, Compte de Résultat, SIG, CAF,
 * Immobilisations, Amortissements, and Provisions.
 */

import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  declarationsDsf,
  DsfStatut,
  exercices,
  immobilisations,
  amortissements,
  provisionsCredits,
} from "@shared/schema";
import { generateBilan, generateCompteResultat } from "./gl-reporting-service";
import { getProvisionSummary } from "./provision-service";
import { createLogger } from "../lib/logger";

const logger = createLogger('DsfService');

// ============================================================================
// TYPES
// ============================================================================

export interface DsfLigne {
  ref: string;
  intitule: string;
  brut?: number;
  amortProvision?: number;
  net: number;
  netN1?: number;
}

export interface DsfTableau {
  code: string;
  titre: string;
  lignes: DsfLigne[];
  totalN: number;
  totalN1: number;
}

// ============================================================================
// DSF MAPPING — OHADA account prefixes → DSF line references
// ============================================================================

const DSF_BILAN_ACTIF: Array<{ ref: string; intitule: string; comptes: string[] }> = [
  { ref: 'AA', intitule: 'Frais d\'établissement et charges à répartir', comptes: ['201', '202'] },
  { ref: 'AB', intitule: 'Brevets, licences, logiciels', comptes: ['212', '213', '214', '215'] },
  { ref: 'AC', intitule: 'Fonds commercial', comptes: ['216'] },
  { ref: 'AD', intitule: 'Autres immobilisations incorporelles', comptes: ['21'] },
  { ref: 'AE', intitule: 'Terrains', comptes: ['22'] },
  { ref: 'AF', intitule: 'Bâtiments', comptes: ['23'] },
  { ref: 'AG', intitule: 'Installations et agencements', comptes: ['234', '235'] },
  { ref: 'AH', intitule: 'Matériel', comptes: ['24'] },
  { ref: 'AI', intitule: 'Matériel de transport', comptes: ['245'] },
  { ref: 'AJ', intitule: 'Avances et acomptes sur immobilisations', comptes: ['25'] },
  { ref: 'AK', intitule: 'Prêts et créances à long terme', comptes: ['27'] },
  { ref: 'AL', intitule: 'Titres de participation', comptes: ['26'] },
  { ref: 'BA', intitule: 'Marchandises', comptes: ['31'] },
  { ref: 'BB', intitule: 'Matières premières', comptes: ['32'] },
  { ref: 'BC', intitule: 'Autres approvisionnements', comptes: ['33', '34', '35', '36', '37'] },
  { ref: 'BG', intitule: 'Fournisseurs avances versées', comptes: ['409'] },
  { ref: 'BH', intitule: 'Clients', comptes: ['411'] },
  { ref: 'BI', intitule: 'Autres créances', comptes: ['41', '42', '43', '44', '45', '46', '47'] },
  { ref: 'BJ', intitule: 'Titres de placement', comptes: ['50'] },
  { ref: 'BK', intitule: 'Valeurs à encaisser', comptes: ['51'] },
  { ref: 'BL', intitule: 'Banques, chèques postaux, caisse', comptes: ['52', '53', '57'] },
];

const DSF_BILAN_PASSIF: Array<{ ref: string; intitule: string; comptes: string[] }> = [
  { ref: 'CA', intitule: 'Capital', comptes: ['101'] },
  { ref: 'CB', intitule: 'Réserves', comptes: ['11'] },
  { ref: 'CC', intitule: 'Report à nouveau', comptes: ['12'] },
  { ref: 'CD', intitule: 'Résultat net de l\'exercice', comptes: ['13'] },
  { ref: 'CE', intitule: 'Subventions d\'investissement', comptes: ['14'] },
  { ref: 'CF', intitule: 'Provisions réglementées', comptes: ['15'] },
  { ref: 'DA', intitule: 'Emprunts et dettes financières', comptes: ['16'] },
  { ref: 'DB', intitule: 'Provisions pour risques et charges', comptes: ['19'] },
  { ref: 'DC', intitule: 'Dettes fournisseurs', comptes: ['401'] },
  { ref: 'DD', intitule: 'Dettes fiscales et sociales', comptes: ['43', '44'] },
  { ref: 'DE', intitule: 'Autres dettes', comptes: ['42', '45', '46', '47'] },
  { ref: 'DF', intitule: 'Dépôts et cautionnements reçus', comptes: ['41'] },
  { ref: 'DG', intitule: 'Banques, découverts', comptes: ['56'] },
];

const DSF_COMPTE_RESULTAT: Array<{ ref: string; intitule: string; comptes: string[]; isCharge: boolean }> = [
  { ref: 'TA', intitule: 'Ventes de marchandises', comptes: ['701'], isCharge: false },
  { ref: 'TB', intitule: 'Ventes de produits fabriqués', comptes: ['702', '703'], isCharge: false },
  { ref: 'TC', intitule: 'Travaux, services vendus', comptes: ['704', '705', '706'], isCharge: false },
  { ref: 'TD', intitule: 'Produits accessoires', comptes: ['707', '708'], isCharge: false },
  { ref: 'RA', intitule: 'Achats de marchandises', comptes: ['601'], isCharge: true },
  { ref: 'RB', intitule: 'Achats de matières premières', comptes: ['602'], isCharge: true },
  { ref: 'RC', intitule: 'Transports', comptes: ['61'], isCharge: true },
  { ref: 'RD', intitule: 'Services extérieurs', comptes: ['62', '63'], isCharge: true },
  { ref: 'RE', intitule: 'Impôts et taxes', comptes: ['64'], isCharge: true },
  { ref: 'RF', intitule: 'Autres charges', comptes: ['65'], isCharge: true },
  { ref: 'RG', intitule: 'Charges de personnel', comptes: ['66'], isCharge: true },
  { ref: 'RH', intitule: 'Dotations amortissements et provisions', comptes: ['68', '69'], isCharge: true },
  { ref: 'TE', intitule: 'Revenus financiers', comptes: ['76', '77'], isCharge: false },
  { ref: 'RI', intitule: 'Charges financières', comptes: ['67'], isCharge: true },
  { ref: 'TF', intitule: 'Produits exceptionnels', comptes: ['78', '79'], isCharge: false },
  { ref: 'RJ', intitule: 'Charges exceptionnelles', comptes: ['67'], isCharge: true },
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate a complete DSF declaration for an exercice.
 */
export async function generateDsf(
  agenceId: string,
  exerciceId: string,
  userId?: string,
): Promise<typeof declarationsDsf.$inferSelect> {
  // 1. Get exercice info
  const [exercice] = await db
    .select()
    .from(exercices)
    .where(eq(exercices.id, exerciceId))
    .limit(1);

  if (!exercice) {
    throw new Error(`Exercice ${exerciceId} non trouvé`);
  }

  const annee = parseInt(exercice.code);
  const dateDebut = exercice.dateDebut;
  const dateFin = exercice.dateFin;

  logger.info({ exerciceId, annee, agenceId }, 'Generating DSF');

  // 2. Generate GL reports
  const [bilan, compteResultat] = await Promise.all([
    generateBilan(agenceId, dateFin),
    generateCompteResultat(agenceId, dateDebut, dateFin),
  ]);

  // 3. Compute schedules
  const tableaux: Record<string, DsfTableau> = {};

  // T1 - Bilan Actif
  tableaux['T1'] = computeBilanActif(bilan);

  // T2 - Bilan Passif
  tableaux['T2'] = computeBilanPassif(bilan);

  // T3 - Compte de Résultat
  tableaux['T3'] = computeCR(compteResultat);

  // T4 - Soldes Intermédiaires de Gestion
  tableaux['T4'] = computeSIG(compteResultat);

  // T5 - Capacité d'Autofinancement
  tableaux['T5'] = computeCAF(compteResultat, tableaux['T4']);

  // T8 - Immobilisations
  tableaux['T8'] = await computeImmobilisations(agenceId, exerciceId);

  // T9 - Amortissements
  tableaux['T9'] = await computeAmortissements(agenceId, exerciceId);

  // T10 - Provisions
  tableaux['T10'] = await computeProvisions(agenceId, dateFin);

  // 4. Upsert DSF record
  const [result] = await db
    .insert(declarationsDsf)
    .values({
      agenceId,
      exerciceId,
      annee,
      statut: DsfStatut.GENERATED,
      tableaux,
      totalActif: bilan.totalActif.toFixed(2),
      totalPassif: bilan.totalPassif.toFixed(2),
      resultatNet: compteResultat.resultatNet.toFixed(2),
      chiffreAffaires: computeCA(compteResultat).toFixed(2),
      generatedAt: new Date(),
      generatedBy: userId,
    })
    .onConflictDoUpdate({
      target: [declarationsDsf.agenceId, declarationsDsf.annee],
      set: {
        statut: DsfStatut.GENERATED,
        tableaux,
        totalActif: bilan.totalActif.toFixed(2),
        totalPassif: bilan.totalPassif.toFixed(2),
        resultatNet: compteResultat.resultatNet.toFixed(2),
        chiffreAffaires: computeCA(compteResultat).toFixed(2),
        generatedAt: new Date(),
        generatedBy: userId,
        updatedAt: new Date(),
      },
    })
    .returning();

  logger.info({ id: result.id, annee, tableauxCount: Object.keys(tableaux).length }, 'DSF generated');
  return result;
}

// ============================================================================
// QUERIES
// ============================================================================

export async function getDsf(id: string) {
  const [result] = await db
    .select()
    .from(declarationsDsf)
    .where(eq(declarationsDsf.id, id))
    .limit(1);

  return result || null;
}

export async function listDsf(agenceId: string) {
  return db
    .select()
    .from(declarationsDsf)
    .where(eq(declarationsDsf.agenceId, agenceId))
    .orderBy(sql`${declarationsDsf.annee} DESC`);
}

export async function validateDsf(id: string, userId: string) {
  const [result] = await db
    .update(declarationsDsf)
    .set({
      statut: DsfStatut.VALIDATED,
      validatedAt: new Date(),
      validatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(declarationsDsf.id, id))
    .returning();

  return result;
}

// ============================================================================
// SCHEDULE COMPUTATION
// ============================================================================

function computeBilanActif(bilan: Awaited<ReturnType<typeof generateBilan>>): DsfTableau {
  const lignes: DsfLigne[] = DSF_BILAN_ACTIF.map(mapping => {
    const montant = sumAccountsFromBilan(bilan.actif, mapping.comptes);
    return {
      ref: mapping.ref,
      intitule: mapping.intitule,
      net: montant,
    };
  }).filter(l => l.net !== 0);

  return {
    code: 'T1',
    titre: 'Bilan - Actif',
    lignes,
    totalN: bilan.totalActif,
    totalN1: 0,
  };
}

function computeBilanPassif(bilan: Awaited<ReturnType<typeof generateBilan>>): DsfTableau {
  const lignes: DsfLigne[] = DSF_BILAN_PASSIF.map(mapping => {
    const montant = sumAccountsFromBilan(bilan.passif, mapping.comptes);
    return {
      ref: mapping.ref,
      intitule: mapping.intitule,
      net: montant,
    };
  }).filter(l => l.net !== 0);

  // Add result line
  if (bilan.resultatExercice !== 0) {
    lignes.push({ ref: 'CD', intitule: 'Résultat net de l\'exercice', net: bilan.resultatExercice });
  }

  return {
    code: 'T2',
    titre: 'Bilan - Passif',
    lignes,
    totalN: bilan.totalPassif,
    totalN1: 0,
  };
}

function computeCR(cr: Awaited<ReturnType<typeof generateCompteResultat>>): DsfTableau {
  const lignes: DsfLigne[] = DSF_COMPTE_RESULTAT.map(mapping => {
    const sections = mapping.isCharge ? cr.charges : cr.produits;
    const montant = sumAccountsFromCR(sections, mapping.comptes);
    return {
      ref: mapping.ref,
      intitule: mapping.intitule,
      net: montant,
    };
  }).filter(l => l.net !== 0);

  return {
    code: 'T3',
    titre: 'Compte de Résultat',
    lignes,
    totalN: cr.resultatNet,
    totalN1: 0,
  };
}

function computeSIG(cr: Awaited<ReturnType<typeof generateCompteResultat>>): DsfTableau {
  const ventes = sumAccountsFromCR(cr.produits, ['70']);
  const achats = sumAccountsFromCR(cr.charges, ['60']);
  const margeBrute = ventes - achats;

  const autresProduits = sumAccountsFromCR(cr.produits, ['71', '72', '73', '74', '75']);
  const autresCharges = sumAccountsFromCR(cr.charges, ['61', '62', '63']);
  const valeurAjoutee = margeBrute + autresProduits - autresCharges;

  const personnel = sumAccountsFromCR(cr.charges, ['66']);
  const impots = sumAccountsFromCR(cr.charges, ['64']);
  const ebe = valeurAjoutee - personnel - impots;

  const dotations = sumAccountsFromCR(cr.charges, ['68', '69']);
  const reprises = sumAccountsFromCR(cr.produits, ['78', '79']);
  const resultatExploitation = ebe - dotations + reprises;

  const lignes: DsfLigne[] = [
    { ref: 'XA', intitule: 'Marge brute sur marchandises', net: margeBrute },
    { ref: 'XB', intitule: 'Valeur ajoutée', net: valeurAjoutee },
    { ref: 'XC', intitule: 'Excédent brut d\'exploitation (EBE)', net: ebe },
    { ref: 'XD', intitule: 'Résultat d\'exploitation', net: resultatExploitation },
    { ref: 'XE', intitule: 'Résultat net', net: cr.resultatNet },
  ];

  return {
    code: 'T4',
    titre: 'Soldes Intermédiaires de Gestion',
    lignes,
    totalN: cr.resultatNet,
    totalN1: 0,
  };
}

function computeCAF(
  cr: Awaited<ReturnType<typeof generateCompteResultat>>,
  sig: DsfTableau,
): DsfTableau {
  const ebe = sig.lignes.find(l => l.ref === 'XC')?.net || 0;
  const dotations = sumAccountsFromCR(cr.charges, ['68', '69']);
  const reprises = sumAccountsFromCR(cr.produits, ['78', '79']);
  const caf = ebe + dotations - reprises; // Simplified CAF

  return {
    code: 'T5',
    titre: 'Capacité d\'Autofinancement',
    lignes: [
      { ref: 'SA', intitule: 'EBE', net: ebe },
      { ref: 'SB', intitule: '+ Dotations (exploitation)', net: dotations },
      { ref: 'SC', intitule: '- Reprises (exploitation)', net: -reprises },
      { ref: 'SD', intitule: '= Capacité d\'autofinancement', net: caf },
    ],
    totalN: caf,
    totalN1: 0,
  };
}

async function computeImmobilisations(agenceId: string, exerciceId: string): Promise<DsfTableau> {
  const rows = await db
    .select({
      categorie: immobilisations.categorie,
      totalAcquisition: sql<string>`COALESCE(SUM(${immobilisations.valeurAcquisition}::numeric), 0)`,
      totalVNC: sql<string>`COALESCE(SUM(${immobilisations.valeurNetteComptable}::numeric), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(immobilisations)
    .where(eq(immobilisations.agenceId, agenceId))
    .groupBy(immobilisations.categorie);

  const lignes: DsfLigne[] = rows.map((r, i) => ({
    ref: `IM${String.fromCharCode(65 + i)}`,
    intitule: r.categorie,
    brut: parseFloat(r.totalAcquisition),
    net: parseFloat(r.totalVNC),
  }));

  const total = lignes.reduce((s, l) => s + l.net, 0);

  return { code: 'T8', titre: 'Tableau des Immobilisations', lignes, totalN: total, totalN1: 0 };
}

async function computeAmortissements(agenceId: string, exerciceId: string): Promise<DsfTableau> {
  const rows = await db
    .select({
      categorie: immobilisations.categorie,
      totalDotation: sql<string>`COALESCE(SUM(${amortissements.montantDotation}::numeric), 0)`,
      totalCumul: sql<string>`COALESCE(SUM(${amortissements.cumulApres}::numeric), 0)`,
    })
    .from(amortissements)
    .innerJoin(immobilisations, eq(amortissements.immobilisationId, immobilisations.id))
    .where(
      and(
        eq(amortissements.agenceId, agenceId),
        eq(amortissements.exerciceId, exerciceId),
      )
    )
    .groupBy(immobilisations.categorie);

  const lignes: DsfLigne[] = rows.map((r, i) => ({
    ref: `AM${String.fromCharCode(65 + i)}`,
    intitule: r.categorie,
    brut: parseFloat(r.totalCumul),
    net: parseFloat(r.totalDotation),
  }));

  const total = lignes.reduce((s, l) => s + l.net, 0);

  return { code: 'T9', titre: 'Tableau des Amortissements', lignes, totalN: total, totalN1: 0 };
}

async function computeProvisions(agenceId: string, dateFin: string): Promise<DsfTableau> {
  const summary = await getProvisionSummary(agenceId, dateFin);

  const lignes: DsfLigne[] = summary.categories.map((cat, i) => ({
    ref: `PR${String.fromCharCode(65 + i)}`,
    intitule: cat.categorie,
    net: cat.provisionTotal,
  }));

  const total = lignes.reduce((s, l) => s + l.net, 0);

  return { code: 'T10', titre: 'Tableau des Provisions', lignes, totalN: total, totalN1: 0 };
}

// ============================================================================
// HELPERS
// ============================================================================

function sumAccountsFromBilan(
  sections: Array<{ lignes: Array<{ numeroCompte: string; montant: number }> }>,
  prefixes: string[],
): number {
  let total = 0;
  for (const section of sections) {
    for (const ligne of section.lignes) {
      if (prefixes.some(p => ligne.numeroCompte.startsWith(p))) {
        total += ligne.montant;
      }
    }
  }
  return total;
}

function sumAccountsFromCR(
  sections: Array<{ lignes: Array<{ numeroCompte: string; montant: number }> }>,
  prefixes: string[],
): number {
  let total = 0;
  for (const section of sections) {
    for (const ligne of section.lignes) {
      if (prefixes.some(p => ligne.numeroCompte.startsWith(p))) {
        total += ligne.montant;
      }
    }
  }
  return total;
}

function computeCA(cr: Awaited<ReturnType<typeof generateCompteResultat>>): number {
  return sumAccountsFromCR(cr.produits, ['70']);
}
