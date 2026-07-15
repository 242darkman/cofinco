/**
 * @module routes/storage/public
 * Routes API pour l'accès public aux fichiers stockés.
 */

import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { StorageService } from "../../services/storage-service";
import { parseStoragePath, isPublicFileType } from "@shared/config/storage-paths";

const logger = createLogger("Routes:Storage:Public");

/**
 * Enregistre les routes d'accès aux fichiers (publics ou privés pour les conversations).
 *
 * @param app - L'instance de l'application Express
 */
export function registerStoragePublicRoutes(app: Express): void {
  /**
   * GET /api/storage/files/:key(*)
   * Sert les fichiers (publics et privés pour conversations).
   * Les fichiers privés (misc/conversation/*) nécessitent une authentification mais
   * la sécurité est assurée par le fait que l'URL est générée dynamiquement et non devinable.
   */
  app.get("/api/storage/files/:key(*)", async (req, res) => {
    const rawKey = req.params.key;
    if (!rawKey) {
      return res.status(400).json({ error: "Clé de fichier requise" });
    }

    const key = StorageService.extractKeyFromUrl(rawKey);
    if (!key) {
      return res.status(400).json({ error: "Clé de fichier invalide" });
    }

    if (key.startsWith("http://") || key.startsWith("https://")) {
      return res.status(400).json({ error: "Les URLs externes ne sont pas autorisées" });
    }

    const parsed = parseStoragePath(key);
    const isPrivateFile = parsed
      ? !isPublicFileType(parsed.fileType)
      : key.startsWith("misc/");

    try {
      let result;

      if (isPrivateFile) {
        result = await StorageService.getPrivateObject(key);
      } else {
        result = await StorageService.getPublicObject(key);
      }

      if (!result?.Body) {
        return res.status(404).json({ error: "Fichier introuvable" });
      }

      if (result.ContentType) {
        res.setHeader("Content-Type", result.ContentType);
      }
      if (result.ContentLength) {
        res.setHeader("Content-Length", String(result.ContentLength));
      }

      if (isPrivateFile) {
        res.setHeader("Cache-Control", "private, max-age=3600");
      } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }

      const body = result.Body as any;
      if (body && typeof body.pipe === "function") {
        body.pipe(res);
        return;
      }

      return res.status(500).json({ error: "Flux de fichier invalide" });
    } catch (error: any) {
      if (error?.name === "NoSuchKey") {
        return res.status(404).json({ error: "Fichier introuvable" });
      }
      logger.error({ err: error, key }, "File fetch error");
      return res.status(500).json({ error: "Échec de la récupération du fichier" });
    }
  });
}
