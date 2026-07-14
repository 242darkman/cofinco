import { StatutUser } from "@shared/enum/status-constants";
import {
  agences,
  employeeAgencyAssignments,
  employes,
  jobPositions,
  orgGlobalRoles,
  users,
  type EmployeeAgencyAssignment, type InsertEmployeeAgencyAssignment,
} from "@shared/schema";
import { and, desc, eq, not, sql } from "drizzle-orm";
import { db } from "../../db";

// ─── Affectations d'Agence Employé ────────────────────────────────────────────

export async function getEmployeeAssignments(employeId: string): Promise<(EmployeeAgencyAssignment & { agenceNom: string; agenceCode: string; managerNom: string | null })[]> {
  const results = await db.select({
    assignment: employeeAgencyAssignments,
    agenceNom: agences.nom,
    agenceCode: agences.codeAgence,
    managerNom: sql<string | null>`(
      SELECT concat(u.nom, ' ', coalesce(u.prenom, ''))
      FROM employes e INNER JOIN users u ON e.user_id = u.id
      WHERE e.id = ${employeeAgencyAssignments.managerId}
    )`,
  })
  .from(employeeAgencyAssignments)
  .innerJoin(agences, eq(employeeAgencyAssignments.agenceId, agences.id))
  .where(eq(employeeAgencyAssignments.employeId, employeId))
  .orderBy(desc(employeeAgencyAssignments.isPrimary), desc(employeeAgencyAssignments.dateDebut));

  return results.map(r => ({
    ...r.assignment,
    agenceNom: r.agenceNom,
    agenceCode: r.agenceCode,
    managerNom: r.managerNom,
  }));
}

export async function createEmployeeAssignment(data: InsertEmployeeAgencyAssignment): Promise<EmployeeAgencyAssignment> {
  // If setting as primary, unset other primaries first
  if (data.isPrimary) {
    await db.update(employeeAgencyAssignments)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(
        eq(employeeAgencyAssignments.employeId, data.employeId),
        eq(employeeAgencyAssignments.statut, 'ACTIVE'),
        eq(employeeAgencyAssignments.isPrimary, true),
      ));
  }

  const [assignment] = await db.insert(employeeAgencyAssignments)
    .values(data)
    .returning();

  // Sync employes.agenceId if primary
  if (data.isPrimary) {
    await db.update(employes)
      .set({ agenceId: data.agenceId, updatedAt: new Date() })
      .where(eq(employes.id, data.employeId));
  }

  return assignment;
}

export async function updateEmployeeAssignment(
  assignId: string,
  data: Partial<InsertEmployeeAgencyAssignment>
): Promise<EmployeeAgencyAssignment | null> {
  // If setting as primary, unset other primaries first
  if (data.isPrimary) {
    const [current] = await db.select().from(employeeAgencyAssignments).where(eq(employeeAgencyAssignments.id, assignId));
    if (current) {
      await db.update(employeeAgencyAssignments)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(
          eq(employeeAgencyAssignments.employeId, current.employeId),
          eq(employeeAgencyAssignments.statut, 'ACTIVE'),
          eq(employeeAgencyAssignments.isPrimary, true),
          not(eq(employeeAgencyAssignments.id, assignId)),
        ));
    }
  }

  const [updated] = await db.update(employeeAgencyAssignments)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(employeeAgencyAssignments.id, assignId))
    .returning();

  // Sync employes.agenceId if primary
  if (updated && data.isPrimary) {
    await db.update(employes)
      .set({ agenceId: updated.agenceId, updatedAt: new Date() })
      .where(eq(employes.id, updated.employeId));
  }

  return updated || null;
}

export async function endEmployeeAssignment(assignId: string): Promise<EmployeeAgencyAssignment | null> {
  const [ended] = await db.update(employeeAgencyAssignments)
    .set({ statut: 'ENDED', dateFin: new Date().toISOString().split('T')[0], updatedAt: new Date() })
    .where(eq(employeeAgencyAssignments.id, assignId))
    .returning();
  return ended || null;
}

// ─── Managers Éligibles ──────────────────────────────────────────────────────

export async function getEligibleManagers(agenceId: string): Promise<{ id: string; nom: string; prenom: string; poste: string; isGlobal: boolean }[]> {
  // Employees with active assignment in this agency
  const assignedManagers = await db.select({
    id: employes.id,
    nom: users.nom,
    prenom: users.prenom,
    poste: jobPositions.name,
  })
  .from(employeeAgencyAssignments)
  .innerJoin(employes, eq(employeeAgencyAssignments.employeId, employes.id))
  .innerJoin(users, eq(employes.userId, users.id))
  .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
  .where(and(
    eq(employeeAgencyAssignments.agenceId, agenceId),
    eq(employeeAgencyAssignments.statut, 'ACTIVE'),
    eq(users.statut, StatutUser.ACTIVE),
  ));

  // Also include employees from the legacy agenceId field (backward compat)
  const legacyManagers = await db.select({
    id: employes.id,
    nom: users.nom,
    prenom: users.prenom,
    poste: jobPositions.name,
  })
  .from(employes)
  .innerJoin(users, eq(employes.userId, users.id))
  .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
  .where(and(
    eq(employes.agenceId, agenceId),
    eq(users.statut, StatutUser.ACTIVE),
  ));

  // Global roles (PDG, DGA, etc.)
  const globalManagers = await db.select({
    id: employes.id,
    nom: users.nom,
    prenom: users.prenom,
    titre: orgGlobalRoles.titre,
  })
  .from(orgGlobalRoles)
  .innerJoin(employes, eq(orgGlobalRoles.employeId, employes.id))
  .innerJoin(users, eq(employes.userId, users.id))
  .where(eq(orgGlobalRoles.statut, 'ACTIVE'));

  // Merge and deduplicate
  const seen = new Set<string>();
  const result: { id: string; nom: string; prenom: string; poste: string; isGlobal: boolean }[] = [];

  for (const m of globalManagers) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      result.push({ id: m.id, nom: m.nom, prenom: m.prenom || '', poste: m.titre || 'Direction Générale', isGlobal: true });
    }
  }
  for (const m of [...assignedManagers, ...legacyManagers]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      result.push({ id: m.id, nom: m.nom, prenom: m.prenom || '', poste: m.poste || 'Non défini', isGlobal: false });
    }
  }

  return result;
}
