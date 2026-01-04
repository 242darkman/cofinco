import { employes, users, agences } from "@shared/schema";
import { type Employe, type InsertEmploye, type User, type EmployeWithUser } from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, isNull } from "drizzle-orm";

/**
 * Récupérer un employé par son ID
 */
export async function getEmploye(id: string): Promise<Employe | undefined> {
  const [employe] = await db.select().from(employes).where(eq(employes.id, id));
  return employe || undefined;
}

/**
 * Récupérer un employé par son userId (lien vers users)
 */
export async function getEmployeByUserId(userId: string): Promise<Employe | undefined> {
  const [employe] = await db.select().from(employes).where(eq(employes.userId, userId));
  return employe || undefined;
}

/**
 * Récupérer un employé avec ses données utilisateur
 */
export async function getEmployeWithUser(id: string): Promise<EmployeWithUser | undefined> {
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
      photoProfile: users.photoProfile,
      statut: users.statut,
    }
  })
  .from(employes)
  .innerJoin(users, eq(employes.userId, users.id))
  .where(eq(employes.id, id));

  if (result.length === 0) return undefined;

  return {
    ...result[0].employe,
    user: result[0].user
  };
}

/**
 * Récupérer tous les employés avec leurs données utilisateur
 */
export async function getAllEmployesWithUsers(): Promise<EmployeWithUser[]> {
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
      photoProfile: users.photoProfile,
      statut: users.statut,
    }
  })
  .from(employes)
  .innerJoin(users, eq(employes.userId, users.id))
  .where(isNull(users.deletedAt))
  .orderBy(desc(users.createdAt));

  return result.map(r => ({
    ...r.employe,
    user: r.user
  }));
}

/**
 * Récupérer les employés d'une agence
 */
export async function getEmployesByAgence(agenceId: string): Promise<EmployeWithUser[]> {
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
      photoProfile: users.photoProfile,
      statut: users.statut,
    }
  })
  .from(employes)
  .innerJoin(users, eq(employes.userId, users.id))
  .where(and(
    eq(employes.agenceId, agenceId),
    isNull(users.deletedAt)
  ))
  .orderBy(desc(users.createdAt));

  return result.map(r => ({
    ...r.employe,
    user: r.user
  }));
}

/**
 * Créer un nouvel employé (avec son user associé)
 * Cette fonction crée d'abord un user puis l'employe lié
 */
export async function createEmployeWithUser(
  userData: {
    nom: string;
    prenom?: string;
    email?: string;
    telephone?: string;
    sexe?: 'M' | 'F';
    username?: string;
    password?: string;
  },
  employeData: Omit<InsertEmploye, 'userId'>
): Promise<{ user: User; employe: Employe }> {
  return await db.transaction(async (tx) => {
    // Créer l'utilisateur
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
      statut: 'Actif',
      role: employeData.roleSystem || 'agent', // LEGACY: pour compatibilité
    }).returning();

    // Créer l'employé lié
    const [employe] = await tx.insert(employes).values({
      ...employeData,
      userId: user.id,
    }).returning();

    return { user, employe };
  });
}

/**
 * Créer un employé pour un user existant
 */
export async function createEmployeForUser(userId: string, employeData: Omit<InsertEmploye, 'userId'>): Promise<Employe> {
  const [employe] = await db.insert(employes).values({
    ...employeData,
    userId,
  }).returning();
  return employe;
}

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
 * Mettre à jour un employé et son user associé
 */
export async function updateEmployeWithUser(
  employeId: string,
  userData?: Partial<{
    nom: string;
    prenom: string;
    email: string;
    telephone: string;
    sexe: string;
    photoProfile: string;
    statut: string;
  }>,
  employeData?: Partial<InsertEmploye>
): Promise<EmployeWithUser | undefined> {
  return await db.transaction(async (tx) => {
    // Récupérer l'employé pour avoir le userId
    const [currentEmploye] = await tx.select().from(employes).where(eq(employes.id, employeId));
    if (!currentEmploye) return undefined;

    // Mettre à jour le user si des données sont fournies
    if (userData && Object.keys(userData).length > 0) {
      await tx.update(users)
        .set({ ...userData, updatedAt: new Date() })
        .where(eq(users.id, currentEmploye.userId));
    }

    // Mettre à jour l'employe si des données sont fournies
    if (employeData && Object.keys(employeData).length > 0) {
      await tx.update(employes)
        .set({ ...employeData, updatedAt: new Date() })
        .where(eq(employes.id, employeId));
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
    };
  });
}

/**
 * Supprimer un employé (soft delete du user associé)
 */
export async function deleteEmploye(id: string): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const [employe] = await tx.select().from(employes).where(eq(employes.id, id));
    if (!employe) return false;

    // Soft delete du user (met deletedAt)
    await tx.update(users)
      .set({ deletedAt: new Date(), statut: 'Inactif' })
      .where(eq(users.id, employe.userId));

    return true;
  });
}

/**
 * Récupérer tous les employés (simple, sans user)
 */
export async function getAllEmployes(): Promise<Employe[]> {
  return db.select().from(employes).orderBy(desc(employes.createdAt));
}

/**
 * Créer un employé (simple, pour compatibilité)
 */
export async function createEmploye(employeData: InsertEmploye): Promise<Employe> {
  const [employe] = await db.insert(employes).values(employeData).returning();
  return employe;
}
