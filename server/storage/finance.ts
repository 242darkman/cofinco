import {
    credits, demandesCredit, enquetesCredit, remboursements,
    comptes, transactionsCompte, plansEpargne, objectifsEpargne,
    sessionsCaisse, operationsCaisse, caisseSecurityCodes, caisseCodeUsages, comptageBillets,
    factures, lignesFactures, modelesFactures, caisses, clients, agences, caisseAssignations, users,
    dureesSuggerees, mouvementsFinanciers, evenementsOutbox, coffresForts, produitsCompte
  } from "@shared/schema";

// State Machine Guards for Credit & Demande Workflow
import {
  validateCreditTransition,
  CreditTransitionError,
  normalizeCreditStatus,
} from "@shared/machines/credit-workflow";
import {
  validateDemandeTransition,
  DemandeTransitionError,
  normalizeDemandeStatus,
} from "@shared/machines/demande-workflow";
import {
  StatutCompte,
  StatutCredit,
  StatutDemande,
  FrequenceRemboursement,
  TypeCompte,
  DureeUnite,
  MethodePaiement,
  TypeOperationCaisse,
  StatutCaisseAgent,
  StatutTransaction,
  TypeTransactionEpargne,
  StatutFacture,
  TypeDocument,
} from "@shared/enum/status-constants";

// ============================================================================
// ERREUR TYPÉE : SOLDE INSUFFISANT POUR DÉCAISSEMENT
// ============================================================================

export interface InsufficientFundsErrorData {
  code: "INSUFFICIENT_FUNDS";
  message: string;
  required: number;
  current: number;
  deficit: number;
  coffreId: string;
  coffreCode: string;
  coffreName?: string;
}

export class DecaissementInsufficientFundsError extends Error {
  public readonly code = "INSUFFICIENT_FUNDS" as const;
  public readonly httpStatus = 400;
  public readonly data: InsufficientFundsErrorData;

  constructor(
    required: number,
    current: number,
    coffreId: string,
    coffreCode: string,
    coffreName?: string
  ) {
    const deficit = required - current;
    const message = `Solde du coffre insuffisant pour cette opération`;
    super(message);
    this.name = "DecaissementInsufficientFundsError";
    this.data = {
      code: "INSUFFICIENT_FUNDS",
      message,
      required,
      current,
      deficit,
      coffreId,
      coffreCode,
      coffreName,
    };
  }
}
  import {
    type Credit, type InsertCredit, type DemandeCredit, type InsertDemandeCredit,
    type EnqueteCredit, type InsertEnqueteCredit, type Remboursement, type InsertRemboursement,
    type Compte, type InsertCompte, type TransactionCompte, type InsertTransactionCompte,
    type PlanEpargne, type InsertPlanEpargne, type ObjectifEpargne, type InsertObjectifEpargne,
    type SessionCaisse, type InsertSessionCaisse, type OperationCaisse, type InsertOperationCaisse,
    type ComptageBillets, type InsertComptageBillets,
    type Facture, type InsertFacture, type LigneFacture, type InsertLigneFacture,
    type ModeleFacture, type InsertModeleFacture, type Caisse, type InsertCaisse,
    caisseTransferts, type CaisseTransfert, type InsertCaisseTransfert,
    type Agence, type CaisseAssignation,
    type DureeSuggeree, type InsertDureeSuggeree,
    creditPlans, type UserCreditPlan, type InsertCreditPlan, insertCreditPlanSchema,
    creditRefundRequests, type CreditRefundRequest, type InsertCreditRefundRequest
  } from "@shared/schema";
  import { db } from "../db";
