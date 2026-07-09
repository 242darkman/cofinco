import { tontines, membresTontine, contributionsTontine, clients, users, userAgences, agences, tontinePenalites, tontinePlans } from "@shared/schema";
import { type Tontine, type InsertTontine, type MembreTontine, type InsertMembreTontine, type ContributionTontine, type InsertContributionTontine,
    type TontinePenalite, type InsertTontinePenalite,
    type TontinePlan, type InsertTontinePlan,
    operationsCaisse,
    tontineCycles, tontineTurns, tontineSchedules, tontineDistributionRequests, tontineTurnAudit,
 } from "@shared/schema";
import { db } from "../db";
import { eq, desc, asc, and, sql, getTableColumns, or, isNull } from "drizzle-orm";

import { executeWithLedger, updateTontineSolde, updateSessionSolde, validateUserId } from "../services/ledger";
import { createFactureForContributionTontine } from "./finance";
import {
  StatutCompte,
  StatutMembreTontine,
  StatutTransaction,
  MethodePaiement,
  METHODE_PAIEMENT_LABELS,
} from "@shared/enum/status-constants";
import { DistributionType } from "@shared/schema/tontines";


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
  const result = await db.update(tontinePlans).set({ actif: false, updatedAt: new Date() }).where(eq(tontinePlans.id, id)).returning();
  return result.length > 0;
}

/** Copy all config columns from a plan to use as tontine defaults */
export function copyPlanToTontineValues(plan: TontinePlan): Partial<InsertTontine> {
  return {
    nom: plan.nom,
    description: plan.description,
    montantCotisation: plan.montantCotisation,
    nombreMembres: plan.nombreMembres,
    frequence: plan.frequence,
    intervalleCotisation: plan.intervalleCotisation,
    distributionType: plan.distributionType,
    tauxPlateforme: plan.tauxPlateforme,
    planId: plan.id,

    // Calendar
    firstContributionRule: plan.firstContributionRule,
    gracePeriodContribution: plan.gracePeriodContribution,
    collectionCalendarMode: plan.collectionCalendarMode,
    weekdaysMask: plan.weekdaysMask,
    shiftNonWorkingDay: plan.shiftNonWorkingDay,
    holidayCalendarId: plan.holidayCalendarId,
    timezone: plan.timezone,
    preferredWeekday: plan.preferredWeekday,

    // Distribution
    payoutFrequency: plan.payoutFrequency,
    payoutDayRule: plan.payoutDayRule,
    payoutOrderMode: plan.payoutOrderMode,
    allowSwapPayoutOrder: plan.allowSwapPayoutOrder,
    swapRequiresApproval: plan.swapRequiresApproval,
    payoutRequiresContribPaid: plan.payoutRequiresContribPaid,
    allowPartialDistribution: plan.allowPartialDistribution,
    distributionMinThresholdPct: plan.distributionMinThresholdPct,

    // Penalties
    penaltyEnabled: plan.penaltyEnabled,
    penaltyType: plan.penaltyType,
    penaltyValue: plan.penaltyValue,
    penaltyApplication: plan.penaltyApplication,
    penaltyCap: plan.penaltyCap,
    lateGracePeriodDays: plan.lateGracePeriodDays,
    maxMissedContributions: plan.maxMissedContributions,
    arrearsPolicy: plan.arrearsPolicy,
    suspensionPolicy: plan.suspensionPolicy,
    defaultPolicy: plan.defaultPolicy,
    maxLateBeforeSuspend: plan.maxLateBeforeSuspend,
    maxLateBeforeExclude: plan.maxLateBeforeExclude,
    penaltyDeductedFromPayout: plan.penaltyDeductedFromPayout,
    penaltyAsRevenue: plan.penaltyAsRevenue,
    autoPenaltyPriority: plan.autoPenaltyPriority,

    // Entry/Exit
    joinFeeEnabled: plan.joinFeeEnabled,
    joinFeeAmount: plan.joinFeeAmount,
    exitAllowed: plan.exitAllowed,
    exitFeePercent: plan.exitFeePercent,
    exitNoticePeriods: plan.exitNoticePeriods,
    replacementAllowed: plan.replacementAllowed,
    transferMembershipAllowed: plan.transferMembershipAllowed,
    allowMidCycleJoin: plan.allowMidCycleJoin,

    // Payment
    allowedPaymentMethods: plan.allowedPaymentMethods,
    defaultPaymentMethod: plan.defaultPaymentMethod,
    cashMustGoToCaisse: plan.cashMustGoToCaisse,
    feeCollectionMode: plan.feeCollectionMode,
    maxAdvanceTours: plan.maxAdvanceTours,

    // Governance
    rolesEnabled: plan.rolesEnabled,
    groupRoles: plan.groupRoles,
    approvalsRequiredFor: plan.approvalsRequiredFor,
    minKycLevel: plan.minKycLevel,
    minSegmentRequired: plan.minSegmentRequired,
  };
}

