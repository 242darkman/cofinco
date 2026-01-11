import { tontines, membresTontine, contributionsTontine, clients, users, tontineRegles, tontinePenalites, tontineDistributions, tontinePlans } from "@shared/schema";
import { type Tontine, type InsertTontine, type MembreTontine, type InsertMembreTontine, type ContributionTontine, type InsertContributionTontine,
    type TontineRegle, type InsertTontineRegle, type TontinePenalite, type InsertTontinePenalite,
    type TontinePlan, type InsertTontinePlan,
    operationsCaisse
 } from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, sql, getTableColumns } from "drizzle-orm";

import { executeWithLedger, updateTontineSolde, updateSessionSolde } from "../services/ledger";


// Tontine Plans
export async function getTontinePlan(id: string): Promise<TontinePlan | undefined> {
  const [plan] = await db.select().from(tontinePlans).where(eq(tontinePlans.id, id));
  return plan || undefined;
}

export async function getAllTontinePlans(filter: { agenceId?: string; actif?: boolean } = {}): Promise<TontinePlan[]> {
  let conditions = [];
  if (filter.agenceId) conditions.push(eq(tontinePlans.agenceId, filter.agenceId));
  if (filter.actif !== undefined) conditions.push(eq(tontinePlans.actif, filter.actif));

  let query = db.select().from(tontinePlans);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  return query.orderBy(desc(tontinePlans.createdAt));
}

export async function createTontinePlan(plan: InsertTontinePlan): Promise<TontinePlan> {
  const [newPlan] = await db.insert(tontinePlans).values(plan).returning();
  return newPlan;
}

export async function updateTontinePlan(id: string, updateData: Partial<InsertTontinePlan>): Promise<TontinePlan | undefined> {
  const [updated] = await db.update(tontinePlans).set({ ...updateData, updatedAt: new Date() }).where(eq(tontinePlans.id, id)).returning();
  return updated || undefined;
}

export async function deleteTontinePlan(id: string): Promise<boolean> {
  const result = await db.delete(tontinePlans).where(eq(tontinePlans.id, id));
  return result.rowCount ? result.rowCount > 0 : false;
}
export async function getTontine(id: string): Promise<any | undefined> {
  const [result] = await db
    .select({
      ...getTableColumns(tontines),
      nombreMembresActuel: sql<number>`count(DISTINCT ${membresTontine.id})`.mapWith(Number),
      tourActuel: sql<number>`count(DISTINCT ${tontineDistributions.id})`.mapWith(Number)
    })
    .from(tontines)
    .leftJoin(membresTontine, and(
      eq(tontines.id, membresTontine.tontineId),
      eq(membresTontine.statut, 'Actif')
    ))
    .leftJoin(tontineDistributions, eq(tontines.id, tontineDistributions.tontineId))
    .where(eq(tontines.id, id))
    .groupBy(tontines.id);
    
  return result || undefined;
}

export async function getAllTontines(filter: { agence?: string } = {}): Promise<any[]> {
    const baseQuery = db
      .select({
        ...getTableColumns(tontines),
        nombreMembresActuel: sql<number>`count(DISTINCT ${membresTontine.id})`.mapWith(Number),
        tourActuel: sql<number>`count(DISTINCT ${tontineDistributions.id})`.mapWith(Number)
      })
      .from(tontines)
      .leftJoin(membresTontine, and(
          eq(tontines.id, membresTontine.tontineId),
          eq(membresTontine.statut, 'Actif')
      ))
      .leftJoin(tontineDistributions, eq(tontines.id, tontineDistributions.tontineId))
      .groupBy(tontines.id)
      .orderBy(desc(tontines.createdAt));

    if (filter.agence) {
      // Need to join users to filter by agence, but be careful with groupBy
      // Since we group by tontine.id, we can join users on gestionnaire
      // But we need to include user columns in group by or use aggregation? 
      // Actually usually filtering happens in WHERE clause.
      // Drizzle requires all selected non-aggregated columns to be in groupBy? Postgres does.
      // But we are selecting tontines.*.
      
      // Let's restructure to ensure we filter correctly.
      // We can use a subquery or just join users.
      // If we join users, we must NOT select user columns to avoid grouping issues if we don't group by them.
      // But we are only selecting tontine columns.
      
      const results = await db
        .select({
            ...getTableColumns(tontines),
            nombreMembresActuel: sql<number>`count(DISTINCT ${membresTontine.id})`.mapWith(Number),
            tourActuel: sql<number>`count(DISTINCT ${tontineDistributions.id})`.mapWith(Number)
        })
        .from(tontines)
        .leftJoin(membresTontine, and(
            eq(tontines.id, membresTontine.tontineId),
            eq(membresTontine.statut, 'Actif')
        ))
        .leftJoin(tontineDistributions, eq(tontines.id, tontineDistributions.tontineId))
        .leftJoin(users, eq(tontines.gestionnaireId, users.id))
        .where(eq(users.agence, filter.agence))
        .groupBy(tontines.id)
        .orderBy(desc(tontines.createdAt));
        
      return results;
    }
    
  const results = await baseQuery;
  return results;
}

