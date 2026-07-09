/**
 * Service de gestion des évaluations de performance
 * Gère la génération des évaluations par campagne et le calcul des scores
 */

import { db } from "../db";
import {
  evaluationCampaigns,
  evaluations,
  evaluationResponses,
  evaluationCriteria,
  employes,
  type EvaluationCampaign,
} from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { users } from "@shared/schema";
import { createLogger } from "../lib/logger";

const logger = createLogger("EvaluationService");

/**
 * Génère les fiches d'évaluation pour tous les employés ciblés par une campagne
 */
export async function generateCampaignEvaluations(campaignId: string): Promise<{ created: number; skipped: number }> {
  const [campaign] = await db.select().from(evaluationCampaigns).where(eq(evaluationCampaigns.id, campaignId));
  if (!campaign) throw new Error("Campagne introuvable");

  // Récupérer les employés ciblés
  const targetEmployees = await getTargetEmployees(campaign);

  // Vérifier les évaluations déjà existantes pour cette campagne
  const existing = await db
    .select({ employeId: evaluations.employeId })
    .from(evaluations)
    .where(eq(evaluations.campaignId, campaignId));
  const existingIds = new Set(existing.map((e) => e.employeId));

  // Résoudre les noms des managers
  const managerIds = [...new Set(targetEmployees.filter((e) => e.managerId).map((e) => e.managerId!))];
  const managerNames = new Map<string, string>();
  if (managerIds.length > 0) {
    const managers = await db
      .select({ id: employes.id, userId: employes.userId })
      .from(employes)
      .where(inArray(employes.id, managerIds));
    const managerUserIds = managers.map((m) => m.userId);
    if (managerUserIds.length > 0) {
      const managerUsers = await db
        .select({ id: users.id, nom: users.nom, prenom: users.prenom })
        .from(users)
        .where(inArray(users.id, managerUserIds));
      const userMap = new Map(managerUsers.map((u) => [u.id, `${u.nom} ${u.prenom || ""}`.trim()]));
      managers.forEach((m) => {
        const name = userMap.get(m.userId);
        if (name) managerNames.set(m.id, name);
      });
    }
  }

  // Créer les évaluations manquantes
  const toCreate = targetEmployees
    .filter((emp) => !existingIds.has(emp.id))
    .map((emp) => ({
      campaignId,
      employeId: emp.id,
      employeNom: emp.nom,
      managerId: emp.managerId || null,
      managerNom: emp.managerId ? managerNames.get(emp.managerId) || null : null,
    }));

  if (toCreate.length > 0) {
    await db.insert(evaluations).values(toCreate);
  }

  logger.info({ campaignId, created: toCreate.length, skipped: existingIds.size }, "Évaluations générées");
  return { created: toCreate.length, skipped: existingIds.size };
}

/**
 * Récupère les employés ciblés selon le type de ciblage de la campagne
 */
async function getTargetEmployees(campaign: EvaluationCampaign) {
  // Jointure pour récupérer le nom complet
  const baseQuery = db
    .select({
      id: employes.id,
      nom: sql<string>`concat(${users.nom}, ' ', coalesce(${users.prenom}, ''))`.as("nom"),
      managerId: employes.managerId,
      jobPositionId: employes.jobPositionId,
      agenceId: employes.agenceId,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(eq(employes.statut, "ACTIVE"));

  const filter = campaign.targetFilter as string[] | null;

  if (campaign.targetType === "ALL") {
    if (campaign.agenceId) {
      return db
        .select({
          id: employes.id,
          nom: sql<string>`concat(${users.nom}, ' ', coalesce(${users.prenom}, ''))`.as("nom"),
          managerId: employes.managerId,
          jobPositionId: employes.jobPositionId,
          agenceId: employes.agenceId,
        })
        .from(employes)
        .innerJoin(users, eq(employes.userId, users.id))
        .where(and(eq(employes.statut, "ACTIVE"), eq(employes.agenceId, campaign.agenceId)));
    }
    return baseQuery;
  }

  if (campaign.targetType === "DEPARTMENT" && filter?.length) {
    return db
      .select({
        id: employes.id,
        nom: sql<string>`concat(${users.nom}, ' ', coalesce(${users.prenom}, ''))`.as("nom"),
        managerId: employes.managerId,
        jobPositionId: employes.jobPositionId,
        agenceId: employes.agenceId,
      })
      .from(employes)
      .innerJoin(users, eq(employes.userId, users.id))
      .where(and(eq(employes.statut, "ACTIVE"), sql`${employes.jobPositionId} IN (SELECT id FROM job_positions WHERE department_id = ANY(${filter}))`));
  }

  if (campaign.targetType === "POSITION" && filter?.length) {
    return db
      .select({
        id: employes.id,
        nom: sql<string>`concat(${users.nom}, ' ', coalesce(${users.prenom}, ''))`.as("nom"),
        managerId: employes.managerId,
        jobPositionId: employes.jobPositionId,
        agenceId: employes.agenceId,
      })
      .from(employes)
      .innerJoin(users, eq(employes.userId, users.id))
      .where(and(eq(employes.statut, "ACTIVE"), inArray(employes.jobPositionId, filter)));
  }

  if (campaign.targetType === "CUSTOM" && filter?.length) {
    return db
      .select({
        id: employes.id,
        nom: sql<string>`concat(${users.nom}, ' ', coalesce(${users.prenom}, ''))`.as("nom"),
        managerId: employes.managerId,
        jobPositionId: employes.jobPositionId,
        agenceId: employes.agenceId,
      })
      .from(employes)
      .innerJoin(users, eq(employes.userId, users.id))
      .where(and(eq(employes.statut, "ACTIVE"), inArray(employes.id, filter)));
  }

  return baseQuery;
}

/**
 * Calcule le score pondéré d'une évaluation (self ou manager)
 * Retourne un score sur 100
 */
export async function computeEvaluationScore(
  evaluationId: string,
  responseType: "SELF" | "MANAGER"
): Promise<number> {
  const responses = await db
    .select({
      rating: evaluationResponses.rating,
      poids: evaluationCriteria.poids,
    })
    .from(evaluationResponses)
    .innerJoin(evaluationCriteria, eq(evaluationResponses.criteriaId, evaluationCriteria.id))
    .where(
      and(
        eq(evaluationResponses.evaluationId, evaluationId),
        eq(evaluationResponses.responseType, responseType)
      )
    );

  if (responses.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const r of responses) {
    const weight = r.poids ?? 0;
    // Normalise rating 1-5 vers 0-100
    weightedSum += (r.rating / 5) * 100 * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
}

/**
 * Finalise une évaluation : calcule le score final (moyenne self + manager)
 */
export async function finalizeEvaluation(evaluationId: string): Promise<number> {
  const [eval_] = await db.select().from(evaluations).where(eq(evaluations.id, evaluationId));
  if (!eval_) throw new Error("Évaluation introuvable");

  const selfScore = parseFloat(eval_.selfEvalScore || "0");
  const managerScore = parseFloat(eval_.managerEvalScore || "0");

  // Si les deux sont remplis, moyenne. Sinon, prendre celui qui existe.
  let finalScore: number;
  if (selfScore > 0 && managerScore > 0) {
    finalScore = Math.round(((selfScore + managerScore) / 2) * 100) / 100;
  } else {
    finalScore = managerScore > 0 ? managerScore : selfScore;
  }

  await db
    .update(evaluations)
    .set({
      finalScore: finalScore.toFixed(2),
      statut: "FINALIZED",
      finalizedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(evaluations.id, evaluationId));

  return finalScore;
}
