import { eq, desc, and, sql, gte, lte, not, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  demandesConges,
  formations,
  sanctions,
  candidatures,
  bulletinsPaie, InsertBulletinPaie,
  avantages, Avantage,
  avantagesEmployes, InsertAvantageEmploye, AvantageEmploye,
  presences, Presence, users, horairesTravail, employes,
  jobPositions, departments,
  evaluationTemplates, evaluationCriteria, evaluationCampaigns, evaluations, evaluationResponses,
  hrAlertConfig, hrAlerts, payrollTransferFiles,
  type EvaluationTemplate, type InsertEvaluationTemplate,
  type EvaluationCriteria as EvalCriteria, type InsertEvaluationCriteria,
  type EvaluationCampaign, type InsertEvaluationCampaign,
  type Evaluation, type InsertEvaluation,
  type EvaluationResponse, type InsertEvaluationResponse,
  type HrAlertConfig, type HrAlert,
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

export async function checkIn(employeId: string, gps?: GpsData): Promise<Presence> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Check if already checked in
    const existing = await db.select().from(presences).where(and(eq(presences.employeId, employeId), eq(presences.date, today)));

    if (existing.length > 0) return existing[0]; // Already present

    // Determine status based on time (e.g. after 9:00 is LATE)
    const hour = now.getHours();
    let statut: string = StatutPresence.PRESENT;
    if (hour >= 9) statut = StatutPresence.LATE;

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
    
    // Fetch scheduled pause duration from horairesTravail
    const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const horaires = await db.select().from(horairesTravail)
        .where(and(
            eq(horairesTravail.employeId, employeId),
            eq(horairesTravail.jourSemaine, dayOfWeek),
            eq(horairesTravail.actif, true)
        ));
    
    let pauseMinutesFixe = 60; // Default scheduled pause: 60 min
    if (horaires.length > 0) {
        pauseMinutesFixe = horaires[0].pauseMinutes || 60;
    }
    
    // Calculate actual pause time if recorded
    let pauseMinutesReelle = 0;
    if (existing[0].pauseDebut && existing[0].pauseFin) {
        const pauseMs = new Date(existing[0].pauseFin).getTime() - new Date(existing[0].pauseDebut).getTime();
        pauseMinutesReelle = Math.floor(pauseMs / 60000);
    }
    
    // Use actual pause if recorded, otherwise use scheduled pause
    const pauseMinutes = pauseMinutesReelle > 0 ? pauseMinutesReelle : pauseMinutesFixe;
    
    const minutesTravaillees = Math.max(0, totalMinutes - pauseMinutes);
    
    // Standard work day = 8 hours = 480 minutes
    const standardMinutes = 480;
    const heuresSupplementaires = Math.max(0, minutesTravaillees - standardMinutes);

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
