import {
    credits, demandesCredit, enquetesCredit, remboursements,
    comptes, transactionsCompte, plansEpargne, objectifsEpargne,
    sessionsCaisse, operationsCaisse, shiftsCaisse, caisseSecurityCodes, caisseCodeUsages, comptageBillets,
    factures, lignesFactures, modelesFactures, caisses, clients, agences, caisseAssignations, users,
    dureesSuggerees, mouvementsFinanciers, evenementsOutbox, coffresForts
  } from "@shared/schema";
  import {
    type Credit, type InsertCredit, type DemandeCredit, type InsertDemandeCredit,
    type EnqueteCredit, type InsertEnqueteCredit, type Remboursement, type InsertRemboursement,
    type Compte, type InsertCompte, type TransactionCompte, type InsertTransactionCompte,
    type PlanEpargne, type InsertPlanEpargne, type ObjectifEpargne, type InsertObjectifEpargne,
    type SessionCaisse, type InsertSessionCaisse, type OperationCaisse, type InsertOperationCaisse,
    type ShiftCaisse, type InsertShiftCaisse, type ComptageBillets, type InsertComptageBillets,
    type Facture, type InsertFacture, type LigneFacture, type InsertLigneFacture,
    type ModeleFacture, type InsertModeleFacture, type Caisse, type InsertCaisse,
    caisseTransferts, type CaisseTransfert, type InsertCaisseTransfert,
    type Agence, type CaisseAssignation,
    type DureeSuggeree, type InsertDureeSuggeree,
    creditPlans, type UserCreditPlan, type InsertCreditPlan, insertCreditPlanSchema,
    creditRefundRequests, type CreditRefundRequest, type InsertCreditRefundRequest
  } from "@shared/schema";
  import { db } from "../db";
