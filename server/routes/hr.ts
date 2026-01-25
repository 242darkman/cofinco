import { Router } from "express";
import { db } from "../db";
import {
  demandesConges,
  formations,
  formationParticipants,
  sanctions,
  candidatures,
  bulletinsPaie,
  horairesTravail,
  presences,
  employes,
  leaveBalances,
  payrollConfig,
  hrAuditLog,
  LeaveStatus,
  BulletinStatus,
  createLeaveRequestSchema,
  generatePayrollSchema,
} from "@shared/schema";
import { normalizeRole } from "@shared/types/roles";
import { StatutCandidature, StatutConge, StatutUser, StatutVisiteTerrain, StatutArchive } from "@shared/enum/status-constants";
import { eq, desc, and, gte, lte, sql, count } from "drizzle-orm";
import { getAuthUser } from "server/middleware";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { storage } from "server/storage";
import { hrService } from "../services/hr-service";
import { users } from "@shared/schema";
import { getWsInstance } from "../ws-server";
import { z } from "zod";
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";

export const hrRouter = Router();

// ============================================
// HELPER: Standardized HR WebSocket broadcast
// ============================================
interface HrEventPayload {
  entity: 'employe' | 'conge' | 'presence' | 'paie' | 'bulletin' | 'formation' | 'sanction' | 'avantage' | 'candidature' | 'organigramme';
  action: 'created' | 'updated' | 'approved' | 'rejected' | 'paid' | 'deleted' | 'assigned' | 'generated' | 'validated';
  id: string | number;
  agenceId?: string;
  employeId?: string;
  extra?: Record<string, any>;
}

function broadcastHrUpdate(payload: HrEventPayload, actor?: { id: string; name: string }) {
  const wsInstance = getWsInstance();
  if (!wsInstance) return;

  const fullPayload = {
    ...payload,
    timestamp: new Date().toISOString(),
    actor,
  };

  wsInstance.broadcast({ type: 'HR_UPDATE', payload: fullPayload });
}

// ============================================
// HELPER: API Response format
// ============================================
function successResponse<T>(data: T, meta?: any) {
  return { success: true, data, ...(meta && { meta }) };
}

function errorResponse(code: string, message: string, details?: any) {
  return { success: false, code, message, ...(details && { details }) };
}

const normalizeRoleToken = (role?: string | null): string | undefined => {
  if (!role) return undefined;
  const normalized = normalizeRole(role);
  if (normalized) return normalized;
  return role.trim().toLowerCase();
};

const roleIn = (role: string | null | undefined, allowed: string[]): boolean => {
  const roleToken = normalizeRoleToken(role);
  if (!roleToken) return false;
  const allowedTokens = allowed
    .map((value) => normalizeRoleToken(value))
    .filter((value): value is string => !!value);
  return allowedTokens.includes(roleToken);
};

/**
 * ========================================
 * DEMANDES DE CONGÉS
 * ========================================
 */

