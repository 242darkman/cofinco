import { Router } from "express";
/**
 * Routes RH — Congés : circuit d'approbation et de refus des demandes.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   PATCH  /api/hr/conges/:id/reject
 *   GET    /api/hr/conges/team
 *   GET    /api/hr/conges/team/count
 *   GET    /api/hr/conges/balance/:employeId
 */
import { db } from "../../db";
import { demandesConges, employes, LeaveStatus } from "@shared/schema";
import { eq, desc, and, gte, lte, sql, count, inArray } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { storage } from "../../storage";
import { hrService } from "../../services/hr-service";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { broadcastHrUpdate, successResponse, errorResponse } from "./shared";

export const congesValidationRouter = Router();

// PATCH /api/hr/conges/:id/reject - Refuser une demande
/**
 * PATCH /api/hr/conges/:id/reject
 */
congesValidationRouter.patch("/conges/:id/reject", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { id } = req.params;
    const { commentaire } = req.body;
    const userId = req.user?.id;

    // Commentaire obligatoire pour un rejet
    if (!commentaire || commentaire.trim().length === 0) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Un commentaire est obligatoire pour rejeter une demande'));
    }

    // CASL permission check — respects role permissions, user overrides, and temporary permissions
    let isAuthorizedReject = req.ability?.can(Actions.APPROVE, Subjects.CONGE)
      || req.ability?.can(Actions.APPROVE, Subjects.RH)
      || req.ability?.can(Actions.MANAGE, Subjects.RH) || false;

    // Get current state for audit
    const [currentConge] = await db.select().from(demandesConges).where(eq(demandesConges.id, parseInt(id)));
    if (!currentConge) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Demande non trouvée'));
    }

    // Block self-rejection
    const selfEmployeReject = await storage.getEmployeByUserId(userId!);
    if (selfEmployeReject && currentConge.employeId === selfEmployeReject.id) {
      return res.status(403).json(errorResponse('FORBIDDEN', 'Vous ne pouvez pas refuser votre propre demande'));
    }

    // Check if already processed
    if (currentConge.statut !== LeaveStatus.PENDING) {
      return res.status(400).json(errorResponse(
        'INVALID_STATUS',
        `Cette demande a déjà été ${currentConge.statut === LeaveStatus.REJECTED ? 'rejetée' : 'traitée'}`
      ));
    }

    // Manager hierarchy check: direct manager can reject their subordinate's leave
    if (!isAuthorizedReject && selfEmployeReject) {
      const [targetEmploye] = await db.select({ managerId: employes.managerId })
        .from(employes).where(eq(employes.id, currentConge.employeId));
      if (targetEmploye?.managerId === selfEmployeReject.id) {
        isAuthorizedReject = true;
      }
    }

    if (!isAuthorizedReject) {
      return res.status(403).json(errorResponse('FORBIDDEN', 'Non autorisé à refuser'));
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
    logger.error({ err: error }, 'Erreur rejet congé');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// GET /api/hr/conges/team - Congés PENDING des subordonnés directs du manager connecté
// NOTE: Must be declared BEFORE /conges/balance/:employeId to avoid "team" matching as :employeId
/**
 * GET /api/hr/conges/team
 */
congesValidationRouter.get("/conges/team", getAuthUser, attachAbility, async (req, res) => {
  try {
    const employe = await storage.getEmployeByUserId(req.user!.id);
    if (!employe) return res.json([]);

    // CASL permission: can this user approve leaves (even without subordinates)?
    const hasApprovePermission = req.ability?.can(Actions.APPROVE, Subjects.CONGE)
      || req.ability?.can(Actions.APPROVE, Subjects.RH)
      || req.ability?.can(Actions.MANAGE, Subjects.RH) || false;

    const subordinateIds = await db.select({ id: employes.id })
      .from(employes)
      .where(and(eq(employes.managerId, employe.id), eq(employes.statut, 'ACTIVE')));

    // If no subordinates and no CASL approve permission, nothing to show
    if (subordinateIds.length === 0 && !hasApprovePermission) return res.json([]);

    if (subordinateIds.length === 0) {
      // Has permission but no direct subordinates — return empty (they use the HR CongesManager instead)
      return res.json([]);
    }

    const ids = subordinateIds.map(s => s.id);
    const result = await db.select().from(demandesConges)
      .where(and(
        inArray(demandesConges.employeId, ids),
        eq(demandesConges.statut, 'PENDING')
      ))
      .orderBy(desc(demandesConges.createdAt));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération congés équipe');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// GET /api/hr/conges/team/count - Nombre de congés PENDING dans l'équipe du manager
/**
 * GET /api/hr/conges/team/count
 */
congesValidationRouter.get("/conges/team/count", getAuthUser, attachAbility, async (req, res) => {
  try {
    const employe = await storage.getEmployeByUserId(req.user!.id);
    if (!employe) return res.json({ pending: 0, isManager: false, canApprove: false });

    // CASL permission check
    const canApprove = req.ability?.can(Actions.APPROVE, Subjects.CONGE)
      || req.ability?.can(Actions.APPROVE, Subjects.RH)
      || req.ability?.can(Actions.MANAGE, Subjects.RH) || false;

    const subordinateIds = await db.select({ id: employes.id })
      .from(employes)
      .where(and(eq(employes.managerId, employe.id), eq(employes.statut, 'ACTIVE')));

    const hasSubordinates = subordinateIds.length > 0;

    if (!hasSubordinates) return res.json({ pending: 0, isManager: false, canApprove });

    const [result] = await db.select({ count: count() }).from(demandesConges)
      .where(and(
        inArray(demandesConges.employeId, subordinateIds.map(s => s.id)),
        eq(demandesConges.statut, 'PENDING')
      ));

    res.json({ pending: result?.count ?? 0, isManager: true, canApprove });
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération count congés équipe');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// GET /api/hr/conges/balance/:employeId - Solde congés d'un employé
/**
 * GET /api/hr/conges/balance/:employeId
 */
congesValidationRouter.get("/conges/balance/:employeId", getAuthUser, attachAbility, async (req, res) => {
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

    // Per-type breakdown for the year
    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;
    const byTypeRows = await db
      .select({
        type: demandesConges.type,
        statut: demandesConges.statut,
        total: count(),
        jours: sql<string>`COALESCE(SUM(
          EXTRACT(DAY FROM (${demandesConges.dateFin}::date - ${demandesConges.dateDebut}::date + 1))
        ), 0)`,
      })
      .from(demandesConges)
      .where(and(
        eq(demandesConges.employeId, employeId),
        gte(demandesConges.dateDebut, yearStart),
        lte(demandesConges.dateDebut, yearEnd),
      ))
      .groupBy(demandesConges.type, demandesConges.statut);

    // Pivot: group by type with approved/pending counts
    const byTypeMap: Record<string, { approved: number; pending: number; joursApproved: number; joursPending: number }> = {};
    for (const row of byTypeRows) {
      if (!byTypeMap[row.type]) byTypeMap[row.type] = { approved: 0, pending: 0, joursApproved: 0, joursPending: 0 };
      const jours = parseFloat(row.jours);
      if (row.statut === 'APPROVED') {
        byTypeMap[row.type].approved = row.total;
        byTypeMap[row.type].joursApproved = jours;
      } else if (row.statut === 'PENDING') {
        byTypeMap[row.type].pending = row.total;
        byTypeMap[row.type].joursPending = jours;
      }
    }

    const byType = Object.entries(byTypeMap).map(([type, data]) => ({ type, ...data }));

    res.json(successResponse({
      employeId,
      year: targetYear,
      balance: currentYearBalance,
      available,
      allBalances: balances,
      byType,
    }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération solde congés');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});
