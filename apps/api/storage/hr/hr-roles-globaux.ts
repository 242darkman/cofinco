import {
  employes,
  orgGlobalRoles,
  users,
  type InsertOrgGlobalRole,
  type OrgGlobalRole,
} from "@shared/schema";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../../db";

// ─── Rôles Globaux de l'Organigramme (PDG, DGA, etc.) ──────────────────────────────────────

export async function getActiveGlobalRoles(): Promise<(OrgGlobalRole & { employeNom: string; employePrenom: string; photoProfile: string | null })[]> {
  const results = await db.select({
    role: orgGlobalRoles,
    employeNom: users.nom,
    employePrenom: users.prenom,
    photoProfile: users.photoProfile,
  })
  .from(orgGlobalRoles)
  .innerJoin(employes, eq(orgGlobalRoles.employeId, employes.id))
  .innerJoin(users, eq(employes.userId, users.id))
  .orderBy(asc(orgGlobalRoles.roleType));

  return results.map(r => ({
    ...r.role,
    employeNom: r.employeNom,
    employePrenom: r.employePrenom || '',
    photoProfile: r.photoProfile,
  }));
}

export async function getGlobalRolesHistory(): Promise<(OrgGlobalRole & { employeNom: string; employePrenom: string })[]> {
  const results = await db.select({
    role: orgGlobalRoles,
    employeNom: users.nom,
    employePrenom: users.prenom,
  })
  .from(orgGlobalRoles)
  .innerJoin(employes, eq(orgGlobalRoles.employeId, employes.id))
  .innerJoin(users, eq(employes.userId, users.id))
  .orderBy(desc(orgGlobalRoles.createdAt));

  return results.map(r => ({
    ...r.role,
    employeNom: r.employeNom,
    employePrenom: r.employePrenom || '',
  }));
}

export async function createGlobalRole(data: InsertOrgGlobalRole): Promise<OrgGlobalRole> {
  const [role] = await db.insert(orgGlobalRoles).values(data).returning();
  return role;
}

export async function updateGlobalRole(id: string, data: Partial<InsertOrgGlobalRole>): Promise<OrgGlobalRole | null> {
  const [updated] = await db.update(orgGlobalRoles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(orgGlobalRoles.id, id))
    .returning();
  return updated || null;
}

export async function revokeGlobalRole(id: string): Promise<OrgGlobalRole | null> {
  const [revoked] = await db.update(orgGlobalRoles)
    .set({ statut: 'REVOKED', dateFin: new Date().toISOString().split('T')[0], updatedAt: new Date() })
    .where(eq(orgGlobalRoles.id, id))
    .returning();
  return revoked || null;
}
