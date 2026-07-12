import type { Express } from "express";

import { Actions, Subjects } from "@shared/ability";
import { z } from "zod";
import { logAudit } from "../../audit";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { createLogger } from "../../lib/logger";
import { requireAgenceIdAccess } from "../../middleware";
import { storage } from "../../storage";

const logger = createLogger('Routes:Clients:Notifications');

/**
 * Routes d'envoi de notifications aux clients.
 *
 * - POST /api/clients/:id/send-notification — Envoyer une notification (SMS ou Email) à un client
 */
export function registerClientNotificationRoutes(app: Express) {

  /**
   * POST /api/clients/:id/send-notification
   * Envoyer une notification (SMS ou Email) à un client via la file de notifications
   */
  app.post("/api/clients/:id/send-notification", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.CLIENT), requireAgenceIdAccess(), async (req, res) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) {
        return res.status(404).json({ message: "Client not found (Invalid ID)" });
      }

      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
      if (agenceFilter?.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
      }

      const sendNotifSchema = z.object({
        channel: z.enum(["SMS", "EMAIL"]),
        subject: z.string().optional(),
        message: z.string().min(1, "Le message est requis"),
      });

      const parsed = sendNotifSchema.parse(req.body);

      // Déterminer le destinataire
      let recipient: string | null = null;
      if (parsed.channel === "SMS") {
        recipient = client.telephone;
      } else if (parsed.channel === "EMAIL") {
        recipient = client.email;
      }

      if (!recipient) {
        return res.status(400).json({
          message: `Le client n'a pas de ${parsed.channel === "SMS" ? "téléphone" : "email"} renseigné`,
        });
      }

      // Mettre en file la notification via le service de notifications
      const { enqueueNotification } = await import("../../services/notifications/notification-service");

      const correlationId = await enqueueNotification({
        channel: parsed.channel,
        templateCode: "CUSTOM_MESSAGE",
        recipient,
        payload: {
          message: parsed.message,
          subject: parsed.subject || "Message de MicroFlex",
          clientNom: client.nom,
          clientPrenom: client.prenom || "",
          senderNom: req.session.user?.nom || "Système",
        },
        userId: client.userId || undefined,
        agenceId: client.agenceId || undefined,
      });

      // Journaliser l'activité
      const { logClientActivity } = await import("../../storage/clients");
      await logClientActivity({
        clientId: req.params.id,
        type: parsed.channel === "SMS" ? "sms" : "email",
        description:
          parsed.channel === "SMS"
            ? `SMS envoyé : ${parsed.message.substring(0, 50)}...`
            : `Email envoyé : ${parsed.subject || "Sans objet"}`,
        metadata: JSON.stringify({
          channel: parsed.channel,
          message: parsed.message,
          subject: parsed.subject,
          correlationId,
          sentBy: req.session.user?.id,
        }),
      });

      await logAudit(
        req,
        "SEND_CLIENT_NOTIFICATION",
        "client",
        req.params.id,
        { channel: parsed.channel, correlationId },
        "success",
        "medium"
      );

      res.json({
        success: true,
        correlationId,
        channel: parsed.channel,
        recipient,
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(error);
      logger.error({ err: error }, 'Erreur d\'envoi de notification au client');
      res.status(500).json({ message: "Erreur lors de l'envoi de la notification" });
    }
  });
}
