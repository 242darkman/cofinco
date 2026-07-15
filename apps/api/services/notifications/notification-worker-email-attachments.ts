import type { EmailAttachment } from "./providers/provider.interface";
import { getLogoBuffer, getLogoFilename, getLogoMime } from "../../lib/company-logo";
import { createLogger } from "../../lib/logger";
import { StorageService } from "../storage-service";

const logger = createLogger("NotifWorker:EmailAttachments");

interface StoredEmailAttachment {
  storageKey: string;
  filename: string;
  contentType?: string;
}

/**
 * Construit les pièces jointes à transmettre au fournisseur email.
 *
 * Le logo d'entreprise est ajouté en CID inline lorsqu'il est disponible. Les
 * pièces jointes applicatives sont résolues depuis `payload._attachments` après
 * validation minimale de leur forme.
 *
 * @param payload - Variables de rendu et métadonnées du job email.
 * @returns La liste des pièces jointes prêtes pour le fournisseur SMTP.
 */
export async function buildEmailAttachments(
  payload: Record<string, unknown>
): Promise<EmailAttachment[]> {
  const attachments = buildInlineLogoAttachment();

  const payloadAttachments = payload._attachments;
  if (!Array.isArray(payloadAttachments)) {
    return attachments;
  }

  for (const attachment of payloadAttachments) {
    if (!isStoredEmailAttachment(attachment)) {
      logger.warn({ attachment }, "Email attachment payload ignored: invalid shape");
      continue;
    }

    const resolvedAttachment = await resolveStoredAttachment(attachment);
    if (resolvedAttachment) {
      attachments.push(resolvedAttachment);
    }
  }

  return attachments;
}

function buildInlineLogoAttachment(): EmailAttachment[] {
  const logoBuffer = getLogoBuffer();
  if (!logoBuffer) {
    return [];
  }

  return [{
    filename: getLogoFilename(),
    content: logoBuffer,
    contentType: getLogoMime() ?? "image/png",
    cid: "company-logo",
  }];
}

function isStoredEmailAttachment(value: unknown): value is StoredEmailAttachment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const attachment = value as Partial<StoredEmailAttachment>;
  return typeof attachment.storageKey === "string"
    && typeof attachment.filename === "string"
    && (attachment.contentType === undefined || typeof attachment.contentType === "string");
}

async function resolveStoredAttachment(
  attachment: StoredEmailAttachment
): Promise<EmailAttachment | null> {
  try {
    const obj = await StorageService.getPrivateObject(attachment.storageKey);
    if (!obj.Body) {
      logger.warn({ storageKey: attachment.storageKey }, "Stored email attachment has no body");
      return null;
    }

    const bytes = await obj.Body.transformToByteArray();
    return {
      filename: attachment.filename,
      content: Buffer.from(bytes),
      contentType: attachment.contentType || "application/pdf",
    };
  } catch (err) {
    logger.warn({ err, storageKey: attachment.storageKey }, "Failed to fetch attachment from storage");
    return null;
  }
}
