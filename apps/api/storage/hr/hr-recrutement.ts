import {
  candidatures,
  departments,
  jobOffers,
  jobPositions
} from "@shared/schema";
import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../../db";

// Candidatures
export async function getCandidatures(statut?: string) {
    if (statut) {
        return await db.select().from(candidatures).where(eq(candidatures.statut, statut)).orderBy(desc(candidatures.datePostulation));
    }
    return await db.select().from(candidatures).orderBy(desc(candidatures.datePostulation));
}

// =============================================================================
// OFFRES D'EMPLOI
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
