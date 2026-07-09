import { Router } from "express";
/**
 * Routes RH — Formations : évaluation des participants, certificats et conformité.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   PATCH  /api/hr/formations/:id/participants/:employeId/evaluate
 *   GET    /api/hr/formations/:id/certificates
 *   POST   /api/hr/formations/:id/certificates
 *   POST   /api/hr/formations/:id/certificates/batch
 */
import { db } from "../../db";
import { formations, formationParticipants, formationCertificates } from "@shared/schema";
import { agentsTerrain, agentPlannings } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getWsInstance } from "../../ws-server";
import { logger, broadcastHrUpdate } from "./shared";

export const formationsSuiviRouter = Router();

// ============================================
// FORMATION EVALUATIONS & CERTIFICATES
// ============================================

// PATCH /api/hr/formations/:id/participants/:employeId/evaluate - Evaluate a participant
/**
 * PATCH /api/hr/formations/:id/participants/:employeId/evaluate
 */
formationsSuiviRouter.patch("/formations/:id/participants/:employeId/evaluate", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const formationId = parseInt(req.params.id);
        const { employeId } = req.params;
        const userId = req.user?.id;
        const { scoreEvaluation, evaluation, competencesAcquises, recommandation } = req.body;

        if (scoreEvaluation != null && (scoreEvaluation < 0 || scoreEvaluation > 100)) {
            return res.status(400).json({ error: "Le score doit être entre 0 et 100" });
        }

        const updates: Record<string, any> = { evaluatedAt: new Date(), evaluateurId: userId };
        if (scoreEvaluation != null) updates.scoreEvaluation = scoreEvaluation;
        if (evaluation != null) updates.evaluation = evaluation;
        if (competencesAcquises != null) updates.competencesAcquises = typeof competencesAcquises === 'string' ? competencesAcquises : JSON.stringify(competencesAcquises);
        if (recommandation) updates.recommandation = recommandation;

        const [updated] = await db.update(formationParticipants)
            .set(updates)
            .where(and(
                eq(formationParticipants.formationId, formationId),
                eq(formationParticipants.employeId, employeId)
            ))
            .returning();

        if (!updated) return res.status(404).json({ error: "Participant non trouvé" });

        // Cross-broadcast to agent
        try {
          const [agentRow] = await db.select({ id: agentsTerrain.id })
            .from(agentsTerrain).where(eq(agentsTerrain.employeId, employeId));
          if (agentRow) {
            const wsInstance = getWsInstance();
            if (wsInstance) {
              wsInstance.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agentRow.id } });
            }
          }
        } catch { /* non-critical */ }

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur évaluation participant');
        res.status(500).json({ error: "Erreur lors de l'évaluation" });
    }
});

// GET /api/hr/formations/:id/certificates - List certificates for a formation
/**
 * GET /api/hr/formations/:id/certificates
 */
formationsSuiviRouter.get("/formations/:id/certificates", getAuthUser, attachAbility, async (req, res) => {
    try {
        const formationId = parseInt(req.params.id);
        const certs = await db.select()
            .from(formationCertificates)
            .where(eq(formationCertificates.formationId, formationId))
            .orderBy(desc(formationCertificates.createdAt));
        res.json(certs);
    } catch (error) {
        logger.error({ err: error }, 'Erreur chargement certificats');
        res.status(500).json({ error: "Erreur lors du chargement des certificats" });
    }
});

// POST /api/hr/formations/:id/certificates - Issue a certificate
/**
 * POST /api/hr/formations/:id/certificates
 */
