import * as auth from "./auth";
import * as clients from "./clients";
import * as finance from "./finance";
import * as tontines from "./tontines";
import * as operations from "./operations";
import * as accounting from "./accounting";
import * as hr from "./hr";
import * as employesStorage from "./employes";

// Import types for IStorage interface definition
import {
    User, InsertUser, Client, InsertClient, Credit, InsertCredit, DemandeCredit, InsertDemandeCredit,
    EnqueteCredit, InsertEnqueteCredit, Remboursement, InsertRemboursement, Compte, InsertCompte,
    TransactionCompte, InsertTransactionCompte, PlanEpargne, InsertPlanEpargne, ObjectifEpargne, InsertObjectifEpargne,
    Tontine, InsertTontine, MembreTontine, InsertMembreTontine, ContributionTontine, InsertContributionTontine,
    TontineRegle, InsertTontineRegle, TontinePenalite, InsertTontinePenalite,
    TontinePlan, InsertTontinePlan,
    UserCreditPlan, InsertCreditPlan,
    SessionCaisse, InsertSessionCaisse, OperationCaisse, InsertOperationCaisse, AgentTerrain, InsertAgentTerrain,
    CaisseTransfert, InsertCaisseTransfert,
    Prospection, InsertProspection, VisiteTerrain, InsertVisiteTerrain, PaiementTerrain, InsertPaiementTerrain,
    Notification, InsertNotification, OtpValidation, InsertOtpValidation, PushSubscription, InsertPushSubscription,
    NotificationPreferences, InsertNotificationPreferences, PushNotificationLog, InsertPushNotificationLog,

    Caisse, InsertCaisse, ShiftCaisse, InsertShiftCaisse, ComptageBillets, InsertComptageBillets,
    ModeleFacture, InsertModeleFacture, Facture, InsertFacture, LigneFacture, InsertLigneFacture,

    PosDevice, InsertPosDevice, Employe, InsertEmploye, EmployeWithUser, Zone, InsertZone, Agence,
    
    // Accounting uses CompteComptable now
    CompteComptable, InsertCompteComptable, Journal, InsertJournal, Ecriture, InsertEcriture, DeclarationTva, InsertDeclarationTva,

    InsertAvantage, ObjectifMensuel, InsertObjectifMensuel,
    CaisseAssignation, InsertCaisseAssignation,
    DureeSuggeree, InsertDureeSuggeree
} from "@shared/schema";

export interface IStorage {
    // Users
    getUser(id: string): Promise<User | undefined>;
    getUserByUsername(username: string): Promise<User | undefined>;
    getAllUsers(): Promise<User[]>;
    createUser(user: InsertUser): Promise<User>;
    updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
    updateUserLocation(userId: string, latitude: string, longitude: string): Promise<void>;

    // Clients
    getClient(id: string): Promise<Client | undefined>;
    getAllClients(filter?: { agence?: string }): Promise<Client[]>;
    createClient(client: InsertClient): Promise<Client>;
    updateClient(id: string, client: Partial<InsertClient>): Promise<Client | undefined>;
    deleteClient(id: string): Promise<boolean>;

    // Credits
    getCredit(id: string): Promise<Credit | undefined>;
    getCreditsByClient(clientId: string): Promise<Credit[]>;
    getAllCredits(filter?: { agence?: string }): Promise<Credit[]>;
    getUpcomingEcheances(filter?: { agence?: string }): Promise<{ client: string; amount: number; date: string; status: string }[]>;
    createCredit(credit: InsertCredit): Promise<Credit>;
    updateCredit(id: string, credit: Partial<InsertCredit>): Promise<Credit | undefined>;

    // Credit Plans
    getCreditPlan(id: string): Promise<UserCreditPlan | undefined>;
    getAllCreditPlans(filter?: { actif?: boolean, agenceId?: string }): Promise<UserCreditPlan[]>;
    createCreditPlan(plan: InsertCreditPlan): Promise<UserCreditPlan>;
    updateCreditPlan(id: string, plan: Partial<InsertCreditPlan>): Promise<UserCreditPlan | undefined>;
    deleteCreditPlan(id: string): Promise<boolean>;

