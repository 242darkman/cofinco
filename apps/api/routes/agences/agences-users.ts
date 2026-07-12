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


export function registerAgencesUsersRoutes(app: Express) {
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
}