formationsSuiviRouter.post("/formations/:id/certificates", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const formationId = parseInt(req.params.id);
        const userId = req.user?.id;
        const { employeId, employeNom, competences, dateExpiration } = req.body;

        if (!employeId || !employeNom) {
            return res.status(400).json({ error: "employeId et employeNom sont requis" });
        }

        // Get formation title
        const [formation] = await db.select({ titre: formations.titre }).from(formations).where(eq(formations.id, formationId));
        if (!formation) return res.status(404).json({ error: "Formation non trouvée" });

        // Generate unique certificate number: CERT-YYYY-NNNNNN
        const year = new Date().getFullYear();
        const { randomBytes } = require('crypto');
        const random = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
        const numeroCertificat = `CERT-${year}-${random}`;

        const [cert] = await db.insert(formationCertificates).values({
            formationId,
            employeId,
            employeNom,
            numeroCertificat,
            titre: formation.titre,
            competences: competences || null,
            dateExpiration: dateExpiration || null,
            emisPar: userId || null,
        }).returning();

        broadcastHrUpdate({ entity: 'formation', action: 'updated', id: formationId });

        // Cross-broadcast to agent
        try {
          const [agentRow] = await db.select({ id: agentsTerrain.id })
            .from(agentsTerrain).where(eq(agentsTerrain.employeId, employeId));
          if (agentRow) {
            const wsInstance = getWsInstance();
            if (wsInstance) {
              wsInstance.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agentRow.id } });
            }
          }
        } catch { /* non-critical */ }

        res.status(201).json(cert);
    } catch (error: any) {
        if (error.code === '23505') {
            return res.status(409).json({ error: "Un certificat existe déjà pour ce participant dans cette formation" });
        }
        logger.error({ err: error }, 'Erreur émission certificat');
        res.status(500).json({ error: "Erreur lors de l'émission du certificat" });
    }
});

// POST /api/hr/formations/:id/certificates/batch - Issue certificates for all eligible participants
/**
 * POST /api/hr/formations/:id/certificates/batch
 */
formationsSuiviRouter.post("/formations/:id/certificates/batch", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const formationId = parseInt(req.params.id);
        const userId = req.user?.id;
        const { competences, dateExpiration } = req.body;

        // Get formation
        const [formation] = await db.select().from(formations).where(eq(formations.id, formationId));
        if (!formation) return res.status(404).json({ error: "Formation non trouvée" });
        if (formation.statut !== 'COMPLETED') {
            return res.status(400).json({ error: "La formation doit être terminée avant d'émettre des certificats" });
        }

        // Get participants marked present with no existing certificate
        const participants = await db.select()
            .from(formationParticipants)
            .where(and(
                eq(formationParticipants.formationId, formationId),
                eq(formationParticipants.presence, 'Présent')
            ));

        const existingCerts = await db.select({ employeId: formationCertificates.employeId })
            .from(formationCertificates)
            .where(eq(formationCertificates.formationId, formationId));
        const certifiedIds = new Set(existingCerts.map(c => c.employeId));

        const eligible = participants.filter(p => !certifiedIds.has(p.employeId));
        if (eligible.length === 0) {
            return res.json({ issued: 0, message: "Aucun participant éligible" });
        }

        const year = new Date().getFullYear();
        const certs = await db.insert(formationCertificates).values(
            eligible.map(p => ({
                formationId,
                employeId: p.employeId,
                employeNom: p.employeNom,
                numeroCertificat: `CERT-${year}-${require('crypto').randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`,
                titre: formation.titre,
                competences: competences || null,
                dateExpiration: dateExpiration || null,
                emisPar: userId || null,
            }))
        ).returning();

        broadcastHrUpdate({ entity: 'formation', action: 'updated', id: formationId });

        // Cross-broadcast to all agents who received certificates
        try {
          const employeeIds = certs.map(c => c.employeId);
          const agents = await db.select({ id: agentsTerrain.id, employeId: agentsTerrain.employeId })
            .from(agentsTerrain).where(sql`${agentsTerrain.employeId} IN ${employeeIds}`);
          const wsInstance = getWsInstance();
          if (wsInstance && agents.length > 0) {
            for (const agent of agents) {
              wsInstance.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agent.id } });
            }
          }
        } catch { /* non-critical */ }

        res.status(201).json({ issued: certs.length, certificates: certs });
    } catch (error) {
        logger.error({ err: error }, 'Erreur émission batch certificats');
        res.status(500).json({ error: "Erreur lors de l'émission des certificats" });
    }
});
