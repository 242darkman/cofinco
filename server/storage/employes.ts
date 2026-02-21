/**
 * ============================================
 * Storage: Employés - Architecture V3
 * ============================================
 *
 * Gestion des employés avec architecture multi-rôles propre.
 * Source de vérité unique: userRoles (plus de roleSystem)
 *
 * Transactions:
 * - createEmployeWithUser: users + employes + userRoles
 * - updateEmployeWithUser: users + employes + userRoles
 * - deleteEmploye: soft delete user + suppression rôles
 */

import { employes, users, userRoles, jobPositions, departments, agences, agentsTerrain, userAgences, sessionsCaisse, hrAuditLog, pays } from "@shared/schema";
import { type Employe, type InsertEmploye, type User, type EmployeWithUser } from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { StatutUser } from "@shared/enum/status-constants";
import { db } from "../db";
import { eq, desc, and, isNull, asc, sql, aliasedTable } from "drizzle-orm";
import { StorageService } from "../services/storage-service";
import crypto from "crypto";
import { createLogger } from "../lib/logger";

const logger = createLogger('Employes');

/**
 * Génère un matricule unique pour un employé
 * Format: EMP-{CODE_AGENCE}-{ANNÉE}-{HEX}
 * Exemple: EMP-BZV-2026-A7F2
 */
export async function generateMatricule(agenceId: string | null | undefined): Promise<string> {
  let agenceCode = "XXX"; // Valeur par défaut si pas d'agence

  if (agenceId) {
    const [agence] = await db.select({ codeAgence: agences.codeAgence, nom: agences.nom })
      .from(agences)
      .where(eq(agences.id, agenceId));

    if (agence) {
      // Utiliser le code de l'agence, ou les 3 premières lettres du nom
      agenceCode = (agence.codeAgence || agence.nom || "XXX")
        .replace(/[^A-Za-z]/g, "")
        .substring(0, 3)
        .toUpperCase()
        .padEnd(3, "X");
    }
  }

  const year = new Date().getFullYear();
  const randomHex = crypto.randomBytes(2).toString("hex").toUpperCase();

  return `EMP-${agenceCode}-${year}-${randomHex}`;
}

// ============================================
// Types pour l'architecture V3
// ============================================

export interface CreateEmployeData {
  // Données utilisateur
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  sexe?: 'M' | 'F';
  username?: string;
  password?: string;
}

export interface CreateEmployeRHData {
  // Données RH (sans userId ni roleSystem)
  matricule?: string;
  jobPositionId?: string; // UUID
  dateEmbauche?: string;
  typeContrat?: string;
  agenceId?: string;
  managerId?: string;
  salaireBase?: number;
  tauxHoraire?: number;
  tauxJournalier?: number;
  modeCalculPaie?: string;
  caissePin?: string;
  statut?: string;
}

export interface EmployeWithRoles extends EmployeWithUser {
  roles: Array<{
    role: SystemRole;
    agenceId: string | null;
    isPrimary: boolean;
  }>;
}

// ============================================
// Fonctions de lecture
// ============================================

/**
 * Récupérer un employé par son ID
 */
export async function getEmploye(id: string): Promise<Employe | undefined> {
  const [employe] = await db.select().from(employes).where(eq(employes.id, id));
  return employe || undefined;
}

/**
 * Récupérer un employé par son userId
 */
export async function getEmployeByUserId(userId: string): Promise<Employe | undefined> {
  const [employe] = await db.select().from(employes).where(eq(employes.userId, userId));
  return employe || undefined;
}

/**
 * Récupérer un employé avec ses données utilisateur, poste et département
 */