export async function getTontine(id: string): Promise<any | undefined> {
  const [result] = await db
    .select({
      ...getTableColumns(tontines),
      nombreMembresActuel: sql<number>`count(DISTINCT ${membresTontine.id})`.mapWith(Number),
      // Tour actuel = nombre de distributions complétées + 1 (tour en cours)
      // Si aucune distribution, on est au tour 1
      tourActuel: sql<number>`COALESCE(${tontines.currentRound}, 0) + 1`.mapWith(Number),
      // Somme réelle des contributions validées - utilise la colonne tontines.id pour la corrélation
      totalCollecte: sql<number>`COALESCE((
        SELECT SUM(CAST(ct.montant AS NUMERIC))
        FROM contributions_tontine ct
        WHERE ct.tontine_id = tontines.id
        AND ct.statut_transaction = 'POSTED'
      ), 0)`.mapWith(Number)
    })
    .from(tontines)
    .leftJoin(membresTontine, and(
      eq(tontines.id, membresTontine.tontineId),
      eq(membresTontine.statut, StatutMembreTontine.ACTIVE)
    ))
    .where(and(eq(tontines.id, id), isNull(tontines.deletedAt)))
    .groupBy(tontines.id);

  return result || undefined;
}

export async function getAllTontines(filter: { agenceId?: string; agence?: string } = {}): Promise<any[]> {
    const baseQuery = db
      .select({
        ...getTableColumns(tontines),
        nombreMembresActuel: sql<number>`count(DISTINCT ${membresTontine.id})`.mapWith(Number),
        // Tour actuel = dernier tour distribué + 1 (ou 1 si aucune distribution)
        tourActuel: sql<number>`COALESCE(${tontines.currentRound}, 0) + 1`.mapWith(Number),
        // Somme réelle des contributions validées - référence directe à la colonne
        totalCollecte: sql<number>`COALESCE((
          SELECT SUM(CAST(ct.montant AS NUMERIC))
          FROM contributions_tontine ct
          WHERE ct.tontine_id = tontines.id
          AND ct.statut_transaction = 'POSTED'
        ), 0)`.mapWith(Number)
      })
      .from(tontines)
      .leftJoin(membresTontine, and(
          eq(tontines.id, membresTontine.tontineId),
          eq(membresTontine.statut, StatutMembreTontine.ACTIVE)
      ))
        .groupBy(tontines.id)
      .orderBy(desc(tontines.createdAt));

    // Déterminer l'agenceId à utiliser
    let agenceIdToFilter: string | undefined;
    if (filter.agenceId) {
      agenceIdToFilter = filter.agenceId;
    } else if (filter.agence) {
      // Fallback: rechercher l'agenceId par nom
      const [agenceRecord] = await db.select({ id: agences.id })
        .from(agences)
        .where(eq(agences.nom, filter.agence))
        .limit(1);
      if (agenceRecord) {
        agenceIdToFilter = agenceRecord.id;
      }
    }

    if (agenceIdToFilter) {
      const results = await db
        .select({
            ...getTableColumns(tontines),
            nombreMembresActuel: sql<number>`count(DISTINCT ${membresTontine.id})`.mapWith(Number),
            tourActuel: sql<number>`COALESCE(${tontines.currentRound}, 0) + 1`.mapWith(Number),
            totalCollecte: sql<number>`COALESCE((
              SELECT SUM(CAST(ct.montant AS NUMERIC))
              FROM contributions_tontine ct
              WHERE ct.tontine_id = tontines.id
              AND ct.statut_transaction = 'POSTED'
            ), 0)`.mapWith(Number)
        })
        .from(tontines)
        .leftJoin(membresTontine, and(
            eq(tontines.id, membresTontine.tontineId),
            eq(membresTontine.statut, StatutMembreTontine.ACTIVE)
        ))
            .leftJoin(users, eq(tontines.gestionnaireId, users.id))
        .leftJoin(userAgences, and(
          eq(userAgences.userId, users.id),
          eq(userAgences.isPrimary, true),
          eq(userAgences.actif, true)
        ))
        .where(and(eq(userAgences.agenceId, agenceIdToFilter), isNull(tontines.deletedAt)))
        .groupBy(tontines.id)
        .orderBy(desc(tontines.createdAt));

      return results;
    }

  const results = await baseQuery.where(isNull(tontines.deletedAt));
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
  // Soft-archive all dependencies (preserve financial history)
  await db.update(membresTontine).set({ statut: "REMOVED" }).where(eq(membresTontine.tontineId, id));

  // Soft delete the tontine itself (has deletedAt column)
  const result = await db.update(tontines).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(tontines.id, id)).returning();
  return result.length > 0;
}