import { eq, desc, and, or, gte, lte, lt, gt, count, inArray, sql, getTableColumns, aliasedTable, isNull, isNotNull } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { computeSessionStatus } from "../services/caisse/session-status";


  

  /**
   * Enrich credit data with calculated fields (installments, delays, etc.)
   */
  export function enrichCreditData(credit: Credit, client?: any): any {
    let jours_retard = 0;
    let nombre_echeances_payees = 0;

    // Calcul basé sur le soldeRestant stocké (cohérent avec le frontend)
    const principal = Number(credit.montant) || 0;
    const taux = Number(credit.taux) || 0;
    const totalEcheances = credit.duree || 1;
    const totalWithInterest = principal * (1 + taux / 100);
    const installmentAmount = totalWithInterest / totalEcheances;

    // Utiliser soldeRestant comme source de vérité (comme le frontend)
    const soldeRestant = Number(credit.soldeRestant) || totalWithInterest;
    const totalPaid = Math.max(0, totalWithInterest - soldeRestant);

    // Nombre d'échéances complètement payées = montant total payé / montant échéance
    if (installmentAmount > 0) {
      nombre_echeances_payees = Math.floor(totalPaid / installmentAmount);
    }

    // Calcul du retard uniquement pour les crédits actifs non soldés
    // Calcul du retard uniquement pour les crédits actifs non soldés
    if (credit.dateDebut && [StatutCredit.ACTIVE, StatutCredit.LATE].includes(credit.statut as any)) {
        // Normaliser les dates à minuit pour éviter les problèmes de timezone
        const start = new Date(credit.dateDebut);
        start.setHours(0, 0, 0, 0);

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        // Convertir la fréquence en jours
        let frequencyDays = 30; // Par défaut Mensuel
        switch (credit.echeance) {
          case FrequenceRemboursement.DAILY:
            frequencyDays = 1; break;
          case FrequenceRemboursement.WEEKLY:
            frequencyDays = 7; break;
          case FrequenceRemboursement.BI_MONTHLY:
            frequencyDays = 60; break;
          case FrequenceRemboursement.QUARTERLY:
            frequencyDays = 90; break;
        }

        // Si crédit totalement remboursé, pas de retard
        if (totalPaid >= totalWithInterest - 0.01 || nombre_echeances_payees >= totalEcheances) {
          jours_retard = 0;
        } else {
          // La prochaine échéance due est celle après les échéances déjà payées
          const nextInstallmentNumber = nombre_echeances_payees + 1;

          // Calcul de la date de la prochaine échéance
          const nextDueDate = new Date(start);
          nextDueDate.setDate(nextDueDate.getDate() + (nextInstallmentNumber * frequencyDays));

          // Retard = nombre de jours depuis que l'échéance est passée
          if (now > nextDueDate) {
            const diffTime = now.getTime() - nextDueDate.getTime();
            jours_retard = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          }
        }
    }


    // Calcul de la prochaine échéance si manquante
    let prochaine_echeance_calc = credit.prochaineEcheance;
    if (!prochaine_echeance_calc && credit.dateDebut && [StatutCredit.ACTIVE, StatutCredit.LATE].includes(credit.statut as any)) {
        const start = new Date(credit.dateDebut);
        start.setHours(0, 0, 0, 0);

        let frequencyDays = 30;
        switch (credit.echeance) {
          case FrequenceRemboursement.DAILY:
            frequencyDays = 1; break;
          case FrequenceRemboursement.WEEKLY:
            frequencyDays = 7; break;
          case FrequenceRemboursement.BI_MONTHLY:
            frequencyDays = 60; break;
          case FrequenceRemboursement.QUARTERLY:
            frequencyDays = 90; break;
        }

        const nextInstallmentNumber = nombre_echeances_payees + 1;
        const nextDueDate = new Date(start);
        nextDueDate.setDate(nextDueDate.getDate() + (nextInstallmentNumber * frequencyDays));
        prochaine_echeance_calc = nextDueDate;
    }

    return {
      ...credit,
      numero_credit: credit.numeroCredit,
      montant_principal: principal,
      nombre_echeances_total: totalEcheances,
      nombre_echeances_payees,
      jours_retard,
      prochaineEcheance: prochaine_echeance_calc,
      montantEcheance: credit.montantEcheance || installmentAmount.toString(),
      clients: client ? {
        nom: client.nom,
        prenom: client.prenom,
        telephone: client.telephone,
        photoProfile: client.photoProfile
      } : undefined
    };
  }

  // Credits
  export async function getCredit(id: string): Promise<Credit & { fraisDossierPaye?: boolean } | undefined> {
    const [result] = await db.select({
      credit: credits,
      demande: demandesCredit
    })
    .from(credits)
    .leftJoin(demandesCredit, eq(credits.demandeId, demandesCredit.id))
    .where(eq(credits.id, id));

    if (!result) return undefined;

    return {
      ...enrichCreditData(result.credit),
      fraisDossierPaye: result.demande?.fraisEngagementPayes || false
    };
  }
  
  export async function getCreditsByClient(clientId: string): Promise<Credit[]> {
    const results = await db.select().from(credits).where(eq(credits.clientId, clientId)).orderBy(desc(credits.createdAt));
    return results.map(credit => enrichCreditData(credit));
  }
  
  export async function getAllCredits(filter: { agence?: string, clientId?: string } = {}): Promise<Credit[]> {
    const conditions = [];

    if (filter.agence && filter.agence !== "all") {
      conditions.push(eq(clients.agenceId, filter.agence));
    }

    if (filter.clientId) {
      conditions.push(eq(credits.clientId, filter.clientId));
    }
    
    let baseQuery = db.select({
      credit: credits,
      client: clients,
      user: users
    })
    .from(credits)
    .leftJoin(clients, eq(credits.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .$dynamic();
    
    if (conditions.length > 0) {
      baseQuery = baseQuery.where(and(...conditions));
    }
    
    const results = await baseQuery.orderBy(desc(credits.createdAt));
    return results.map(({ credit, client, user }) => enrichCreditData(credit, { ...client, nom: user?.nom, prenom: user?.prenom, telephone: user?.telephone, photoProfile: user?.photoProfile }));
  }
  
  export async function createCredit(insertCredit: InsertCredit): Promise<Credit> {
    const [credit] = await db.insert(credits).values(insertCredit).returning();
    return credit;
  }
  
  export async function updateCredit(id: string, updateData: Partial<InsertCredit>): Promise<Credit | undefined> {
    // State Machine Guard: Validate status transition if statut is being updated
    if (updateData.statut) {
      const [currentCredit] = await db.select({ statut: credits.statut }).from(credits).where(eq(credits.id, id));
      if (currentCredit) {
        // validateCreditTransition throws CreditTransitionError if invalid
        validateCreditTransition(currentCredit.statut, updateData.statut);
      }
    }

    const [credit] = await db.update(credits).set({ ...updateData, updatedAt: new Date() }).where(eq(credits.id, id)).returning();
    return credit || undefined;
  }

  // Credit Plans
  export async function getAllCreditPlans(filter: { actif?: boolean, agenceId?: string } = {}): Promise<UserCreditPlan[]> {
    const conditions = [];
    if (filter.actif !== undefined) conditions.push(eq(creditPlans.actif, filter.actif));
    if (filter.agenceId) conditions.push(eq(creditPlans.agenceId, filter.agenceId));
    
    return db.select().from(creditPlans)
      .where(and(...conditions))
      .orderBy(desc(creditPlans.createdAt));
  }

  export async function getCreditPlan(id: string): Promise<UserCreditPlan | undefined> {
    const [plan] = await db.select().from(creditPlans).where(eq(creditPlans.id, id));
    return plan;
  }

  export async function createCreditPlan(plan: InsertCreditPlan): Promise<UserCreditPlan> {
    const [newPlan] = await db.insert(creditPlans).values(plan).returning();
    return newPlan;
  }

  export async function updateCreditPlan(id: string, plan: Partial<InsertCreditPlan>): Promise<UserCreditPlan | undefined> {
    const [updated] = await db.update(creditPlans).set(plan).where(eq(creditPlans.id, id)).returning();
    return updated;
  }

  export async function deleteCreditPlan(id: string): Promise<boolean> {
    const result = await db.delete(creditPlans).where(eq(creditPlans.id, id)).returning();
    return result.length > 0;
  }
  
  // Demandes Credit
  export async function getDemandeCredit(id: string, includeDeleted = false): Promise<DemandeCredit | undefined> {
    const conditions = [eq(demandesCredit.id, id)];
    if (!includeDeleted) {
      conditions.push(sql`${demandesCredit.deletedAt} IS NULL`);
    }
    const [demande] = await db.select().from(demandesCredit).where(and(...conditions));
    return demande || undefined;
  }
  
  export async function getDemandesByClient(clientId: string): Promise<DemandeCredit[]> {
    return db.select().from(demandesCredit)
      .where(and(eq(demandesCredit.clientId, clientId), sql`${demandesCredit.deletedAt} IS NULL`))
      .orderBy(desc(demandesCredit.createdAt));
  }
  
  export async function getAllDemandes(filter: { agence?: string, includeDeleted?: boolean } = {}): Promise<DemandeCredit[]> {
    const conditions = [];

    if (!filter.includeDeleted) {
        conditions.push(sql`${demandesCredit.deletedAt} IS NULL`);
    }

    if (filter.agence && filter.agence !== "all") {
      conditions.push(eq(clients.agenceId, filter.agence));
    }
    
    let baseQuery = db.select({
      demande: demandesCredit,
      client: clients,
      user: users,
      agence: agences
    })
    .from(demandesCredit)
    .leftJoin(clients, eq(demandesCredit.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .leftJoin(agences, eq(clients.agenceId, agences.id))
    .$dynamic();

    if (conditions.length > 0) {
      baseQuery = baseQuery.where(and(...conditions));
    }
    
    const results = await baseQuery.orderBy(desc(demandesCredit.createdAt));

    return results.map(({ demande, client, user, agence }) => ({
      ...demande,
      numeroDemande: demande.numeroDemande,
      montantDemande: Number(demande.montantDemande),
      clients: client ? {
        nom: user?.nom,
        prenom: user?.prenom,
        telephone: user?.telephone,
        photoProfile: user?.photoProfile,
        agence: agence?.nom,
        agenceId: client.agenceId
      } : undefined
    }));
  }
  
  export async function createDemandeCredit(insertDemande: InsertDemandeCredit): Promise<DemandeCredit> {
    // Import dynamique pour éviter les dépendances circulaires
    const { calculerScoreMicrofinance, mettreAJourScoreClient } = await import('../services/microfinance-scoring');

    // Calculer automatiquement le score de crédit
    let scoreCredit: number | null = null;
    try {
      // Convertir la durée en mois selon l'unité
      let dureeMois = insertDemande.dureeValeur || 1;
      if (insertDemande.dureeUnite === DureeUnite.DAY) {
        dureeMois = Math.ceil(dureeMois / 30);
      } else if (insertDemande.dureeUnite === DureeUnite.WEEK) {
        dureeMois = Math.ceil(dureeMois / 4);
      }

      const scoringResult = await calculerScoreMicrofinance({
        clientId: insertDemande.clientId,
        montantDemande: parseFloat(insertDemande.montantDemande?.toString() || '0'),
        dureeMois,
        revenuMensuel: insertDemande.revenusMensuels ? parseFloat(insertDemande.revenusMensuels.toString()) : undefined,
        chargesMensuelles: insertDemande.chargesMensuelles ? parseFloat(insertDemande.chargesMensuelles.toString()) : undefined
      });

      scoreCredit = scoringResult.score;

      // Mettre à jour le score du client également
      await mettreAJourScoreClient(insertDemande.clientId).catch(console.error);
    } catch (error) {
      console.error('Erreur calcul score crédit:', error);
      // Continuer sans score en cas d'erreur
    }

    // Forcer le statut "PENDING_FEES" - les frais d'engagement sont obligatoires avant toute enquête
    const demandeAvecStatut = {
      ...insertDemande,
      statut: StatutDemande.PENDING_FEES as any, // Toujours "PENDING_FEES" à la création
      fraisEngagementPayes: false,
      scoreCredit: scoreCredit ?? insertDemande.scoreCredit ?? null
    };
    const [demande] = await db.insert(demandesCredit).values(demandeAvecStatut).returning();
    return demande;
  }
  
  export async function updateDemandeCredit(id: string, updateData: Partial<InsertDemandeCredit>, tx?: PgTransaction<any, any, any>): Promise<DemandeCredit | undefined> {
    // State Machine Guard: Validate status transition if statut is being updated
    if (updateData.statut) {
      const [currentDemande] = await (tx || db).select({ statut: demandesCredit.statut }).from(demandesCredit).where(eq(demandesCredit.id, id));
      if (currentDemande && currentDemande.statut) {
        // validateDemandeTransition throws DemandeTransitionError if invalid
        validateDemandeTransition(currentDemande.statut, updateData.statut);
      }
    }

    const [demande] = await (tx || db).update(demandesCredit).set(updateData).where(eq(demandesCredit.id, id)).returning();
    return demande || undefined;
  }

  export async function deleteDemandeCredit(id: string): Promise<boolean> {
    const [demande] = await db.update(demandesCredit)
      .set({ 
        deletedAt: new Date(),
        statut: StatutDemande.DELETED 
      })
      .where(eq(demandesCredit.id, id))
      .returning();
    return !!demande;
  }

  export async function cancelDemandeCredit(id: string, motif?: string): Promise<DemandeCredit | undefined> {
    // State Machine Guard: Validate transition to 'CANCELLED'
    const [currentDemande] = await db.select({ statut: demandesCredit.statut }).from(demandesCredit).where(eq(demandesCredit.id, id));
    if (currentDemande && currentDemande.statut) {
      // validateDemandeTransition throws DemandeTransitionError if invalid
      validateDemandeTransition(currentDemande.statut, StatutDemande.CANCELLED);
    }

    const [demande] = await db.update(demandesCredit)
      .set({
        statut: StatutDemande.CANCELLED as any,
        motifRejet: motif // On utilise motifRejet pour stocker la raison de l'annulation
      })
      .where(eq(demandesCredit.id, id))
      .returning();
    return demande || undefined;
  }
  
  // Enquêtes
  export async function getEnqueteCredit(id: string): Promise<EnqueteCredit | undefined> {
    const [enquete] = await db.select().from(enquetesCredit).where(eq(enquetesCredit.id, id));
    return enquete || undefined;
  }

  export async function getEnqueteByDemandeId(demandeId: string): Promise<EnqueteCredit[]> {
    return db.select().from(enquetesCredit).where(eq(enquetesCredit.demandeId, demandeId)).orderBy(desc(enquetesCredit.createdAt));
  }
  
  export async function getEnquetesByClient(clientId: string): Promise<EnqueteCredit[]> {
    return db.select().from(enquetesCredit).where(eq(enquetesCredit.clientId, clientId)).orderBy(desc(enquetesCredit.createdAt));
  }
  
  export async function getAllEnquetes(): Promise<EnqueteCredit[]> {
    const results = await db.select({
      enquete: enquetesCredit,
      client: clients,
      user: users
    })
    .from(enquetesCredit)
    .leftJoin(clients, eq(enquetesCredit.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .orderBy(desc(enquetesCredit.createdAt));
    
    return results.map(({ enquete, client, user }) => ({
      ...enquete,
      montantDemande: Number(enquete.montantDemande),
      clients: client ? {
        nom: user?.nom,
        prenom: user?.prenom,
        telephone: user?.telephone,
        photoProfile: user?.photoProfile
      } : undefined
    }));
  }
  
  export async function createEnqueteCredit(insertEnquete: InsertEnqueteCredit): Promise<EnqueteCredit> {
    const [enquete] = await db.insert(enquetesCredit).values(insertEnquete).returning();
    return enquete;
  }
  
  export async function updateEnqueteCredit(id: string, updateData: Partial<InsertEnqueteCredit>): Promise<EnqueteCredit | undefined> {
    const [enquete] = await db.update(enquetesCredit).set(updateData).where(eq(enquetesCredit.id, id)).returning();
    return enquete || undefined;
  }
  
  // Remboursements
  export async function getRemboursement(id: string): Promise<Remboursement | undefined> {
    const [remboursement] = await db.select().from(remboursements).where(eq(remboursements.id, id));
    return remboursement || undefined;
  }
  
  export async function getRemboursementsByCredit(creditId: string): Promise<Remboursement[]> {
    return db.select().from(remboursements).where(eq(remboursements.creditId, creditId)).orderBy(desc(remboursements.dateRemboursement));
  }
  
  export async function createRemboursement(insertRemboursement: InsertRemboursement): Promise<Remboursement> {
    const [remboursement] = await db.insert(remboursements).values(insertRemboursement).returning();
    return remboursement;
  }

  

  /**
   * Enrich account data with aliases for frontend compatibility
   */
  export function enrichCompteData(compte: Compte): any {
    return {
      ...compte,
      // Snake case and generic aliases for frontend compatibility
      numero_compte: compte.numeroCompte,
      type_compte: compte.typeCompte,
      solde_courant: compte.soldeCourant,
      solde: Number(compte.soldeCourant) || 0, // Alias for frontend logic
      client_id: compte.clientId,
      agence_id: compte.agenceId,
      blocage_actif: compte.blocageActif,
      blocage_motif: compte.blocageMotif,
      created_at: compte.createdAt,
      date_ouverture: compte.createdAt, // Alias for frontend
    };
  }

  // Comptes
  export async function getCompte(id: string): Promise<Compte | undefined> {
    const [result] = await db
      .select({ compte: comptes, produit: produitsCompte })
      .from(comptes)
      .leftJoin(produitsCompte, eq(comptes.produitId, produitsCompte.id))
      .where(eq(comptes.id, id))
      .limit(1);

    if (!result?.compte) return undefined;

    const produitInfo = result.produit
      ? {
          id: result.produit.id,
          code: result.produit.code,
          nom: result.produit.nom,
          typeCompte: result.produit.typeCompte,
          tauxInteret: Number(result.produit.tauxInteret || 0),
          taux_interet: Number(result.produit.tauxInteret || 0),
        }
      : null;

    return {
      ...enrichCompteData(result.compte),
      produit: produitInfo,
      taux_interet: produitInfo?.tauxInteret ?? undefined,
    } as any;
  }
  
  export async function getComptesByClient(clientId: string): Promise<Compte[]> {
    const results = await db.select().from(comptes).where(eq(comptes.clientId, clientId));
    return results.map(c => enrichCompteData(c));
  }
  
  export async function getAllComptes(filter: { agence?: string } = {}): Promise<Compte[]> {
    if (filter.agence) {
      const results = await db.select({ compte: comptes })
        .from(comptes)
        .innerJoin(clients, eq(comptes.clientId, clients.id))
        .where(eq(clients.agenceId, filter.agence))
        .orderBy(desc(comptes.createdAt));
      return results.map(r => r.compte);
    }
    return db.select().from(comptes).orderBy(desc(comptes.createdAt));
  }

  /**
   * Get all comptes with client information, search, and pagination support
   * @param filter - Agency filter
   * @param options - Search and pagination options
   */
  export async function getAllComptesWithClients(
    filter: { agence?: string } = {},
    options: { search?: string; page?: number; limit?: number; typeCompte?: string; statut?: string } = {}
  ): Promise<{ data: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions: any[] = [];

    // Agency filter
    if (filter.agence && filter.agence !== 'all') {
      conditions.push(eq(clients.agenceId, filter.agence));
    }

    // Type filter
    if (options.typeCompte) {
      conditions.push(eq(comptes.typeCompte, options.typeCompte as any));
    }

    // Status filter
    if (options.statut) {
      conditions.push(eq(comptes.statut, options.statut as any));
    }

    // Search filter (by client name or account number)
    if (options.search && options.search.trim()) {
      const searchTerm = `%${options.search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          sql`LOWER(${users.nom}) LIKE ${searchTerm}`,
          sql`LOWER(${users.prenom}) LIKE ${searchTerm}`,
          sql`LOWER(${comptes.numeroCompte}) LIKE ${searchTerm}`,
          sql`LOWER(${users.telephone}) LIKE ${searchTerm}`
        )
      );
    }

    // Count total
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const countQuery = db.select({ count: count() })
      .from(comptes)
      .leftJoin(clients, eq(comptes.clientId, clients.id))
      .leftJoin(users, eq(clients.userId, users.id));
    
    const countResult = whereClause 
      ? await countQuery.where(whereClause)
      : await countQuery;
    
    const total = countResult[0]?.count || 0;

    // Fetch data with pagination
    let dataQuery = db.select({
      compte: comptes,
      client: clients,
      user: users,
      produit: produitsCompte,
      agence: agences,
    })
    .from(comptes)
    .leftJoin(clients, eq(comptes.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .leftJoin(produitsCompte, eq(comptes.produitId, produitsCompte.id))
    .leftJoin(agences, eq(clients.agenceId, agences.id))
    .orderBy(desc(comptes.createdAt))
    .limit(limit)
    .offset(offset);

    const results = whereClause 
      ? await dataQuery.where(whereClause)
      : await dataQuery;

    // Transform data with client info embedded
    const data = results.map(({ compte, client, user, produit, agence }) => {
      const produitInfo = produit
        ? {
            id: produit.id,
            code: produit.code,
            nom: produit.nom,
            typeCompte: produit.typeCompte,
            tauxInteret: Number(produit.tauxInteret || 0),
            taux_interet: Number(produit.tauxInteret || 0),
          }
        : null;

      return {
        ...enrichCompteData(compte),
        produit: produitInfo,
        taux_interet: produitInfo?.tauxInteret ?? undefined,
      // Embedded client info
      clients: client ? {
        id: client.id,
        nom: user?.nom,
        prenom: user?.prenom,
        telephone: user?.telephone,
        email: user?.email,
        agence: agence?.nom,
        photoProfile: user?.photoProfile
      } : null
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
  
  export async function createCompte(insertCompte: InsertCompte): Promise<Compte> {
    const [compte] = await db.insert(comptes).values(insertCompte).returning();
    return compte;
  }
  
  export async function updateCompte(id: string, updateData: Partial<InsertCompte>): Promise<Compte | undefined> {
    const [compte] = await db.update(comptes).set({ ...updateData, updatedAt: new Date() }).where(eq(comptes.id, id)).returning();
    return compte || undefined;
  }

  // Atomic Account Creation with Initial Transaction
  export async function createClientAccount(
    clientId: string,
    data: { typeCompte: string; soldeInitial: number; tauxInteret?: number; statut: string; methodePaiement?: string; agenceId?: string | null },
    userId: string | undefined
  ): Promise<Compte> {
    return await db.transaction(async (tx) => {
      // 1. Generate unique account number
      // Normaliser le type de compte vers l'Enum
      const typeCompteEnum = data.typeCompte === TypeCompte.CURRENT ? TypeCompte.CURRENT :
                              data.typeCompte === TypeCompte.SAVINGS ? TypeCompte.SAVINGS :
                              data.typeCompte === TypeCompte.BLOCKED ? TypeCompte.BLOCKED :
                              TypeCompte.SAVINGS; // Défaut: SAVINGS

      const prefix = typeCompteEnum === TypeCompte.CURRENT ? 'CC' : 'CE';
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const numeroCompte = `${prefix}-${timestamp}-${random}`;

      // 2. Create Account
      const [compte] = await tx.insert(comptes).values({
        clientId,
        agenceId: data.agenceId, // Add this line
        numeroCompte,
        typeCompte: typeCompteEnum,
        soldeCourant: data.soldeInitial.toString(),
        // tauxInteret: data.tauxInteret?.toString() || "0", // Removed from schema?
        statut: data.statut as any,
        // dateOuverture: new Date(), // CreatedAt is enough
      }).returning();

      // 3. Create Initial Transaction if needed
      if (data.soldeInitial > 0) {
        await tx.insert(transactionsCompte).values({
          compteId: compte.id,
          // typeTransaction removed as it does not exist in schema
          montant: data.soldeInitial.toString(),
          methodePaiement: (data.methodePaiement || MethodePaiement.CASH) as any,
          observations: 'Solde initial à la création',
          createdBy: userId,
          typePaiement: (typeCompteEnum === TypeCompte.CURRENT ? TypeOperationCaisse.DEPOSIT_CURRENT : TypeOperationCaisse.DEPOSIT_SAVINGS) as any,
        });
      }

      return compte;
    });
  }
  
  export async function updateClientAccount(
    id: string,
    updateData: { typeCompte?: string; tauxInteret?: string; statut?: string; solde?: string }
  ): Promise<Compte | undefined> {
    const [compte] = await db.update(comptes)
      .set({ ...updateData, updatedAt: new Date() } as any)
      .where(eq(comptes.id, id))
      .returning();
    return compte || undefined;
  }
  
  // Transactions Compte
  export async function getTransactionCompte(id: string): Promise<TransactionCompte | undefined> {
    const [transaction] = await db.select().from(transactionsCompte).where(eq(transactionsCompte.id, id));
    return transaction || undefined;
  }
  
  export async function getTransactionsByCompte(compteId: string): Promise<TransactionCompte[]> {
    return db.select().from(transactionsCompte).where(eq(transactionsCompte.compteId, compteId)).orderBy(desc(transactionsCompte.createdAt));
  }
  
  export async function createTransactionCompte(insertTransaction: InsertTransactionCompte, tx?: PgTransaction<any, any, any>): Promise<TransactionCompte> {
    const [transaction] = await (tx || db).insert(transactionsCompte).values(insertTransaction).returning();
    return transaction;
  }
  
  // Plans Epargne
  export async function getPlanEpargne(id: string): Promise<PlanEpargne | undefined> {
    const [plan] = await db.select().from(plansEpargne).where(eq(plansEpargne.id, id));
    return plan || undefined;
  }
  
  export async function getPlansByCredit(creditId: string): Promise<PlanEpargne[]> {
    return db.select().from(plansEpargne).where(eq(plansEpargne.creditId, creditId));
  }
  
  export async function getPlansByClient(clientId: string): Promise<PlanEpargne[]> {
    return db.select().from(plansEpargne).where(eq(plansEpargne.clientId, clientId)).orderBy(desc(plansEpargne.createdAt));
  }
  
  export async function createPlanEpargne(insertPlan: InsertPlanEpargne): Promise<PlanEpargne> {
    const [plan] = await db.insert(plansEpargne).values(insertPlan).returning();
    return plan;
  }
  
  // Objectifs Epargne
  export async function getObjectifEpargne(id: string): Promise<ObjectifEpargne | undefined> {
    const [objectif] = await db.select().from(objectifsEpargne).where(eq(objectifsEpargne.id, id));
    return objectif || undefined;
  }
  
  export async function getObjectifsByCompte(compteId: string): Promise<ObjectifEpargne[]> {
    return db.select().from(objectifsEpargne).where(eq(objectifsEpargne.compteId, compteId)).orderBy(desc(objectifsEpargne.createdAt));
  }
  
  export async function createObjectifEpargne(insertObjectif: InsertObjectifEpargne): Promise<ObjectifEpargne> {
    const [objectif] = await db.insert(objectifsEpargne).values(insertObjectif).returning();
    return objectif;
  }
  
  export async function updateObjectifEpargne(id: string, updateData: Partial<InsertObjectifEpargne>): Promise<ObjectifEpargne | undefined> {
    const [objectif] = await db.update(objectifsEpargne).set(updateData).where(eq(objectifsEpargne.id, id)).returning();
    return objectif || undefined;
  }
  
  export async function deleteObjectifEpargne(id: string): Promise<boolean> {
    const result = await db.delete(objectifsEpargne).where(eq(objectifsEpargne.id, id));
    return true;
  }

  // Sessions Caisse
  export async function getSessionCaisse(id: string): Promise<any | undefined> {
    const results = await db.select({
      session: sessionsCaisse,
      caissier_nom: users.nom,
      caissier_prenom: users.prenom
    })
    .from(sessionsCaisse)
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
    .where(eq(sessionsCaisse.id, id));

    if (results.length === 0) return undefined;
    
    const r = results[0];
    return {
      ...r.session,
      computedStatus: computeSessionStatus(r.session),
      caissier_nom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim() || 'Caissier Inconnu'
    };
  }

  export async function getActiveSessionForUser(userId: string): Promise<any | undefined> {
    const results = await db.select({
      session: sessionsCaisse,
      caisse_nom: caisses.nom,
      caissier_nom: users.nom,
      caissier_prenom: users.prenom
    })
    .from(sessionsCaisse)
    .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
    .where(and(
      eq(sessionsCaisse.caissierId, userId),
      isNull(sessionsCaisse.closedAt)
    ));

    if (results.length === 0) return undefined;
    
    const r = results[0];
    return {
      ...r.session,
      computedStatus: computeSessionStatus(r.session),
      caisse_nom: r.caisse_nom || 'Caisse Inconnue',
      caissier_nom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim() || 'Moi'
    };
  }

  export async function getActiveSessions(): Promise<SessionCaisse[]> {
    return db.select().from(sessionsCaisse).where(isNull(sessionsCaisse.closedAt));
  }

  export async function getAllSessionsCaisse(filter: { agence?: string; statut?: string } = {}): Promise<any[]> {
    let query = db.select({
      session: sessionsCaisse,
      caissier_nom: users.nom,
      caissier_prenom: users.prenom,
      caisse_nom: caisses.nom,
      agence_nom: agences.nom,
      agence_code: agences.codeAgence
    })
    .from(sessionsCaisse)
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
    .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .leftJoin(agences, eq(sessionsCaisse.agenceId, agences.id));

    const conditions = [];

    if (filter.agence) {
      conditions.push(eq(sessionsCaisse.agenceId, filter.agence));
    }

    if (filter.statut) {
      const normalized = filter.statut.toUpperCase();
      const now = new Date();
      if (normalized === StatutCaisseAgent.OPEN) {
        conditions.push(
          and(
            isNull(sessionsCaisse.closedAt),
            or(isNull(sessionsCaisse.timeoutAt), gte(sessionsCaisse.timeoutAt, now))
          )
        );
      } else if (normalized === "TIMED_OUT" || normalized === "TIMEOUT") {
        conditions.push(and(isNull(sessionsCaisse.closedAt), lt(sessionsCaisse.timeoutAt, now)));
      } else if (normalized === StatutCaisseAgent.CLOSED) {
        conditions.push(isNotNull(sessionsCaisse.closedAt));
      }
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query.orderBy(desc(sessionsCaisse.openedAt));

    return results.map(r => ({
      ...r.session,
      computedStatus: computeSessionStatus(r.session),
      caissier_nom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim() || 'Caissier Inconnu',
      caisse_nom: r.caisse_nom,
      agence_nom: r.agence_nom || 'Agence Inconnue',
      agence_code: r.agence_code
    }));
  }

  export async function createSessionCaisse(insertSession: InsertSessionCaisse): Promise<SessionCaisse> {
    const [session] = await db.insert(sessionsCaisse).values(insertSession).returning();
    return session;
  }

  export async function updateSessionCaisse(id: string, updateData: Partial<InsertSessionCaisse>): Promise<SessionCaisse | undefined> {
    const [session] = await db.update(sessionsCaisse).set(updateData).where(eq(sessionsCaisse.id, id)).returning();
    return session || undefined;
  }

  export async function updateUserConnectionStatus(userId: string, status: 'CONNECTED' | 'DISCONNECTED'): Promise<void> {
    // Only update if there is an active session for this user
    await db.update(sessionsCaisse)
      .set({ connectionStatus: status })
      .where(and(
        eq(sessionsCaisse.caissierId, userId),
        isNull(sessionsCaisse.closedAt)
      ));
  }

  export async function closeSessionCaisse(id: string, closeData: { soldeReel: string; ecart: string; billetageFermeture: any; observations?: string }): Promise<SessionCaisse | undefined> {
    const [session] = await db.update(sessionsCaisse)
      .set({
        montantFermetureDeclare: closeData.soldeReel,
        ecart: closeData.ecart,
        billetageFermeture: closeData.billetageFermeture,
        observations: closeData.observations,
        closedAt: new Date(),
      })
      .where(eq(sessionsCaisse.id, id))
      .returning();
    return session || undefined;
  }

  // Operations Caisse
  export async function getOperationsBySession(sessionId: string): Promise<OperationCaisse[]> {
    return db.select().from(operationsCaisse).where(eq(operationsCaisse.sessionId, sessionId)).orderBy(desc(operationsCaisse.createdAt));
  }

  export async function getSessionsByCaissier(caissierId: string): Promise<SessionCaisse[]> {
    return db.select().from(sessionsCaisse).where(eq(sessionsCaisse.caissierId, caissierId)).orderBy(desc(sessionsCaisse.openedAt));
  }

  /**
   * Get the last closed session for a caisse
   * Returns the most recent session that has been closed (closedAt IS NOT NULL)
   */
  export async function getLastClosedSession(caisseId: string): Promise<SessionCaisse | undefined> {
    const [session] = await db.select()
      .from(sessionsCaisse)
      .where(and(
        eq(sessionsCaisse.caisseId, caisseId),
        isNotNull(sessionsCaisse.closedAt)
      ))
      .orderBy(desc(sessionsCaisse.closedAt))
      .limit(1);
    return session || undefined;
  }

  export async function getAllOperationsCaisse(): Promise<OperationCaisse[]> {
    return db.select().from(operationsCaisse).orderBy(desc(operationsCaisse.createdAt));
  }

  export async function getOperationsCaisseByDateRange(start: Date, end: Date): Promise<OperationCaisse[]> {
    return db.select().from(operationsCaisse)
      .where(and(gte(operationsCaisse.createdAt, start), lte(operationsCaisse.createdAt, end)))
      .orderBy(desc(operationsCaisse.createdAt));
  }

  // Helper for accurate balance calculation using Ledger Sens
  export async function getOperationsBySessionWithSens(sessionId: string) {
    return db.select({
        ...getTableColumns(operationsCaisse),
        sens: mouvementsFinanciers.sens
    })
    .from(operationsCaisse)
    .leftJoin(mouvementsFinanciers, eq(operationsCaisse.mouvementId, mouvementsFinanciers.id))
    .where(eq(operationsCaisse.sessionId, sessionId));
  }

  export async function getOperationsByClientAndDateRange(clientId: string, start: Date, end: Date, type?: string): Promise<OperationCaisse[]> {
    const conditions = [
      eq(operationsCaisse.clientId, clientId),
      gte(operationsCaisse.createdAt, start),
      lte(operationsCaisse.createdAt, end)
    ];

    if (type) {
      // Handle generic type filters by mapping to actual typeOperationCaisseEnum values
      if (type === 'retrait') {
        // For operationsCaisse table, withdrawal types
        conditions.push(eq(operationsCaisse.typeOperation, TypeOperationCaisse.SAVINGS_WITHDRAWAL));
      } else if (type === 'depot') {
        // For operationsCaisse table, deposit types
        conditions.push(eq(operationsCaisse.typeOperation, TypeOperationCaisse.SAVINGS_DEPOSIT));
      } else {
        // Direct enum value (e.g., CREDIT_DISBURSEMENT, CREDIT_REPAYMENT, etc.)
        conditions.push(eq(operationsCaisse.typeOperation, type as any));
      }
    }

    return db.select().from(operationsCaisse)
      .where(and(...conditions))
      .orderBy(desc(operationsCaisse.createdAt));
  }

  // Withdrawal types from typePaiementTerrainEnum (EN)
  const WITHDRAWAL_TYPES = [
    TypeOperationCaisse.WITHDRAWAL_SAVINGS,
    TypeOperationCaisse.WITHDRAWAL_CURRENT,
    TypeOperationCaisse.WITHDRAWAL_BLOCKED,
    TypeOperationCaisse.TONTINE_WITHDRAWAL,
  ] as const;

  // Deposit types from typePaiementTerrainEnum (EN)
  const DEPOSIT_TYPES = [
    TypeOperationCaisse.DEPOSIT_SAVINGS,
    TypeOperationCaisse.DEPOSIT_CURRENT,
    TypeOperationCaisse.DEPOSIT_BLOCKED,
    TypeOperationCaisse.TONTINE_CONTRIBUTION,
  ] as const;

  /**
   * Get movements by client and date range from mouvementsFinanciers (source of truth)
   * Supports generic type filters: 'retrait' for all withdrawals, 'depot' for all deposits
   */
  export async function getMouvementsByClientAndDateRange(
    clientId: string,
    start: Date,
    end: Date,
    type?: 'retrait' | 'depot' | string
  ) {
    const conditions = [
      eq(mouvementsFinanciers.clientId, clientId),
      gte(mouvementsFinanciers.dateOperation, start),
      lte(mouvementsFinanciers.dateOperation, end),
      eq(mouvementsFinanciers.statut, StatutTransaction.POSTED), // Only count posted transactions
    ];

    if (type) {
      if (type === 'retrait') {
        // All withdrawal types
        conditions.push(inArray(mouvementsFinanciers.typePaiement, [...WITHDRAWAL_TYPES]));
      } else if (type === 'depot') {
        // All deposit types
        conditions.push(inArray(mouvementsFinanciers.typePaiement, [...DEPOSIT_TYPES]));
      } else {
        // Direct enum value
        conditions.push(eq(mouvementsFinanciers.typePaiement, type as any));
      }
    }

    return db.select().from(mouvementsFinanciers)
      .where(and(...conditions))
      .orderBy(desc(mouvementsFinanciers.dateOperation));
  }

  export async function createOperationCaisse(insertOperation: InsertOperationCaisse): Promise<OperationCaisse> {
    const [operation] = await db.insert(operationsCaisse).values(insertOperation).returning();
    return operation;
  }

  export async function updateOperationCaisse(id: string, updateData: Partial<InsertOperationCaisse>): Promise<OperationCaisse | undefined> {
    const [operation] = await db.update(operationsCaisse).set(updateData).where(eq(operationsCaisse.id, id)).returning();
    return operation || undefined;
  }

  // Caisses (Physical/Logical)
  export async function getCaisse(id: string): Promise<Caisse | undefined> {
    const [caisse] = await db.select().from(caisses).where(eq(caisses.id, id));
    return caisse || undefined;
  }

  export async function getCaissesByAgence(agenceId: string): Promise<Caisse[]> {
    // Only support UUID-based agenceId filtering
    return db.select().from(caisses).where(eq(caisses.agenceId, agenceId));
  }

  export async function getAllCaisses(): Promise<Caisse[]> {
    return db.select().from(caisses);
  }

  export async function getCaissesWithStatus(agenceId?: string): Promise<any[]> {
    let query = db.select({
      caisse: caisses,
      session: sessionsCaisse,
      caissier_nom: users.nom,
      caissier_prenom: users.prenom
    })
    .from(caisses)
    .leftJoin(sessionsCaisse, and(
      eq(caisses.id, sessionsCaisse.caisseId),
      isNull(sessionsCaisse.closedAt)
    ))
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id));

    if (agenceId) {
      query = query.where(eq(caisses.agenceId, agenceId)) as any;
    }

    const results = await query;
    return results.map(r => ({
      ...r.caisse,
      active_session: r.session ? {
        ...r.session,
        computedStatus: computeSessionStatus(r.session),
        caissier_nom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim()
      } : null
    }));
  }

  export async function createCaisse(caisse: InsertCaisse): Promise<Caisse> {
    const [newCaisse] = await db.insert(caisses).values(caisse).returning();
    return newCaisse;
  }

  export async function updateCaisse(id: string, caisse: Partial<InsertCaisse>): Promise<Caisse | undefined> {
    const [updated] = await db.update(caisses).set(caisse).where(eq(caisses.id, id)).returning();
    return updated || undefined;
  }

  export async function deleteCaisse(id: string): Promise<boolean> {
    // 1. Check if caisse has usage history (sessions)
    const [usage] = await db.select({ count: count() }).from(sessionsCaisse).where(eq(sessionsCaisse.caisseId, id));
    
    if (usage && usage.count > 0) {
        return false; // Cannot delete used caisse
    }

    // 2. Clear assignments
    await db.delete(caisseAssignations).where(eq(caisseAssignations.caisseId, id));

    // 3. Delete Caisse
    const result = await db.delete(caisses).where(eq(caisses.id, id)).returning();
    return result.length > 0;
  }

  export async function getCaisseAssignments(caisseId: string): Promise<CaisseAssignation[]> {
      return db.select().from(caisseAssignations).where(eq(caisseAssignations.caisseId, caisseId));
  }

  export async function getUserCaisseAssignments(userId: string): Promise<CaisseAssignation[]> {
      return db.select().from(caisseAssignations).where(eq(caisseAssignations.userId, userId));
  }

  export async function setCaisseAssignments(caisseId: string, userIds: string[], assignedBy: string): Promise<void> {
      // Transaction to replace assignments
      await db.transaction(async (tx) => {
          // 1. Delete existing
          await tx.delete(caisseAssignations).where(eq(caisseAssignations.caisseId, caisseId));
          
          // 2. Insert new
          if (userIds.length > 0) {
              const records = userIds.map(userId => ({
                  caisseId,
                  userId,
                  assignedBy
              }));
              await tx.insert(caisseAssignations).values(records);
          }
      });
  }


  // Factures
    export async function getFacture(id: string): Promise<Facture | undefined> {
        const [facture] = await db.select().from(factures).where(eq(factures.id, id));
        return facture || undefined;
    }
    
    export async function getFactureByNumero(numero: string): Promise<Facture | undefined> {
        const [facture] = await db.select().from(factures).where(eq(factures.numero, numero));
        return facture || undefined;
    }
    
    export async function getFacturesByClient(clientId: string): Promise<Facture[]> {
        return db.select().from(factures).where(eq(factures.clientId, clientId));
    }
    
    export async function getFacturesByAgent(agentId: string): Promise<Facture[]> {
        return db.select().from(factures).where(eq(factures.agentId, agentId));
    }
    
    export async function getAllFactures(): Promise<Facture[]> {
        return db.select().from(factures).orderBy(desc(factures.createdAt));
    }
    
    export async function createFacture(insertFacture: InsertFacture): Promise<Facture> {
        const [facture] = await db.insert(factures).values(insertFacture).returning();
        return facture;
    }
    
    export async function updateFacture(id: string, updateData: Partial<InsertFacture>): Promise<Facture | undefined> {
        const [facture] = await db.update(factures).set({ ...updateData, updatedAt: new Date() }).where(eq(factures.id, id)).returning();
        return facture || undefined;
    }
    
    // Lignes Factures
    export async function getLignesByFacture(factureId: string): Promise<LigneFacture[]> {
        return db.select().from(lignesFactures).where(eq(lignesFactures.factureId, factureId));
    }
    
    export async function createLigneFacture(insertLigne: InsertLigneFacture): Promise<LigneFacture> {
        const [ligne] = await db.insert(lignesFactures).values(insertLigne).returning();
        return ligne;
    }

    // Modeles Factures
    export async function getModeleFacture(id: string): Promise<ModeleFacture | undefined> {
        const [modele] = await db.select().from(modelesFactures).where(eq(modelesFactures.id, id));
        return modele || undefined;
    }

    export async function getModeleFactureByCode(code: string): Promise<ModeleFacture | undefined> {
        const [modele] = await db.select().from(modelesFactures).where(eq(modelesFactures.code, code));
        return modele || undefined;
    }

    export async function getAllModelesFactures(): Promise<ModeleFacture[]> {
        return db.select().from(modelesFactures);
    }
    
    export async function createModeleFacture(insertModele: InsertModeleFacture): Promise<ModeleFacture> {
        const [modele] = await db.insert(modelesFactures).values(insertModele).returning();
        return modele;
    }

    export async function updateModeleFacture(id: string, updateData: Partial<InsertModeleFacture>): Promise<ModeleFacture | undefined> {
        const [modele] = await db.update(modelesFactures).set({ ...updateData, updatedAt: new Date() }).where(eq(modelesFactures.id, id)).returning();
        return modele || undefined;
    }
    
    export async function incrementModeleFactureNumero(id: string): Promise<number> {
      // Simple incrementation in DB or returning next value
      // This might require a transaction to be safe
      const [model] = await db.select().from(modelesFactures).where(eq(modelesFactures.id, id));
      if (!model) return 0;
      const nextNum = (model.dernierNumero || 0) + 1;
      await db.update(modelesFactures).set({ dernierNumero: nextNum }).where(eq(modelesFactures.id, id));
      return nextNum;
    }

    // Comptage Billets
    export async function getComptageBillets(id: string): Promise<ComptageBillets | undefined> {
        const [comptage] = await db.select().from(comptageBillets).where(eq(comptageBillets.id, id));
        return comptage || undefined;
    }
    export async function getComptagesBySession(sessionId: string): Promise<ComptageBillets[]> {
         return db.select().from(comptageBillets).where(eq(comptageBillets.sessionId, sessionId));
    }
    export async function createComptageBillets(insertComptage: InsertComptageBillets): Promise<ComptageBillets> {
        const [comptage] = await db.insert(comptageBillets).values(insertComptage).returning();
        return comptage;
    }
    

    // Caisse Transferts
    export async function getCaisseTransfert(id: string): Promise<CaisseTransfert | undefined> {
        const [transfert] = await db.select().from(caisseTransferts).where(eq(caisseTransferts.id, id));
        return transfert || undefined;
    }

    export async function getCaisseTransferts(agenceId?: string): Promise<any[]> {
        const sourceAgence = aliasedTable(agences, "source_agence");
        const destAgence = aliasedTable(agences, "dest_agence");

        const selection = {
            ...getTableColumns(caisseTransferts),
            created_by_username: users.username,
            created_by_nom: users.nom,
            created_by_prenom: users.prenom,
            agence_source_nom: sourceAgence.nom,
            agence_dest_nom: destAgence.nom
        };

        let query = db.select(selection)
            .from(caisseTransferts)
            .leftJoin(users, eq(caisseTransferts.createdBy, users.id))
            .leftJoin(sourceAgence, eq(caisseTransferts.agenceSourceId, sourceAgence.id))
            .leftJoin(destAgence, eq(caisseTransferts.agenceDestId, destAgence.id));

        if (agenceId) {
            query = query.where(or(
                eq(caisseTransferts.agenceSourceId, agenceId), 
                eq(caisseTransferts.agenceDestId, agenceId)
            )) as any;
        }
        
        return query.orderBy(desc(caisseTransferts.dateCreation));
    }

    export async function getCaisseTransfertsByAgence(agenceId: string): Promise<any[]> {
         return getCaisseTransferts(agenceId);
    }

    export async function createCaisseTransfert(insertData: InsertCaisseTransfert): Promise<CaisseTransfert> {
        const [transfert] = await db.insert(caisseTransferts).values(insertData).returning();
        return transfert;
    }

    export async function updateCaisseTransfert(id: string, updateData: Partial<InsertCaisseTransfert>): Promise<CaisseTransfert | undefined> {
        const [transfert] = await db.update(caisseTransferts).set({ ...updateData }).where(eq(caisseTransferts.id, id)).returning();
        return transfert || undefined;
    }

    // Agences
    export async function getAllAgences(): Promise<Agence[]> {
        return db.select().from(agences);
    }

    // Echéances / Upcoming Payments (Calculated)
    export async function getUpcomingEcheances(filter: { agence?: string } = {}): Promise<{ client: string; amount: number; date: string; status: string }[]> {
        // 1. Get active credits
        const conditions = [
            eq(credits.statut, StatutCredit.ACTIVE),
            gt(credits.soldeRestant, "0")
        ];

        if (filter.agence) {
            conditions.push(eq(clients.agenceId, filter.agence));
        }

        const activeCredits = await db.select({
            credit: credits,
            client: clients,
            user: users
        })
        .from(credits)
        .innerJoin(clients, eq(credits.clientId, clients.id))
        .innerJoin(users, eq(clients.userId, users.id))
        .where(and(...conditions));
        const upcomingPayments: { client: string; amount: number; date: string; status: string }[] = [];
        const now = new Date();

        for (const { credit, client, user } of activeCredits) {
            if (!credit.dateDebut || !credit.montant || !credit.duree || !clients) continue;

            const dateDebut = new Date(credit.dateDebut);
            // Simplified calculation: Monthly payment = Amount / Duration
            const mensualite = Math.round(Number(credit.montant) / credit.duree); 

            // Find next payment date
            let nextDate = new Date(dateDebut);
            
            // Simple iteration to find the next due date
            for (let i = 1; i <= credit.duree; i++) {
                nextDate = new Date(dateDebut);
                nextDate.setMonth(dateDebut.getMonth() + i);
                
                const diffTime = nextDate.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                // If date is within [Now - 5 days, Now + 30 days]
                if (diffDays >= -5 && diffDays <= 30) {
                     upcomingPayments.push({
                        client: `${user?.nom} ${user?.prenom}`,
                        amount: mensualite,
                        date: nextDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
                        status: diffDays < 0 ? 'due' : 'pending' 
                     });
                     break; // Only show the IMMEDIATE next one
                }
            }
        }
        
        return upcomingPayments.sort((a, b) => 0);
    }

    // Durees Suggerees
    export async function getDureesSuggerees(frequence?: string): Promise<DureeSuggeree[]> {
        let query = db.select().from(dureesSuggerees).where(eq(dureesSuggerees.actif, true));

        if (frequence) {
            query = db.select().from(dureesSuggerees).where(
                and(
                    eq(dureesSuggerees.actif, true),
                    eq(dureesSuggerees.frequence, frequence as any)
                )
            );
        }

        return query.orderBy(dureesSuggerees.ordre);
    }

    export async function getDureeSuggereeRecommandee(frequence: string): Promise<DureeSuggeree | undefined> {
        const [duree] = await db.select().from(dureesSuggerees).where(
            and(
                eq(dureesSuggerees.actif, true),
                eq(dureesSuggerees.frequence, frequence as any),
                eq(dureesSuggerees.estRecommandee, true)
            )
        );
        return duree || undefined;
    }

    export async function createDureeSuggeree(insertDuree: InsertDureeSuggeree): Promise<DureeSuggeree> {
        const [duree] = await db.insert(dureesSuggerees).values(insertDuree).returning();
        return duree;
    }

    export async function updateDureeSuggeree(id: string, updateData: Partial<InsertDureeSuggeree>): Promise<DureeSuggeree | undefined> {
        const [duree] = await db.update(dureesSuggerees).set(updateData).where(eq(dureesSuggerees.id, id)).returning();
        return duree || undefined;
    }

    export async function deleteDureeSuggeree(id: string): Promise<boolean> {
        const result = await db.delete(dureesSuggerees).where(eq(dureesSuggerees.id, id));
        return true;
    }

// ============================================================================
// ATOMIC LEDGER-BASED OPERATIONS (Phase 2)
// All financial operations go through mouvementsFinanciers + evenementsOutbox
// ============================================================================

import { 
  executeWithLedger, 
  updateCompteSolde, 
  updateCreditSolde, 
  updateSessionSolde,
  updateCaisseSolde,
  createMouvementFinancier,
  createMouvementEvents,
  validateUserId,
  type SensMouvement,
  type MouvementFinancier
} from "../services/ledger";

/**
 * Create a transaction épargne with full ledger flow
 * - Creates mouvement_financier
 * - Updates compte solde
 * - Creates transaction_epargne with mouvement_id
 * - Publishes outbox events
 */
export async function createTransactionCompteWithLedger(data: {
  compteId: string;
  typeTransaction: "DEPOSIT" | "WITHDRAWAL" | "INTEREST" | "FEE" | "ADJUSTMENT";
  montant: string;
  methodePaiement: string;
  sessionCaisseId?: string;
  observations?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{ transaction: TransactionCompte; mouvement: MouvementFinancier }> {

  // Determine sens based on transaction type

  const isDebit = ["WITHDRAWAL", "FEE"].includes(data.typeTransaction);
  const sens: SensMouvement = isDebit ? "DEBIT" : "CREDIT";
  const delta = isDebit ? -parseFloat(data.montant) : parseFloat(data.montant);

  // Get compte for clientId
  const [compte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
  if (!compte) throw new Error(`Compte ${data.compteId} not found`);

  // Map typeTransaction to typePaiement for terrain enum (EN values)
  const typePaiementMap: Record<string, string> = {
    "DEPOSIT": compte.typeCompte === TypeCompte.CURRENT ? TypeOperationCaisse.DEPOSIT_CURRENT : TypeOperationCaisse.DEPOSIT_SAVINGS,
    "WITHDRAWAL": compte.typeCompte === TypeCompte.CURRENT ? TypeOperationCaisse.WITHDRAWAL_CURRENT : TypeOperationCaisse.WITHDRAWAL_SAVINGS,
    "FEE": TypeOperationCaisse.FEE,
    "ADJUSTMENT": TypeOperationCaisse.ADJUSTMENT,
    // Interest is essentially a deposit
    "INTEREST": TypeOperationCaisse.SAVINGS_DEPOSIT, 
  };
  const typePaiement = typePaiementMap[data.typeTransaction];

  return executeWithLedger(
    "EPARGNE",
    {
      montant: data.montant,
      sens,
      clientId: compte.clientId,
      compteId: data.compteId,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement: typePaiement as any,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      // 1. Update compte solde
      const nouveauSolde = await updateCompteSolde(tx, data.compteId, delta);

      // 2. Update session caisse solde if applicable
      let nouveauSoldeSession: string | undefined;
      if (data.sessionCaisseId) {
        // For deposits, cash comes in; for withdrawals, cash goes out
        const sessionDelta = isDebit ? -parseFloat(data.montant) : parseFloat(data.montant);
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, sessionDelta);
      }

      // 3. Validate userId
      const validatedUserId = await validateUserId(tx, userId);

      // 4. Create transaction épargne
      const [transaction] = await tx.insert(transactionsCompte).values({
        compteId: data.compteId,
        mouvementId: mouvement.id,
        typePaiement: typePaiement as any,
        montant: data.montant,
        soldeApres: nouveauSolde,
        methodePaiement: data.methodePaiement as any,
        observations: data.observations,
        createdBy: validatedUserId,
      }).returning();

      return {
        result: transaction,
        additionalEventData: {
          nouveauSoldeCompte: nouveauSolde,
          nouveauSoldeSession,
        },
      };
    },
    userId
  ).then(({ result, mouvement }) => ({ transaction: result, mouvement }));
}

/**
 * Métadonnées pour opérations par chèque
 */
export interface CheckMetadata {
  numeroCheque: string;
  banqueEmettrice: string;
  dateEmission?: string;
  titulaireCheque?: string;
}

/**
 * Métadonnées pour opérations par virement
 */
export interface TransferMetadata {
  banqueOrigine: string;
  numeroCompteOrigine?: string;
  referenceVirement?: string;
  nomEmetteur?: string;
}

/**
 * Données de vérification de présence physique (remplace l'OTP)
 */
export interface PhysicalVerificationData {
  verificationMethod: 'piece_identite' | 'reconnaissance_visuelle' | 'signature';
  identityConfirmed: boolean;
  responsibilityAccepted: boolean;
  agentNotes?: string;
  confirmedAt: string;
  passwordVerified?: boolean;
}

/**
 * Create an operation caisse with full ledger flow
 * Supports metadata for checks/transfers and physical presence verification
 */
export async function createOperationCaisseWithLedger(data: {
  sessionId: string;
  typeOperation: string;
  montant: string;
  methodePaiement: string;
  clientId?: string;
  description?: string;
  idempotencyKey?: string;
  // Nouvelles données pour métadonnées chèques/virements
  checkMetadata?: CheckMetadata;
  transferMetadata?: TransferMetadata;
  // Données de vérification de présence physique
  presenceVerification?: PhysicalVerificationData;
}, userId?: string): Promise<{ operation: OperationCaisse; mouvement: MouvementFinancier }> {

  // Determine sens based on operation type
  const opLower = data.typeOperation.toLowerCase();
  const isDebit = opLower.startsWith("retrait") ||
                  opLower.startsWith("décaissement") ||
                  opLower.startsWith("sort") || // Sortie
                  opLower.startsWith("frais");

  const sens: SensMouvement = isDebit ? "DEBIT" : "CREDIT";
  const sessionDelta = isDebit ? -parseFloat(data.montant) : parseFloat(data.montant);

  // Get session for agenceId
  const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, data.sessionId));
  if (!session) throw new Error(`Session ${data.sessionId} not found`);

  // Generate reference
  const timestamp = Date.now().toString().slice(-8);
  const reference = `OP-${timestamp}-${Math.floor(Math.random() * 1000)}`;

  // Construire les métadonnées
  const metadata: Record<string, unknown> = {};
  if (data.checkMetadata) {
    metadata.check = data.checkMetadata;
  }
  if (data.transferMetadata) {
    metadata.transfer = data.transferMetadata;
  }

  return executeWithLedger(
    "CAISSE",
    {
      montant: data.montant,
      sens,
      clientId: data.clientId,
      sessionCaisseId: data.sessionId,
      agenceId: session.agenceId || undefined,
      methodePaiement: data.methodePaiement,
      idempotencyKey: data.idempotencyKey,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    },
    async (tx, mouvement) => {
      // 1. Update session solde théorique
      const nouveauSolde = await updateSessionSolde(tx, data.sessionId, sessionDelta);

      // 2. Validate userId
      const validatedUserId = await validateUserId(tx, userId);

      // 3. Create operation caisse with metadata
      const [operation] = await tx.insert(operationsCaisse).values({
        sessionId: data.sessionId,
        mouvementId: mouvement.id,
        typeOperation: data.typeOperation as any,
        montant: data.montant,
        methodePaiement: data.methodePaiement as any,
        reference,
        description: data.description,
        clientId: data.clientId,
        createdBy: validatedUserId,
        idempotencyKey: data.idempotencyKey,
        // Stocker les métadonnées chèques/virements
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        // Stocker la vérification de présence physique
        presenceVerification: data.presenceVerification || undefined,
      }).returning();

      return {
        result: operation,
        additionalEventData: {
          nouveauSoldeSession: nouveauSolde,
        },
      };
    },
    userId
  ).then(({ result, mouvement }) => ({ operation: result, mouvement }));
}

/**
 * Create a remboursement with full ledger flow
 */
export async function createRemboursementWithLedger(data: {
  creditId: string;
  montant: string;
  methodePaiement: string;
  sessionCaisseId?: string;
  observations?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{ remboursement: Remboursement; mouvement: MouvementFinancier }> {
  
  // Get credit for clientId
  const [credit] = await db.select().from(credits).where(eq(credits.id, data.creditId));
  if (!credit) throw new Error(`Credit ${data.creditId} not found`);

  // Force Session for Cash
  if (data.methodePaiement === 'CASH' && !data.sessionCaisseId) {
      throw new Error("Une session de caisse active est requise pour les remboursements en espèces");
  }

  return executeWithLedger(
    "CREDIT",
    {
      montant: data.montant,
      sens: "CREDIT", // Money coming in
      clientId: credit.clientId,
      creditId: data.creditId,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement: "CREDIT_REPAYMENT" as any,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      // 1. Update credit solde restant (decrease by payment amount)
      const nouveauSolde = await updateCreditSolde(tx, data.creditId, -parseFloat(data.montant));

      // 2. Update session caisse if applicable
      let nouveauSoldeSession: string | undefined;
      if (data.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, parseFloat(data.montant));
      }

      // 3. Validate userId
      const validatedUserId = await validateUserId(tx, userId);

      // 4. Create remboursement
      const [remboursement] = await tx.insert(remboursements).values({
        creditId: data.creditId,
        mouvementId: mouvement.id,
        montant: data.montant,
        dateRemboursement: new Date(),
        methodePaiement: data.methodePaiement as any,
        observations: data.observations,
        createdBy: validatedUserId,
        idempotencyKey: data.idempotencyKey,
      }).returning();

      return {
        result: remboursement,
        additionalEventData: {
          nouveauSoldeCredit: nouveauSolde,
          nouveauSoldeSession,
        },
      };
    },
    userId
  ).then(async ({ result, mouvement }) => {
    // Generate receipt for the repayment
    const facture = await createFactureForRemboursement({
      creditId: data.creditId,
      numeroCredit: credit.numeroCredit,
      clientId: credit.clientId,
      montant: data.montant,
      agentId: userId,
      sessionCaisseId: data.sessionCaisseId,
    });
    
    return { remboursement: result, mouvement, facture };
  });
}

/**
 * Payer les frais d'engagement pour une demande de crédit
 * Génère automatiquement une facture/reçu après paiement
 */
export async function payerFraisEngagement(data: {
  demandeId: string;
  montant: string;
  methodePaiement: string;
  sessionCaisseId?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{ demande: DemandeCredit; operation: OperationCaisse; mouvement: MouvementFinancier; facture: Facture }> {
  
  // 1. Récupérer la demande
  const [demande] = await db.select().from(demandesCredit).where(eq(demandesCredit.id, data.demandeId));
  if (!demande) throw new Error(`Demande ${data.demandeId} non trouvée`);
  if (demande.fraisEngagementPayes) throw new Error(`Les frais ont déjà été payés pour cette demande`);

  // Force Session for Cash
  if (data.methodePaiement === 'CASH' && !data.sessionCaisseId) {
      throw new Error("Une session de caisse active est requise pour le paiement des frais en espèces");
  }

  const ledgerResult = await executeWithLedger(
    "CREDIT",
    {
      montant: data.montant,
      sens: "CREDIT", // L'argent entre dans l'institution
      clientId: demande.clientId,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement: "ENGAGEMENT_FEE" as any,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      // 2. Mettre à jour la demande
      const [updatedDemande] = await tx.update(demandesCredit)
        .set({ 
          fraisEngagementPayes: true, 
          montantFraisEngagement: data.montant,
          statut: StatutDemande.READY_FOR_INVESTIGATION
        })
        .where(eq(demandesCredit.id, data.demandeId))
        .returning();

      // 3. Mettre à jour la session caisse si applicable
      let nouveauSoldeSession: string | undefined;
      if (data.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, parseFloat(data.montant));
      }

      // 4. Validate userId
      const validatedUserId = await validateUserId(tx, userId);

      // 5. Créer l'opération caisse
      const reference = `FRAIS-${demande.numeroDemande}-${Date.now()}`;
      const [operation] = await tx.insert(operationsCaisse).values({
        sessionId: data.sessionCaisseId!,
        mouvementId: mouvement.id,
        typeOperation: "Frais Engagement" as any,
        montant: data.montant,
        methodePaiement: data.methodePaiement as any,
        reference,
        description: `Paiement frais d'engagement demande ${demande.numeroDemande}`,
        clientId: demande.clientId,
        createdBy: validatedUserId,
        idempotencyKey: data.idempotencyKey,
      }).returning();

      return {
        result: { demande: updatedDemande, operation, validatedUserId },
        additionalEventData: {
          nouveauSoldeSession,
        },
      };
    },
    userId
  );

  // 6. Create facture/receipt AFTER successful payment (outside transaction for simplicity)
  const facture = await createFactureForFraisEngagement({
    demandeId: data.demandeId,
    numeroDemande: demande.numeroDemande,
    clientId: demande.clientId,
    montant: data.montant,
    agentId: ledgerResult.result.validatedUserId,
    operationCaisseId: ledgerResult.result.operation.id,
    sessionCaisseId: data.sessionCaisseId,
  });

  return {
    demande: ledgerResult.result.demande,
    operation: ledgerResult.result.operation,
    mouvement: ledgerResult.mouvement,
    facture,
  };
}

/**
 * Create a facture (invoice/receipt) for credit engagement fees
 * This is called automatically after successful fee payment
 */
export async function createFactureForFraisEngagement(data: {
  demandeId: string;
  numeroDemande: string;
  clientId: string;
  montant: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
}): Promise<Facture> {
  // 1. Get or create the "FRAIS_ENGAGEMENT" template
  let modele = await getModeleFactureByCode("FRAIS_ENGAGEMENT");
  
  if (!modele) {
    // Create default template if not exists
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Frais d'Engagement",
      code: "FRAIS_ENGAGEMENT",
      description: "Reçu de paiement des frais d'engagement pour demande de crédit",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: "REC",
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du paiement des frais d'engagement. Ce document ne constitue pas une approbation de crédit.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  // 2. Increment invoice number
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  // 3. Get shift from session if available
  let shiftId: string | undefined;
  if (data.sessionCaisseId) {
    const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, data.sessionCaisseId));
    // Note: SessionsCaisse doesn't have a direct shiftId, we skip shift linking for now
  }
  
  // 4. Create the facture
  const montantTotal = parseFloat(data.montant);
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Frais d'engagement pour demande de crédit ${data.numeroDemande}`,
  }).returning();

  // 5. Create ligne facture
  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Frais d'engagement - Demande de crédit N° ${data.numeroDemande}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "ENGAGEMENT_FEE",
    referenceId: data.demandeId,
  });
  
  return facture;
}

