import { Router } from "express";
/**
 * Routes RH — Documents RH : demandes de documents, dossiers et attestations.
 *
 * Monté sous /api/hr par le routeur d'index (hr.ts).
 * Endpoints :
 *   PATCH  /api/hr/certificates/:id/revoke
 *   POST   /api/hr/document-requests/:id/mark-read
 *   GET    /api/hr/documents/:id/preview-url
 *   PATCH  /api/hr/documents/:id
 *   PATCH  /api/hr/documents/:id/verify
 *   DELETE /api/hr/documents/:id
 *   GET    /api/hr/document-requests
 *   POST   /api/hr/document-requests
 *   PATCH  /api/hr/document-requests/:id/process
 *   GET    /api/hr/document-requests/:id/download
 */
import { db } from "../../db";
import { employes, employeeDocuments, formationCertificates, hrDocumentRequests, HrDocumentRequestStatus } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthUser } from "../../middleware";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { storage } from "../../storage";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { enqueueNotification, sendInAppNotification } from "../../services/notifications/notification-service";
import { StorageService } from "../../services/storage-service";
import * as hrStorage from "../../storage/hr";
import { broadcastHrEvent } from "./shared";

export const documentsRouter = Router();

// PATCH /api/hr/certificates/:id/revoke - Revoke a certificate
/**
 * PATCH /api/hr/certificates/:id/revoke
 */
documentsRouter.patch("/certificates/:id/revoke", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { motifRevocation } = req.body;

        if (!motifRevocation || motifRevocation.length < 10) {
            return res.status(400).json({ error: "Motif de révocation requis (10 caractères min)" });
        }

        const [updated] = await db.update(formationCertificates)
            .set({
                statut: 'REVOKED',
                revoquePar: userId,
                revoqueAt: new Date(),
                motifRevocation,
                updatedAt: new Date(),
            })
            .where(eq(formationCertificates.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Certificat non trouvé" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur révocation certificat');
        res.status(500).json({ error: "Erreur lors de la révocation" });
    }
});

// POST /api/hr/document-requests/:id/mark-read — employee marks completed document as viewed
/**
 * POST /api/hr/document-requests/:id/mark-read
 */
