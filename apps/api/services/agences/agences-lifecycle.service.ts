import { db } from "../../db";
import { agences, userAgences, users } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { logAudit } from "../../audit";
import { getWsInstance } from "../../ws-server";
import { StatutAgence, AGENCY_STATUS_TRANSITIONS } from "@shared/enum/status-constants";
import { agencyStatusHistory } from "@shared/schema/agences";
import { getAgencyActivationChecklist } from "../../services/agency-checklist";

/**
 * Valide si une transition de statut est autorisée
 */
function isValidTransition(from: string, to: string): boolean {
  const allowed = AGENCY_STATUS_TRANSITIONS[from as keyof typeof AGENCY_STATUS_TRANSITIONS];
  return Array.isArray(allowed) && allowed.includes(to as any);
}

/**
 * Soumet une agence pour validation
 */
export async function submitAgence(id: string, comment: string | undefined, userId: string, req: any) {
  const [agency] = await db.select().from(agences).where(eq(agences.id, id));
  if (!agency) throw new Error("Agence non trouvée");
  
  if (!isValidTransition(agency.statut, StatutAgence.PENDING_APPROVAL)) {
    throw new Error(`Transition invalide: ${agency.statut} → PENDING_APPROVAL`);
  }

  const missing: string[] = [];
  if (!agency.codeAgence) missing.push("Code agence");
  if (!agency.nom) missing.push("Nom");
  if (!agency.typeAgence) missing.push("Type d'agence");
  if (!agency.villeId) missing.push("Ville");
  if (missing.length > 0) {
    throw new Error(`Données incomplètes pour la soumission: ${missing.join(", ")}`);
  }

  await db.transaction(async (tx) => {
    await tx.update(agences)
      .set({ statut: StatutAgence.PENDING_APPROVAL, updatedAt: new Date() })
      .where(eq(agences.id, id));

    await tx.insert(agencyStatusHistory).values({
      agenceId: id,
      fromStatus: agency.statut,
      toStatus: StatutAgence.PENDING_APPROVAL,
      changedBy: userId,
      reason: comment || null,
    });
  });

  await logAudit(req, "SUBMIT_APPROVAL", "agences", id, {
    fromStatus: agency.statut,
    toStatus: StatutAgence.PENDING_APPROVAL,
    comment,
  });

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_submitted', id } });
  }

  return { message: "Agence soumise pour validation", status: StatutAgence.PENDING_APPROVAL };
}

/**
 * Active une agence
 */
export async function activateAgence(id: string, userId: string, req: any) {
  const [agency] = await db.select().from(agences).where(eq(agences.id, id));
  if (!agency) throw new Error("Agence non trouvée");

  const targetStatus = StatutAgence.ACTIVE;
  if (!isValidTransition(agency.statut, targetStatus)) {
    throw new Error(`Transition invalide: ${agency.statut} → ACTIVE`);
  }

  const checklist = await getAgencyActivationChecklist(id);
  if (!checklist.ready) {
    const failedItems = checklist.items.filter(i => i.required && !i.passed);
    throw new Error(JSON.stringify({
      message: "La checklist d'activation n'est pas complète",
      checklist,
      failedItems: failedItems.map(i => ({
        key: i.key,
        label: i.label,
        details: i.details,
      })),
    }));
  }

  await db.transaction(async (tx) => {
    await tx.update(agences)
      .set({
        statut: targetStatus,
        activatedAt: new Date(),
        activatedBy: userId,
        suspendedAt: null,
        suspendedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(agences.id, id));

    await tx.insert(agencyStatusHistory).values({
      agenceId: id,
      fromStatus: agency.statut,
      toStatus: targetStatus,
      changedBy: userId,
      checklistSnapshot: checklist,
    });
  });

  await logAudit(req, "ACTIVATE", "agences", id, {
    fromStatus: agency.statut,
    toStatus: targetStatus,
    checklistSnapshot: checklist,
  }, "success", "high");

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_activated', id } });
  }

  return { message: "Agence activée avec succès", status: targetStatus };
}

/**
 * Rejette une agence (renvoie en brouillon)
 */