/**
 * Create a receipt for account deposit
 */
export async function createFactureForDepot(data: {
  compteId: string;
  numeroCompte: string;
  clientId: string;
  montant: string;
  typeCompte: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
  transactionId?: string; // ← NOUVEAU: Pour lier la facture à la transaction
}): Promise<Facture> {
  // Mapping TypeCompte (EN) vers code facture
  const codeMap: Record<string, string> = {
    [TypeCompte.SAVINGS]: 'DEPOT_EPARGNE',
    [TypeCompte.CURRENT]: 'DEPOT_COURANT',
    [TypeCompte.BLOCKED]: 'DEPOT_BLOQUE',
  };
  const code = codeMap[data.typeCompte] || 'DEPOT_EPARGNE';
  
  let modele = await getModeleFactureByCode(code);
  if (!modele) {
    const prefixMap: Record<string, string> = {
      'DEPOT_EPARGNE': 'DEP-EPG',
      'DEPOT_COURANT': 'DEP-CRT',
      'DEPOT_BLOQUE': 'DEP-BLQ',
    };
    [modele] = await db.insert(modelesFactures).values({
      nom: `Reçu Dépôt ${data.typeCompte}`,
      code,
      description: `Reçu de dépôt sur compte ${data.typeCompte.toLowerCase()}`,
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: prefixMap[code],
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du dépôt effectué sur votre compte.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Dépôt sur compte ${data.typeCompte} N° ${data.numeroCompte}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Dépôt - Compte ${data.typeCompte} N° ${data.numeroCompte}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: data.typeCompte === TypeCompte.CURRENT ? "DEPOSIT_CURRENT" :
                   data.typeCompte === TypeCompte.BLOCKED ? "DEPOSIT_BLOCKED" : "DEPOSIT_SAVINGS",
    referenceId: data.compteId,
  });
  
  // ← NOUVEAU: Lier la facture à la transaction
  if (data.transactionId) {
    await db.update(transactionsCompte)
      .set({ factureId: facture.id })
      .where(eq(transactionsCompte.id, data.transactionId));
  }
  
  return facture;
}

/**
 * Create a receipt for account withdrawal
 */
export async function createFactureForRetrait(data: {
  compteId: string;
  numeroCompte: string;
  clientId: string;
  montant: string;
  typeCompte: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
  transactionId?: string; // ← NOUVEAU
}): Promise<Facture> {
  // Mapping TypeCompte (EN) vers code facture
  const codeMap: Record<string, string> = {
    [TypeCompte.SAVINGS]: 'RETRAIT_EPARGNE',
    [TypeCompte.CURRENT]: 'RETRAIT_COURANT',
    [TypeCompte.BLOCKED]: 'RETRAIT_BLOQUE',
  };
  const code = codeMap[data.typeCompte] || 'RETRAIT_EPARGNE';
  
  let modele = await getModeleFactureByCode(code);
  if (!modele) {
    const prefixMap: Record<string, string> = {
      'RETRAIT_EPARGNE': 'RET-EPG',
      'RETRAIT_COURANT': 'RET-CRT',
      'RETRAIT_BLOQUE': 'RET-BLQ',
    };
    [modele] = await db.insert(modelesFactures).values({
      nom: `Reçu Retrait ${data.typeCompte}`,
      code,
      description: `Reçu de retrait sur compte ${data.typeCompte.toLowerCase()}`,
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: prefixMap[code],
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du retrait effectué sur votre compte.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Retrait sur compte ${data.typeCompte} N° ${data.numeroCompte}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Retrait - Compte ${data.typeCompte} N° ${data.numeroCompte}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: data.typeCompte === TypeCompte.CURRENT ? "WITHDRAWAL_CURRENT" :
                   data.typeCompte === TypeCompte.BLOCKED ? "WITHDRAWAL_BLOCKED" : "WITHDRAWAL_SAVINGS",
    referenceId: data.compteId,
  });
  
  // ← NOUVEAU: Lier la facture à la transaction
  if (data.transactionId) {
    await db.update(transactionsCompte)
      .set({ factureId: facture.id })
      .where(eq(transactionsCompte.id, data.transactionId));
  }
  
  return facture;
}

/**
 * Create a receipt for credit repayment
 */
export async function createFactureForRemboursement(data: {
  creditId: string;
  numeroCredit: string;
  clientId: string;
  montant: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
  remboursementId?: string; // ← NOUVEAU
}): Promise<Facture> {
  let modele = await getModeleFactureByCode('REMBOURSEMENT_CREDIT');
  if (!modele) {
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Remboursement Crédit",
      code: 'REMBOURSEMENT_CREDIT',
      description: "Reçu de remboursement de crédit",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: 'RMB-CRD',
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du remboursement effectué sur votre crédit.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Remboursement crédit N° ${data.numeroCredit}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Remboursement - Crédit N° ${data.numeroCredit}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "CREDIT_REPAYMENT",
    referenceId: data.creditId,
  });
  
  return facture;
}

/**
 * Create a receipt for tontine contribution
 */
export async function createFactureForContributionTontine(data: {
  tontineId: string;
  nomTontine: string;
  clientId: string;
  montant: string;
  tourNumero: number;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
}): Promise<Facture> {
  let modele = await getModeleFactureByCode('CONTRIBUTION_TONTINE');
  if (!modele) {
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Contribution Tontine",
      code: 'CONTRIBUTION_TONTINE',
      description: "Reçu de contribution tontine",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: 'CTB-TON',
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste de votre contribution à la tontine.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Contribution tontine "${data.nomTontine}" - Tour ${data.tourNumero}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Contribution - Tontine "${data.nomTontine}" - Tour ${data.tourNumero}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "TONTINE_CONTRIBUTION",
    referenceId: data.tontineId,
  });
  
  return facture;
}

