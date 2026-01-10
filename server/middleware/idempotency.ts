import { db } from "../db";
import type { Request, Response, NextFunction } from "express";

// Cache en mémoire pour requêtes très rapprochées
const processingKeys = new Set<string>();

export function idempotencyMiddleware(resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.body.idempotencyKey || req.headers["x-idempotency-key"];
    
    if (!idempotencyKey) {
      return next();
    }

    const fullKey = `${resourceType}:${idempotencyKey}`;

    // Vérifier si déjà en cours de traitement (race condition)
    if (processingKeys.has(fullKey)) {
      return res.status(409).json({
        error: "DUPLICATE_REQUEST",
        message: "Cette opération est déjà en cours de traitement",
      });
    }

    // Marquer comme en cours
    processingKeys.add(fullKey);

    // Nettoyer après la requête
    res.on("finish", () => {
      processingKeys.delete(fullKey);
    });

    next();
  };
}
