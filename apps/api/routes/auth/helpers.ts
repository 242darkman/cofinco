import { db } from "../../db";
import { users, userRoles, employes, agences, userAgences } from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { eq, and, asc } from "drizzle-orm";
import { getClientByUserId } from "../../storage/clients";
import crypto from "crypto";

export type AppContext = 'client' | 'employee';

/**
 * Génère un mot de passe sécurisé respectant la politique de la plateforme :
 * - Min 12 car., au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 car. spécial (@$!%*?&)
 */
export function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@$!%*?&';
  const all = upper + lower + digits + special;

  // S'assurer d'avoir au moins un type requis
  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    special[crypto.randomInt(special.length)],
  ];

  // Remplir les 8 caractères restants
  const remaining: string[] = [];
  for (let i = 0; i < 8; i++) {
    remaining.push(all[crypto.randomInt(all.length)]);
  }

  // Mélanger
  const chars = [...required, ...remaining];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}



/**
 * Détermine les contextes disponibles pour un utilisateur (client, employee, ou les deux).
 * Un employé qui a aussi un dossier client peut basculer entre les deux modes dans l'app mobile.
 */
export async function resolveUserContexts(userId: string, role: string): Promise<{
  availableContexts: AppContext[];
  defaultContext: AppContext;
  hasClientRecord: boolean;
}> {
  const isEmployee = role !== SystemRole.CLIENT;
  let hasClientRecord = false;
  try {
    const client = await getClientByUserId(userId);
    hasClientRecord = !!client;
  } catch {
    // Pas de record client, ce n'est pas grave
  }

  const availableContexts: AppContext[] = [];
  if (isEmployee) availableContexts.push('employee');
  if (hasClientRecord || role === SystemRole.CLIENT) availableContexts.push('client');
  if (availableContexts.length === 0) availableContexts.push('client');

  const defaultContext: AppContext = isEmployee ? 'employee' : 'client';
  return { availableContexts, defaultContext, hasClientRecord };
}


/**
 * Récupérer le caissePin d'un utilisateur depuis la table employes.
 * Architecture V3: caissePin est stocké dans employes, pas users.
 */
export async function getUserCaissePin(userId: string): Promise<string | null> {
  const [employe] = await db.select({ caissePin: employes.caissePin })
    .from(employes)
    .where(eq(employes.userId, userId));
  return employe?.caissePin || null;
}


/**
 * Mettre à jour le caissePin d'un utilisateur dans la table employes.
 */
export async function setUserCaissePin(userId: string, hashedPin: string): Promise<void> {
  await db.update(employes)
    .set({ caissePin: hashedPin, updatedAt: new Date() })
    .where(eq(employes.userId, userId));
}


/**
 * Récupère le rôle effectif d'un utilisateur.
 *
 * Architecture V3 - Source unique: userRoles
 * 1. Rôle principal (isPrimary = true)
 * 2. Premier rôle disponible (par date de création)
 * 3. CLIENT (fallback par défaut)
 *
 * @param userId - ID de l'utilisateur
 * @param agenceId - (optionnel) Si fourni, cherche un rôle scopé à cette agence
 * @returns Le rôle effectif de l'utilisateur
 */
export async function getEffectiveRole(userId: string, agenceId?: string): Promise<SystemRole> {
  // 1. Chercher le rôle principal
  const [primaryRole] = await db.select({ role: userRoles.role })
    .from(userRoles)
    .where(
      agenceId
        ? and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true), eq(userRoles.agenceId, agenceId))
        : and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true))
    )
    .limit(1);

  if (primaryRole?.role) {
    return primaryRole.role as SystemRole;
  }

  // 2. Si pas de rôle principal, prendre le premier rôle disponible
  const [anyRole] = await db.select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .orderBy(asc(userRoles.createdAt))
    .limit(1);

  if (anyRole?.role) {
    return anyRole.role as SystemRole;
  }

  // 3. Fallback: CLIENT
  return SystemRole.CLIENT;
}


/**
 * Récupère tous les rôles d'un utilisateur (pour l'architecture multi-rôles)
 * @param userId - ID de l'utilisateur
 * @returns Liste des rôles avec leur scope agence
 */
export async function getUserRoles(userId: string): Promise<Array<{ role: SystemRole; agenceId: string | null; isPrimary: boolean }>> {
  const roles = await db.select({
    role: userRoles.role,
    agenceId: userRoles.agenceId,
    isPrimary: userRoles.isPrimary,
  })
  .from(userRoles)
  .where(eq(userRoles.userId, userId));

  return roles.map(r => ({
    role: r.role as SystemRole,
    agenceId: r.agenceId,
    isPrimary: r.isPrimary,
  }));
}


export const normalizeUserPayload = (payload: any) => {
  if (!payload || typeof payload !== "object") return payload;
  const data: any = { ...payload };

  if (typeof data.name === "string" && data.name.trim()) {
    const parts = data.name.trim().split(/\s+/).filter(Boolean);
    if (!data.prenom && parts.length > 0) {
      data.prenom = parts[0];
    }
    if (!data.nom && parts.length > 1) {
      data.nom = parts.slice(1).join(" ");
    }
    if (!data.nom && parts.length === 1) {
      data.nom = parts[0];
    }
  }

  if (typeof data.phone === "string" && !data.telephone) {
    data.telephone = data.phone;
  }

  if (typeof data.photo_profile === "string" && !data.photoProfile) {
    data.photoProfile = data.photo_profile;
  }

  delete data.name;
  delete data.phone;
  delete data.photo_profile;

  return data;
};


export async function resolvePrimaryAgence(userId: string): Promise<{ agenceId: string; agenceNom: string | null } | null> {
  const [primaryAgence] = await db
    .select({
      agenceId: userAgences.agenceId,
      agenceNom: agences.nom,
    })
    .from(userAgences)
    .leftJoin(agences, eq(userAgences.agenceId, agences.id))
    .where(and(
      eq(userAgences.userId, userId),
      eq(userAgences.isPrimary, true),
      eq(userAgences.actif, true)
    ))
    .limit(1);

  if (primaryAgence) {
    return primaryAgence;
  }

  const [anyAgence] = await db
    .select({
      agenceId: userAgences.agenceId,
      agenceNom: agences.nom,
    })
    .from(userAgences)
    .leftJoin(agences, eq(userAgences.agenceId, agences.id))
    .where(and(
      eq(userAgences.userId, userId),
      eq(userAgences.actif, true)
    ))
    .limit(1);

  return anyAgence || null;
}