/**
 * Provision the Safe (Coffre-Fort) from an external source (Bank, Capital, etc.)
 * Uses the new unified coffresForts table.
 */
export async function provisionCoffreWithLedger(data: {
    agenceId: string;
    montant: string;
    motif: string;
    description?: string;
    idempotencyKey?: string;
}, userId?: string): Promise<{ mouvement: MouvementFinancier }> {
    
    // 1. Find Agency Safe from coffresForts (new unified table)
    const [coffre] = await db.select().from(coffresForts).where(
        eq(coffresForts.ownerId, data.agenceId)
    );

    // Fallback to siege coffre if agency coffre not found
    let targetCoffre = coffre;
    if (!targetCoffre) {
        const [coffreSiege] = await db.select().from(coffresForts).where(
            eq(coffresForts.ownerType, "SIEGE")
        );
        targetCoffre = coffreSiege;
    }

    if (!targetCoffre) throw new Error("Aucun coffre-fort trouvé pour cette agence");

    // 2. Execute Ledger Transaction
    return executeWithLedger(
        "CAISSE", 
        {
            montant: data.montant,
            sens: "CREDIT", // Money IN
            agenceId: data.agenceId,
            typePaiement: "Approvisionnement coffre" as any,
            methodePaiement: "Autre", 
            metadata: {
                description: data.description || data.motif || "Approvisionnement Externe",
                motif: data.motif,
                type: "APPROVISIONNEMENT_EXTERNE",
                coffreId: targetCoffre.id,
                coffreCode: targetCoffre.code
            },
            idempotencyKey: data.idempotencyKey
        },
        async (tx, mouvement) => {
             // 3. Update Safe Balance in coffresForts
             const currentSolde = parseFloat(targetCoffre.solde || "0");
             const newSolde = currentSolde + parseFloat(data.montant);
             
             await tx.update(coffresForts)
                 .set({ solde: newSolde.toString(), updatedAt: new Date() })
                 .where(eq(coffresForts.id, targetCoffre.id));

             return {
                 result: true,
                 additionalEventData: {
                     nouveauSoldeCoffre: newSolde.toString()
                 }
             };
        },
        userId
    ).then(({ mouvement }) => ({ mouvement }));
}