// GET /api/hr/conges - Liste des demandes de congés
hrRouter.get("/conges", getAuthUser, async (req, res) => {
  try {
    const { statut, employeId, dateDebut, dateFin } = req.query;

    let query = db.select().from(demandesConges);

    const conditions = [];
    if (statut) conditions.push(eq(demandesConges.statut, statut as string));
    if (employeId) conditions.push(eq(demandesConges.employeId, employeId as string));

    // RBAC: An employee can only see their own requests unless Admin/RH/Manager/Direction
    // Note: Manager should ideally see only their subordinates, implemented here for simplicity as "all" for Manager role for now, or filtered via frontend + rigorous check later.
    // Ideally: if role === 'manager', fetch subordinates IDs and filter.
    // For now, let's restrict standard 'agent'/'employe'
    const userRole = req.user?.role;
    const restrictedRoles = ['agent', 'employe', 'stagiaire'];

    if (roleIn(userRole, restrictedRoles)) {
        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(req.user!.id);
        if (employe) {
            conditions.push(eq(demandesConges.employeId, employe.id));
        } else {
            // Si pas d'employé trouvé, on force une condition impossible pour ne rien retourner
            conditions.push(eq(demandesConges.employeId, '00000000-0000-0000-0000-000000000000'));
        }
    }

    if (dateDebut) conditions.push(gte(demandesConges.dateDebut, dateDebut as string));
    if (dateFin) conditions.push(lte(demandesConges.dateFin, dateFin as string));

    const result = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(demandesConges.createdAt))
      : await query.orderBy(desc(demandesConges.createdAt));

    res.json(result);
  } catch (error) {
    console.error("Erreur récupération congés:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/conges - Créer une demande de congé
hrRouter.post("/conges", getAuthUser, async (req, res) => {
  try {
    const { employeId, employeNom, type, dateDebut, dateFin, motif } = req.body;

    // Validation basique
    if (!employeId || !type || !dateDebut || !dateFin) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Champs obligatoires manquants'));
    }

    // Validation: dates
    if (new Date(dateFin) < new Date(dateDebut)) {
      return res.status(400).json(errorResponse(
        'INVALID_DATES',
        'La date de fin doit être postérieure ou égale à la date de début'
      ));
    }

    // Validation: chevauchement et solde
    const validation = await hrService.validateLeaveRequest(employeId, dateDebut, dateFin, type);
    if (!validation.valid) {
      return res.status(400).json(errorResponse(
        validation.code || 'VALIDATION_ERROR',
        validation.error || 'Validation échouée',
        validation.details
      ));
    }

    // Workflow: Direction (PDG/DG) auto-approves
    const userRole = req.user?.role;
    const isDirection = roleIn(userRole, ['direction', 'pdg', 'dg', 'admin']);
    const initialStatus = isDirection ? LeaveStatus.APPROVED : LeaveStatus.PENDING;
    const approuvePar = isDirection ? req.user?.id : null;
    const dateDecision = isDirection ? new Date() : null;

    const [newConge] = await db.insert(demandesConges).values({
      employeId,
      employeNom,
      type,
      dateDebut,
      dateFin,
      motif,
      statut: initialStatus,
      approuvePar: approuvePar,
      dateDecision: dateDecision
    }).returning();

    // Update leave balance (pending days)
    if (initialStatus === LeaveStatus.PENDING) {
      await hrService.onLeaveRequested(employeId, dateDebut, dateFin);
    } else if (initialStatus === LeaveStatus.APPROVED) {
      // Auto-approved: directly update used days
      await hrService.onLeaveApproved(newConge.id);
    }

    // Audit log
    await hrService.logAction(
      'conge',
      newConge.id,
      'created',
      {
        userId: req.user?.id,
        userName: req.user?.nom,
        userRole: req.user?.role,
        agenceId: req.user?.agenceId ?? undefined,
      },
      null,
      newConge
    );

    // Broadcast HR Update
    const daysRequested = hrService.calculateBusinessDays(dateDebut, dateFin);
    broadcastHrUpdate(
      {
        entity: 'conge',
        action: 'created',
        id: newConge.id,
        employeId,
        extra: { daysRequested, status: initialStatus },
      },
      req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
    );

    // Domain event: leave requested
    dispatchDomainEvent({
      type: "HR_LEAVE_REQUESTED",
      data: {
        congeId: newConge.id,
        employeId,
        employeNom: employeNom || "",
        type,
        dateDebut,
        dateFin,
        daysRequested,
        agenceId: req.user?.agenceId,
      },
      timestamp: new Date(),
    });

    res.status(201).json(successResponse(newConge));
  } catch (error) {
    console.error("Erreur création congé:", error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// PATCH /api/hr/conges/:id/approve - Approuver une demande
hrRouter.patch("/conges/:id/approve", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { commentaire } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // RBAC Check
    const allowedRoles = ['admin', 'Administrateur', 'rh', 'manager', "Chef d'Agence", 'direction', 'pdg', 'dg'];
    if (!roleIn(userRole, allowedRoles)) {
        return res.status(403).json(errorResponse('FORBIDDEN', 'Non autorisé à approuver'));
    }

    // Get current state for audit
    const [currentConge] = await db.select().from(demandesConges).where(eq(demandesConges.id, parseInt(id)));
    if (!currentConge) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Demande non trouvée'));
    }

    // Check if already processed
    if (currentConge.statut !== LeaveStatus.PENDING) {
      return res.status(400).json(errorResponse(
        'INVALID_STATUS',
        `Cette demande a déjà été ${currentConge.statut === LeaveStatus.APPROVED ? 'approuvée' : 'traitée'}`
      ));
    }

    // Manager hierarchy check (if manager role)
    if (roleIn(userRole, ['manager'])) {
      const managerEmploye = await storage.getEmployeByUserId(userId!);
      if (managerEmploye) {
        const [targetEmploye] = await db.select().from(employes).where(eq(employes.id, currentConge.employeId));
        if (targetEmploye && targetEmploye.managerId !== managerEmploye.id) {
          // Not a direct report - check if admin override
          if (!roleIn(userRole, ['admin', 'rh', 'direction'])) {
            return res.status(403).json(errorResponse('FORBIDDEN', 'Vous ne pouvez approuver que les demandes de vos subordonnés directs'));
          }
        }
      }
    }

    const [updated] = await db.update(demandesConges)
      .set({
        statut: LeaveStatus.APPROVED,
        approuvePar: userId,
        dateDecision: new Date(),
        commentaire: commentaire || null,
        updatedAt: new Date(),
      })
      .where(eq(demandesConges.id, parseInt(id)))
      .returning();

    // Update leave balance
    await hrService.onLeaveApproved(updated.id);

    // Audit log
    await hrService.logAction(
      'conge',
      updated.id,
      'approved',
      {
        userId: req.user?.id,
        userName: req.user?.nom,
        userRole: req.user?.role,
        agenceId: req.user?.agenceId ?? undefined,
      },
      { statut: currentConge.statut },
      { statut: updated.statut, approuvePar: userId, commentaire },
      commentaire
    );

    // Broadcast HR Update
    broadcastHrUpdate(
      {
        entity: 'conge',
        action: 'approved',
        id: updated.id,
        employeId: updated.employeId,
        extra: { approvedBy: req.user?.nom },
      },
      req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
    );

    // Domain event: leave approved
    dispatchDomainEvent({
      type: "HR_LEAVE_APPROVED",
      data: {
        congeId: updated.id,
        employeId: updated.employeId,
        employeNom: updated.employeNom || "",
        approvedByName: req.user?.nom,
        agenceId: req.user?.agenceId,
      },
      timestamp: new Date(),
    });

    res.json(successResponse(updated));
  } catch (error) {
    console.error("Erreur approbation congé:", error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// PATCH /api/hr/conges/:id/reject - Refuser une demande
hrRouter.patch("/conges/:id/reject", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { commentaire } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // Commentaire obligatoire pour un rejet
    if (!commentaire || commentaire.trim().length === 0) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Un commentaire est obligatoire pour rejeter une demande'));
    }

    // RBAC Check
    const allowedRoles = ['admin', 'Administrateur', 'rh', 'manager', "Chef d'Agence", 'direction', 'pdg', 'dg'];
    if (!roleIn(userRole, allowedRoles)) {
        return res.status(403).json(errorResponse('FORBIDDEN', 'Non autorisé à refuser'));
    }

    // Get current state for audit
    const [currentConge] = await db.select().from(demandesConges).where(eq(demandesConges.id, parseInt(id)));
    if (!currentConge) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Demande non trouvée'));
    }

    // Check if already processed
    if (currentConge.statut !== LeaveStatus.PENDING) {
      return res.status(400).json(errorResponse(
        'INVALID_STATUS',
        `Cette demande a déjà été ${currentConge.statut === LeaveStatus.REJECTED ? 'rejetée' : 'traitée'}`
      ));
    }

    const [updated] = await db.update(demandesConges)
      .set({
        statut: LeaveStatus.REJECTED,
        approuvePar: userId,
        dateDecision: new Date(),
        commentaire: commentaire,
        updatedAt: new Date(),
      })
      .where(eq(demandesConges.id, parseInt(id)))
      .returning();

    // Release pending days in leave balance
    await hrService.onLeaveRejectedOrCancelled(updated.id);

    // Audit log
    await hrService.logAction(
      'conge',
      updated.id,
      'rejected',
      {
        userId: req.user?.id,
        userName: req.user?.nom,
        userRole: req.user?.role,
        agenceId: req.user?.agenceId ?? undefined,
      },
      { statut: currentConge.statut },
      { statut: updated.statut, approuvePar: userId, commentaire },
      commentaire,
      'warning'
    );

    // Broadcast HR Update
    broadcastHrUpdate(
      {
        entity: 'conge',
        action: 'rejected',
        id: updated.id,
        employeId: updated.employeId,
        extra: { rejectedBy: req.user?.nom, reason: commentaire },
      },
      req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
    );

    // Domain event: leave rejected
    dispatchDomainEvent({
      type: "HR_LEAVE_REJECTED",
      data: {
        congeId: updated.id,
        employeId: updated.employeId,
        employeNom: updated.employeNom || "",
        rejectedByName: req.user?.nom,
        reason: commentaire,
        agenceId: req.user?.agenceId,
      },
      timestamp: new Date(),
    });

    res.json(successResponse(updated));
  } catch (error) {
    console.error("Erreur rejet congé:", error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// GET /api/hr/conges/balance/:employeId - Solde congés d'un employé
hrRouter.get("/conges/balance/:employeId", getAuthUser, async (req, res) => {
  try {
    const { employeId } = req.params;
    const { year } = req.query;

    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();

    // Get all balances for the employee
    const balances = await hrService.getAllLeaveBalances(employeId);

    // Get current year balance specifically
    const currentYearBalance = balances.find(b => b.year === targetYear);

    // Calculate available balance
    const available = currentYearBalance
      ? (currentYearBalance.acquired || 0) + (currentYearBalance.carryOver || 0) - (currentYearBalance.used || 0) - (currentYearBalance.pending || 0)
      : 0;

    res.json(successResponse({
      employeId,
      year: targetYear,
      balance: currentYearBalance,
      available,
      allBalances: balances,
    }));
  } catch (error) {
    console.error("Erreur récupération solde congés:", error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

/**
 * ========================================
 * FORMATIONS
 * ========================================
 */

// GET /api/hr/formations - Liste des formations avec nombre de participants (FIX N+1)
hrRouter.get("/formations", getAuthUser, async (req, res) => {
  try {
    const { statut, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    // FIX N+1: Use LEFT JOIN with GROUP BY instead of N separate queries
    const baseQuery = db
      .select({
        formation: formations,
        participantCount: sql<number>`COALESCE(COUNT(${formationParticipants.employeId}), 0)::int`.as('participant_count'),
      })
      .from(formations)
      .leftJoin(formationParticipants, eq(formations.id, formationParticipants.formationId))
      .groupBy(formations.id)
      .orderBy(desc(formations.dateDebut))
      .limit(limitNum)
      .offset(offset);

    // Apply status filter if provided
    const result = statut
      ? await baseQuery.where(eq(formations.statut, statut as string))
      : await baseQuery;

    // Get total count for pagination
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(formations)
      .where(statut ? eq(formations.statut, statut as string) : sql`1=1`);

    // Format response
    const formattedResult = result.map(r => ({
      ...r.formation,
      participants: r.participantCount,
    }));

    res.json(successResponse(formattedResult, {
      total,
      page: pageNum,
      limit: limitNum,
      hasMore: offset + result.length < total,
    }));
  } catch (error) {
    console.error("Erreur récupération formations:", error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// POST /api/hr/formations - Créer une formation
hrRouter.post("/formations", getAuthUser, async (req, res) => {
  try {
    const { titre, formateur, dateDebut, duree, lieu, description, capaciteMax } = req.body;

    if (!titre || !formateur || !dateDebut || !duree) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const [newFormation] = await db.insert(formations).values({
      titre,
      formateur,
      dateDebut,
      duree,
      lieu,
      description,
      capaciteMax,
      statut: StatutVisiteTerrain.PLANNED
    }).returning();

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_new', id: newFormation.id } });
    }

    res.status(201).json(newFormation);
  } catch (error) {
    console.error("Erreur création formation:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/formations/:id/participants - Participants d'une formation
hrRouter.get("/formations/:id/participants", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;

    const participants = await db.select()
      .from(formationParticipants)
      .where(eq(formationParticipants.formationId, parseInt(id)));

    res.json(participants);
  } catch (error) {
    console.error("Erreur récupération participants:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/formations/:id/participants - Ajouter un participant
hrRouter.post("/formations/:id/participants", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { employeId, employeNom } = req.body;

    if (!employeId || !employeNom) {
      return res.status(400).json({ error: "employeId et employeNom requis" });
    }

    await db.insert(formationParticipants).values({
      formationId: parseInt(id),
      employeId,
      employeNom
    });

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_participant_added', formationId: id } });
    }

    res.status(201).json({ message: "Participant ajouté" });
  } catch (error) {
    console.error("Erreur ajout participant:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/formations/:id/participants/:employeId - Retirer un participant
hrRouter.delete("/formations/:id/participants/:employeId", getAuthUser, async (req, res) => {
  try {
    const { id, employeId } = req.params;

    await db.delete(formationParticipants)
      .where(and(
        eq(formationParticipants.formationId, parseInt(id)),
        eq(formationParticipants.employeId, employeId)
      ));

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_participant_removed', formationId: id } });
    }

    res.json({ message: "Participant retiré" });
  } catch (error) {
    console.error("Erreur retrait participant:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/formations/:id - Mettre à jour statut formation
hrRouter.patch("/formations/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (![StatutVisiteTerrain.PLANNED, StatutVisiteTerrain.IN_PROGRESS, StatutVisiteTerrain.COMPLETED, StatutVisiteTerrain.CANCELLED].includes(statut as any)) {
      return res.status(400).json({ error: "Statut invalide" });
    }

    const [updated] = await db.update(formations)
      .set({ statut })
      .where(eq(formations.id, parseInt(id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Formation non trouvée" });
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_status_update', id: updated.id } });
    }

    res.json(updated);
  } catch (error) {
    console.error("Erreur mise à jour formation:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * SANCTIONS
 * ========================================
 */

// GET /api/hr/sanctions - Liste des sanctions
hrRouter.get("/sanctions", getAuthUser, async (req, res) => {
  try {
    const { employeId, gravite } = req.query;

    let baseQuery = db.select().from(sanctions);

    let result;
    if (employeId) {
      result = await baseQuery.where(eq(sanctions.employeId, employeId as string)).orderBy(desc(sanctions.date));
    } else if (gravite) {
      result = await baseQuery.where(eq(sanctions.gravite, gravite as string)).orderBy(desc(sanctions.date));
    } else {
      result = await baseQuery.orderBy(desc(sanctions.date));
    }

    res.json(result);
  } catch (error) {
    console.error("Erreur récupération sanctions:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/sanctions - Créer une sanction
hrRouter.post("/sanctions", getAuthUser, async (req, res) => {
  try {
    const { employeId, employeNom, type, motif, date, gravite } = req.body;
    const userId = req.user?.id;

    if (!employeId || !type || !motif || !date || !gravite) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const [newSanction] = await db.insert(sanctions).values({
      employeId,
      employeNom,
      type,
      motif,
      date,
      gravite,
      emetteurId: userId
    }).returning();

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'sanction_new', id: newSanction.id } });
    }

    res.status(201).json(newSanction);
  } catch (error) {
    console.error("Erreur création sanction:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * CANDIDATURES
 * ========================================
 */

// GET /api/hr/candidatures - Liste des candidatures
hrRouter.get("/candidatures", getAuthUser, async (req, res) => {
  try {
    const { statut } = req.query;

    const result = statut
      ? await db.select().from(candidatures).where(eq(candidatures.statut, statut as string)).orderBy(desc(candidatures.datePostulation))
      : await db.select().from(candidatures).orderBy(desc(candidatures.datePostulation));

    res.json(result);
  } catch (error) {
    console.error("Erreur récupération candidatures:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/candidatures - Créer une candidature
hrRouter.post("/candidatures", getAuthUser, async (req, res) => {
  try {
    const { nom, prenom, email, telephone, posteVise, experience, formation: formationCand } = req.body;

    if (!nom || !prenom || !email || !posteVise) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const [newCandidature] = await db.insert(candidatures).values({
      nom,
      prenom,
      email,
      telephone,
      posteVise,
      experience,
      formation: formationCand,
      statut: StatutCandidature.PENDING
    }).returning();

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'candidature_new', id: newCandidature.id } });
    }

    res.status(201).json(newCandidature);
  } catch (error) {
    console.error("Erreur création candidature:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/candidatures/:id - Mettre à jour une candidature
hrRouter.patch("/candidatures/:id", getAuthUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, notes, dateEntretien } = req.body;

    const updates: any = {};
    if (statut) {
      const validStatuts = Object.values(StatutCandidature);
      if (!validStatuts.includes(statut as any)) {
        return res.status(400).json({ error: "Statut invalide" });
      }
      updates.statut = statut;
    }
    if (notes !== undefined) updates.notes = notes;
    if (dateEntretien !== undefined) updates.dateEntretien = dateEntretien;

    const [updated] = await db.update(candidatures)
      .set(updates)
      .where(eq(candidatures.id, parseInt(id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Candidature non trouvée" });
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'candidature_updated', id: updated.id } });
    }

    res.json(updated);
  } catch (error) {
    console.error("Erreur mise à jour candidature:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * BULLETINS DE PAIE
 * ========================================
 */

// GET /api/hr/bulletins - Liste des bulletins de paie
hrRouter.get("/bulletins", getAuthUser, async (req, res) => {
  try {
    const { employeId, mois, annee } = req.query;

    let query = db.select().from(bulletinsPaie);

    const conditions = [];
    if (employeId) conditions.push(eq(bulletinsPaie.employeId, employeId as string));
    if (mois && annee) {
      const moisFormat = `${annee}-${String(mois).padStart(2, '0')}`;
      conditions.push(eq(bulletinsPaie.mois, moisFormat));
    }

    const result = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(bulletinsPaie.mois))
      : await query.orderBy(desc(bulletinsPaie.mois));

    res.json(result);
  } catch (error) {
    console.error("Erreur récupération bulletins:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/paie/generate - Générer les fiches de paie pour un mois
hrRouter.post("/paie/generate", getAuthUser, attachAbility, requireAbility(Actions.GENERATE, Subjects.PAIE), async (req, res) => {
    try {
        const { mois } = req.body;
        const userId = req.user?.id;
        const agenceId = req.user?.agenceId;

        // Validate input
        const validation = generatePayrollSchema.safeParse({ mois });
        if (!validation.success) {
          return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Format de mois invalide (YYYY-MM attendu)'));
        }

        // Use the new HR service for payroll generation
        const results = await hrService.generateMonthlyPayroll(mois, userId!, agenceId || undefined);

        // Audit log
        await hrService.logAction(
          'paie',
          mois,
          'generated',
          {
            userId: req.user?.id,
            userName: req.user?.nom,
            userRole: req.user?.role,
            agenceId: req.user?.agenceId ?? undefined,
          },
          null,
          { generated: results.generated, skipped: results.skipped },
          undefined,
          'info'
        );

        // Broadcast HR Update
        broadcastHrUpdate(
          {
            entity: 'paie',
            action: 'generated',
            id: mois,
            agenceId: agenceId ?? undefined,
            extra: { month: mois, count: results.generated, skipped: results.skipped },
          },
          req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
        );

        res.status(201).json(successResponse({
          message: `${results.generated} fiches de paie générées (${results.skipped} déjà existantes)`,
          generated: results.generated,
          skipped: results.skipped,
          bulletins: results.bulletins,
        }));
    } catch (error) {
        console.error("Erreur génération paie:", error);
        res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
    }
});

// GET /api/hr/paie/config - Configuration de la paie
hrRouter.get("/paie/config", getAuthUser, async (req, res) => {
  try {
    const agenceId = req.user?.agenceId;
    const config = await hrService.getPayrollConfig(agenceId || undefined);

    if (!config) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Configuration paie non trouvée'));
    }

    res.json(successResponse(config));
  } catch (error) {
    console.error("Erreur récupération config paie:", error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// PATCH /api/hr/paie/validate - Valider des bulletins
hrRouter.patch("/paie/validate", getAuthUser, attachAbility, requireAbility(Actions.APPROVE, Subjects.PAIE), async (req, res) => {
  try {
    const { bulletinIds } = req.body;

    if (!bulletinIds || !Array.isArray(bulletinIds) || bulletinIds.length === 0) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Liste de bulletins requise'));
    }

    // Update bulletins to VALIDATED
    const updated = await db
      .update(bulletinsPaie)
      .set({ statut: BulletinStatus.VALIDATED })
      .where(
        and(
          sql`${bulletinsPaie.id} = ANY(${bulletinIds})`,
          eq(bulletinsPaie.statut, BulletinStatus.DRAFT)
        )
      )
      .returning();

    // Audit log
    await hrService.logAction(
      'paie',
      bulletinIds.join(','),
      'validated',
      {
        userId: req.user?.id,
        userName: req.user?.nom,
        userRole: req.user?.role,
        agenceId: req.user?.agenceId ?? undefined,
      },
      { statut: BulletinStatus.DRAFT },
      { statut: BulletinStatus.VALIDATED, count: updated.length }
    );

    // Broadcast
    broadcastHrUpdate(
      {
        entity: 'bulletin',
        action: 'validated',
        id: bulletinIds.join(','),
        extra: { count: updated.length },
      },
      req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
    );

    res.json(successResponse({ validated: updated.length, bulletins: updated }));
  } catch (error) {
    console.error("Erreur validation paie:", error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// PATCH /api/hr/paie/pay - Marquer des bulletins comme payés
hrRouter.patch("/paie/pay", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.PAIE), async (req, res) => {
  try {
    const { bulletinIds, datePaiement } = req.body;

    if (!bulletinIds || !Array.isArray(bulletinIds) || bulletinIds.length === 0) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Liste de bulletins requise'));
    }

    const paymentDate = datePaiement ? new Date(datePaiement) : new Date();

    // Update bulletins to PAID
    const updated = await db
      .update(bulletinsPaie)
      .set({
        statut: BulletinStatus.PAID,
        datePaiement: paymentDate.toISOString().split('T')[0],
      })
      .where(
        and(
          sql`${bulletinsPaie.id} = ANY(${bulletinIds})`,
          eq(bulletinsPaie.statut, BulletinStatus.VALIDATED)
        )
      )
      .returning();

    // Calculate total paid
    const totalPaid = updated.reduce((sum, b) => sum + parseInt(b.salaireNet || '0'), 0);

    // Audit log
    await hrService.logAction(
      'paie',
      bulletinIds.join(','),
      'paid',
      {
        userId: req.user?.id,
        userName: req.user?.nom,
        userRole: req.user?.role,
        agenceId: req.user?.agenceId ?? undefined,
      },
      { statut: BulletinStatus.VALIDATED },
      { statut: BulletinStatus.PAID, count: updated.length, totalPaid, datePaiement: paymentDate },
      undefined,
      'critical'
    );

    // Broadcast
    broadcastHrUpdate(
      {
        entity: 'paie',
        action: 'paid',
        id: bulletinIds.join(','),
        extra: { count: updated.length, total: totalPaid },
      },
      req.user ? { id: req.user.id, name: req.user.nom || '' } : undefined
    );

    res.json(successResponse({ paid: updated.length, totalPaid, bulletins: updated }));
  } catch (error) {
    console.error("Erreur paiement paie:", error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// GET /api/hr/paie/my - Mes fiches de paie
hrRouter.get("/paie/my", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé" });
        }

        const bulletins = await storage.getBulletins(employe.id);
        res.json(bulletins);
    } catch (error) {
        console.error("Erreur récupération mes bulletins:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/bulletins - Archiver un bulletin de paie
hrRouter.post("/bulletins", getAuthUser, async (req, res) => {
  try {
    const {
      employeId,
      employeNom,
      mois,
      salaireBase,
      primeAnciennete,
      primeTransport,
      primeRendement,
      autresPrimes,
      salaireBrut,
      cnssEmploye,
      ipr,
      autresRetenues,
      totalRetenues,
      salaireNet,
      cnssPatronale,
      pdfUrl,
      pdfHash
    } = req.body;

    const userId = req.user?.id;

    if (!employeId || !mois || !salaireBase || !salaireBrut || !salaireNet) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // Vérifier si bulletin existe déjà pour ce mois
    const existing = await db.select()
      .from(bulletinsPaie)
      .where(and(
        eq(bulletinsPaie.employeId, employeId),
        eq(bulletinsPaie.mois, mois)
      ));

    if (existing.length > 0) {
      return res.status(409).json({ error: "Bulletin déjà existant pour ce mois" });
    }

    const [newBulletin] = await db.insert(bulletinsPaie).values({
      employeId,
      employeNom,
      mois,
      salaireBase,
      primeAnciennete: primeAnciennete || "0",
      primeTransport: primeTransport || "0",
      primeRendement: primeRendement || "0",
      autresPrimes: autresPrimes || "0",
      salaireBrut,
      cnssEmploye,
      ipr,
      autresRetenues: autresRetenues || "0",
      totalRetenues,
      salaireNet,
      cnssPatronale,
      pdfUrl,
      pdfHash,
      genereParId: userId,
      statut: StatutArchive.VALIDATED // Directement validé si archivé manuellement
    }).returning();

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'bulletin_archived', id: newBulletin.id } });
    }

    res.status(201).json(newBulletin);
  } catch (error) {
    console.error("Erreur archivage bulletin:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * ========================================
 * STATISTIQUES RH
 * ========================================
 */

// GET /api/hr/stats - Statistiques globales RH
hrRouter.get("/stats", getAuthUser, async (req, res) => {
  try {
    const stats = await storage.getHrStats();

    // Add additional stats for the new features
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Leave stats
    const [leaveStats] = await db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE statut = 'PENDING')::int`,
        approved: sql<number>`COUNT(*) FILTER (WHERE statut = 'APPROVED')::int`,
        rejected: sql<number>`COUNT(*) FILTER (WHERE statut = 'REJECTED')::int`,
      })
      .from(demandesConges)
      .where(
        sql`EXTRACT(YEAR FROM date_debut) = ${currentYear}`
      );

    // Payroll stats for current month
    const [payrollStats] = await db
      .select({
        draft: sql<number>`COUNT(*) FILTER (WHERE statut = 'DRAFT')::int`,
        validated: sql<number>`COUNT(*) FILTER (WHERE statut = 'VALIDATED')::int`,
        paid: sql<number>`COUNT(*) FILTER (WHERE statut = 'PAID')::int`,
        totalNet: sql<number>`COALESCE(SUM(salaire_net::numeric) FILTER (WHERE statut = 'PAID'), 0)::int`,
      })
      .from(bulletinsPaie)
      .where(eq(bulletinsPaie.mois, currentMonth));

    res.json(successResponse({
      ...stats,
      leaves: leaveStats,
      payroll: {
        ...payrollStats,
        month: currentMonth,
      },
    }));
  } catch (error) {
    console.error("Erreur récupération stats RH:", error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

/**
 * ========================================
 * AUDIT LOG RH
 * ========================================
 */

// GET /api/hr/audit - Historique des actions RH
hrRouter.get("/audit", getAuthUser, async (req, res) => {
  try {
    const { entityType, entityId, limit = '50', page = '1' } = req.query;
    const userRole = req.user?.role;

    // Only admins, RH, and direction can view audit logs
    const allowedRoles = ['admin', 'Administrateur', 'rh', 'direction', 'pdg', 'dg'];
    if (!roleIn(userRole, allowedRoles)) {
      return res.status(403).json(errorResponse('FORBIDDEN', 'Non autorisé à consulter l\'audit'));
    }

    const limitNum = Math.min(100, parseInt(limit as string) || 50);
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const offset = (pageNum - 1) * limitNum;

    const logs = await hrService.getAuditLog(
      entityType as string | undefined,
      entityId as string | undefined,
      limitNum
    );

    res.json(successResponse(logs, {
      page: pageNum,
      limit: limitNum,
    }));
  } catch (error) {
    console.error("Erreur récupération audit RH:", error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

/**
 * ========================================
 * AVANTAGES
 * ========================================
 */

// GET /api/hr/avantages - Liste des avantages disponibles
hrRouter.get("/avantages", getAuthUser, async (req, res) => {
    try {
        const avantagesList = await storage.getAllAvantages();
        res.json(avantagesList);
    } catch (error) {
        console.error("Erreur récupération avantages:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/avantages/employe/:id - Avantages d'un employé
hrRouter.get("/avantages/employe/:id", getAuthUser, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await storage.getAvantagesEmploye(id);
        res.json(result);
    } catch (error) {
        console.error("Erreur récupération avantages employé:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/avantages/assign - Assigner un avantage
hrRouter.post("/avantages/assign", getAuthUser, async (req, res) => {
    try {
        const { employeId, avantageId, montant } = req.body;
        if (!employeId || !avantageId || !montant) {
            return res.status(400).json({ error: "Champs manquants" });
        }

        // Check permissions later
        const result = await storage.assignAvantage({
            employeId,
            avantageId: parseInt(avantageId),
            montant: parseInt(montant),
            statut: StatutUser.ACTIVE,
            dateAttribution: new Date().toISOString().split('T')[0]
        });
        // Broadcast HR Update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'avantage_assigned', employeId } });
        }

        res.status(201).json(result);
    } catch (error) {
        console.error("Erreur assignation avantage:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * PRESENCE
 * ========================================
 */

// GET /api/hr/presence/today - Stats présence aujourd'hui
hrRouter.get("/presence/today", getAuthUser, async (req, res) => {
    try {
        const stats = await storage.getPresenceAujourdhui();
        res.json(stats);
    } catch (error) {
        console.error("Erreur récupération présence:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/checkin - Pointage Arrivée
hrRouter.post("/presence/checkin", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        const result = await storage.checkIn(employe.id);
        res.json(result);
    } catch (error) {
        console.error("Erreur pointage:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/checkout - Pointage Départ
hrRouter.post("/presence/checkout", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        const result = await storage.checkOut(employe.id);
        if (!result) return res.status(404).json({ error: "Aucun pointage d'arrivée trouvé pour aujourd'hui" });

        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId: employe.id } });
        }

        res.json(result);
    } catch (error) {
        console.error("Erreur pointage départ:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/start-break - Début pause
hrRouter.post("/presence/start-break", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        const result = await storage.startBreak(employe.id);
        if (!result) return res.status(404).json({ error: "Aucun pointage d'arrivée trouvé" });

        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId: employe.id } });
        }

        res.json(result);
    } catch (error) {
        console.error("Erreur début pause:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/end-break - Fin pause
hrRouter.post("/presence/end-break", getAuthUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        const result = await storage.endBreak(employe.id);
        if (!result) return res.status(404).json({ error: "Aucune pause en cours" });

        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId: employe.id } });
        }

        res.json(result);
    } catch (error) {
        console.error("Erreur fin pause:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/presence/by-status/:status - Liste employés par statut
hrRouter.get("/presence/by-status/:status", getAuthUser, async (req, res) => {
    try {
        const { status } = req.params;
        const today = new Date().toISOString().split('T')[0];

        const presencesList = await db.select({
            presence: presences,
            user: users
        })
        .from(presences)
        .innerJoin(employes, eq(presences.employeId, employes.id))
        .innerJoin(users, eq(employes.userId, users.id))
        .where(and(
            eq(presences.date, today),
            eq(presences.statut, status)
        ));

        res.json(presencesList.map(p => ({
            ...p.user,
            heureArrivee: p.presence.heureArrivee,
            heureDepart: p.presence.heureDepart,
            heuresTravaillees: p.presence.heuresTravaillees
        })));
    } catch (error) {
        console.error("Erreur récupération employés par statut:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * ORGANIGRAMME
 * ========================================
 */

// GET /api/hr/organigramme - Structure hiérarchique
hrRouter.get("/organigramme", getAuthUser, async (req, res) => {
    try {
        const agenceId = req.user?.agenceId || undefined; // Filter by user's agency
        const orgChart = await storage.getOrganigramme(agenceId);
        res.json(orgChart);
    } catch (error) {
        console.error("Erreur récupération organigramme:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * HORAIRES DE TRAVAIL
 * ========================================
 */

// GET /api/hr/horaires/:employeId - Horaires d'un employé
hrRouter.get("/horaires/:employeId", getAuthUser, async (req, res) => {
    try {
        const { employeId } = req.params;
        const horaires = await db.select().from(horairesTravail)
            .where(and(eq(horairesTravail.employeId, employeId), eq(horairesTravail.actif, true)));
        res.json(horaires);
    } catch (error) {
        console.error("Erreur récupération horaires:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/horaires - Créer un horaire
hrRouter.post("/horaires", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
    try {
        const { employeId, jourSemaine, heureDebut, heureFin, pauseMinutes } = req.body;
        if (!employeId || jourSemaine === undefined || !heureDebut || !heureFin) {
            return res.status(400).json({ error: "Champs manquants" });
        }

        const [horaire] = await db.insert(horairesTravail).values({
            employeId,
            jourSemaine,
            heureDebut,
            heureFin,
            pauseMinutes: pauseMinutes || 60
        }).returning();

        res.status(201).json(horaire);
    } catch (error) {
        console.error("Erreur création horaire:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/horaires/:id - Supprimer un horaire
hrRouter.delete("/horaires/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
    try {
        const { id } = req.params;
        await db.update(horairesTravail)
            .set({ actif: false })
            .where(eq(horairesTravail.id, parseInt(id)));
        res.json({ message: "Horaire supprimé" });
    } catch (error) {
        console.error("Erreur suppression horaire:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});