export async function getEmployeWithUser(id: string): Promise<EmployeWithUser | undefined> {
  const paysNationalite = aliasedTable(pays, "pays_nationalite");
  const paysNaissance = aliasedTable(pays, "pays_naissance");

  const result = await db.select({
    employe: employes,
    user: {
      id: users.id,
      username: users.username,
      nom: users.nom,
      prenom: users.prenom,
      email: users.email,
      telephone: users.telephone,
      sexe: users.sexe,
      dateNaissance: users.dateNaissance,
      adresse: users.adresse,
      ville: users.ville,
      photoProfile: users.photoProfile,
      statut: users.statut,
      lieuNaissance: users.lieuNaissance,
      lieuNaissanceLocalityId: users.lieuNaissanceLocalityId,
      lieuNaissanceLocalityType: users.lieuNaissanceLocalityType,
      nationaliteId: users.nationaliteId,
      paysNaissanceId: users.paysNaissanceId,
      typeCompte: users.typeCompte,
    },
    nationaliteNom: paysNationalite.nomFr,
    paysNaissanceNom: paysNaissance.nomFr,
    jobPosition: {
      id: jobPositions.id,
      departmentId: jobPositions.departmentId,
      code: jobPositions.code,
      name: jobPositions.name,
      description: jobPositions.description,
      isActive: jobPositions.isActive,
      createdAt: jobPositions.createdAt,
      updatedAt: jobPositions.updatedAt,
    },
    department: {
      id: departments.id,
      code: departments.code,
      name: departments.name,
      description: departments.description,
      isActive: departments.isActive,
      createdAt: departments.createdAt,
      updatedAt: departments.updatedAt,
    },
    agence: {
      id: agences.id,
      nom: agences.nom,
      typeAgence: agences.typeAgence,
      codeAgence: agences.codeAgence,
    },
  })
  .from(employes)
  .innerJoin(users, eq(employes.userId, users.id))
  .leftJoin(paysNationalite, eq(users.nationaliteId, paysNationalite.id))
  .leftJoin(paysNaissance, eq(users.paysNaissanceId, paysNaissance.id))
  .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
  .leftJoin(departments, eq(jobPositions.departmentId, departments.id))
  .leftJoin(agences, eq(employes.agenceId, agences.id))
  .where(eq(employes.id, id));

  if (result.length === 0) return undefined;

  return {
    ...result[0].employe,
    user: result[0].user,
    nationaliteNom: result[0].nationaliteNom,
    paysNaissanceNom: result[0].paysNaissanceNom,
    jobPosition: result[0].jobPosition?.id ? result[0].jobPosition : null,
    department: result[0].department?.id ? result[0].department : null,
    agence: result[0].agence?.id ? result[0].agence : null,
  };
}

/**
 * Récupérer un employé avec ses rôles (Architecture V3)
 */
export async function getEmployeWithRoles(id: string): Promise<EmployeWithRoles | undefined> {
  const employe = await getEmployeWithUser(id);
  if (!employe) return undefined;

  const roles = await db.select({
    role: userRoles.role,
    agenceId: userRoles.agenceId,
    isPrimary: userRoles.isPrimary,
  })
  .from(userRoles)
  .where(eq(userRoles.userId, employe.userId))
  .orderBy(desc(userRoles.isPrimary), asc(userRoles.createdAt));

  return {
    ...employe,
    roles: roles.map(r => ({
      role: r.role as SystemRole,
      agenceId: r.agenceId,
      isPrimary: r.isPrimary,
    })),
  };
}

/**
 * Récupérer tous les employés avec leurs données utilisateur, rôle principal, poste et département
 * @param roleFilter - Filtre optionnel par rôle (ex: 'AGENT_TERRAIN')
 */
