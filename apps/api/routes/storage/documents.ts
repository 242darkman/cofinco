/**
 * @module routes/storage/documents
 * Routes API authentifiées pour la gestion et l'accès sécurisé aux documents.
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { StorageService } from "../../services/storage-service";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../../db";
import { clients } from "@shared/schema";
import { sql } from "drizzle-orm";

const logger = createLogger("Routes:Storage:Documents");

/**
 * Enregistre les routes de gestion sécurisée des documents (récupération d'URL sécurisée et suppression).
 *
 * @param app - L'instance de l'application Express
 */
export function registerStorageDocumentsRoutes(app: Express): void {
  /**
   * GET /api/storage/documents/:id/view
   * Obtient une URL de téléchargement sécurisée pour les documents privés.
   */
  app.get("/api/storage/documents/:id/view", requireAuth, attachAbility, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user!;

      let objectKey: string | null = null;
      let ownerId: string | null = null;

      const clientDocResult = await db.execute(sql`
        select ${clients.id} as "clientId",
               ${clients.userId} as "userId",
               doc as document
        from ${clients},
             jsonb_array_elements(${clients.documents}) as doc
        where doc->>'id' = ${id}
        limit 1
      `);

      const clientDoc = clientDocResult.rows[0] as
        | { clientId: string; userId: string | null; document: any }
        | undefined;

      if (clientDoc?.document) {
        const doc =
          typeof clientDoc.document === "string"
            ? (JSON.parse(clientDoc.document) as Record<string, any>)
            : (clientDoc.document as Record<string, any>);
        objectKey =
          doc.document_url ||
          doc.documentUrl ||
          doc.object_key ||
          doc.objectKey ||
          doc.url ||
          null;
        ownerId = doc.owner_id || doc.ownerId || clientDoc.userId || null;
      }

      objectKey = StorageService.extractKeyFromUrl(objectKey);

      if (!objectKey) {
        return res.status(404).json({ error: "Document introuvable" });
      }

      const isGlobalAdmin = req.ability?.can(Actions.MANAGE, "all");
      if (!isGlobalAdmin) {
        if (!ownerId || ownerId !== user.id) {
          return res.status(403).json({ error: "Accès refusé" });
        }
      }

      if (objectKey.startsWith("http://") || objectKey.startsWith("https://")) {
        return res.json({ url: objectKey });
      }

      const url = `/api/storage/files/${objectKey}`;
      res.json({ url });
    } catch (error: any) {
      logger.error({ err: error }, "Download URL error");
      res.status(500).json({ error: "Erreur lors de la récupération du document" });
    }
  });

  /**
   * DELETE /api/storage/:key(*)
   * Supprime un fichier par sa clé ou son URL.
   */
  app.delete(
    "/api/storage/:key(*)",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.ADMIN),
    async (req, res) => {
      try {
        const rawKey = req.params.key;

        if (!rawKey) {
          return res.status(400).json({ error: "Clé de fichier requise" });
        }

        const deleted = await StorageService.deleteFileFromUrl(rawKey);

        res.json({ success: true, deleted });
      } catch (error: any) {
        logger.error({ err: error }, "Delete error");
        res.status(500).json({ error: "Erreur interne du serveur" });
      }
    }
  );
}
