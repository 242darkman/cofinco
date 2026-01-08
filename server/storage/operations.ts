import { agentsTerrain, prospections, visitesTerrain, paiementsTerrain, employes, posDevices, notifications, otpValidations, zones, objectifsMensuels } from "@shared/schema";
import { type AgentTerrain, type InsertAgentTerrain, type Prospection, type InsertProspection, type VisiteTerrain, type InsertVisiteTerrain, type PaiementTerrain, type InsertPaiementTerrain, type Employe, type InsertEmploye, type PosDevice, type InsertPosDevice, type Notification, type InsertNotification, type OtpValidation, type InsertOtpValidation, type Zone, type InsertZone, type ObjectifMensuel, type InsertObjectifMensuel } from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, sql, gte } from "drizzle-orm";

// Agents Terrain
export async function getAgentTerrain(id: string): Promise<AgentTerrain | undefined> {
  const [agent] = await db.select().from(agentsTerrain).where(eq(agentsTerrain.id, id));
  return agent || undefined;
}

export async function getAllAgentsTerrain(): Promise<any[]> {
  const agents = await db.select().from(agentsTerrain).orderBy(desc(agentsTerrain.createdAt));
  
  const enrichedAgents = await Promise.all(agents.map(async (agent) => {
    // 1. Nombre de clients (distinct clients visited or having paid)
    // Using simple count of related visits/payments for now as proxy if exact portfolio not defined
    const clientsCount = await db
      .select({ count: sql<number>`count(distinct ${visitesTerrain.clientId})` })
      .from(visitesTerrain)
      .where(eq(visitesTerrain.agentId, agent.id));
      
    // 2. Collectes du jour (Paiements today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const collectesCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(paiementsTerrain)
      .where(and(
        eq(paiementsTerrain.agentId, agent.id),
        gte(paiementsTerrain.createdAt, today)
      ));

    // Performance calculation (e.g., % of monthly objective achieved or simple conversion rate)
    // If objective is null/0, default to check total visited vs total converted? 
    // Let's use a placeholder calculation based on totalPaiements vs generic target if objectif is missing
    let perf = 0;
    const obj = Number(agent.objectifMensuel) || 5000000; // Default 5M FCFA goal
    const realized = Number(agent.totalPaiements) || 0;
    if (obj > 0) {
        perf = Math.round((realized / obj) * 100);
    }

    return {
      ...agent,
      nombreClients: clientsCount[0]?.count || 0,
      collectesJour: collectesCount[0]?.count || 0,
      performance: perf,
      // Ensure these match frontend expectations if mapped
      nombre_clients: clientsCount[0]?.count || 0, 
      collectes_jour: collectesCount[0]?.count || 0,
    };
  }));

  return enrichedAgents;
}

export async function createAgentTerrain(insertAgent: InsertAgentTerrain): Promise<AgentTerrain> {
  const [agent] = await db.insert(agentsTerrain).values(insertAgent).returning();
  return agent;
}

export async function updateAgentTerrain(id: string, updateData: Partial<InsertAgentTerrain>): Promise<AgentTerrain | undefined> {
  const [agent] = await db
    .update(agentsTerrain)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(agentsTerrain.id, id))
    .returning();
  return agent || undefined;
}

// Prospections
export async function getProspection(id: string): Promise<Prospection | undefined> {
  const [prospection] = await db.select().from(prospections).where(eq(prospections.id, id));
  return prospection || undefined;
}

export async function getProspectionsByAgent(agentId: string): Promise<Prospection[]> {
  return db.select().from(prospections).where(eq(prospections.agentId, agentId)).orderBy(desc(prospections.dateProspection));
}

export async function getAllProspections(): Promise<Prospection[]> {
  return db.select().from(prospections).orderBy(desc(prospections.dateProspection));
}

export async function createProspection(insertProspection: InsertProspection): Promise<Prospection> {
  const [prospection] = await db.insert(prospections).values(insertProspection).returning();
  return prospection;
}

export async function updateProspection(id: string, updateData: Partial<InsertProspection>): Promise<Prospection | undefined> {
  const [prospection] = await db
    .update(prospections)
    .set(updateData)
    .where(eq(prospections.id, id))
    .returning();
  return prospection || undefined;
}

// Visites
export async function getVisiteTerrain(id: string): Promise<VisiteTerrain | undefined> {
  const [visite] = await db.select().from(visitesTerrain).where(eq(visitesTerrain.id, id));
  return visite || undefined;
}

