import {
  bulletinsPaie,
  demandesConges,
  employes,
  evaluations,
  hrDocumentRequests,
  presences,
  users
} from "@shared/schema";
import { and, desc, eq, gte, lte, not, sql } from "drizzle-orm";
import { db } from "../../db";

// ================================================
// MON ESPACE - Libre-service employé
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
