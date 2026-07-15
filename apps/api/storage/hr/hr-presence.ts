import { StatutPresence } from "@shared/enum/status-constants";
import {
  employes,
  horairesTravail,
  payrollConfig,
  Presence,
  presences
} from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";

// Présence
export async function getPresenceAujourdhui(): Promise<any> {
    const today = new Date().toISOString().split('T')[0];
    const totalEmployes = await db.select({ count: sql<number>`count(*)` }).from(employes);
    
    const presencesList = await db.select().from(presences).where(eq(presences.date, today));
    
    // Stats calculation
    const presents = presencesList.filter(p => p.statut === StatutPresence.PRESENT).length;
    const retards = presencesList.filter(p => p.statut === StatutPresence.LATE).length;
    const absents = presencesList.filter(p => p.statut === StatutPresence.ABSENT).length;
    
    return {
        date: today,
        totalEmployes: totalEmployes[0]?.count || 0,
        presents,
        retards,
        absents,
        tauxPresence: totalEmployes[0]?.count ? Math.round((presents / totalEmployes[0].count) * 100) : 0,
        liste: presencesList
    };
}

export interface GpsData {
    latitude?: number | null;
    longitude?: number | null;
    accuracy?: number | null;
    gpsSource?: string;
}

// ---------------------------------------------------------------------------
// Assistants pour horaires et politique de présence
// ---------------------------------------------------------------------------

export function parseHHMM(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
}

export async function getEmployeeScheduleForDay(employeId: string, dayOfWeek: number): Promise<{
    heureDebut: string;
    heureFin: string;
    pauseMinutes: number;
    standardMinutes: number;
} | null> {
    const horaires = await db.select().from(horairesTravail)
        .where(and(
            eq(horairesTravail.employeId, employeId),
            eq(horairesTravail.jourSemaine, dayOfWeek),
            eq(horairesTravail.actif, true)
        ));

    if (horaires.length === 0) return null;

    const h = horaires[0];
    const pause = h.pauseMinutes || 60;
    const startMin = parseHHMM(h.heureDebut);
    const endMin = parseHHMM(h.heureFin);
    const standardMinutes = Math.max(0, endMin - startMin - pause);

    return { heureDebut: h.heureDebut, heureFin: h.heureFin, pauseMinutes: pause, standardMinutes };
}

export async function loadAttendancePolicy(agenceId?: string | null): Promise<{
    lateGraceMinutes: number;
    allowOvertime: boolean;
    defaultHeureDebut: string;
    defaultHeureFin: string;
    defaultPauseMinutes: number;
    defaultStandardMinutes: number;
}> {
    let config = null;

    if (agenceId) {
        const [agencyConfig] = await db.select().from(payrollConfig)
            .where(and(eq(payrollConfig.agenceId, agenceId), eq(payrollConfig.isActive, true)))
            .orderBy(desc(payrollConfig.effectiveFrom)).limit(1);
        config = agencyConfig || null;
    }
    if (!config) {
        const [globalConfig] = await db.select().from(payrollConfig)
            .where(and(sql`${payrollConfig.agenceId} IS NULL`, eq(payrollConfig.isActive, true)))
            .orderBy(desc(payrollConfig.effectiveFrom)).limit(1);
        config = globalConfig || null;
    }

    const defaultHeureDebut = config?.defaultHeureDebut || "08:00";
    const defaultHeureFin = config?.defaultHeureFin || "17:00";
    const defaultPauseMinutes = config?.defaultPauseMinutes ?? 60;

    const defaultStandardMinutes = Math.max(0, parseHHMM(defaultHeureFin) - parseHHMM(defaultHeureDebut) - defaultPauseMinutes);

    return {
        lateGraceMinutes: config?.lateGraceMinutes ?? 5,
        allowOvertime: config?.allowOvertime ?? true,
        defaultHeureDebut,
        defaultHeureFin,
        defaultPauseMinutes,
        defaultStandardMinutes,
    };
}

