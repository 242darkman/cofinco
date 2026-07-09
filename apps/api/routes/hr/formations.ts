import { Router } from "express";
/**
 * Routes RH — Formations : catalogue et participants.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/formations
 *   POST   /api/hr/formations
 *   GET    /api/hr/formations/:id/participants
 *   POST   /api/hr/formations/:id/participants
 *   DELETE /api/hr/formations/:id/participants/:employeId
 *   PATCH  /api/hr/formations/:id
 *   DELETE /api/hr/formations/:id
 */
import { db } from "../../db";
import { formations, formationParticipants } from "@shared/schema";
import { agentsTerrain, agentPlannings } from "@shared/schema";
import { StatutCandidature, StatutConge, StatutUser, StatutVisiteTerrain, StatutArchive } from "@shared/enum/status-constants";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getWsInstance } from "../../ws-server";
import { logger, broadcastHrEvent, successResponse, errorResponse } from "./shared";

export const formationsRouter = Router();

/**
 * ========================================
 * FORMATIONS
 * ========================================
 */

// GET /api/hr/formations - Liste des formations avec nombre de participants (FIX N+1)
/**
 * GET /api/hr/formations
 */
formationsRouter.get("/formations", getAuthUser, attachAbility, async (req, res) => {
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

    // Apply filters (exclude soft-deleted + optional status)
    const conditions = [sql`${formations.deletedAt} IS NULL`];
    if (statut) conditions.push(eq(formations.statut, statut as string));
    const result = await baseQuery.where(and(...conditions));

    // Get total count for pagination
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(formations)
      .where(and(...conditions));

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
    logger.error({ err: error }, 'Erreur récupération formations');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

// POST /api/hr/formations - Créer une formation
/**
 * POST /api/hr/formations
 */
formationsRouter.post("/formations", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
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
    logger.error({ err: error }, 'Erreur création formation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/formations/:id/participants - Participants d'une formation
/**
 * GET /api/hr/formations/:id/participants
 */
formationsRouter.get("/formations/:id/participants", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { id } = req.params;

    const participants = await db.select()
      .from(formationParticipants)
      .where(eq(formationParticipants.formationId, parseInt(id)));

    res.json(participants);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération participants');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/formations/:id/participants - Ajouter un participant
/**
 * POST /api/hr/formations/:id/participants
 */
formationsRouter.post("/formations/:id/participants", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
  try {
    const { id } = req.params;
    const { employeId, employeNom } = req.body;

    if (!employeId || !employeNom) {
      return res.status(400).json({ error: "employeId et employeNom requis" });
    }

    const formationId = parseInt(id);
    await db.insert(formationParticipants).values({
      formationId,
      employeId,
      employeNom
    });

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'formation_participant_added', formationId: id } });
    }

    // Cross-broadcast to agent + add to agent planning
    try {
      const [agentRow] = await db.select({ id: agentsTerrain.id, agenceId: agentsTerrain.currentAgenceId })
        .from(agentsTerrain).where(eq(agentsTerrain.employeId, employeId));
      if (agentRow && wsInstance) {
        wsInstance.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agentRow.id } });

        // Add formation to agent's planning/agenda
        const [formation] = await db.select({
          titre: formations.titre,
          dateDebut: formations.dateDebut,
          dateFin: formations.dateFin,
          dureeHeures: formations.dureeHeures,
          lieu: formations.lieu,
        }).from(formations).where(eq(formations.id, formationId));

        if (formation?.dateDebut) {
          const startDate = new Date(formation.dateDebut);
          const endDate = formation.dateFin ? new Date(formation.dateFin) : startDate;
          // Create a planning entry for each day of the formation
          const planningDays: Date[] = [];
          for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            planningDays.push(new Date(d));
          }
          for (const day of planningDays) {
            const datePlanning = day.toISOString().slice(0, 10);
            await db.insert(agentPlannings).values({
              agentId: agentRow.id,
              agenceId: agentRow.agenceId,
              datePlanning,
              heureDebut: "08:00",
              heureFin: formation.dureeHeures && formation.dureeHeures <= 4 ? "12:00" : "17:00",
              typeActivite: "Formation",
              notes: `Formation : ${formation.titre}${formation.lieu ? ` — ${formation.lieu}` : ""}`,
              statut: "PLANNED",
            });
          }
          wsInstance.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "planning", agentId: agentRow.id } });
        }
      }
    } catch (crossErr) {
      logger.warn({ err: crossErr }, "Cross-broadcast formation→agent failed (non-critical)");
    }

    res.status(201).json({ message: "Participant ajouté" });
  } catch (error) {
    logger.error({ err: error }, 'Erreur ajout participant');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/formations/:id/participants/:employeId - Retirer un participant
/**
 * DELETE /api/hr/formations/:id/participants/:employeId
 */
formationsRouter.delete("/formations/:id/participants/:employeId", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
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
    logger.error({ err: error }, 'Erreur retrait participant');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/formations/:id - Mettre à jour formation (tous champs)
/**
 * PATCH /api/hr/formations/:id
 */
formationsRouter.patch("/formations/:id", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, titre, formateur, dateDebut, dateFin, duree, lieu, description, programme, capaciteMax } = req.body;

    // Build update set dynamically
    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (statut !== undefined) {
      const validStatuts = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
      if (!validStatuts.includes(statut)) {
        return res.status(400).json({ error: "Statut invalide" });
      }
      updateData.statut = statut;
    }
    if (titre !== undefined) updateData.titre = titre;
    if (formateur !== undefined) updateData.formateur = formateur;
    if (dateDebut !== undefined) updateData.dateDebut = dateDebut;
    if (dateFin !== undefined) updateData.dateFin = dateFin;
    if (duree !== undefined) updateData.duree = duree;
    if (lieu !== undefined) updateData.lieu = lieu;
    if (description !== undefined) updateData.description = description;
    if (programme !== undefined) updateData.programme = programme;
    if (capaciteMax !== undefined) updateData.capaciteMax = capaciteMax;

    const [updated] = await db.update(formations)
      .set(updateData)
      .where(eq(formations.id, parseInt(id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Formation non trouvée" });
    }

    broadcastHrEvent({ entity: 'formation', action: 'updated', id: updated.id });
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Erreur mise à jour formation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/hr/formations/:id - Supprimer formation (soft delete)
/**
 * DELETE /api/hr/formations/:id
 */
formationsRouter.delete("/formations/:id", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(formations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(formations.id, parseInt(id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Formation non trouvée" });
    }

    broadcastHrEvent({ entity: 'formation', action: 'deleted', id: updated.id });
    res.json({ message: "Formation supprimée" });
  } catch (error) {
    logger.error({ err: error }, 'Erreur suppression formation');
    res.status(500).json({ error: "Erreur serveur" });
  }
});
