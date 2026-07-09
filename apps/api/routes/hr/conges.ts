import { Router } from "express";
/**
 * Routes RH — Congés : demandes, soldes et vue équipe.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/conges
 *   POST   /api/hr/conges
 *   PATCH  /api/hr/conges/:id/approve
 */
import { db } from "../../db";
import { demandesConges, employes, LeaveStatus } from "@shared/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { storage } from "../../storage";
import { hrService } from "../../services/hr-service";
import { users } from "@shared/schema";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { logger, broadcastHrUpdate, successResponse, errorResponse } from "./shared";

export const congesRouter = Router();

/**
 * ========================================
 * DEMANDES DE CONGÉS
 * ========================================
 */

// GET /api/hr/conges - Liste des demandes de congés
/**
 * GET /api/hr/conges
 */
congesRouter.get("/conges", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { statut, employeId, dateDebut, dateFin } = req.query;

    let query = db.select().from(demandesConges);

    const conditions = [];
    if (statut) conditions.push(eq(demandesConges.statut, statut as string));
    if (employeId) conditions.push(eq(demandesConges.employeId, employeId as string));

    // CASL scope: users without VIEW on RH can only see their own requests
    const canViewAll = req.ability?.can(Actions.VIEW, Subjects.RH)
      || req.ability?.can(Actions.MANAGE, Subjects.RH) || false;

    if (!canViewAll) {
        const employe = await storage.getEmployeByUserId(req.user!.id);
        if (employe) {
            conditions.push(eq(demandesConges.employeId, employe.id));
        } else {
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
    logger.error({ err: error }, 'Erreur récupération congés');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/conges - Créer une demande de congé
/**
 * POST /api/hr/conges
 */
congesRouter.post("/conges", getAuthUser, attachAbility, async (req, res) => {
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

    // Workflow: users with MANAGE permission on RH auto-approve their own requests
    const canManageRH = req.ability?.can(Actions.MANAGE, Subjects.RH) || false;
    const initialStatus = canManageRH ? LeaveStatus.APPROVED : LeaveStatus.PENDING;
    const approuvePar = canManageRH ? req.user?.id : null;
    const dateDecision = canManageRH ? new Date() : null;

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
      // Reconcile: create 'Congé' presence entries
      await hrService.createLeavePresenceEntries(newConge.id);
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
    logger.error({ err: error }, 'Erreur création congé');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// PATCH /api/hr/conges/:id/approve - Approuver une demande
/**
 * PATCH /api/hr/conges/:id/approve
 */
congesRouter.patch("/conges/:id/approve", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { id } = req.params;
    const { commentaire } = req.body;
    const userId = req.user?.id;

    // CASL permission check — respects role permissions, user overrides, and temporary permissions
    let isAuthorized = req.ability?.can(Actions.APPROVE, Subjects.CONGE)
      || req.ability?.can(Actions.APPROVE, Subjects.RH)
      || req.ability?.can(Actions.MANAGE, Subjects.RH) || false;

    // Get current state for audit
    const [currentConge] = await db.select().from(demandesConges).where(eq(demandesConges.id, parseInt(id)));
    if (!currentConge) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Demande non trouvée'));
    }

    // Block self-approval
    const selfEmploye = await storage.getEmployeByUserId(userId!);
    if (selfEmploye && currentConge.employeId === selfEmploye.id) {
      return res.status(403).json(errorResponse('FORBIDDEN', 'Vous ne pouvez pas approuver votre propre demande'));
    }

    // Check if already processed
    if (currentConge.statut !== LeaveStatus.PENDING) {
      return res.status(400).json(errorResponse(
        'INVALID_STATUS',
        `Cette demande a déjà été ${currentConge.statut === LeaveStatus.APPROVED ? 'approuvée' : 'traitée'}`
      ));
    }

    // Manager hierarchy check: direct manager can approve their subordinate's leave
    if (!isAuthorized && selfEmploye) {
      const [targetEmploye] = await db.select({ managerId: employes.managerId })
        .from(employes).where(eq(employes.id, currentConge.employeId));
      if (targetEmploye?.managerId === selfEmploye.id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json(errorResponse('FORBIDDEN', 'Non autorisé à approuver'));
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
    // Reconcile: create 'Congé' presence entries
    await hrService.createLeavePresenceEntries(updated.id);

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
    logger.error({ err: error }, 'Erreur approbation congé');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});
