import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  planComptable, InsertCompteComptable, CompteComptable,
  journaux, InsertJournal, Journal,
  ecritures,
  lignesEcritures,
  declarationsTva, InsertDeclarationTva, DeclarationTva
} from "@shared/schema";

export async function getAllComptesComptables(): Promise<CompteComptable[]> {
  return await db.select().from(planComptable).orderBy(planComptable.numeroCompte);
}

/**
 * Get all accounts with their current balance calculated from all movements
 * Used for the Plan Comptable view to show real-time balances
 */
export async function getAllComptesComptablesWithBalances(): Promise<(CompteComptable & { soldeActuel: number })[]> {
  // Get all movements aggregated by account (all time, no date filter)
  const mouvements = await db.select({
    compteId: lignesEcritures.compteId,
    totalDebit: sql<number>`COALESCE(sum(${lignesEcritures.debit}), 0)`,
    totalCredit: sql<number>`COALESCE(sum(${lignesEcritures.credit}), 0)`
  })
  .from(lignesEcritures)
  .groupBy(lignesEcritures.compteId);

  // Create a map for fast lookup
  const balanceMap = new Map(mouvements.map(m => [m.compteId, m]));

  // Get all accounts
  const comptes = await db.select().from(planComptable).orderBy(planComptable.numeroCompte);

  // Enrich accounts with their balance
  return comptes.map(compte => {
    const mouv = balanceMap.get(compte.id);
    const debit = mouv ? Number(mouv.totalDebit) : 0;
    const credit = mouv ? Number(mouv.totalCredit) : 0;

    // Calculate balance based on account type
    // For Actif/Charge accounts: Debit - Credit (positive = debit balance)
    // For Passif/Produit/Capitaux accounts: Credit - Debit (positive = credit balance)
    let soldeActuel = 0;
    if (['Actif', 'Charge'].includes(compte.typeCompte || '')) {
      soldeActuel = debit - credit;
    } else {
      soldeActuel = credit - debit;
    }

    return {
      ...compte,
      soldeActuel
    };
  });
}

export async function getComptesComptablesByClasse(classe: number): Promise<CompteComptable[]> {
  return await db.select().from(planComptable).where(eq(planComptable.classe, classe));
}

export async function createCompteComptable(compte: InsertCompteComptable): Promise<CompteComptable> {
  const [newCompte] = await db.insert(planComptable).values(compte).returning();
  return newCompte;
}

export async function getAllJournaux(): Promise<Journal[]> {
  return await db.select().from(journaux);
}

export async function createJournal(journal: InsertJournal): Promise<Journal> {
  const [newJournal] = await db.insert(journaux).values(journal).returning();
  return newJournal;
}

export async function getAllEcritures(filter?: { journalId?: string; dateDebut?: string; dateFin?: string }): Promise<any[]> {
  let conditions = [];
  if (filter?.journalId) conditions.push(eq(ecritures.journalId, filter.journalId));
  if (filter?.dateDebut) conditions.push(gte(ecritures.dateEcriture, filter.dateDebut));
  if (filter?.dateFin) conditions.push(lte(ecritures.dateEcriture, filter.dateFin));

  const query = db.select({
    id: ecritures.id,
    date: ecritures.dateEcriture,
    numero_piece: ecritures.numeroPiece,
    libelle: ecritures.libelle,
    journal_id: ecritures.journalId,
    total_debit: sql<number>`COALESCE((SELECT SUM(debit) FROM ${lignesEcritures} WHERE ${lignesEcritures.ecritureId} = ${ecritures.id}), 0)`,
    total_credit: sql<number>`COALESCE((SELECT SUM(credit) FROM ${lignesEcritures} WHERE ${lignesEcritures.ecritureId} = ${ecritures.id}), 0)`
  })
  .from(ecritures);

  if (conditions.length > 0) {
    return await query.where(and(...conditions)).orderBy(desc(ecritures.dateEcriture));
  }
  
  return await query.orderBy(desc(ecritures.dateEcriture));
}

export async function getDeclarationsTva(): Promise<DeclarationTva[]> {
  return await db.select().from(declarationsTva).orderBy(desc(declarationsTva.annee), desc(declarationsTva.mois));
}

export async function createDeclarationTva(declaration: InsertDeclarationTva): Promise<DeclarationTva> {
  const [newDecl] = await db.insert(declarationsTva).values(declaration).returning();
  return newDecl;
}

export async function getBalance(dateDebut: string, dateFin: string): Promise<any[]> {
  // Aggregate sum by compte
  const mouvements = await db.select({
    compteId: lignesEcritures.compteId,
    totalDebit: sql<number>`sum(${lignesEcritures.debit})`,
    totalCredit: sql<number>`sum(${lignesEcritures.credit})`
  })
  .from(lignesEcritures)
  .leftJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
  .where(and(
    gte(ecritures.dateEcriture, dateDebut),
    lte(ecritures.dateEcriture, dateFin)
  ))
  .groupBy(lignesEcritures.compteId);

  // Get all accounts to map names and types
  const allComptes = await getAllComptesComptables();
  const balance = [];

  for (const compte of allComptes) {
    const mouv = mouvements.find(m => m.compteId === compte.id);
    const debit = mouv ? Number(mouv.totalDebit) : 0;
    const credit = mouv ? Number(mouv.totalCredit) : 0;
    
    // Skip accounts with no movement if desired, or keep them with 0
    if (debit === 0 && credit === 0) continue;

    let soldeDebiteur = 0;
    let soldeCrediteur = 0;
    const solde = debit - credit;

    if (solde > 0) soldeDebiteur = solde;
    else soldeCrediteur = Math.abs(solde);

    balance.push({
      numero_compte: compte.numeroCompte,
      intitule: compte.intitule,
      type_compte: compte.typeCompte,
      total_debit: debit,
      total_credit: credit,
      solde_debiteur: soldeDebiteur,
      solde_crediteur: soldeCrediteur
    });
  }

  return balance.sort((a, b) => a.numero_compte.localeCompare(b.numero_compte));
}

export async function getJournauxStats(): Promise<any[]> {
  const stats = await db.select({
    code: journaux.code,
    intitule: journaux.intitule,
    count: sql<number>`count(${ecritures.id})`
  })
  .from(journaux)
  .leftJoin(ecritures, eq(journaux.id, ecritures.journalId))
  .groupBy(journaux.code, journaux.intitule);

  return stats;
}