documentsRouter.post("/document-requests/:id/mark-read", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const docId = req.params.id;

        const [emp] = await db.select({ id: employes.id }).from(employes).where(eq(employes.userId, user.id)).limit(1);
        if (!emp) return res.status(403).json({ error: "Profil employé introuvable" });

        // Only mark as read if it belongs to the employee and not already read
        await db.update(hrDocumentRequests)
            .set({ viewedAt: new Date() })
            .where(and(
                eq(hrDocumentRequests.id, docId),
                eq(hrDocumentRequests.employeId, emp.id),
                isNull(hrDocumentRequests.viewedAt),
            ));

        res.json({ ok: true });
    } catch (error) {
        logger.error({ err: error }, "Erreur mark-read document request");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/documents/:id/preview-url - Get fresh presigned URL for inline preview
/**
 * GET /api/hr/documents/:id/preview-url
 */
documentsRouter.get("/documents/:id/preview-url", getAuthUser, attachAbility, requireAbility(Actions.VIEW, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const [doc] = await db.select().from(employeeDocuments).where(eq(employeeDocuments.id, id));
        if (!doc) {
            return res.status(404).json({ error: "Document non trouvé" });
        }
        let url: string | null;
        if (doc.bucket === 'private') {
            url = await StorageService.getPresignedDownloadUrl(doc.storageKey, 3600);
        } else {
            url = StorageService.getPublicUrl(doc.storageKey);
        }
        if (!url) {
            return res.status(404).json({ error: "URL du document non disponible" });
        }
        res.json({ url, mimeType: doc.mimeType, fileName: doc.fileName });
    } catch (error) {
        logger.error({ err: error }, 'Erreur génération URL preview');
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/documents/:id - Update document metadata
/**
 * PATCH /api/hr/documents/:id
 */
documentsRouter.patch("/documents/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const { nom, typeDocument, categorie, description, dateEmission, dateExpiration } = req.body;

        const updates: Record<string, any> = { updatedAt: new Date() };
        if (nom !== undefined) updates.nom = nom;
        if (typeDocument !== undefined) updates.typeDocument = typeDocument;
        if (categorie !== undefined) updates.categorie = categorie;
        if (description !== undefined) updates.description = description;
        if (dateEmission !== undefined) updates.dateEmission = dateEmission || null;
        if (dateExpiration !== undefined) updates.dateExpiration = dateExpiration || null;

        const [updated] = await db.update(employeeDocuments)
            .set(updates)
            .where(eq(employeeDocuments.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Document non trouvé" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur mise à jour document');
        res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
});

// PATCH /api/hr/documents/:id/verify - Verify or reject a document
/**
 * PATCH /api/hr/documents/:id/verify
 */
documentsRouter.patch("/documents/:id/verify", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { statut, motifRejet } = req.body;

        if (!statut || !['VERIFIED', 'REJECTED'].includes(statut)) {
            return res.status(400).json({ error: "Statut invalide (VERIFIED ou REJECTED attendu)" });
        }

        const updates: Record<string, any> = {
            statut,
            verifiePar: userId,
            verifieAt: new Date(),
            updatedAt: new Date(),
        };

        if (statut === 'REJECTED' && motifRejet) {
            updates.motifRejet = motifRejet;
        }

        const [updated] = await db.update(employeeDocuments)
            .set(updates)
            .where(eq(employeeDocuments.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Document non trouvé" });
        res.json(updated);
    } catch (error) {
        logger.error({ err: error }, 'Erreur vérification document');
        res.status(500).json({ error: "Erreur lors de la vérification" });
    }
});

// DELETE /api/hr/documents/:id - Delete a document and its file
/**
 * DELETE /api/hr/documents/:id
 */
documentsRouter.delete("/documents/:id", getAuthUser, attachAbility, requireAbility(Actions.MANAGE, Subjects.RH), async (req, res) => {
    try {
        const { id } = req.params;

        const [doc] = await db.select().from(employeeDocuments).where(eq(employeeDocuments.id, id));
        if (!doc) return res.status(404).json({ error: "Document non trouvé" });

        // Delete file from storage
        try {
            await StorageService.deleteFile(doc.storageKey, doc.bucket === 'public');
        } catch (storageErr) {
            logger.error({ err: storageErr, storageKey: doc.storageKey }, 'Storage delete failed');
        }

        // Delete metadata
        await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id));

        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'Erreur suppression document');
        res.status(500).json({ error: "Erreur lors de la suppression" });
    }
});

// =============================================================================
// DOCUMENT REQUESTS (Portail Employe)
// =============================================================================

// GET /api/hr/document-requests
/**
 * GET /api/hr/document-requests
 */
documentsRouter.get("/document-requests", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const mine = req.query.mine === 'true';

        if (mine) {
            // Employé: voir ses propres demandes
            const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
            if (!emp) return res.json([]);
            const requests = await hrStorage.getDocumentRequests({ employeId: emp.id });
            return res.json(requests);
        }

        // Admin RH: voir toutes les demandes
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) {
            return res.status(403).json({ error: "Non autorisé" });
        }

        const filters: { statut?: string } = {};
        if (req.query.statut) filters.statut = req.query.statut as string;
        const requests = await hrStorage.getDocumentRequests(filters);
        res.json(requests);
    } catch (error) {
        logger.error({ err: error }, "Erreur récupération demandes de documents");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// POST /api/hr/document-requests
/**
 * POST /api/hr/document-requests
 */
documentsRouter.post("/document-requests", getAuthUser, attachAbility, async (req, res) => {
    try {
        const user = (req as any).user;
        const [emp] = await db.select().from(employes).where(eq(employes.userId, user.id));
        if (!emp) {
            return res.status(400).json({ error: "Aucun profil employé associé à votre compte" });
        }

        const { type, motif, details, urgence } = req.body;
        if (!type) {
            return res.status(400).json({ error: "Le type de document est requis" });
        }

        const data = {
            employeId: emp.id,
            employeNom: `${user.nom}${user.prenom ? ' ' + user.prenom : ''}`,
            type,
            motif: motif || null,
            details: details || null,
            urgence: urgence || false,
            statut: HrDocumentRequestStatus.PENDING,
        };

        const result = await hrStorage.createDocumentRequest(data);

        broadcastHrEvent({ entity: 'document_request', action: 'created', id: result.id });

        // Notify HR staff + confirm to employee
        dispatchDomainEvent({
            type: "HR_DOCUMENT_REQUEST_CREATED",
            data: {
                requestId: result.id,
                employeId: emp.id,
                employeNom: data.employeNom,
                type,
                urgence: urgence || false,
                agenceId: user.agenceId,
            },
            timestamp: new Date(),
        });

        res.status(201).json(result);
    } catch (error) {
        logger.error({ err: error }, "Erreur création demande de document");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// PATCH /api/hr/document-requests/:id/process
/**
 * PATCH /api/hr/document-requests/:id/process
 */
documentsRouter.patch("/document-requests/:id/process", getAuthUser, attachAbility, requireAbility(Actions.EDIT, Subjects.RH), async (req, res) => {
    try {
        if (!req.ability?.can(Actions.MANAGE, Subjects.RH)) {
            return res.status(403).json({ error: "Non autorisé" });
        }

        const user = (req as any).user;
        const { statut, commentaireRh, motifRejet } = req.body;

        if (!statut) {
            return res.status(400).json({ error: "Le statut est requis" });
        }

        const updateData: any = {
            statut,
            traitePar: user.id,
            traiteAt: new Date(),
        };
        if (commentaireRh !== undefined) updateData.commentaireRh = commentaireRh;
        if (motifRejet !== undefined) updateData.motifRejet = motifRejet;

        const result = await hrStorage.updateDocumentRequest(req.params.id, updateData);
        if (!result) {
            return res.status(404).json({ error: "Demande introuvable" });
        }

        broadcastHrEvent({ entity: 'document_request', action: 'updated', id: result.id });

        // Notify the employee that their request was processed
        if (statut === 'COMPLETED' || statut === 'REJECTED') {
            const [emp] = await db.select({ userId: employes.userId }).from(employes).where(eq(employes.id, result.employeId)).limit(1);
            if (emp?.userId) {
                const isCompleted = statut === 'COMPLETED';
                sendInAppNotification({
                    userId: emp.userId,
                    type: isCompleted ? 'HR_DOCUMENT_REQUEST_COMPLETED' : 'HR_DOCUMENT_REQUEST_REJECTED',
                    titre: isCompleted ? 'Document prêt' : 'Demande de document rejetée',
                    message: isCompleted
                        ? `Votre demande de ${result.type} a été traitée. Le document est disponible.`
                        : `Votre demande de ${result.type} a été rejetée.${motifRejet ? ` Motif : ${motifRejet}` : ''}`,
                    priorite: 'NORMAL',
                }).catch((err) => logger.error({ err }, "Erreur notification in-app document request"));
            }
        }

        res.json(result);
    } catch (error) {
        logger.error({ err: error }, "Erreur traitement demande de document");
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// GET /api/hr/document-requests/:id/download
/**
 * GET /api/hr/document-requests/:id/download
 */
documentsRouter.get("/document-requests/:id/download", getAuthUser, attachAbility, async (req, res) => {
    try {
        const [request] = await db.select().from(hrDocumentRequests).where(eq(hrDocumentRequests.id, req.params.id));
        if (!request) {
            return res.status(404).json({ error: "Demande introuvable" });
        }
        if (request.statut !== HrDocumentRequestStatus.COMPLETED || !request.documentUrl) {
            return res.status(400).json({ error: "Le document n'est pas encore disponible" });
        }
        res.redirect(request.documentUrl);
    } catch (error) {
        logger.error({ err: error }, "Erreur téléchargement document");
        res.status(500).json({ error: "Erreur serveur" });
    }
});