/**
 * Execute a Credit Disbursement (Decaissement) via Ledger
 * Uses the new unified coffresForts table.
 */
export async function createDecaissementWithLedger(data: {
    creditId: string;
    compteId: string;
    montant: string;
    numeroCredit: string;
}, userId?: string): Promise<{ credit: Credit; mouvement: MouvementFinancier }> {
    
    // 1. Use Helper
    const [credit] = await db.select().from(credits).where(eq(credits.id, data.creditId));
    if (!credit) throw new Error("Crédit non trouvé");

    // 2. Find Agency Safe (coffresForts - new unified table)
    if (!credit.agenceId) throw new Error("Le crédit n'est lié à aucune agence");

    const [coffre] = await db.select().from(coffresForts).where(
        eq(coffresForts.ownerId, credit.agenceId)
    );

    // Fallback to siege coffre if agency coffre not found
    let targetCoffre = coffre;
    if (!targetCoffre) {
        const [coffreSiege] = await db.select().from(coffresForts).where(
            eq(coffresForts.ownerType, "SIEGE")
        );
        targetCoffre = coffreSiege;
    }

    if (!targetCoffre) throw new Error("Aucun coffre-fort trouvé pour cette agence");

    // 3. Check Balance AVANT la transaction
    const montant = parseFloat(data.montant);
    const soldeCoffre = parseFloat(targetCoffre.solde || "0");

    if (soldeCoffre < montant) {
        // Erreur typée avec toutes les informations nécessaires pour le workflow de réapprovisionnement
        throw new DecaissementInsufficientFundsError(
            montant,
            soldeCoffre,
            targetCoffre.id,
            targetCoffre.code,
            targetCoffre.nom
        );
    }

    return executeWithLedger(
        "CREDIT",
        {
            montant: data.montant,
            sens: "DEBIT", // Money leaving the institution (to user account)
            clientId: credit.clientId,
            creditId: data.creditId,
            compteId: data.compteId, // Target Account
            methodePaiement: "TRANSFER", // Internal Transfer
            typePaiement: "CREDIT_DISBURSEMENT",
            agenceId: credit.agenceId, // Pass the agency ID for history filtering
            referenceExterne: data.numeroCredit,
            metadata: {
                description: `Décaissement crédit ${data.numeroCredit}`,
                coffreId: targetCoffre.id,
                coffreCode: targetCoffre.code,
                soldeCoffreAvant: soldeCoffre
            }
        },
        async (tx, mouvement) => {
             // 4. Update Account Balance (Credit the user's account)
             const nouveauSoldeCompte = await updateCompteSolde(tx, data.compteId, parseFloat(data.montant));

             // 5. Debit the Agency Safe (coffresForts)
             const newSoldeCoffre = soldeCoffre - montant;
             await tx.update(coffresForts)
                 .set({ solde: newSoldeCoffre.toString(), updatedAt: new Date() })
                 .where(eq(coffresForts.id, targetCoffre.id));

             // 6. Create Transaction Record (for account history)
             await tx.insert(transactionsCompte).values({
                 compteId: data.compteId,
                 mouvementId: mouvement.id,
                 typePaiement: "CREDIT_DISBURSEMENT",
                 montant: data.montant,
                 soldeApres: nouveauSoldeCompte,
                 methodePaiement: "TRANSFER",
                 observations: `Décaissement crédit ${data.numeroCredit}`,
             });

             return {
                 result: credit,
                 additionalEventData: {
                     nouveauSoldeCompte
                 }
             };
        },
        userId
    ).then(({ result, mouvement }) => ({ credit: result, mouvement }));
}