    // Demandes
    getDemandeCredit(id: string): Promise<DemandeCredit | undefined>;
    getDemandesByClient(clientId: string): Promise<DemandeCredit[]>;
    getAllDemandes(filter?: { agence?: string }): Promise<DemandeCredit[]>;
    createDemandeCredit(demande: InsertDemandeCredit): Promise<DemandeCredit>;
    updateDemandeCredit(id: string, demande: Partial<InsertDemandeCredit>): Promise<DemandeCredit | undefined>;
    deleteDemandeCredit(id: string): Promise<boolean>;
    cancelDemandeCredit(id: string, motif?: string): Promise<DemandeCredit | undefined>;
    payerFraisEngagement(data: {
      demandeId: string;
      montant: string;
      methodePaiement: string;
      sessionCaisseId?: string;
      idempotencyKey?: string;
    }, userId?: string): Promise<{ demande: DemandeCredit; operation: OperationCaisse; mouvement: any }>;


    // Enquetes
    getEnqueteCredit(id: string): Promise<EnqueteCredit | undefined>;
    getEnqueteByDemandeId(demandeId: string): Promise<EnqueteCredit[]>;
    getEnquetesByClient(clientId: string): Promise<EnqueteCredit[]>;
    getAllEnquetes(): Promise<EnqueteCredit[]>;
    createEnqueteCredit(enquete: InsertEnqueteCredit): Promise<EnqueteCredit>;
    updateEnqueteCredit(id: string, enquete: Partial<InsertEnqueteCredit>): Promise<EnqueteCredit | undefined>;

    // Remboursements
    getRemboursement(id: string): Promise<Remboursement | undefined>;
    getRemboursementsByCredit(creditId: string): Promise<Remboursement[]>;
    createRemboursement(remboursement: InsertRemboursement): Promise<Remboursement>;
    createRemboursementWithLedger(data: {
      creditId: string;
      montant: string;
      methodePaiement: string;
      sessionCaisseId?: string;
      observations?: string;
      idempotencyKey?: string;
    }, userId?: string): Promise<{ remboursement: Remboursement; mouvement: any }>;

    // Epargne (Comptes Bancaires)
    getCompte(id: string): Promise<Compte | undefined>;
    getComptesByClient(clientId: string): Promise<Compte[]>;
    getAllComptes(filter?: { agence?: string }): Promise<Compte[]>;
    createCompte(compte: InsertCompte): Promise<Compte>;
    updateCompte(id: string, compte: Partial<InsertCompte>): Promise<Compte | undefined>;
    createClientAccount(
      clientId: string,
      data: { typeCompte: string; soldeInitial: number; tauxInteret?: number; statut: string; methodePaiement?: string },
      userId: string | undefined
    ): Promise<Compte>;
    updateClientAccount(id: string, updateData: { typeCompte?: string; tauxInteret?: string; statut?: string; solde?: string }): Promise<Compte | undefined>;

    getTransactionCompte(id: string): Promise<TransactionCompte | undefined>;
    getTransactionsByCompte(compteId: string): Promise<TransactionCompte[]>;
    createTransactionCompte(transaction: InsertTransactionCompte): Promise<TransactionCompte>;
    createTransactionCompteWithLedger(data: {
      compteId: string;
      typeTransaction: "Dépôt" | "Retrait" | "Intérêt" | "Frais" | "Ajustement";
      montant: string;
      methodePaiement: string;
      sessionCaisseId?: string;
      observations?: string;
      idempotencyKey?: string;
    }, userId?: string): Promise<{ transaction: TransactionCompte; mouvement: any }>;