// Membres Tontine
export async function getMembresTontine(tontineId: string): Promise<any[]> {
  // Get tontine info for calculating remaining payments
  const [tontineInfo] = await db
    .select({
      montantCotisation: tontines.montantCotisation,
      nombreMembres: tontines.nombreMembres,
      tourActuel: sql<number>`COALESCE(${tontines.currentRound}, 0) + 1`.mapWith(Number)
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
        AND ct.statut_transaction = 'POSTED'
      )`.mapWith(Number),
      // Calculer le total cotisé directement depuis les contributions (plus fiable)
      totalCotiseCalcule: sql<number>`COALESCE((
        SELECT SUM(CAST(ct.montant AS NUMERIC))
        FROM contributions_tontine ct
        WHERE ct.tontine_id = membres_tontine.tontine_id
        AND ct.client_id = membres_tontine.client_id
        AND ct.statut_transaction = 'POSTED'
      ), 0)`.mapWith(Number)
    })
    .from(membresTontine)
    .innerJoin(clients, eq(membresTontine.clientId, clients.id))
    .where(and(eq(membresTontine.tontineId, tontineId), isNull(membresTontine.deletedAt)));

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
      lateCount: membresTontine.lateCount,
      createdAt: membresTontine.createdAt,
      tontine: tontines
    })
    .from(membresTontine)
    .innerJoin(tontines, eq(membresTontine.tontineId, tontines.id))
    .where(and(
      eq(membresTontine.clientId, clientId),
      eq(membresTontine.statut, StatutMembreTontine.ACTIVE),
      isNull(membresTontine.deletedAt)
    ));
  return result as Array<MembreTontine & { tontine: Tontine }>;
}

export async function getMembreTontineByClientAndTontine(clientId: string, tontineId: string): Promise<MembreTontine | undefined> {
  const [membre] = await db.select().from(membresTontine)
    .where(and(
      eq(membresTontine.clientId, clientId),
      eq(membresTontine.tontineId, tontineId),
      isNull(membresTontine.deletedAt)
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
    .leftJoin(membresTontine, eq(contributionsTontine.membreId, membresTontine.id))
    .where(eq(contributionsTontine.tontineId, tontineId))
    .orderBy(desc(contributionsTontine.createdAt));

  // If direct clientId join returned null, fetch client via membre's clientId
  const membreClientIds = rows
    .filter(r => !r.clients && r.membres_tontine?.clientId)
    .map(r => r.membres_tontine!.clientId);

  let membreClientsMap: Record<string, typeof rows[0]['clients']> = {};
  if (membreClientIds.length > 0) {
    const { inArray } = await import('drizzle-orm');
    const membreClients = await db.select().from(clients).where(inArray(clients.id, membreClientIds));
    for (const c of membreClients) {
      membreClientsMap[c.id] = c;
    }
  }

  return rows.map(({ contributions_tontine, clients: directClient, membres_tontine: membre }) => {
    const methodePaiement = contributions_tontine.methodePaiement;
    const mode = METHODE_PAIEMENT_LABELS[methodePaiement as keyof typeof METHODE_PAIEMENT_LABELS] || METHODE_PAIEMENT_LABELS.CASH;

    // Resolve client: direct join first, then via membre's clientId
    const client = directClient || (membre?.clientId ? membreClientsMap[membre.clientId] : null);

    return {
      ...contributions_tontine,
      client,
      date_contribution: contributions_tontine.createdAt,
      mode_paiement: mode,
      statut: contributions_tontine.statutTransaction,
      tour_numero: contributions_tontine.tourNumero || 1,
      methode_paiement: contributions_tontine.methodePaiement,
      statut_transaction: contributions_tontine.statutTransaction
    };
  });
}

export async function getContributionsByMembre(membreId: string): Promise<ContributionTontine[]> {
  return db.select().from(contributionsTontine).where(eq(contributionsTontine.membreId, membreId)).orderBy(desc(contributionsTontine.createdAt));
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
  const isCash = data.methodePaiement === MethodePaiement.CASH;

  // If Cash, session is mandatory
  if (isCash && !sessionCaisseId) {
    throw new Error("Une session de caisse active est requise pour les paiements en espèces");
  }

  // Get tontine for agenceId (required for GL posting)
  const [tontine] = await db.select({ agenceId: tontines.agenceId }).from(tontines).where(eq(tontines.id, data.tontineId));

  return await executeWithLedger(
    "TONTINE",
    {
      montant: data.montant.toString(),
      sens: "CREDIT",
      sourceModule: "TONTINE",
      tontineId: data.tontineId,
      agenceId: tontine?.agenceId || undefined,
      sessionCaisseId: isCash ? sessionCaisseId : undefined,
      typePaiement: "Versement Tontine",
      methodePaiement: data.methodePaiement,
      referenceExterne: data.reference,
      idempotencyKey: data.idempotencyKey || undefined,
      description: `Versement Tontine (Tour ${data.tourNumero})`,
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
            typeOperation: "ADJUSTMENT" as any,
            montant: data.montant.toString(),
            methodePaiement: MethodePaiement.CASH,
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
  ).then(async ({ result: contribution }) => { // Renamed result to contribution for clarity
    // Generate receipt for the contribution
    const [tontine] = await db.select().from(tontines).where(eq(tontines.id, data.tontineId));
    
    let facture;
    if (contribution.clientId) {
      facture = await createFactureForContributionTontine({
        tontineId: contribution.tontineId,
        nomTontine: tontine?.nom || 'Tontine',
        clientId: contribution.clientId,
        montant: contribution.montant.toString(),
        tourNumero: contribution.tourNumero || 1,
        agentId: userId,
        sessionCaisseId: sessionCaisseId,
      });
    }
    
    return { contribution, facture };
  }).then(({ contribution }) => contribution); // Keep original return type for compatibility
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

export async function createTontinePenalite(data: InsertTontinePenalite): Promise<TontinePenalite> {
  const [penalite] = await db.insert(tontinePenalites).values(data).returning();
  return penalite;
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
    .select({ distributionType: tontines.distributionType })
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
      eq(membresTontine.statut, StatutMembreTontine.ACTIVE),
      eq(membresTontine.aRecuBenefice, false)
    ))
    .orderBy(membresTontine.position);

  if (eligibles.length === 0) return null;

  let selected;
  if (tontine.distributionType === DistributionType.ROTATIVE_SUSU || tontine.distributionType === DistributionType.ACCUMULATIVE_END) {
    // Premier membre selon la position
    selected = eligibles[0];
  } else {
    // Attribution aléatoire (crypto-secure pour fairness)
    const { randomInt } = require('crypto');
    const randomIndex = randomInt(0, eligibles.length);
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
  // Get eligible members with user data for nom/prenom
  const eligibles = await db
    .select({
      membre: membresTontine,
      client: clients,
      clientUserNom: sql<string>`client_users.nom`.as('client_user_nom'),
      clientUserPrenom: sql<string>`client_users.prenom`.as('client_user_prenom'),
    })
    .from(membresTontine)
    .innerJoin(clients, eq(membresTontine.clientId, clients.id))
    .leftJoin(sql`users as client_users`, sql`client_users.id = ${clients.userId}`)
    .where(and(
      eq(membresTontine.tontineId, tontineId),
      eq(membresTontine.statut, StatutMembreTontine.ACTIVE),
      eq(membresTontine.aRecuBenefice, false)
    ));

  if (eligibles.length === 0) return null;

  // Random selection (crypto-secure pour fairness)
  const { randomInt } = require('crypto');
  const randomIndex = randomInt(0, eligibles.length);
  const selected = eligibles[randomIndex];

  // Get current tour number
  const [tontineInfo] = await db
    .select({
      ordreDistribution: tontines.ordreDistribution,
      tourActuel: sql<number>`COALESCE(${tontines.currentRound}, 0) + 1`.mapWith(Number)
    })
    .from(tontines)
    .where(eq(tontines.id, tontineId));

  // Update ordre_distribution to track the draw
  // Use nom from users table (via client_users join)
  const clientNom = selected.clientUserNom || 'Client';
  const currentOrdre = (tontineInfo?.ordreDistribution as any[]) || [];
  const newOrdre = [
    ...currentOrdre,
    {
      tour: tontineInfo?.tourActuel || 1,
      membreId: selected.membre.id,
      clientNom: clientNom,
      dateTirage: new Date().toISOString()
    }
  ];

  await db.update(tontines)
    .set({ ordreDistribution: newOrdre, updatedAt: new Date() })
    .where(eq(tontines.id, tontineId));

  return {
    ...selected.membre,
    client: {
      ...selected.client,
      nom: selected.clientUserNom,
      prenom: selected.clientUserPrenom,
    },
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
      eq(membresTontine.statut, StatutMembreTontine.ACTIVE),
      eq(membresTontine.aRecuBenefice, false)
    ))
    .orderBy(membresTontine.position);

  return eligibles.map(e => ({
    ...e.membre,
    client: e.client
  }));
}

// Distributions are now managed via tontineTurns + tontineDistributionRequests
// See tontine-production-service.ts for distribution workflows

// ============================================================================
// CYCLES
// ============================================================================

export async function getCyclesByTontine(tontineId: string): Promise<any[]> {
  return db
    .select()
    .from(tontineCycles)
    .where(eq(tontineCycles.tontineId, tontineId))
    .orderBy(desc(tontineCycles.cycleNumber));
}

export async function getCycle(tontineId: string, cycleId: string): Promise<any | undefined> {
  const [cycle] = await db
    .select()
    .from(tontineCycles)
    .where(and(eq(tontineCycles.tontineId, tontineId), eq(tontineCycles.id, cycleId)))
    .limit(1);
  return cycle || undefined;
}

export async function getCycleById(cycleId: string): Promise<any | undefined> {
  const [cycle] = await db
    .select()
    .from(tontineCycles)
    .where(eq(tontineCycles.id, cycleId))
    .limit(1);
  return cycle || undefined;
}

export async function getActiveCycle(tontineId: string): Promise<any | undefined> {
  const [cycle] = await db
    .select()
    .from(tontineCycles)
    .where(and(eq(tontineCycles.tontineId, tontineId), eq(tontineCycles.status, "OPEN")))
    .orderBy(desc(tontineCycles.cycleNumber))
    .limit(1);
  return cycle || undefined;
}

export async function closeCycle(tontineId: string, cycleId: string, userId: string): Promise<any> {
  const [updated] = await db
    .update(tontineCycles)
    .set({
      status: "CLOSED",
      closedAt: new Date(),
      closedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(tontineCycles.tontineId, tontineId), eq(tontineCycles.id, cycleId)))
    .returning();
  return updated;
}

// ============================================================================
// TURNS
// ============================================================================

export async function getTurnsByCycle(tontineId: string, cycleId: string): Promise<any[]> {
  return db
    .select()
    .from(tontineTurns)
    .where(and(eq(tontineTurns.tontineId, tontineId), eq(tontineTurns.cycleId, cycleId)))
    .orderBy(asc(tontineTurns.turnNumber));
}

export async function getNextScheduledTurn(cycleId: string): Promise<any | undefined> {
  const [turn] = await db
    .select()
    .from(tontineTurns)
    .where(and(eq(tontineTurns.cycleId, cycleId), eq(tontineTurns.status, "SCHEDULED")))
    .orderBy(asc(tontineTurns.turnNumber))
    .limit(1);
  return turn || undefined;
}

// ============================================================================
// SCHEDULES
// ============================================================================

export async function getSchedulesByCycle(tontineId: string, cycleId: string): Promise<any[]> {
  return db
    .select()
    .from(tontineSchedules)
    .where(and(eq(tontineSchedules.tontineId, tontineId), eq(tontineSchedules.cycleId, cycleId)))
    .orderBy(asc(tontineSchedules.periodNumber));
}

// ============================================================================
// TURN AUDIT
// ============================================================================

export async function getTurnAuditByCycle(tontineId: string, cycleId: string): Promise<any[]> {
  return db
    .select()
    .from(tontineTurnAudit)
    .where(and(eq(tontineTurnAudit.tontineId, tontineId), eq(tontineTurnAudit.cycleId, cycleId)))
    .orderBy(desc(tontineTurnAudit.changedAt));
}

// ============================================================================
// DISTRIBUTION REQUESTS
// ============================================================================

export async function getDistributionRequests(tontineId: string, filters?: { cycleId?: string; status?: string }): Promise<any[]> {
  const requests = await db
    .select()
    .from(tontineDistributionRequests)
    .where(eq(tontineDistributionRequests.tontineId, tontineId))
    .orderBy(desc(tontineDistributionRequests.createdAt));

  let filtered = requests;
  if (filters?.cycleId) filtered = filtered.filter((r: any) => r.cycleId === filters.cycleId);
  if (filters?.status) filtered = filtered.filter((r: any) => r.status === filters.status);
  return filtered;
}

export async function getDistributionRequest(requestId: string): Promise<any | undefined> {
  const [req] = await db
    .select()
    .from(tontineDistributionRequests)
    .where(eq(tontineDistributionRequests.id, requestId))
    .limit(1);
  return req || undefined;
}

export async function cancelDistributionRequest(requestId: string, reason?: string): Promise<any> {
  const [updated] = await db
    .update(tontineDistributionRequests)
    .set({
      status: "CANCELLED",
      rejectionReason: reason || "Annulé",
      updatedAt: new Date(),
    })
    .where(eq(tontineDistributionRequests.id, requestId))
    .returning();
  return updated;
}

export async function getPendingDistributionCount(tontineId: string): Promise<number> {
  const pending = await db
    .select()
    .from(tontineDistributionRequests)
    .where(and(
      eq(tontineDistributionRequests.tontineId, tontineId),
      eq(tontineDistributionRequests.status, "SUBMITTED"),
    ));
  return pending.length;
}

// ============================================================================
// MEMBER LOOKUP BY ID
// ============================================================================

export async function getMembreTontineById(membreId: string): Promise<MembreTontine | undefined> {
  const [membre] = await db.select().from(membresTontine).where(eq(membresTontine.id, membreId)).limit(1);
  return membre || undefined;
}
