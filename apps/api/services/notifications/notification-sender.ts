import { db } from "../../db";
import { notifications } from "@shared/schema";
import { getWsInstance } from "../../ws-server";

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