export async function getAllEmployesWithUsers(roleFilter?: string): Promise<EmployeWithUser[]> {
  const paysNationalite = aliasedTable(pays, "pays_nat_all");
  const paysNaissance = aliasedTable(pays, "pays_nais_all");

  // Build where conditions
  const conditions = [isNull(users.deletedAt)];
  if (roleFilter && Object.values(SystemRole).includes(roleFilter as SystemRole)) {
    conditions.push(eq(userRoles.role, roleFilter as SystemRole));
  }

  const result = await db.select({
    employe: employes,
    user: {
      id: users.id,
      username: users.username,
      nom: users.nom,
      prenom: users.prenom,
      email: users.email,
      telephone: users.telephone,
      sexe: users.sexe,
      dateNaissance: users.dateNaissance,
      adresse: users.adresse,
      ville: users.ville,
      lieuNaissance: users.lieuNaissance,
      lieuNaissanceLocalityId: users.lieuNaissanceLocalityId,
      lieuNaissanceLocalityType: users.lieuNaissanceLocalityType,
      nationaliteId: users.nationaliteId,
      paysNaissanceId: users.paysNaissanceId,
      photoProfile: users.photoProfile,
      statut: users.statut,
      typeCompte: users.typeCompte,
    },
    nationaliteNom: paysNationalite.nomFr,
    paysNaissanceNom: paysNaissance.nomFr,
    role: userRoles.role,
    jobPosition: {
      id: jobPositions.id,
      departmentId: jobPositions.departmentId,
      code: jobPositions.code,
      name: jobPositions.name,
      description: jobPositions.description,
      isActive: jobPositions.isActive,
      createdAt: jobPositions.createdAt,
      updatedAt: jobPositions.updatedAt,
    },
    department: {
      id: departments.id,
      code: departments.code,
      name: departments.name,
      description: departments.description,
      isActive: departments.isActive,
      createdAt: departments.createdAt,
      updatedAt: departments.updatedAt,
    },
    agence: {
      id: agences.id,
      nom: agences.nom,
      typeAgence: agences.typeAgence,
      codeAgence: agences.codeAgence,
    },
  })
  .from(employes)
  .innerJoin(users, eq(employes.userId, users.id))
  .leftJoin(paysNationalite, eq(users.nationaliteId, paysNationalite.id))
  .leftJoin(paysNaissance, eq(users.paysNaissanceId, paysNaissance.id))
  .leftJoin(userRoles, eq(users.id, userRoles.userId))
  .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
  .leftJoin(departments, eq(jobPositions.departmentId, departments.id))
  .leftJoin(agences, eq(employes.agenceId, agences.id))
  .where(and(...conditions))
  .orderBy(desc(users.createdAt));

  return result.map(r => ({
    ...r.employe,
    user: {
      ...r.user,
      role: r.role || null,
    },
    nationaliteNom: r.nationaliteNom,
    paysNaissanceNom: r.paysNaissanceNom,
    jobPosition: r.jobPosition?.id ? r.jobPosition : null,
    department: r.department?.id ? r.department : null,
    agence: r.agence?.id ? r.agence : null,
  }));
}

/**
 * Récupérer les employés d'une agence avec rôle principal, poste et département
 * @param agenceId - ID de l'agence
 * @param roleFilter - Filtre optionnel par rôle (ex: 'AGENT_TERRAIN')
 */
export async function getEmployesByAgence(agenceId: string, roleFilter?: string): Promise<EmployeWithUser[]> {
  const paysNationalite = aliasedTable(pays, "pays_nat_ag");
  const paysNaissance = aliasedTable(pays, "pays_nais_ag");

  // Build where conditions
  const conditions = [
    eq(employes.agenceId, agenceId),
    isNull(users.deletedAt)
  ];
  if (roleFilter && Object.values(SystemRole).includes(roleFilter as SystemRole)) {
    conditions.push(eq(userRoles.role, roleFilter as SystemRole));
  }

  const result = await db.select({
    employe: employes,
    user: {
      id: users.id,
      username: users.username,
      nom: users.nom,
      prenom: users.prenom,
      email: users.email,
      telephone: users.telephone,
      sexe: users.sexe,
      dateNaissance: users.dateNaissance,
      adresse: users.adresse,
      ville: users.ville,
      lieuNaissance: users.lieuNaissance,
      lieuNaissanceLocalityId: users.lieuNaissanceLocalityId,
      lieuNaissanceLocalityType: users.lieuNaissanceLocalityType,
      nationaliteId: users.nationaliteId,
      paysNaissanceId: users.paysNaissanceId,
      photoProfile: users.photoProfile,
      statut: users.statut,
      typeCompte: users.typeCompte,
    },
    nationaliteNom: paysNationalite.nomFr,
    paysNaissanceNom: paysNaissance.nomFr,
    role: userRoles.role,
    jobPosition: {
      id: jobPositions.id,
      departmentId: jobPositions.departmentId,
      code: jobPositions.code,
      name: jobPositions.name,
      description: jobPositions.description,
      isActive: jobPositions.isActive,
      createdAt: jobPositions.createdAt,
      updatedAt: jobPositions.updatedAt,
    },
    department: {
      id: departments.id,
      code: departments.code,
      name: departments.name,
      description: departments.description,
      isActive: departments.isActive,
      createdAt: departments.createdAt,
      updatedAt: departments.updatedAt,
    },
    agence: {
      id: agences.id,
      nom: agences.nom,
      typeAgence: agences.typeAgence,
      codeAgence: agences.codeAgence,
    },
  })
  .from(employes)
  .innerJoin(users, eq(employes.userId, users.id))
  .leftJoin(paysNationalite, eq(users.nationaliteId, paysNationalite.id))
  .leftJoin(paysNaissance, eq(users.paysNaissanceId, paysNaissance.id))
  .leftJoin(userRoles, eq(users.id, userRoles.userId))
  .leftJoin(jobPositions, eq(employes.jobPositionId, jobPositions.id))
  .leftJoin(departments, eq(jobPositions.departmentId, departments.id))
  .leftJoin(agences, eq(employes.agenceId, agences.id))
  .where(and(...conditions))
  .orderBy(desc(users.createdAt));

  return result.map(r => ({
    ...r.employe,
    user: {
      ...r.user,
      role: r.role || null,
    },
    nationaliteNom: r.nationaliteNom,
    paysNaissanceNom: r.paysNaissanceNom,
    jobPosition: r.jobPosition?.id ? r.jobPosition : null,
    department: r.department?.id ? r.department : null,
    agence: r.agence?.id ? r.agence : null,
  }));
}

