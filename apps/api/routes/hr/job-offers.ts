import { Router } from "express";
/**
 * Routes RH — Recrutement : offres d'emploi.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/job-offers
 *   POST   /api/hr/job-offers
 *   GET    /api/hr/job-offers/internal
 *   GET    /api/hr/job-offers/:id
 *   PATCH  /api/hr/job-offers/:id
 *   POST   /api/hr/job-offers/:id/publish
 *   POST   /api/hr/job-offers/:id/close
 *   GET    /api/hr/job-offers/:id/candidatures
 *   POST   /api/hr/job-offers/:id/score-all
 *   POST   /api/hr/job-offers/:id/apply-internal
 */
import { db } from "../../db";
import { candidatures, employes, jobOffers } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { getWsInstance } from "../../ws-server";
import * as hrStorage from "../../storage/hr";
import { scoreCandidature, scoreAllCandidatures } from "../../services/candidature-scoring-service";

export const jobOffersRouter = Router();

// =============================================================================
// JOB OFFERS / ATS
// =============================================================================

// GET /api/hr/job-offers - Liste des offres
/**
 * GET /api/hr/job-offers
 */
jobOffersRouter.get("/job-offers", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const filter: { statut?: string; visibilite?: string } = {};
        if (req.query.statut) filter.statut = req.query.statut as string;
        if (req.query.visibilite) filter.visibilite = req.query.visibilite as string;
        const offers = await hrStorage.getJobOffers(filter);
        res.json(offers);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération offres d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/job-offers - Créer une offre
/**
 * POST /api/hr/job-offers
 */
jobOffersRouter.post("/job-offers", getAuthUser, attachAbility, requireAbility(Actions.CREATE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const user = (req as any).user;

        const { jobPositionId, titre, description, competencesRequises, qualificationMinimum,
            experienceMinAnnees, formationRequise, salairePropose, typeContrat, lieu,
            visibilite, dateLimite, poidsCompetences, poidsQualification, poidsExperience,
            postesOuverts } = req.body;

        if (!jobPositionId || !titre) {
            return res.status(400).json({ error: "jobPositionId et titre sont requis" });
        }

        const [offer] = await db.insert(jobOffers).values({
            jobPositionId,
            titre,
            description: description || null,
            competencesRequises: competencesRequises || null,
            qualificationMinimum: qualificationMinimum || null,
            experienceMinAnnees: experienceMinAnnees || 0,
            formationRequise: formationRequise || null,
            salairePropose: salairePropose || null,
            typeContrat: typeContrat || null,
            lieu: lieu || null,
            visibilite: visibilite || 'BOTH',
            statut: 'DRAFT',
            dateLimite: dateLimite || null,
            poidsCompetences: poidsCompetences || 40,
            poidsQualification: poidsQualification || 30,
            poidsExperience: poidsExperience || 30,
            postesOuverts: postesOuverts || 1,
            createdBy: user.id,
            agenceId: user.agenceId || null,
        }).returning();

        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'job_offer_created', id: offer.id } });
        }

        res.status(201).json(offer);
    } catch (error) {
        logger.error({ err: error }, "Erreur création offre d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/job-offers/internal - Offres publiées visibles en interne
/**
 * GET /api/hr/job-offers/internal
 */
jobOffersRouter.get("/job-offers/internal", getAuthUser, attachAbility, async (req, res) => {
    try {
        const offers = await hrStorage.getInternalJobOffers();
        res.json(offers);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération offres internes");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/job-offers/:id - Détail d'une offre
/**
 * GET /api/hr/job-offers/:id
 */
jobOffersRouter.get("/job-offers/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const offer = await hrStorage.getJobOfferById(parseInt(req.params.id));
        if (!offer) return res.status(404).json({ error: "Offre introuvable" });
        res.json(offer);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération offre d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/job-offers/:id - Modifier une offre
/**
 * PATCH /api/hr/job-offers/:id
 */
jobOffersRouter.patch("/job-offers/:id", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const id = parseInt(req.params.id);
        const updateData: any = {};
        const allowedFields = ['titre', 'description', 'competencesRequises', 'qualificationMinimum',
            'experienceMinAnnees', 'formationRequise', 'salairePropose', 'typeContrat', 'lieu',
            'visibilite', 'dateLimite', 'poidsCompetences', 'poidsQualification', 'poidsExperience',
            'postesOuverts', 'jobPositionId'];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) updateData[field] = req.body[field];
        }
        updateData.updatedAt = new Date();

        const [updated] = await db.update(jobOffers)
            .set(updateData)
            .where(eq(jobOffers.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Offre introuvable" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur modification offre d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/job-offers/:id/publish - Publier une offre
/**
 * POST /api/hr/job-offers/:id/publish
 */
jobOffersRouter.post("/job-offers/:id/publish", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const id = parseInt(req.params.id);
        const [updated] = await db.update(jobOffers)
            .set({ statut: 'PUBLISHED', datePublication: new Date(), updatedAt: new Date() })
            .where(eq(jobOffers.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Offre introuvable" });

        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'job_offer_published', id: updated.id } });
        }

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur publication offre d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/job-offers/:id/close - Fermer une offre
/**
 * POST /api/hr/job-offers/:id/close
 */
jobOffersRouter.post("/job-offers/:id/close", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });

        const id = parseInt(req.params.id);
        const [updated] = await db.update(jobOffers)
            .set({ statut: 'CLOSED', updatedAt: new Date() })
            .where(eq(jobOffers.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Offre introuvable" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, "Erreur fermeture offre d'emploi");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/job-offers/:id/candidatures - Candidatures d'une offre (triées par score)
/**
 * GET /api/hr/job-offers/:id/candidatures
 */
jobOffersRouter.get("/job-offers/:id/candidatures", getAuthUser, attachAbility, async (req, res) => {
    try {
        if (!req.ability?.can(Actions.VIEW, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const candidaturesList = await hrStorage.getJobOfferCandidatures(parseInt(req.params.id));
        res.json(candidaturesList);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération candidatures de l'offre");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/job-offers/:id/score-all - Re-scorer toutes les candidatures d'une offre
/**
 * POST /api/hr/job-offers/:id/score-all
 */
jobOffersRouter.post("/job-offers/:id/score-all", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) return res.status(403).json({ error: "Non autorisé" });
        const scored = await scoreAllCandidatures(parseInt(req.params.id));
        res.json({ scored, message: `${scored} candidature(s) scorée(s)` });
    } catch (error) {
        logger.error({ err: error }, "Erreur scoring candidatures");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/job-offers/:id/apply-internal - Postuler en interne
/**
 * POST /api/hr/job-offers/:id/apply-internal
 */
jobOffersRouter.post("/job-offers/:id/apply-internal", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const offerId = parseInt(req.params.id);

        // Vérifier que l'offre existe et est publiée
        const [offer] = await db.select().from(jobOffers).where(eq(jobOffers.id, offerId));
        if (!offer || offer.statut !== 'PUBLISHED') {
            return res.status(400).json({ error: "Offre non disponible" });
        }

        // Vérifier visibilité interne
        if (offer.visibilite === 'EXTERNAL') {
            return res.status(403).json({ error: "Cette offre n'est pas ouverte aux candidatures internes" });
        }

        // Récupérer profil employé
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) {
            return res.status(400).json({ error: "Aucun profil employé associé" });
        }

        // Vérifier pas déjà candidaté
        const [existing] = await db.select().from(candidatures)
            .where(and(eq(candidatures.jobOfferId, offerId), eq(candidatures.email, user.email || '')));
        if (existing) {
            return res.status(400).json({ error: "Vous avez déjà postulé à cette offre" });
        }

        // Créer candidature auto-remplie
        const [newCandidature] = await db.insert(candidatures).values({
            nom: user.nom || '',
            prenom: user.prenom || '',
            email: user.email || '',
            telephone: user.telephone || undefined,
            posteVise: offer.titre,
            experience: req.body.experience || null,
            formation: req.body.formation || null,
            datePostulation: new Date().toISOString().split('T')[0],
            statut: 'NEW',
            jobOfferId: offerId,
            source: 'INTERNAL_PORTAL',
        }).returning();

        // Auto-score
        await scoreCandidature(newCandidature.id);

        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { type: 'candidature_new', id: newCandidature.id } });
        }

        res.status(201).json(newCandidature);
    } catch (error) {
        logger.error({ err: error }, "Erreur candidature interne");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