export async function getVisitesByAgent(agentId: string): Promise<VisiteTerrain[]> {
  return db.select().from(visitesTerrain).where(eq(visitesTerrain.agentId, agentId)).orderBy(desc(visitesTerrain.dateVisite));
}

export async function getAllVisitesTerrain(): Promise<VisiteTerrain[]> {
  return db.select().from(visitesTerrain).orderBy(desc(visitesTerrain.dateVisite));
}

export async function createVisiteTerrain(insertVisite: InsertVisiteTerrain): Promise<VisiteTerrain> {
  const [visite] = await db.insert(visitesTerrain).values(insertVisite).returning();
  return visite;
}

export async function updateVisiteTerrain(id: string, updateData: Partial<InsertVisiteTerrain>): Promise<VisiteTerrain | undefined> {
  const [visite] = await db
    .update(visitesTerrain)
    .set(updateData)
    .where(eq(visitesTerrain.id, id))
    .returning();
  return visite || undefined;
}

// Paiements Terrain
export async function getPaiementTerrain(id: string): Promise<PaiementTerrain | undefined> {
  const [paiement] = await db.select().from(paiementsTerrain).where(eq(paiementsTerrain.id, id));
  return paiement || undefined;
}

export async function getPaiementsByAgent(agentId: string): Promise<PaiementTerrain[]> {
  return db.select().from(paiementsTerrain).where(eq(paiementsTerrain.agentId, agentId)).orderBy(desc(paiementsTerrain.createdAt));
}

export async function getAllPaiementsTerrain(): Promise<PaiementTerrain[]> {
  return db.select().from(paiementsTerrain).orderBy(desc(paiementsTerrain.createdAt));
}

export async function createPaiementTerrain(insertPaiement: InsertPaiementTerrain): Promise<PaiementTerrain> {
  const [paiement] = await db.insert(paiementsTerrain).values(insertPaiement).returning();
  return paiement;
}

export async function updatePaiementTerrain(id: string, updateData: Partial<InsertPaiementTerrain>): Promise<PaiementTerrain | undefined> {
    const [paiement] = await db.update(paiementsTerrain).set(updateData).where(eq(paiementsTerrain.id, id)).returning();
    return paiement;
}

// Employes
export async function getEmploye(id: string): Promise<Employe | undefined> {
    const [employe] = await db.select().from(employes).where(eq(employes.id, id));
    return employe;
}

export async function getAllEmployes(): Promise<Employe[]> {
    return db.select().from(employes);
}

export async function createEmploye(employe: InsertEmploye): Promise<Employe> {
    const [newEmploye] = await db.insert(employes).values(employe).returning();
    return newEmploye;
}

export async function updateEmploye(id: string, employe: Partial<InsertEmploye>): Promise<Employe | undefined> {
    const [updated] = await db.update(employes).set({ ...employe, updatedAt: new Date() }).where(eq(employes.id, id)).returning();
    return updated;
}

export async function deleteEmploye(id: string): Promise<boolean> {
    const result = await db.delete(employes).where(eq(employes.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
}

// Pos Devices
export async function getPosDevice(id: string): Promise<PosDevice | undefined> {
    const [device] = await db.select().from(posDevices).where(eq(posDevices.id, id));
    return device;
}

export async function getPosDevicesByAgent(agentId: string): Promise<PosDevice[]> {
    return db.select().from(posDevices).where(eq(posDevices.agentId, agentId));
}

export async function getAllPosDevices(): Promise<PosDevice[]> {
    return db.select().from(posDevices);
}

export async function createPosDevice(device: InsertPosDevice): Promise<PosDevice> {
    const [newDevice] = await db.insert(posDevices).values(device).returning();
    return newDevice;
}

export async function updatePosDevice(id: string, device: Partial<InsertPosDevice>): Promise<PosDevice | undefined> {
    const [updated] = await db.update(posDevices).set({ ...device, updatedAt: new Date() }).where(eq(posDevices.id, id)).returning();
    return updated;
}

// Notifications
export async function getNotification(id: string): Promise<Notification | undefined> {
    const [notif] = await db.select().from(notifications).where(eq(notifications.id, id));
    return notif;
}

export async function getNotificationsByUser(userId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
}

export async function getAllNotifications(): Promise<Notification[]> {
    return db.select().from(notifications).orderBy(desc(notifications.createdAt));
}

export async function getUnreadNotifications(userId?: string): Promise<Notification[]> {
  if (userId) {
    return db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.lue, false))).orderBy(desc(notifications.createdAt));
  }
  return [];
}

