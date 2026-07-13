import { StatutCandidature, StatutConge, StatutUser } from "@shared/enum/status-constants";
import {
  agences,
  bulletinsPaie,
  candidatures,
  demandesConges,
  departments,
  employeeAgencyAssignments,
  employes,
  formationParticipants,
  formations,
  jobPositions,
  orgGlobalRoles,
  sanctions,
  users,
  type EmployeeAgencyAssignment, type InsertEmployeeAgencyAssignment,
  type InsertOrgGlobalRole,
  type OrgGlobalRole
} from "@shared/schema";
import { and, asc, desc, eq, gte, inArray, lte, not, or, sql } from "drizzle-orm";
import { db } from "../../db";

// Organigramme Hiérarchique
export interface OrgNode {
    id: string;
    nom: string;
    prenom: string;
    poste: string;
    departement: string;
    email?: string;
    photoProfile?: string;
    isGlobalRole?: boolean;
    globalRoleType?: string;
    subordinates: OrgNode[];
}

export async function getOrganigramme(agenceId?: string): Promise<OrgNode[]> {
    // 1. Load active PDG from org_global_roles
    const [activePdg] = await db.select({
        employeId: orgGlobalRoles.employeId,
        roleType: orgGlobalRoles.roleType,
        titre: orgGlobalRoles.titre,
    }).from(orgGlobalRoles)
      .where(and(eq(orgGlobalRoles.statut, 'ACTIVE'), eq(orgGlobalRoles.roleType, 'PDG')))
      .limit(1);

    // 2. Fetch employees - if agenceId provided, use assignments table
    let employeeFilter;
    if (agenceId) {
        // Use employee_agency_assignments for multi-agency support
        const assignedIds = db.select({ employeId: employeeAgencyAssignments.employeId })
            .from(employeeAgencyAssignments)
            .where(and(
                eq(employeeAgencyAssignments.agenceId, agenceId),
                eq(employeeAgencyAssignments.statut, 'ACTIVE')
            ));
        employeeFilter = and(
            eq(users.statut, StatutUser.ACTIVE),
            or(
                inArray(employes.id, assignedIds),
                eq(employes.agenceId, agenceId) // backward compat
            )
        );
    } else {
        employeeFilter = eq(users.statut, StatutUser.ACTIVE);
    }

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
    .where(employeeFilter);

    // 3. If PDG exists and is not in the employee list, fetch PDG data
    let pdgNode: OrgNode | null = null;
    if (activePdg) {
        const pdgInList = employeesData.find(e => e.employeId === activePdg.employeId);
        if (pdgInList) {
            pdgNode = {
                id: pdgInList.employeId,
                nom: pdgInList.nom,
                prenom: pdgInList.prenom || '',
                poste: activePdg.titre || 'Président Directeur Général',
                departement: 'Direction Générale',
                email: pdgInList.email || undefined,
                photoProfile: pdgInList.photoProfile || undefined,
                isGlobalRole: true,
                globalRoleType: activePdg.roleType,
                subordinates: []
            };
        } else {
            // PDG is not assigned to this agency - fetch separately
            const [pdgData] = await db.select({
                employeId: employes.id,
                nom: users.nom,
                prenom: users.prenom,
                email: users.email,
                photoProfile: users.photoProfile,
            }).from(employes)
              .innerJoin(users, eq(employes.userId, users.id))
              .where(eq(employes.id, activePdg.employeId))
              .limit(1);

            if (pdgData) {
                pdgNode = {
                    id: pdgData.employeId,
                    nom: pdgData.nom,
                    prenom: pdgData.prenom || '',
                    poste: activePdg.titre || 'Président Directeur Général',
                    departement: 'Direction Générale',
                    email: pdgData.email || undefined,
                    photoProfile: pdgData.photoProfile || undefined,
                    isGlobalRole: true,
                    globalRoleType: activePdg.roleType,
                    subordinates: []
                };
            }
        }
    }

    // 4. Build tree from employee data (excluding PDG from normal processing)
    const employeeMap = new Map<string, OrgNode>();
    const topLevel: OrgNode[] = [];

    // First pass: create all nodes
    for (const emp of employeesData) {
        if (pdgNode && emp.employeId === pdgNode.id) continue; // skip PDG
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
        employeeMap.set(emp.employeId, node);
    }

    // Second pass: build hierarchy
    for (const emp of employeesData) {
        if (pdgNode && emp.employeId === pdgNode.id) continue;
        const node = employeeMap.get(emp.employeId)!;

        // If manager is the PDG, attach to PDG node
        if (pdgNode && emp.managerId === pdgNode.id) {
            pdgNode.subordinates.push(node);
        } else if (!emp.managerId) {
            topLevel.push(node);
        } else {
            const manager = employeeMap.get(emp.managerId);
            if (manager) {
                manager.subordinates.push(node);
            } else {
                topLevel.push(node);
            }
        }
    }

    // 5. If PDG exists, make it the root with all top-level nodes as subordinates
    if (pdgNode) {
        pdgNode.subordinates.push(...topLevel);
        return [pdgNode];
    }

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
