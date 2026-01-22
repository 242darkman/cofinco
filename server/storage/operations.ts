import { agentsTerrain, prospections, visitesTerrain, paiementsTerrain, employes, posDevices, notifications, otpValidations, zones, objectifsMensuels, clients, users, userAgences } from "@shared/schema";
import { type AgentTerrain, type InsertAgentTerrain, type Prospection, type InsertProspection, type VisiteTerrain, type InsertVisiteTerrain, type PaiementTerrain, type InsertPaiementTerrain, type Employe, type InsertEmploye, type PosDevice, type InsertPosDevice, type Notification, type InsertNotification, type OtpValidation, type InsertOtpValidation, type Zone, type InsertZone, type ObjectifMensuel, type InsertObjectifMensuel } from "@shared/schema";
import { db } from "../db";
import { notDeleted } from "./query-helpers";
import { eq, desc, and, or, sql, gte } from "drizzle-orm";
import { StatutOtp, StatutPaiementTerrain } from "@shared/enum/status-constants";

async function resolveAgentPrimaryAgenceId(agentId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ agenceId: userAgences.agenceId })
    .from(agentsTerrain)
    .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
    .innerJoin(userAgences, and(
      eq(userAgences.userId, employes.userId),
      eq(userAgences.isPrimary, true),
      eq(userAgences.actif, true)
    ))
    .where(eq(agentsTerrain.id, agentId))
    .limit(1);

  return row?.agenceId;
}

// Agents Terrain
export async function getAgentTerrain(id: string): Promise<AgentTerrain | undefined> {
  const [agent] = await db
    .select()
    .from(agentsTerrain)
    .where(and(eq(agentsTerrain.id, id), notDeleted(agentsTerrain)));
  return agent || undefined;
}