    // Mouvements Financiers (Central Ledger)
    getMouvementsFinanciers(filter?: {
      sourceModule?: string;
      clientId?: string;
      compteId?: string;
      creditId?: string;
      sessionCaisseId?: string;
      from?: Date;
      to?: Date;
      limit?: number;
    }): Promise<any[]>;
    getClientPortfolio(clientId: string): Promise<{
      comptes: Compte[];
      credits: Credit[];
      tontines: any[];
    }>;
    getPlanEpargne(id: string): Promise<PlanEpargne | undefined>;
    getPlansByCredit(creditId: string): Promise<PlanEpargne[]>;
    getPlansByClient(clientId: string): Promise<PlanEpargne[]>;
    createPlanEpargne(plan: InsertPlanEpargne): Promise<PlanEpargne>;

    getObjectifEpargne(id: string): Promise<ObjectifEpargne | undefined>;
    getObjectifsByCompte(compteId: string): Promise<ObjectifEpargne[]>;
    createObjectifEpargne(objectif: InsertObjectifEpargne): Promise<ObjectifEpargne>;
    updateObjectifEpargne(id: string, updateData: Partial<InsertObjectifEpargne>): Promise<ObjectifEpargne | undefined>;
    deleteObjectifEpargne(id: string): Promise<boolean>;

    // Tontines
    getTontine(id: string): Promise<Tontine | undefined>;
    getAllTontines(filter?: { agence?: string }): Promise<Tontine[]>;
    createTontine(tontine: InsertTontine): Promise<Tontine>;
    updateTontine(id: string, tontine: Partial<InsertTontine>): Promise<Tontine | undefined>;
    deleteTontine(id: string): Promise<boolean>;

    getMembresTontine(tontineId: string): Promise<any[]>;
    getTontinesByClient(clientId: string): Promise<Array<MembreTontine & { tontine: Tontine }>>;
    getMembreTontineByClientAndTontine(clientId: string, tontineId: string): Promise<MembreTontine | undefined>;
    updateMembreTontine(id: string, membre: Partial<InsertMembreTontine>): Promise<MembreTontine | undefined>;
    createMembreTontine(membre: InsertMembreTontine): Promise<MembreTontine>;

    getContributionsByTontine(tontineId: string): Promise<ContributionTontine[]>;
    getContributionsByMembre(membreId: string): Promise<ContributionTontine[]>;
    createContributionTontine(contribution: InsertContributionTontine): Promise<ContributionTontine>;
    createContributionTontineWithLedger(
      data: InsertContributionTontine,
      sessionCaisseId?: string,
      userId?: string
    ): Promise<ContributionTontine>;

    getTontineRegles(tontineId: string): Promise<TontineRegle[]>;
    createTontineRegle(regle: InsertTontineRegle): Promise<TontineRegle>;
    updateTontineRegle(id: string, regle: Partial<InsertTontineRegle>): Promise<TontineRegle | undefined>;
    deleteTontineRegle(id: string): Promise<boolean>;

    getTontinePenalites(tontineId: string): Promise<any[]>;
    updateTontinePenalite(id: string, penalite: Partial<InsertTontinePenalite>): Promise<TontinePenalite | undefined>;

    // Tontine Plans
    getTontinePlan(id: string): Promise<TontinePlan | undefined>;
    getAllTontinePlans(filter?: { agenceId?: string; actif?: boolean }): Promise<TontinePlan[]>;
    createTontinePlan(plan: InsertTontinePlan): Promise<TontinePlan>;
    updateTontinePlan(id: string, plan: Partial<InsertTontinePlan>): Promise<TontinePlan | undefined>;
    deleteTontinePlan(id: string): Promise<boolean>;

    // Sessions Caisse
    getSessionCaisse(id: string): Promise<SessionCaisse | undefined>;
    getActiveSessionForUser(userId: string): Promise<any | undefined>;
    getActiveSessions(): Promise<SessionCaisse[]>;
    getAllSessionsCaisse(filter?: { agence?: string }): Promise<any[]>;
    createSessionCaisse(session: InsertSessionCaisse): Promise<SessionCaisse>;
    updateSessionCaisse(id: string, updateData: Partial<InsertSessionCaisse>): Promise<SessionCaisse | undefined>;
    closeSessionCaisse(id: string, closeData: { soldeReel: string; ecart: string; billetageFermeture: any; observations?: string }): Promise<SessionCaisse | undefined>;
    getSessionsByCaissier(caissierId: string): Promise<SessionCaisse[]>;