/**
 * Récupérer tous les employés (simple)
 */
export async function getAllEmployes(): Promise<Employe[]> {
  return db.select().from(employes).orderBy(desc(employes.createdAt));
}

// ============================================
// Fonctions de création (Transactions)
// ============================================

/**
 * Créer un nouvel employé avec user et rôle (Architecture V3)
 *
 * Transaction atomique:
 * 1. Créer le user (identité + auth)
 * 2. Créer l'employé (données RH)
 * 3. Créer le rôle dans userRoles
 *
 * @param userData - Données d'identité et authentification
 * @param employeData - Données RH
 * @param role - Rôle à attribuer (défaut: AGENT_TERRAIN)
 */
export async function createEmployeWithUser(
  userData: CreateEmployeData,
  employeData: CreateEmployeRHData,
  role: SystemRole = SystemRole.AGENT_TERRAIN
): Promise<{ user: User; employe: Employe }> {
  // Générer le matricule automatiquement s'il n'est pas fourni
  const matricule = employeData.matricule || await generateMatricule(employeData.agenceId);

  return await db.transaction(async (tx) => {
    // 1. Créer l'utilisateur
    const [user] = await tx.insert(users).values({
      nom: userData.nom,
      prenom: userData.prenom,
      email: userData.email,
      telephone: userData.telephone,
      sexe: userData.sexe,
      username: userData.username,
      password: userData.password,
      typeCompte: 'employe',
      canLogin: !!userData.username,
      statut: StatutUser.ACTIVE,
    }).returning();

    // 2. Créer l'employé
    const [employe] = await tx.insert(employes).values({
      userId: user.id,
      matricule,
      jobPositionId: employeData.jobPositionId,
      dateEmbauche: employeData.dateEmbauche,
      typeContrat: employeData.typeContrat,
      agenceId: employeData.agenceId,
      managerId: employeData.managerId,
      salaireBase: employeData.salaireBase,
      tauxHoraire: employeData.tauxHoraire,
      tauxJournalier: employeData.tauxJournalier,
      modeCalculPaie: employeData.modeCalculPaie,
      caissePin: employeData.caissePin,
      statut: employeData.statut || StatutUser.ACTIVE,
    }).returning();

    // 3. Créer le rôle dans userRoles
    await tx.insert(userRoles).values({
      userId: user.id,
      role: role,
      agenceId: employeData.agenceId,
      isPrimary: true,
    });

    return { user, employe };
  });
}

/**
 * Créer un employé pour un user existant
 */