export async function createTontine(insertTontine: InsertTontine): Promise<Tontine> {
  const [tontine] = await db.insert(tontines).values(insertTontine).returning();
  return tontine;
}

export async function updateTontine(id: string, updateData: Partial<InsertTontine>): Promise<Tontine | undefined> {
  const [tontine] = await db
    .update(tontines)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(tontines.id, id))
    .returning();
  return tontine || undefined;
}

export async function deleteTontine(id: string): Promise<boolean> {
  await db.delete(contributionsTontine).where(eq(contributionsTontine.tontineId, id));
  await db.delete(membresTontine).where(eq(membresTontine.tontineId, id));
  const result = await db.delete(tontines).where(eq(tontines.id, id));
  return result.rowCount ? result.rowCount > 0 : false;
}

// Membres Tontine
export async function getMembresTontine(tontineId: string): Promise<any[]> {
  // Return typed as any because it joins client
  const rows = await db.select()
    .from(membresTontine)
    .innerJoin(clients, eq(membresTontine.clientId, clients.id))
    .where(eq(membresTontine.tontineId, tontineId));

  return rows.map(({ membres_tontine, clients }) => ({
    ...membres_tontine,
    client: clients
  }));
}

export async function getTontinesByClient(clientId: string): Promise<Array<MembreTontine & { tontine: Tontine }>> {
  const result = await db
    .select({
      id: membresTontine.id,
      tontineId: membresTontine.tontineId,
      clientId: membresTontine.clientId,
      dateAdhesion: membresTontine.dateAdhesion,
      statut: membresTontine.statut,
      totalCotisations: membresTontine.totalCotisations,
      totalRecus: membresTontine.totalRecus,
      position: membresTontine.position,
      aRecuBenefice: membresTontine.aRecuBenefice,
      dateBenefice: membresTontine.dateBenefice,
      createdAt: membresTontine.createdAt,
      tontine: tontines
    })
    .from(membresTontine)
    .innerJoin(tontines, eq(membresTontine.tontineId, tontines.id))
    .where(and(
      eq(membresTontine.clientId, clientId),
      eq(membresTontine.statut, 'Actif')
    ));
  return result as Array<MembreTontine & { tontine: Tontine }>;
}

export async function getMembreTontineByClientAndTontine(clientId: string, tontineId: string): Promise<MembreTontine | undefined> {
  const [membre] = await db.select().from(membresTontine)
    .where(and(
      eq(membresTontine.clientId, clientId),
      eq(membresTontine.tontineId, tontineId)
    ));
  return membre || undefined;
}

export async function updateMembreTontine(id: string, updates: Partial<InsertMembreTontine>): Promise<MembreTontine | undefined> {
  const [membre] = await db.update(membresTontine).set(updates).where(eq(membresTontine.id, id)).returning();
  return membre;
}

export async function createMembreTontine(insertMembre: InsertMembreTontine): Promise<MembreTontine> {
  const [membre] = await db.insert(membresTontine).values(insertMembre).returning();
  return membre;
}

// Contributions
export async function getContributionsByTontine(tontineId: string): Promise<any[]> {
  const rows = await db
    .select()
    .from(contributionsTontine)
    .leftJoin(clients, eq(contributionsTontine.clientId, clients.id))
    .where(eq(contributionsTontine.tontineId, tontineId))
    .orderBy(desc(contributionsTontine.createdAt));

  return rows.map(({ contributions_tontine, clients }) => {
    // Mapping des valeurs pour le frontend
    let mode = 'Cash';
    if (contributions_tontine.methodePaiement === 'Mobile Money') mode = 'Mobile Money';
    else if (contributions_tontine.methodePaiement === 'Virement') mode = 'Virement';
    else if (contributions_tontine.methodePaiement === 'Chèque') mode = 'Chèque';
    
    // Mapping du statut
    let statut = 'Validée'; // Par défaut pour l'instant si "Posté"
    if (contributions_tontine.statutTransaction === 'Pending') statut = 'En attente';
    else if (contributions_tontine.statutTransaction === 'Annulé' || contributions_tontine.statutTransaction === 'Reversé') statut = 'Rejetée';

    return {
      ...contributions_tontine,
      client: clients,
      // Alias for frontend compatibility 
      date_contribution: contributions_tontine.createdAt,
      mode_paiement: mode,
      statut: statut,
      tour_numero: contributions_tontine.tourNumero || 1,
      // Ensure original fields are also available if needed by other components using snake_case alias middleware
      methode_paiement: contributions_tontine.methodePaiement,
      statut_transaction: contributions_tontine.statutTransaction
    };
  });
}

export async function getContributionsByMembre(membreId: string): Promise<ContributionTontine[]> {
  // Actually, wait, if it's getContributionsByMembre, it should filter by a member ref.
  // But our contributions_tontine table has clientId and tontineId, not membreId directly.
  // So we filter by clientId if we want contributions for a specific client in tontines.
  return db.select().from(contributionsTontine).where(eq(contributionsTontine.clientId, membreId)).orderBy(desc(contributionsTontine.createdAt));
}