// ---------------------------------------------------------------------------
// Suivi de présence
// ---------------------------------------------------------------------------

export async function checkIn(employeId: string, gps?: GpsData): Promise<Presence> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Check if already checked in
    const existing = await db.select().from(presences).where(and(eq(presences.employeId, employeId), eq(presences.date, today)));

    if (existing.length > 0) return existing[0]; // Already present

    // Fetch employee's agency for policy lookup
    const [emp] = await db.select({ agenceId: employes.agenceId }).from(employes).where(eq(employes.id, employeId));

    // Determine status based on schedule + grace period
    const schedule = await getEmployeeScheduleForDay(employeId, now.getDay());
    const policy = await loadAttendancePolicy(emp?.agenceId);

    const scheduledStart = schedule?.heureDebut || policy.defaultHeureDebut;
    const arrivalMinutes = now.getHours() * 60 + now.getMinutes();
    const scheduledMinutes = parseHHMM(scheduledStart);

    let statut: string = StatutPresence.PRESENT;
    if (arrivalMinutes > scheduledMinutes + policy.lateGraceMinutes) {
        statut = StatutPresence.LATE;
    }

    const [presence] = await db.insert(presences).values({
        employeId,
        date: today,
        statut,
        heureArrivee: now,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
        accuracy: gps?.accuracy ?? null,
        gpsSource: gps?.gpsSource ?? "manual",
    }).returning();

    return presence;
}

export async function checkOut(employeId: string): Promise<Presence | null> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const existing = await db.select().from(presences).where(and(eq(presences.employeId, employeId), eq(presences.date, today)));
    if (existing.length === 0) return null; // Not checked in

    const heureArrivee = existing[0].heureArrivee;
    if (!heureArrivee) return null;

    // Calculate total time from arrival to departure
    const diffMs = now.getTime() - new Date(heureArrivee).getTime();
    let totalMinutes = Math.floor(diffMs / 60000);

    // Fetch employee schedule and attendance policy
    const [emp] = await db.select({ agenceId: employes.agenceId }).from(employes).where(eq(employes.id, employeId));
    const schedule = await getEmployeeScheduleForDay(employeId, now.getDay());
    const policy = await loadAttendancePolicy(emp?.agenceId);

    const pauseMinutesFixe = schedule?.pauseMinutes ?? policy.defaultPauseMinutes;

    // Calculate actual pause time if recorded
    let pauseMinutesReelle = 0;
    if (existing[0].pauseDebut && existing[0].pauseFin) {
        const pauseMs = new Date(existing[0].pauseFin).getTime() - new Date(existing[0].pauseDebut).getTime();
        pauseMinutesReelle = Math.floor(pauseMs / 60000);
    }

    // Use actual pause if recorded, otherwise use scheduled/default pause
    const pauseMinutes = pauseMinutesReelle > 0 ? pauseMinutesReelle : pauseMinutesFixe;

    const minutesTravaillees = Math.max(0, totalMinutes - pauseMinutes);

    // Use schedule-derived standard or policy default
    const standardMinutes = schedule?.standardMinutes ?? policy.defaultStandardMinutes;
    const heuresSupplementaires = policy.allowOvertime
        ? Math.max(0, minutesTravaillees - standardMinutes)
        : 0;

    const [updated] = await db.update(presences)
        .set({ 
            heureDepart: now,
            heuresTravaillees: minutesTravaillees,
            heuresSupplementaires: heuresSupplementaires
        })
        .where(eq(presences.id, existing[0].id))
        .returning();
        
    return updated;
}

export async function startBreak(employeId: string): Promise<Presence | null> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const existing = await db.select().from(presences).where(and(eq(presences.employeId, employeId), eq(presences.date, today)));
    if (existing.length === 0 || !existing[0].heureArrivee) return null; // Not checked in

    const [updated] = await db.update(presences)
        .set({ pauseDebut: now })
        .where(eq(presences.id, existing[0].id))
        .returning();
        
    return updated;
}