export async function rejectAgence(id: string, reason: string, userId: string, req: any) {
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("Une raison est obligatoire pour le rejet");
  }

  const [agency] = await db.select().from(agences).where(eq(agences.id, id));
  if (!agency) throw new Error("Agence non trouvée");
  
  if (agency.statut !== StatutAgence.PENDING_APPROVAL) {
    throw new Error(`Seule une agence en attente de validation peut être rejetée (statut actuel: ${agency.statut})`);
  }

  await db.transaction(async (tx) => {
    await tx.update(agences)
      .set({ statut: StatutAgence.DRAFT, updatedAt: new Date() })
      .where(eq(agences.id, id));

    await tx.insert(agencyStatusHistory).values({
      agenceId: id,
      fromStatus: StatutAgence.PENDING_APPROVAL,
      toStatus: StatutAgence.DRAFT,
      changedBy: userId,
      reason: reason.trim(),
    });
  });

  await logAudit(req, "REJECT", "agences", id, {
    fromStatus: StatutAgence.PENDING_APPROVAL,
    toStatus: StatutAgence.DRAFT,
    reason: reason.trim(),
  });

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_rejected', id } });
  }

  return { message: "Agence renvoyée en brouillon", status: StatutAgence.DRAFT };
}

/**
 * Suspend une agence
 */
export async function suspendAgence(id: string, reason: string, userId: string, req: any) {
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("Une raison est obligatoire pour la suspension");
  }

  const [agency] = await db.select().from(agences).where(eq(agences.id, id));
  if (!agency) throw new Error("Agence non trouvée");
  
  if (!isValidTransition(agency.statut, StatutAgence.SUSPENDED)) {
    throw new Error(`Transition invalide: ${agency.statut} → SUSPENDED`);
  }

  await db.transaction(async (tx) => {
    await tx.update(agences)
      .set({
        statut: StatutAgence.SUSPENDED,
        suspendedAt: new Date(),
        suspendedReason: reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(agences.id, id));

    await tx.insert(agencyStatusHistory).values({
      agenceId: id,
      fromStatus: agency.statut,
      toStatus: StatutAgence.SUSPENDED,
      changedBy: userId,
      reason: reason.trim(),
    });
  });

  await logAudit(req, "SUSPEND", "agences", id, {
    fromStatus: agency.statut,
    toStatus: StatutAgence.SUSPENDED,
    reason: reason.trim(),
  }, "success", "high");

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_suspended', id } });
  }

  return { message: "Agence suspendue", status: StatutAgence.SUSPENDED };
}

/**
 * Clôture une agence
 */
export async function closeAgence(id: string, reason: string, userId: string, req: any) {
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("Une raison est obligatoire pour la clôture");
  }

  const [agency] = await db.select().from(agences).where(eq(agences.id, id));
  if (!agency) throw new Error("Agence non trouvée");

  let targetStatus: string;
  if (agency.statut === StatutAgence.CLOSING_PENDING) {
    targetStatus = StatutAgence.CLOSED;
  } else if (isValidTransition(agency.statut, StatutAgence.CLOSING_PENDING)) {
    targetStatus = StatutAgence.CLOSING_PENDING;
  } else {
    throw new Error(`Impossible de clôturer depuis le statut: ${agency.statut}`);
  }

  if (targetStatus === StatutAgence.CLOSED) {
    const [activeUsers] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userAgences)
      .where(and(eq(userAgences.agenceId, id), eq(userAgences.actif, true)));

    if (Number(activeUsers?.count || 0) > 0) {
      throw new Error("Impossible de clôturer: des utilisateurs sont encore assignés à cette agence");
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(agences)
      .set({ statut: targetStatus, updatedAt: new Date() })
      .where(eq(agences.id, id));

    await tx.insert(agencyStatusHistory).values({
      agenceId: id,
      fromStatus: agency.statut,
      toStatus: targetStatus,
      changedBy: userId,
      reason: reason.trim(),
    });
  });

  await logAudit(req, "CLOSE", "agences", id, {
    fromStatus: agency.statut,
    toStatus: targetStatus,
    reason: reason.trim(),
  }, "success", "high");

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_closed', id } });
  }

  return { 
    message: targetStatus === StatutAgence.CLOSED ? "Agence clôturée" : "Clôture initiée", 
    status: targetStatus 
  };
}

/**
 * Récupère l'historique des statuts d'une agence
 */
export async function getAgenceStatusHistory(id: string) {
  const history = await db
    .select({
      id: agencyStatusHistory.id,
      fromStatus: agencyStatusHistory.fromStatus,
      toStatus: agencyStatusHistory.toStatus,
      reason: agencyStatusHistory.reason,
      checklistSnapshot: agencyStatusHistory.checklistSnapshot,
      createdAt: agencyStatusHistory.createdAt,
      changedByName: sql<string>`COALESCE(${users.nom} || ' ' || COALESCE(${users.prenom}, ''), 'Système')`,
    })
    .from(agencyStatusHistory)
    .leftJoin(users, eq(agencyStatusHistory.changedBy, users.id))
    .where(eq(agencyStatusHistory.agenceId, id))
    .orderBy(desc(agencyStatusHistory.createdAt));

  return history;
}
