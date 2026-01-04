import { 
    credits, demandesCredit, enquetesCredit, remboursements, 
    comptesEpargne, transactionsEpargne, plansEpargne, objectifsEpargne,
    sessionsCaisse, operationsCaisse, shiftsCaisse, caisseSecurityCodes, caisseCodeUsages, comptageBillets,
    factures, lignesFactures, modelesFactures, caisses, clients, agences, caisseAssignations, users
  } from "@shared/schema";
  import { 
    type Credit, type InsertCredit, type DemandeCredit, type InsertDemandeCredit, 
    type EnqueteCredit, type InsertEnqueteCredit, type Remboursement, type InsertRemboursement,
    type CompteEpargne, type InsertCompteEpargne, type TransactionEpargne, type InsertTransactionEpargne,
    type PlanEpargne, type InsertPlanEpargne, type ObjectifEpargne, type InsertObjectifEpargne,
    type SessionCaisse, type InsertSessionCaisse, type OperationCaisse, type InsertOperationCaisse,
    type ShiftCaisse, type InsertShiftCaisse, type ComptageBillets, type InsertComptageBillets,
    type Facture, type InsertFacture, type LigneFacture, type InsertLigneFacture,
    type ModeleFacture, type InsertModeleFacture, type Caisse, type InsertCaisse,
    caisseTransferts, type CaisseTransfert, type InsertCaisseTransfert,
    type Agence, type CaisseAssignation
  } from "@shared/schema";
  import { db } from "../db";
