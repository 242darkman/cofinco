import { eq, desc, and, sql, gte, lte, not, inArray, between, count, sum, asc, or } from "drizzle-orm";
import { db } from "../db";
import {
  demandesConges,
  formations,
  sanctions,
  candidatures,
  bulletinsPaie, InsertBulletinPaie,
  avantages, Avantage,
  avantagesEmployes, InsertAvantageEmploye, AvantageEmploye,
  presences, Presence, users, horairesTravail, employes, payrollConfig,
  jobPositions, departments,
  evaluationTemplates, evaluationCriteria, evaluationCampaigns, evaluations, evaluationResponses,
  formationParticipants,
  hrAlertConfig, hrAlerts, payrollTransferFiles,
  hrDocumentRequests,
  jobOffers, payrollPaymentBatches, payrollBatchItems,
  bankReconciliationSessions, bankReconciliationLines,
  projetsRh, projetMembres, feuillesTemps, tempsImputes,
  type EvaluationTemplate, type InsertEvaluationTemplate,
  type EvaluationCriteria as EvalCriteria, type InsertEvaluationCriteria,
  type EvaluationCampaign, type InsertEvaluationCampaign,
  type Evaluation, type InsertEvaluation,
  type EvaluationResponse, type InsertEvaluationResponse,
  type HrAlertConfig, type HrAlert,
  type InsertHrDocumentRequest, type HrDocumentRequest,
  type InsertProjetRh, type InsertProjetMembre, type InsertFeuilleTemps, type InsertTempsImpute,
} from "@shared/schema";
import { StatutUser, StatutConge, StatutCandidature, StatutPresence, StatutBulletin, ModeCalculPaie } from "@shared/enum/status-constants";

// Demandes de Congés
export async function getConges(filter?: { statut?: string; employeId?: string }) {
  let query = db.select().from(demandesConges);
  const conditions = [];
  if (filter?.statut) conditions.push(eq(demandesConges.statut, filter.statut));
  if (filter?.employeId) conditions.push(eq(demandesConges.employeId, filter.employeId));
  
  if (conditions.length > 0) {
    return await query.where(and(...conditions)).orderBy(desc(demandesConges.createdAt));
  }
  return await query.orderBy(desc(demandesConges.createdAt));
}

export async function createConge(conge: any) {
  const [newConge] = await db.insert(demandesConges).values(conge).returning();
  return newConge;
}

export async function updateCongeStatus(id: number, status: string, userId: string, commentaire?: string) {
    const [updated] = await db.update(demandesConges)
      .set({
        statut: status,
        approuvePar: userId,
        dateDecision: new Date(),
        commentaire: commentaire || null
      })
      .where(eq(demandesConges.id, id))
      .returning();
    return updated;
}

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

// Candidatures
export async function getCandidatures(statut?: string) {
    if (statut) {
        return await db.select().from(candidatures).where(eq(candidatures.statut, statut)).orderBy(desc(candidatures.datePostulation));
    }
    return await db.select().from(candidatures).orderBy(desc(candidatures.datePostulation));
}

// Bulletins
export async function getBulletins(employeId?: string) {
    if (employeId) {
        return await db.select().from(bulletinsPaie).where(eq(bulletinsPaie.employeId, employeId)).orderBy(desc(bulletinsPaie.mois));
    }
    return await db.select().from(bulletinsPaie).orderBy(desc(bulletinsPaie.mois));
}

// Avantages
export async function getAllAvantages(): Promise<Avantage[]> {
    return await db.select().from(avantages).where(eq(avantages.actif, true));
}

export async function getAvantagesEmploye(employeId: string): Promise<any[]> {
    return await db.select({
        id: avantagesEmployes.id,
        avantageId: avantages.id,
        nom: avantages.nom,
        type: avantages.type,
        montant: avantagesEmployes.montant,
        dateAttribution: avantagesEmployes.dateAttribution,
        modeCalcul: avantages.modeCalcul,
        pourcentage: avantages.pourcentage,
        frequence: avantages.frequence,
        imposable: avantages.imposable,
        soumisCnss: avantages.soumisCnss,
        categorie: avantages.categorie,
    })
    .from(avantagesEmployes)
    .innerJoin(avantages, eq(avantagesEmployes.avantageId, avantages.id))
    .where(eq(avantagesEmployes.employeId, employeId));
}

export async function assignAvantage(data: InsertAvantageEmploye): Promise<AvantageEmploye> {
    const [assigned] = await db.insert(avantagesEmployes).values(data).returning();
    return assigned;
}

// Presence
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
// Schedule & attendance policy helpers
// ---------------------------------------------------------------------------

function parseHHMM(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
}

