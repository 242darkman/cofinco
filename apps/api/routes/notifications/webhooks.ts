import { Router as createRouter } from "express";
import { createLogger } from "../../lib/logger";
import { db } from "../../db";
import { eq } from "drizzle-orm";

const logger = createLogger('Routes:Notifications:Webhooks');

export const webhooksNotificationsRouter = createRouter();

/**
 * POST /api/webhooks/mtn/sms-delivery
 *
 * MTN envoie un callback lorsqu'un SMS est delivre ou echoue.
 * Payload attendu (MTN API v2):
 * {
 *   deliveryInfoNotification: {
 *     deliveryInfo: {
 *       address: "tel:+242...",
 *       deliveryStatus: "DeliveredToTerminal" | "DeliveryImpossible" | ...
 *     },
 *     callbackData: "<clientCorrelator>"
 *   }
 * }
 *
 * Securite: verification HMAC-SHA256 du header X-MTN-Signature
 */
webhooksNotificationsRouter.post("/sms-delivery", async (req, res) => {
  try {
    const signature = req.headers["x-mtn-signature"] as string | undefined;
    const body = req.body;

    // Verify signature if configured
    const webhookSecret = process.env.MTN_SMS_WEBHOOK_SECRET;
    if (webhookSecret) {
      if (!signature) {
        logger.warn('Webhook MTN-SMS missing signature header');
        return res.status(401).json({ error: "Missing signature" });
      }

      const crypto = await import("crypto");
      const expectedSig = crypto
        .createHmac("sha256", webhookSecret)
        .update(JSON.stringify(body))
        .digest("hex");

      const sigBuffer = Buffer.from(signature, "hex");
      const expectedBuffer = Buffer.from(expectedSig, "hex");

      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        logger.warn('Webhook MTN-SMS invalid signature');
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Parse delivery notification
    const notification = body?.deliveryInfoNotification;
    if (!notification?.deliveryInfo) {
      logger.warn('Webhook MTN-SMS invalid payload structure');
      return res.status(200).json({ received: true }); // Always 200 to prevent retries
    }

    const { deliveryInfo, callbackData } = notification;
    const deliveryStatus = deliveryInfo.deliveryStatus || "UNKNOWN";
    const receiverAddress = deliveryInfo.address || "";
    const correlationId = callbackData || "";

    logger.info({ deliveryStatus, correlationId }, 'Webhook MTN-SMS delivery status');

    // Find the notification job by correlationId
    const { notificationJobs, notificationDeliveryReceipts } = await import("@shared/schema");

    if (correlationId) {
      const [job] = await db
        .select()
        .from(notificationJobs)
        .where(eq(notificationJobs.correlationId, correlationId))
        .limit(1);

      if (job) {
        // Upsert delivery receipt
        await db
          .insert(notificationDeliveryReceipts)
          .values({
            notificationJobId: job.id,
            requestId: correlationId,
            senderAddress: deliveryInfo.senderAddress || null,
            receiverAddress,
            status: deliveryStatus,
            rawResponse: body,
            checkedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: notificationDeliveryReceipts.requestId,
            set: {
              status: deliveryStatus,
              rawResponse: body,
              checkedAt: new Date(),
            },
          });

        // Update job status if terminal delivery status
        const terminalSuccess = ["DeliveredToTerminal", "DeliveredToNetwork"].includes(deliveryStatus);
        const terminalFailure = ["DeliveryImpossible", "DeliveryUncertain", "MessageWaiting"].includes(deliveryStatus);

        if (terminalSuccess && job.status !== "SENT") {
          await db
            .update(notificationJobs)
            .set({ status: "SENT" as any, processedAt: new Date() })
            .where(eq(notificationJobs.id, job.id));
        } else if (terminalFailure && job.status === "SENT") {
          await db
            .update(notificationJobs)
            .set({ status: "FAILED" as any, lastError: `Delivery failed: ${deliveryStatus}` })
            .where(eq(notificationJobs.id, job.id));
        }
      } else {
        logger.warn({ correlationId }, 'Webhook MTN-SMS no job found for correlator');
      }
    }

    // Always return 200 to prevent MTN from retrying
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ err: error }, 'Webhook MTN-SMS error processing delivery receipt');
    res.status(200).json({ received: true }); // Always 200
  }
});
