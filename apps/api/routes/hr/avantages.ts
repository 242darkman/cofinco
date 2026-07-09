import { Router } from "express";
/**
 * Routes RH — Avantages sociaux des employés.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/avantages
 *   GET    /api/hr/avantages/employe/:id
 *   POST   /api/hr/avantages/assign
 *   POST   /api/hr/avantages
 *   PATCH  /api/hr/avantages/:id
 *   DELETE /api/hr/avantages/:id
 */
import { db } from "../../db";
import { avantages } from "@shared/schema";
import { StatutCandidature, StatutConge, StatutUser, StatutVisiteTerrain, StatutArchive } from "@shared/enum/status-constants";
import { eq } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { storage } from "../../storage";
import { getWsInstance } from "../../ws-server";

export const avantagesRouter = Router();

/**
 * ========================================
 * AVANTAGES
 * ========================================
 */

// GET /api/hr/avantages - Liste des avantages disponibles
/**
 * GET /api/hr/avantages
 */
avantagesRouter.get("/avantages", getAuthUser, attachAbility, async (req, res) => {
    try {
        const avantagesList = await storage.getAllAvantages();
        res.json(avantagesList);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération avantages');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/avantages/employe/:id - Avantages d'un employé
/**
 * GET /api/hr/avantages/employe/:id
 */
avantagesRouter.get("/avantages/employe/:id", getAuthUser, attachAbility, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await storage.getAvantagesEmploye(id);
        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération avantages employé');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/avantages/assign - Assigner un avantage
/**
 * POST /api/hr/avantages/assign
 */
avantagesRouter.post("/avantages/assign", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
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
        logger.error({ err: error }, 'Erreur assignation avantage');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/avantages - Créer un avantage
/**
 * POST /api/hr/avantages
 */
avantagesRouter.post("/avantages", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const {
            nom, type, montantParDefaut, description, eligibleContrats,
            modeCalcul, pourcentage, plafond, frequence, dateDebut, dateFin,
            imposable, soumisCnss, autoAttribution, categorie
        } = req.body;
        if (!nom || !type) {
            return res.status(400).json({ error: "Nom et type requis" });
        }

        const [created] = await db.insert(avantages).values({
            nom,
            type,
            montantParDefaut: montantParDefaut ? parseInt(montantParDefaut) : 0,
            description: description || null,
            eligibleContrats: eligibleContrats || null,
            modeCalcul: modeCalcul || 'FIXE',
            pourcentage: pourcentage != null ? String(pourcentage) : null,
            plafond: plafond ? parseInt(plafond) : null,
            frequence: frequence || 'MENSUEL',
            dateDebut: dateDebut || null,
            dateFin: dateFin || null,
            imposable: imposable !== undefined ? imposable : true,
            soumisCnss: soumisCnss !== undefined ? soumisCnss : true,
            autoAttribution: autoAttribution || false,
            categorie: categorie || 'AUTRE',
            actif: true,
        }).returning();

        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "HR_UPDATE", payload: { entity: 'avantage', action: 'created', id: created.id } });
        }

        res.status(201).json(created);
    } catch (error) {
        logger.error({ err: error }, 'Erreur création avantage');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/avantages/:id - Modifier un avantage
/**
 * PATCH /api/hr/avantages/:id
 */
avantagesRouter.patch("/avantages/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const avantageId = parseInt(req.params.id);
        const {
            nom, type, montantParDefaut, description, eligibleContrats,
            modeCalcul, pourcentage, plafond, frequence, dateDebut, dateFin,
            imposable, soumisCnss, autoAttribution, categorie
        } = req.body;

        const updates: Record<string, any> = {};
        if (nom !== undefined) updates.nom = nom;
        if (type !== undefined) updates.type = type;
        if (montantParDefaut !== undefined) updates.montantParDefaut = parseInt(montantParDefaut);
        if (description !== undefined) updates.description = description;
        if (eligibleContrats !== undefined) updates.eligibleContrats = eligibleContrats;
        if (modeCalcul !== undefined) updates.modeCalcul = modeCalcul;
        if (pourcentage !== undefined) updates.pourcentage = pourcentage != null ? String(pourcentage) : null;
        if (plafond !== undefined) updates.plafond = plafond ? parseInt(plafond) : null;
        if (frequence !== undefined) updates.frequence = frequence;
        if (dateDebut !== undefined) updates.dateDebut = dateDebut || null;
        if (dateFin !== undefined) updates.dateFin = dateFin || null;
        if (imposable !== undefined) updates.imposable = imposable;
        if (soumisCnss !== undefined) updates.soumisCnss = soumisCnss;
        if (autoAttribution !== undefined) updates.autoAttribution = autoAttribution;
        if (categorie !== undefined) updates.categorie = categorie;

        const [updated] = await db.update(avantages)
            .set(updates)
            .where(eq(avantages.id, avantageId))
            .returning();

        if (!updated) return res.status(404).json({ error: "Avantage non trouvé" });

        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur mise à jour avantage');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/avantages/:id - Soft-delete un avantage
/**
 * DELETE /api/hr/avantages/:id
 */
avantagesRouter.delete("/avantages/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const avantageId = parseInt(req.params.id);

        const [deleted] = await db.update(avantages)
            .set({ actif: false, deletedAt: new Date() })
            .where(eq(avantages.id, avantageId))
            .returning();

        if (!deleted) return res.status(404).json({ error: "Avantage non trouvé" });

        res.json({ message: "Avantage supprimé" });
    } catch (error) {
        logger.error({ err: error }, 'Erreur suppression avantage');
        res.status(500).json({ error: "Erreur serveur" });
    }
});
