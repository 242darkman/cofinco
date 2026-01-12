import { Express } from "express";
import { db } from "../db";
import { agences, userAgences, users } from "../../shared/schema";
import { employes } from "../../shared/schema/employes";
import { clients } from "../../shared/schema/clients";
import { eq, and, ilike, or, desc, asc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { logAudit } from "../audit";

export function registerAgencesRoutes(app: Express) {
  // ============================================
  // AGENCES CRUD
  // ============================================

  // GET /api/agences - Liste des agences avec comptes calculés
  app.get("/api/agences", requireAuth, async (req, res) => {
    try {
      const { statut, type, search, sortBy = "nom", sortOrder = "asc" } = req.query;

      // Requête principale avec sous-requêtes scalaires corrélées
      // Note: Le statut de l'employé est stocké dans la table users, pas employes
      let query = db
        .select({
          id: agences.id,
          codeAgence: agences.codeAgence,
          nom: agences.nom,
          typeAgence: agences.typeAgence,
          adresse: agences.adresse,
          ville: agences.ville,
          region: agences.region,
          pays: agences.pays,
          telephone: agences.telephone,
          email: agences.email,
          responsableId: agences.responsableId,
          responsableNom: agences.responsableNom,
          responsablePhone: agences.responsablePhone,
          statut: agences.statut,
          dateOuverture: agences.dateOuverture,
          latitude: agences.latitude,
          longitude: agences.longitude,
          notes: agences.notes,
          createdAt: agences.createdAt,
          updatedAt: agences.updatedAt,
          // Comptes calculés via sous-requêtes corrélées
          nombreEmployes: sql<number>`(
            SELECT COUNT(*)::int FROM employes e
            INNER JOIN users u ON e.user_id = u.id
            WHERE e.agence_id = agences.id AND u.statut = 'Actif'
          )`,
          nombreClients: sql<number>`(
            SELECT COUNT(*)::int FROM clients c
            WHERE c.agence_id = agences.id AND c.status = 'Actif'
          )`,
        })
        .from(agences);

      // Filtres
      const conditions = [];
      if (statut && statut !== "all") {
        conditions.push(eq(agences.statut, statut as string));
      }
      if (type && type !== "all") {
        conditions.push(eq(agences.typeAgence, type as string));
      }
      if (search) {
        const searchTerm = `%${search}%`;
        conditions.push(
          or(
            ilike(agences.nom, searchTerm),
            ilike(agences.codeAgence, searchTerm),
            ilike(agences.ville, searchTerm)
          )
        );
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      // Tri
      const sortColumn = sortBy === "date" ? agences.createdAt : agences.nom;
      query = query.orderBy(sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn)) as typeof query;

      const result = await query;
      res.json(result);
    } catch (error: any) {
      console.error("Erreur GET /api/agences:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/:id - Détail d'une agence
  app.get("/api/agences/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const [agence] = await db
        .select()
        .from(agences)
        .where(eq(agences.id, id));

      if (!agence) {
        return res.status(404).json({ error: "Agence non trouvée" });
      }

      // Obtenir le nombre d'utilisateurs affectés
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userAgences)
        .where(and(eq(userAgences.agenceId, id), eq(userAgences.actif, true)));

      res.json({
        ...agence,
        nombreUtilisateurs: Number(countResult?.count || 0)
      });
    } catch (error: any) {
      console.error("Erreur GET /api/agences/:id:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences - Créer une agence
  app.post("/api/agences", requireRole("admin"), async (req, res) => {
    try {
      const data = req.body;
      const userId = (req as any).session?.userId;

      // Vérifier que le code_agence est unique
      const existing = await db
        .select()
        .from(agences)
        .where(eq(agences.codeAgence, data.code_agence || data.codeAgence));

      if (existing.length > 0) {
        return res.status(400).json({ error: "Ce code agence existe déjà" });
      }

      const [newAgence] = await db
        .insert(agences)
        .values({
          codeAgence: data.code_agence || data.codeAgence,
          nom: data.nom,
          typeAgence: data.type_agence || data.typeAgence || "Secondaire",
          adresse: data.adresse,
          ville: data.ville,
          region: data.region,
          pays: data.pays || "Congo-Brazzaville",
          telephone: data.telephone,
          email: data.email,
          responsableId: data.responsable_id || data.responsableId,
          responsableNom: data.responsable_nom || data.responsableNom,
          responsablePhone: data.responsable_phone || data.responsablePhone,
          statut: data.statut || "Actif",
          dateOuverture: data.date_ouverture || data.dateOuverture,
          latitude: data.latitude,
          longitude: data.longitude,
          notes: data.notes
        })
        .returning();

      await logAudit(req, "CREATE", "agences", newAgence.id, {
        nom: newAgence.nom,
        codeAgence: newAgence.codeAgence
      });

      // Notify
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_new', id: newAgence.id } });
      }

      res.status(201).json(newAgence);
    } catch (error: any) {
      console.error("Erreur POST /api/agences:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/agences/:id - Modifier une agence
  app.patch("/api/agences/:id", requireRole("admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const userId = (req as any).session?.userId;

      const [updated] = await db
        .update(agences)
        .set({
          nom: data.nom,
          typeAgence: data.type_agence || data.typeAgence,
          adresse: data.adresse,
          ville: data.ville,
          region: data.region,
          pays: data.pays,
          telephone: data.telephone,
          email: data.email,
          responsableId: data.responsable_id || data.responsableId,
          responsableNom: data.responsable_nom || data.responsableNom,
          responsablePhone: data.responsable_phone || data.responsablePhone,
          statut: data.statut,
          dateOuverture: data.date_ouverture || data.dateOuverture,
          latitude: data.latitude,
          longitude: data.longitude,
          notes: data.notes,
          updatedAt: new Date()
        })
        .where(eq(agences.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Agence non trouvée" });
      }

      await logAudit(req, "UPDATE", "agences", id, { changes: data });

      // Notify
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_updated', id } });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Erreur PATCH /api/agences/:id:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/agences/:id - Supprimer une agence
  app.delete("/api/agences/:id", requireRole("admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).session?.userId;

      // Vérifier qu'il n'y a pas d'utilisateurs actifs
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userAgences)
        .where(and(eq(userAgences.agenceId, id), eq(userAgences.actif, true)));

      if (Number(countResult?.count || 0) > 0) {
        return res.status(400).json({
          error: "Impossible de supprimer cette agence car des utilisateurs y sont affectés"
        });
      }

      const [deleted] = await db
        .delete(agences)
        .where(eq(agences.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: "Agence non trouvée" });
      }

      await logAudit(req, "DELETE", "agences", id, { nom: deleted.nom });

      // Notify
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_deleted', id } });
      }

      res.json({ message: "Agence supprimée avec succès" });
    } catch (error: any) {
      console.error("Erreur DELETE /api/agences/:id:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // USER AGENCES (Affectations)
  // ============================================

  // GET /api/users/:userId/agences - Agences d'un utilisateur
  app.get("/api/users/:userId/agences", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;

      const result = await db
        .select({
          id: userAgences.id,
          agenceId: userAgences.agenceId,
          isPrimary: userAgences.isPrimary,
          role: userAgences.role,
          dateAffectation: userAgences.dateAffectation,
          dateFin: userAgences.dateFin,
          actif: userAgences.actif,
          agence: {
            id: agences.id,
            codeAgence: agences.codeAgence,
            nom: agences.nom,
            typeAgence: agences.typeAgence,
            ville: agences.ville,
            statut: agences.statut
          }
        })
        .from(userAgences)
        .innerJoin(agences, eq(userAgences.agenceId, agences.id))
        .where(and(eq(userAgences.userId, userId), eq(userAgences.actif, true)))
        .orderBy(desc(userAgences.isPrimary), asc(agences.nom));

      res.json(result);
    } catch (error: any) {
      console.error("Erreur GET /api/users/:userId/agences:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/me/agences - Mes agences (utilisateur connecté)
  app.get("/api/me/agences", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).session?.userId;

      if (!userId) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const result = await db
        .select({
          id: userAgences.id,
          agenceId: userAgences.agenceId,
          isPrimary: userAgences.isPrimary,
          role: userAgences.role,
          dateAffectation: userAgences.dateAffectation,
          actif: userAgences.actif,
          agence: {
            id: agences.id,
            codeAgence: agences.codeAgence,
            nom: agences.nom,
            typeAgence: agences.typeAgence,
            ville: agences.ville,
            statut: agences.statut
          }
        })
        .from(userAgences)
        .innerJoin(agences, eq(userAgences.agenceId, agences.id))
        .where(and(
          eq(userAgences.userId, userId),
          eq(userAgences.actif, true),
          eq(agences.statut, "Actif")
        ))
        .orderBy(desc(userAgences.isPrimary), asc(agences.nom));

      res.json(result);
    } catch (error: any) {
      console.error("Erreur GET /api/me/agences:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/users/:userId/agences - Affecter un utilisateur à une agence
  app.post("/api/users/:userId/agences", requireRole("admin"), async (req, res) => {
    try {
      const { userId } = req.params;
      const { agenceId, isPrimary = false, role } = req.body;
      const adminUserId = (req as any).session?.userId;

      // Vérifier que l'agence existe
      const [agence] = await db
        .select()
        .from(agences)
        .where(eq(agences.id, agenceId));

      if (!agence) {
        return res.status(404).json({ error: "Agence non trouvée" });
      }

      // Vérifier si l'affectation existe déjà
      const existing = await db
        .select()
        .from(userAgences)
        .where(and(eq(userAgences.userId, userId), eq(userAgences.agenceId, agenceId)));

      if (existing.length > 0) {
        // Réactiver si elle était désactivée
        const [updated] = await db
          .update(userAgences)
          .set({ actif: true, isPrimary, role, updatedAt: new Date() })
          .where(eq(userAgences.id, existing[0].id))
          .returning();

        return res.json(updated);
      }

      // Si isPrimary, désactiver les autres agences primaires
      if (isPrimary) {
        await db
          .update(userAgences)
          .set({ isPrimary: false })
          .where(and(eq(userAgences.userId, userId), eq(userAgences.isPrimary, true)));
      }

      const [newAffectation] = await db
        .insert(userAgences)
        .values({
          userId,
          agenceId,
          isPrimary,
          role,
          actif: true
        })
        .returning();

      await logAudit(req, "CREATE", "user_agences", newAffectation.id, {
        userId,
        agenceId,
        agenceNom: agence.nom
      });

      // Notify
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'user_assigned', agenceId, userId } });
      }

      res.status(201).json(newAffectation);
    } catch (error: any) {
      console.error("Erreur POST /api/users/:userId/agences:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/user-agences/:id - Modifier une affectation
  app.patch("/api/user-agences/:id", requireRole("admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const { isPrimary, role, actif } = req.body;
      const adminUserId = (req as any).session?.userId;

      // Obtenir l'affectation actuelle
      const [current] = await db
        .select()
        .from(userAgences)
        .where(eq(userAgences.id, id));

      if (!current) {
        return res.status(404).json({ error: "Affectation non trouvée" });
      }

      // Si on définit comme primaire, désactiver les autres
      if (isPrimary === true) {
        await db
          .update(userAgences)
          .set({ isPrimary: false })
          .where(and(eq(userAgences.userId, current.userId), eq(userAgences.isPrimary, true)));
      }

      const [updated] = await db
        .update(userAgences)
        .set({
          isPrimary: isPrimary !== undefined ? isPrimary : current.isPrimary,
          role: role !== undefined ? role : current.role,
          actif: actif !== undefined ? actif : current.actif,
          updatedAt: new Date()
        })
        .where(eq(userAgences.id, id))
        .returning();

      await logAudit(req, "UPDATE", "user_agences", id, { changes: req.body });

      // Notify
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'assignment_updated', id } });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Erreur PATCH /api/user-agences/:id:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/user-agences/:id - Supprimer une affectation
  app.delete("/api/user-agences/:id", requireRole("admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const adminUserId = (req as any).session?.userId;

      // Soft delete - désactiver plutôt que supprimer
      const [updated] = await db
        .update(userAgences)
        .set({ actif: false, updatedAt: new Date() })
        .where(eq(userAgences.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Affectation non trouvée" });
      }

      await logAudit(req, "DELETE", "user_agences", id, {});

      // Notify
      const wsInstance = require("../ws-server").getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'assignment_deleted', id } });
      }

      res.json({ message: "Affectation supprimée avec succès" });
    } catch (error: any) {
      console.error("Erreur DELETE /api/user-agences/:id:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/:agenceId/users - Utilisateurs d'une agence
  app.get("/api/agences/:agenceId/users", requireAuth, async (req, res) => {
    try {
      const { agenceId } = req.params;

      const result = await db
        .select({
          id: userAgences.id,
          userId: userAgences.userId,
          isPrimary: userAgences.isPrimary,
          role: userAgences.role,
          dateAffectation: userAgences.dateAffectation,
          user: {
            id: users.id,
            username: users.username,
            nom: users.nom,
            prenom: users.prenom,
            role: users.role,
            statut: users.statut
          }
        })
        .from(userAgences)
        .innerJoin(users, eq(userAgences.userId, users.id))
        .where(and(eq(userAgences.agenceId, agenceId), eq(userAgences.actif, true)))
        .orderBy(asc(users.nom));

      res.json(result);
    } catch (error: any) {
      console.error("Erreur GET /api/agences/:agenceId/users:", error);
      res.status(500).json({ error: error.message });
    }
  });
}
