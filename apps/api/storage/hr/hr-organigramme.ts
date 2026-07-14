import { StatutUser } from "@shared/enum/status-constants";
import {
  departments,
  employeeAgencyAssignments,
  employes,
  jobPositions,
  orgGlobalRoles,
  users,
} from "@shared/schema";
import { and, eq, inArray, or } from "drizzle-orm";
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
