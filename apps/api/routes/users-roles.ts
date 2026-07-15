/**
 * Routes de gestion des rôles utilisateur (Architecture V3 — userRoles).
 * Extrait de users-permissions.ts pour respecter la limite de 400 lignes.
 */
import type { Express } from "express";
import { users, userRoles, agences } from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { logAudit } from "../audit";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { createLogger } from "../lib/logger";

const logger = createLogger('Auth');

export function registerUsersRolesRoutes(app: Express) {
  app.get("/api/users/:userId/roles", requireAuth, attachAbility, async (req, res) => {
    try {
      const { userId } = req.params;
      const requesterId = req.session.user!.id;

      // Un utilisateur peut voir ses propres rôles, sinon il faut MANAGE_ROLES
      if (userId !== requesterId) {
        if (!req.ability?.can(Actions.MANAGE_ROLES, Subjects.USER)) {
          return res.status(403).json({ error: "Non autorisé à voir les rôles de cet utilisateur" });
        }
      }

      const roles = await db.select({
        id: userRoles.id,
        role: userRoles.role,
        agenceId: userRoles.agenceId,
        isPrimary: userRoles.isPrimary,
        createdAt: userRoles.createdAt,
      })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

      // Enrichir avec le nom de l'agence si disponible
      const enrichedRoles = await Promise.all(roles.map(async (r) => {
        let agenceNom = null;
        if (r.agenceId) {
          const [agence] = await db.select({ nom: agences.nom }).from(agences).where(eq(agences.id, r.agenceId));
          agenceNom = agence?.nom || null;
        }
        return {
          ...r,
          agenceNom,
        };
      }));

      res.json(enrichedRoles);
    } catch (error) {
      logger.error({ err: error }, 'Get user roles error');
      res.status(500).json({ error: "Erreur lors de la récupération des rôles" });
    }
  });

  /**
   * POST /api/users/:userId/roles - Ajouter un rôle à un utilisateur
   */
  app.post("/api/users/:userId/roles", requireAuth, attachAbility, requireAbility(Actions.MANAGE_ROLES, Subjects.USER), async (req, res) => {
    try {
      const { userId } = req.params;
      const { role, agenceId, isPrimary } = req.body;

      if (!role || !Object.values(SystemRole).includes(role)) {
        return res.status(400).json({ error: "Rôle invalide" });
      }

      // Vérifier que l'utilisateur existe
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ error: "Utilisateur non trouvé" });
      }

      // Ajouter le rôle
      const [newRole] = await db.insert(userRoles).values({
        userId,
        role,
        agenceId: agenceId || null,
        isPrimary: isPrimary || false,
      }).returning();

      await logAudit(req, "ADD_USER_ROLE", "user", userId, { role, agenceId }, "success", "high");

      res.status(201).json(newRole);
    } catch (error: any) {
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({ error: "Ce rôle existe déjà pour cet utilisateur et cette agence" });
      }
      logger.error({ err: error }, 'Add user role error');
      res.status(500).json({ error: "Erreur lors de l'ajout du rôle" });
    }
  });

  /**
   * DELETE /api/users/:userId/roles/:roleId - Supprimer un rôle
   */
  app.delete("/api/users/:userId/roles/:roleId", requireAuth, attachAbility, requireAbility(Actions.MANAGE_ROLES, Subjects.USER), async (req, res) => {
    try {
      const { userId, roleId } = req.params;

      // Vérifier que le rôle appartient bien à l'utilisateur
      const [existingRole] = await db.select()
        .from(userRoles)
        .where(and(eq(userRoles.id, roleId), eq(userRoles.userId, userId)));

      if (!existingRole) {
        return res.status(404).json({ error: "Rôle non trouvé" });
      }

      // Ne pas permettre de supprimer le dernier rôle
      const [roleCount] = await db.select({ count: userRoles.id })
        .from(userRoles)
        .where(eq(userRoles.userId, userId));

      // @ts-ignore - count returns a string
      if (parseInt(roleCount?.count || '0') <= 1) {
        return res.status(400).json({ error: "Impossible de supprimer le dernier rôle d'un utilisateur" });
      }

      await db.delete(userRoles).where(eq(userRoles.id, roleId));

      await logAudit(req, "REMOVE_USER_ROLE", "user", userId, { roleId, role: existingRole.role }, "success", "high");

      res.json({ message: "Rôle supprimé avec succès" });
    } catch (error) {
      logger.error({ err: error }, 'Delete user role error');
      res.status(500).json({ error: "Erreur lors de la suppression du rôle" });
    }
  });

  /**
   * PUT /api/users/:userId/roles/:roleId/primary - Définir un rôle comme principal
   */
  app.put("/api/users/:userId/roles/:roleId/primary", requireAuth, attachAbility, async (req, res) => {
    try {
      const { userId, roleId } = req.params;
      const requesterId = req.session.user!.id;

      // Un utilisateur peut changer son propre rôle principal, sinon il faut MANAGE_ROLES
      if (userId !== requesterId) {
        if (!req.ability?.can(Actions.MANAGE_ROLES, Subjects.USER)) {
          return res.status(403).json({ error: "Non autorisé à modifier les rôles de cet utilisateur" });
        }
      }

      // Vérifier que le rôle appartient à l'utilisateur
      const [existingRole] = await db.select()
        .from(userRoles)
        .where(and(eq(userRoles.id, roleId), eq(userRoles.userId, userId)));

      if (!existingRole) {
        return res.status(404).json({ error: "Rôle non trouvé" });
      }

      // Transaction: désactiver les autres rôles principaux et activer celui-ci
      await db.transaction(async (tx) => {
        await tx.update(userRoles)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true)));

        await tx.update(userRoles)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(eq(userRoles.id, roleId));
      });

      await logAudit(req, "SET_PRIMARY_ROLE", "user", userId, { roleId, role: existingRole.role }, "success", "medium");

      res.json({ message: "Rôle principal mis à jour" });
    } catch (error) {
      logger.error({ err: error }, 'Set primary role error');
      res.status(500).json({ error: "Erreur lors de la mise à jour du rôle principal" });
    }
  });
}
