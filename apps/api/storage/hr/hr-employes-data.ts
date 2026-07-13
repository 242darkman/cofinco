import {
  formations,
  hrAlertConfig, hrAlerts,
  hrDocumentRequests,
  sanctions,
  type HrAlertConfig,
  type HrDocumentRequest,
  type InsertHrDocumentRequest
} from "@shared/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db";

// Formations
export async function getFormations(statut?: string) {
    if (statut) {
        return await db.select().from(formations).where(eq(formations.statut, statut)).orderBy(desc(formations.dateDebut));
    }
    return await db.select().from(formations).orderBy(desc(formations.dateDebut));
}

export async function createFormation(formation: any) {
    const [newFormation] = await db.insert(formations).values(formation).returning();
    return newFormation;
}

// Sanctions
export async function getSanctions(employeId?: string) {
    if (employeId) {
        return await db.select().from(sanctions).where(eq(sanctions.employeId, employeId)).orderBy(desc(sanctions.date));
    }
    return await db.select().from(sanctions).orderBy(desc(sanctions.date));
}

export async function createSanction(sanction: any) {
    const [newSanction] = await db.insert(sanctions).values(sanction).returning();
    return newSanction;
}

// =============================================================================
// ALERTES RH
// =============================================================================

export async function getUpcomingAlerts(daysAhead: number = 30, agenceId?: string) {
    const today = new Date().toISOString().split('T')[0];
    const future = new Date();
    future.setDate(future.getDate() + daysAhead);
    const futureStr = future.toISOString().split('T')[0];

    const conditions = [
        eq(hrAlerts.status, 'PENDING'),
        gte(hrAlerts.eventDate, today),
        lte(hrAlerts.eventDate, futureStr),
    ];
    if (agenceId) conditions.push(eq(hrAlerts.agenceId, agenceId));

    return db.select().from(hrAlerts).where(and(...conditions)).orderBy(hrAlerts.eventDate);
}

export async function getAlertStats(agenceId?: string) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const j7 = new Date(today); j7.setDate(j7.getDate() + 7);
    const j15 = new Date(today); j15.setDate(j15.getDate() + 15);
    const j30 = new Date(today); j30.setDate(j30.getDate() + 30);

    const conditions = [eq(hrAlerts.status, 'PENDING'), gte(hrAlerts.eventDate, todayStr)];
    if (agenceId) conditions.push(eq(hrAlerts.agenceId, agenceId));

    const alerts = await db.select({ eventDate: hrAlerts.eventDate }).from(hrAlerts).where(and(...conditions));

    let urgent = 0, warning = 0, info = 0;
    for (const a of alerts) {
        const d = new Date(a.eventDate);
        if (d <= j7) urgent++;
        else if (d <= j15) warning++;
        else if (d <= j30) info++;
    }
    return { urgent, warning, info, total: alerts.length };
}

export async function acknowledgeAlert(id: string, userId: string) {
    const [alert] = await db.update(hrAlerts).set({ status: 'ACKNOWLEDGED', acknowledgedBy: userId, acknowledgedAt: new Date(), updatedAt: new Date() }).where(eq(hrAlerts.id, id)).returning();
    return alert;
}

export async function dismissAlert(id: string, userId: string, reason?: string) {
    const [alert] = await db.update(hrAlerts).set({ status: 'DISMISSED', dismissedBy: userId, dismissedAt: new Date(), dismissReason: reason || null, updatedAt: new Date() }).where(eq(hrAlerts.id, id)).returning();
    return alert;
}

export async function getAlertConfigs() {
    return db.select().from(hrAlertConfig).orderBy(hrAlertConfig.alertType);
}

export async function updateAlertConfig(alertType: string, updates: Partial<HrAlertConfig>) {
    const [config] = await db.update(hrAlertConfig).set({ ...updates, updatedAt: new Date() }).where(eq(hrAlertConfig.alertType, alertType)).returning();
    return config;
}

// ========================
// DEMANDES DE DOCUMENTS
// ========================

export async function getDocumentRequests(filters?: { employeId?: string; statut?: string }) {
  let conditions = [];
  if (filters?.employeId) conditions.push(eq(hrDocumentRequests.employeId, filters.employeId));
  if (filters?.statut) conditions.push(eq(hrDocumentRequests.statut, filters.statut));

  return db.select().from(hrDocumentRequests)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(hrDocumentRequests.createdAt));
}

export async function createDocumentRequest(data: InsertHrDocumentRequest) {
  const [result] = await db.insert(hrDocumentRequests).values(data).returning();
  return result;
}

export async function updateDocumentRequest(id: string, data: Partial<HrDocumentRequest>) {
  const [result] = await db.update(hrDocumentRequests)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(hrDocumentRequests.id, id))
    .returning();
  return result;
}