    // Operations Caisse
    getOperationsBySession(sessionId: string): Promise<OperationCaisse[]>;
    getAllOperationsCaisse(): Promise<OperationCaisse[]>;
    getOperationsCaisseByDateRange(start: Date, end: Date): Promise<OperationCaisse[]>;
    getOperationsByClientAndDateRange(clientId: string, start: Date, end: Date, type?: string): Promise<OperationCaisse[]>;
    getMouvementsByClientAndDateRange(clientId: string, start: Date, end: Date, type?: 'retrait' | 'depot' | string): Promise<any[]>;
    createOperationCaisse(operation: InsertOperationCaisse): Promise<OperationCaisse>;
    updateOperationCaisse(id: string, operation: Partial<InsertOperationCaisse>): Promise<OperationCaisse | undefined>;

    // Caisse Management (Physical)
    getCaisse(id: string): Promise<Caisse | undefined>;
    getCaissesByAgence(agenceId: string): Promise<Caisse[]>;
    getAllCaisses(): Promise<Caisse[]>;
    createCaisse(caisse: InsertCaisse): Promise<Caisse>;
    updateCaisse(id: string, caisse: Partial<InsertCaisse>): Promise<Caisse | undefined>;
    deleteCaisse(id: string): Promise<boolean>;

    // Agents Terrain
    getAgentTerrain(id: string): Promise<AgentTerrain | undefined>;
    getAllAgentsTerrain(): Promise<any[]>;
    createAgentTerrain(agent: InsertAgentTerrain): Promise<AgentTerrain>;
    updateAgentTerrain(id: string, agent: Partial<InsertAgentTerrain>): Promise<AgentTerrain | undefined>;
    getAgentStats(agentId: string, options?: { dateFrom?: Date; dateTo?: Date }): Promise<{
        totalCollecte: number;
        nombrePaiements: number;
        collectesJour: number;
        collectesSemaine: number;
        collectesMois: number;
    }>;

    // Prospections
    getProspection(id: string): Promise<Prospection | undefined>;
    getProspectionsByAgent(agentId: string): Promise<Prospection[]>;
    getAllProspections(): Promise<Prospection[]>;
    createProspection(prospection: InsertProspection): Promise<Prospection>;
    updateProspection(id: string, prospection: Partial<InsertProspection>): Promise<Prospection | undefined>;

    // Caisse Transferts
    getCaisseTransfert(id: string): Promise<CaisseTransfert | undefined>;
    getCaisseTransferts(agenceId?: string): Promise<CaisseTransfert[]>;
    createCaisseTransfert(transfert: InsertCaisseTransfert): Promise<CaisseTransfert>;
    updateCaisseTransfert(id: string, updateData: Partial<InsertCaisseTransfert>): Promise<CaisseTransfert | undefined>;


    // Visites
    getVisiteTerrain(id: string): Promise<VisiteTerrain | undefined>;
    getVisitesByAgent(agentId: string): Promise<VisiteTerrain[]>;
    getAllVisitesTerrain(): Promise<VisiteTerrain[]>;
    createVisiteTerrain(visite: InsertVisiteTerrain): Promise<VisiteTerrain>;
    updateVisiteTerrain(id: string, visite: Partial<InsertVisiteTerrain>): Promise<VisiteTerrain | undefined>;

