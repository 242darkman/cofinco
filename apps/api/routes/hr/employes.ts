import { Router } from "express";
/**
 * Routes RH — Employés : fiches, import CSV, organigramme et audit RH.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   GET    /api/hr/employees/:employeId/certificates
 *   GET    /api/hr/audit
 *   GET    /api/hr/organigramme
 *   PATCH  /api/hr/organigramme/reassign
 *   POST   /api/hr/import
 *   GET    /api/hr/employees/:employeId/documents
 *   POST   /api/hr/employees/:employeId/documents
 */
import { db } from "../../db";
import { employes, hrAuditLog, employeeDocuments, formationCertificates } from "@shared/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { storage } from "../../storage";
import { hrService } from "../../services/hr-service";
import { users } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { z } from "zod";
import { importEmployees, parseCsv } from "../../services/hr-import-service";
import { StorageService } from "../../services/storage-service";
import { logger, csvUpload, docUpload, broadcastHrUpdate, successResponse, errorResponse } from "./shared";

export const employesRouter = Router();

// GET /api/hr/employees/:employeId/certificates - All certificates for an employee
/**
 * GET /api/hr/employees/:employeId/certificates
 */
employesRouter.get("/employees/:employeId/certificates", getAuthUser, attachAbility, async (req, res) => {
    try {
        const { employeId } = req.params;
        const certs = await db.select()
            .from(formationCertificates)
            .where(eq(formationCertificates.employeId, employeId))
            .orderBy(desc(formationCertificates.dateEmission));
        res.json(certs);
    } catch (error) {
        logger.error({ err: error }, 'Erreur chargement certificats employé');
        res.status(500).json({ error: "Erreur lors du chargement des certificats" });
    }
});

/**
 * ========================================
 * AUDIT LOG RH
 * ========================================
 */

// GET /api/hr/audit - Historique des actions RH
/**
 * GET /api/hr/audit
 */
employesRouter.get("/audit", getAuthUser, attachAbility, async (req, res) => {
  try {
    const { entityType, entityId, limit = '50', page = '1' } = req.query;

    // CASL: only users with VIEW on HR_AUDIT (or MANAGE on RH) can access audit logs
    const canViewAudit = req.ability?.can(Actions.VIEW, Subjects.HR_AUDIT)
      || req.ability?.can(Actions.MANAGE, Subjects.RH) || false;
    if (!canViewAudit) {
      return res.status(403).json(errorResponse('FORBIDDEN', 'Non autorisé à consulter l\'audit'));
    }

    const limitNum = Math.min(100, parseInt(limit as string) || 50);
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const offset = (pageNum - 1) * limitNum;

    const logs = await hrService.getAuditLog(
      entityType as string | undefined,
      entityId as string | undefined,
      limitNum
    );

    res.json(successResponse(logs, {
      page: pageNum,
      limit: limitNum,
    }));
  } catch (error) {
    logger.error({ err: error }, 'Erreur récupération audit RH');
    res.status(500).json(errorResponse('SERVER_ERROR', 'Erreur serveur'));
  }
});

/**
 * ========================================
 * ORGANIGRAMME
 * ========================================
 */

// GET /api/hr/organigramme - Structure hiérarchique (supports ?agenceId=X for multi-agency)
/**
 * GET /api/hr/organigramme
 */