export async function endBreak(employeId: string): Promise<Presence | null> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const existing = await db.select().from(presences).where(and(eq(presences.employeId, employeId), eq(presences.date, today)));
    if (existing.length === 0 || !existing[0].pauseDebut) return null; // No break started

    const [updated] = await db.update(presences)
        .set({ pauseFin: now })
        .where(eq(presences.id, existing[0].id))
        .returning();
        
    return updated;
}

export async function manualPresenceEntry(data: {
    employeId: string;
    date: string;
    heureArrivee: string;
    heureDepart?: string;
    pauseDebut?: string;
    pauseFin?: string;
    commentaire?: string;
}): Promise<Presence> {
    // Build timestamps from date + HH:MM
    const arriveeDt = new Date(`${data.date}T${data.heureArrivee}:00`);
    const departDt = data.heureDepart ? new Date(`${data.date}T${data.heureDepart}:00`) : null;
    const pauseDebutDt = data.pauseDebut ? new Date(`${data.date}T${data.pauseDebut}:00`) : null;
    const pauseFinDt = data.pauseFin ? new Date(`${data.date}T${data.pauseFin}:00`) : null;

    // Fetch employee schedule and attendance policy
    const [emp] = await db.select({ agenceId: employes.agenceId }).from(employes).where(eq(employes.id, data.employeId));
    const schedule = await getEmployeeScheduleForDay(data.employeId, arriveeDt.getDay());
    const policy = await loadAttendancePolicy(emp?.agenceId);

    // Determine late status from schedule + grace period
    const scheduledStart = schedule?.heureDebut || policy.defaultHeureDebut;
    const arrivalMinutes = arriveeDt.getHours() * 60 + arriveeDt.getMinutes();
    const scheduledMinutes = parseHHMM(scheduledStart);

    const statut = arrivalMinutes > scheduledMinutes + policy.lateGraceMinutes
        ? StatutPresence.LATE
        : StatutPresence.PRESENT;

    // Calculate work hours if departure is provided
    let heuresTravaillees = 0;
    let heuresSupplementaires = 0;
    if (departDt) {
        const totalMinutes = Math.floor((departDt.getTime() - arriveeDt.getTime()) / 60000);

        // Calculate pause minutes
        let pauseMinutes: number;
        if (pauseDebutDt && pauseFinDt) {
            pauseMinutes = Math.floor((pauseFinDt.getTime() - pauseDebutDt.getTime()) / 60000);
        } else {
            pauseMinutes = schedule?.pauseMinutes ?? policy.defaultPauseMinutes;
        }

        heuresTravaillees = Math.max(0, totalMinutes - pauseMinutes);
        const standardMinutes = schedule?.standardMinutes ?? policy.defaultStandardMinutes;
        heuresSupplementaires = policy.allowOvertime
            ? Math.max(0, heuresTravaillees - standardMinutes)
            : 0;
    }

    // Check if record already exists for this employee+date
    const existing = await db.select().from(presences)
        .where(and(eq(presences.employeId, data.employeId), eq(presences.date, data.date)));

    if (existing.length > 0) {
        const [updated] = await db.update(presences)
            .set({
                statut,
                heureArrivee: arriveeDt,
                heureDepart: departDt,
                pauseDebut: pauseDebutDt,
                pauseFin: pauseFinDt,
                heuresTravaillees,
                heuresSupplementaires,
                commentaire: data.commentaire || existing[0].commentaire,
                gpsSource: "manual_admin",
            })
            .where(eq(presences.id, existing[0].id))
            .returning();
        return updated;
    }

    const [created] = await db.insert(presences).values({
        employeId: data.employeId,
        date: data.date,
        statut,
        heureArrivee: arriveeDt,
        heureDepart: departDt,
        pauseDebut: pauseDebutDt,
        pauseFin: pauseFinDt,
        heuresTravaillees,
        heuresSupplementaires,
        commentaire: data.commentaire || null,
        gpsSource: "manual_admin",
    }).returning();

    return created;
}
