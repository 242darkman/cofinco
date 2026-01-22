import type { Express } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { departments, jobPositions } from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { SystemRole } from "@shared/types/roles";

// Schémas de validation
const createDepartmentSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(120),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

const updateDepartmentSchema = z.object({
  code: z.string().min(1).max(30).optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const createJobPositionSchema = z.object({
  departmentId: z.string().uuid(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(120),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

const updateJobPositionSchema = z.object({
  departmentId: z.string().uuid().optional(),
  code: z.string().min(1).max(30).optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export function registerDepartmentsRoutes(app: Express) {
  // ============================================
  // DEPARTMENTS
  // ============================================

  // GET - Liste des départements
  app.get("/api/departments", requireAuth, async (req, res) => {
    try {
      const result = await db.select().from(departments).orderBy(departments.name);
      res.json(result);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des départements" });
    }
  });

  // GET - Département par ID (UUID)
  app.get("/api/departments/:id", requireAuth, async (req, res) => {
    try {
      const id = req.params.id;

      const [dept] = await db.select().from(departments).where(eq(departments.id, id));
      if (!dept) {
        return res.status(404).json({ message: "Département non trouvé" });
      }

      res.json(dept);
    } catch (error) {
      console.error("Error fetching department:", error);
      res.status(500).json({ message: "Erreur lors de la récupération du département" });
    }
  });

  // POST - Créer un département
  app.post("/api/departments", requireRole(SystemRole.ADMIN), async (req, res) => {
    try {
      const parsed = createDepartmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      const [created] = await db.insert(departments).values(parsed.data).returning();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating department:", error);
      res.status(500).json({ message: "Erreur lors de la création du département" });
    }
  });

  // PUT - Mettre à jour un département
  app.put("/api/departments/:id", requireRole(SystemRole.ADMIN), async (req, res) => {
    try {
      const id = req.params.id;

      const parsed = updateDepartmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      const [updated] = await db.update(departments)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(departments.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Département non trouvé" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating department:", error);
      res.status(500).json({ message: "Erreur lors de la mise à jour du département" });
    }
  });

  // DELETE - Supprimer un département
  app.delete("/api/departments/:id", requireRole(SystemRole.ADMIN), async (req, res) => {
    try {
      const id = req.params.id;

      // Vérifier s'il y a des postes liés
      const [linkedPosition] = await db.select()
        .from(jobPositions)
        .where(eq(jobPositions.departmentId, id))
        .limit(1);

      if (linkedPosition) {
        return res.status(400).json({
          message: "Impossible de supprimer ce département car il contient des postes"
        });
      }

      const [deleted] = await db.delete(departments)
        .where(eq(departments.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ message: "Département non trouvé" });
      }

      res.json({ message: "Département supprimé avec succès" });
    } catch (error) {
      console.error("Error deleting department:", error);
      res.status(500).json({ message: "Erreur lors de la suppression du département" });
    }
  });

  // ============================================
  // JOB POSITIONS
  // ============================================

  // GET - Liste des postes (avec département)
  app.get("/api/job-positions", requireAuth, async (req, res) => {
    try {
      const { departmentId } = req.query;

      let query = db.select({
        id: jobPositions.id,
        departmentId: jobPositions.departmentId,
        code: jobPositions.code,
        name: jobPositions.name,
        description: jobPositions.description,
        isActive: jobPositions.isActive,
        createdAt: jobPositions.createdAt,
        updatedAt: jobPositions.updatedAt,
        department: {
          id: departments.id,
          code: departments.code,
          name: departments.name,
        },
      })
      .from(jobPositions)
      .innerJoin(departments, eq(jobPositions.departmentId, departments.id));

      if (departmentId && typeof departmentId === 'string') {
        query = query.where(eq(jobPositions.departmentId, departmentId)) as typeof query;
      }

      const result = await query.orderBy(departments.name, jobPositions.name);
      res.json(result);
    } catch (error) {
      console.error("Error fetching job positions:", error);
      res.status(500).json({ message: "Erreur lors de la récupération des postes" });
    }
  });

  // GET - Poste par ID (UUID)
  app.get("/api/job-positions/:id", requireAuth, async (req, res) => {
    try {
      const id = req.params.id;

      const [result] = await db.select({
        id: jobPositions.id,
        departmentId: jobPositions.departmentId,
        code: jobPositions.code,
        name: jobPositions.name,
        description: jobPositions.description,
        isActive: jobPositions.isActive,
        createdAt: jobPositions.createdAt,
        updatedAt: jobPositions.updatedAt,
        department: {
          id: departments.id,
          code: departments.code,
          name: departments.name,
        },
      })
      .from(jobPositions)
      .innerJoin(departments, eq(jobPositions.departmentId, departments.id))
      .where(eq(jobPositions.id, id));

      if (!result) {
        return res.status(404).json({ message: "Poste non trouvé" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching job position:", error);
      res.status(500).json({ message: "Erreur lors de la récupération du poste" });
    }
  });

  // POST - Créer un poste
  app.post("/api/job-positions", requireRole(SystemRole.ADMIN), async (req, res) => {
    try {
      const parsed = createJobPositionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      // Vérifier que le département existe
      const [dept] = await db.select().from(departments).where(eq(departments.id, parsed.data.departmentId));
      if (!dept) {
        return res.status(400).json({ message: "Département non trouvé" });
      }

      const [created] = await db.insert(jobPositions).values(parsed.data).returning();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating job position:", error);
      res.status(500).json({ message: "Erreur lors de la création du poste" });
    }
  });

  // PUT - Mettre à jour un poste
  app.put("/api/job-positions/:id", requireRole(SystemRole.ADMIN), async (req, res) => {
    try {
      const id = req.params.id;

      const parsed = updateJobPositionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      // Si on change le département, vérifier qu'il existe
      if (parsed.data.departmentId) {
        const [dept] = await db.select().from(departments).where(eq(departments.id, parsed.data.departmentId));
        if (!dept) {
          return res.status(400).json({ message: "Département non trouvé" });
        }
      }

      const [updated] = await db.update(jobPositions)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(jobPositions.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Poste non trouvé" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating job position:", error);
      res.status(500).json({ message: "Erreur lors de la mise à jour du poste" });
    }
  });

  // DELETE - Supprimer un poste
  app.delete("/api/job-positions/:id", requireRole(SystemRole.ADMIN), async (req, res) => {
    try {
      const id = req.params.id;

      // TODO: Vérifier s'il y a des employés liés à ce poste

      const [deleted] = await db.delete(jobPositions)
        .where(eq(jobPositions.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ message: "Poste non trouvé" });
      }

      res.json({ message: "Poste supprimé avec succès" });
    } catch (error) {
      console.error("Error deleting job position:", error);
      res.status(500).json({ message: "Erreur lors de la suppression du poste" });
    }
  });
}