employesRouter.get("/organigramme", getAuthUser, attachAbility, async (req, res) => {
    try {
        // Accept agenceId from query param (for multi-agency users) or fallback to session
        const agenceId = (req.query.agenceId as string) || req.user?.agenceId || undefined;
        const orgChart = await storage.getOrganigramme(agenceId);
        res.json(orgChart);
    } catch (error) {
        logger.error({ err: error }, 'Erreur récupération organigramme');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/organigramme/reassign - Drag-drop: change employee's manager
/**
 * PATCH /api/hr/organigramme/reassign
 */
employesRouter.patch("/organigramme/reassign", getAuthUser, attachAbility, async (req, res) => {
    try {
        const userId = req.user?.id;

        // CASL: only users with MANAGE on EMPLOYE (or MANAGE on RH) can reassign hierarchy
        const canReassign = req.ability?.can(Actions.MANAGE, Subjects.EMPLOYE)
          || req.ability?.can(Actions.MANAGE, Subjects.RH) || false;
        if (!canReassign) {
            return res.status(403).json({ error: "Non autorisé à modifier la hiérarchie" });
        }

        const schema = z.object({
            employeId: z.string().uuid(),
            newManagerId: z.string().uuid().nullable(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Données invalides", details: parsed.error.flatten() });
        }

        const { employeId, newManagerId } = parsed.data;

        // Prevent self-assignment
        if (employeId === newManagerId) {
            return res.status(400).json({ error: "Un employé ne peut pas être son propre manager" });
        }

        // Prevent circular hierarchy: walk up from newManagerId to ensure employeId isn't an ancestor
        if (newManagerId) {
            let currentId: string | null = newManagerId;
            const visited = new Set<string>();
            while (currentId) {
                if (currentId === employeId) {
                    return res.status(400).json({ error: "Affectation circulaire détectée. Cet employé est déjà un supérieur du manager cible." });
                }
                if (visited.has(currentId)) break;
                visited.add(currentId);
                const [emp] = await db.select({ managerId: employes.managerId }).from(employes).where(eq(employes.id, currentId));
                currentId = emp?.managerId || null;
            }
        }

        await storage.updateEmploye(employeId, { managerId: newManagerId });

        // Audit log
        await db.insert(hrAuditLog).values({
            action: 'reassigned',
            entityType: 'employe',
            entityId: employeId,
            actorUserId: userId!,
            actorName: req.user?.nom || '',
            actorRole: req.user?.role || '',
            newValues: { managerId: newManagerId },
        });

        broadcastHrUpdate(
            { entity: 'organigramme', action: 'updated', id: employeId, extra: { newManagerId } },
            { id: userId!, name: req.user?.nom || '' }
        );

        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'Erreur reassign organigramme');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * ========================================
 * IMPORT CSV EMPLOYES
 * ========================================
 */

// POST /api/hr/import - Import employees from CSV file
/**
 * POST /api/hr/import
 */
employesRouter.post("/import", getAuthUser, csvUpload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Aucun fichier CSV fourni" });
        }

        const csvContent = req.file.buffer.toString("utf-8");
        const { agenceId } = req.body || {};

        // Preview mode: parse and validate only
        if (req.query.preview === "true") {
            const { headers, rows } = parseCsv(csvContent);
            return res.json({
                headers,
                totalRows: rows.length,
                preview: rows.slice(0, 10), // First 10 rows
            });
        }

        // Full import
        const result = await importEmployees(csvContent, agenceId);

        // Broadcast HR update
        const wsInstance = getWsInstance();
        if (wsInstance && result.created > 0) {
            wsInstance.broadcast({
                type: "HR_UPDATE",
                payload: { entity: "employe", action: "created", extra: { count: result.created } },
            });
        }

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, 'Erreur import CSV');
        res.status(500).json({ error: "Erreur lors de l'import" });
    }
});

// ============================================================================
// EMPLOYEE DOCUMENTS
// ============================================================================

// GET /api/hr/employees/:employeId/documents - List documents for an employee
/**
 * GET /api/hr/employees/:employeId/documents
 */
employesRouter.get("/employees/:employeId/documents", getAuthUser, attachAbility, requireAbility(Actions.VIEW, Subjects.RH), async (req, res) => {
    try {
        const { employeId } = req.params;
        const docs = await db.select()
            .from(employeeDocuments)
            .where(eq(employeeDocuments.employeId, employeId))
            .orderBy(desc(employeeDocuments.createdAt));

        // Generate presigned URLs for private docs
        const enriched = await Promise.all(docs.map(async (doc) => {
            let url: string | null = null;
            try {
                if (doc.bucket === 'private') {
                    url = await StorageService.getPresignedDownloadUrl(doc.storageKey, 3600);
                } else {
                    url = StorageService.getPublicUrl(doc.storageKey);
                }
            } catch { /* ignore URL generation errors */ }
            return { ...doc, url };
        }));

        res.json(enriched);
    } catch (error) {
        logger.error({ err: error }, 'Erreur chargement documents');
        res.status(500).json({ error: "Erreur lors du chargement des documents" });
    }
});

// POST /api/hr/employees/:employeId/documents - Upload a document with metadata
/**
 * POST /api/hr/employees/:employeId/documents
 */
employesRouter.post("/employees/:employeId/documents", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), docUpload.single('file'), async (req, res) => {
    try {
        const { employeId } = req.params;
        const userId = req.user?.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "Fichier requis" });
        }

        const { typeDocument, categorie, nom, description, dateEmission, dateExpiration } = req.body;

        if (!typeDocument || !nom) {
            return res.status(400).json({ error: "Le type de document et le nom sont requis" });
        }

        // Upload to MinIO (private bucket for employee documents)
        const storagePath = `employe/${employeId}`;
        const storageKey = await StorageService.uploadBuffer(
            file.buffer,
            file.originalname,
            file.mimetype,
            storagePath,
            false, // private
        );

        // Create metadata record
        const [doc] = await db.insert(employeeDocuments).values({
            employeId,
            nom,
            typeDocument,
            categorie: categorie || 'GENERAL',
            description: description || null,
            storageKey,
            bucket: 'private',
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            dateEmission: dateEmission || null,
            dateExpiration: dateExpiration || null,
            statut: 'PENDING',
            ajoutePar: userId || null,
        }).returning();

        res.status(201).json(doc);
    } catch (error) {
        logger.error({ err: error }, 'Erreur upload document');
        res.status(500).json({ error: "Erreur lors de l'ajout du document" });
    }
});
