import {
  caisseAssignations,
  caisses,
  sessionsCaisse,
  users,
  type Caisse,
  type CaisseAssignation,
  type InsertCaisse
} from "@shared/schema";
import { and, count, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "../../../db";
import { computeSessionStatus } from "../../../services/caisse/session-status";
import { SESSION_TERMINAL_STATUSES } from "./caisse-sessions";

export async function getCaisse(id: string): Promise<Caisse | undefined> {
  const [caisse] = await db.select().from(caisses).where(eq(caisses.id, id));
  return caisse || undefined;
}

export async function getCaissesByAgence(agenceId: string): Promise<Caisse[]> {
  // Ne supporte que le filtrage par agenceId basé sur UUID
  return db.select().from(caisses).where(eq(caisses.agenceId, agenceId));
}

export async function getAllCaisses(): Promise<Caisse[]> {
  return db.select().from(caisses);
}

export async function getCaissesWithStatus(agenceId?: string): Promise<any[]> {
  let query = db.select({
    caisse: caisses,
    session: sessionsCaisse,
    caissier_nom: users.nom,
    caissier_prenom: users.prenom
  })
  .from(caisses)
  .leftJoin(sessionsCaisse, and(
    eq(caisses.id, sessionsCaisse.caisseId),
    notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
    isNull(sessionsCaisse.deletedAt)
  ))
  .leftJoin(users, eq(sessionsCaisse.caissierId, users.id));

  if (agenceId) {
    query = query.where(eq(caisses.agenceId, agenceId)) as any;
  }

  const results = await query;
  return results.map(r => ({
    ...r.caisse,
    activeSession: r.session ? {
      ...r.session,
      computedStatus: computeSessionStatus(r.session),
      caissierNom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim()
    } : null
  }));
}

export async function createCaisse(caisse: InsertCaisse): Promise<Caisse> {
  const [newCaisse] = await db.insert(caisses).values(caisse).returning();
  return newCaisse;
}

export async function updateCaisse(id: string, caisse: Partial<InsertCaisse>): Promise<Caisse | undefined> {
  const [updated] = await db.update(caisses).set(caisse).where(eq(caisses.id, id)).returning();
  return updated || undefined;
}

export async function deleteCaisse(id: string): Promise<boolean> {
  // 1. Vérifier si la caisse a un historique d'utilisation (sessions)
  const [usage] = await db.select({ count: count() }).from(sessionsCaisse).where(eq(sessionsCaisse.caisseId, id));
  
  if (usage && usage.count > 0) {
      return false; // Impossible de supprimer une caisse utilisée
  }

  // 2. Effacer les assignations
  await db.delete(caisseAssignations).where(eq(caisseAssignations.caisseId, id));

  // 3. Suppression logique de la caisse (préserver la piste d'audit)
  const result = await db.update(caisses).set({ deletedAt: new Date() }).where(eq(caisses.id, id)).returning();
  return result.length > 0;
}

export async function getCaisseAssignments(caisseId: string): Promise<CaisseAssignation[]> {
    return db.select().from(caisseAssignations).where(eq(caisseAssignations.caisseId, caisseId));
}

export async function getCaisseAssignmentsEnriched(caisseId: string) {
    return db.select({
      id: caisseAssignations.id,
      userId: caisseAssignations.userId,
      assignedAt: caisseAssignations.assignedAt,
      nom: users.nom,
      prenom: users.prenom,
      photoProfile: users.photoProfile,
    })
    .from(caisseAssignations)
    .innerJoin(users, eq(caisseAssignations.userId, users.id))
    .where(eq(caisseAssignations.caisseId, caisseId));
}

export async function getUserCaisseAssignments(userId: string): Promise<CaisseAssignation[]> {
    return db.select().from(caisseAssignations).where(eq(caisseAssignations.userId, userId));
}

/**
 * Récupérer les caisses assignées à l'utilisateur avec le solde disponible
 * Solde = montantReporte de la dernière session fermée OU caisse.solde
 */
export async function getUserAssignedCaissesWithBalance(userId: string): Promise<any[]> {
  // 1. Récupérer les assignations de l'utilisateur
  const assignments = await db.select().from(caisseAssignations).where(eq(caisseAssignations.userId, userId));

  if (assignments.length === 0) return [];

  // 2. Récupérer les détails de la caisse pour chaque assignation
  const caisseIds = assignments.map(a => a.caisseId);
  const caissesData = await db.select().from(caisses).where(inArray(caisses.id, caisseIds));

  // 3. Pour chaque caisse, récupérer la dernière session fermée pour déterminer le solde disponible
  const result = await Promise.all(caissesData.map(async (caisse) => {
    // Vérifier s'il y a une session active sur cette caisse
    const [activeSession] = await db.select()
      .from(sessionsCaisse)
      .where(and(
        eq(sessionsCaisse.caisseId, caisse.id),
        notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
        isNull(sessionsCaisse.deletedAt)
      ));

    // Récupérer la dernière session fermée pour les informations de solde
    const [lastClosedSession] = await db.select()
      .from(sessionsCaisse)
      .where(and(
        eq(sessionsCaisse.caisseId, caisse.id),
        sql`${sessionsCaisse.closedAt} IS NOT NULL`
      ))
      .orderBy(desc(sessionsCaisse.closedAt))
      .limit(1);

    // Calculer le solde disponible (en utilisant Number() pour une comparaison correcte)
    let availableBalance = 0;
    let balanceSource = 'none';

    if (lastClosedSession) {
      const montantReporte = Number(lastClosedSession.montantReporte || 0);
      const soldeCaisse = Number(caisse.solde || 0);
      const montantDeclare = Number(lastClosedSession.montantFermetureDeclare || 0);

      if (montantReporte > 0) {
        availableBalance = montantReporte;
        balanceSource = 'montantReporte';
      } else if (soldeCaisse > 0) {
        availableBalance = soldeCaisse;
        balanceSource = 'caisse.solde';
      } else if (montantDeclare > 0) {
        availableBalance = montantDeclare;
        balanceSource = 'montantDeclare';
      }
    } else {
      // Pas de session fermée, utiliser caisse.solde directement
      availableBalance = Number(caisse.solde || 0);
      balanceSource = 'caisse.solde';
    }

    return {
      ...caisse,
      availableBalance,
      balanceSource,
      isOccupied: !!activeSession,
      occupiedBy: activeSession?.caissierId || null,
      activeSessionId: activeSession?.id || null,
      lastClosedAt: lastClosedSession?.closedAt || null,
    };
  }));

  return result;
}

export async function setCaisseAssignments(caisseId: string, userIds: string[], assignedBy: string): Promise<void> {
    // Transaction pour remplacer les assignations
    await db.transaction(async (tx) => {
        // 1. Supprimer les existantes
        await tx.delete(caisseAssignations).where(eq(caisseAssignations.caisseId, caisseId));
        
        // 2. Insérer les nouvelles
        if (userIds.length > 0) {
            const records = userIds.map(userId => ({
                caisseId,
                userId,
                assignedBy
            }));
            await tx.insert(caisseAssignations).values(records);
        }
    });
}
