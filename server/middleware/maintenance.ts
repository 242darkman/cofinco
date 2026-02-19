import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { maintenanceModules } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAdminRole } from "@shared/types/roles";
import { createLogger } from "../lib/logger";

const logger = createLogger('Maintenance');

// Cache valid for short duration to avoid DB hit every request
let moduleCache: { [key: string]: boolean } = {};
let lastCacheUpdate = 0;
const CACHE_TTL = 10000; // 10 seconds

const getModuleStatus = async () => {
  const now = Date.now();
  if (now - lastCacheUpdate < CACHE_TTL) {
    return moduleCache;
  }

  try {
    const modules = await db.select().from(maintenanceModules);
    const newCache: { [key: string]: boolean } = {};
    modules.forEach(m => {
      newCache[m.moduleName] = m.isLocked;
    });
    moduleCache = newCache;
    lastCacheUpdate = now;
    return newCache;
  } catch (error) {
    logger.error({ err: error }, 'Failed to refresh maintenance cache');
    return moduleCache; // Return stale cache on error
  }
};

export const checkMaintenanceMode = async (req: Request, res: Response, next: NextFunction) => {
  // Always allow admin to bypass
  if (req.user && isAdminRole(req.user.role)) {
    return next();
  }

  // Always allow auth routes and maintenance check routes
  if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/maintenance-mode') || req.path.startsWith('/api/health')) {
    return next();
  }

  const status = await getModuleStatus();

  // 1. Check Platform Lock
  if (status['PLATFORM']) {
    return res.status(503).json({ 
      message: "La plateforme est actuellement en maintenance.",
      code: "MAINTENANCE_MODE_PLATFORM" 
    });
  }

  // 2. Check Module Locks based on URL prefix
  // Mapping URL prefixes to Module Names
  const path = req.path;

  if (status['CREDITS'] && (path.startsWith('/api/credits') || path.startsWith('/api/demandes-credit') || path.startsWith('/api/enquetes-credit'))) {
    return res.status(503).json({ message: "Le module CRÉDITS est en maintenance.", code: "MAINTENANCE_MODE_MODULE" });
  }

  if (status['CAISSE'] && (path.startsWith('/api/sessions-caisse') || path.startsWith('/api/operations-caisse') || path.startsWith('/api/caisse-transferts'))) {
    return res.status(503).json({ message: "Le module CAISSE est en maintenance.", code: "MAINTENANCE_MODE_MODULE" });
  }

  if (status['TONTINES'] && (path.startsWith('/api/tontines') || path.startsWith('/api/tontine-plans'))) {
    return res.status(503).json({ message: "Le module TONTINES est en maintenance.", code: "MAINTENANCE_MODE_MODULE" });
  }

  if (status['EPARGNE'] && (path.startsWith('/api/comptes') || path.startsWith('/api/transactions-epargne'))) {
    return res.status(503).json({ message: "Le module ÉPARGNE est en maintenance.", code: "MAINTENANCE_MODE_MODULE" });
  }

  if (status['RH'] && (path.startsWith('/api/hr') || path.startsWith('/api/employes'))) {
    return res.status(503).json({ message: "Le module RH est en maintenance.", code: "MAINTENANCE_MODE_MODULE" });
  }

  if (status['MESSAGES'] && (path.startsWith('/api/messages') || path.startsWith('/api/v2/conversations'))) {
    res.status(503).json({ message: "Le module MESSAGERIE est en maintenance.", code: "MAINTENANCE_MODE_MODULE" });
    return;
  }

  next();
};