export async function createEmployeForUser(
  userId: string,
  employeData: CreateEmployeRHData,
  role: SystemRole = SystemRole.AGENT_TERRAIN
): Promise<Employe> {
  // Générer le matricule automatiquement s'il n'est pas fourni
  const matricule = employeData.matricule || await generateMatricule(employeData.agenceId);

  return await db.transaction(async (tx) => {
    // Créer l'employé
    const [employe] = await tx.insert(employes).values({
      userId,
      matricule,
      jobPositionId: employeData.jobPositionId,
      dateEmbauche: employeData.dateEmbauche,
      typeContrat: employeData.typeContrat,
      agenceId: employeData.agenceId,
      managerId: employeData.managerId,
      salaireBase: employeData.salaireBase,
      tauxHoraire: employeData.tauxHoraire,
      tauxJournalier: employeData.tauxJournalier,
      modeCalculPaie: employeData.modeCalculPaie,
      caissePin: employeData.caissePin,
      statut: employeData.statut || StatutUser.ACTIVE,
    }).returning();

    // Créer le rôle s'il n'existe pas déjà
    const [existingRole] = await tx.select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

    if (!existingRole) {
      await tx.insert(userRoles).values({
        userId,
        role: role,
        agenceId: employeData.agenceId,
        isPrimary: true,
      });
    }

    // Si le rôle est AGENT_TERRAIN, créer l'entrée agents_terrain synchrone
    if (role === SystemRole.AGENT_TERRAIN) {
      await tx.insert(agentsTerrain).values({
        employeId: employe.id,
        zoneAffectation: null,
        objectifMensuel: '100000',
        statut: StatutUser.ACTIVE,
      });
    }

    return employe;
  });
}

/**
 * Créer un employé simple (pour compatibilité)
 */
export async function createEmploye(employeData: InsertEmploye): Promise<Employe> {
  const [employe] = await db.insert(employes).values(employeData).returning();
  return employe;
}

// ============================================
// Fonctions de mise à jour
// ============================================

/**
 * Mettre à jour un employé
 */
export async function updateEmploye(id: string, data: Partial<InsertEmploye>): Promise<Employe | undefined> {
  const [employe] = await db.update(employes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(employes.id, id))
    .returning();
  return employe || undefined;
}

/**
 * Mettre à jour un employé, son user et son rôle (Architecture V3)
 *
 * @param employeId - ID de l'employé
 * @param userData - Données user à mettre à jour
 * @param employeData - Données RH à mettre à jour
 * @param newRole - Nouveau rôle (optionnel)
 */
export async function updateEmployeWithUser(
  employeId: string,
  userData?: Partial<{
    nom: string;
    prenom: string;
    email: string;
    telephone: string;
    sexe: string;
    dateNaissance: string;
    adresse: string;
    ville: string;
    photoProfile: string;
    statut: string;
  }>,
  employeData?: Partial<CreateEmployeRHData>,
  newRole?: SystemRole
): Promise<EmployeWithUser | undefined> {
  return await db.transaction(async (tx) => {
    // Récupérer l'employé pour avoir le userId
    const [currentEmploye] = await tx.select().from(employes).where(eq(employes.id, employeId));
    if (!currentEmploye) return undefined;

    // 1. Mettre à jour le user si des données sont fournies
    if (userData && Object.keys(userData).length > 0) {
      await tx.update(users)
        .set({ ...userData, updatedAt: new Date() } as any)
        .where(eq(users.id, currentEmploye.userId));
    }

    // 2. Mettre à jour l'employe si des données sont fournies
    if (employeData && Object.keys(employeData).length > 0) {
      await tx.update(employes)
        .set({ ...employeData, updatedAt: new Date() })
        .where(eq(employes.id, employeId));
    }

    // 3. Mettre à jour le rôle si demandé
    if (newRole) {
      const [existingRole] = await tx.select()
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, currentEmploye.userId),
          eq(userRoles.isPrimary, true)
        ));

      if (existingRole) {
        await tx.update(userRoles)
          .set({ role: newRole, updatedAt: new Date() })
          .where(eq(userRoles.id, existingRole.id));
      } else {
        await tx.insert(userRoles).values({
          userId: currentEmploye.userId,
          role: newRole,
          agenceId: employeData?.agenceId || currentEmploye.agenceId,
          isPrimary: true,
        });
      }

      // Si le nouveau rôle est AGENT_TERRAIN, créer l'entrée agents_terrain si elle n'existe pas
      if (newRole === SystemRole.AGENT_TERRAIN) {
        const [existingAgentTerrain] = await tx.select()
          .from(agentsTerrain)
          .where(eq(agentsTerrain.employeId, employeId));

        if (!existingAgentTerrain) {
          await tx.insert(agentsTerrain).values({
            employeId: employeId,
            zoneAffectation: null,
            objectifMensuel: '100000',
            statut: StatutUser.ACTIVE,
          });
        }
      }
    }

    // Retourner les données mises à jour
    const result = await tx.select({
      employe: employes,
      user: {
        id: users.id,
        username: users.username,
        nom: users.nom,
        prenom: users.prenom,
        email: users.email,
        telephone: users.telephone,
        sexe: users.sexe,
        dateNaissance: users.dateNaissance,
        adresse: users.adresse,
        ville: users.ville,
        photoProfile: users.photoProfile,
        statut: users.statut,
      }
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(eq(employes.id, employeId));

    if (result.length === 0) return undefined;

    return {
      ...result[0].employe,
      user: result[0].user
    } as any;
  });
}

