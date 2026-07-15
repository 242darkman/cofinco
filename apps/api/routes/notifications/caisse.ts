import { Router as createRouter } from "express";
import { createLogger } from "../../lib/logger";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../../db";
import { notifications, users, clients, comptes, userAgences } from "@shared/schema";
import { eq, and, or, desc, sql, inArray, isNull, gte } from "drizzle-orm";
import { z } from "zod";
import { getWsInstance } from "../../ws-server";

const logger = createLogger('Routes:Notifications:Caisse');

export const caisseNotificationsRouter = createRouter();

const updateNotificationSchema = z.object({
  statut: z.enum(["READ", "PROCESSED", "ARCHIVED"]).optional(),
  traite_par: z.string().uuid().optional(),
  date_traitement: z.string().optional(),
  notes_traitement: z.string().optional(),
});

const CAISSE_NOTIFICATION_TYPES = [
  "payment_pending",      // Mobile money payment awaiting validation
  "account_activation",   // Account pending activation after payment
  "deposit_pending",      // Deposit waiting for validation
  "withdrawal_pending",   // Withdrawal waiting for processing
  "transfer_pending",     // Transfer waiting for approval
];

// Helper to map DB priority to frontend format
function mapPriorityToFrontend(priority: string | null): "Basse" | "Normal" | "Haute" | "Urgente" {
  switch (priority?.toUpperCase()) {
    case "LOW": return "Basse";
    case "HIGH": return "Haute";
    case "URGENT": return "Urgente";
    default: return "Normal";
  }
}

caisseNotificationsRouter.get("/", requireAuth, attachAbility, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Non autorisé" });

    const { statut, type, limit = "50" } = req.query;

    const statutFilter = statut
      ? (statut as string).split(",").map(s => s.trim())
      : ["Non lue", "Lue"];

    const statutMap: Record<string, boolean> = {
      "Non lue": false,
      "Lue": true,
      "Traitée": true,
      "Archivée": true,
    };

    const [userAgence] = await db
      .select({ agenceId: userAgences.agenceId })
      .from(userAgences)
      .where(and(
        eq(userAgences.userId, req.user.id),
        eq(userAgences.isPrimary, true),
        eq(userAgences.actif, true)
      ))
      .limit(1);

    const conditions = [
      inArray(notifications.type, CAISSE_NOTIFICATION_TYPES),
    ];

    if (statutFilter.includes("Non lue") && !statutFilter.includes("Lue")) {
      conditions.push(eq(notifications.lue, false));
    } else if (statutFilter.includes("Lue") && !statutFilter.includes("Non lue")) {
      conditions.push(eq(notifications.lue, true));
    }

    conditions.push(
      or(
        isNull(notifications.expiresAt),
        gte(notifications.expiresAt, new Date())
      )!
    );

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

    const enrichedNotifications = await Promise.all(
      result.map(async (notif) => {
        let clientInfo = null;
        let compteInfo = null;

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

        let montant = 0;
        let modePaiement = "";
        let referenceExterne = "";

        try {
          const metaMatch = notif.message.match(/\[META:(.*?)\]/);
          if (metaMatch) {
            const meta = JSON.parse(metaMatch[1]);
            montant = meta.montant || 0;
            modePaiement = meta.modePaiement || "";
            referenceExterne = meta.referenceExterne || "";
          }
        } catch {
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
    logger.error({ err: error }, 'Error fetching caisse notifications');
    res.status(500).json({ error: "Erreur lors du chargement des notifications" });
  }
});

caisseNotificationsRouter.patch("/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CAISSE), async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Non autorisé" });

    const { id } = req.params;
    const data = updateNotificationSchema.parse(req.body);

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
    logger.error({ err: error }, 'Error updating notification');
    res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }
});

caisseNotificationsRouter.get("/count", requireAuth, attachAbility, async (req, res) => {
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
    logger.error({ err: error }, 'Error counting notifications');
    res.status(500).json({ error: "Erreur" });
  }
});