export async function getAllAgentsTerrain(): Promise<any[]> {
  const results = await db
    .select({
      agent: agentsTerrain,
      user: users
    })
    .from(agentsTerrain)
    .leftJoin(employes, eq(agentsTerrain.employeId, employes.id))
    .leftJoin(users, eq(employes.userId, users.id))
    .where(notDeleted(agentsTerrain))
    .orderBy(desc(agentsTerrain.createdAt));
  
  const enrichedAgents = await Promise.all(results.map(async ({ agent, user }) => {
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
      nom: user?.nom || "Inconnu",
      prenom: user?.prenom || "",
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

export async function getAgentsTerrainPaginated(
  page: number = 1,
  perPage: number = 25
): Promise<{ data: any[]; total: number }> {
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentsTerrain)
    .where(notDeleted(agentsTerrain));
  const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

  const results = await db
    .select({
      agent: agentsTerrain,
      user: users
    })
    .from(agentsTerrain)
    .leftJoin(employes, eq(agentsTerrain.employeId, employes.id))
    .leftJoin(users, eq(employes.userId, users.id))
    .where(notDeleted(agentsTerrain))
    .orderBy(desc(agentsTerrain.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const enrichedAgents = await Promise.all(results.map(async ({ agent, user }) => {
    const clientsCount = await db
      .select({ count: sql<number>`count(distinct ${visitesTerrain.clientId})` })
      .from(visitesTerrain)
      .where(eq(visitesTerrain.agentId, agent.id));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const collectesCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(paiementsTerrain)
      .where(and(
        eq(paiementsTerrain.agentId, agent.id),
        gte(paiementsTerrain.createdAt, today)
      ));

    let perf = 0;
    const obj = Number(agent.objectifMensuel) || 5000000;
    const realized = Number(agent.totalPaiements) || 0;
    if (obj > 0) {
      perf = Math.round((realized / obj) * 100);
    }

    return {
      ...agent,
      nom: user?.nom || "Inconnu",
      prenom: user?.prenom || "",
      telephone: user?.telephone || null,
      photoUrl: user?.photoProfile || null,
      photo_url: user?.photoProfile || null, // Alias snake_case pour le frontend
      nombreClients: clientsCount[0]?.count || 0,
      collectesJour: collectesCount[0]?.count || 0,
      performance: perf,
      nombre_clients: clientsCount[0]?.count || 0,
      collectes_jour: collectesCount[0]?.count || 0,
    };
  }));

  return { data: enrichedAgents, total };
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

/**
 * Update agent location (GPS tracking)
 * This updates the lastLatitude and lastLongitude fields on agents_terrain table
 * Called from ws-server for real-time location tracking
 */
export async function updateAgentLocation(userId: string, latitude: string, longitude: string): Promise<void> {
  // Find agent by userId through employes table
  const [agentResult] = await db
    .select({ agentId: agentsTerrain.id })
    .from(agentsTerrain)
    .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
    .where(eq(employes.userId, userId))
    .limit(1);

  if (agentResult) {
    await db
      .update(agentsTerrain)
      .set({
        lastLatitude: latitude,
        lastLongitude: longitude,
        lastSeenAt: new Date(),
      })
      .where(eq(agentsTerrain.id, agentResult.agentId));
  }
}

// Prospections
export async function getProspection(id: string): Promise<Prospection | undefined> {
  const [prospection] = await db
    .select()
    .from(prospections)
    .where(and(eq(prospections.id, id), notDeleted(prospections)));
  return prospection || undefined;
}

export async function getProspectionsByAgent(agentId: string): Promise<Prospection[]> {
  return db
    .select()
    .from(prospections)
    .where(and(eq(prospections.agentId, agentId), notDeleted(prospections)))
    .orderBy(desc(prospections.dateProspection));
}

export async function getAllProspections(): Promise<Prospection[]> {
  return db
    .select()
    .from(prospections)
    .where(notDeleted(prospections))
    .orderBy(desc(prospections.dateProspection));
}

export async function getProspectionsPaginated(
  page: number = 1,
  perPage: number = 25
): Promise<{ data: Prospection[]; total: number }> {
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(prospections)
    .where(notDeleted(prospections));
  const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

  const data = await db
    .select()
    .from(prospections)
    .where(notDeleted(prospections))
    .orderBy(desc(prospections.dateProspection))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { data, total };
}

export async function createProspection(insertProspection: InsertProspection): Promise<Prospection> {
  const [prospection] = await db.insert(prospections).values({
    ...insertProspection,
    latitude: insertProspection.latitude ? insertProspection.latitude.toString() : null,
    longitude: insertProspection.longitude ? insertProspection.longitude.toString() : null
  }).returning();
  return prospection;
}

export async function updateProspection(id: string, updateData: Partial<InsertProspection>): Promise<Prospection | undefined> {
  const updatePayload: any = { ...updateData };
  if (updateData.latitude !== undefined) updatePayload.latitude = updateData.latitude ? updateData.latitude.toString() : null;
  if (updateData.longitude !== undefined) updatePayload.longitude = updateData.longitude ? updateData.longitude.toString() : null;

  const [prospection] = await db
    .update(prospections)
    .set(updatePayload)
    .where(eq(prospections.id, id))
    .returning();
  return prospection || undefined;
}

// Visites
export async function getVisiteTerrain(id: string): Promise<VisiteTerrain | undefined> {
  const [visite] = await db
    .select()
    .from(visitesTerrain)
    .where(and(eq(visitesTerrain.id, id), notDeleted(visitesTerrain)));
  return visite || undefined;
}

export async function getVisitesByAgent(agentId: string): Promise<VisiteTerrain[]> {
  return db
    .select()
    .from(visitesTerrain)
    .where(and(eq(visitesTerrain.agentId, agentId), notDeleted(visitesTerrain)))
    .orderBy(desc(visitesTerrain.dateVisite));
}

export async function getAllVisitesTerrain(): Promise<VisiteTerrain[]> {
  return db
    .select()
    .from(visitesTerrain)
    .where(notDeleted(visitesTerrain))
    .orderBy(desc(visitesTerrain.dateVisite));
}

export async function getVisitesTerrainPaginated(
  page: number = 1,
  perPage: number = 25
): Promise<{ data: VisiteTerrain[]; total: number }> {
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(visitesTerrain)
    .where(notDeleted(visitesTerrain));
  const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

  const data = await db
    .select()
    .from(visitesTerrain)
    .where(notDeleted(visitesTerrain))
    .orderBy(desc(visitesTerrain.dateVisite))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { data, total };
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
  const [paiement] = await db
    .select()
    .from(paiementsTerrain)
    .where(and(eq(paiementsTerrain.id, id), notDeleted(paiementsTerrain)));
  return paiement || undefined;
}

export async function getPaiementsByAgent(agentId: string): Promise<PaiementTerrain[]> {
  return db
    .select()
    .from(paiementsTerrain)
    .where(and(eq(paiementsTerrain.agentId, agentId), notDeleted(paiementsTerrain)))
    .orderBy(desc(paiementsTerrain.createdAt));
}

export async function getAllPaiementsTerrain(): Promise<PaiementTerrain[]> {
  const results = await db
    .select({
      paiement: paiementsTerrain,
      client: clients,
      clientUserNom: sql<string>`client_users.nom`.as('client_user_nom'),
      clientUserPrenom: sql<string>`client_users.prenom`.as('client_user_prenom'),
      clientUserTelephone: sql<string>`client_users.telephone`.as('client_user_telephone'),
      clientUserPhoto: sql<string>`client_users.photo_profile`.as('client_user_photo'),
      agent: agentsTerrain,
      employe: employes,
      user: users
    })
    .from(paiementsTerrain)
    .leftJoin(clients, eq(paiementsTerrain.clientId, clients.id))
    .leftJoin(sql`users as client_users`, sql`client_users.id = ${clients.userId}`)
    .leftJoin(agentsTerrain, eq(paiementsTerrain.agentId, agentsTerrain.id))
    .leftJoin(employes, eq(agentsTerrain.employeId, employes.id))
    .leftJoin(users, eq(employes.userId, users.id))
    .where(notDeleted(paiementsTerrain))
    .orderBy(desc(paiementsTerrain.createdAt));

  return results.map(row => {
    // Determine agent name: prefer User (via employe), fallback to legacy
    const agentNom = row.user?.nom || "Inconnu";
    const agentPrenom = row.user?.prenom || "";

    return {
      ...row.paiement,
      clients: row.client ? {
        nom: row.clientUserNom || 'Client',
        prenom: row.clientUserPrenom || null,
        telephone: row.clientUserTelephone || null,
        photoProfile: row.clientUserPhoto || null
      } : undefined,
      agents_terrain: row.agent ? {
        nom: agentNom,
        prenom: agentPrenom
      } : undefined
    };
  });
}

export async function getPendingPaiementsByAgencePaginated(
  agenceId: string | undefined,
  page: number = 1,
  perPage: number = 25
): Promise<{ data: PaiementTerrain[]; total: number }> {
  let query = db
    .select({
      paiement: paiementsTerrain,
      client: clients,
      clientUserNom: sql<string>`client_users.nom`.as('client_user_nom'),
      clientUserPrenom: sql<string>`client_users.prenom`.as('client_user_prenom'),
      clientUserTelephone: sql<string>`client_users.telephone`.as('client_user_telephone'),
      clientUserPhoto: sql<string>`client_users.photo_profile`.as('client_user_photo'),
      agent: agentsTerrain,
      employe: employes,
      user: users,
    })
    .from(paiementsTerrain)
    .leftJoin(clients, eq(paiementsTerrain.clientId, clients.id))
    .leftJoin(sql`users as client_users`, sql`client_users.id = ${clients.userId}`)
    .leftJoin(agentsTerrain, eq(paiementsTerrain.agentId, agentsTerrain.id))
    .leftJoin(employes, eq(agentsTerrain.employeId, employes.id))
    .leftJoin(users, eq(employes.userId, users.id))
    .$dynamic();

  const conditions = [eq(paiementsTerrain.statut, StatutPaiementTerrain.PENDING), notDeleted(paiementsTerrain)];
  if (agenceId) {
    conditions.push(eq(paiementsTerrain.agenceId, agenceId));
  }

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(paiementsTerrain)
    .where(and(...conditions));
  const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

  query = query.where(and(...conditions));

  const results = await query
    .orderBy(desc(paiementsTerrain.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const data = results.map(row => {
    const agentNom = row.user?.nom || "Inconnu";
    const agentPrenom = row.user?.prenom || "";

    return {
      ...row.paiement,
      clients: row.client ? {
        nom: row.clientUserNom || 'Client',
        prenom: row.clientUserPrenom || null,
        telephone: row.clientUserTelephone || null,
        photoProfile: row.clientUserPhoto || null,
      } : undefined,
      agents_terrain: row.agent ? {
        nom: agentNom,
        prenom: agentPrenom,
      } : undefined,
    };
  });

  return { data, total };
}

/**
 * Get pending terrain payments filtered by agency
 * Used for agency-based access control (chef d'agence sees only their agency)
 */
export async function getPendingPaiementsByAgence(agenceId?: string): Promise<PaiementTerrain[]> {
  let query = db
    .select({
      paiement: paiementsTerrain,
      client: clients,
      clientUserNom: sql<string>`client_users.nom`.as('client_user_nom'),
      clientUserPrenom: sql<string>`client_users.prenom`.as('client_user_prenom'),
      clientUserTelephone: sql<string>`client_users.telephone`.as('client_user_telephone'),
      clientUserPhoto: sql<string>`client_users.photo_profile`.as('client_user_photo'),
      agent: agentsTerrain,
      employe: employes,
      user: users
    })
    .from(paiementsTerrain)
    .leftJoin(clients, eq(paiementsTerrain.clientId, clients.id))
    .leftJoin(sql`users as client_users`, sql`client_users.id = ${clients.userId}`)
    .leftJoin(agentsTerrain, eq(paiementsTerrain.agentId, agentsTerrain.id))
    .leftJoin(employes, eq(agentsTerrain.employeId, employes.id))
    .leftJoin(users, eq(employes.userId, users.id))
    .$dynamic();

  // Filter by pending status and optionally by agency
  const conditions = [
    eq(paiementsTerrain.statut, StatutPaiementTerrain.PENDING),
    notDeleted(paiementsTerrain),
  ];

  if (agenceId) {
    conditions.push(eq(paiementsTerrain.agenceId, agenceId));
  }

  query = query.where(and(...conditions));

  const results = await query.orderBy(desc(paiementsTerrain.createdAt));

  return results.map(row => {
    // Determine agent name: prefer User (via employe)
    const agentNom = row.user?.nom || "Inconnu";
    const agentPrenom = row.user?.prenom || "";

    return {
      ...row.paiement,
      clients: row.client ? {
        nom: row.clientUserNom || 'Client',
        prenom: row.clientUserPrenom || null,
        telephone: row.clientUserTelephone || null,
        photoProfile: row.clientUserPhoto || null
      } : undefined,
      agents_terrain: row.agent ? {
        nom: agentNom,
        prenom: agentPrenom
      } : undefined
    };
  });
}

export async function createPaiementTerrain(insertPaiement: InsertPaiementTerrain): Promise<PaiementTerrain> {
  const agenceId = insertPaiement.agenceId
    ? insertPaiement.agenceId
    : insertPaiement.agentId
    ? await resolveAgentPrimaryAgenceId(insertPaiement.agentId)
    : undefined;

  const [paiement] = await db
    .insert(paiementsTerrain)
    .values({ ...insertPaiement, agenceId: agenceId || null })
    .returning();
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
    const [device] = await db
      .select()
      .from(posDevices)
      .where(and(eq(posDevices.id, id), notDeleted(posDevices)));
    return device;
}

export async function getPosDevicesByAgent(agentId: string): Promise<PosDevice[]> {
    return db
      .select()
      .from(posDevices)
      .where(and(eq(posDevices.assignedTo, agentId), notDeleted(posDevices)));
}

export async function getAllPosDevices(): Promise<PosDevice[]> {
    return db.select().from(posDevices).where(notDeleted(posDevices));
}

export async function getPosDevicesPaginated(
    filter: { agenceId?: string; assignedTo?: string } = {},
    page: number = 1,
    perPage: number = 25
): Promise<{ data: PosDevice[]; total: number }> {
    const conditions = [notDeleted(posDevices)];
    if (filter.agenceId) {
      conditions.push(eq(posDevices.agenceId, filter.agenceId));
    }
    if (filter.assignedTo) {
      conditions.push(eq(posDevices.assignedTo, filter.assignedTo));
    }

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(posDevices)
      .where(and(...conditions));
    const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

    const data = await db
      .select()
      .from(posDevices)
      .where(and(...conditions))
      .orderBy(desc(posDevices.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    return { data, total };
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

export async function updateOtpStatus(id: string, statut: string, attempts?: number): Promise<OtpValidation | undefined> {
    const update: any = { statut };
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
            statut: StatutOtp.VALIDATED,
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

/**
 * Create a pending terrain payment (Waiting for validation)
 * - Creates paiement_terrain with status "Pending"
 * - NO ledger movement created yet
 */
export async function createPendingPaiementTerrain(data: {
  agentId: string;
  clientId: string;
  visiteId?: string;
  creditId?: string; // Optionnel (pour remboursement crédit)
  compteId?: string; // Optionnel (pour dépôt)
  tontineId?: string; // Optionnel (pour tontine)
  membreId?: string; // Optionnel (pour tontine)
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
}, userId?: string): Promise<PaiementTerrain> {
  
  // Check idempotency if key provided
  if (data.idempotencyKey) {
    const existing = await db.select().from(paiementsTerrain).where(eq(paiementsTerrain.idempotencyKey, data.idempotencyKey));
    if (existing.length > 0) return existing[0];
  }

  const agenceId = await resolveAgentPrimaryAgenceId(data.agentId);

  const [paiement] = await db.insert(paiementsTerrain).values({
    agentId: data.agentId,
    agenceId: agenceId || null,
    clientId: data.clientId,
    creditId: data.creditId,
    compteId: data.compteId,
    // mouvementId: null, // Pas d'impact financier immédiat
    montant: data.montant.toString(),
    typePaiement: data.typePaiement as any,
    methodePaiement: data.methodePaiement as any,
    numeroTelephone: data.numeroTelephone,
    referenceExterne: data.numeroTransaction,
    reference: data.reference,
    observations: data.notes,
    latitude: data.latitude ? data.latitude.toString() : null,
    longitude: data.longitude ? data.longitude.toString() : null,
    idempotencyKey: data.idempotencyKey,
    statut: StatutPaiementTerrain.PENDING, // En attente de validation
    validationOTP: data.presenceVerification ? "REQUIRED" : null, // Marqueur simple pour indiquer verification requise
    // Si présence déjà vérifiée à la soumission, on peut le stocker dans observations ou un champ dédié si ajouté
    createdBy: userId
  } as any).returning();

  return paiement;
}

/**
 * Validate a pending terrain payment
 * - Creates the ledger movement (mouvement_financier)
 * - Updates balances (Credit/Compte/Session/Agent)
 * - Updates paiement_terrain status to "Posté" (Validé)
 */
export async function validatePaiementTerrain(
  paiementId: string, 
  validatedBy: string
): Promise<{ paiement: PaiementTerrain; mouvement: MouvementFinancier }> {
  
  const paiement = await getPaiementTerrain(paiementId);
  if (!paiement) throw new Error("Paiement non trouvé");
  if (paiement.statut !== StatutPaiementTerrain.PENDING) throw new Error(`Paiement déjà traité (Statut: ${paiement.statut})`);

  return executeWithLedger(
    "TERRAIN",
    {
      montant: paiement.montant,
      sens: "CREDIT", // Entrée d'argent
      clientId: paiement.clientId,
      creditId: paiement.creditId || undefined,
      compteId: paiement.compteId || undefined,
      agentId: paiement.agentId,
      methodePaiement: paiement.methodePaiement || "CASH",
      typePaiement: paiement.typePaiement || "Autre",
      referenceExterne: paiement.referenceExterne || undefined,
      // On utilise l'ID du paiement comme idempotency key pour le mouvement pour garantir 1-1
      idempotencyKey: `val-${paiement.id}`, 
      metadata: {
        paiementId: paiement.id,
        validatedBy
      }
    },
    async (tx, mouvement) => {
      // 1. Update credit solde if applicable
      let nouveauSoldeCredit: string | undefined;
      if (paiement.creditId) {
        nouveauSoldeCredit = await updateCreditSolde(tx, paiement.creditId, -parseFloat(paiement.montant));
      }

      // 2. Update agent stats (totalPaiements) - C'est ici qu'on confirme la "performance" financière
      await tx.update(agentsTerrain)
        .set({ 
          totalPaiements: sql`COALESCE(${agentsTerrain.totalPaiements}, '0')::numeric + ${paiement.montant}::numeric`,
          updatedAt: new Date()
        })
        .where(eq(agentsTerrain.id, paiement.agentId));

      // 3. Update paiement terrain status
      const [updatedPaiement] = await tx.update(paiementsTerrain)
        .set({
          statut: StatutPaiementTerrain.POSTED, // Posté = Validé avec impact financier
          mouvementId: mouvement.id,
          dateValidation: new Date(),
          // Nous n'avons pas de champ validePar dans le schema actuel de paiementsTerrain, 
          // on l'ajoute dans observations ou on suppose que le log d'activité suffit.
          // Idéalement on ajouterait validePar au schema.
        } as any)
        .where(and(
          eq(paiementsTerrain.id, paiementId),
          eq(paiementsTerrain.statut, StatutPaiementTerrain.PENDING)
        ))
        .returning();

      if (!updatedPaiement) {
        throw new Error("Impossible de valider : le paiement n'est plus en attente (Conflit de modification)");
      }

      return {
        result: updatedPaiement,
        additionalEventData: {
          nouveauSoldeCredit,
          agentId: paiement.agentId,
        },
      };
    },
    validatedBy
  ).then(({ result, mouvement }) => ({ paiement: result, mouvement }));
}

/**
 * Rejeter un paiement
 */
export async function rejectPaiementTerrain(id: string, reason: string): Promise<PaiementTerrain> {
  const [paiement] = await db.update(paiementsTerrain)
    .set({
      statut: StatutPaiementTerrain.CANCELLED,
      observations: sql`${paiementsTerrain.observations} || '\nRejeté: ' || ${reason}`
    } as any)
    .where(and(
      eq(paiementsTerrain.id, id),
      eq(paiementsTerrain.statut, StatutPaiementTerrain.PENDING)
    ))
    .returning();
  
  if (!paiement) {
    const existing = await getPaiementTerrain(id);
    if (!existing) throw new Error("Paiement non trouvé");
    throw new Error(`Impossible de rejeter : le paiement est en statut '${existing.statut}'`);
  }
  
  return paiement;
}

/**
 * Wrapper for backward compatibility or direct calls if needed (e.g. tests)
 * Replaces the old createPaiementTerrainWithLedger
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
  // 1. Create pending
  const pending = await createPendingPaiementTerrain({
    ...data,
    methodePaiement: "CASH",
    reference: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  } as any, userId);

  // 2. Validate immediately
  return validatePaiementTerrain(pending.id, userId || 'system');
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
