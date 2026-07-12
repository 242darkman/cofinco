import { Express } from "express";
import { createLogger } from "../../lib/logger";
import { db } from "../../db";

const logger = createLogger('Routes:Agences');
import { agences, userAgences, users, coffresForts, comptesLiaison, userRoles } from "@shared/schema";
import { employes } from "@shared/schema/employes";
import { clients } from "@shared/schema/clients";
import { eq, and, ilike, or, desc, asc, sql, ne, isNull } from "drizzle-orm";
import { villes } from "@shared/schema/operations";
import { regions } from "@shared/schema/geography";
import { pays as paysTable } from "@shared/schema/pays";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../../audit";
import * as coffresQueries from "../../services/transfert-inter-coffres/coffres-queries";
import * as coffresOperations from "../../services/transfert-inter-coffres/coffres-operations";
import * as coffresCreation from "../../services/transfert-inter-coffres/coffres-creation";
import {
  agencyMigrations,
  migrationPreFlightChecks,
  migrationAuditLogs,
  migrationEntityLogs,
  MIGRATION_STATUS
} from "@shared/schema/agency_migration";
import { agencyMigrationService, MigrationError } from "../../services/agency-migration";
import { getWsInstance } from "../../ws-server";
import { TypeAgence, StatutAgence, AGENCY_STATUS_TRANSITIONS, StatutUser, StatutClient } from "@shared/enum/status-constants";
import { agencyStatusHistory } from "@shared/schema/agences";
import { getAgencyActivationChecklist } from "../../services/agency-checklist";
import { currencyCode } from "@shared/config/currency";
import { normalizePhone } from "@shared/utils/phone";


export function registerAgencesCoreRoutes(app: Express) {
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
          region: regions.nom,
          pays: paysTable.nomFr,
          paysId: villes.paysId,
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
        .leftJoin(paysTable, eq(villes.paysId, paysTable.id));

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
          region: regions.nom,
          pays: paysTable.nomFr,
          paysId: villes.paysId,
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
        .leftJoin(paysTable, eq(villes.paysId, paysTable.id))
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
}