async function getEmployeeScheduleForDay(employeId: string, dayOfWeek: number): Promise<{
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

async function loadAttendancePolicy(agenceId?: string | null): Promise<{
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
// Presence tracking
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

// Paie Management
export async function createBulletinPaie(data: InsertBulletinPaie): Promise<any> {
    const [bulletin] = await db.insert(bulletinsPaie).values(data).returning();
    return bulletin;
}

export async function updateBulletinStatut(id: number, statut: string): Promise<any> {
    const [updated] = await db.update(bulletinsPaie)
        .set({ statut })
        .where(eq(bulletinsPaie.id, id))
        .returning();
    return updated;
}

export async function generateMonthlyPaie(mois: string, genereParId?: string): Promise<any[]> {
    // 1. Get all active employees with salary info from employes + users
    const employeesData = await db.select({
        employeId: employes.id,
        userId: users.id,
        nom: users.nom,
        prenom: users.prenom,
        salaireBase: employes.salaireBase,
        tauxHoraire: employes.tauxHoraire,
        tauxJournalier: employes.tauxJournalier,
        modeCalculPaie: employes.modeCalculPaie,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(eq(users.statut, StatutUser.ACTIVE));
    
    const results = [];

    // Parse month to get date range
    const [year, month] = mois.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    for (const emp of employeesData) {
        // Check if bulletin already exists
        const existing = await db.select().from(bulletinsPaie).where(
            and(eq(bulletinsPaie.employeId, emp.employeId), eq(bulletinsPaie.mois, mois))
        );
        
        if (existing.length > 0) continue; // Skip if exists

        // Fetch presences for the month
        const monthPresences = await db.select().from(presences).where(
            and(
                eq(presences.employeId, emp.employeId),
                gte(presences.date, startDate),
                lte(presences.date, endDate)
            )
        );

        let salaireBrut = 0;
        const modeCalcul = emp.modeCalculPaie || ModeCalculPaie.MONTHLY;

        if (modeCalcul === ModeCalculPaie.HOURLY) {
            // Calculate based on hours worked
            const totalMinutes = monthPresences.reduce((sum, p) => sum + (p.heuresTravaillees || 0), 0);
            const totalHours = totalMinutes / 60;
            const tauxHoraire = emp.tauxHoraire || 0;
            salaireBrut = Math.round(totalHours * tauxHoraire);

            // Overtime (1.5x rate)
            const overtimeMinutes = monthPresences.reduce((sum, p) => sum + (p.heuresSupplementaires || 0), 0);
            const overtimeHours = overtimeMinutes / 60;
            salaireBrut += Math.round(overtimeHours * tauxHoraire * 1.5);

        } else if (modeCalcul === ModeCalculPaie.DAILY) {
            // Calculate based on days present
            const joursPresents = monthPresences.filter(p => p.statut === StatutPresence.PRESENT || p.statut === StatutPresence.LATE).length;
            const tauxJournalier = emp.tauxJournalier || 0;
            salaireBrut = joursPresents * tauxJournalier;

        } else {
            // MONTHLY (fixed monthly salary)
            salaireBrut = emp.salaireBase || 0;
        }

        // Add transport allowance
        const transport = 50000;
        salaireBrut += transport;

        // Deductions
        const cnss = Math.round(salaireBrut * 0.05);
        const ipr = Math.round(salaireBrut * 0.15);
        const net = salaireBrut - cnss - ipr;

        const bulletinData: InsertBulletinPaie = {
            employeId: emp.employeId,
            employeNom: `${emp.nom} ${emp.prenom || ''}`,
            mois,
            salaireBaseSnapshot: salaireBrut - transport,
            salaireBrut: salaireBrut.toString(),
            totalChargesSalariales: cnss.toString(),
            irpp: ipr.toString(),
            totalRetenues: (cnss + ipr).toString(),
            salaireNet: net.toString(),
            totalChargesPatronales: Math.round(salaireBrut * 0.1).toString(),
            statut: StatutBulletin.DRAFT,
            genereParId: genereParId
        };
        
        const [bulletin] = await db.insert(bulletinsPaie).values(bulletinData).returning();
        results.push(bulletin);
    }
    
    return results;
}

// Organigramme Hiérarchique
interface OrgNode {
    id: string;
    nom: string;
    prenom: string;
    poste: string;
    departement: string;
    email?: string;
    photoProfile?: string;
    subordinates: OrgNode[];
}

export async function getOrganigramme(agenceId?: string): Promise<OrgNode[]> {
    // Fetch all active employees with user data, filtered by agency if provided
    // Join with jobPositions and departments to get poste and departement names
    const employeesData = await db.select({
        employeId: employes.id,
        userId: users.id,
        nom: users.nom,
        prenom: users.prenom,
        email: users.email,
        photoProfile: users.photoProfile,
        poste: jobPositions.name,
        departement: departments.name,
        managerId: employes.managerId,
        agenceId: employes.agenceId,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
    .leftJoin(departments, eq(jobPositions.departmentId, departments.id))
    .where(agenceId
        ? and(eq(users.statut, StatutUser.ACTIVE), eq(employes.agenceId, agenceId))
        : eq(users.statut, StatutUser.ACTIVE)
    );

    // Build map for quick lookup
    const employeeMap = new Map<string, any>();
    employeesData.forEach(emp => employeeMap.set(emp.employeId, { ...emp, subordinates: [] }));

    // Find top-level employees (no manager) and build tree
    const topLevel: OrgNode[] = [];

    employeesData.forEach(emp => {
        const node: OrgNode = {
            id: emp.employeId,
            nom: emp.nom,
            prenom: emp.prenom || '',
            poste: emp.poste || 'Non défini',
            departement: emp.departement || 'Non assigné',
            email: emp.email || undefined,
            photoProfile: emp.photoProfile || undefined,
            subordinates: []
        };

        if (!emp.managerId) {
            // Top-level employee
            topLevel.push(node);
            employeeMap.set(emp.employeId, node);
        } else {
            // Has a manager, add to manager's subordinates
            const manager = employeeMap.get(emp.managerId);
            if (manager) {
                manager.subordinates.push(node);
            } else {
                // Manager not found (inactive or deleted), treat as top-level
                topLevel.push(node);
            }
            employeeMap.set(emp.employeId, node);
        }
    });

    return topLevel;
}

export async function getHrStats(): Promise<any> {
    const employesCount = await db.select({ count: sql<number>`count(*)` }).from(employes);
    const congesEnAttente = await db.select({ count: sql<number>`count(*)` }).from(demandesConges).where(eq(demandesConges.statut, StatutConge.PENDING));
    const recrutementsEnCours = await db.select({ count: sql<number>`count(*)` }).from(candidatures).where(eq(candidatures.statut, StatutCandidature.PENDING));

    // Payroll total current month (approx)
    const currentMonth = new Date().toISOString().slice(0, 7);
    const masseSalariale = await db.select({ total: sql<number>`sum(${bulletinsPaie.salaireNet})` })
        .from(bulletinsPaie).where(eq(bulletinsPaie.mois, currentMonth));

    return {
        totalEmployes: employesCount[0]?.count || 0,
        congesEnAttente: congesEnAttente[0]?.count || 0,
        recrutementsEnCours: recrutementsEnCours[0]?.count || 0,
        masseSalariale: masseSalariale[0]?.total || 0
    };
}

// =============================================================================
// EVALUATION TEMPLATES
// =============================================================================

export async function getEvaluationTemplates(filters?: { actif?: boolean; agenceId?: string }) {
    const conditions = [];
    if (filters?.actif !== undefined) conditions.push(eq(evaluationTemplates.actif, filters.actif));
    if (filters?.agenceId) conditions.push(eq(evaluationTemplates.agenceId, filters.agenceId));

    const templates = conditions.length > 0
        ? await db.select().from(evaluationTemplates).where(and(...conditions)).orderBy(desc(evaluationTemplates.createdAt))
        : await db.select().from(evaluationTemplates).orderBy(desc(evaluationTemplates.createdAt));

    // Charger les critères pour chaque template
    const templateIds = templates.map(t => t.id);
    const allCriteria = templateIds.length > 0
        ? await db.select().from(evaluationCriteria).where(inArray(evaluationCriteria.templateId, templateIds)).orderBy(evaluationCriteria.ordre)
        : [];

    return templates.map(t => ({
        ...t,
        criteria: allCriteria.filter(c => c.templateId === t.id),
        criteriaCount: allCriteria.filter(c => c.templateId === t.id).length,
    }));
}

export async function createEvaluationTemplate(data: InsertEvaluationTemplate, criteria: InsertEvaluationCriteria[]) {
    const [template] = await db.insert(evaluationTemplates).values(data).returning();
    if (criteria.length > 0) {
        await db.insert(evaluationCriteria).values(criteria.map(c => ({ ...c, templateId: template.id })));
    }
    return template;
}

export async function updateEvaluationTemplate(id: string, data: Partial<InsertEvaluationTemplate>, criteria?: InsertEvaluationCriteria[]) {
    const [template] = await db.update(evaluationTemplates).set({ ...data, updatedAt: new Date() }).where(eq(evaluationTemplates.id, id)).returning();
    if (criteria) {
        await db.delete(evaluationCriteria).where(eq(evaluationCriteria.templateId, id));
        if (criteria.length > 0) {
            await db.insert(evaluationCriteria).values(criteria.map(c => ({ ...c, templateId: id })));
        }
    }
    return template;
}

export async function deleteEvaluationTemplate(id: string) {
    await db.delete(evaluationTemplates).where(eq(evaluationTemplates.id, id));
}

// =============================================================================
// EVALUATION CAMPAIGNS
// =============================================================================

export async function getEvaluationCampaigns(filters?: { statut?: string; agenceId?: string }) {
    const conditions = [];
    if (filters?.statut) conditions.push(eq(evaluationCampaigns.statut, filters.statut));
    if (filters?.agenceId) conditions.push(eq(evaluationCampaigns.agenceId, filters.agenceId));

    const campaigns = conditions.length > 0
        ? await db.select().from(evaluationCampaigns).where(and(...conditions)).orderBy(desc(evaluationCampaigns.createdAt))
        : await db.select().from(evaluationCampaigns).orderBy(desc(evaluationCampaigns.createdAt));

    // Ajouter les stats par campagne
    const campaignIds = campaigns.map(c => c.id);
    if (campaignIds.length === 0) return [];

    const stats = await db
        .select({
            campaignId: evaluations.campaignId,
            total: sql<number>`count(*)`,
            finalized: sql<number>`count(*) filter (where ${evaluations.statut} = 'FINALIZED')`,
            avgScore: sql<number>`avg(${evaluations.finalScore}::numeric) filter (where ${evaluations.finalScore} is not null)`,
        })
        .from(evaluations)
        .where(inArray(evaluations.campaignId, campaignIds))
        .groupBy(evaluations.campaignId);

    const statsMap = new Map(stats.map(s => [s.campaignId, s]));

    return campaigns.map(c => ({
        ...c,
        totalEvaluations: statsMap.get(c.id)?.total || 0,
        finalizedCount: statsMap.get(c.id)?.finalized || 0,
        avgScore: statsMap.get(c.id)?.avgScore ? Number(statsMap.get(c.id)!.avgScore).toFixed(1) : null,
    }));
}

export async function createEvaluationCampaign(data: InsertEvaluationCampaign) {
    const [campaign] = await db.insert(evaluationCampaigns).values(data).returning();
    return campaign;
}

export async function updateEvaluationCampaign(id: string, data: Partial<InsertEvaluationCampaign>) {
    const [campaign] = await db.update(evaluationCampaigns).set({ ...data, updatedAt: new Date() }).where(eq(evaluationCampaigns.id, id)).returning();
    return campaign;
}

// =============================================================================
// EVALUATIONS
// =============================================================================

export async function getEvaluations(filters: { campaignId?: string; employeId?: string; managerId?: string; statut?: string }) {
    const conditions = [];
    if (filters.campaignId) conditions.push(eq(evaluations.campaignId, filters.campaignId));
    if (filters.employeId) conditions.push(eq(evaluations.employeId, filters.employeId));
    if (filters.managerId) conditions.push(eq(evaluations.managerId, filters.managerId));
    if (filters.statut) conditions.push(eq(evaluations.statut, filters.statut));

    return conditions.length > 0
        ? await db.select().from(evaluations).where(and(...conditions)).orderBy(desc(evaluations.createdAt))
        : await db.select().from(evaluations).orderBy(desc(evaluations.createdAt));
}

export async function getEvaluationById(id: string) {
    const [eval_] = await db.select().from(evaluations).where(eq(evaluations.id, id));
    return eval_ || null;
}

export async function updateEvaluation(id: string, data: Partial<InsertEvaluation>) {
    const [eval_] = await db.update(evaluations).set({ ...data, updatedAt: new Date() }).where(eq(evaluations.id, id)).returning();
    return eval_;
}

// =============================================================================
// EVALUATION RESPONSES
// =============================================================================

export async function getEvaluationResponses(evaluationId: string, responseType?: string) {
    const conditions = [eq(evaluationResponses.evaluationId, evaluationId)];
    if (responseType) conditions.push(eq(evaluationResponses.responseType, responseType));
    return db.select().from(evaluationResponses).where(and(...conditions));
}

export async function batchUpsertResponses(evalId: string, responseType: string, responses: Array<{ criteriaId: string; rating: number; commentaire?: string }>) {
    // Supprimer les réponses existantes pour ce type
    await db.delete(evaluationResponses).where(
        and(eq(evaluationResponses.evaluationId, evalId), eq(evaluationResponses.responseType, responseType))
    );
    // Insérer les nouvelles
    if (responses.length > 0) {
        await db.insert(evaluationResponses).values(
            responses.map(r => ({ evaluationId: evalId, responseType, ...r }))
        );
    }
}

export async function getEmployeeEvaluationHistory(employeId: string) {
    return db
        .select({
            evaluationId: evaluations.id,
            campaignNom: evaluationCampaigns.nom,
            campaignType: evaluationCampaigns.type,
            dateFin: evaluationCampaigns.dateFin,
            finalScore: evaluations.finalScore,
            recommandation: evaluations.recommandation,
            statut: evaluations.statut,
        })
        .from(evaluations)
        .innerJoin(evaluationCampaigns, eq(evaluations.campaignId, evaluationCampaigns.id))
        .where(eq(evaluations.employeId, employeId))
        .orderBy(desc(evaluationCampaigns.dateFin));
}

// =============================================================================
// HR ALERTS
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

// =============================================================================
// PAYROLL TRANSFER FILES
// =============================================================================

export async function getTransferFiles(runId: number) {
    return db.select().from(payrollTransferFiles).where(eq(payrollTransferFiles.payrollRunId, runId)).orderBy(desc(payrollTransferFiles.createdAt));
}

// =============================================================================
// RAPPORTS RH
// =============================================================================

export async function getRegistrePersonnel(filters?: { statut?: string; departmentId?: string; agenceId?: string }) {
    const conditions = [];

    // By default only active employees
    if (filters?.statut) {
        conditions.push(eq(users.statut, filters.statut));
    }
    if (filters?.departmentId) {
        conditions.push(eq(jobPositions.departmentId, filters.departmentId));
    }
    if (filters?.agenceId) {
        conditions.push(eq(employes.agenceId, filters.agenceId));
    }

    const query = db.select({
        matricule: employes.matricule,
        nom: users.nom,
        prenom: users.prenom,
        sexe: users.sexe,
        dateNaissance: users.dateNaissance,
        dateEmbauche: employes.dateEmbauche,
        poste: jobPositions.name,
        departement: departments.name,
        typeContrat: employes.typeContrat,
        qualification: jobPositions.qualification,
        salaireBase: employes.salaireBase,
        numeroCnss: employes.numeroCnss,
        dateSortie: employes.dateSortie,
        motifSortie: employes.motifSortie,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
    .leftJoin(departments, eq(jobPositions.departmentId, departments.id));

    if (conditions.length > 0) {
        return await query.where(and(...conditions)).orderBy(users.nom);
    }
    return await query.orderBy(users.nom);
}

export async function getBilanSocial(year: number) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // 1. Effectifs
    const totalEmployes = await db.select({ count: sql<number>`count(*)::int` }).from(employes)
        .innerJoin(users, eq(employes.userId, users.id))
        .where(eq(users.statut, StatutUser.ACTIVE));
    const total = totalEmployes[0]?.count || 0;

    // Par département
    const parDept = await db.select({
        departement: departments.name,
        count: sql<number>`count(*)::int`,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
    .leftJoin(departments, eq(jobPositions.departmentId, departments.id))
    .where(eq(users.statut, StatutUser.ACTIVE))
    .groupBy(departments.name);

    // Par type de contrat
    const parContrat = await db.select({
        typeContrat: employes.typeContrat,
        count: sql<number>`count(*)::int`,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(eq(users.statut, StatutUser.ACTIVE))
    .groupBy(employes.typeContrat);

    // Par sexe
    const parSexe = await db.select({
        sexe: users.sexe,
        count: sql<number>`count(*)::int`,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(eq(users.statut, StatutUser.ACTIVE))
    .groupBy(users.sexe);

    // Embauches dans l'année
    const embauches = await db.select({ count: sql<number>`count(*)::int` })
        .from(employes)
        .where(and(
            gte(employes.dateEmbauche, startDate),
            lte(employes.dateEmbauche, endDate)
        ));

    // Départs dans l'année
    const departs = await db.select({ count: sql<number>`count(*)::int` })
        .from(employes)
        .where(and(
            gte(employes.dateSortie, startDate),
            lte(employes.dateSortie, endDate)
        ));

    const nbEmbauches = embauches[0]?.count || 0;
    const nbDeparts = departs[0]?.count || 0;
    const tauxRotation = total > 0 ? Math.round((nbDeparts / total) * 100) : 0;

    // 2. Rémunération
    const moisDebut = `${year}-01`;
    const moisFin = `${year}-12`;
    const masseSalariale = await db.select({
        total: sql<number>`coalesce(sum(${bulletinsPaie.salaireNet}::numeric), 0)::int`,
    })
    .from(bulletinsPaie)
    .where(and(
        gte(bulletinsPaie.mois, moisDebut),
        lte(bulletinsPaie.mois, moisFin)
    ));

    const salaireMoyen = total > 0 ? Math.round((masseSalariale[0]?.total || 0) / (total * 12)) : 0;

    // 3. Congés
    const conges = await db.select({
        totalJours: sql<number>`coalesce(sum(
            (${demandesConges.dateFin}::date - ${demandesConges.dateDebut}::date) + 1
        ), 0)::int`,
    })
    .from(demandesConges)
    .where(and(
        eq(demandesConges.statut, StatutConge.APPROVED),
        gte(demandesConges.dateDebut, startDate),
        lte(demandesConges.dateFin, endDate)
    ));

    // 4. Formations
    const formationsCount = await db.select({ count: sql<number>`count(*)::int` })
        .from(formations)
        .where(and(
            gte(formations.dateDebut, new Date(`${year}-01-01`)),
            lte(formations.dateDebut, new Date(`${year}-12-31`))
        ));

    const participantsCount = await db.select({ count: sql<number>`count(distinct ${formationParticipants.employeId})::int` })
        .from(formationParticipants)
        .innerJoin(formations, eq(formationParticipants.formationId, formations.id))
        .where(and(
            gte(formations.dateDebut, new Date(`${year}-01-01`)),
            lte(formations.dateDebut, new Date(`${year}-12-31`))
        ));

    // 5. Sanctions
    const sanctionsParGravite = await db.select({
        gravite: sanctions.gravite,
        count: sql<number>`count(*)::int`,
    })
    .from(sanctions)
    .where(and(
        gte(sanctions.date, startDate),
        lte(sanctions.date, endDate)
    ))
    .groupBy(sanctions.gravite);

    return {
        annee: year,
        effectifs: {
            total,
            parDepartement: parDept,
            parTypeContrat: parContrat,
            parSexe: parSexe,
            embauches: nbEmbauches,
            departs: nbDeparts,
            tauxRotation,
        },
        remuneration: {
            masseSalariale: masseSalariale[0]?.total || 0,
            salaireMoyen,
        },
        conges: {
            totalJoursApprouves: conges[0]?.totalJours || 0,
        },
        formations: {
            nombreFormations: formationsCount[0]?.count || 0,
            nombreParticipants: participantsCount[0]?.count || 0,
        },
        sanctions: {
            parGravite: sanctionsParGravite,
            total: sanctionsParGravite.reduce((sum, s) => sum + s.count, 0),
        },
    };
}

// ========================
// DOCUMENT REQUESTS
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

// =============================================================================
// JOB OFFERS
// =============================================================================

export async function getJobOffers(filter?: { statut?: string; visibilite?: string }) {
  let query = db.select({
    offer: jobOffers,
    positionName: jobPositions.name,
    positionCode: jobPositions.code,
    departmentName: departments.name,
    departmentId: departments.id,
  })
    .from(jobOffers)
    .innerJoin(jobPositions, eq(jobOffers.jobPositionId, jobPositions.id))
    .innerJoin(departments, eq(jobPositions.departmentId, departments.id))
    .orderBy(desc(jobOffers.createdAt))
    .$dynamic();

  const conditions = [];
  if (filter?.statut) conditions.push(eq(jobOffers.statut, filter.statut));
  if (filter?.visibilite) conditions.push(eq(jobOffers.visibilite, filter.visibilite));
  if (conditions.length > 0) query = query.where(and(...conditions));

  const results = await query;

  // Get candidature counts per offer
  const counts = await db.select({
    jobOfferId: candidatures.jobOfferId,
    count: count(),
  })
    .from(candidatures)
    .where(sql`${candidatures.jobOfferId} IS NOT NULL`)
    .groupBy(candidatures.jobOfferId);

  const countMap = new Map(counts.map(c => [c.jobOfferId, Number(c.count)]));

  return results.map(r => ({
    ...r.offer,
    positionName: r.positionName,
    positionCode: r.positionCode,
    departmentName: r.departmentName,
    departmentId: r.departmentId,
    candidatureCount: countMap.get(r.offer.id) || 0,
  }));
}

export async function getJobOfferById(id: number) {
  const [result] = await db.select({
    offer: jobOffers,
    positionName: jobPositions.name,
    positionCode: jobPositions.code,
    departmentName: departments.name,
    departmentId: departments.id,
  })
    .from(jobOffers)
    .innerJoin(jobPositions, eq(jobOffers.jobPositionId, jobPositions.id))
    .innerJoin(departments, eq(jobPositions.departmentId, departments.id))
    .where(eq(jobOffers.id, id));

  if (!result) return null;

  const [countResult] = await db.select({ count: count() })
    .from(candidatures)
    .where(eq(candidatures.jobOfferId, id));

  return {
    ...result.offer,
    positionName: result.positionName,
    positionCode: result.positionCode,
    departmentName: result.departmentName,
    departmentId: result.departmentId,
    candidatureCount: Number(countResult?.count || 0),
  };
}

export async function getJobOfferCandidatures(offerId: number) {
  return db.select()
    .from(candidatures)
    .where(eq(candidatures.jobOfferId, offerId))
    .orderBy(desc(candidatures.scoreGlobal));
}

export async function getInternalJobOffers() {
  return db.select({
    offer: jobOffers,
    positionName: jobPositions.name,
    departmentName: departments.name,
  })
    .from(jobOffers)
    .innerJoin(jobPositions, eq(jobOffers.jobPositionId, jobPositions.id))
    .innerJoin(departments, eq(jobPositions.departmentId, departments.id))
    .where(
      and(
        eq(jobOffers.statut, 'PUBLISHED'),
        or(eq(jobOffers.visibilite, 'INTERNAL'), eq(jobOffers.visibilite, 'BOTH'))
      )
    )
    .orderBy(desc(jobOffers.datePublication));
}

// =============================================================================
// PAYMENT BATCHES
// =============================================================================

export async function getPaymentBatches(runId: number) {
  return db.select()
    .from(payrollPaymentBatches)
    .where(eq(payrollPaymentBatches.payrollRunId, runId))
    .orderBy(asc(payrollPaymentBatches.bankName));
}

export async function getPaymentBatchById(batchId: string) {
  const [batch] = await db.select()
    .from(payrollPaymentBatches)
    .where(eq(payrollPaymentBatches.id, batchId));
  if (!batch) return null;

  const items = await db.select()
    .from(payrollBatchItems)
    .where(eq(payrollBatchItems.batchId, batchId))
    .orderBy(asc(payrollBatchItems.employeNom));

  return { ...batch, items };
}

// =============================================================================
// BANK RECONCILIATION
// =============================================================================

export async function getReconciliationSessions(filter?: { period?: string; bankName?: string }) {
  let query = db.select()
    .from(bankReconciliationSessions)
    .orderBy(desc(bankReconciliationSessions.createdAt))
    .$dynamic();

  const conditions = [];
  if (filter?.period) conditions.push(eq(bankReconciliationSessions.period, filter.period));
  if (filter?.bankName) conditions.push(eq(bankReconciliationSessions.bankName, filter.bankName));
  if (conditions.length > 0) query = query.where(and(...conditions));

  return query;
}

export async function getReconciliationSessionById(sessionId: string) {
  const [session] = await db.select()
    .from(bankReconciliationSessions)
    .where(eq(bankReconciliationSessions.id, sessionId));
  if (!session) return null;

  const lines = await db.select()
    .from(bankReconciliationLines)
    .where(eq(bankReconciliationLines.sessionId, sessionId))
    .orderBy(asc(bankReconciliationLines.source), desc(bankReconciliationLines.montant));

  return { ...session, lines };
}

export async function updateReconciliationSessionStats(sessionId: string) {
  const lines = await db.select()
    .from(bankReconciliationLines)
    .where(eq(bankReconciliationLines.sessionId, sessionId));

  const transferLines = lines.filter(l => l.source === 'TRANSFER');
  const matchedLines = lines.filter(l => l.matchStatus === 'MATCHED');
  const unmatchedLines = lines.filter(l => l.matchStatus === 'UNMATCHED');

  const totalExpected = transferLines.reduce((s, l) => s + l.montant, 0);
  const totalMatched = matchedLines.reduce((s, l) => s + l.montant, 0);
  const totalUnmatched = unmatchedLines.reduce((s, l) => s + l.montant, 0);

  await db.update(bankReconciliationSessions)
    .set({
      totalExpected: totalExpected.toString(),
      totalMatched: totalMatched.toString(),
      totalUnmatched: totalUnmatched.toString(),
      matchedCount: matchedLines.length,
      unmatchedCount: unmatchedLines.length,
    })
    .where(eq(bankReconciliationSessions.id, sessionId));
}

// ================================================
// PROJETS RH - Gestion du temps projet
// ================================================

export async function getProjects(filter?: { statut?: string; agenceId?: string }) {
  const conditions = [];
  if (filter?.statut) conditions.push(eq(projetsRh.statut, filter.statut));
  if (filter?.agenceId) conditions.push(eq(projetsRh.agenceId, filter.agenceId));

  const query = db.select().from(projetsRh);
  if (conditions.length > 0) {
    return await query.where(and(...conditions)).orderBy(desc(projetsRh.createdAt));
  }
  return await query.orderBy(desc(projetsRh.createdAt));
}

export async function getProjectById(id: string) {
  const [project] = await db.select().from(projetsRh).where(eq(projetsRh.id, id));
  if (!project) return null;

  const membres = await db.select({
    id: projetMembres.id,
    projetId: projetMembres.projetId,
    employeId: projetMembres.employeId,
    role: projetMembres.role,
    dateAjout: projetMembres.dateAjout,
    employeNom: sql<string>`(SELECT CONCAT(u.prenom, ' ', u.nom) FROM users u JOIN employes e ON e."user_id" = u.id WHERE e.id = ${projetMembres.employeId})`,
    employeMatricule: sql<string>`(SELECT e.matricule FROM employes e WHERE e.id = ${projetMembres.employeId})`,
  }).from(projetMembres).where(eq(projetMembres.projetId, id));

  return { ...project, membres };
}

export async function getEmployeeProjects(employeId: string) {
  const memberRows = await db.select({ projetId: projetMembres.projetId })
    .from(projetMembres).where(eq(projetMembres.employeId, employeId));
  if (memberRows.length === 0) return [];
  const projectIds = memberRows.map(r => r.projetId);
  return await db.select().from(projetsRh)
    .where(and(inArray(projetsRh.id, projectIds), not(eq(projetsRh.statut, 'CANCELLED'))))
    .orderBy(desc(projetsRh.createdAt));
}

export async function createProject(data: InsertProjetRh) {
  const [project] = await db.insert(projetsRh).values(data).returning();
  return project;
}

export async function updateProject(id: string, data: Partial<InsertProjetRh>) {
  const [project] = await db.update(projetsRh).set({ ...data, updatedAt: new Date() })
    .where(eq(projetsRh.id, id)).returning();
  return project;
}

export async function addProjectMember(data: InsertProjetMembre) {
  const [member] = await db.insert(projetMembres).values(data).returning();
  return member;
}

export async function removeProjectMember(projetId: string, employeId: string) {
  await db.delete(projetMembres)
    .where(and(eq(projetMembres.projetId, projetId), eq(projetMembres.employeId, employeId)));
}

// ================================================
// FEUILLES DE TEMPS - Timesheets
// ================================================

export async function getTimesheets(filter?: { employeId?: string; statut?: string; semaine?: string }) {
  const conditions = [];
  if (filter?.employeId) conditions.push(eq(feuillesTemps.employeId, filter.employeId));
  if (filter?.statut) conditions.push(eq(feuillesTemps.statut, filter.statut));
  if (filter?.semaine) conditions.push(eq(feuillesTemps.semaine, filter.semaine));

  const query = db.select().from(feuillesTemps);
  if (conditions.length > 0) {
    return await query.where(and(...conditions)).orderBy(desc(feuillesTemps.dateDebut));
  }
  return await query.orderBy(desc(feuillesTemps.dateDebut));
}

export async function getTimesheetById(id: string) {
  const [sheet] = await db.select().from(feuillesTemps).where(eq(feuillesTemps.id, id));
  if (!sheet) return null;

  const entries = await db.select({
    id: tempsImputes.id,
    feuilleTempsId: tempsImputes.feuilleTempsId,
    projetId: tempsImputes.projetId,
    date: tempsImputes.date,
    heures: tempsImputes.heures,
    description: tempsImputes.description,
    tauxHoraireSnapshot: tempsImputes.tauxHoraireSnapshot,
    coutCalcule: tempsImputes.coutCalcule,
    projetNom: sql<string>`(SELECT nom FROM projets_rh WHERE id = ${tempsImputes.projetId})`,
    projetCode: sql<string>`(SELECT code FROM projets_rh WHERE id = ${tempsImputes.projetId})`,
  }).from(tempsImputes).where(eq(tempsImputes.feuilleTempsId, id))
    .orderBy(asc(tempsImputes.date), asc(tempsImputes.projetId));

  return { ...sheet, entries };
}

export async function createOrGetTimesheet(data: InsertFeuilleTemps) {
  // Check if a timesheet already exists for this employee + week
  const [existing] = await db.select().from(feuillesTemps)
    .where(and(
      eq(feuillesTemps.employeId, data.employeId),
      eq(feuillesTemps.semaine, data.semaine),
    ));
  if (existing) return existing;
  const [sheet] = await db.insert(feuillesTemps).values(data).returning();
  return sheet;
}

export async function submitTimesheet(id: string) {
  // Recalculate total hours
  const entries = await db.select().from(tempsImputes).where(eq(tempsImputes.feuilleTempsId, id));
  const totalHeures = entries.reduce((sum, e) => sum + parseFloat(e.heures), 0);

  const [sheet] = await db.update(feuillesTemps).set({
    statut: 'SUBMITTED',
    totalHeures: totalHeures.toFixed(2),
    soumisAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(feuillesTemps.id, id)).returning();
  return sheet;
}

export async function approveTimesheet(id: string, approuveParId: string) {
  // Get the timesheet with employee info for cost calculation
  const [sheet] = await db.select().from(feuillesTemps).where(eq(feuillesTemps.id, id));
  if (!sheet) return null;

  const [emp] = await db.select().from(employes).where(eq(employes.id, sheet.employeId));
  if (!emp) return null;

  // Calculate hourly rate based on pay mode
  let hourlyRate = 0;
  if (emp.modeCalculPaie === 'HOURLY') {
    hourlyRate = emp.tauxHoraire || 0;
  } else if (emp.modeCalculPaie === 'DAILY') {
    hourlyRate = Math.round((emp.tauxJournalier || 0) / 8);
  } else {
    // MONTHLY: divide by 173.33 (standard monthly hours)
    hourlyRate = Math.round((emp.salaireBase || 0) / 173.33);
  }

  // Update each time entry with cost snapshot
  const entries = await db.select().from(tempsImputes).where(eq(tempsImputes.feuilleTempsId, id));
  for (const entry of entries) {
    const heures = parseFloat(entry.heures);
    const cout = Math.round(heures * hourlyRate);
    await db.update(tempsImputes).set({
      tauxHoraireSnapshot: hourlyRate,
      coutCalcule: cout,
    }).where(eq(tempsImputes.id, entry.id));
  }

  const totalHeures = entries.reduce((sum, e) => sum + parseFloat(e.heures), 0);

  const [updated] = await db.update(feuillesTemps).set({
    statut: 'APPROVED',
    totalHeures: totalHeures.toFixed(2),
    approuvePar: approuveParId,
    approuveAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(feuillesTemps.id, id)).returning();
  return updated;
}

export async function rejectTimesheet(id: string, motif: string) {
  const [sheet] = await db.update(feuillesTemps).set({
    statut: 'REJECTED',
    rejeteMotif: motif,
    updatedAt: new Date(),
  }).where(eq(feuillesTemps.id, id)).returning();
  return sheet;
}

// ================================================
// TEMPS IMPUTES - Time entries
// ================================================

export async function upsertTimeEntry(data: InsertTempsImpute) {
  // Check if an entry already exists for this timesheet + project + date
  const [existing] = await db.select().from(tempsImputes)
    .where(and(
      eq(tempsImputes.feuilleTempsId, data.feuilleTempsId),
      eq(tempsImputes.projetId, data.projetId),
      eq(tempsImputes.date, data.date),
    ));

  if (existing) {
    const [updated] = await db.update(tempsImputes).set({
      heures: data.heures,
      description: data.description,
    }).where(eq(tempsImputes.id, existing.id)).returning();
    return updated;
  }

  const [entry] = await db.insert(tempsImputes).values(data).returning();
  return entry;
}

export async function deleteTimeEntry(entryId: string) {
  await db.delete(tempsImputes).where(eq(tempsImputes.id, entryId));
}

// Get presence records for an employee over a date range (for timesheet linking)
export async function getPresenceForWeek(employeId: string, dateDebut: string, dateFin: string) {
  return await db.select({
    id: presences.id,
    date: presences.date,
    statut: presences.statut,
    heureArrivee: presences.heureArrivee,
    heureDepart: presences.heureDepart,
    heuresTravaillees: presences.heuresTravaillees,
    heuresSupplementaires: presences.heuresSupplementaires,
  }).from(presences)
    .where(and(
      eq(presences.employeId, employeId),
      gte(presences.date, dateDebut),
      lte(presences.date, dateFin),
    ))
    .orderBy(asc(presences.date));
}

// ================================================
// REPORTING - Project cost & employee allocation
// ================================================

export async function getProjectCostSummary(projetId: string) {
  const result = await db.select({
    totalHeures: sql<number>`COALESCE(SUM(CAST(${tempsImputes.heures} AS numeric)), 0)`,
    totalCout: sql<number>`COALESCE(SUM(${tempsImputes.coutCalcule}), 0)`,
    nbEntries: sql<number>`COUNT(*)::int`,
  }).from(tempsImputes)
    .where(eq(tempsImputes.projetId, projetId));

  // Get breakdown by employee
  const byEmployee = await db.select({
    employeId: feuillesTemps.employeId,
    employeNom: feuillesTemps.employeNom,
    totalHeures: sql<number>`COALESCE(SUM(CAST(${tempsImputes.heures} AS numeric)), 0)`,
    totalCout: sql<number>`COALESCE(SUM(${tempsImputes.coutCalcule}), 0)`,
  }).from(tempsImputes)
    .innerJoin(feuillesTemps, eq(tempsImputes.feuilleTempsId, feuillesTemps.id))
    .where(eq(tempsImputes.projetId, projetId))
    .groupBy(feuillesTemps.employeId, feuillesTemps.employeNom);

  return { ...(result[0] || { totalHeures: 0, totalCout: 0, nbEntries: 0 }), byEmployee };
}

export async function getEmployeeTimeAllocation(employeId: string, from?: string, to?: string) {
  const conditions = [eq(feuillesTemps.employeId, employeId)];
  if (from) conditions.push(gte(feuillesTemps.dateDebut, from));
  if (to) conditions.push(lte(feuillesTemps.dateFin, to));

  const sheets = await db.select({ id: feuillesTemps.id })
    .from(feuillesTemps).where(and(...conditions));

  if (sheets.length === 0) return { byProject: [], totalHeures: 0 };

  const sheetIds = sheets.map(s => s.id);

  const byProject = await db.select({
    projetId: tempsImputes.projetId,
    projetNom: sql<string>`(SELECT nom FROM projets_rh WHERE id = ${tempsImputes.projetId})`,
    projetCode: sql<string>`(SELECT code FROM projets_rh WHERE id = ${tempsImputes.projetId})`,
    totalHeures: sql<number>`COALESCE(SUM(CAST(${tempsImputes.heures} AS numeric)), 0)`,
    totalCout: sql<number>`COALESCE(SUM(${tempsImputes.coutCalcule}), 0)`,
  }).from(tempsImputes)
    .where(inArray(tempsImputes.feuilleTempsId, sheetIds))
    .groupBy(tempsImputes.projetId);

  const totalHeures = byProject.reduce((s, p) => s + Number(p.totalHeures), 0);

  return { byProject, totalHeures };
}

// ================================================
// MON ESPACE - Employee self-service
// ================================================

export async function getMyDashboard(employeId: string) {
  // Leave balance
  const congesResult = await db.select({
    total: sql<number>`COUNT(*)::int`,
    enAttente: sql<number>`COUNT(*) FILTER (WHERE ${demandesConges.statut} = 'En attente')::int`,
    approuve: sql<number>`COUNT(*) FILTER (WHERE ${demandesConges.statut} = 'Approuvé')::int`,
  }).from(demandesConges)
    .where(eq(demandesConges.employeId, employeId));

  // Recent payslips (last 3, excluding drafts and cancelled)
  const derniersBulletins = await db.select()
    .from(bulletinsPaie)
    .where(and(
      eq(bulletinsPaie.employeId, employeId),
      not(eq(bulletinsPaie.statut, 'DRAFT')),
      not(eq(bulletinsPaie.statut, 'CANCELLED')),
    ))
    .orderBy(desc(bulletinsPaie.mois))
    .limit(3);

  // Presence stats for current month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  const presenceStats = await db.select({
    total: sql<number>`COUNT(*)::int`,
    presents: sql<number>`COUNT(*) FILTER (WHERE ${presences.statut} = 'PRESENT')::int`,
    retards: sql<number>`COUNT(*) FILTER (WHERE ${presences.statut} = 'LATE')::int`,
    absents: sql<number>`COUNT(*) FILTER (WHERE ${presences.statut} = 'ABSENT')::int`,
    heuresTravaillees: sql<number>`COALESCE(SUM(${presences.heuresTravaillees}), 0)`,
  }).from(presences)
    .where(and(
      eq(presences.employeId, employeId),
      gte(presences.date, monthStart),
      lte(presences.date, monthEnd),
    ));

  // Pending document requests
  const documentsEnCours = await db.select({ count: sql<number>`COUNT(*)::int` })
    .from(hrDocumentRequests)
    .where(and(
      eq(hrDocumentRequests.employeId, employeId),
      not(eq(hrDocumentRequests.statut, 'DELIVERED')),
      not(eq(hrDocumentRequests.statut, 'REJECTED')),
    ));

  // Recent evaluations
  const evaluationsRecentes = await db.select()
    .from(evaluations)
    .where(eq(evaluations.employeId, employeId))
    .orderBy(desc(evaluations.createdAt))
    .limit(3);

  return {
    conges: congesResult[0] || { total: 0, enAttente: 0, approuve: 0 },
    derniersBulletins,
    presenceMois: presenceStats[0] || { total: 0, presents: 0, retards: 0, absents: 0, heuresTravaillees: 0 },
    documentsEnCours: documentsEnCours[0]?.count || 0,
    evaluationsRecentes,
  };
}

export async function getMyPresence(employeId: string, mois?: string) {
  const conditions = [eq(presences.employeId, employeId)];
  if (mois) {
    // mois format: "2026-02"
    conditions.push(sql`to_char(${presences.date}::date, 'YYYY-MM') = ${mois}`);
  }

  return await db.select().from(presences)
    .where(and(...conditions))
    .orderBy(desc(presences.date));
}

export async function getMyEvaluations(employeId: string) {
  return await db.select({
    id: evaluations.id,
    campaignId: evaluations.campaignId,
    employeId: evaluations.employeId,
    evaluatorId: evaluations.managerId,
    status: evaluations.statut,
    overallScore: evaluations.finalScore,
    overallComment: evaluations.managerCommentaire,
    createdAt: evaluations.createdAt,
    completedAt: evaluations.finalizedAt,
    evaluatorNom: evaluations.managerNom,
  }).from(evaluations)
    .where(eq(evaluations.employeId, employeId))
    .orderBy(desc(evaluations.createdAt));
}

export async function updateMyProfile(employeId: string, data: {
  telephone?: string;
  adresse?: string;
  email?: string;
  bankName?: string;
  bankCode?: string;
  branchCode?: string;
  bankAccountNumber?: string;
  accountKey?: string;
  paymentMethod?: string;
  paymentDetails?: string;
  situationFamiliale?: string;
  nombreEnfantsCharge?: number;
}) {
  // Only allow updating personal/contact fields, NOT salary/contract
  const allowedFields: any = { updatedAt: new Date() };
  if (data.bankName !== undefined) allowedFields.bankName = data.bankName;
  if (data.bankCode !== undefined) allowedFields.bankCode = data.bankCode;
  if (data.branchCode !== undefined) allowedFields.branchCode = data.branchCode;
  if (data.bankAccountNumber !== undefined) allowedFields.bankAccountNumber = data.bankAccountNumber;
  if (data.accountKey !== undefined) allowedFields.accountKey = data.accountKey;
  if (data.paymentMethod !== undefined) allowedFields.paymentMethod = data.paymentMethod;
  if (data.paymentDetails !== undefined) allowedFields.paymentDetails = data.paymentDetails;
  if (data.situationFamiliale !== undefined) allowedFields.situationFamiliale = data.situationFamiliale;
  if (data.nombreEnfantsCharge !== undefined) allowedFields.nombreEnfantsCharge = data.nombreEnfantsCharge;

  // Update user table for contact info
  const [emp] = await db.select().from(employes).where(eq(employes.id, employeId));
  if (!emp) return null;

  if (data.telephone || data.adresse || data.email) {
    const userFields: any = {};
    if (data.telephone) userFields.telephone = data.telephone;
    if (data.adresse) userFields.adresse = data.adresse;
    if (data.email) userFields.email = data.email;
    await db.update(users).set(userFields).where(eq(users.id, emp.userId));
  }

  const [updated] = await db.update(employes).set(allowedFields)
    .where(eq(employes.id, employeId)).returning();
  return updated;
}
