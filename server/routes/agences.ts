import { Express } from "express";
import { createLogger } from "../lib/logger";
import { db } from "../db";

const logger = createLogger('Routes:Agences');
import { agences, userAgences, users, coffresForts, comptesLiaison, userRoles } from "../../shared/schema";
import { employes } from "../../shared/schema/employes";
import { clients } from "../../shared/schema/clients";
import { eq, and, ilike, or, desc, asc, sql, ne } from "drizzle-orm";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../audit";
import { CoffresFortsService } from "../services/transfert-inter-coffres";
import {
  agencyMigrations,
  migrationPreFlightChecks,
  migrationAuditLogs,
  migrationEntityLogs,
  MIGRATION_STATUS
} from "../../shared/schema/agency_migration";
import { agencyMigrationService, MigrationError } from "../services/agency-migration";
import { getWsInstance } from "../ws-server";
import { TypeAgence, StatutAgence, StatutUser, StatutClient } from "../../shared/enum/status-constants";

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
            WHERE e.agence_id = agences.id AND u.statut = ${StatutUser.ACTIVE}
          )`,
          nombreClients: sql<number>`(
            SELECT COUNT(*)::int FROM clients c
            INNER JOIN users u ON c.user_id = u.id
            WHERE c.agence_id = agences.id AND u.statut = ${StatutClient.ACTIVE}
          )`,
        })
        .from(agences);

      // Filtres
      const conditions = [];
      if (statut && statut !== "all") {
        conditions.push(eq(agences.statut, statut as string));
      }
      if (type && type !== "all") {
        conditions.push(eq(agences.typeAgence, type as any));
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
      logger.error({ err: error }, 'Erreur GET /api/agences');
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
      logger.error({ err: error }, 'Erreur GET /api/agences/:id');
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences - Créer une agence (avec coffre-fort atomique)
  app.post("/api/agences", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const data = req.body;
      const userId = (req as any).session?.userId;
      const coffresService = new CoffresFortsService();

      // Vérifier que le code_agence est unique
      const existing = await db
        .select()
        .from(agences)
        .where(eq(agences.codeAgence, data.code_agence || data.codeAgence));

      if (existing.length > 0) {
        return res.status(400).json({ error: "Ce code agence existe déjà" });
      }

      // Transaction atomique: créer agence + coffre-fort
      const result = await db.transaction(async (tx) => {
        // 1. Créer l'agence
        const [newAgence] = await tx
          .insert(agences)
          .values({
            codeAgence: data.code_agence || data.codeAgence,
            nom: data.nom,
            typeAgence: data.type_agence || data.typeAgence || TypeAgence.SECONDARY,
            adresse: data.adresse,
            ville: data.ville,
            region: data.region,
            pays: data.pays || "Congo-Brazzaville",
            telephone: data.telephone,
            email: data.email,
            responsableId: data.responsable_id || data.responsableId,
            responsableNom: data.responsable_nom || data.responsableNom,
            responsablePhone: data.responsable_phone || data.responsablePhone,
            statut: data.statut || StatutAgence.ACTIVE,
            dateOuverture: data.date_ouverture || data.dateOuverture,
            latitude: data.latitude,
            longitude: data.longitude,
            notes: data.notes
          })
          .returning();

        // 2. Créer le coffre-fort associé (obligatoire)
        const coffreCode = `CF-${newAgence.codeAgence}`;
        const coffreNom = `Coffre-fort ${newAgence.nom}`;

        const [newCoffre] = await tx
          .insert(coffresForts)
          .values({
            code: coffreCode,
            nom: coffreNom,
            ownerType: "AGENCE",
            ownerId: newAgence.id,
            devise: "XAF",
            solde: "0",
            plafondEncaisse: data.plafondEncaisseCoffre?.toString() || null,
            soldeMinimum: data.soldeMinimumCoffre?.toString() || "0",
            statut: "ACTIVE", // coffre uses EN statut enum
          })
          .returning();

        // 3. Créer le compte de liaison associé
        const [newCompteLiaison] = await tx
          .insert(comptesLiaison)
          .values({
            code: `LIAISON-${newAgence.codeAgence}`,
            intitule: `Compte de liaison - ${newAgence.nom}`,
            numeroComptable: "581200",
            entiteType: "AGENCE",
            entiteId: newAgence.id,
            soldeCourant: "0",
            actif: true,
          })
          .returning();

        return { agence: newAgence, coffre: newCoffre, compteLiaison: newCompteLiaison };
      });

      await logAudit(req, "CREATE", "agences", result.agence.id, {
        nom: result.agence.nom,
        codeAgence: result.agence.codeAgence,
        coffreId: result.coffre.id,
        compteLiaisonId: result.compteLiaison.id
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_new', id: result.agence.id } });
      }

      res.status(201).json({
        ...result.agence,
        coffre: result.coffre,
        compteLiaison: result.compteLiaison
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences');
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/agences/:id - Modifier une agence
  app.patch("/api/agences/:id", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
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
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_updated', id } });
      }

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur PATCH /api/agences/:id');
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/agences/:id - Supprimer une agence
  app.delete("/api/agences/:id", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
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

      // Soft delete - désactiver plutôt que supprimer
      const [deleted] = await db
        .update(agences)
        .set({
          statut: StatutAgence.INACTIVE,
          deletedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(agences.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: "Agence non trouvée" });
      }

      await logAudit(req, "DELETE", "agences", id, { nom: deleted.nom });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_deleted', id } });
      }

      res.json({ message: "Agence supprimée avec succès" });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur DELETE /api/agences/:id');
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
      logger.error({ err: error }, 'Erreur GET /api/users/:userId/agences');
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
          eq(agences.statut, StatutAgence.ACTIVE)
        ))
        .orderBy(desc(userAgences.isPrimary), asc(agences.nom));

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/me/agences');
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/users/:userId/agences - Affecter un utilisateur à une agence
  app.post("/api/users/:userId/agences", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
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

      const [primaryCountResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userAgences)
        .where(and(
          eq(userAgences.userId, userId),
          eq(userAgences.isPrimary, true),
          eq(userAgences.actif, true)
        ));
      const hasPrimary = Number(primaryCountResult?.count || 0) > 0;

      // Vérifier si l'affectation existe déjà
      const existing = await db
        .select()
        .from(userAgences)
        .where(and(eq(userAgences.userId, userId), eq(userAgences.agenceId, agenceId)));

      if (existing.length > 0) {
        const current = existing[0];
        let finalIsPrimary = Boolean(isPrimary);
        if (!finalIsPrimary) {
          const [otherPrimaryResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(userAgences)
            .where(and(
              eq(userAgences.userId, userId),
              eq(userAgences.isPrimary, true),
              eq(userAgences.actif, true),
              ne(userAgences.id, current.id)
            ));
          const hasOtherPrimary = Number(otherPrimaryResult?.count || 0) > 0;
          if (!hasOtherPrimary) {
            finalIsPrimary = true;
          }
        }

        if (finalIsPrimary) {
          await db
            .update(userAgences)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(and(eq(userAgences.userId, userId), eq(userAgences.isPrimary, true)));
        }

        // Réactiver si elle était désactivée
        const [updated] = await db
          .update(userAgences)
          .set({ actif: true, isPrimary: finalIsPrimary, role, updatedAt: new Date() })
          .where(eq(userAgences.id, existing[0].id))
          .returning();

        return res.json(updated);
      }

      let finalIsPrimary = Boolean(isPrimary);
      if (!finalIsPrimary && !hasPrimary) {
        finalIsPrimary = true;
      }

      // Si isPrimary, désactiver les autres agences primaires
      if (finalIsPrimary) {
        await db
          .update(userAgences)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(userAgences.userId, userId), eq(userAgences.isPrimary, true)));
      }

      const [newAffectation] = await db
        .insert(userAgences)
        .values({
          userId,
          agenceId,
          isPrimary: finalIsPrimary,
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
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'user_assigned', agenceId, userId } });
      }

      res.status(201).json(newAffectation);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/users/:userId/agences');
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/user-agences/:id - Modifier une affectation
  app.patch("/api/user-agences/:id", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
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

      let nextActif = actif !== undefined ? Boolean(actif) : current.actif;
      let nextIsPrimary = isPrimary !== undefined ? Boolean(isPrimary) : current.isPrimary;
      if (!nextActif) {
        nextIsPrimary = false;
      }

      if (current.isPrimary && (!nextIsPrimary || !nextActif)) {
        const [replacement] = await db
          .select()
          .from(userAgences)
          .where(and(
            eq(userAgences.userId, current.userId),
            eq(userAgences.actif, true),
            ne(userAgences.id, current.id)
          ))
          .orderBy(desc(userAgences.createdAt))
          .limit(1);

        if (!replacement) {
          return res.status(400).json({ error: "Un utilisateur doit conserver une agence primaire active." });
        }

        await db
          .update(userAgences)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(eq(userAgences.id, replacement.id));
      }

      // Si on définit comme primaire, désactiver les autres
      if (nextIsPrimary === true) {
        await db
          .update(userAgences)
          .set({ isPrimary: false })
          .where(and(eq(userAgences.userId, current.userId), eq(userAgences.isPrimary, true)));
      }

      const [updated] = await db
        .update(userAgences)
        .set({
          isPrimary: nextIsPrimary,
          role: role !== undefined ? role : current.role,
          actif: nextActif,
          updatedAt: new Date()
        })
        .where(eq(userAgences.id, id))
        .returning();

      await logAudit(req, "UPDATE", "user_agences", id, { changes: req.body });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'assignment_updated', id } });
      }

      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur PATCH /api/user-agences/:id');
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/user-agences/:id - Supprimer une affectation
  app.delete("/api/user-agences/:id", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
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
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'assignment_deleted', id } });
      }

      res.json({ message: "Affectation supprimée avec succès" });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur DELETE /api/user-agences/:id');
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
            // Use userRoles.role (primary) instead of deprecated users.role
            role: userRoles.role,
            statut: users.statut
          }
        })
        .from(userAgences)
        .innerJoin(users, eq(userAgences.userId, users.id))
        .leftJoin(userRoles, and(
          eq(userRoles.userId, users.id),
          eq(userRoles.isPrimary, true)
        ))
        .where(and(eq(userAgences.agenceId, agenceId), eq(userAgences.actif, true)))
        .orderBy(asc(users.nom));

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/:agenceId/users');
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // AGENCY MIGRATION ROUTES (V2 - Production Ready)
  // ============================================

  // POST /api/agences/:id/migrations - Créer une nouvelle migration
  app.post("/api/agences/:id/migrations", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const {
        targetAgenceClients,
        targetAgenceEmployes,
        targetAgenceCoffre,
        scheduledAt
      } = req.body;
      const userId = (req as any).session?.userId;

      // Vérifier que l'agence source existe et est active
      const [sourceAgence] = await db
        .select()
        .from(agences)
        .where(eq(agences.id, id));

      if (!sourceAgence) {
        return res.status(404).json({ error: "Agence source non trouvée" });
      }

      if (sourceAgence.statut === StatutAgence.CLOSED) {
        return res.status(400).json({ error: "Cette agence est déjà fermée" });
      }

      // Créer la migration
      const migration = await agencyMigrationService.createMigration({
        sourceAgencyId: id,
        targetClientsAgencyId: targetAgenceClients,
        targetEmployeesAgencyId: targetAgenceEmployes,
        targetTreasuryAgencyId: targetAgenceCoffre,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        createdBy: userId
      });

      await logAudit(req, "MIGRATE_CREATE", "agences", id, { migrationId: migration.id, reference: migration.reference });

      res.status(201).json(migration);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/migrations');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code, details: error.details });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/migrations/:id/dry-run - Simulation de migration
  app.post("/api/agences/migrations/:id/dry-run", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;

      const result = await agencyMigrationService.runDryRun(id);

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/migrations/:id/dry-run');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/migrations/:id/submit - Soumettre pour exécution
  app.post("/api/agences/migrations/:id/submit", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).session?.userId;

      await agencyMigrationService.submitMigration(id, userId);

      const migration = await agencyMigrationService.getMigrationStatus(id);

      await logAudit(req, "MIGRATE_SUBMIT", "agency_migrations", id, { status: migration?.statut });

      res.json(migration);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/migrations/:id/submit');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/migrations/:id/execute - Exécuter immédiatement
  app.post("/api/agences/migrations/:id/execute", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).session?.userId;
      const ipAddress = req.ip;
      const userAgent = req.get("User-Agent");

      // Vérifier le statut
      const migration = await agencyMigrationService.getMigrationStatus(id);
      if (!migration) {
        return res.status(404).json({ error: "Migration non trouvée" });
      }

      if (migration.statut !== MIGRATION_STATUS.PENDING && migration.statut !== MIGRATION_STATUS.SCHEDULED) {
        return res.status(400).json({
          error: `La migration ne peut pas être exécutée (statut actuel: ${migration.statut})`,
          code: "INVALID_STATUS"
        });
      }

      // Lancer l'exécution en arrière-plan
      agencyMigrationService.processMigration(id, { userId, ipAddress, userAgent }).catch(err => {
        logger.error({ err }, 'Background Migration Failed');
      });

      await logAudit(req, "MIGRATE_EXECUTE", "agency_migrations", id, {});

      res.json({ message: "Migration démarrée", migrationId: id });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/migrations/:id/execute');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/migrations/:id/cancel - Annuler une migration
  app.post("/api/agences/migrations/:id/cancel", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = (req as any).session?.userId;

      await agencyMigrationService.cancelMigration(id, reason || "Annulée par l'administrateur", userId);

      const migration = await agencyMigrationService.getMigrationStatus(id);

      await logAudit(req, "MIGRATE_CANCEL", "agency_migrations", id, { reason });

      res.json(migration);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/migrations/:id/cancel');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/migrations/:id/rollback - Rollback d'une migration complétée
  app.post("/api/agences/migrations/:id/rollback", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).session?.userId;
      const ipAddress = req.ip;

      const result = await agencyMigrationService.rollbackMigration(id, { userId, ipAddress });

      await logAudit(req, "MIGRATE_ROLLBACK", "agency_migrations", id, { report: result.report });

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/migrations/:id/rollback');
      if (error instanceof MigrationError) {
        const status = error.code === "NOT_FOUND" ? 404 : error.code === "ROLLBACK_EXPIRED" ? 410 : 400;
        return res.status(status).json({ error: error.message, code: error.code, details: error.details });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/migrations/:id/status - Statut de migration
  app.get("/api/agences/migrations/:id/status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const migration = await agencyMigrationService.getMigrationStatus(id);

      if (!migration) {
        return res.status(404).json({ error: "Migration non trouvée" });
      }

      res.json(migration);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/migrations/:id/status');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/migrations/:id/pre-flight-checks - Résultats des vérifications
  app.get("/api/agences/migrations/:id/pre-flight-checks", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const checks = await agencyMigrationService.getMigrationPreFlightChecks(id);

      res.json(checks);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/migrations/:id/pre-flight-checks');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/migrations/:id/audit-logs - Logs d'audit
  app.get("/api/agences/migrations/:id/audit-logs", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const logs = await agencyMigrationService.getMigrationAuditLogs(id);

      res.json(logs);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/migrations/:id/audit-logs');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/migrations/:id/entities - Entités migrées
  app.get("/api/agences/migrations/:id/entities", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { type } = req.query;

      const entities = await agencyMigrationService.getMigrationEntityLogs(id, type as string | undefined);

      res.json(entities);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/migrations/:id/entities');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/migrations/:id/report - Télécharger le rapport
  app.get("/api/agences/migrations/:id/report", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const migration = await agencyMigrationService.getMigrationStatus(id);

      if (!migration) {
        return res.status(404).json({ error: "Migration non trouvée" });
      }

      if (!migration.report) {
        return res.status(400).json({ error: "Aucun rapport disponible pour cette migration" });
      }

      // Retourner le rapport JSON (peut être transformé en PDF côté client ou via un service dédié)
      res.json({
        reference: migration.reference,
        sourceAgencyId: migration.sourceAgencyId,
        status: migration.statut,
        report: migration.report,
        completedAt: migration.completedAt
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/migrations/:id/report');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/:id/migrations - Liste des migrations d'une agence
  app.get("/api/agences/:id/migrations", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const migrations = await db
        .select()
        .from(agencyMigrations)
        .where(eq(agencyMigrations.sourceAgencyId, id))
        .orderBy(desc(agencyMigrations.createdAt));

      res.json(migrations);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/:id/migrations');
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // LEGACY ROUTE (Backward Compatibility)
  // ============================================

  // POST /api/agences/:id/migrate - Ancienne route (redirige vers la nouvelle)
  app.post("/api/agences/:id/migrate", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const { targetAgenceClients, targetAgenceEmployes, targetAgenceCoffre } = req.body;
      const userId = (req as any).session?.userId;

      // Créer la migration
      const migration = await agencyMigrationService.createMigration({
        sourceAgencyId: id,
        targetClientsAgencyId: targetAgenceClients,
        targetEmployeesAgencyId: targetAgenceEmployes,
        targetTreasuryAgencyId: targetAgenceCoffre,
        createdBy: userId
      });

      // Soumettre immédiatement
      await agencyMigrationService.submitMigration(migration.id, userId);

      // Lancer l'exécution
      agencyMigrationService.processMigration(migration.id, { userId }).catch(err => {
        logger.error({ err }, 'Background Migration Failed');
      });

      await logAudit(req, "MIGRATE", "agences", id, { migrationId: migration.id });

      res.status(201).json(migration);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/migrate');
      if (error instanceof MigrationError) {
        return res.status(400).json({ error: error.message, code: error.code, details: error.details });
      }
      res.status(500).json({ error: error.message });
    }
  });
}