    // Paiements
    getPaiementTerrain(id: string): Promise<PaiementTerrain | undefined>;
    getPaiementsByAgent(agentId: string): Promise<PaiementTerrain[]>;
    getAllPaiementsTerrain(): Promise<PaiementTerrain[]>;
    getPendingPaiementsByAgence(agenceId?: string): Promise<PaiementTerrain[]>;
    createPaiementTerrain(paiement: InsertPaiementTerrain): Promise<PaiementTerrain>;
    createPaiementTerrainWithLedger(data: {
      agentId: string;
      clientId: string;
      creditId?: string;
      compteId?: string;
      montant: string;
      typePaiement: string;
      latitude?: string;
      longitude?: string;
      idempotencyKey?: string;
    }, userId?: string): Promise<{ paiement: PaiementTerrain; mouvement: any }>;
    updatePaiementTerrain(id: string, paiement: Partial<InsertPaiementTerrain>): Promise<PaiementTerrain | undefined>;
    createPendingPaiementTerrain(data: {
      agentId: string;
      clientId: string;
      visiteId?: string;
      creditId?: string;
      compteId?: string;
      tontineId?: string;
      membreId?: string;
      montant: string;
      typePaiement: string;
      methodePaiement: string;
      numeroTelephone?: string;
      numeroTransaction?: string;
      reference: string;
      notes?: string;
      latitude?: string;
      longitude?: string;
      idempotencyKey?: string;
      presenceVerification?: any;
    }, userId?: string): Promise<PaiementTerrain>;
    validatePaiementTerrain(paiementId: string, validatedBy: string): Promise<{ paiement: PaiementTerrain; mouvement: any }>;
    rejectPaiementTerrain(id: string, reason: string): Promise<PaiementTerrain>;

    // Zones
    getZone(id: string): Promise<Zone | undefined>;
    getAllZones(): Promise<Zone[]>;
    createZone(zone: InsertZone): Promise<Zone>;

    // Objectifs Mensuels
    getObjectifMensuel(agentId: string, annee: number, mois: number): Promise<ObjectifMensuel | undefined>;
    getObjectifsMensuelsByAgent(agentId: string, annee?: number): Promise<ObjectifMensuel[]>;
    getCurrentObjectifMensuel(agentId: string): Promise<ObjectifMensuel | undefined>;
    createOrUpdateObjectifMensuel(data: InsertObjectifMensuel): Promise<ObjectifMensuel>;

    // Notifications
    getNotification(id: string): Promise<Notification | undefined>;
    getNotificationsByUser(userId: string): Promise<Notification[]>;
    getAllNotifications(): Promise<Notification[]>;
    getUnreadNotifications(userId?: string): Promise<Notification[]>;
    createNotification(notification: InsertNotification): Promise<Notification>;
    markNotificationAsRead(id: string): Promise<Notification | undefined>;
    markAllNotificationsAsRead(userId: string): Promise<void>;
    deleteNotification(id: string): Promise<boolean>;

    // Types Marches
    getAllTypesMarches(): Promise<any[]>;

    // OTP
    createOtpValidation(otp: InsertOtpValidation): Promise<OtpValidation>;
    getOtpByReference(transactionReference: string): Promise<OtpValidation | undefined>;
    updateOtpStatus(id: string, status: string, attempts?: number): Promise<OtpValidation | undefined>;
    updateOtpAttempts(id: string, attempts: number): Promise<OtpValidation | undefined>;
    validateOtp(id: string, validatedBy?: string, validatedByName?: string, validatedByRole?: string): Promise<OtpValidation | undefined>;

    // Push Subscriptions
    createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription>;
    getPushSubscriptionsByUser(userId: string): Promise<PushSubscription[]>;
    getAllActivePushSubscriptions(): Promise<PushSubscription[]>;
    updatePushSubscription(id: string, data: Partial<InsertPushSubscription>): Promise<PushSubscription | undefined>;
    deletePushSubscription(id: string): Promise<boolean>;
    deletePushSubscriptionByEndpoint(endpoint: string): Promise<boolean>;

