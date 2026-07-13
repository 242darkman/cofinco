import {
  agentsTerrain,
  employes,
  formationCertificates,
  formationParticipants,
  formations,
  users
} from "@shared/schema";
import { and, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { logAudit } from "../../audit";
import { requireAuth } from "../../auth";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { getWsInstance } from "../../ws-server";

const logger = createLogger("Routes:AgentModules");

export function registerAgentFormationsRoutes(app: Express) {
  // ════════════════════════════════════════════════════════════════════════════
  // FORMATIONS CATALOGUE (Source: HR Module — read-only for agents)

  app.get("/api/agent-formations", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: formations.id,
          titre: formations.titre,
          description: formations.description,
          typeFormation: formations.typeFormation,
          dureeHeures: formations.dureeHeures,
          contenuUrl: formations.contenuUrl,
          obligatoire: formations.obligatoire,
          statut: formations.statut,
          formateur: formations.formateur,
          dateDebut: formations.dateDebut,
          dateFin: formations.dateFin,
          lieu: formations.lieu,
          programme: formations.programme,
          capaciteMax: formations.capaciteMax,
          createdAt: formations.createdAt,
          participants: sql<number>`coalesce(count(${formationParticipants.id}), 0)::int`,
        })
        .from(formations)
        .leftJoin(formationParticipants, eq(formations.id, formationParticipants.formationId))
        .where(and(
          isNull(formations.deletedAt),
          ne(formations.statut, "CANCELLED"),
        ))
        .groupBy(formations.id)
        .orderBy(desc(formations.dateDebut));

      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // FORMATIONS SUIVI (Enrollment + Progression + Evaluation + Certificates)

  app.get("/api/agent-formations-suivi", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id } = req.query;

      const rows = await db.select({
        // Noyau de participation
        id: formationParticipants.id,
        agentId: agentsTerrain.id,
        formationId: formationParticipants.formationId,
        dateDebut: formationParticipants.dateDebut,
        dateFin: formationParticipants.dateFin,
        progression: formationParticipants.progression,
        statut: formationParticipants.statut,
        presence: formationParticipants.presence,
        createdAt: formationParticipants.dateInscription,
        // Évaluation des RH
        scoreEvaluation: formationParticipants.scoreEvaluation,
        evaluation: formationParticipants.evaluation,
        competencesAcquises: formationParticipants.competencesAcquises,
        recommandation: formationParticipants.recommandation,
        evaluatedAt: formationParticipants.evaluatedAt,
        // Détails de la formation
        formationTitre: formations.titre,
        formationDescription: formations.description,
        formationType: formations.typeFormation,
        formationDuree: formations.dureeHeures,
        formationObligatoire: formations.obligatoire,
        formationContenuUrl: formations.contenuUrl,
        formationStatut: formations.statut,
        formationDateFin: formations.dateFin,
        // Certificat (LEFT JOIN — peut être nul)
        certificateId: formationCertificates.id,
        certificateNumero: formationCertificates.numeroCertificat,
        certificateStatut: formationCertificates.statut,
        certificateFichierUrl: formationCertificates.fichierUrl,
        certificateDateExpiration: formationCertificates.dateExpiration,
      })
      .from(formationParticipants)
      .leftJoin(formations, eq(formationParticipants.formationId, formations.id))
      .leftJoin(agentsTerrain, eq(formationParticipants.employeId, agentsTerrain.employeId))
      .leftJoin(formationCertificates, and(
        eq(formationCertificates.formationId, formationParticipants.formationId),
        eq(formationCertificates.employeId, formationParticipants.employeId),
      ))
      .where(agent_id && typeof agent_id === "string" ? eq(agentsTerrain.id, agent_id) : sql`true`)
      .orderBy(desc(formationParticipants.dateInscription));

      const formatted = rows.map(r => ({
        id: r.id,
        agentId: r.agentId,
        formationId: r.formationId,
        dateDebut: r.dateDebut,
        dateFin: r.dateFin,
        progression: r.progression,
        statut: r.statut,
        presence: r.presence,
        createdAt: r.createdAt,
        // Evaluation
        scoreEvaluation: r.scoreEvaluation,
        evaluation: r.evaluation,
        competencesAcquises: r.competencesAcquises,
        recommandation: r.recommandation,
        evaluatedAt: r.evaluatedAt,
        // Formation
        formation: r.formationTitre ? {
          id: r.formationId,
          titre: r.formationTitre,
          description: r.formationDescription,
          typeFormation: r.formationType,
          dureeHeures: r.formationDuree,
          contenuUrl: r.formationContenuUrl,
          obligatoire: r.formationObligatoire,
          statut: r.formationStatut,
          dateFin: r.formationDateFin,
        } : undefined,
        // Certificate
        certificate: r.certificateId ? {
          id: r.certificateId,
          numero: r.certificateNumero,
          statut: r.certificateStatut,
          fichierUrl: r.certificateFichierUrl,
          dateExpiration: r.certificateDateExpiration,
        } : null,
      }));

      res.json(formatted);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/agent-formations-suivi", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id, formation_id, date_debut, progression, statut } = req.body;

      if (!agent_id || !formation_id) {
        return res.status(400).json({ error: "Agent ID et Formation ID requis" });
      }

      // Résoudre l'ID de l'employé
      const [agent] = await db.select().from(agentsTerrain).where(eq(agentsTerrain.id, agent_id));
      if (!agent || !agent.employeId) {
        return res.status(404).json({ error: "Agent ou Employé non trouvé" });
      }

      // Vérifier la capacité
      const formId = Number(formation_id);
      const [formation] = await db.select({ capaciteMax: formations.capaciteMax })
        .from(formations).where(eq(formations.id, formId));
      if (formation?.capaciteMax) {
        const [{ count: enrolled }] = await db.select({ count: sql<number>`count(*)::int` })
          .from(formationParticipants).where(eq(formationParticipants.formationId, formId));
        if (enrolled >= formation.capaciteMax) {
          return res.status(400).json({ error: "Formation complète — capacité maximale atteinte" });
        }
      }

      // Obtenir le nom de l'employé
      const [userData] = await db
        .select({ nom: users.nom, prenom: users.prenom })
        .from(employes)
        .innerJoin(users, eq(employes.userId, users.id))
        .where(eq(employes.id, agent.employeId));

      const employeNom = userData ? `${userData.nom} ${userData.prenom}` : "Inconnu";

      const [row] = await db.insert(formationParticipants).values({
        formationId: formId,
        employeId: agent.employeId,
        employeNom,
        dateDebut: date_debut ? new Date(date_debut) : undefined,
        progression: progression || 0,
        statut: statut || "IN_PROGRESS",
        presence: "Non noté",
      }).returning();

      logAudit(req, "CREATE", "agent_formation_suivi_hr", row.id, { agentId: agent_id, formationId: formation_id });

      // Diffusion croisée : RH + Agent
      const ws = getWsInstance();
      if (ws) {
        ws.broadcast({ type: "HR_UPDATE", payload: { entity: "formation", action: "updated", id: formId, timestamp: new Date().toISOString() } });
        ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agent_id } });
      }

      res.status(201).json(row);
    } catch (error: any) {
      logger.error("Error creating formation suivi:", error);
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  app.patch("/api/agent-formations-suivi/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const updateData: any = {};
      if (updates.progression !== undefined) updateData.progression = updates.progression;
      if (updates.statut !== undefined) updateData.statut = updates.statut;
      if (updates.score !== undefined) updateData.scoreEvaluation = updates.score;
      if (updates.date_fin !== undefined) updateData.dateFin = updates.date_fin ? new Date(updates.date_fin) : null;

      const [row] = await db.update(formationParticipants)
        .set(updateData)
        .where(eq(formationParticipants.id, id))
        .returning();

      if (!row) return res.status(404).json({ error: "Suivi non trouvé" });

      logAudit(req, "UPDATE", "agent_formation_suivi_hr", id, updates);

      // Diffusion croisée : RH + Agent
      const ws = getWsInstance();
      if (ws) {
        ws.broadcast({ type: "HR_UPDATE", payload: { entity: "formation", action: "updated", id: row.formationId, timestamp: new Date().toISOString() } });
        // Résoudre l'ID de l'agent à partir de l'ID de l'employé
        const [agentRow] = await db.select({ id: agentsTerrain.id })
          .from(agentsTerrain).where(eq(agentsTerrain.employeId, row.employeId));
        if (agentRow) {
          ws.broadcast({ type: "AGENT_MODULES_UPDATE", payload: { entity: "formation", agentId: agentRow.id } });
        }
      }

      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });

  // FORMATIONS COMPLIANCE (Suivi de la formation obligatoire)

  app.get("/api/agent-formations-compliance", requireAuth, async (req: Request, res: Response) => {
    try {
      const { agent_id } = req.query;
      if (!agent_id || typeof agent_id !== "string") {
        return res.status(400).json({ error: "agent_id requis" });
      }

      // Resolve employeId
      const [agent] = await db.select({ employeId: agentsTerrain.employeId })
        .from(agentsTerrain).where(eq(agentsTerrain.id, agent_id));
      if (!agent?.employeId) {
        return res.json({ mandatoryNotEnrolled: [], overdue: [], expiringCertificates: [], complianceScore: 100 });
      }

      const now = new Date();
      const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      // 1. All active mandatory formations
      const mandatoryFormations = await db.select({
        id: formations.id,
        titre: formations.titre,
        dateDebut: formations.dateDebut,
        dateFin: formations.dateFin,
        statut: formations.statut,
      })
      .from(formations)
      .where(and(
        isNull(formations.deletedAt),
        eq(formations.obligatoire, true),
        ne(formations.statut, "CANCELLED"),
      ));

      // 2. Agent's enrollments
      const enrollments = await db.select({
        formationId: formationParticipants.formationId,
        statut: formationParticipants.statut,
        progression: formationParticipants.progression,
      })
      .from(formationParticipants)
      .where(eq(formationParticipants.employeId, agent.employeId));

      const enrolledMap = new Map(enrollments.map(e => [e.formationId, e]));

      // Mandatory not enrolled
      const mandatoryNotEnrolled = mandatoryFormations
        .filter(f => !enrolledMap.has(f.id))
        .map(f => ({ id: f.id, titre: f.titre, dateDebut: f.dateDebut, dateFin: f.dateFin }));

      // Overdue: enrolled but not completed and past dateFin
      const overdue = mandatoryFormations
        .filter(f => {
          const enrollment = enrolledMap.get(f.id);
          return enrollment && enrollment.statut !== "COMPLETED" && f.dateFin && new Date(f.dateFin) < now;
        })
        .map(f => ({
          id: f.id,
          titre: f.titre,
          dateFin: f.dateFin,
          progression: enrolledMap.get(f.id)?.progression || 0,
        }));

      // 3. Expiring certificates (within 90 days)
      const expiringCertificates = await db.select({
        id: formationCertificates.id,
        titre: formationCertificates.titre,
        numero: formationCertificates.numeroCertificat,
        dateExpiration: formationCertificates.dateExpiration,
      })
      .from(formationCertificates)
      .where(and(
        eq(formationCertificates.employeId, agent.employeId),
        eq(formationCertificates.statut, "ISSUED"),
        sql`${formationCertificates.dateExpiration} IS NOT NULL`,
        lte(formationCertificates.dateExpiration, in90Days.toISOString()),
        gte(formationCertificates.dateExpiration, now.toISOString()),
      ));

      // Compliance score: % of mandatory formations completed
      const totalMandatory = mandatoryFormations.length;
      const completedMandatory = mandatoryFormations.filter(f => {
        const e = enrolledMap.get(f.id);
        return e && e.statut === "COMPLETED";
      }).length;
      const complianceScore = totalMandatory > 0 ? Math.round((completedMandatory / totalMandatory) * 100) : 100;

      res.json({ mandatoryNotEnrolled, overdue, expiringCertificates, complianceScore });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erreur serveur" });
    }
  });
}