/**
 * Get mouvements financiers with filtering
 */
export async function getMouvementsFinanciers(filter: {
  sourceModule?: string;
  clientId?: string;
  compteId?: string;
  creditId?: string;
  sessionCaisseId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
} = {}): Promise<MouvementFinancier[]> {
  const conditions = [];

  if (filter.sourceModule) {
    conditions.push(eq(mouvementsFinanciers.sourceModule, filter.sourceModule as any));
  }
  if (filter.clientId) {
    conditions.push(eq(mouvementsFinanciers.clientId, filter.clientId));
  }
  if (filter.compteId) {
    conditions.push(eq(mouvementsFinanciers.compteId, filter.compteId));
  }
  if (filter.creditId) {
    conditions.push(eq(mouvementsFinanciers.creditId, filter.creditId));
  }
  if (filter.sessionCaisseId) {
    conditions.push(eq(mouvementsFinanciers.sessionCaisseId, filter.sessionCaisseId));
  }
  if (filter.from) {
    conditions.push(gte(mouvementsFinanciers.dateOperation, filter.from));
  }
  if (filter.to) {
    conditions.push(lte(mouvementsFinanciers.dateOperation, filter.to));
  }

  let query = db.select().from(mouvementsFinanciers).$dynamic();

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  query = query.orderBy(desc(mouvementsFinanciers.dateOperation));

  if (filter.limit) {
    query = query.limit(filter.limit);
  }

  return query;
}

