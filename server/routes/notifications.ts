import type { Express, Router } from "express";
import { Router as createRouter } from "express";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../db";
import { notifications, users, clients, comptes, userAgences, agences } from "@shared/schema";
import { eq, and, or, desc, sql, inArray, isNull, gte } from "drizzle-orm";
import { z } from "zod";
import { getWsInstance } from "../ws-server";

// ============================================
// NOTIFICATIONS CAISSE - For cashier workflow
// ============================================

// Schema for caisse notifications (pending account activations, payments to validate, etc.)
const updateNotificationSchema = z.object({
  statut: z.enum(["READ", "PROCESSED", "ARCHIVED"]).optional(),
  traite_par: z.string().uuid().optional(),
  date_traitement: z.string().optional(),
  notes_traitement: z.string().optional(),
});

// Notification types specific to caisse
const CAISSE_NOTIFICATION_TYPES = [
  "payment_pending",      // Mobile money payment awaiting validation
  "account_activation",   // Account pending activation after payment
  "deposit_pending",      // Deposit waiting for validation
  "withdrawal_pending",   // Withdrawal waiting for processing
  "transfer_pending",     // Transfer waiting for approval
];

export function registerNotificationsRoutes(app: Express) {
  const router = createRouter();

  // ============================================
  // GET /api/notifications-caisse
  // List notifications for caisse (payments pending, account activations)
  // ============================================
  router.get("/", requireAuth, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Non autorisé" });

      const { statut, type, limit = "50" } = req.query;

      // Parse statut filter (can be comma-separated)
      const statutFilter = statut
        ? (statut as string).split(",").map(s => s.trim())
        : ["Non lue", "Lue"];

      // Map frontend statut names to DB values
      const statutMap: Record<string, boolean> = {
        "Non lue": false,
        "Lue": true,
        "Traitée": true,
        "Archivée": true,
      };

      // Get user's agency for filtering
      const [userAgence] = await db
        .select({ agenceId: userAgences.agenceId })
        .from(userAgences)
        .where(and(
          eq(userAgences.userId, req.user.id),
          eq(userAgences.isPrimary, true),
          eq(userAgences.actif, true)
        ))
        .limit(1);

      // Build query conditions
      const conditions = [
        inArray(notifications.type, CAISSE_NOTIFICATION_TYPES),
      ];

      // Filter by read status based on statut
      if (statutFilter.includes("Non lue") && !statutFilter.includes("Lue")) {
        conditions.push(eq(notifications.lue, false));
      } else if (statutFilter.includes("Lue") && !statutFilter.includes("Non lue")) {
        conditions.push(eq(notifications.lue, true));
      }

      // Only show non-expired notifications
      conditions.push(
        or(
          isNull(notifications.expiresAt),
          gte(notifications.expiresAt, new Date())
        )!
      );

      // Fetch notifications with related data
      const result = await db
        .select({
          id: notifications.id,
          type_notification: notifications.type,
          titre: notifications.titre,
          message: notifications.message,
          priorite: notifications.priorite,
          lue: notifications.lue,
          referenceId: notifications.referenceId,
          referenceType: notifications.referenceType,
          created_at: notifications.createdAt,
          userId: notifications.userId,
        })
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(parseInt(limit as string));

      // Enrich with related data (client info, compte info)
      const enrichedNotifications = await Promise.all(
        result.map(async (notif) => {
          let clientInfo = null;
          let compteInfo = null;

          // If reference is a compte, get compte and client info
          if (notif.referenceType === "compte" && notif.referenceId) {
            const [compte] = await db
              .select({
                id: comptes.id,
                numeroCompte: comptes.numeroCompte,
                typeCompte: comptes.typeCompte,
                clientId: comptes.clientId,
              })
              .from(comptes)
              .where(eq(comptes.id, notif.referenceId))
              .limit(1);

            if (compte) {
              compteInfo = compte;

              // Get client info
              const [client] = await db
                .select({
                  id: clients.id,
                  nom: users.nom,
                  prenom: users.prenom,
                  telephone: users.telephone,
                })
                .from(clients)
                .leftJoin(users, eq(clients.userId, users.id))
                .where(eq(clients.id, compte.clientId))
                .limit(1);

              if (client) {
                clientInfo = client;
              }
            }
          }

          // If reference is a client directly
          if (notif.referenceType === "client" && notif.referenceId) {
            const [client] = await db
              .select({
                id: clients.id,
                nom: users.nom,
                prenom: users.prenom,
                telephone: users.telephone,
              })
              .from(clients)
              .leftJoin(users, eq(clients.userId, users.id))
              .where(eq(clients.id, notif.referenceId))
              .limit(1);

            if (client) {
              clientInfo = client;
            }
          }

          // Parse metadata from message if it contains JSON
          let montant = 0;
          let modePaiement = "";
          let referenceExterne = "";

          try {
            // Check if message contains structured data
            const metaMatch = notif.message.match(/\[META:(.*?)\]/);
            if (metaMatch) {
              const meta = JSON.parse(metaMatch[1]);
              montant = meta.montant || 0;
              modePaiement = meta.modePaiement || "";
              referenceExterne = meta.referenceExterne || "";
            }
          } catch {
            // Ignore parsing errors
          }

          return {
            id: notif.id,
            type_notification: notif.type_notification,
            compte_id: compteInfo?.id || null,
            client_id: clientInfo?.id || null,
            titre: notif.titre,
            message: notif.message.replace(/\[META:.*?\]/, "").trim(),
            mode_paiement: modePaiement,
            montant,
            reference_externe: referenceExterne,
            priorite: mapPriorityToFrontend(notif.priorite),
            statut: notif.lue ? "Lue" : "Non lue",
            created_at: notif.created_at,
            client_nom: clientInfo ? `${clientInfo.prenom || ""} ${clientInfo.nom || ""}`.trim() : null,
            client_phone: clientInfo?.telephone || null,
            numero_compte: compteInfo?.numeroCompte || null,
            type_compte: compteInfo?.typeCompte || null,
          };
        })
      );

      res.json(enrichedNotifications);
    } catch (error) {
      console.error("Error fetching caisse notifications:", error);
      res.status(500).json({ error: "Erreur lors du chargement des notifications" });
    }
  });

  // ============================================
  // PATCH /api/notifications-caisse/:id
  // Update notification status (mark as read, processed)
  // ============================================
  router.patch("/:id", requireAuth, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Non autorisé" });

      const { id } = req.params;
      const data = updateNotificationSchema.parse(req.body);

      // Map frontend status to DB field
      let lue = undefined;
      if (data.statut === "READ" || data.statut === "PROCESSED" || data.statut === "ARCHIVED") {
        lue = true;
      }

      const [updated] = await db
        .update(notifications)
        .set({
          lue: lue ?? undefined,
        })
        .where(eq(notifications.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Notification non trouvée" });
      }

      // Broadcast update via WebSocket
      const wsInstance = getWsInstance();
      if (wsInstance && updated.userId) {
        wsInstance.sendToUser(updated.userId, {
          type: "NOTIFICATION",
          payload: {
            action: "updated",
            notification: updated,
          },
        });
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("Error updating notification:", error);
      res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
  });

  // ============================================
  // GET /api/notifications-caisse/count
  // Get count of unread caisse notifications
  // ============================================
  router.get("/count", requireAuth, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Non autorisé" });

      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(and(
          inArray(notifications.type, CAISSE_NOTIFICATION_TYPES),
          eq(notifications.lue, false),
          or(
            isNull(notifications.expiresAt),
            gte(notifications.expiresAt, new Date())
          )
        ));

      res.json({ count: Number(result?.count || 0) });
    } catch (error) {
      console.error("Error counting notifications:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // Mount caisse notifications router
  app.use("/api/notifications-caisse", router);

  // ============================================
  // GENERAL NOTIFICATIONS API
  // ============================================

  // GET /api/notifications - User's notifications
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Non autorisé" });

      const { unreadOnly, type, limit = "50" } = req.query;

      const conditions = [eq(notifications.userId, req.user.id)];

      if (unreadOnly === "true") {
        conditions.push(eq(notifications.lue, false));
      }

      if (type && typeof type === "string") {
        conditions.push(eq(notifications.type, type));
      }

      // Only non-expired
      conditions.push(
        or(
          isNull(notifications.expiresAt),
          gte(notifications.expiresAt, new Date())
        )!
      );

      const result = await db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(parseInt(limit as string));

      res.json(result);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // POST /api/notifications - Create notification (admin/system)
  app.post("/api/notifications", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.NOTIFICATION), async (req, res) => {
    try {
      const { userId, type, titre, message, lien, priorite, referenceId, referenceType, expiresAt } = req.body;

      const [notification] = await db
        .insert(notifications)
        .values({
          userId,
          type,
          titre,
          message,
          lien,
          priorite: priorite || "NORMAL",
          referenceId,
          referenceType,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        })
        .returning();

      // Broadcast via WebSocket
      const wsInstance = getWsInstance();
      if (wsInstance && userId) {
        wsInstance.sendToUser(userId, {
          type: "NOTIFICATION",
          payload: {
            action: "created",
            notification,
          },
        });
      }

      res.status(201).json(notification);
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // PATCH /api/notifications/:id/read - Mark as read
  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Non autorisé" });

      const { id } = req.params;

      const [updated] = await db
        .update(notifications)
        .set({ lue: true })
        .where(and(
          eq(notifications.id, id),
          eq(notifications.userId, req.user.id)
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Notification non trouvée" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // POST /api/notifications/mark-all-read - Mark all as read
  app.post("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Non autorisé" });

      await db
        .update(notifications)
        .set({ lue: true })
        .where(and(
          eq(notifications.userId, req.user.id),
          eq(notifications.lue, false)
        ));

      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all as read:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // GET /api/notifications/unread-count
  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Non autorisé" });

      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(and(
          eq(notifications.userId, req.user.id),
          eq(notifications.lue, false),
          or(
            isNull(notifications.expiresAt),
            gte(notifications.expiresAt, new Date())
          )
        ));

      res.json({ count: Number(result?.count || 0) });
    } catch (error) {
      console.error("Error counting unread:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });
}

// ============================================
// NOTIFICATION SERVICE - For creating notifications from other services
// ============================================

export interface CreateNotificationParams {
  userId?: string;
  type: string;
  titre: string;
  message: string;
  lien?: string;
  priorite?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  referenceId?: string;
  referenceType?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * Create a notification and broadcast via WebSocket
 */
export async function createNotification(params: CreateNotificationParams) {
  const { metadata, ...notificationData } = params;

  // Embed metadata in message if provided
  let message = notificationData.message;
  if (metadata) {
    message = `${message} [META:${JSON.stringify(metadata)}]`;
  }

  const [notification] = await db
    .insert(notifications)
    .values({
      ...notificationData,
      message,
      priorite: notificationData.priorite || "NORMAL",
    })
    .returning();

  // Broadcast via WebSocket
  const wsInstance = getWsInstance();
  if (wsInstance && params.userId) {
    wsInstance.sendToUser(params.userId, {
      type: "NOTIFICATION",
      payload: {
        action: "created",
        notification: {
          ...notification,
          message: params.message, // Send clean message to client
        },
      },
    });
  }

  return notification;
}

/**
 * Create notification for pending payment validation (caisse)
 */
export async function createPaymentPendingNotification(
  compteId: string,
  clientId: string,
  montant: number,
  modePaiement: string,
  referenceExterne?: string
) {
  // Get caissiers for notification (they will see this in their dashboard)
  // For now we create a general notification that caissiers can query
  return createNotification({
    type: "payment_pending",
    titre: "Paiement en attente de validation",
    message: `Un paiement de ${montant.toLocaleString()} FCFA par ${modePaiement} est en attente de validation.`,
    priorite: "HIGH",
    referenceId: compteId,
    referenceType: "compte",
    metadata: {
      montant,
      modePaiement,
      referenceExterne,
      clientId,
    },
  });
}

/**
 * Create notification for account activation pending
 */
export async function createAccountActivationNotification(
  compteId: string,
  clientId: string,
  numeroCompte: string,
  typeCompte: string
) {
  return createNotification({
    type: "account_activation",
    titre: "Compte en attente d'activation",
    message: `Le compte ${numeroCompte} (${typeCompte}) est en attente d'activation.`,
    priorite: "NORMAL",
    referenceId: compteId,
    referenceType: "compte",
    metadata: {
      clientId,
      numeroCompte,
      typeCompte,
    },
  });
}

// Helper to map DB priority to frontend format
function mapPriorityToFrontend(priority: string | null): "Basse" | "Normal" | "Haute" | "Urgente" {
  switch (priority?.toUpperCase()) {
    case "LOW":
      return "Basse";
    case "HIGH":
      return "Haute";
    case "URGENT":
      return "Urgente";
    default:
      return "Normal";
  }
}
