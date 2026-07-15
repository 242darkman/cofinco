import type { StatutSessionCaisseDz } from "@shared/enum/enums";
import { StatutCaisseAgent, TypeOperationCaisse } from "@shared/enum/status-constants";
import {
  agences,
  caisses,
  sessionsCaisse,
  users,
  type InsertSessionCaisse,
  type SessionCaisse
} from "@shared/schema";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  notInArray,
  or
} from "drizzle-orm";
import { db } from "../../../db";
import { computeSessionStatus } from "../../../services/caisse/session-status";

// Statuts terminaux — alignés avec les contraintes uniques DB sur sessions_caisse
export const SESSION_TERMINAL_STATUSES = ["CLOSED", "RECONCILIATION_PENDING", "RECONCILIATION_COMPLETE"] as const;

// Types de retrait depuis typePaiementTerrainEnum (EN)
export const WITHDRAWAL_TYPES = [
  TypeOperationCaisse.WITHDRAWAL_SAVINGS,
  TypeOperationCaisse.WITHDRAWAL_CURRENT,
  TypeOperationCaisse.WITHDRAWAL_BLOCKED,
  TypeOperationCaisse.TONTINE_WITHDRAWAL,
] as const;

// Types de dépôt depuis typePaiementTerrainEnum (EN)
export const DEPOSIT_TYPES = [
  TypeOperationCaisse.DEPOSIT_SAVINGS,
  TypeOperationCaisse.DEPOSIT_CURRENT,
  TypeOperationCaisse.DEPOSIT_BLOCKED,
  TypeOperationCaisse.TONTINE_CONTRIBUTION,
] as const;

export async function getSessionCaisse(id: string): Promise<any | undefined> {
  const results = await db.select({
    session: sessionsCaisse,
    caisse_nom: caisses.nom,
    caissier_nom: users.nom,
    caissier_prenom: users.prenom
  })
  .from(sessionsCaisse)
  .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
  .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
  .where(eq(sessionsCaisse.id, id));

  if (results.length === 0) return undefined;

  const r = results[0];
  return {
    ...r.session,
    computedStatus: computeSessionStatus(r.session),
    caisseNom: r.caisse_nom || 'Caisse Inconnue',
    caissierNom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim() || 'Caissier Inconnu',
  };
}

export async function getActiveSessionForUser(userId: string): Promise<any | undefined> {
  const results = await db.select({
    session: sessionsCaisse,
    caisse_nom: caisses.nom,
    caissier_nom: users.nom,
    caissier_prenom: users.prenom
  })
  .from(sessionsCaisse)
  .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
  .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
  .where(and(
    eq(sessionsCaisse.caissierId, userId),
    inArray(sessionsCaisse.statut, ["OPEN", "CLOSING_COUNT", "CLOSING_VALIDATION"] as StatutSessionCaisseDz[]),
    isNull(sessionsCaisse.deletedAt)
  ));

  if (results.length === 0) return undefined;
  
  const r = results[0];
  return {
    ...r.session,
    computedStatus: computeSessionStatus(r.session),
    caisseNom: r.caisse_nom || 'Caisse Inconnue',
    caissierNom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim() || 'Moi',
  };
}

export async function getActiveSessions(): Promise<SessionCaisse[]> {
  return db.select().from(sessionsCaisse).where(
    and(notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]), isNull(sessionsCaisse.deletedAt))
  );
}

export async function getAllSessionsCaisse(filter: { agence?: string; statut?: string } = {}): Promise<any[]> {
  let query = db.select({
    session: sessionsCaisse,
    caissier_nom: users.nom,
    caissier_prenom: users.prenom,
    caisse_nom: caisses.nom,
    agence_nom: agences.nom,
    agence_code: agences.codeAgence
  })
  .from(sessionsCaisse)
  .leftJoin(users, eq(sessionsCaisse.caissierId, users.id))
  .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
  .leftJoin(agences, eq(sessionsCaisse.agenceId, agences.id));

  const conditions = [];

  if (filter.agence) {
    conditions.push(eq(sessionsCaisse.agenceId, filter.agence));
  }

  if (filter.statut) {
    const normalized = filter.statut.toUpperCase();
    const now = new Date();
    if (normalized === StatutCaisseAgent.OPEN) {
      conditions.push(
        and(
          notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
          isNull(sessionsCaisse.deletedAt),
          or(isNull(sessionsCaisse.timeoutAt), gte(sessionsCaisse.timeoutAt, now))
        )
      );
    } else if (normalized === "TIMED_OUT" || normalized === "TIMEOUT") {
      conditions.push(and(notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]), isNull(sessionsCaisse.deletedAt), lt(sessionsCaisse.timeoutAt, now)));
    } else if (normalized === StatutCaisseAgent.CLOSED) {
      conditions.push(inArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]));
    }
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const results = await query.orderBy(desc(sessionsCaisse.openedAt));

  return results.map(r => ({
    ...r.session,
    computedStatus: computeSessionStatus(r.session),
    caissierNom: `${r.caissier_nom || ''} ${r.caissier_prenom || ''}`.trim() || 'Caissier Inconnu',
    caisseNom: r.caisse_nom,
    agenceNom: r.agence_nom || 'Agence Inconnue',
    agenceCode: r.agence_code,
  }));
}

export async function createSessionCaisse(insertSession: InsertSessionCaisse): Promise<SessionCaisse> {
  const [session] = await db.insert(sessionsCaisse).values(insertSession).returning();
  return session;
}

export async function updateSessionCaisse(id: string, updateData: Partial<InsertSessionCaisse>): Promise<SessionCaisse | undefined> {
  const [session] = await db.update(sessionsCaisse).set(updateData).where(eq(sessionsCaisse.id, id)).returning();
  return session || undefined;
}

export async function updateUserConnectionStatus(userId: string, status: 'CONNECTED' | 'DISCONNECTED'): Promise<void> {
  // Mettre à jour uniquement s'il y a une session active pour cet utilisateur
  await db.update(sessionsCaisse)
    .set({ connectionStatus: status })
    .where(and(
      eq(sessionsCaisse.caissierId, userId),
      notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
      isNull(sessionsCaisse.deletedAt)
    ));
}

export async function closeSessionCaisse(id: string, closeData: { soldeReel: string; ecart: string; billetageFermeture: any; observations?: string }): Promise<SessionCaisse | undefined> {
  const [session] = await db.update(sessionsCaisse)
    .set({
      montantFermetureDeclare: closeData.soldeReel,
      ecart: closeData.ecart,
      billetageFermeture: closeData.billetageFermeture,
      observations: closeData.observations,
      closedAt: new Date(),
    })
    .where(eq(sessionsCaisse.id, id))
    .returning();
  return session || undefined;
}

export async function getSessionsByCaissier(caissierId: string): Promise<SessionCaisse[]> {
  return db.select().from(sessionsCaisse).where(eq(sessionsCaisse.caissierId, caissierId)).orderBy(desc(sessionsCaisse.openedAt));
}

/**
 * Récupérer la dernière session fermée pour une caisse
 * Renvoie la session la plus récente qui a été fermée (closedAt N'EST PAS NULL)
 */
export async function getLastClosedSession(caisseId: string): Promise<SessionCaisse | undefined> {
  const [session] = await db.select()
    .from(sessionsCaisse)
    .where(and(
      eq(sessionsCaisse.caisseId, caisseId),
      eq(sessionsCaisse.statut, "CLOSED")
    ))
    .orderBy(desc(sessionsCaisse.closedAt))
    .limit(1);
  return session || undefined;
}
