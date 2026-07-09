import { Router } from "express";
/**
 * Routes RH — Sanctions disciplinaires : déclaration et gestion.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/sanctions
 *   POST   /api/hr/sanctions
 *   PATCH  /api/hr/sanctions/:id/status
 *   PATCH  /api/hr/sanctions/:id
 *   DELETE /api/hr/sanctions/:id
 */
import { db } from "../../db";
import { sanctions } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { sanctionEscalationService } from "../../services/sanction-escalation-service";
import { getWsInstance } from "../../ws-server";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { SANCTION_WORKFLOW_TRANSITIONS } from "./shared";

export const sanctionsRouter = Router();

/**
 * ========================================
 * SANCTIONS
 * ========================================
 */

// GET /api/hr/sanctions - Liste des sanctions
/**
 * GET /api/hr/sanctions
 */
sanctionsRouter.get("/sanctions", getAuthUser, attachAbility, async (req, res) => {
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
    logger.error({ err: error }, 'Erreur récupération sanctions');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/sanctions - Créer une sanction
/**
 * POST /api/hr/sanctions
 */
sanctionsRouter.post("/sanctions", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
  try {
    const { employeId, employeNom, type, motif, date, gravite } = req.body;
    const userId = req.user?.id;
    const agenceId = req.user?.agenceId;

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

    // Check for escalation rules
    let escalationResult = null;
    try {
      const escalationCheck = await sanctionEscalationService.checkAndApplyEscalation(
        newSanction.id,
        employeId,
        gravite,
        agenceId ?? undefined
      );

      if (escalationCheck.shouldEscalate && escalationCheck.rule) {
        // If auto_apply is true, apply the escalation automatically
        if (escalationCheck.rule.autoApply) {
          escalationResult = await sanctionEscalationService.applyEscalation(
            newSanction.id,
            escalationCheck.rule,
            userId
          );
          logger.info({ sanctionId: newSanction.id, escalation: escalationResult }, 'Sanction auto-escaladée');
        } else {
          // Return escalation warning in response
          escalationResult = {
            warning: true,
            shouldEscalate: true,
            rule: escalationCheck.rule,
            sanctionCount: escalationCheck.sanctionCount,
            message: escalationCheck.message,
          };
        }
      }
    } catch (escErr) {
      logger.error({ err: escErr }, 'Erreur lors de la vérification d\'escalade');
      // Continue without escalation
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'sanction_new', id: newSanction.id } });
    }

    // Domain event: sanction created
    dispatchDomainEvent({
      type: "HR_SANCTION_CREATED",
      data: {
        sanctionId: newSanction.id,
        employeId,
        employeNom: employeNom || "",
        type,
        gravite,
        motif,
        emetteurId: userId,
        agenceId: req.user?.agenceId,
      },
      timestamp: new Date(),
    });

    res.status(201).json({
      ...newSanction,
      escalation: escalationResult,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erreur création sanction');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/sanctions/:id/status - Advance sanctions workflow
// Workflow: DRAFT -> NOTIFIED -> ACKNOWLEDGED -> APPEALED -> FINAL
/**
 * PATCH /api/hr/sanctions/:id/status
 */
sanctionsRouter.patch("/sanctions/:id/status", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
  try {
    const sanctionId = parseInt(req.params.id);
    const { newStatus, appealReason } = req.body;
    const userId = req.user?.id;

    if (!newStatus) {
      return res.status(400).json({ error: "Nouveau statut requis" });
    }

    // Load current sanction
    const [current] = await db.select().from(sanctions).where(eq(sanctions.id, sanctionId));
    if (!current) {
      return res.status(404).json({ error: "Sanction non trouvée" });
    }

    const currentWorkflow = current.statutWorkflow || 'DRAFT';
    const allowedTransitions = SANCTION_WORKFLOW_TRANSITIONS[currentWorkflow] || [];

    if (!allowedTransitions.includes(newStatus)) {
      return res.status(400).json({
        error: `Transition invalide: ${currentWorkflow} → ${newStatus}. Transitions possibles: ${allowedTransitions.join(', ')}`,
      });
    }

    // Build update payload
    const updateData: Record<string, any> = { statutWorkflow: newStatus };

    if (newStatus === 'ACKNOWLEDGED') {
      updateData.acknowledgedAt = new Date();
    } else if (newStatus === 'APPEALED') {
      if (!appealReason?.trim()) {
        return res.status(400).json({ error: "Motif d'appel requis" });
      }
      updateData.appealedAt = new Date();
      updateData.appealReason = appealReason;
    } else if (newStatus === 'FINAL') {
      updateData.finalizedAt = new Date();
      updateData.finalizedBy = userId;
    }

    const [updated] = await db
      .update(sanctions)
      .set(updateData)
      .where(eq(sanctions.id, sanctionId))
      .returning();

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({
        type: "HR_UPDATE",
        payload: { entity: 'sanction', action: 'updated', id: sanctionId },
      });
    }

    // Domain events for key workflow transitions
    if (newStatus === 'NOTIFIED') {
      dispatchDomainEvent({
        type: "HR_SANCTION_NOTIFIED",
        data: {
          sanctionId,
          employeId: current.employeId,
          employeNom: current.employeNom || "",
          type: current.type,
          gravite: current.gravite,
          agenceId: req.user?.agenceId,
        },
        timestamp: new Date(),
      });
    } else if (newStatus === 'FINAL') {
      dispatchDomainEvent({
        type: "HR_SANCTION_FINALIZED",
        data: {
          sanctionId,
          employeId: current.employeId,
          employeNom: current.employeNom || "",
          type: current.type,
          gravite: current.gravite,
          finalizedBy: userId,
          agenceId: req.user?.agenceId,
        },
        timestamp: new Date(),
      });
    }

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour statut sanction');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/sanctions/:id - Edit sanction fields
/**
 * PATCH /api/hr/sanctions/:id
 */
sanctionsRouter.patch("/sanctions/:id", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
  try {
    const sanctionId = parseInt(req.params.id);
    const { type, motif, date, gravite, employeNom } = req.body;

    const updateData: Record<string, any> = {};
    if (type !== undefined) updateData.type = type;
    if (motif !== undefined) updateData.motif = motif;
    if (date !== undefined) updateData.date = date;
    if (gravite !== undefined) updateData.gravite = gravite;
    if (employeNom !== undefined) updateData.employeNom = employeNom;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "Aucun champ à mettre à jour" });
    }

    const [updated] = await db
      .update(sanctions)
      .set(updateData)
      .where(eq(sanctions.id, sanctionId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Sanction non trouvée" });
    }

    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { entity: 'sanction', action: 'updated', id: sanctionId } });
    }

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour sanction');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/sanctions/:id - Delete sanction
/**
 * DELETE /api/hr/sanctions/:id
 */
sanctionsRouter.delete("/sanctions/:id", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
  try {
    const sanctionId = parseInt(req.params.id);

    const [deleted] = await db
      .delete(sanctions)
      .where(eq(sanctions.id, sanctionId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Sanction non trouvée" });
    }

    const wsInstance = getWsInstance();
    if (wsInstance) {
      wsInstance.broadcast({ type: "HR_UPDATE", payload: { entity: 'sanction', action: 'deleted', id: sanctionId } });
    }

    res.json({ message: "Sanction supprimée" });
  } catch (error) {
    logger.error({ err: error }, 'Erreur suppression sanction');
    res.status(500).json({ error: "Erreur serveur" });
  }
});