import { eq, desc, and, or, gte, lte, gt, count, inArray } from "drizzle-orm";


  
  // Credits
  export async function getCredit(id: string): Promise<Credit | undefined> {
    const [credit] = await db.select().from(credits).where(eq(credits.id, id));
    return credit || undefined;
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
    const creditIds = results.map(({ credit }) => credit.id);
    const remboursementCounts = creditIds.length
      ? await db.select({
          creditId: remboursements.creditId,
          count: count()
        })
        .from(remboursements)
        .where(inArray(remboursements.creditId, creditIds))
        .groupBy(remboursements.creditId)
      : [];
    const remboursementCountByCreditId = new Map(
      remboursementCounts.map((row) => [row.creditId, Number(row.count)])
    );

    return results.map(({ credit, client }) => ({
      ...credit,
      numero_credit: credit.numeroCredit,
      montant_principal: Number(credit.montant),
      nombre_echeances_total: credit.duree,
      nombre_echeances_payees: remboursementCountByCreditId.get(credit.id) ?? 0,
      clients: client ? {
        nom: client.nom,
        prenom: client.prenom,
        phone: client.telephone,
        photo_url: client.photoProfile
      } : undefined
    }));
  }
  
  export async function createCredit(insertCredit: InsertCredit): Promise<Credit> {
    const [credit] = await db.insert(credits).values(insertCredit).returning();
    return credit;
  }
  
  export async function updateCredit(id: string, updateData: Partial<InsertCredit>): Promise<Credit | undefined> {
    const [credit] = await db.update(credits).set({ ...updateData, updatedAt: new Date() }).where(eq(credits.id, id)).returning();
    return credit || undefined;
  }
  
  // Demandes Credit
  export async function getDemandeCredit(id: string): Promise<DemandeCredit | undefined> {
    const [demande] = await db.select().from(demandesCredit).where(eq(demandesCredit.id, id));
    return demande || undefined;
  }
  
  export async function getDemandesByClient(clientId: string): Promise<DemandeCredit[]> {
    return db.select().from(demandesCredit).where(eq(demandesCredit.clientId, clientId)).orderBy(desc(demandesCredit.createdAt));
  }
  
  export async function getAllDemandes(filter: { agence?: string } = {}): Promise<DemandeCredit[]> {
    const conditions = [];

    if (filter.agence && filter.agence !== "all") {
      conditions.push(eq(clients.agence, filter.agence));
    }
    
    let baseQuery = db.select({
      demande: demandesCredit,
      client: clients
    })
    .from(demandesCredit)
    .leftJoin(clients, eq(demandesCredit.clientId, clients.id)).$dynamic();

    if (conditions.length > 0) {
      baseQuery = baseQuery.where(and(...conditions));
    }
    
    const results = await baseQuery.orderBy(desc(demandesCredit.createdAt));

    return results.map(({ demande, client }) => ({
      ...demande,
      numero_demande: demande.numeroDemande,
      montant_demande: Number(demande.montantDemande),
      clients: client ? {
        nom: client.nom,
        prenom: client.prenom,
        phone: client.telephone,
        photo_url: client.photoProfile
      } : undefined
    }));
  }
  
  export async function createDemandeCredit(insertDemande: InsertDemandeCredit): Promise<DemandeCredit> {
    const [demande] = await db.insert(demandesCredit).values(insertDemande).returning();
    return demande;
  }
  
  export async function updateDemandeCredit(id: string, updateData: Partial<InsertDemandeCredit>): Promise<DemandeCredit | undefined> {
    const [demande] = await db.update(demandesCredit).set(updateData).where(eq(demandesCredit.id, id)).returning();
    return demande || undefined;
  }
  
  // Enquêtes
  export async function getEnqueteCredit(id: string): Promise<EnqueteCredit | undefined> {
    const [enquete] = await db.select().from(enquetesCredit).where(eq(enquetesCredit.id, id));
    return enquete || undefined;
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
  
  // Comptes Epargne
  export async function getCompteEpargne(id: string): Promise<CompteEpargne | undefined> {
    const [compte] = await db.select().from(comptesEpargne).where(eq(comptesEpargne.id, id));
    return compte || undefined;
  }
  
  export async function getComptesByClient(clientId: string): Promise<CompteEpargne[]> {
    return db.select().from(comptesEpargne).where(eq(comptesEpargne.clientId, clientId));
  }
  
  export async function getAllComptesEpargne(filter: { agence?: string } = {}): Promise<CompteEpargne[]> {
    if (filter.agence) {
      const results = await db.select({ compte: comptesEpargne })
        .from(comptesEpargne)
        .innerJoin(clients, eq(comptesEpargne.clientId, clients.id))
        .where(eq(clients.agence, filter.agence))
        .orderBy(desc(comptesEpargne.dateOuverture));
      return results.map(r => r.compte);
    }
    return db.select().from(comptesEpargne).orderBy(desc(comptesEpargne.dateOuverture));
  }
  
  export async function createCompteEpargne(insertCompte: InsertCompteEpargne): Promise<CompteEpargne> {
    const [compte] = await db.insert(comptesEpargne).values(insertCompte).returning();
    return compte;
  }
  
  export async function updateCompteEpargne(id: string, updateData: Partial<InsertCompteEpargne>): Promise<CompteEpargne | undefined> {
    const [compte] = await db.update(comptesEpargne).set({ ...updateData, updatedAt: new Date() }).where(eq(comptesEpargne.id, id)).returning();
    return compte || undefined;
  }
  
  // Transactions Epargne
  export async function getTransactionEpargne(id: string): Promise<TransactionEpargne | undefined> {
    const [transaction] = await db.select().from(transactionsEpargne).where(eq(transactionsEpargne.id, id));
    return transaction || undefined;
  }
  
  export async function getTransactionsByCompte(compteId: string): Promise<TransactionEpargne[]> {
    return db.select().from(transactionsEpargne).where(eq(transactionsEpargne.compteId, compteId)).orderBy(desc(transactionsEpargne.createdAt));
  }
  
  export async function createTransactionEpargne(insertTransaction: InsertTransactionEpargne): Promise<TransactionEpargne> {
    const [transaction] = await db.insert(transactionsEpargne).values(insertTransaction).returning();
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

  export async function getActiveSessions(): Promise<SessionCaisse[]> {
    return db.select().from(sessionsCaisse).where(eq(sessionsCaisse.statut, 'Ouverte'));
  }

  export async function getAllSessionsCaisse(filter: { agence?: string } = {}): Promise<any[]> {
    let query = db.select({
      session: sessionsCaisse,
      caissier_nom: users.nom,
      caissier_prenom: users.prenom
    })
    .from(sessionsCaisse)
    .leftJoin(users, eq(sessionsCaisse.caissierId, users.id));

    if (filter.agence) {
      query = query.where(eq(sessionsCaisse.agenceId, filter.agence)) as any;
    }

    const results = await query.orderBy(desc(sessionsCaisse.dateOuverture));

    return results.map(r => ({
      ...r.session,
      caissier_nom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim() || 'Caissier Inconnu'
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
      conditions.push(eq(operationsCaisse.typeOperation, type));
    }

    return db.select().from(operationsCaisse)
      .where(and(...conditions))
      .orderBy(desc(operationsCaisse.createdAt));
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

    export async function getCaisseTransferts(agenceId?: string): Promise<CaisseTransfert[]> {
        if (agenceId) {
            return db.select()
                .from(caisseTransferts)
                .where(or(
                    eq(caisseTransferts.agenceSourceId, agenceId), 
                    eq(caisseTransferts.agenceDestId, agenceId)
                ))
                .orderBy(desc(caisseTransferts.dateCreation));
        }
        
        return db.select()
            .from(caisseTransferts)
            .orderBy(desc(caisseTransferts.dateCreation));
    }

    export async function getCaisseTransfertsByAgence(agenceId: string): Promise<CaisseTransfert[]> {
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
