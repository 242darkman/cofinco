/**
 * @module routes/storage/entities
 * Routes API pour le stockage organisé par entité métier (V2).
 */

import type { Express } from "express";
import multer from "multer";
import { createLogger } from "../../lib/logger";
import { StorageService } from "../../services/storage-service";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../../db";
import { clients } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  StorageFileType,
  StorageEntityType,
  STORAGE_CONFIG,
  MAX_UPLOAD_SIZE_MB,
  isPublicFileType,
} from "@shared/config/storage-paths";

const logger = createLogger("Routes:Storage:Entities");

const validFileTypes = Object.keys(STORAGE_CONFIG) as StorageFileType[];
const validEntityTypes: StorageEntityType[] = [
  "client", "user", "employe", "credit", "tontine", "prospection", "incident", "conversation"
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Type de fichier non autorisé. Formats acceptés: JPEG, PNG, PDF"));
    }
  }
});

const proxyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
});

/**
 * Enregistre les routes de gestion du stockage par entité.
 *
 * @param app - L'instance de l'application Express
 */
export function registerStorageEntitiesRoutes(app: Express): void {
  /**
   * POST /api/storage/entity/upload
   * Upload avec organisation automatique par entité.
   */
  app.post(
    "/api/storage/entity/upload",
    requireAuth,
    attachAbility,
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "Aucun fichier fourni" });
        }

        const { fileType, entityType, entityId } = req.body;

        if (!fileType || !entityType || !entityId) {
          return res.status(400).json({
            error: "Paramètres requis: fileType, entityType, entityId",
          });
        }

        if (!validFileTypes.includes(fileType)) {
          return res.status(400).json({
            error: `fileType invalide. Valeurs possibles: ${validFileTypes.join(", ")}`,
          });
        }

        if (!validEntityTypes.includes(entityType)) {
          return res.status(400).json({
            error: `entityType invalide. Valeurs possibles: ${validEntityTypes.join(", ")}`,
          });
        }

        const user = req.user!;
        const isPrivileged =
          req.ability?.can(Actions.MANAGE, "all") ||
          req.ability?.can(Actions.MANAGE, Subjects.ADMIN);

        if (!isPrivileged && entityType === "user" && entityId !== user.id) {
          return res.status(403).json({ error: "Vous ne pouvez uploader que pour votre propre profil" });
        }
        if (!isPrivileged && entityType === "client") {
          const [clientRecord] = await db
            .select({ userId: clients.userId })
            .from(clients)
            .where(eq(clients.id, entityId));
          if (!clientRecord || clientRecord.userId !== user.id) {
            return res.status(403).json({ error: "Accès refusé à ce client" });
          }
        }

        const key = await StorageService.uploadForEntity(
          req.file,
          fileType as StorageFileType,
          entityType as StorageEntityType,
          entityId
        );

        const isPublic = isPublicFileType(fileType as StorageFileType);
        const url = isPublic ? StorageService.getPublicUrl(key) : null;

        res.json({
          success: true,
          key,
          url,
          fileType,
          entityType,
          entityId,
        });
      } catch (error: any) {
        logger.error({ err: error }, "Entity upload error");
        res.status(500).json({ error: "Erreur interne du serveur" });
      }
    }
  );

  /**
   * POST /api/storage/entity/proxy-upload
   * Proxy upload: le client upload vers le backend, qui transmet à MinIO.
   */
  app.post(
    "/api/storage/entity/proxy-upload",
    requireAuth,
    attachAbility,
    proxyUpload.single("file"),
    async (req, res) => {
      try {
        const { fileType, entityType, entityId } = req.body;
        const file = req.file;

        if (!file || !fileType || !entityType || !entityId) {
          return res.status(400).json({
            error: "Paramètres requis: file, fileType, entityType, entityId",
          });
        }

        if (!validFileTypes.includes(fileType)) {
          return res.status(400).json({ error: "fileType invalide" });
        }
        if (!validEntityTypes.includes(entityType)) {
          return res.status(400).json({ error: "entityType invalide" });
        }

        const objectKey = await StorageService.uploadBufferForEntity(
          file.buffer,
          file.originalname,
          file.mimetype,
          fileType as StorageFileType,
          entityType as StorageEntityType,
          entityId
        );

        const isPublic = isPublicFileType(fileType as StorageFileType);

        res.json({ key: objectKey, isPublic });
      } catch (error: any) {
        logger.error({ err: error }, "Entity proxy upload error");
        res.status(500).json({ error: "Erreur interne du serveur" });
      }
    }
  );

  /**
   * POST /api/storage/entity/presigned-url
   * Obtient une URL présignée avec organisation par entité.
   */
  app.post("/api/storage/entity/presigned-url", requireAuth, attachAbility, async (req, res) => {
    try {
      const { filename, contentType, fileType, entityType, entityId } = req.body;

      if (!filename || !contentType || !fileType || !entityType || !entityId) {
        return res.status(400).json({
          error: "Paramètres requis: filename, contentType, fileType, entityType, entityId",
        });
      }

      if (!validFileTypes.includes(fileType)) {
        return res.status(400).json({ error: "fileType invalide" });
      }

      if (!validEntityTypes.includes(entityType)) {
        return res.status(400).json({ error: "entityType invalide" });
      }

      const result = await StorageService.getPresignedUploadUrlForEntity(
        filename,
        contentType,
        fileType as StorageFileType,
        entityType as StorageEntityType,
        entityId
      );

      const isPublic = isPublicFileType(fileType as StorageFileType);

      res.json({
        uploadUrl: result.uploadUrl,
        key: result.objectKey,
        isPublic,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Entity presigned URL error");
      res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });

  /**
   * DELETE /api/storage/entity/:entityType/:entityId
   * Supprime TOUS les fichiers d'une entité en cascade.
   */
  app.delete(
    "/api/storage/entity/:entityType/:entityId",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.ADMIN),
    async (req, res) => {
      try {
        const { entityType, entityId } = req.params;

        if (!validEntityTypes.includes(entityType as StorageEntityType)) {
          return res.status(400).json({ error: "entityType invalide" });
        }

        const result = await StorageService.deleteEntityFiles(
          entityType as StorageEntityType,
          entityId
        );

        res.json({
          success: true,
          ...result,
          totalDeleted: result.publicDeleted + result.privateDeleted,
        });
      } catch (error: any) {
        logger.error({ err: error }, "Entity files delete error");
        res.status(500).json({ error: "Erreur interne du serveur" });
      }
    }
  );

  /**
   * GET /api/storage/entity/:entityType/:entityId/files
   * Liste les fichiers d'une entité avec leurs métadonnées.
   */
  app.get("/api/storage/entity/:entityType/:entityId/files", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId } = req.params;

      if (!validEntityTypes.includes(entityType as StorageEntityType)) {
        return res.status(400).json({ error: "entityType invalide" });
      }

      const files = await StorageService.getEntityFiles(
        entityType as StorageEntityType,
        entityId
      );

      res.json({ entityType, entityId, files });
    } catch (error: any) {
      logger.error({ err: error }, "Entity files list error");
      res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });

  /**
   * GET /api/storage/entity/:entityType/:entityId/count
   * Compte les fichiers rattachés à une entité.
   */
  app.get("/api/storage/entity/:entityType/:entityId/count", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId } = req.params;

      if (!validEntityTypes.includes(entityType as StorageEntityType)) {
        return res.status(400).json({ error: "entityType invalide" });
      }

      const count = await StorageService.countEntityFiles(
        entityType as StorageEntityType,
        entityId
      );

      res.json({
        entityType,
        entityId,
        ...count,
        total: count.public + count.private,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Entity files count error");
      res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });
}
