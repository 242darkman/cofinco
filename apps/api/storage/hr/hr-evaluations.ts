import {
  evaluationCampaigns,
  evaluationCriteria,
  evaluationResponses,
  evaluations,
  evaluationTemplates,
  type InsertEvaluation,
  type InsertEvaluationCampaign,
  type InsertEvaluationCriteria,
  type InsertEvaluationTemplate
} from "@shared/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";

// =============================================================================
// MODÈLES D'ÉVALUATION
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
// CAMPAGNES D'ÉVALUATION
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
// ÉVALUATIONS
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
// RÉPONSES AUX ÉVALUATIONS
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