// ============================================
// Transfert inter-agences
// ============================================

export interface TransferResult {
  employee: EmployeWithUser;
  fromAgenceId: string | null;
  toAgenceId: string;
  snapshot: Record<string, any>;
}

/**
 * Transfère un employé vers une autre agence (transaction atomique)
 *
 * Actions:
 * 1. Met à jour employes.agenceId (+ champs optionnels)
 * 2. Désactive l'ancienne affectation userAgences (isPrimary)
 * 3. Crée la nouvelle affectation userAgences
 * 4. Met à jour userRoles.agenceId pour le rôle principal
 * 5. Enregistre dans hrAuditLog
 */
export async function transferEmployeToAgence(
  employeId: string,
  targetAgenceId: string,
  actorUserId: string,
  actorName: string,
  options?: {
    managerId?: string | null;
    jobPositionId?: string | null;
    salaireBase?: string;
    reason?: string;
    effectiveDate?: string;
  }
): Promise<TransferResult | undefined> {
  return await db.transaction(async (tx) => {
    // 1. Récupérer l'employé avec ses données actuelles
    const [currentEmploye] = await tx.select().from(employes).where(eq(employes.id, employeId));
    if (!currentEmploye) return undefined;

    const fromAgenceId = currentEmploye.agenceId;

    // 2. Vérifier pas de session caisse ouverte
    const [openSession] = await tx.select({ id: sessionsCaisse.id })
      .from(sessionsCaisse)
      .where(and(
        eq(sessionsCaisse.caissierId, currentEmploye.userId),
        sql`${sessionsCaisse.statut} NOT IN ('CLOSED', 'FORCE_CLOSED')`
      ))
      .limit(1);

    if (openSession) {
      throw new Error('OPEN_SESSION');
    }

    // 3. Snapshot des valeurs avant transfert
    const snapshot: Record<string, any> = {
      agenceId: fromAgenceId,
      managerId: currentEmploye.managerId,
      jobPositionId: currentEmploye.jobPositionId,
      salaireBase: currentEmploye.salaireBase,
    };

    // 4. Préparer les champs à mettre à jour
    const employeUpdates: Record<string, any> = {
      agenceId: targetAgenceId,
      updatedAt: new Date(),
    };
    if (options?.managerId !== undefined) employeUpdates.managerId = options.managerId;
    if (options?.jobPositionId !== undefined) employeUpdates.jobPositionId = options.jobPositionId;
    if (options?.salaireBase !== undefined) employeUpdates.salaireBase = options.salaireBase;

    // 5. Mettre à jour l'employé
    await tx.update(employes)
      .set(employeUpdates)
      .where(eq(employes.id, employeId));

    // 6. Désactiver l'ancienne affectation principale dans userAgences
    await tx.update(userAgences)
      .set({ actif: false, dateFin: options?.effectiveDate || new Date().toISOString().slice(0, 10), updatedAt: new Date() })
      .where(and(
        eq(userAgences.userId, currentEmploye.userId),
        eq(userAgences.isPrimary, true),
        eq(userAgences.actif, true)
      ));

    // 7. Créer la nouvelle affectation principale
    await tx.insert(userAgences).values({
      userId: currentEmploye.userId,
      agenceId: targetAgenceId,
      isPrimary: true,
      dateAffectation: options?.effectiveDate || new Date().toISOString().slice(0, 10),
      actif: true,
    });

    // 8. Mettre à jour le rôle principal pour la nouvelle agence
    await tx.update(userRoles)
      .set({ agenceId: targetAgenceId, updatedAt: new Date() })
      .where(and(
        eq(userRoles.userId, currentEmploye.userId),
        eq(userRoles.isPrimary, true)
      ));

    // 9. Enregistrer dans hrAuditLog
    const newValues: Record<string, any> = { agenceId: targetAgenceId };
    if (options?.managerId !== undefined) newValues.managerId = options.managerId;
    if (options?.jobPositionId !== undefined) newValues.jobPositionId = options.jobPositionId;
    if (options?.salaireBase !== undefined) newValues.salaireBase = options.salaireBase;

    await tx.insert(hrAuditLog).values({
      entityType: 'employe',
      entityId: employeId,
      action: 'transferred',
      actorUserId,
      actorName,
      oldValues: snapshot,
      newValues,
      diff: Object.fromEntries(
        Object.entries(newValues).map(([k, v]) => [k, { old: snapshot[k] ?? null, new: v }])
      ),
      reason: options?.reason || null,
      severity: 'critical',
      agenceId: targetAgenceId,
    });

    // 10. Retourner les données mises à jour
    const result = await tx.select({
      employe: employes,
      user: {
        id: users.id,
        username: users.username,
        nom: users.nom,
        prenom: users.prenom,
        email: users.email,
        telephone: users.telephone,
        sexe: users.sexe,
        dateNaissance: users.dateNaissance,
        adresse: users.adresse,
        ville: users.ville,
        photoProfile: users.photoProfile,
        statut: users.statut,
      }
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(eq(employes.id, employeId));

    if (result.length === 0) return undefined;

    return {
      employee: { ...result[0].employe, user: result[0].user } as any,
      fromAgenceId,
      toAgenceId: targetAgenceId,
      snapshot,
    };
  });
}

// ============================================
// Gestion des rôles (Architecture V3)
// ============================================

/**
 * Obtenir tous les rôles d'un utilisateur
 */
export async function getUserRolesByUserId(userId: string): Promise<Array<{
  id: string;
  role: SystemRole;
  agenceId: string | null;
  isPrimary: boolean;
}>> {
  const roles = await db.select({
    id: userRoles.id,
    role: userRoles.role,
    agenceId: userRoles.agenceId,
    isPrimary: userRoles.isPrimary,
  })
  .from(userRoles)
  .where(eq(userRoles.userId, userId))
  .orderBy(desc(userRoles.isPrimary), asc(userRoles.createdAt));

  return roles.map(r => ({
    id: r.id,
    role: r.role as SystemRole,
    agenceId: r.agenceId,
    isPrimary: r.isPrimary,
  }));
}

/**
 * Ajouter un rôle à un utilisateur
 */
export async function addUserRole(
  userId: string,
  role: SystemRole,
  agenceId?: string,
  isPrimary: boolean = false
): Promise<void> {
  await db.insert(userRoles).values({
    userId,
    role,
    agenceId: agenceId || null,
    isPrimary,
  });
}

/**
 * Supprimer un rôle d'un utilisateur
 */
export async function removeUserRole(roleId: string): Promise<void> {
  await db.delete(userRoles).where(eq(userRoles.id, roleId));
}

/**
 * Définir le rôle principal d'un utilisateur
 */
export async function setUserPrimaryRole(userId: string, roleId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Désactiver tous les rôles principaux
    await tx.update(userRoles)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.isPrimary, true)
      ));

    // Activer le nouveau rôle principal
    await tx.update(userRoles)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(userRoles.id, roleId));
  });
}

// ============================================
// Fonctions de suppression
// ============================================

/**
 * Supprimer un employé (soft delete du user + suppression fichiers MinIO)
 */
export async function deleteEmploye(id: string): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const [employe] = await tx.select().from(employes).where(eq(employes.id, id));
    if (!employe) return false;

    // Supprimer les fichiers MinIO associés à l'employé (CASCADE)
    try {
      const { publicDeleted, privateDeleted } = await StorageService.deleteEntityFiles('employe', id);
      if (publicDeleted > 0 || privateDeleted > 0) {
        logger.info({ employeId: id, publicDeleted, privateDeleted }, 'Employe cascade MinIO deletion completed');
      }
    } catch (storageError) {
      // Log l'erreur mais continue la suppression
      logger.error({ err: storageError, employeId: id }, 'Error deleting MinIO files for employe');
    }

    // Soft delete du user
    await tx.update(users)
      .set({ deletedAt: new Date(), statut: StatutUser.INACTIVE })
      .where(eq(users.id, employe.userId));

    return true;
  });
}
