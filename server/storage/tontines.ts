import { tontines, membresTontine, contributionsTontine, clients, users, tontineRegles, tontinePenalites, tontineDistributions, tontinePlans } from "@shared/schema";
import { type Tontine, type InsertTontine, type MembreTontine, type InsertMembreTontine, type ContributionTontine, type InsertContributionTontine,
    type TontineRegle, type InsertTontineRegle, type TontinePenalite, type InsertTontinePenalite,
    type TontinePlan, type InsertTontinePlan,
    operationsCaisse
 } from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, sql, getTableColumns } from "drizzle-orm";

import { executeWithLedger, updateTontineSolde, updateSessionSolde, validateUserId } from "../services/ledger";


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
      // Tour actuel = nombre de distributions complétées + 1 (tour en cours)
      // Si aucune distribution, on est au tour 1
      tourActuel: sql<number>`COALESCE(MAX(${tontineDistributions.tourNumero}), 0) + 1`.mapWith(Number),
      // Somme réelle des contributions validées - utilise la colonne tontines.id pour la corrélation
      totalCollecte: sql<number>`COALESCE((
        SELECT SUM(CAST(ct.montant AS NUMERIC))
        FROM contributions_tontine ct
        WHERE ct.tontine_id = tontines.id
        AND ct.statut_transaction = 'Posté'
      ), 0)`.mapWith(Number)
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
        // Tour actuel = dernier tour distribué + 1 (ou 1 si aucune distribution)
        tourActuel: sql<number>`COALESCE(MAX(${tontineDistributions.tourNumero}), 0) + 1`.mapWith(Number),
        // Somme réelle des contributions validées - référence directe à la colonne
        totalCollecte: sql<number>`COALESCE((
          SELECT SUM(CAST(ct.montant AS NUMERIC))
          FROM contributions_tontine ct
          WHERE ct.tontine_id = tontines.id
          AND ct.statut_transaction = 'Posté'
        ), 0)`.mapWith(Number)
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
      const results = await db
        .select({
            ...getTableColumns(tontines),
            nombreMembresActuel: sql<number>`count(DISTINCT ${membresTontine.id})`.mapWith(Number),
            tourActuel: sql<number>`COALESCE(MAX(${tontineDistributions.tourNumero}), 0) + 1`.mapWith(Number),
            totalCollecte: sql<number>`COALESCE((
              SELECT SUM(CAST(ct.montant AS NUMERIC))
              FROM contributions_tontine ct
              WHERE ct.tontine_id = tontines.id
              AND ct.statut_transaction = 'Posté'
            ), 0)`.mapWith(Number)
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
  // Get tontine info for calculating remaining payments
  const [tontineInfo] = await db
    .select({
      montantCotisation: tontines.montantCotisation,
      nombreMembres: tontines.nombreMembres,
      tourActuel: sql<number>`COALESCE((
        SELECT MAX(tour_numero) FROM tontine_distributions WHERE tontine_id = ${tontineId}
      ), 0) + 1`.mapWith(Number)
    })
    .from(tontines)
    .where(eq(tontines.id, tontineId));

  const montantCotisation = Number(tontineInfo?.montantCotisation || 0);
  const nombreMembres = tontineInfo?.nombreMembres || 0;
  const tourActuel = tontineInfo?.tourActuel || 1;

  // Get membres with their contribution stats calculated from actual contributions
  const rows = await db
    .select({
      membre: membresTontine,
      client: clients,
      // Compter le nombre de contributions validées pour ce membre
      nombreContributions: sql<number>`(
        SELECT COUNT(*) FROM contributions_tontine ct
        WHERE ct.tontine_id = membres_tontine.tontine_id
        AND ct.client_id = membres_tontine.client_id
        AND ct.statut_transaction = 'Posté'
      )`.mapWith(Number),
      // Calculer le total cotisé directement depuis les contributions (plus fiable)
      totalCotiseCalcule: sql<number>`COALESCE((
        SELECT SUM(CAST(ct.montant AS NUMERIC))
        FROM contributions_tontine ct
        WHERE ct.tontine_id = membres_tontine.tontine_id
        AND ct.client_id = membres_tontine.client_id
        AND ct.statut_transaction = 'Posté'
      ), 0)`.mapWith(Number)
    })
    .from(membresTontine)
    .innerJoin(clients, eq(membresTontine.clientId, clients.id))
    .where(eq(membresTontine.tontineId, tontineId));

  return rows.map(({ membre, client, nombreContributions, totalCotiseCalcule }) => {
    // Utiliser le total calculé depuis les contributions (pas le champ totalCotisations qui peut être désynchronisé)
    const totalCotise = totalCotiseCalcule;
    const toursPayes = montantCotisation > 0 ? Math.floor(totalCotise / montantCotisation) : 0;
    const toursRestants = Math.max(0, nombreMembres - toursPayes);
    const montantRestant = toursRestants * montantCotisation;
    const estAJour = toursPayes >= tourActuel;

    return {
      ...membre,
      client,
      // Stats calculées depuis les contributions réelles
      totalCotisations: totalCotise.toString(), // Override avec la valeur calculée
      toursPayes,
      toursRestants,
      montantRestant,
      estAJour,
      nombreContributions,
      tourActuel,
      montantCotisation
    };
  });
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
      sens: "Crédit", 
      sourceModule: "TONTINE",
      tontineId: data.tontineId,
      sessionCaisseId: isCash ? sessionCaisseId : undefined,
      typePaiement: "Versement Tontine", // Fixed Enum
      methodePaiement: data.methodePaiement,
      referenceExterne: data.reference,
      idempotencyKey: data.idempotencyKey || undefined,
      description: `Versement Tontine (Tour ${data.tourNumero})` // Changed text to verify reload
    } as any,
    async (tx, mouvement) => {   
      // 1. Update Tontine Balance
      await updateTontineSolde(tx, data.tontineId, parseFloat(data.montant.toString()));

      // 2. Update Session Balance (if Cash)
      let nouveauSoldeSession;
      if (isCash && sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, sessionCaisseId, parseFloat(data.montant.toString()));
        
        // Create Operation Caisse for traceability
        // Note: 'Dépôt' is not in typeOperationCaisseEnum. Using 'Ajustement' or similar for now until 'Versement Tontine' is added to that enum too.
        // Actually, let's use 'Ajustement' with clear description.
        
        // Validate userId
        const validatedUserId = await validateUserId(tx, userId);
        
        await tx.insert(operationsCaisse).values({
            sessionId: sessionCaisseId,
            mouvementId: mouvement.id,
            typeOperation: "Ajustement" as any, 
            montant: data.montant.toString(),
            methodePaiement: "Espèces" as any,
            reference: `TON-IN-${data.reference}`,
            description: `Versement Tontine ref: ${data.reference}`,
            createdBy: validatedUserId
        });
      }

      // 3. Create Contribution Record (Linked to Mouvement)
      const [contribution] = await tx.insert(contributionsTontine).values({
        ...data,
        mouvementId: mouvement.id,
        createdAt: new Date()
      }).returning();

      // 4. Update Member's totalCotisations
      if (data.clientId) {
        await tx.execute(sql`
          UPDATE membres_tontine
          SET total_cotisations = COALESCE(total_cotisations, 0) + ${data.montant}
          WHERE tontine_id = ${data.tontineId}
          AND client_id = ${data.clientId}
        `);
      }

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

// Attribution du prochain bénéficiaire

/**
 * Récupère le prochain bénéficiaire de la tontine
 * - Si typeDistribution = 'Ordre' -> retourne le membre suivant selon la position
 * - Si typeDistribution = 'Aleatoire' -> retourne un membre aléatoire parmi les éligibles
 * - Éligibles = membres actifs qui n'ont pas encore reçu le bénéfice
 */
export async function getProchainBeneficiaire(tontineId: string): Promise<any | null> {
  // Get tontine type
  const [tontine] = await db
    .select({ typeDistribution: tontines.typeDistribution })
    .from(tontines)
    .where(eq(tontines.id, tontineId));

  if (!tontine) return null;

  // Get eligible members (actifs, n'ont pas reçu le bénéfice)
  const eligibles = await db
    .select({
      membre: membresTontine,
      client: clients
    })
    .from(membresTontine)
    .innerJoin(clients, eq(membresTontine.clientId, clients.id))
    .where(and(
      eq(membresTontine.tontineId, tontineId),
      eq(membresTontine.statut, 'Actif'),
      eq(membresTontine.aRecuBenefice, false)
    ))
    .orderBy(membresTontine.position);

  if (eligibles.length === 0) return null;

  let selected;
  if (tontine.typeDistribution === 'Ordre' || tontine.typeDistribution === 'Fixe') {
    // Premier membre selon la position
    selected = eligibles[0];
  } else {
    // Attribution aléatoire
    const randomIndex = Math.floor(Math.random() * eligibles.length);
    selected = eligibles[randomIndex];
  }

  return {
    ...selected.membre,
    client: selected.client
  };
}

/**
 * Effectue un tirage aléatoire pour désigner le prochain bénéficiaire
 * et enregistre le résultat dans l'ordreDistribution de la tontine
 */
export async function tirerProchainBeneficiaire(tontineId: string): Promise<any | null> {
  // Get eligible members
  const eligibles = await db
    .select({
      membre: membresTontine,
      client: clients
    })
    .from(membresTontine)
    .innerJoin(clients, eq(membresTontine.clientId, clients.id))
    .where(and(
      eq(membresTontine.tontineId, tontineId),
      eq(membresTontine.statut, 'Actif'),
      eq(membresTontine.aRecuBenefice, false)
    ));

  if (eligibles.length === 0) return null;

  // Random selection
  const randomIndex = Math.floor(Math.random() * eligibles.length);
  const selected = eligibles[randomIndex];

  // Get current tour number
  const [tontineInfo] = await db
    .select({
      ordreDistribution: tontines.ordreDistribution,
      tourActuel: sql<number>`COALESCE((SELECT MAX(tour_numero) FROM tontine_distributions WHERE tontine_id = ${tontineId}), 0) + 1`.mapWith(Number)
    })
    .from(tontines)
    .where(eq(tontines.id, tontineId));

  // Update ordre_distribution to track the draw
  const currentOrdre = (tontineInfo?.ordreDistribution as any[]) || [];
  const newOrdre = [
    ...currentOrdre,
    {
      tour: tontineInfo?.tourActuel || 1,
      membreId: selected.membre.id,
      clientNom: selected.client.nom,
      dateTirage: new Date().toISOString()
    }
  ];

  await db.update(tontines)
    .set({ ordreDistribution: newOrdre, updatedAt: new Date() })
    .where(eq(tontines.id, tontineId));

  return {
    ...selected.membre,
    client: selected.client,
    tour: tontineInfo?.tourActuel || 1
  };
}

/**
 * Récupère tous les membres éligibles au bénéfice (pour affichage dans le tirage)
 */
export async function getMembresEligiblesBenefice(tontineId: string): Promise<any[]> {
  const eligibles = await db
    .select({
      membre: membresTontine,
      client: clients
    })
    .from(membresTontine)
    .innerJoin(clients, eq(membresTontine.clientId, clients.id))
    .where(and(
      eq(membresTontine.tontineId, tontineId),
      eq(membresTontine.statut, 'Actif'),
      eq(membresTontine.aRecuBenefice, false)
    ))
    .orderBy(membresTontine.position);

  return eligibles.map(e => ({
    ...e.membre,
    client: e.client
  }));
}

// ============ DISTRIBUTIONS ============

/**
 * Récupère toutes les distributions d'une tontine
 */
export async function getDistributionsByTontine(tontineId: string): Promise<any[]> {
  const rows = await db
    .select({
      distribution: tontineDistributions,
      membre: membresTontine,
      client: clients
    })
    .from(tontineDistributions)
    .innerJoin(membresTontine, eq(tontineDistributions.membreId, membresTontine.id))
    .innerJoin(clients, eq(membresTontine.clientId, clients.id))
    .where(eq(tontineDistributions.tontineId, tontineId))
    .orderBy(desc(tontineDistributions.tourNumero));

  return rows.map(({ distribution, membre, client }) => ({
    ...distribution,
    membre: {
      ...membre,
      client
    }
  }));
}

/**
 * Récupère une distribution par ID
 */
export async function getDistribution(id: string): Promise<any | undefined> {
  const [row] = await db
    .select({
      distribution: tontineDistributions,
      membre: membresTontine,
      client: clients
    })
    .from(tontineDistributions)
    .innerJoin(membresTontine, eq(tontineDistributions.membreId, membresTontine.id))
    .innerJoin(clients, eq(membresTontine.clientId, clients.id))
    .where(eq(tontineDistributions.id, id));

  if (!row) return undefined;

  return {
    ...row.distribution,
    membre: {
      ...row.membre,
      client: row.client
    }
  };
}

/**
 * Crée une distribution avec validation métier complète
 * - Vérifie que le membre est éligible (actif, n'a pas reçu de bénéfice)
 * - Vérifie que le solde de la tontine est suffisant
 * - Met à jour le flag aRecuBenefice du membre
 * - Met à jour le solde de la tontine
 */
export async function createTontineDistribution(
  data: {
    tontineId: string;
    membreId: string;
    tourNumero: number;
    montantTotal: string;
    dateDistribution?: Date;
    modePaiement?: string;
    referencePaiement?: string;
    notes?: string;
  },
  userId?: string
): Promise<any> {
  return await db.transaction(async (tx) => {
    // 1. Vérifier que la tontine existe et récupérer son solde
    const [tontine] = await tx
      .select({
        id: tontines.id,
        solde: tontines.solde,
        nombreMembres: tontines.nombreMembres,
        montantCotisation: tontines.montantCotisation
      })
      .from(tontines)
      .where(eq(tontines.id, data.tontineId));

    if (!tontine) {
      throw new Error("Tontine introuvable");
    }

    // 2. Vérifier que le membre existe et est éligible
    const [membre] = await tx
      .select()
      .from(membresTontine)
      .where(and(
        eq(membresTontine.id, data.membreId),
        eq(membresTontine.tontineId, data.tontineId)
      ));

    if (!membre) {
      throw new Error("Membre introuvable dans cette tontine");
    }

    if (membre.statut !== 'Actif') {
      throw new Error("Le membre n'est pas actif");
    }

    if (membre.aRecuBenefice) {
      throw new Error("Ce membre a déjà reçu son bénéfice");
    }

    // 3. Vérifier qu'une distribution n'existe pas déjà pour ce tour
    const [existingDistribution] = await tx
      .select()
      .from(tontineDistributions)
      .where(and(
        eq(tontineDistributions.tontineId, data.tontineId),
        eq(tontineDistributions.tourNumero, data.tourNumero)
      ));

    if (existingDistribution) {
      throw new Error(`Une distribution existe déjà pour le tour ${data.tourNumero}`);
    }

    // 4. Vérifier le solde disponible
    const soldeActuel = Number(tontine.solde || 0);
    const montantDistribution = Number(data.montantTotal);

    if (soldeActuel < montantDistribution) {
      throw new Error(`Solde insuffisant. Disponible: ${soldeActuel} FCFA, Requis: ${montantDistribution} FCFA`);
    }

    // 5. Créer la distribution
    const [distribution] = await tx
      .insert(tontineDistributions)
      .values({
        tontineId: data.tontineId,
        membreId: data.membreId,
        tourNumero: data.tourNumero,
        montantTotal: data.montantTotal,
        dateDistribution: data.dateDistribution || new Date(),
        modePaiement: data.modePaiement || 'ESPECES',
        referencePaiement: data.referencePaiement,
        notes: data.notes
      })
      .returning();

    // 6. Mettre à jour le membre: marquer comme ayant reçu le bénéfice
    await tx
      .update(membresTontine)
      .set({
        aRecuBenefice: true,
        dateBenefice: new Date(),
        totalRecus: sql`COALESCE(total_recus, 0) + ${data.montantTotal}`
      })
      .where(eq(membresTontine.id, data.membreId));

    // 7. Déduire le montant du solde de la tontine
    await tx
      .update(tontines)
      .set({
        solde: sql`COALESCE(solde, 0) - ${data.montantTotal}`,
        updatedAt: new Date()
      })
      .where(eq(tontines.id, data.tontineId));

    // 8. Récupérer la distribution complète avec les infos du membre
    const [client] = await tx
      .select()
      .from(clients)
      .where(eq(clients.id, membre.clientId));

    return {
      ...distribution,
      membre: {
        ...membre,
        aRecuBenefice: true,
        client
      }
    };
  });
}

/**
 * Annule une distribution (reverse les modifications)
 * - Remet aRecuBenefice à false pour le membre
 * - Recrédite le solde de la tontine
 */
export async function cancelTontineDistribution(id: string): Promise<boolean> {
  return await db.transaction(async (tx) => {
    // Récupérer la distribution
    const [distribution] = await tx
      .select()
      .from(tontineDistributions)
      .where(eq(tontineDistributions.id, id));

    if (!distribution) {
      throw new Error("Distribution introuvable");
    }

    // Remettre le membre comme n'ayant pas reçu de bénéfice
    await tx
      .update(membresTontine)
      .set({
        aRecuBenefice: false,
        dateBenefice: null,
        totalRecus: sql`GREATEST(0, COALESCE(total_recus, 0) - ${distribution.montantTotal})`
      })
      .where(eq(membresTontine.id, distribution.membreId));

    // Recréditer le solde de la tontine
    await tx
      .update(tontines)
      .set({
        solde: sql`COALESCE(solde, 0) + ${distribution.montantTotal}`,
        updatedAt: new Date()
      })
      .where(eq(tontines.id, distribution.tontineId));

    // Supprimer la distribution
    await tx.delete(tontineDistributions).where(eq(tontineDistributions.id, id));

    return true;
  });
}

/**
 * Récupère les statistiques de distribution d'une tontine
 */
export async function getDistributionStats(tontineId: string): Promise<{
  totalDistribue: number;
  nombreDistributions: number;
  membresAyantRecu: number;
  membresEnAttente: number;
  prochainTour: number;
  soldeDisponible: number;
}> {
  // Stats des distributions
  const [distStats] = await db
    .select({
      totalDistribue: sql<number>`COALESCE(SUM(CAST(${tontineDistributions.montantTotal} AS NUMERIC)), 0)`.mapWith(Number),
      nombreDistributions: sql<number>`COUNT(*)`.mapWith(Number),
      dernierTour: sql<number>`COALESCE(MAX(${tontineDistributions.tourNumero}), 0)`.mapWith(Number)
    })
    .from(tontineDistributions)
    .where(eq(tontineDistributions.tontineId, tontineId));

  // Stats des membres
  const [membreStats] = await db
    .select({
      membresAyantRecu: sql<number>`COUNT(*) FILTER (WHERE ${membresTontine.aRecuBenefice} = true)`.mapWith(Number),
      membresEnAttente: sql<number>`COUNT(*) FILTER (WHERE ${membresTontine.aRecuBenefice} = false AND ${membresTontine.statut} = 'Actif')`.mapWith(Number)
    })
    .from(membresTontine)
    .where(eq(membresTontine.tontineId, tontineId));

  // Solde de la tontine
  const [tontine] = await db
    .select({ solde: tontines.solde })
    .from(tontines)
    .where(eq(tontines.id, tontineId));

  return {
    totalDistribue: distStats?.totalDistribue || 0,
    nombreDistributions: distStats?.nombreDistributions || 0,
    membresAyantRecu: membreStats?.membresAyantRecu || 0,
    membresEnAttente: membreStats?.membresEnAttente || 0,
    prochainTour: (distStats?.dernierTour || 0) + 1,
    soldeDisponible: Number(tontine?.solde || 0)
  };
}