export async function createNotification(notification: InsertNotification): Promise<Notification> {
    const [notif] = await db.insert(notifications).values(notification).returning();
    return notif;
}

export async function markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const [notif] = await db.update(notifications).set({ lue: true }).where(eq(notifications.id, id)).returning();
    return notif;
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ lue: true }).where(eq(notifications.userId, userId));
}

export async function deleteNotification(id: string): Promise<boolean> {
    const res = await db.delete(notifications).where(eq(notifications.id, id));
    return (res.rowCount || 0) > 0;
}

// OTP Validations
export async function createOtpValidation(otp: InsertOtpValidation): Promise<OtpValidation> {
    const [newOtp] = await db.insert(otpValidations).values(otp).returning();
    return newOtp;
}

export async function getOtpByReference(transactionReference: string): Promise<OtpValidation | undefined> {
    const [otp] = await db.select().from(otpValidations)
        .where(eq(otpValidations.transactionReference, transactionReference))
        .orderBy(desc(otpValidations.createdAt))
        .limit(1);
    return otp;
}

export async function updateOtpStatus(id: string, status: string, attempts?: number): Promise<OtpValidation | undefined> {
    const update: any = { status };
    if (attempts !== undefined) update.attempts = attempts;
    const [updated] = await db.update(otpValidations).set(update).where(eq(otpValidations.id, id)).returning();
    return updated;
}

export async function updateOtpAttempts(id: string, attempts: number): Promise<OtpValidation | undefined> {
    const [updated] = await db.update(otpValidations).set({ attempts }).where(eq(otpValidations.id, id)).returning();
    return updated;
}

export async function validateOtp(id: string, validatedBy?: string, validatedByName?: string, validatedByRole?: string): Promise<OtpValidation | undefined> {
    const [updated] = await db.update(otpValidations)
        .set({ 
            status: "validated",
            validatedBy,
            validatedByName,
            validatedByRole,
            validatedAt: new Date()
        })
        .where(eq(otpValidations.id, id))
        .returning();
    return updated;
}

// Zones
export async function getZone(id: string): Promise<Zone | undefined> {
    const [zone] = await db.select().from(zones).where(eq(zones.id, id));
    return zone;
}

export async function getAllZones(): Promise<Zone[]> {
    return db.select().from(zones);
}

export async function createZone(zone: InsertZone): Promise<Zone> {
    const [newZone] = await db.insert(zones).values(zone).returning();
    return newZone;
}

// Objectifs Mensuels
export async function getObjectifMensuel(agentId: string, annee: number, mois: number): Promise<ObjectifMensuel | undefined> {
    const [objectif] = await db.select().from(objectifsMensuels)
        .where(and(
            eq(objectifsMensuels.agentId, agentId),
            eq(objectifsMensuels.annee, annee),
            eq(objectifsMensuels.mois, mois)
        ));
    return objectif;
}

export async function getObjectifsMensuelsByAgent(agentId: string, annee?: number): Promise<ObjectifMensuel[]> {
    if (annee) {
        return db.select().from(objectifsMensuels)
            .where(and(eq(objectifsMensuels.agentId, agentId), eq(objectifsMensuels.annee, annee)))
            .orderBy(desc(objectifsMensuels.mois));
    }
    return db.select().from(objectifsMensuels)
        .where(eq(objectifsMensuels.agentId, agentId))
        .orderBy(desc(objectifsMensuels.annee), desc(objectifsMensuels.mois));
}

export async function getCurrentObjectifMensuel(agentId: string): Promise<ObjectifMensuel | undefined> {
    const now = new Date();
    return getObjectifMensuel(agentId, now.getFullYear(), now.getMonth() + 1);
}

export async function createOrUpdateObjectifMensuel(data: InsertObjectifMensuel): Promise<ObjectifMensuel> {
    // Check if an objective already exists for this agent/year/month
    const existing = await getObjectifMensuel(data.agentId, data.annee, data.mois);
    
    if (existing) {
        // Update existing
        const [updated] = await db.update(objectifsMensuels)
            .set({ montant: data.montant, notes: data.notes, updatedAt: new Date() })
            .where(eq(objectifsMensuels.id, existing.id))
            .returning();
        return updated;
    } else {
        // Create new
        const [newObj] = await db.insert(objectifsMensuels).values(data).returning();
        return newObj;
    }
}