/**
 * Get client portfolio (accounts, credits, tontines)
 */
export async function getClientPortfolio(clientId: string): Promise<{
  comptes: Compte[];
  credits: Credit[];
  tontines: any[];
}> {
  const [clientsComptes, creditsResult] = await Promise.all([
    db.select().from(comptes).where(eq(comptes.clientId, clientId)),
    db.select().from(credits).where(eq(credits.clientId, clientId)),
  ]);

  // Get tontines via membresTontine
  const { membresTontine, tontines } = await import("@shared/schema");
  const memberships = await db.select({
    membre: membresTontine,
    tontine: tontines,
  })
    .from(membresTontine)
    .leftJoin(tontines, eq(membresTontine.tontineId, tontines.id))
    .where(eq(membresTontine.clientId, clientId));

  return {
    comptes: clientsComptes,
    credits: creditsResult,
    tontines: memberships.map(m => ({
      ...m.tontine,
      membre: m.membre,
    })),
  };
}

/**
 * Create a unified Cash Transaction with full ledger flow.
 * - Updates Account (if applicable)
 * - Updates Session
 * - Updates Caisse balance (real-time tracking)
 * - Creates Ledger Entry
 * - Creates Transaction Record (if applicable)
 * - Creates Operation Record
 *
 * IMPORTANT: Cette fonction est le point d'entrée principal pour toutes
 * les opérations de caisse client. Elle garantit:
 * - Double-entry bookkeeping (mouvementsFinanciers)
 * - Mise à jour atomique de tous les soldes
 * - Traçabilité complète
 */
