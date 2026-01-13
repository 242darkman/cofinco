import { Router } from "express";
import { db } from "../db";
import { maintenanceModules } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { logAudit } from "../audit";
import { z } from "zod";

export const maintenanceRouter = Router();

// ============================================
// GET - Statut global maintenance (tous modules)
// ============================================
maintenanceRouter.get("/", async (req, res) => {
  try {
    const modules = await db.select().from(maintenanceModules);
    res.json(modules);
  } catch (error) {
    console.error("Error fetching maintenance status:", error);
    res.status(500).json({ message: "Erreur lors de la récupération du statut maintenance" });
  }
});

// ============================================
// PATCH - Verrouiller/Déverrouiller un module
// ============================================
const toggleModuleSchema = z.object({
  is_locked: z.boolean(),
  reason: z.string().nullable().optional(),
  locked_by: z.string().uuid().nullable().optional(),
  locked_at: z.string().nullable().optional(), // ISO string
  updated_at: z.string().optional()
});

maintenanceRouter.patch("/:moduleId", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { moduleId } = req.params;
    const Validation = toggleModuleSchema.safeParse(req.body);

    if (!Validation.success) {
      return res.status(400).json({ message: "Données invalides", errors: Validation.error.errors });
    }

    const data = Validation.data;

    const existingModule = await db.select().from(maintenanceModules).where(eq(maintenanceModules.id, moduleId)).limit(1);
    
    if (existingModule.length === 0) {
      return res.status(404).json({ message: "Module non trouvé" });
    }

    // Verify user exists before using ID
    let validUserId: string | null = null;
    if (data.is_locked && req.session.user) {
        try {
            const userCheck = await db.execute(`SELECT id FROM users WHERE id = '${req.session.user.id}'`);
            if (userCheck.rows && userCheck.rows.length > 0) {
                validUserId = req.session.user.id;
            }
        } catch (e) {
            console.warn("Could not verify user existence for lock, using system lock (null):", e);
        }
    }

    const [updatedModule] = await db.update(maintenanceModules)
      .set({
        isLocked: data.is_locked,
        lockedBy: validUserId, 
        lockedAt: data.is_locked ? new Date() : null,
        reason: data.reason,
        updatedAt: new Date()
      })
      .where(eq(maintenanceModules.id, moduleId))
      .returning();

    // Audit Log
    await logAudit(
      req,
      data.is_locked ? "LOCK_MODULE" : "UNLOCK_MODULE",
      "system",
      moduleId,
      { module: updatedModule.moduleName, reason: data.reason },
      "success",
      "high"
    );

    // Notify via WebSocket
    try {
      const { getWsInstance } = await import("../ws-server");
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ 
          type: "MAINTENANCE_UPDATE", 
          payload: { 
            moduleId, 
            isLocked: data.is_locked,
            moduleName: updatedModule.moduleName 
          } 
        });
      }
    } catch (wsError) {
      console.error("Failed to notify maintenance update:", wsError);
    }

    res.json(updatedModule);

  } catch (error) {
    console.error("Error toggling maintenance module:", error);
    res.status(500).json({ message: "Erreur lors de la mise à jour du module" });
  }
});

// ============================================
// PATCH - Verrouillage Platforme (alias spécial)
// ============================================
const platformLockSchema = z.object({
  action: z.enum(['lock', 'unlock']),
  user_id: z.string().uuid(),
  reason: z.string().nullable().optional()
});

maintenanceRouter.patch("/:moduleId/platform", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { moduleId } = req.params; // Should be the ID of the PLATFORM module
    const Validation = platformLockSchema.safeParse(req.body);

    if (!Validation.success) {
      return res.status(400).json({ message: "Données invalides", errors: Validation.error.errors });
    }

    const { action, reason } = Validation.data;
    const isLocking = action === 'lock';

    // Verify user exists before using ID
    let validUserId: string | null = null;
    if (isLocking && req.session.user) {
        try {
            const userCheck = await db.execute(`SELECT id FROM users WHERE id = '${req.session.user.id}'`);
            if (userCheck.rows && userCheck.rows.length > 0) {
                validUserId = req.session.user.id;
            }
        } catch (e) {
             console.warn("Could not verify user existence for platform lock, using system lock (null):", e);
        }
    }

    const [updatedModule] = await db.update(maintenanceModules)
      .set({
        isLocked: isLocking,
        lockedBy: validUserId,
        lockedAt: isLocking ? new Date() : null,
        reason: reason,
        updatedAt: new Date()
      })
      .where(eq(maintenanceModules.id, moduleId))
      .returning();

     // Audit Log
     await logAudit(
      req,
      isLocking ? "LOCK_PLATFORM" : "UNLOCK_PLATFORM",
      "system",
      moduleId,
      { reason },
      "success",
      "critical"
    );

    // Notify via WebSocket
    try {
      const { getWsInstance } = await import("../ws-server");
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ 
          type: "MAINTENANCE_UPDATE", 
          payload: { 
            moduleId, 
            isLocked: isLocking,
            moduleName: 'PLATFORM',
            isPlatform: true
          } 
        });
      }
    } catch (wsError) {
      console.error("Failed to notify platform lock:", wsError);
    }

    res.json(updatedModule);

  } catch (error) {
    console.error("Error toggling platform lock:", error);
    res.status(500).json({ message: "Erreur lors du verrouillage plateforme" });
  }
});

// ============================================
// POST - Seed/Init Default Modules (Internal/Dev)
// ============================================
maintenanceRouter.post("/seed", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const defaultModules = [
      'PLATFORM',
      'CAISSE',
      'CREDITS',
      'TONTINES',
      'EPARGNE',
      'RH',
      'MESSAGES',
      'ADMIN'
    ];

    const results = [];

    for (const name of defaultModules) {
        // Updated to use the new conflict handling available in newer Drizzle or just standard check
        const existing = await db.select().from(maintenanceModules).where(eq(maintenanceModules.moduleName, name)).limit(1);
        
        if (existing.length === 0) {
            const [inserted] = await db.insert(maintenanceModules).values({
                moduleName: name,
                isLocked: false
            }).returning();
            results.push(inserted);
        }
    }
    
    res.json({ message: "Modules initialized", created: results });

  } catch (error) {
    console.error("Error seeding modules:", error);
    res.status(500).json({ message: "Error seeding modules" });
  }
});