import { eq, desc, and, or, gte, lte, gt, count, inArray, sql, getTableColumns, aliasedTable } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";


  
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
      ...result.credit,
      fraisDossierPaye: result.demande?.fraisEngagementPayes || false
    };
  }
  
  export async function getCreditsByClient(clientId: string): Promise<Credit[]> {
    return db.select().from(credits).where(eq(credits.clientId, clientId)).orderBy(desc(credits.createdAt));
  }
  
  export async function getAllCredits(filter: { agence?: string } = {}): Promise<Credit[]> {
    const conditions = [];

    if (filter.agence && filter.agence !== "all") {
      conditions.push(eq(clients.agence, filter.agence));
    }
    
    let baseQuery = db.select({
      credit: credits,
      client: clients
    }).from(credits).leftJoin(clients, eq(credits.clientId, clients.id)).$dynamic();
    
    if (conditions.length > 0) {
      baseQuery = baseQuery.where(and(...conditions));
    }
    
    const results = await baseQuery.orderBy(desc(credits.createdAt));

    return results.map(({ credit, client }) => {
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
      if (credit.dateDebut && ['Actif', 'En retard', 'En cours'].includes(credit.statut)) {
          // Normaliser les dates à minuit pour éviter les problèmes de timezone
          const start = new Date(credit.dateDebut);
          start.setHours(0, 0, 0, 0);

          const now = new Date();
          now.setHours(0, 0, 0, 0);

          // Convertir la fréquence en jours
          let frequencyDays = 30; // Par défaut Mensuel
          switch (credit.echeance) {
            case 'Journalier': frequencyDays = 1; break;
            case 'Hebdomadaire': frequencyDays = 7; break;
            case 'Bimensuel': frequencyDays = 15; break;
            case 'Trimestriel': frequencyDays = 90; break;
          }

          // Si crédit totalement remboursé, pas de retard
          if (totalPaid >= totalWithInterest - 0.01 || nombre_echeances_payees >= totalEcheances) {
            jours_retard = 0;
          } else {
            // Calcul PAR (Portfolio at Risk) standard microfinance:
            // Échéance #N tombe à: dateDebut + (N × frequencyDays) jours
            // La prochaine échéance due est celle après les échéances déjà payées
            const nextInstallmentNumber = nombre_echeances_payees + 1;

            // Calcul de la date de la prochaine échéance
            const nextDueDate = new Date(start);
            nextDueDate.setDate(nextDueDate.getDate() + (nextInstallmentNumber * frequencyDays));

            // Retard = nombre de jours depuis que l'échéance est passée
            // Si nextDueDate est dans le futur ou aujourd'hui, pas de retard
            if (now > nextDueDate) {
              const diffTime = now.getTime() - nextDueDate.getTime();
              jours_retard = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            }
          }
      }

      return {
        ...credit,
        numero_credit: credit.numeroCredit,
        montant_principal: principal,
        nombre_echeances_total: totalEcheances,
        nombre_echeances_payees,
        jours_retard,
        clients: client ? {
          nom: client.nom,
          prenom: client.prenom,
          phone: client.telephone,
          photo_url: client.photoProfile
        } : undefined
      };
    });
  }
  
  export async function createCredit(insertCredit: InsertCredit): Promise<Credit> {
    const [credit] = await db.insert(credits).values(insertCredit).returning();
    return credit;
  }
  
  export async function updateCredit(id: string, updateData: Partial<InsertCredit>): Promise<Credit | undefined> {
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
  export async function getDemandeCredit(id: string): Promise<DemandeCredit | undefined> {
    const [demande] = await db.select().from(demandesCredit).where(and(eq(demandesCredit.id, id), sql`${demandesCredit.deletedAt} IS NULL`));
    return demande || undefined;
  }
  
  export async function getDemandesByClient(clientId: string): Promise<DemandeCredit[]> {
    return db.select().from(demandesCredit)
      .where(and(eq(demandesCredit.clientId, clientId), sql`${demandesCredit.deletedAt} IS NULL`))
      .orderBy(desc(demandesCredit.createdAt));
  }
  
  export async function getAllDemandes(filter: { agence?: string } = {}): Promise<DemandeCredit[]> {
    const conditions = [sql`${demandesCredit.deletedAt} IS NULL`];

    if (filter.agence && filter.agence !== "all") {
      conditions.push(eq(clients.agence, filter.agence));
    }
    
    let baseQuery = db.select({
      demande: demandesCredit,
      client: clients,
      agence: agences
    })
    .from(demandesCredit)
    .leftJoin(clients, eq(demandesCredit.clientId, clients.id))
    .leftJoin(agences, eq(clients.agenceId, agences.id))
    .$dynamic();

    if (conditions.length > 0) {
      baseQuery = baseQuery.where(and(...conditions));
    }
    
    const results = await baseQuery.orderBy(desc(demandesCredit.createdAt));

    return results.map(({ demande, client, agence }) => ({
      ...demande,
      numero_demande: demande.numeroDemande,
      montant_demande: Number(demande.montantDemande),
      clients: client ? {
        nom: client.nom,
        prenom: client.prenom,
        phone: client.telephone,
        photo_url: client.photoProfile,
        agence: client.agence || agence?.nom,
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
      if (insertDemande.dureeUnite === 'Jour') {
        dureeMois = Math.ceil(dureeMois / 30);
      } else if (insertDemande.dureeUnite === 'Semaine') {
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

    // Forcer le statut "En attente" - les frais d'engagement sont obligatoires avant toute enquête
    const demandeAvecStatut = {
      ...insertDemande,
      statut: 'En attente' as const, // Toujours "En attente" à la création
      fraisEngagementPayes: false,
      scoreCredit: scoreCredit ?? insertDemande.scoreCredit ?? null
    };
    const [demande] = await db.insert(demandesCredit).values(demandeAvecStatut).returning();
    return demande;
  }
  
  export async function updateDemandeCredit(id: string, updateData: Partial<InsertDemandeCredit>, tx?: PgTransaction<any, any, any>): Promise<DemandeCredit | undefined> {
    const [demande] = await (tx || db).update(demandesCredit).set(updateData).where(eq(demandesCredit.id, id)).returning();
    return demande || undefined;
  }

  export async function deleteDemandeCredit(id: string): Promise<boolean> {
    const [demande] = await db.update(demandesCredit).set({ deletedAt: new Date() }).where(eq(demandesCredit.id, id)).returning();
    return !!demande;
  }

  export async function cancelDemandeCredit(id: string, motif?: string): Promise<DemandeCredit | undefined> {
    const [demande] = await db.update(demandesCredit)
      .set({ 
        statut: 'Annulée' as any,
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
      client: clients
    })
    .from(enquetesCredit)
    .leftJoin(clients, eq(enquetesCredit.clientId, clients.id))
    .orderBy(desc(enquetesCredit.createdAt));
    
    return results.map(({ enquete, client }) => ({
      ...enquete,
      montant_demande: Number(enquete.montantDemande),
      clients: client ? {
        nom: client.nom,
        prenom: client.prenom,
        phone: client.telephone,
        photo_url: client.photoProfile
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

  
  // Comptes
  export async function getCompte(id: string): Promise<Compte | undefined> {
    const [compte] = await db.select().from(comptes).where(eq(comptes.id, id));
    return compte || undefined;
  }
  
  export async function getComptesByClient(clientId: string): Promise<Compte[]> {
    return db.select().from(comptes).where(eq(comptes.clientId, clientId));
  }
  
  export async function getAllComptes(filter: { agence?: string } = {}): Promise<Compte[]> {
    if (filter.agence) {
      const results = await db.select({ compte: comptes })
        .from(comptes)
        .innerJoin(clients, eq(comptes.clientId, clients.id))
        .where(eq(clients.agence, filter.agence))
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
    options: { search?: string; page?: number; limit?: number; typeCompte?: string } = {}
  ): Promise<{ data: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions: any[] = [];

    // Agency filter
    if (filter.agence && filter.agence !== 'all') {
      conditions.push(eq(clients.agence, filter.agence));
    }

    // Type filter
    if (options.typeCompte) {
      conditions.push(eq(comptes.typeCompte, options.typeCompte as any));
    }

    // Search filter (by client name or account number)
    if (options.search && options.search.trim()) {
      const searchTerm = `%${options.search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          sql`LOWER(${clients.nom}) LIKE ${searchTerm}`,
          sql`LOWER(${clients.prenom}) LIKE ${searchTerm}`,
          sql`LOWER(${users.nom}) LIKE ${searchTerm}`,
          sql`LOWER(${users.prenom}) LIKE ${searchTerm}`,
          sql`LOWER(${comptes.numeroCompte}) LIKE ${searchTerm}`,
          sql`LOWER(${clients.telephone}) LIKE ${searchTerm}`,
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
      user: users
    })
    .from(comptes)
    .leftJoin(clients, eq(comptes.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .orderBy(desc(comptes.createdAt))
    .limit(limit)
    .offset(offset);

    const results = whereClause 
      ? await dataQuery.where(whereClause)
      : await dataQuery;

    // Transform data with client info embedded
    const data = results.map(({ compte, client, user }) => ({
      ...compte,
      // Snake case aliases for frontend compatibility
      numero_compte: compte.numeroCompte,
      type_compte: compte.typeCompte,
      solde_courant: compte.soldeCourant,
      solde: compte.soldeCourant, // Alias for frontend
      client_id: compte.clientId,
      agence_id: compte.agenceId,
      blocage_actif: compte.blocageActif,
      blocage_motif: compte.blocageMotif,
      created_at: compte.createdAt,
      date_ouverture: compte.createdAt, // Alias for frontend
      // Embedded client info
      clients: client ? {
        id: client.id,
        nom: user?.nom || client.nom,
        prenom: user?.prenom || client.prenom,
        telephone: user?.telephone || client.telephone,
        phone: user?.telephone || client.telephone, // Alias
        email: user?.email || client.email,
        agence: client.agence,
        photo_url: user?.photoProfile || client.photoProfile
      } : null
    }));

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
      const prefix = data.typeCompte === 'Courant' ? 'CC' : 'CE';
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const numeroCompte = `${prefix}-${timestamp}-${random}`;

      // 2. Create Account
      const [compte] = await tx.insert(comptes).values({
        clientId,
        agenceId: data.agenceId, // Add this line
        numeroCompte,
        typeCompte: data.typeCompte as any,
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
          methodePaiement: (data.methodePaiement || 'Espèces') as any,
          observations: 'Solde initial à la création',
          createdBy: userId,
          typePaiement: (data.typeCompte === 'Courant' ? 'Dépôt Courant' : 'Dépôt Épargne') as any,
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
      eq(sessionsCaisse.statut, 'Ouverte')
    ));

    if (results.length === 0) return undefined;
    
    const r = results[0];
    return {
      ...r.session,
      caisse_nom: r.caisse_nom || 'Caisse Inconnue',
      caissier_nom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim() || 'Moi'
    };
  }

  export async function getActiveSessions(): Promise<SessionCaisse[]> {
    return db.select().from(sessionsCaisse).where(eq(sessionsCaisse.statut, 'Ouverte'));
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
      conditions.push(eq(sessionsCaisse.statut, filter.statut as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query.orderBy(desc(sessionsCaisse.dateOuverture));

    return results.map(r => ({
      ...r.session,
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

  export async function closeSessionCaisse(id: string, closeData: { soldeReel: string; ecart: string; billetageFermeture: any; observations?: string }): Promise<SessionCaisse | undefined> {
    const [session] = await db.update(sessionsCaisse)
      .set({
        ...closeData,
        statut: 'Fermée',
        dateFermeture: new Date(),
        soldeReel: closeData.soldeReel,
        ecart: closeData.ecart
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
    return db.select().from(sessionsCaisse).where(eq(sessionsCaisse.caissierId, caissierId)).orderBy(desc(sessionsCaisse.dateOuverture));
  }

  export async function getAllOperationsCaisse(): Promise<OperationCaisse[]> {
    return db.select().from(operationsCaisse).orderBy(desc(operationsCaisse.createdAt));
  }

  export async function getOperationsCaisseByDateRange(start: Date, end: Date): Promise<OperationCaisse[]> {
    return db.select().from(operationsCaisse)
      .where(and(gte(operationsCaisse.createdAt, start), lte(operationsCaisse.createdAt, end)))
      .orderBy(desc(operationsCaisse.createdAt));
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
        // For operationsCaisse table, only "Retrait épargne" exists as withdrawal type
        conditions.push(eq(operationsCaisse.typeOperation, 'Retrait épargne'));
      } else if (type === 'depot') {
        // For operationsCaisse table, only "Dépôt épargne" exists as deposit type
        conditions.push(eq(operationsCaisse.typeOperation, 'Dépôt épargne'));
      } else {
        // Direct enum value (e.g., "Décaissement crédit", "Remboursement crédit", etc.)
        conditions.push(eq(operationsCaisse.typeOperation, type as any));
      }
    }

    return db.select().from(operationsCaisse)
      .where(and(...conditions))
      .orderBy(desc(operationsCaisse.createdAt));
  }

  // Withdrawal types from typePaiementTerrainEnum
  const WITHDRAWAL_TYPES = [
    'Retrait Épargne',
    'Retrait Courant',
    'Retrait Bloqué',
    'Retrait Tontine',
  ] as const;

  // Deposit types from typePaiementTerrainEnum
  const DEPOSIT_TYPES = [
    'Dépôt Épargne',
    'Dépôt Courant',
    'Dépôt Bloqué',
    'Versement Tontine',
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
      eq(mouvementsFinanciers.statut, 'Posté'), // Only count posted transactions
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
      eq(sessionsCaisse.statut, 'Ouverte')
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

  // Shifts Caisse
  export async function getShiftCaisse(id: string): Promise<ShiftCaisse | undefined> {
    const [shift] = await db.select().from(shiftsCaisse).where(eq(shiftsCaisse.id, id));
    return shift || undefined;
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
    export async function getComptagesByShift(shiftId: string): Promise<ComptageBillets[]> {
         return db.select().from(comptageBillets).where(eq(comptageBillets.shiftId, shiftId));
    }
    export async function createComptageBillets(insertComptage: InsertComptageBillets): Promise<ComptageBillets> {
        const [comptage] = await db.insert(comptageBillets).values(insertComptage).returning();
        return comptage;
    }
    
    // Shifts - Additional
    export async function getActiveShiftByAgent(agentId: string): Promise<ShiftCaisse | undefined> {
        const [shift] = await db.select().from(shiftsCaisse)
            .where(and(eq(shiftsCaisse.agentId, agentId), eq(shiftsCaisse.statut, 'ouvert')));
        return shift || undefined;
    }
    
    export async function getShiftsByCaisse(caisseId: string): Promise<ShiftCaisse[]> {
        return db.select().from(shiftsCaisse).where(eq(shiftsCaisse.caisseId, caisseId)).orderBy(desc(shiftsCaisse.dateOuverture));
    }
    
    export async function getAllShiftsCaisse(): Promise<ShiftCaisse[]> {
        return db.select().from(shiftsCaisse).orderBy(desc(shiftsCaisse.dateOuverture));
    }
    
    export async function createShiftCaisse(insertShift: InsertShiftCaisse): Promise<ShiftCaisse> {
        const [shift] = await db.insert(shiftsCaisse).values(insertShift).returning();
        return shift || undefined; 
    }
    
    export async function updateShiftCaisse(id: string, updateData: Partial<InsertShiftCaisse>): Promise<ShiftCaisse | undefined> {
         const [shift] = await db.update(shiftsCaisse).set(updateData).where(eq(shiftsCaisse.id, id)).returning();
         return shift || undefined;
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
            eq(credits.statut, 'En cours'), 
            gt(credits.soldeRestant, "0")
        ];

        if (filter.agence) {
            conditions.push(eq(clients.agence, filter.agence));
        }

        const activeCredits = await db.select({
            credit: credits,
            client: clients
        })
        .from(credits)
        .innerJoin(clients, eq(credits.clientId, clients.id))
        .where(and(...conditions));
        const upcomingPayments: { client: string; amount: number; date: string; status: string }[] = [];
        const now = new Date();

        for (const { credit, client } of activeCredits) {
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
                        client: `${client?.nom} ${client?.prenom}`,
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
  typeTransaction: "Dépôt" | "Retrait" | "Intérêt" | "Frais" | "Ajustement";
  montant: string;
  methodePaiement: string;
  sessionCaisseId?: string;
  observations?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{ transaction: TransactionCompte; mouvement: MouvementFinancier }> {
  
  // Determine sens based on transaction type
  const isDebit = ["Retrait", "Frais"].includes(data.typeTransaction);
  const sens: SensMouvement = isDebit ? "Débit" : "Crédit";
  const delta = isDebit ? -parseFloat(data.montant) : parseFloat(data.montant);

  // Get compte for clientId
  const [compte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
  if (!compte) throw new Error(`Compte ${data.compteId} not found`);

  // Map typeTransaction to typePaiement for terrain enum
  const typePaiementMap: Record<string, string> = {
    "Dépôt": compte.typeCompte === "Courant" ? "Dépôt Courant" : "Dépôt Épargne",
    "Retrait": compte.typeCompte === "Courant" ? "Retrait Courant" : "Retrait Épargne",
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
 * Create an operation caisse with full ledger flow
 */
export async function createOperationCaisseWithLedger(data: {
  sessionId: string;
  typeOperation: string;
  montant: string;
  methodePaiement: string;
  clientId?: string;
  description?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{ operation: OperationCaisse; mouvement: MouvementFinancier }> {
  
  // Determine sens based on operation type
  const opLower = data.typeOperation.toLowerCase();
  const isDebit = opLower.startsWith("retrait") || 
                  opLower.startsWith("décaissement") || 
                  opLower.startsWith("sort") || // Sortie
                  opLower.startsWith("frais");
                  
  const sens: SensMouvement = isDebit ? "Débit" : "Crédit";
  const sessionDelta = isDebit ? -parseFloat(data.montant) : parseFloat(data.montant);

  // Get session for agenceId
  const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, data.sessionId));
  if (!session) throw new Error(`Session ${data.sessionId} not found`);

  // Generate reference
  const timestamp = Date.now().toString().slice(-8);
  const reference = `OP-${timestamp}-${Math.floor(Math.random() * 1000)}`;

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
    },
    async (tx, mouvement) => {
      // 1. Update session solde théorique
      const nouveauSolde = await updateSessionSolde(tx, data.sessionId, sessionDelta);

      // 2. Validate userId
      const validatedUserId = await validateUserId(tx, userId);

      // 3. Create operation caisse
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
  if (data.methodePaiement === 'Espèces' && !data.sessionCaisseId) {
      throw new Error("Une session de caisse active est requise pour les remboursements en espèces");
  }

  return executeWithLedger(
    "CREDIT",
    {
      montant: data.montant,
      sens: "Crédit", // Money coming in
      clientId: credit.clientId,
      creditId: data.creditId,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement: "Remboursement Crédit" as any,
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
  if (data.methodePaiement === 'Espèces' && !data.sessionCaisseId) {
      throw new Error("Une session de caisse active est requise pour le paiement des frais en espèces");
  }

  const ledgerResult = await executeWithLedger(
    "CREDIT",
    {
      montant: data.montant,
      sens: "Crédit", // L'argent entre dans l'institution
      clientId: demande.clientId,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement: "Frais Engagement" as any,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      // 2. Mettre à jour la demande
      const [updatedDemande] = await tx.update(demandesCredit)
        .set({ 
          fraisEngagementPayes: true, 
          montantFraisEngagement: data.montant,
          statut: "A enquêter" as any // Passe automatiquement à l'étape suivante
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
      typeDocument: "recu",
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
    statut: "payee",
    modePaiement: "Espèces",
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
    typeOperation: "Frais Engagement",
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
  const codeMap: Record<string, string> = {
    'Épargne': 'DEPOT_EPARGNE',
    'Courant': 'DEPOT_COURANT',
    'Bloqué': 'DEPOT_BLOQUE',
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
      typeDocument: "recu",
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
    statut: "payee",
    modePaiement: "Espèces",
    operationCaisseId: data.operationCaisseId,
    notes: `Dépôt sur compte ${data.typeCompte} N° ${data.numeroCompte}`,
  }).returning();
  
  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Dépôt - Compte ${data.typeCompte} N° ${data.numeroCompte}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: `Dépôt ${data.typeCompte}`,
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
  const codeMap: Record<string, string> = {
    'Épargne': 'RETRAIT_EPARGNE',
    'Courant': 'RETRAIT_COURANT',
    'Bloqué': 'RETRAIT_BLOQUE',
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
      typeDocument: "recu",
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
    statut: "payee",
    modePaiement: "Espèces",
    operationCaisseId: data.operationCaisseId,
    notes: `Retrait sur compte ${data.typeCompte} N° ${data.numeroCompte}`,
  }).returning();
  
  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Retrait - Compte ${data.typeCompte} N° ${data.numeroCompte}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: `Retrait ${data.typeCompte}`,
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
      typeDocument: "recu",
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
    statut: "payee",
    modePaiement: "Espèces",
    operationCaisseId: data.operationCaisseId,
    notes: `Remboursement crédit N° ${data.numeroCredit}`,
  }).returning();
  
  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Remboursement - Crédit N° ${data.numeroCredit}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "Remboursement Crédit",
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
      typeDocument: "recu",
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
    statut: "payee",
    modePaiement: "Espèces",
    operationCaisseId: data.operationCaisseId,
    notes: `Contribution tontine "${data.nomTontine}" - Tour ${data.tourNumero}`,
  }).returning();
  
  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Contribution - Tontine "${data.nomTontine}" - Tour ${data.tourNumero}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "Contribution Tontine",
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
            sens: "Crédit", // Money IN
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

    // 3. Check Balance
    const montant = parseFloat(data.montant);
    const soldeCoffre = parseFloat(targetCoffre.solde || "0");

    if (soldeCoffre < montant) {
        throw new Error(`Solde du coffre insuffisant (${soldeCoffre.toLocaleString()} < ${montant.toLocaleString()})`);
    }

    return executeWithLedger(
        "CREDIT",
        {
            montant: data.montant,
            sens: "Débit", // Money leaving the institution (to user account)
            clientId: credit.clientId,
            creditId: data.creditId,
            compteId: data.compteId, // Target Account
            methodePaiement: "Virement", // Internal Transfer
            typePaiement: "Décaissement Crédit",
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
                 typePaiement: "Décaissement Crédit",
                 montant: data.montant,
                 soldeApres: nouveauSoldeCompte,
                 methodePaiement: "Virement",
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
 * - Creates Ledger Entry
 * - Creates Transaction Record (if applicable)
 * - Creates Operation Record
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
  mouvement: MouvementFinancier 
}> {

  // 1. Determine direction and validation
  const opType = data.typeOperation.toLowerCase();
  
  // Define IN/OUT based on business logic
  // IN: Money comes INTO the cash box (Deposit, etc.)
  // OUT: Money goes OUT of the cash box (Withdrawal, etc.)
  const IN_TYPES = ['versement', 'dépôt', 'depot', 'depôt', 'dépôt épargne', 'encaissement', 'remboursement crédit'];
  const OUT_TYPES = ['retrait', 'retrait épargne', 'décaissement', 'décaissement crédit', 'frais'];

  let sens: SensMouvement;
  let cashDelta: number; // Impact on Cash Session
  let accountDelta: number = 0; // Impact on Client Account

  // Robust direction detection
  const isDebit = opType.startsWith('retrait') || 
                  opType.startsWith('décaissement') || 
                  opType.startsWith('frais') ||
                  OUT_TYPES.some(t => opType.includes(t));

  const isCredit = opType.startsWith('versement') || 
                   opType.startsWith('dépôt') || 
                   opType.startsWith('depot') || 
                   opType.startsWith('encaissement') || 
                   opType.startsWith('remboursement') ||
                   IN_TYPES.some(t => opType.includes(t));

  if (isCredit) {
      sens = "Crédit"; // Credit to the system (Cash in) or Account?
      // WAIT. "Versement" means + on Account (Credit) BUT + on Cash (Debit? No, Cash In is DEBIT for Caisse asset? Standard banking: Client Credit = Liability for bank. Caisse In = Asset increase.)
      // In this system:
      // "Crédit" usually means Money IN to the system/caisse?
      // Let's check sessionDelta in previous function. Debit = -, Credit = +. So Credit = Cash In.
      // Account Delta: Deposit -> + Balance.
      cashDelta = parseFloat(data.montant);
      accountDelta = parseFloat(data.montant); 
  } else if (isDebit) {
      sens = "Débit"; // Debit from system (Cash out)
      cashDelta = -parseFloat(data.montant);
      accountDelta = -parseFloat(data.montant); 
  } else {
      // Default or Neutral - Assume no cash impact unless specified? 
      // safer to require explicit types, but for now fallback to Neutral/Info
      sens = "Crédit"; 
      cashDelta = 0; 
  }

  // Double check Account CompteId if provided
  let compte: any; 
  if (data.compteId) {
      const [foundCompte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
      if (!foundCompte) throw new Error(`Compte ${data.compteId} not found`);
      compte = foundCompte;
  }

  // Get session
  const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, data.sessionId));
  if (!session) throw new Error(`Session ${data.sessionId} not found`);

  // Generate References
  const timestamp = Date.now().toString().slice(-8);
  const refRandom = Math.floor(Math.random() * 1000);
  const opReference = `OP-${timestamp}-${refRandom}`;
  
  // Ledger Execution
  return executeWithLedger(
    "CAISSE", // Source Module
    {
      montant: data.montant,
      sens,
      clientId: data.clientId,
      compteId: data.compteId, // Link to account if present
      sessionCaisseId: data.sessionId,
      agenceId: session.agenceId || undefined,
      methodePaiement: data.methodePaiement,
      typePaiement: data.typeOperation as any, // Map to Enum if needed, but string allowed usually
      idempotencyKey: data.idempotencyKey,
      referenceExterne: opReference
    },
    async (tx, mouvement) => {
      // 1. Update Session Balance (Atomic)
      const nouveauSoldeSession = await updateSessionSolde(tx, data.sessionId, cashDelta);

      // 2. Update Account Balance (Atomic) - ONLY if account implicated
      let nouveauSoldeCompte: string | undefined;
      let transaction: TransactionCompte | undefined;

      if (data.compteId && compte) {
          nouveauSoldeCompte = await updateCompteSolde(tx, data.compteId, accountDelta);
          
          // Map Transaction Type
          const transType = (accountDelta > 0) 
            ? (compte.typeCompte === 'Courant' ? 'Dépôt Courant' : 'Dépôt Épargne')
            : (compte.typeCompte === 'Courant' ? 'Retrait Courant' : 'Retrait Épargne');

          // Validate userId
          const validatedUserIdForTx = await validateUserId(tx, userId);

          // Create Transaction Record
          const [createdTx] = await tx.insert(transactionsCompte).values({
              compteId: data.compteId,
              mouvementId: mouvement.id,
              typePaiement: transType as any,
              montant: data.montant,
              soldeApres: nouveauSoldeCompte,
              methodePaiement: data.methodePaiement as any,
              observations: data.description || `Opération Caisse: ${data.typeOperation}`,
              createdBy: validatedUserIdForTx
          }).returning();
          transaction = createdTx;
      }

      // 3. Validate userId for operation
      const validatedUserIdForOp = await validateUserId(tx, userId);

      // 4. Create Operation Caisse Record
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
      }).returning();

      return {
        result: { operation, transaction },
        additionalEventData: {
          nouveauSoldeSession,
          nouveauSoldeCompte
        }
      };
    },
    userId
  ).then(({ result, mouvement }) => ({ ...result, mouvement }));
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
    if (transfert.statut !== 'En attente') throw new Error("Transfert déjà traité");

    // 2. Get Sessions
    const [sessionSource] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, transfert.sessionSourceId));
    const [sessionDest] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, sessionDestId));

    if (!sessionSource) throw new Error("Session source introuvable (archivée ou supprimée?)");
    if (!sessionDest) throw new Error("Session destination introuvable");
    if (sessionDest.statut !== 'Ouverte') throw new Error("La session de destination doit être ouverte");

    // Check Sufficient Funds
    const currentSolde = Number(sessionSource.soldeTheorique || sessionSource.soldeInitial || 0);
    const amount = Number(transfert.montant);

    if (currentSolde < amount) {
        throw new Error(`Solde insuffisant dans la caisse source (${currentSolde} < ${amount})`);
    }

    // 3. Process SOURCE (DEBIT / OUT)
    const refSource = `TRF-OUT-${transfert.reference}`;
    const mouvementSource = await createMouvementFinancier(tx, {
      montant: transfert.montant,
      sens: "Débit",
      sourceModule: "TRANSFERT",
      sessionCaisseId: sessionSource.id,
      agenceId: sessionSource.agenceId || undefined,
      typePaiement: "Transfert Caisse",
      referenceExterne: refSource,
      methodePaiement: "Virement",
      metadata: {
        description: `Transfert vers ${sessionDest.caisseId} (Ref: ${transfert.reference})`
      }
    }, userId);

    const soldeSource = await updateSessionSolde(tx, sessionSource.id, -parseFloat(transfert.montant));
    
    await tx.insert(operationsCaisse).values({
      sessionId: sessionSource.id,
      mouvementId: mouvementSource.id,
      typeOperation: "Transfert caisse" as any,
      montant: transfert.montant,
      methodePaiement: "Virement" as any,
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
      sens: "Crédit",
      sourceModule: "TRANSFERT",
      sessionCaisseId: sessionDest.id,
      agenceId: sessionDest.agenceId || undefined,
      typePaiement: "Transfert Caisse",
      referenceExterne: refDest,
      methodePaiement: "Virement",
      metadata: {
        description: `Réception transfert de ${sessionSource.caisseId} (Ref: ${transfert.reference})`
      }
    }, userId);

    const soldeDest = await updateSessionSolde(tx, sessionDest.id, parseFloat(transfert.montant));

    await tx.insert(operationsCaisse).values({
      sessionId: sessionDest.id,
      mouvementId: mouvementDest.id,
      typeOperation: "Transfert caisse" as any,
      montant: transfert.montant,
      methodePaiement: "Virement" as any,
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
        statut: 'Validé',
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