    // Notification Preferences
    getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined>;
    createNotificationPreferences(preferences: InsertNotificationPreferences): Promise<NotificationPreferences>;
    updateNotificationPreferences(userId: string, preferences: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences | undefined>;

    // Push Logs
    createPushNotificationLog(log: InsertPushNotificationLog): Promise<PushNotificationLog>;
    updatePushNotificationLog(id: string, data: Partial<InsertPushNotificationLog>): Promise<PushNotificationLog | undefined>;
    getPushNotificationLogsByUser(userId: string): Promise<PushNotificationLog[]>;

    // Caisses
    getAllAgences(): Promise<Agence[]>;
    getCaisse(id: string): Promise<Caisse | undefined>;
    getCaissesByAgence(agenceId: string): Promise<Caisse[]>;
    getAllCaisses(): Promise<Caisse[]>;
    createCaisse(caisse: InsertCaisse): Promise<Caisse>;
    updateCaisse(id: string, caisse: Partial<InsertCaisse>): Promise<Caisse | undefined>;
    getCaisseAssignments(caisseId: string): Promise<CaisseAssignation[]>;
    getUserCaisseAssignments(userId: string): Promise<CaisseAssignation[]>;
    setCaisseAssignments(caisseId: string, userIds: string[], assignedBy: string): Promise<void>;
    getCaissesWithStatus(agenceId?: string): Promise<any[]>;

    // Shifts
    getShiftCaisse(id: string): Promise<ShiftCaisse | undefined>;
    getActiveShiftByAgent(caisseAgentId: string): Promise<ShiftCaisse | undefined>;
    getShiftsByCaisse(caisseAgentId: string): Promise<ShiftCaisse[]>;
    getAllShiftsCaisse(): Promise<ShiftCaisse[]>;
    createShiftCaisse(shift: InsertShiftCaisse): Promise<ShiftCaisse>;
    updateShiftCaisse(id: string, shift: Partial<InsertShiftCaisse>): Promise<ShiftCaisse | undefined>;

    // Comptage Billets
    getComptageBillets(id: string): Promise<ComptageBillets | undefined>;
    getComptagesByShift(shiftId: string): Promise<ComptageBillets[]>;
    createComptageBillets(comptage: InsertComptageBillets): Promise<ComptageBillets>;

    // Modeles Factures
    getModeleFacture(id: string): Promise<ModeleFacture | undefined>;
    getModeleFactureByCode(code: string): Promise<ModeleFacture | undefined>;
    getAllModelesFactures(): Promise<ModeleFacture[]>;
    createModeleFacture(modele: InsertModeleFacture): Promise<ModeleFacture>;
    updateModeleFacture(id: string, modele: Partial<InsertModeleFacture>): Promise<ModeleFacture | undefined>;
    incrementModeleFactureNumero(id: string): Promise<number>;

    // Factures
    getFacture(id: string): Promise<Facture | undefined>;
    getFactureByNumero(numero: string): Promise<Facture | undefined>;
    getFacturesByClient(clientId: string): Promise<Facture[]>;
    getFacturesByAgent(agentId: string): Promise<Facture[]>;
    getAllFactures(): Promise<Facture[]>;
    createFacture(facture: InsertFacture): Promise<Facture>;
    updateFacture(id: string, facture: Partial<InsertFacture>): Promise<Facture | undefined>;

    // Lignes Factures
    getLignesByFacture(factureId: string): Promise<LigneFacture[]>;
    createLigneFacture(ligne: InsertLigneFacture): Promise<LigneFacture>;

    // POS Devices
    getPosDevice(id: string): Promise<PosDevice | undefined>;
    getPosDevicesByAgent(agentId: string): Promise<PosDevice[]>;
    getAllPosDevices(): Promise<PosDevice[]>;
    createPosDevice(device: InsertPosDevice): Promise<PosDevice>;
    updatePosDevice(id: string, device: Partial<InsertPosDevice>): Promise<PosDevice | undefined>;

    // Employes (nouvelle architecture avec users)
    getEmploye(id: string): Promise<Employe | undefined>;
    getEmployeByUserId(userId: string): Promise<Employe | undefined>;
    getEmployeWithUser(id: string): Promise<EmployeWithUser | undefined>;
    getAllEmployes(): Promise<Employe[]>;
    getAllEmployesWithUsers(): Promise<EmployeWithUser[]>;
    getEmployesByAgence(agenceId: string): Promise<EmployeWithUser[]>;
    createEmploye(employe: InsertEmploye): Promise<Employe>;
    createEmployeForUser(userId: string, employeData: Omit<InsertEmploye, 'userId'>): Promise<Employe>;
    updateEmploye(id: string, employe: Partial<InsertEmploye>): Promise<Employe | undefined>;
    updateEmployeWithUser(employeId: string, userData?: Partial<{ nom: string; prenom: string; email: string; telephone: string; sexe: string; photoProfile: string; statut: string; }>, employeData?: Partial<InsertEmploye>): Promise<EmployeWithUser | undefined>;
    deleteEmploye(id: string): Promise<boolean>;

    // Accounting
    getAllComptesComptables(): Promise<CompteComptable[]>;
    getComptesComptablesByClasse(classe: number): Promise<CompteComptable[]>;
    createCompteComptable(compte: InsertCompteComptable): Promise<CompteComptable>;

    getAllJournaux(): Promise<Journal[]>;
    createJournal(journal: InsertJournal): Promise<Journal>;

    getAllEcritures(filter?: { journalId?: string; dateDebut?: string; dateFin?: string }): Promise<any[]>;
    createEcriture(ecriture: InsertEcriture, lignes: any[]): Promise<Ecriture>;
    getGrandLivre(compteId: string, dateDebut: string, dateFin: string): Promise<any[]>;

    getDeclarationsTva(): Promise<DeclarationTva[]>;
    createDeclarationTva(declaration: InsertDeclarationTva): Promise<DeclarationTva>;

    getBalance(dateDebut: string, dateFin: string): Promise<any[]>;
    getJournauxStats(): Promise<any[]>;
    getBilan(dateFin: string): Promise<any>;

    // Loyalty
    addLoyaltyPoints(clientId: string, points: number, source: string, description?: string, transactionAmount?: number): Promise<void>;
    calculateEngagementScore(clientId: string): Promise<number>;
    getLoyaltyHistory(clientId: string): Promise<any[]>;

    // HR
    getConges(filter?: { statut?: string; employeId?: string }): Promise<any[]>;
    createConge(conge: any): Promise<any>;
    updateCongeStatus(id: number, status: string, userId: string, commentaire?: string): Promise<any>;

    getFormations(statut?: string): Promise<any[]>;
    createFormation(formation: any): Promise<any>;

    getSanctions(employeId?: string): Promise<any[]>;
    createSanction(sanction: any): Promise<any>;

    getCandidatures(statut?: string): Promise<any[]>;

    getBulletins(employeId?: string): Promise<any[]>;

    getAllAvantages(): Promise<InsertAvantage[]>;
    getAvantagesEmploye(employeId: string): Promise<any[]>;
    assignAvantage(data: any): Promise<any>;

    getPresenceAujourdhui(): Promise<any>;
    checkIn(employeId: string): Promise<any>;
    checkOut(employeId: string): Promise<any>;
    startBreak(employeId: string): Promise<any>;
    endBreak(employeId: string): Promise<any>;
    getOrganigramme(agenceId?: string): Promise<any[]>;
    getHrStats(): Promise<any>;

    createBulletinPaie(data: any): Promise<any>;
    updateBulletinStatut(id: number, statut: string): Promise<any>;
    generateMonthlyPaie(mois: string, genereParId?: string): Promise<any[]>;

    // Durees Suggerees (Credit)
    getDureesSuggerees(frequence?: string): Promise<DureeSuggeree[]>;
    getDureeSuggereeRecommandee(frequence: string): Promise<DureeSuggeree | undefined>;
    createDureeSuggeree(duree: InsertDureeSuggeree): Promise<DureeSuggeree>;
    updateDureeSuggeree(id: string, duree: Partial<InsertDureeSuggeree>): Promise<DureeSuggeree | undefined>;
    deleteDureeSuggeree(id: string): Promise<boolean>;
}

// Aggregate all helper/modules into one object
export const storage: IStorage = {
    ...auth,
    ...clients,
    ...finance,
    ...tontines,
    ...operations,
    ...accounting,
    ...hr,
    ...employesStorage
};