export async function createCashTransactionWithLedger(data: {
  sessionId: string;
  typeOperation: string;
  montant: string;
  methodePaiement: string;
  clientId?: string;
  compteId?: string;
  description?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{
  operation: OperationCaisse;
  transaction?: TransactionCompte;
  mouvement: MouvementFinancier;
  soldes?: {
    sessionApres: string;
    compteApres?: string;
    caisseApres?: string;
  };
}> {
  // Import centralized config
  const {
    isIncomingOperation,
    isOutgoingOperation,
    getSensMouvement,
    getVersementOperation,
    getRetraitOperation
  } = await import("@shared/config/caisse-operations");

  const montantNum = parseFloat(data.montant);
  if (!Number.isFinite(montantNum) || montantNum <= 0) {
    throw new Error("Le montant doit être un nombre positif");
  }

  // Determine direction using centralized config
  const isIncoming = isIncomingOperation(data.typeOperation);
  const isOutgoing = isOutgoingOperation(data.typeOperation);

  let sens: SensMouvement;
  let cashDelta: number; // Impact on Cash Session (+ = entrée, - = sortie)
  let accountDelta: number = 0; // Impact on Client Account (+ = crédit, - = débit)

  if (isIncoming) {
    sens = "CREDIT"; // Argent entrant dans l'institution
    cashDelta = montantNum;
    accountDelta = montantNum; // Compte client crédité (sa créance augmente)
  } else if (isOutgoing) {
    sens = "DEBIT"; // Argent sortant de l'institution
    cashDelta = -montantNum;
    accountDelta = -montantNum; // Compte client débité (sa créance diminue)
  } else {
    // Opération neutre ou inconnue - erreur
    throw new Error(`Type d'opération non reconnu: ${data.typeOperation}. Utiliser un type valide (Versement, Retrait, etc.)`);
  }

  // Vérifier le compte si fourni
  let compte: any;
  if (data.compteId) {
    const [foundCompte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
    if (!foundCompte) throw new Error(`Compte ${data.compteId} non trouvé`);

    // Validation du solde pour les retraits
    if (isOutgoing) {
      const soldeActuel = parseFloat(foundCompte.soldeCourant || "0");
      if (soldeActuel < montantNum) {
        throw new Error(`Solde insuffisant. Disponible: ${soldeActuel.toLocaleString()} FCFA, Demandé: ${montantNum.toLocaleString()} FCFA`);
      }

      // Vérifier si le compte n'est pas bloqué
      if (foundCompte.blocageActif) {
        throw new Error(`Compte bloqué. Motif: ${foundCompte.blocageMotif || "Non spécifié"}`);
      }
    }

    compte = foundCompte;
  }

  // Récupérer la session avec la caisse associée
  const [session] = await db
    .select({
      session: sessionsCaisse,
      caisse: caisses
    })
    .from(sessionsCaisse)
    .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .where(eq(sessionsCaisse.id, data.sessionId));

  if (!session?.session) throw new Error(`Session ${data.sessionId} non trouvée`);
  if (session.session.closedAt) throw new Error("La session de caisse est fermée");

  // Vérifier le solde de caisse pour les retraits
  if (isOutgoing && session.caisse) {
    const soldeCaisse = parseFloat(session.caisse.solde || "0");
    if (soldeCaisse < montantNum) {
      throw new Error(`Solde caisse insuffisant. Disponible: ${soldeCaisse.toLocaleString()} FCFA`);
    }
  }

  // Générer la référence unique
  const timestamp = Date.now().toString().slice(-8);
  const refRandom = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  const opReference = `OP-${timestamp}-${refRandom}`;

  // Exécution atomique via le ledger
  return executeWithLedger(
    "CAISSE",
    {
      montant: data.montant,
      sens,
      clientId: data.clientId,
      compteId: data.compteId,
      sessionCaisseId: data.sessionId,
      agenceId: session.session.agenceId || undefined,
      methodePaiement: data.methodePaiement,
      typePaiement: data.typeOperation as any,
      idempotencyKey: data.idempotencyKey,
      referenceExterne: opReference,
      metadata: {
        caisseId: session.session.caisseId,
        typeOperation: data.typeOperation,
        description: data.description,
      },
    },
    async (tx, mouvement) => {
      // 1. Mettre à jour le solde de la session (théorique)
      const nouveauSoldeSession = await updateSessionSolde(tx, data.sessionId, cashDelta);

      // 2. Mettre à jour le solde de la caisse physique (réel en temps réel)
      let nouveauSoldeCaisse: string | undefined;
      if (session.session.caisseId) {
        nouveauSoldeCaisse = await updateCaisseSolde(tx, session.session.caisseId, cashDelta);
      }

      // 3. Mettre à jour le compte client si applicable
      let nouveauSoldeCompte: string | undefined;
      let transaction: TransactionCompte | undefined;

      if (data.compteId && compte) {
        nouveauSoldeCompte = await updateCompteSolde(tx, data.compteId, accountDelta);

        // Déterminer le type de transaction selon le type de compte (EN values)
        const transType = (accountDelta > 0)
          ? (compte.typeCompte === TypeCompte.CURRENT ? 'DEPOSIT_CURRENT' :
             compte.typeCompte === TypeCompte.BLOCKED ? 'DEPOSIT_BLOCKED' : 'DEPOSIT_SAVINGS')
          : (compte.typeCompte === TypeCompte.CURRENT ? 'WITHDRAWAL_CURRENT' :
             compte.typeCompte === TypeCompte.BLOCKED ? 'WITHDRAWAL_BLOCKED' : 'WITHDRAWAL_SAVINGS');

        const validatedUserIdForTx = await validateUserId(tx, userId);

        // Créer l'enregistrement de transaction compte
        const [createdTx] = await tx.insert(transactionsCompte).values({
          compteId: data.compteId,
          mouvementId: mouvement.id,
          typePaiement: transType as any,
          montant: data.montant,
          soldeApres: nouveauSoldeCompte,
          methodePaiement: data.methodePaiement as any,
          observations: data.description || `Opération Caisse: ${data.typeOperation}`,
          createdBy: validatedUserIdForTx,
        }).returning();
        transaction = createdTx;
      }

      // 4. Créer l'opération de caisse
      const validatedUserIdForOp = await validateUserId(tx, userId);

      const [operation] = await tx.insert(operationsCaisse).values({
        sessionId: data.sessionId,
        mouvementId: mouvement.id,
        typeOperation: data.typeOperation as any,
        montant: data.montant,
        methodePaiement: data.methodePaiement as any,
        reference: opReference,
        description: data.description,
        clientId: data.clientId,
        createdBy: validatedUserIdForOp,
        idempotencyKey: data.idempotencyKey,
        statut: "POSTED",
      }).returning();

      return {
        result: {
          operation,
          transaction,
          soldes: {
            sessionApres: nouveauSoldeSession,
            compteApres: nouveauSoldeCompte,
            caisseApres: nouveauSoldeCaisse,
          },
        },
        additionalEventData: {
          nouveauSoldeSession,
          nouveauSoldeCompte,
        },
      };
    },
    userId
  ).then(({ result, mouvement }) => ({
    operation: result.operation,
    transaction: result.transaction,
    mouvement,
    soldes: result.soldes,
  }));
}

/**
 * Validate a transfer with full ledger dual-entry (Debit Source / Credit Dest)
 */
export async function validateTransfertWithLedger(
  transfertId: string, 
  sessionDestId: string, 
  userId: string
): Promise<CaisseTransfert> {
  return await db.transaction(async (tx) => {
    // 1. Get Transfer
    const [transfert] = await tx.select().from(caisseTransferts).where(eq(caisseTransferts.id, transfertId));
    if (!transfert) throw new Error("Transfert non trouvé");
    if (transfert.statut !== 'PENDING') throw new Error("Transfert déjà traité");

    // 2. Get Sessions
    const [sessionSource] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, transfert.sessionSourceId));
    const [sessionDest] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, sessionDestId));

    if (!sessionSource) throw new Error("Session source introuvable (archivée ou supprimée?)");
    if (!sessionDest) throw new Error("Session destination introuvable");
    if (sessionDest.closedAt) throw new Error("La session de destination doit être ouverte");

    // Check Sufficient Funds
    const currentSolde = Number(sessionSource.montantFermetureTheorique || sessionSource.montantOuverture || 0);
    const amount = Number(transfert.montant);

    if (currentSolde < amount) {
        throw new Error(`Solde insuffisant dans la caisse source (${currentSolde} < ${amount})`);
    }

    // 3. Process SOURCE (DEBIT / OUT)
    const refSource = `TRF-OUT-${transfert.reference}`;
    const mouvementSource = await createMouvementFinancier(tx, {
      montant: transfert.montant,
      sens: "DEBIT",
      sourceModule: "TRANSFERT",
      sessionCaisseId: sessionSource.id,
      agenceId: sessionSource.agenceId || undefined,
      typePaiement: "TRANSFER_OUT",
      referenceExterne: refSource,
      methodePaiement: "TRANSFER",
      metadata: {
        description: `Transfert vers ${sessionDest.caisseId} (Ref: ${transfert.reference})`
      }
    }, userId);

    const soldeSource = await updateSessionSolde(tx, sessionSource.id, -parseFloat(transfert.montant));

    await tx.insert(operationsCaisse).values({
      sessionId: sessionSource.id,
      mouvementId: mouvementSource.id,
      typeOperation: "CASH_TRANSFER" as any,
      montant: transfert.montant,
      methodePaiement: "TRANSFER" as any,
      reference: refSource,
      description: `Transfert émis vers ${sessionDest.caisseId}`,
      createdBy: userId
    });

    await createMouvementEvents(tx, mouvementSource, {
      nouveauSoldeSession: soldeSource
    });

    // 4. Process DEST (CREDIT / IN)
    const refDest = `TRF-IN-${transfert.reference}`;
    const mouvementDest = await createMouvementFinancier(tx, {
      montant: transfert.montant,
      sens: "CREDIT",
      sourceModule: "TRANSFERT",
      sessionCaisseId: sessionDest.id,
      agenceId: sessionDest.agenceId || undefined,
      typePaiement: "TRANSFER_IN",
      referenceExterne: refDest,
      methodePaiement: "TRANSFER",
      metadata: {
        description: `Réception transfert de ${sessionSource.caisseId} (Ref: ${transfert.reference})`
      }
    }, userId);

    const soldeDest = await updateSessionSolde(tx, sessionDest.id, parseFloat(transfert.montant));

    await tx.insert(operationsCaisse).values({
      sessionId: sessionDest.id,
      mouvementId: mouvementDest.id,
      typeOperation: "CASH_TRANSFER" as any,
      montant: transfert.montant,
      methodePaiement: "TRANSFER" as any,
      reference: refDest,
      description: `Transfert reçu de ${sessionSource.caisseId}`,
      createdBy: userId
    });

    await createMouvementEvents(tx, mouvementDest, { 
       nouveauSoldeSession: soldeDest 
    });

    // 5. Update Transfer Status
    const [updatedTransfert] = await tx.update(caisseTransferts)
      .set({
        statut: 'VALIDATED',
        sessionDestId: sessionDest.id,
        dateValidation: new Date(),
        validatedBy: userId
      })
      .where(eq(caisseTransferts.id, transfertId))
      .returning();

    return updatedTransfert;
  });
}


/**
 * Create a new Credit Refund Request
 */
export async function createCreditRefundRequest(
  data: InsertCreditRefundRequest, 
  tx?: PgTransaction<any, any, any>
): Promise<CreditRefundRequest> {
  const [request] = await (tx || db)
    .insert(creditRefundRequests)
    .values(data)
    .returning();
  return request;
}

/**
 * Get a Credit Refund Request by ID
 */
export async function getCreditRefundRequest(
  id: string, 
  tx?: PgTransaction<any, any, any>
): Promise<CreditRefundRequest | undefined> {
  const [request] = await (tx || db)
    .select()
    .from(creditRefundRequests)
    .where(eq(creditRefundRequests.id, id));
  return request;
}

/**
 * Update a Credit Refund Request
 */
export async function updateCreditRefundRequest(
  id: string, 
  updateData: Partial<CreditRefundRequest>,
  tx?: PgTransaction<any, any, any>
): Promise<CreditRefundRequest> {
  const [updated] = await (tx || db)
    .update(creditRefundRequests)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(creditRefundRequests.id, id))
    .returning();
  return updated;
}

/**
 * Create a receipt for initial deposit during account opening
 */
export async function createFactureForDepotInitial(data: {
  compteId: string;
  numeroCompte: string;
  clientId: string;
  montant: string;
  typeCompte: string;
  modePaiement: string;
  transactionId?: string;
  agentId?: string;
}): Promise<Facture> {
  let modele = await getModeleFactureByCode('DEPOT_INITIAL');
  
  if (!modele) {
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Dépôt Initial - Ouverture de Compte",
      code: 'DEPOT_INITIAL',
      description: "Reçu de dépôt initial lors de l'ouverture de compte",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: 'DI',
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du dépôt initial effectué lors de l'ouverture de votre compte.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: data.modePaiement,
    notes: `Dépôt initial - Ouverture compte ${data.typeCompte} N° ${data.numeroCompte}`,
  }).returning();
  
  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Dépôt Initial - Compte ${data.typeCompte} N° ${data.numeroCompte}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "INITIAL_DEPOSIT",
    referenceId: data.compteId,
  });
  
  // Link facture to transaction
  if (data.transactionId) {
    await db.update(transactionsCompte)
      .set({ factureId: facture.id })
      .where(eq(transactionsCompte.id, data.transactionId));
  }
  
  return facture;
}