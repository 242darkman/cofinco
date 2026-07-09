import { Router } from "express";
/**
 * Routes RH — Recrutement : candidatures et scoring automatique.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/candidatures
 *   POST   /api/hr/candidatures
 *   GET    /api/hr/candidatures/:id/cv
 *   POST   /api/hr/candidatures/:id/cv
 *   PATCH  /api/hr/candidatures/:id
 */
import { db } from "../../db";
import { candidatures } from "@shared/schema";
import { StatutCandidature, StatutConge, StatutUser, StatutVisiteTerrain, StatutArchive } from "@shared/enum/status-constants";
import { eq, desc } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getWsInstance } from "../../ws-server";
import { StorageService } from "../../services/storage-service";
import { scoreCandidature, scoreAllCandidatures } from "../../services/candidature-scoring-service";
import { normalizePhone } from "@shared/utils/phone";
import { docUpload } from "./shared";

export const candidaturesRouter = Router();

/**
 * ========================================
 * CANDIDATURES
 * ========================================
 */

// GET /api/hr/candidatures - Liste des candidatures
/**
 * GET /api/hr/candidatures
 */
candidaturesRouter.get("/candidatures", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { statut } = req.query;

    const result = statut
      ? await db.select().from(candidatures).where(eq(candidatures.statut, statut as string)).orderBy(desc(candidatures.datePostulation))
      : await db.select().from(candidatures).orderBy(desc(candidatures.datePostulation));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération candidatures');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/candidatures - Créer une candidature
/**
 * POST /api/hr/candidatures
 */
candidaturesRouter.post("/candidatures", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
  try {
    const { nom, prenom, email, telephone, posteVise, experience, formation: formationCand } = req.body;

    if (!nom || !prenom || !email || !posteVise) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const [newCandidature] = await db.insert(candidatures).values({
      nom,
      prenom,
      email,
      telephone: normalizePhone(telephone),
      posteVise,
      experience,
      formation: formationCand,
      statut: StatutCandidature.PENDING,
      jobOfferId: req.body.jobOfferId || null,
      source: req.body.source || 'MANUAL',
    }).returning();

    // Auto-score if linked to an offer
    if (newCandidature.jobOfferId) {
        await scoreCandidature(newCandidature.id);
    }

    // Broadcast HR Update
    const wsInstance = getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'candidature_new', id: newCandidature.id } });
    }

    res.status(201).json(newCandidature);
  } catch (error) {
    logger.error({ err: error }, 'Erreur création candidature');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/hr/candidatures/:id/cv - Get CV download URL
/**
 * GET /api/hr/candidatures/:id/cv
 */
candidaturesRouter.get("/candidatures/:id/cv", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { id } = req.params;
    const [candidature] = await db.select().from(candidatures).where(eq(candidatures.id, parseInt(id))).limit(1);
    if (!candidature || !candidature.cvUrl) {
      return res.status(404).json({ error: "CV non trouvé" });
    }
    const downloadUrl = await StorageService.getPresignedDownloadUrl(candidature.cvUrl, 3600);
    res.json({ url: downloadUrl, filename: candidature.cvUrl.split('/').pop() });
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération CV');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/hr/candidatures/:id/cv - Upload CV
/**
 * POST /api/hr/candidatures/:id/cv
 */
candidaturesRouter.post("/candidatures/:id/cv", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), docUpload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Fichier requis" });
    }

    const candidature = await db.select().from(candidatures).where(eq(candidatures.id, parseInt(id))).limit(1);
    if (!candidature.length) {
      return res.status(404).json({ error: "Candidature non trouvée" });
    }

    const storageKey = await StorageService.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      `hr/candidatures/${id}/cv`,
      false
    );

    const [updated] = await db.update(candidatures)
      .set({ cvUrl: storageKey, updatedAt: new Date() })
      .where(eq(candidatures.id, parseInt(id)))
      .returning();

    const downloadUrl = await StorageService.getPresignedDownloadUrl(storageKey, 86400);

    res.json({ ...updated, cvDownloadUrl: downloadUrl });
  } catch (error) {
    logger.error({ err: error }, 'Erreur upload CV');
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/hr/candidatures/:id - Mettre à jour une candidature
/**
 * PATCH /api/hr/candidatures/:id
 */
candidaturesRouter.patch("/candidatures/:id", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
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
    logger.error({ err: error }, 'Erreur mise à jour candidature');
    res.status(500).json({ error: "Erreur serveur" });
  }
});