// Basic create optimized for seed/migration without ledger overhead
export async function createContributionTontine(contribution: InsertContributionTontine): Promise<ContributionTontine> {
  const [newContribution] = await db.insert(contributionsTontine).values(contribution).returning();
  return newContribution;
}

/**
 * Validated Tontine Contribution with Ledger Integration
 * Warning: Requires active session for Cash payments
 */
export async function createContributionTontineWithLedger(
  data: InsertContributionTontine,
  sessionCaisseId?: string,
  userId?: string
): Promise<ContributionTontine> {
  const isCash = data.methodePaiement === 'Espèces';

  // If Cash, session is mandatory
  if (isCash && !sessionCaisseId) {
    throw new Error("Une session de caisse active est requise pour les paiements en espèces");
  }

  return await executeWithLedger(
    "TONTINE",
    {
      montant: data.montant.toString(),
      sens: "Crédit", // Money IN for Tontine logic (but actually Debt for liability?) 
      // Wait, Tontine 'solde' is the money collected. So it's a Credit to the Tontine Object.
      // And a Debit to the Cashier (Account Receival).
      // Let's stick to standard: Credit = Resource increase. Tontine collected money increases.
      sourceModule: "TONTINE",
      tontineId: data.tontineId,
      clientId: data.clientId || undefined,
      sessionCaisseId: isCash ? sessionCaisseId : undefined,
      typePaiement: "Contribution Tontine",
      methodePaiement: data.methodePaiement,
      referenceExterne: data.reference,
      idempotencyKey: data.idempotencyKey || undefined,
      description: `Contribution Tontine (Tour ${data.tourNumero})`
    } as any, // casting because InsertContributionTontine doesn't exactly match MouvementData
    async (tx, mouvement) => {   
      // 1. Update Tontine Balance
      await updateTontineSolde(tx, data.tontineId, parseFloat(data.montant.toString()));

      // 2. Update Session Balance (if Cash)
      let nouveauSoldeSession;
      if (isCash && sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, sessionCaisseId, parseFloat(data.montant.toString()));
        
        // Create Operation Caisse for traceability
        await tx.insert(operationsCaisse).values({
            sessionId: sessionCaisseId,
            mouvementId: mouvement.id,
            typeOperation: "Dépôt" as any, // Generic In
            montant: data.montant.toString(),
            methodePaiement: "Espèces" as any,
            reference: `TON-IN-${data.reference}`, // Distinct from global ref
            description: `Contribution Tontine ref: ${data.reference}`,
            createdBy: userId
        });
      }

      // 3. Create Contribution Record (Linked to Mouvement)
      const [contribution] = await tx.insert(contributionsTontine).values({
        ...data,
        mouvementId: mouvement.id,
        createdAt: new Date()
      }).returning();

      return { 
        result: contribution, 
        additionalEventData: { 
            nouveauSoldeSession 
        } 
      };
    },
    userId
  ).then(({ result }) => result);
}

// Règles
export async function getTontineRegles(tontineId: string): Promise<TontineRegle[]> {
  return db.select().from(tontineRegles).where(eq(tontineRegles.tontineId, tontineId));
}

export async function createTontineRegle(regle: InsertTontineRegle): Promise<TontineRegle> {
  const [newRegle] = await db.insert(tontineRegles).values(regle).returning();
  return newRegle;
}

export async function updateTontineRegle(id: string, updates: Partial<InsertTontineRegle>): Promise<TontineRegle | undefined> {
  const [updated] = await db.update(tontineRegles).set(updates).where(eq(tontineRegles.id, id)).returning();
  return updated || undefined;
}

export async function deleteTontineRegle(id: string): Promise<boolean> {
  const result = await db.delete(tontineRegles).where(eq(tontineRegles.id, id));
  return result.rowCount ? result.rowCount > 0 : false;
}

// Pénalités
export async function getTontinePenalites(tontineId: string): Promise<any[]> {
    // Join with membres_tontine and clients to get names
    const rows = await db.select({
        penalite: tontinePenalites,
        membre: membresTontine,
        client: clients
    })
    .from(tontinePenalites)
    .innerJoin(membresTontine, eq(tontinePenalites.membreId, membresTontine.id))
    .innerJoin(tontines, eq(membresTontine.tontineId, tontines.id))
    .innerJoin(clients, eq(membresTontine.clientId, clients.id))
    .where(eq(tontines.id, tontineId))
    .orderBy(desc(tontinePenalites.dateFaute));

    return rows.map(r => ({
        ...r.penalite,
        tontine_membres: {
            ...r.membre,
            clients: r.client
        }
    }));
}

export async function updateTontinePenalite(id: string, updates: Partial<InsertTontinePenalite>): Promise<TontinePenalite | undefined> {
  const [updated] = await db.update(tontinePenalites).set(updates).where(eq(tontinePenalites.id, id)).returning();
  return updated || undefined;
}
