import { Express } from "express";
import { createLogger } from "../lib/logger";
import { db } from "../db";

const logger = createLogger('Routes:Agences');
import { agences, userAgences, users, coffresForts, comptesLiaison, userRoles } from "../../shared/schema";
import { employes } from "../../shared/schema/employes";
import { clients } from "../../shared/schema/clients";
import { eq, and, ilike, or, desc, asc, sql, ne, isNull } from "drizzle-orm";
import { villes } from "../../shared/schema/operations";
import { regions } from "../../shared/schema/geography";
import { pays as paysTable } from "../../shared/schema/pays";
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
import { TypeAgence, StatutAgence, AGENCY_STATUS_TRANSITIONS, StatutUser, StatutClient } from "../../shared/enum/status-constants";
import { agencyStatusHistory } from "../../shared/schema/agences";
import { getAgencyActivationChecklist } from "../services/agency-checklist";
import { currencyCode } from "@shared/config/currency";
import { normalizePhone } from "@shared/utils/phone";

export function registerAgencesRoutes(app: Express) {
  // ============================================
  // AGENCES CRUD
  // ============================================

  // GET /api/agences - Liste des agences avec comptes calculés
  app.get("/api/agences", requireAuth, async (req, res) => {
    try {
      const { statut, type, search, sortBy = "nom", sortOrder = "asc", includeDeleted } = req.query;

      // Requête principale avec sous-requêtes scalaires corrélées
      let query = db
        .select({
          id: agences.id,
          codeAgence: agences.codeAgence,
          nom: agences.nom,
          typeAgence: agences.typeAgence,
          adresse: agences.adresse,
          ville: villes.nom,
          villeId: agences.villeId,
          paysId: agences.paysId,
          region: regions.nom,
          pays: paysTable.nomFr,
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
          activatedAt: agences.activatedAt,
          suspendedAt: agences.suspendedAt,
          suspendedReason: agences.suspendedReason,
          deletedAt: agences.deletedAt,
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
        .from(agences)
        .leftJoin(villes, eq(agences.villeId, villes.id))
        .leftJoin(regions, eq(villes.regionId, regions.id))
        .leftJoin(paysTable, eq(agences.paysId, paysTable.id));

      // Filtres
      const conditions = [];

      // Soft-delete filter: exclude deleted by default
      if (includeDeleted !== "true") {
        conditions.push(isNull(agences.deletedAt));
      }

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
            ilike(villes.nom, searchTerm)
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
        .select({
          id: agences.id,
          codeAgence: agences.codeAgence,
          nom: agences.nom,
          typeAgence: agences.typeAgence,
          adresse: agences.adresse,
          ville: villes.nom,
          villeId: agences.villeId,
          paysId: agences.paysId,
          region: regions.nom,
          pays: paysTable.nomFr,
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
          activatedAt: agences.activatedAt,
          activatedBy: agences.activatedBy,
          suspendedAt: agences.suspendedAt,
          suspendedReason: agences.suspendedReason,
          deletedAt: agences.deletedAt,
          createdAt: agences.createdAt,
          updatedAt: agences.updatedAt,
        })
        .from(agences)
        .leftJoin(villes, eq(agences.villeId, villes.id))
        .leftJoin(regions, eq(villes.regionId, regions.id))
        .leftJoin(paysTable, eq(agences.paysId, paysTable.id))
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
      const userId = req.session?.userId;
      const coffresService = new CoffresFortsService();

      // Vérifier que le code_agence est unique
      const existing = await db
        .select()
        .from(agences)
        .where(eq(agences.codeAgence, data.code_agence || data.codeAgence));

      if (existing.length > 0) {
        return res.status(400).json({ error: "Ce code agence existe déjà" });
      }

      // Auto-fill GPS from ville if villeId is provided
      let lat = data.latitude;
      let lng = data.longitude;
      const villeId = data.villeId || data.ville_id;

      if (villeId) {
        const [villeData] = await db
          .select({
            latitude: villes.latitude,
            longitude: villes.longitude,
          })
          .from(villes)
          .where(eq(villes.id, villeId));

        if (villeData) {
          lat = lat ?? (villeData.latitude ? Number(villeData.latitude) : undefined);
          lng = lng ?? (villeData.longitude ? Number(villeData.longitude) : undefined);
        }
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
            villeId: villeId || null,
            paysId: data.paysId || data.pays_id || null,
            telephone: normalizePhone(data.telephone),
            email: data.email,
            responsableId: data.responsable_id || data.responsableId,
            responsableNom: data.responsable_nom || data.responsableNom,
            responsablePhone: normalizePhone(data.responsable_phone || data.responsablePhone),
            statut: StatutAgence.DRAFT,
            dateOuverture: data.date_ouverture || data.dateOuverture,
            latitude: lat,
            longitude: lng,
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
            devise: currencyCode(),
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

        // 4. Log initial status history
        await tx
          .insert(agencyStatusHistory)
          .values({
            agenceId: newAgence.id,
            fromStatus: null,
            toStatus: StatutAgence.DRAFT,
            changedBy: userId!,
          });

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
      const userId = req.session?.userId;

      // Auto-fill GPS from ville if villeId is provided
      let lat = data.latitude;
      let lng = data.longitude;
      const villeId = data.villeId || data.ville_id;

      if (villeId) {
        const [villeData] = await db
          .select({
            latitude: villes.latitude,
            longitude: villes.longitude,
          })
          .from(villes)
          .where(eq(villes.id, villeId));

        if (villeData) {
          lat = lat ?? (villeData.latitude ? Number(villeData.latitude) : undefined);
          lng = lng ?? (villeData.longitude ? Number(villeData.longitude) : undefined);
        }
      }

      // Statut changes are handled via dedicated transition routes (submit/activate/suspend/close)
      const [updated] = await db
        .update(agences)
        .set({
          nom: data.nom,
          typeAgence: data.type_agence || data.typeAgence,
          adresse: data.adresse,
          villeId: villeId || undefined,
          paysId: data.paysId || data.pays_id || undefined,
          telephone: data.telephone ? normalizePhone(data.telephone) : data.telephone,
          email: data.email,
          responsableId: data.responsable_id || data.responsableId,
          responsableNom: data.responsable_nom || data.responsableNom,
          responsablePhone: normalizePhone(data.responsable_phone || data.responsablePhone),
          dateOuverture: data.date_ouverture || data.dateOuverture,
          latitude: lat,
          longitude: lng,
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
      const userId = req.session?.userId;

      // Vérifier qu'il reste au moins 2 agences actives avant d'en supprimer une
      const [activeCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(agences)
        .where(and(isNull(agences.deletedAt), eq(agences.statut, StatutAgence.ACTIVE)));

      if (Number(activeCount?.count || 0) <= 1) {
        return res.status(400).json({
          error: "Impossible de supprimer la dernière agence active"
        });
      }

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
            ville: villes.nom,
            statut: agences.statut
          }
        })
        .from(userAgences)
        .innerJoin(agences, eq(userAgences.agenceId, agences.id))
        .leftJoin(villes, eq(agences.villeId, villes.id))
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
      const userId = req.session?.userId;

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
            ville: villes.nom,
            statut: agences.statut
          }
        })
        .from(userAgences)
        .innerJoin(agences, eq(userAgences.agenceId, agences.id))
        .leftJoin(villes, eq(agences.villeId, villes.id))
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
      const adminUserId = req.session?.userId;

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
      const adminUserId = req.session?.userId;

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
      const adminUserId = req.session?.userId;

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
  // AGENCY STATUS WORKFLOW ROUTES
  // ============================================

  // Helper: validate transition
  function isValidTransition(from: string, to: string): boolean {
    const allowed = AGENCY_STATUS_TRANSITIONS[from as keyof typeof AGENCY_STATUS_TRANSITIONS];
    return Array.isArray(allowed) && allowed.includes(to as any);
  }

  // POST /api/agences/:id/submit - Submit agency for approval (DRAFT → PENDING_APPROVAL)
  app.post("/api/agences/:id/submit", attachAbility, requireAbility(Actions.EDIT, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      const { comment } = req.body || {};

      const [agency] = await db.select().from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });
      if (!isValidTransition(agency.statut, StatutAgence.PENDING_APPROVAL)) {
        return res.status(400).json({
          error: `Transition invalide: ${agency.statut} → PENDING_APPROVAL`,
          currentStatus: agency.statut,
        });
      }

      // Basic data completeness check
      const missing: string[] = [];
      if (!agency.codeAgence) missing.push("Code agence");
      if (!agency.nom) missing.push("Nom");
      if (!agency.typeAgence) missing.push("Type d'agence");
      if (!agency.villeId) missing.push("Ville");
      if (missing.length > 0) {
        return res.status(400).json({
          error: "Données incomplètes pour la soumission",
          missingFields: missing,
        });
      }

      await db.transaction(async (tx) => {
        await tx.update(agences)
          .set({ statut: StatutAgence.PENDING_APPROVAL, updatedAt: new Date() })
          .where(eq(agences.id, id));

        await tx.insert(agencyStatusHistory).values({
          agenceId: id,
          fromStatus: agency.statut,
          toStatus: StatutAgence.PENDING_APPROVAL,
          changedBy: userId!,
          reason: comment || null,
        });
      });

      await logAudit(req, "SUBMIT_APPROVAL", "agences", id, {
        fromStatus: agency.statut,
        toStatus: StatutAgence.PENDING_APPROVAL,
        comment,
      });

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_submitted', id } });
      }

      res.json({ message: "Agence soumise pour validation", status: StatutAgence.PENDING_APPROVAL });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/submit');
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/:id/activate - Activate agency (PENDING_APPROVAL → ACTIVE or SUSPENDED → ACTIVE)
  app.post("/api/agences/:id/activate", attachAbility, requireAbility(Actions.APPROVE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;

      const [agency] = await db.select().from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });

      // Allow activation from PENDING_APPROVAL or reactivation from SUSPENDED
      const targetStatus = StatutAgence.ACTIVE;
      if (!isValidTransition(agency.statut, targetStatus)) {
        return res.status(400).json({
          error: `Transition invalide: ${agency.statut} → ACTIVE`,
          currentStatus: agency.statut,
        });
      }

      // Run full checklist
      const checklist = await getAgencyActivationChecklist(id);
      if (!checklist.ready) {
        const failedItems = checklist.items.filter(i => i.required && !i.passed);
        return res.status(400).json({
          error: "La checklist d'activation n'est pas complète",
          checklist,
          failedItems: failedItems.map(i => ({
            key: i.key,
            label: i.label,
            details: i.details,
          })),
        });
      }

      await db.transaction(async (tx) => {
        await tx.update(agences)
          .set({
            statut: targetStatus,
            activatedAt: new Date(),
            activatedBy: userId!,
            suspendedAt: null,
            suspendedReason: null,
            updatedAt: new Date(),
          })
          .where(eq(agences.id, id));

        await tx.insert(agencyStatusHistory).values({
          agenceId: id,
          fromStatus: agency.statut,
          toStatus: targetStatus,
          changedBy: userId!,
          checklistSnapshot: checklist,
        });
      });

      await logAudit(req, "ACTIVATE", "agences", id, {
        fromStatus: agency.statut,
        toStatus: targetStatus,
        checklistSnapshot: checklist,
      }, "SUCCESS", "HIGH");

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_activated', id } });
      }

      res.json({ message: "Agence activée avec succès", status: targetStatus });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/activate');
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/:id/reject - Reject and send back to draft (PENDING_APPROVAL → DRAFT)
  app.post("/api/agences/:id/reject", attachAbility, requireAbility(Actions.APPROVE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      const { reason } = req.body || {};

      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        return res.status(400).json({ error: "Une raison est obligatoire pour le rejet" });
      }

      const [agency] = await db.select().from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });
      if (agency.statut !== StatutAgence.PENDING_APPROVAL) {
        return res.status(400).json({
          error: `Seule une agence en attente de validation peut être rejetée (statut actuel: ${agency.statut})`,
          currentStatus: agency.statut,
        });
      }

      await db.transaction(async (tx) => {
        await tx.update(agences)
          .set({ statut: StatutAgence.DRAFT, updatedAt: new Date() })
          .where(eq(agences.id, id));

        await tx.insert(agencyStatusHistory).values({
          agenceId: id,
          fromStatus: StatutAgence.PENDING_APPROVAL,
          toStatus: StatutAgence.DRAFT,
          changedBy: userId!,
          reason: reason.trim(),
        });
      });

      await logAudit(req, "REJECT", "agences", id, {
        fromStatus: StatutAgence.PENDING_APPROVAL,
        toStatus: StatutAgence.DRAFT,
        reason: reason.trim(),
      });

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_rejected', id } });
      }

      res.json({ message: "Agence renvoyée en brouillon", status: StatutAgence.DRAFT });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/reject');
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/:id/suspend - Suspend agency (ACTIVE → SUSPENDED)
  app.post("/api/agences/:id/suspend", attachAbility, requireAbility(Actions.SUSPEND, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      const { reason } = req.body || {};

      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        return res.status(400).json({ error: "Une raison est obligatoire pour la suspension" });
      }

      const [agency] = await db.select().from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });
      if (!isValidTransition(agency.statut, StatutAgence.SUSPENDED)) {
        return res.status(400).json({
          error: `Transition invalide: ${agency.statut} → SUSPENDED`,
          currentStatus: agency.statut,
        });
      }

      await db.transaction(async (tx) => {
        await tx.update(agences)
          .set({
            statut: StatutAgence.SUSPENDED,
            suspendedAt: new Date(),
            suspendedReason: reason.trim(),
            updatedAt: new Date(),
          })
          .where(eq(agences.id, id));

        await tx.insert(agencyStatusHistory).values({
          agenceId: id,
          fromStatus: agency.statut,
          toStatus: StatutAgence.SUSPENDED,
          changedBy: userId!,
          reason: reason.trim(),
        });
      });

      await logAudit(req, "SUSPEND", "agences", id, {
        fromStatus: agency.statut,
        toStatus: StatutAgence.SUSPENDED,
        reason: reason.trim(),
      }, "SUCCESS", "HIGH");

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_suspended', id } });
      }

      res.json({ message: "Agence suspendue", status: StatutAgence.SUSPENDED });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/suspend');
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agences/:id/close - Close agency (ACTIVE → CLOSING_PENDING or CLOSING_PENDING → CLOSED)
  app.post("/api/agences/:id/close", attachAbility, requireAbility(Actions.MANAGE, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      const { reason } = req.body || {};

      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        return res.status(400).json({ error: "Une raison est obligatoire pour la clôture" });
      }

      const [agency] = await db.select().from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });

      // Determine target: ACTIVE/SUSPENDED → CLOSING_PENDING, CLOSING_PENDING → CLOSED
      let targetStatus: string;
      if (agency.statut === StatutAgence.CLOSING_PENDING) {
        targetStatus = StatutAgence.CLOSED;
      } else if (isValidTransition(agency.statut, StatutAgence.CLOSING_PENDING)) {
        targetStatus = StatutAgence.CLOSING_PENDING;
      } else {
        return res.status(400).json({
          error: `Impossible de clôturer depuis le statut: ${agency.statut}`,
          currentStatus: agency.statut,
        });
      }

      // For final CLOSED: check no active clients/employees
      if (targetStatus === StatutAgence.CLOSED) {
        const [activeUsers] = await db
          .select({ count: sql<number>`count(*)` })
          .from(userAgences)
          .where(and(eq(userAgences.agenceId, id), eq(userAgences.actif, true)));

        if (Number(activeUsers?.count || 0) > 0) {
          return res.status(400).json({
            error: "Impossible de clôturer: des utilisateurs sont encore assignés à cette agence",
          });
        }
      }

      await db.transaction(async (tx) => {
        await tx.update(agences)
          .set({ statut: targetStatus, updatedAt: new Date() })
          .where(eq(agences.id, id));

        await tx.insert(agencyStatusHistory).values({
          agenceId: id,
          fromStatus: agency.statut,
          toStatus: targetStatus,
          changedBy: userId!,
          reason: reason.trim(),
        });
      });

      await logAudit(req, "CLOSE", "agences", id, {
        fromStatus: agency.statut,
        toStatus: targetStatus,
        reason: reason.trim(),
      }, "SUCCESS", "HIGH");

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_closed', id } });
      }

      res.json({ message: targetStatus === StatutAgence.CLOSED ? "Agence clôturée" : "Clôture initiée", status: targetStatus });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur POST /api/agences/:id/close');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/:id/checklist - Get activation checklist status
  app.get("/api/agences/:id/checklist", attachAbility, requireAbility(Actions.VIEW, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;

      const [agency] = await db.select({ id: agences.id }).from(agences).where(eq(agences.id, id));
      if (!agency) return res.status(404).json({ error: "Agence non trouvée" });

      const checklist = await getAgencyActivationChecklist(id);
      res.json(checklist);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/:id/checklist');
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agences/:id/status-history - Get status transition history
  app.get("/api/agences/:id/status-history", attachAbility, requireAbility(Actions.VIEW, Subjects.AGENCE), async (req, res) => {
    try {
      const { id } = req.params;

      const history = await db
        .select({
          id: agencyStatusHistory.id,
          fromStatus: agencyStatusHistory.fromStatus,
          toStatus: agencyStatusHistory.toStatus,
          reason: agencyStatusHistory.reason,
          checklistSnapshot: agencyStatusHistory.checklistSnapshot,
          createdAt: agencyStatusHistory.createdAt,
          changedByName: sql<string>`COALESCE(${users.nom} || ' ' || COALESCE(${users.prenom}, ''), 'Système')`,
        })
        .from(agencyStatusHistory)
        .leftJoin(users, eq(agencyStatusHistory.changedBy, users.id))
        .where(eq(agencyStatusHistory.agenceId, id))
        .orderBy(desc(agencyStatusHistory.createdAt));

      res.json(history);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur GET /api/agences/:id/status-history');
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
      const userId = req.session?.userId;

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
      const userId = req.session?.userId;

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
      const userId = req.session?.userId;
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
      const userId = req.session?.userId;

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
      const userId = req.session?.userId;
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
      const userId = req.session?.userId;

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