// ============================================================================
// ATOMIC LEDGER-BASED TERRAIN OPERATIONS
// All terrain payments go through mouvementsFinanciers + evenementsOutbox
// ============================================================================

import { 
  executeWithLedger, 
  updateCreditSolde,
  type SensMouvement,
  type MouvementFinancier
} from "../services/ledger";
import { credits } from "@shared/schema";

/**
 * Create a terrain payment with full ledger flow
 * - Creates mouvement_financier
 * - Updates credit solde if applicable
 * - Updates agent stats
 * - Creates paiement_terrain with mouvement_id
 * - Publishes outbox events
 */
export async function createPaiementTerrainWithLedger(data: {
  agentId: string;
  clientId: string;
  creditId?: string;
  compteId?: string;
  montant: string;
  typePaiement: string;
  latitude?: string;
  longitude?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{ paiement: PaiementTerrain; mouvement: MouvementFinancier }> {
  
  return executeWithLedger(
    "TERRAIN",
    {
      montant: data.montant,
      sens: "Crédit" as SensMouvement, // Money coming in
      clientId: data.clientId,
      creditId: data.creditId,
      compteId: data.compteId,
      agentId: data.agentId,
      methodePaiement: "Espèces",
      typePaiement: data.typePaiement as any,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      // 1. Update credit solde if this is a credit repayment
      let nouveauSoldeCredit: string | undefined;
      if (data.creditId) {
        nouveauSoldeCredit = await updateCreditSolde(tx, data.creditId, -parseFloat(data.montant));
      }

      // 2. Update agent stats (totalPaiements)
      await tx.update(agentsTerrain)
        .set({ 
          totalPaiements: sql`COALESCE(${agentsTerrain.totalPaiements}, '0')::numeric + ${data.montant}::numeric`,
          updatedAt: new Date()
        })
        .where(eq(agentsTerrain.id, data.agentId));

      // 3. Create paiement terrain
      const [paiement] = await tx.insert(paiementsTerrain).values({
        agentId: data.agentId,
        clientId: data.clientId,
        creditId: data.creditId,
        compteId: data.compteId,
        mouvementId: mouvement.id,
        montant: data.montant,
        typePaiement: data.typePaiement as any,
        methodePaiement: "Espèces",
        reference: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`, // Simple generation or reuse mouvement reference? Mouvement ref is unique for ledger.
        // datePaiement removed, using createdAt default
        latitude: data.latitude,
        longitude: data.longitude,
        statut: "Validé",
      } as any).returning();

      return {
        result: paiement,
        additionalEventData: {
          nouveauSoldeCredit,
          agentId: data.agentId,
        },
      };
    },
    userId
  ).then(({ result, mouvement }) => ({ paiement: result, mouvement }));
}

/**
 * Get agent statistics for real-time dashboard
 */
export async function getAgentStats(agentId: string, options?: { 
  dateFrom?: Date; 
  dateTo?: Date 
}): Promise<{
  totalCollecte: number;
  nombrePaiements: number;
  collectesJour: number;
  collectesSemaine: number;
  collectesMois: number;
}> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${paiementsTerrain.montant}::numeric), 0)`,
    count: sql<number>`COUNT(*)`,
  })
    .from(paiementsTerrain)
    .where(eq(paiementsTerrain.agentId, agentId));

  const [dayResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${paiementsTerrain.montant}::numeric), 0)`,
  })
    .from(paiementsTerrain)
    .where(and(
      eq(paiementsTerrain.agentId, agentId),
      gte(paiementsTerrain.createdAt, startOfDay)
    ));

  const [weekResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${paiementsTerrain.montant}::numeric), 0)`,
  })
    .from(paiementsTerrain)
    .where(and(
      eq(paiementsTerrain.agentId, agentId),
      gte(paiementsTerrain.createdAt, startOfWeek)
    ));

  const [monthResult] = await db.select({
    total: sql<string>`COALESCE(SUM(${paiementsTerrain.montant}::numeric), 0)`,
  })
    .from(paiementsTerrain)
    .where(and(
      eq(paiementsTerrain.agentId, agentId),
      gte(paiementsTerrain.createdAt, startOfMonth)
    ));

  return {
    totalCollecte: parseFloat(totalResult?.total || '0'),
    nombrePaiements: totalResult?.count || 0,
    collectesJour: parseFloat(dayResult?.total || '0'),
    collectesSemaine: parseFloat(weekResult?.total || '0'),
    collectesMois: parseFloat(monthResult?.total || '0'),
  };
}
