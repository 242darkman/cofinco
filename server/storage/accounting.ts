import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { 
  planComptable, InsertCompteComptable, CompteComptable,
  journaux, InsertJournal, Journal,
  ecritures, InsertEcriture, Ecriture,
  lignesEcritures, InsertLigneEcriture,
  declarationsTva, InsertDeclarationTva, DeclarationTva
} from "@shared/schema";

export async function getAllComptesComptables(): Promise<CompteComptable[]> {
  return await db.select().from(planComptable).orderBy(planComptable.numeroCompte);
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
    total_debit: sql<number>`(SELECT SUM(debit) FROM ${lignesEcritures} WHERE ${lignesEcritures.ecritureId} = ${ecritures.id})`,
    total_credit: sql<number>`(SELECT SUM(credit) FROM ${lignesEcritures} WHERE ${lignesEcritures.ecritureId} = ${ecritures.id})`
  })
  .from(ecritures);

  if (conditions.length > 0) {
    return await query.where(and(...conditions)).orderBy(desc(ecritures.dateEcriture));
  }
  
  return await query.orderBy(desc(ecritures.dateEcriture));
}

export async function createEcriture(ecritureData: InsertEcriture, lignes: any[]): Promise<Ecriture> {
  return await db.transaction(async (tx) => {
    // 1. Create Header
    const [ecriture] = await tx.insert(ecritures).values(ecritureData).returning();

    // 2. Create Lines
    for (const ligne of lignes) {
      await tx.insert(lignesEcritures).values({
        ...ligne,
        ecritureId: ecriture.id
      });
    }

    return ecriture;
  });
}

export async function getGrandLivre(compteId: string, dateDebut: string, dateFin: string): Promise<any[]> {
  // Join ecritures with lignes
  const result = await db.select({
    date_ecriture: ecritures.dateEcriture,
    numero_piece: ecritures.numeroPiece,
    libelle: ecritures.libelle,
    debit: lignesEcritures.debit,
    credit: lignesEcritures.credit,
    ref_externe: lignesEcritures.refExterne
  })
  .from(lignesEcritures)
  .leftJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
  .where(and(
    eq(lignesEcritures.compteId, compteId),
    gte(ecritures.dateEcriture, dateDebut),
    lte(ecritures.dateEcriture, dateFin)
  ))
  .orderBy(ecritures.dateEcriture);

  return result;
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

export async function getBilan(dateFin: string): Promise<any> {
    // Helper to get balance of a class or specific prefixes
    // This is a simplified implementation. Real OHADA bilan is complex.
    // We will aggregate by class for this dashboard view.
    
    // Get all accounts balances up to dateFin
    const allBalances = await getBalance('2000-01-01', dateFin);
    
    const getClassBalance = (prefixes: string[]) => {
        return allBalances
            .filter(c => prefixes.some(p => c.numero_compte.startsWith(p)))
            .reduce((sum, c) => sum + (c.solde_debiteur - c.solde_crediteur), 0);
    };

    // Actif
    const actifImmobilise = getClassBalance(['2']);
    const actifCirculant = getClassBalance(['3', '4']); // Simplification: 4 includes clients and debts, ideally should separate debit/credit balances
    const tresorerieActif = getClassBalance(['5']);

    // Passif
    const capitauxPropres = -getClassBalance(['10', '11', '12', '13']); // Inverted because they are usually Credit balances (negative in solde calculation above?) 
    // Wait, getBalance returns solde_debiteur and solde_crediteur separately.
    // solde_debiteur is positive, solde_crediteur is positive.
    
    const getNetBalance = (prefixes: string[]) => {
         return allBalances
            .filter(c => prefixes.some(p => c.numero_compte.startsWith(p)))
            .reduce((sum, c) => sum + (c.solde_debiteur || 0) - (c.solde_crediteur || 0), 0);
    };
    
    // Actif (Usually Debit balances)
    const actifImmoVal = getNetBalance(['2']);
    const actifCircVal = getNetBalance(['3', '41', '42', '43', '44', '45', '46', '47']);
    const tresoActifVal = getNetBalance(['5']);
    
    // Passif (Usually Credit balances, so result will be negative from getNetBalance)
    const capitauxVal = -getNetBalance(['1']);
    const dettesFinVal = -getNetBalance(['16']);
    const passifCircVal = -getNetBalance(['40', '42', '43', '44', '48', '49']);

    return {
        actif: {
            immobilise: Math.max(0, actifImmoVal),
            circulant: Math.max(0, actifCircVal),
            tresorerie: Math.max(0, tresoActifVal),
            total: Math.max(0, actifImmoVal) + Math.max(0, actifCircVal) + Math.max(0, tresoActifVal)
        },
        passif: {
            capitaux: Math.max(0, capitauxVal),
            dettes: Math.max(0, dettesFinVal),
            circulant: Math.max(0, passifCircVal),
            total: Math.max(0, capitauxVal) + Math.max(0, dettesFinVal) + Math.max(0, passifCircVal)
        }
    };
}
