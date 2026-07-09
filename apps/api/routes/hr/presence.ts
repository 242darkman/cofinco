import { Router } from "express";
/**
 * Routes RH — Présence : pointages et horaires de travail.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/presence/today
 *   POST   /api/hr/presence/checkin
 *   POST   /api/hr/presence/checkout
 *   POST   /api/hr/presence/start-break
 *   POST   /api/hr/presence/end-break
 *   POST   /api/hr/presence/manual
 *   GET    /api/hr/presence/by-status/:status
 *   GET    /api/hr/horaires/:employeId
 *   POST   /api/hr/horaires
 *   DELETE /api/hr/horaires/:id
 *   GET    /api/hr/presence/week
 */
import { db } from "../../db";
import { horairesTravail, presences, employes } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { storage } from "../../storage";
import { users } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import * as hrStorage from "../../storage/hr";

export const presenceRouter = Router();

/**
 * ========================================
 * PRESENCE
 * ========================================
 */

// GET /api/hr/presence/today - Stats présence aujourd'hui
/**
 * GET /api/hr/presence/today
 */
presenceRouter.get("/presence/today", getAuthUser, attachAbility, async (req, res) => {
    try {
        const stats = await storage.getPresenceAujourdhui();
        res.json(stats);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération présence');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/checkin - Pointage Arrivée (avec GPS optionnel)
/**
 * POST /api/hr/presence/checkin
 */
presenceRouter.post("/presence/checkin", getAuthUser, attachAbility, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        // Extract and validate GPS data from request body (optional)
        const { latitude, longitude, accuracy, gpsSource } = req.body || {};
        let gps: { latitude: number; longitude: number; accuracy?: number | null; gpsSource: string } | undefined;

        if (latitude != null || longitude != null) {
          const lat = Number(latitude);
          const lng = Number(longitude);
          const acc = accuracy != null ? Number(accuracy) : null;

          // Basic coordinate validation
          if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ error: "Coordonnées GPS invalides" });
          }

          // Reject Null Island (0,0) — common GPS spoofing indicator
          if (lat === 0 && lng === 0) {
            return res.status(400).json({ error: "Position GPS non disponible (0,0)" });
          }

          // Reject if accuracy is too poor (> 500m)
          if (acc != null && acc > 500) {
            return res.status(400).json({
              error: "Précision GPS insuffisante",
              details: { accuracy: acc, maxAccuracy: 500 },
            });
          }

          gps = { latitude: lat, longitude: lng, accuracy: acc, gpsSource: gpsSource || "gps" };
        }

        const result = await storage.checkIn(employe.id, gps);
        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur pointage');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/checkout - Pointage Départ
/**
 * POST /api/hr/presence/checkout
 */
presenceRouter.post("/presence/checkout", getAuthUser, attachAbility, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        const result = await storage.checkOut(employe.id);
        if (!result) return res.status(422).json({ error: "Aucun pointage d'arrivée trouvé pour aujourd'hui" });

        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId: employe.id } });
        }

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur pointage départ');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/start-break - Début pause
/**
 * POST /api/hr/presence/start-break
 */
presenceRouter.post("/presence/start-break", getAuthUser, attachAbility, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        const result = await storage.startBreak(employe.id);
        if (!result) return res.status(422).json({ error: "Aucun pointage d'arrivée trouvé" });

        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId: employe.id } });
        }

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur début pause');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/end-break - Fin pause
/**
 * POST /api/hr/presence/end-break
 */
presenceRouter.post("/presence/end-break", getAuthUser, attachAbility, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Non authentifié" });

        // Résoudre l'employeId à partir du userId
        const employe = await storage.getEmployeByUserId(userId);
        if (!employe) {
            return res.status(404).json({ error: "Profil employé non trouvé pour cet utilisateur" });
        }

        const result = await storage.endBreak(employe.id);
        if (!result) return res.status(422).json({ error: "Aucune pause en cours" });

        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId: employe.id } });
        }

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur fin pause');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/presence/manual - Pointage manuel par un ayant droit
/**
 * POST /api/hr/presence/manual
 */
presenceRouter.post("/presence/manual", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { employeId, date, heureArrivee, heureDepart, pauseDebut, pauseFin, commentaire } = req.body;

        if (!employeId || !heureArrivee) {
            return res.status(400).json({ error: "employeId et heureArrivee sont requis" });
        }

        // Validate time format HH:MM
        const timeRegex = /^\d{2}:\d{2}$/;
        if (!timeRegex.test(heureArrivee)) {
            return res.status(400).json({ error: "Format d'heure invalide (attendu HH:MM)" });
        }
        for (const field of [heureDepart, pauseDebut, pauseFin]) {
            if (field && !timeRegex.test(field)) {
                return res.status(400).json({ error: "Format d'heure invalide (attendu HH:MM)" });
            }
        }

        const targetDate = date || new Date().toISOString().split('T')[0];

        const result = await hrStorage.manualPresenceEntry({
            employeId,
            date: targetDate,
            heureArrivee,
            heureDepart,
            pauseDebut,
            pauseFin,
            commentaire,
        });

        // WebSocket: Notify presence update
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "PRESENCE_UPDATE", payload: { employeId } });
        }

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur pointage manuel');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/presence/by-status/:status - Liste employés par statut
/**
 * GET /api/hr/presence/by-status/:status
 */
presenceRouter.get("/presence/by-status/:status", getAuthUser, attachAbility, async (req, res) => {
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
        logger.error({ err: error }, 'Erreur récupération employés par statut');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * HORAIRES DE TRAVAIL
 * ========================================
 */

// GET /api/hr/horaires/:employeId - Horaires d'un employé
/**
 * GET /api/hr/horaires/:employeId
 */
presenceRouter.get("/horaires/:employeId", getAuthUser, attachAbility, async (req, res) => {
    try {
        const { employeId } = req.params;
        const horaires = await db.select().from(horairesTravail)
            .where(and(eq(horairesTravail.employeId, employeId), eq(horairesTravail.actif, true)));
        res.json(horaires);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération horaires');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/horaires - Créer un horaire
/**
 * POST /api/hr/horaires
 */
presenceRouter.post("/horaires", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
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
        logger.error({ err: error }, 'Erreur création horaire');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// DELETE /api/hr/horaires/:id - Supprimer un horaire
/**
 * DELETE /api/hr/horaires/:id
 */
presenceRouter.delete("/horaires/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.HORAIRE), async (req, res) => {
    try {
        const { id } = req.params;
        await db.update(horairesTravail)
            .set({ actif: false })
            .where(eq(horairesTravail.id, parseInt(id)));
        res.json({ message: "Horaire supprimé" });
    } catch (error) {
        logger.error({ err: error }, 'Erreur suppression horaire');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/presence/week - Pointages d'un employé pour une semaine (lien feuille de temps)
/**
 * GET /api/hr/presence/week
 */
presenceRouter.get("/presence/week", getAuthUser, attachAbility, async (req, res) => {
    try {
        const { employeId, dateDebut, dateFin } = req.query as { employeId?: string; dateDebut?: string; dateFin?: string };
        if (!employeId || !dateDebut || !dateFin) {
            return res.status(400).json({ error: "employeId, dateDebut et dateFin requis" });
        }
        const records = await hrStorage.getPresenceForWeek(employeId, dateDebut, dateFin);
        res.json(records);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération présences semaine");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
