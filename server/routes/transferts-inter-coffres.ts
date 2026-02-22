import { Router } from "express";
import { z } from "zod";
import { createLogger } from "../lib/logger";

const logger = createLogger('Routes:TransfertsInterCoffres');
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { TransfertInterCoffresService, CoffresFortsService } from "../services/transfert-inter-coffres";
import { db } from "../db";
import {
  coffresForts,
  transfertsInterCoffres,
  documentsTransfert,
  reconciliationsLiaison,
  tachesRegularisation,
  configTransfertInterCoffres,
} from "@shared/schema";
import { StatutCoffre, StatutReconciliation, StatutTacheRegularisation, StatutTransfertInterCoffre } from "@shared/enum/status-constants";
import { currencyCode } from "@shared/config/currency";
import { eq, and, desc, asc, gte, lte, isNull, inArray, sql } from "drizzle-orm";
import { getWsInstance } from "../ws-server";

/** Broadcast a transfert coffre event to all connected clients */
function broadcastTransfertUpdate(action: string, transfertId: string, payload?: any) {
  const ws = getWsInstance();
  if (ws) {
    ws.broadcast({
      type: "TRANSFERT_COFFRE_UPDATED",
      payload: { action, transfertId, ...payload },
    });
  }
}

export const transfertsInterCoffresRouter = Router();

const transfertService = new TransfertInterCoffresService();
const coffresService = new CoffresFortsService();

// Middleware d'authentification pour toutes les routes
transfertsInterCoffresRouter.use(requireAuth);

// ═══════════════════════════════════════════════════════════════════
// COFFRES-FORTS (VAULTS)
// ═══════════════════════════════════════════════════════════════════

// GET /coffres - Liste des coffres-forts
transfertsInterCoffresRouter.get("/coffres", async (req, res) => {
  try {
    const { ownerType, statut, agenceId } = req.query;

    const result = await coffresService.listCoffres({
      ownerType: ownerType as any,
      statut: statut as string,
      agenceId: agenceId as string,
    });

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /coffres');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /coffres/siege - Coffre du siège
transfertsInterCoffresRouter.get("/coffres/siege", async (req, res) => {
  try {
    const result = await coffresService.getCoffreSiege();
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /coffres/siege');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /coffres/:id - Détail d'un coffre
transfertsInterCoffresRouter.get("/coffres/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await coffresService.getCoffreById(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /coffres/:id');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /coffres/agence/:agenceId - Coffre d'une agence
transfertsInterCoffresRouter.get("/coffres/agence/:agenceId", async (req, res) => {
  try {
    const { agenceId } = req.params;
    const result = await coffresService.getCoffreByAgenceId(agenceId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /coffres/agence/:agenceId');
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /coffres/:id - Modifier un coffre
transfertsInterCoffresRouter.patch("/coffres/:id", attachAbility, requireAbility(Actions.MANAGE, Subjects.COFFRE), async (req, res) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      nom: z.string().optional(),
      plafondEncaisse: z.number().positive().optional(),
      soldeMinimum: z.number().min(0).optional(),
      statut: z.enum([StatutCoffre.ACTIVE, StatutCoffre.SUSPENDED, StatutCoffre.CLOSED]).optional(),
      description: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const result = await coffresService.updateCoffre(id, data);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur PATCH /coffres/:id');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /coffres/:id/approvisionner - Approvisionner un coffre
transfertsInterCoffresRouter.post("/coffres/:id/approvisionner", attachAbility, requireAbility(Actions.CREATE, Subjects.COFFRE_TRANSFERT), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const schema = z.object({
      montant: z.number().positive(),
      motif: z.string().min(10),
    });

    const { montant, motif } = schema.parse(req.body);
    const result = await coffresService.approvisionnerCoffre(id, montant, motif, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /coffres/:id/approvisionner');
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /coffres/stats - Statistiques des coffres
transfertsInterCoffresRouter.get("/stats/coffres", async (req, res) => {
  try {
    const result = await coffresService.getStatistiques();
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /stats/coffres');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/transferts - Statistiques des transferts (comptage + montants)
transfertsInterCoffresRouter.get("/stats/transferts", async (req, res) => {
  try {
    const result = await transfertService.getTransfertStats();
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /stats/transferts');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// TRANSFERTS INTER-COFFRES
// ═══════════════════════════════════════════════════════════════════

// GET /transferts - Liste des transferts
transfertsInterCoffresRouter.get("/transferts", async (req, res) => {
  try {
    const {
      page,
      limit,
      statut,
      coffreSourceId,
      coffreDestinationId,
      dateDebut,
      dateFin,
      search,
      sortBy,
      sortOrder,
      montantMin,
      montantMax,
    } = req.query;

    const result = await transfertService.listTransferts({
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      statut: statut as string,
      coffreSourceId: coffreSourceId as string,
      coffreDestinationId: coffreDestinationId as string,
      dateDebut: dateDebut as string,
      dateFin: dateFin as string,
      search: search as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as "asc" | "desc",
      montantMin: montantMin as string,
      montantMax: montantMax as string,
    });

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /transferts');
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /transferts - Créer un brouillon de transfert
transfertsInterCoffresRouter.post("/transferts", async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      coffreSourceId: z.string().uuid(),
      coffreDestinationId: z.string().uuid(),
      montant: z.number().positive(),
      devise: z.string().default(currencyCode()),
      motif: z.string().min(10),
      typeConditionnement: z.enum(["Sac scellé", "Mallette", "Enveloppe", "Autre"]),
      numeroScelle: z.string().optional(),
      agentsTransport: z.array(z.object({
        userId: z.string().uuid().optional(),
        nom: z.string().min(2),
        contact: z.string().min(5),
      })).min(2),
      heureDepart: z.string().optional(),
      dateTransfert: z.string().optional(),
      idempotencyKey: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const result = await transfertService.createTransfert({
      ...data,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate('CREATED', result.data?.id || '', { reference: result.data?.reference });
    res.status(201).json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts');
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /transferts/:id - Détail d'un transfert
transfertsInterCoffresRouter.get("/transferts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await transfertService.getTransfertDetails(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /transferts/:id');
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/submit - Soumettre un transfert
transfertsInterCoffresRouter.post("/transferts/:id/submit", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const result = await transfertService.submitTransfert({
      transfertId: id,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate('SUBMITTED', id, { statut: 'SUBMITTED' });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/submit');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/approve - Approuver un transfert
transfertsInterCoffresRouter.post("/transferts/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { level } = req.query;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      approved: z.boolean(),
      commentaire: z.string().optional(),
      rejectionReason: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const approvalLevel = level === "2" ? 2 : 1;

    const result = await transfertService.approveTransfert({
      transfertId: id,
      level: approvalLevel,
      ...data,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate(data.approved ? `APPROVED_L${approvalLevel}` : 'REJECTED', id, {
      statut: result.data?.statut,
    });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/approve');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/reject - Rejeter un transfert (alias pour approve avec approved=false)
transfertsInterCoffresRouter.post("/transferts/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { level } = req.query;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      reason: z.string().min(10),
    });

    const { reason } = schema.parse(req.body);
    const approvalLevel = level === "2" ? 2 : 1;

    const result = await transfertService.approveTransfert({
      transfertId: id,
      level: approvalLevel,
      approved: false,
      rejectionReason: reason,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate('REJECTED', id, { statut: 'REJECTED' });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/reject');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/dispatch - Dispatcher un transfert
transfertsInterCoffresRouter.post("/transferts/:id/dispatch", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      heureDepart: z.string().optional(),
      commentaire: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const result = await transfertService.dispatchTransfert({
      transfertId: id,
      ...data,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      // Retourner 409 Conflict pour les erreurs de concurrence
      if (result.errorCode === "TIC_CONFLICT" || result.errorCode === "TIC_024") {
        return res.status(409).json(result);
      }
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate('DISPATCHED', id, { statut: 'IN_TRANSIT' });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/dispatch');
    // Gérer les erreurs de verrouillage PostgreSQL (lock_not_available)
    if (error.code === "55P03") {
      return res.status(409).json({ 
        success: false, 
        errorCode: "TIC_CONFLICT",
        error: "Ce transfert est en cours de traitement par un autre utilisateur." 
      });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/receive - Réceptionner un transfert
transfertsInterCoffresRouter.post("/transferts/:id/receive", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      montantRecu: z.number().positive(),
      conforme: z.boolean(),
      commentaire: z.string().optional(),
      motifEcart: z.string().optional(),
      heureReception: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const result = await transfertService.receiveTransfert({
      transfertId: id,
      ...data,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      // Retourner 409 Conflict pour les erreurs de concurrence
      if (result.errorCode === "TIC_CONFLICT") {
        return res.status(409).json(result);
      }
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate('RECEIVED', id, {
      statut: data.conforme ? 'RECEIVED' : 'RECEIVED_WITH_DISCREPANCY',
      conforme: data.conforme,
    });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/receive');
    // Gérer les erreurs de verrouillage PostgreSQL (lock_not_available)
    if (error.code === "55P03") {
      return res.status(409).json({ 
        success: false, 
        errorCode: "TIC_CONFLICT",
        error: "Ce transfert est en cours de traitement par un autre utilisateur." 
      });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/cancel - Annuler un transfert
transfertsInterCoffresRouter.post("/transferts/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      reason: z.string().min(10),
    });

    const { reason } = schema.parse(req.body);

    const result = await transfertService.cancelTransfert({
      transfertId: id,
      reason,
      userId,
      userRole,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    broadcastTransfertUpdate('CANCELLED', id, { statut: 'CANCELLED' });
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/:id/cancel');
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /transferts/:id/documents - Documents d'un transfert
transfertsInterCoffresRouter.get("/transferts/:id/documents", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await transfertService.getDocuments(id);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /transferts/:id/documents');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /transferts/:id/audit - Logs d'audit d'un transfert
transfertsInterCoffresRouter.get("/transferts/:id/audit", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await transfertService.getAuditLogs(id);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /transferts/:id/audit');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// RECONCILIATION & TACHES
// ═══════════════════════════════════════════════════════════════════

// GET /reconciliations - Liste des réconciliations
transfertsInterCoffresRouter.get("/reconciliations", async (req, res) => {
  try {
    const { statut, dateDebut } = req.query;

    let query = db.select().from(reconciliationsLiaison);

    const conditions = [];
    if (statut && statut !== "all") {
      conditions.push(eq(reconciliationsLiaison.statut, statut as any));
    }
    if (dateDebut) {
      conditions.push(gte(reconciliationsLiaison.dateOperation, dateDebut as string));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const reconciliations = await query.orderBy(desc(reconciliationsLiaison.createdAt));

    // Stats - Using standardized English enum values
    const stats = {
      rapprochees: reconciliations.filter(r => r.statut === StatutReconciliation.RECONCILED).length,
      enAttente: reconciliations.filter(r => r.statut === StatutReconciliation.PENDING).length,
      ecarts: reconciliations.filter(r => r.statut === StatutReconciliation.DISCREPANCY_DETECTED).length,
    };

    res.json({ success: true, reconciliations, stats });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /reconciliations');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /taches - Liste des tâches de régularisation
transfertsInterCoffresRouter.get("/taches", async (req, res) => {
  try {
    const { statut, type, priorite } = req.query;

    let query = db.select().from(tachesRegularisation);

    const conditions = [];
    if (statut && statut !== "all") {
      conditions.push(eq(tachesRegularisation.statut, statut as any));
    }
    if (type && type !== "all") {
      conditions.push(eq(tachesRegularisation.type, type as any));
    }
    if (priorite && priorite !== "all") {
      conditions.push(eq(tachesRegularisation.priorite, priorite as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const taches = await query.orderBy(desc(tachesRegularisation.createdAt));

    res.json({ success: true, taches });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /taches');
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /taches/:id/resolve - Résoudre une tâche
transfertsInterCoffresRouter.post("/taches/:id/resolve", attachAbility, requireAbility(Actions.APPROVE, Subjects.COFFRE_TRANSFERT), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const schema = z.object({
      resolution: z.string().min(10),
    });

    const { resolution } = schema.parse(req.body);

    const [updated] = await db
      .update(tachesRegularisation)
      .set({
        statut: StatutTacheRegularisation.RESOLVED,
        resolution,
        resolvedBy: userId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tachesRegularisation.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, error: "Tâche introuvable" });
    }

    res.json({ success: true, tache: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /taches/:id/resolve');
    res.status(400).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

// GET /config - Configuration globale
transfertsInterCoffresRouter.get("/config", async (req, res) => {
  try {
    const { agenceId } = req.query;

    const condition = agenceId
      ? eq(configTransfertInterCoffres.agenceId, agenceId as string)
      : isNull(configTransfertInterCoffres.agenceId);

    let [config] = await db
      .select()
      .from(configTransfertInterCoffres)
      .where(condition);

    if (!config && !agenceId) {
      // Créer config globale par défaut
      const result = await coffresService.getOrCreateGlobalConfig();
      config = result.data;
    }

    res.json({ success: true, config });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /config');
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /config - Mettre à jour la configuration
transfertsInterCoffresRouter.put("/config", attachAbility, requireAbility(Actions.MANAGE, Subjects.COFFRE), async (req, res) => {
  try {
    const { agenceId } = req.query;

    const schema = z.object({
      montantMinTransfert: z.number().optional(),
      montantMaxTransfert: z.number().optional(),
      seuilAlertePlafond: z.number().min(0).max(100).optional(),
      nombreAgentsTransportMin: z.number().min(1).optional(),
      scelleObligatoireSiMontantSuperieur: z.number().optional(),
      separationCreateurApprobateurN1: z.boolean().optional(),
      separationApprobateurN1N2: z.boolean().optional(),
      separationApprobateurRecepteur: z.boolean().optional(),
      rolesCreateurs: z.array(z.string()).optional(),
      rolesApprobateursN1: z.array(z.string()).optional(),
      rolesApprobateursN2: z.array(z.string()).optional(),
      rolesRecepteurs: z.array(z.string()).optional(),
      delaiMaxReconciliation: z.number().min(1).optional(),
      alerteReconciliationActive: z.boolean().optional(),
      actif: z.boolean().optional(),
    });

    const data = schema.parse(req.body);

    // Convertir les nombres en strings pour les champs numeric
    const convertedData: any = { ...data };
    if (data.montantMinTransfert !== undefined) {
      convertedData.montantMinTransfert = data.montantMinTransfert.toString();
    }
    if (data.montantMaxTransfert !== undefined) {
      convertedData.montantMaxTransfert = data.montantMaxTransfert.toString();
    }
    if (data.seuilAlertePlafond !== undefined) {
      convertedData.seuilAlertePlafond = data.seuilAlertePlafond.toString();
    }
    if (data.nombreAgentsTransportMin !== undefined) {
      convertedData.nombreAgentsTransportMin = data.nombreAgentsTransportMin.toString();
    }
    if (data.scelleObligatoireSiMontantSuperieur !== undefined) {
      convertedData.scelleObligatoireSiMontantSuperieur = data.scelleObligatoireSiMontantSuperieur.toString();
    }
    if (data.delaiMaxReconciliation !== undefined) {
      convertedData.delaiMaxReconciliation = data.delaiMaxReconciliation.toString();
    }

    const result = await coffresService.updateConfig(
      agenceId as string | null,
      convertedData
    );

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur PUT /config');
    res.status(400).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// NOUVELLES FONCTIONNALITÉS
// ═══════════════════════════════════════════════════════════════════

// DELETE /transferts/:id - Supprimer un brouillon
transfertsInterCoffresRouter.delete("/transferts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    // Vérifier que le transfert est bien en DRAFT
    const [transfert] = await db.select().from(transfertsInterCoffres).where(eq(transfertsInterCoffres.id, id));
    if (!transfert) return res.status(404).json({ success: false, error: "Transfert introuvable" });
    if (transfert.statut !== StatutTransfertInterCoffre.DRAFT) {
      return res.status(400).json({ success: false, error: "Seuls les brouillons peuvent être supprimés" });
    }

    await db.delete(transfertsInterCoffres).where(eq(transfertsInterCoffres.id, id));
    broadcastTransfertUpdate('DELETED', id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur DELETE /transferts/:id');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/bulk-approve - Approuver en lot
transfertsInterCoffresRouter.post("/transferts/bulk-approve", async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const schema = z.object({
      transfertIds: z.array(z.string().uuid()).min(1).max(50),
      level: z.number().min(1).max(2),
      commentaire: z.string().optional(),
    });
    const { transfertIds, level, commentaire } = schema.parse(req.body);

    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const tid of transfertIds) {
      try {
        const result = await transfertService.approveTransfert({
          transfertId: tid,
          level,
          approved: true,
          commentaire,
          userId,
          userRole,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
        results.push({ id: tid, success: result.success, error: result.error });
        if (result.success) broadcastTransfertUpdate(`APPROVED_L${level}`, tid);
      } catch (e: any) {
        results.push({ id: tid, success: false, error: e.message });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    res.json({ success: true, data: { total: transfertIds.length, succeeded, failed: transfertIds.length - succeeded, results } });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/bulk-approve');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/bulk-reject - Rejeter en lot
transfertsInterCoffresRouter.post("/transferts/bulk-reject", async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? '';
    if (!userId) return res.status(401).json({ success: false, error: "Non authentifié" });

    const schema = z.object({
      transfertIds: z.array(z.string().uuid()).min(1).max(50),
      level: z.number().min(1).max(2),
      reason: z.string().min(10),
    });
    const { transfertIds, level, reason } = schema.parse(req.body);

    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const tid of transfertIds) {
      try {
        const result = await transfertService.approveTransfert({
          transfertId: tid,
          level,
          approved: false,
          rejectionReason: reason,
          userId,
          userRole,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
        results.push({ id: tid, success: result.success, error: result.error });
        if (result.success) broadcastTransfertUpdate('REJECTED', tid);
      } catch (e: any) {
        results.push({ id: tid, success: false, error: e.message });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    res.json({ success: true, data: { total: transfertIds.length, succeeded, failed: transfertIds.length - succeeded, results } });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /transferts/bulk-reject');
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /transferts/export/csv - Export CSV de la liste des transferts
transfertsInterCoffresRouter.get("/transferts/export/csv", async (req, res) => {
  try {
    const { statut, dateDebut, dateFin, montantMin, montantMax } = req.query;

    const conditions = [];
    if (statut && statut !== "all") conditions.push(eq(transfertsInterCoffres.statut, statut as any));
    if (dateDebut) conditions.push(gte(transfertsInterCoffres.dateTransfert, dateDebut as string));
    if (dateFin) conditions.push(lte(transfertsInterCoffres.dateTransfert, dateFin as string));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        reference: transfertsInterCoffres.reference,
        dateTransfert: transfertsInterCoffres.dateTransfert,
        montant: transfertsInterCoffres.montant,
        devise: transfertsInterCoffres.devise,
        typeTransfert: transfertsInterCoffres.typeTransfert,
        statut: transfertsInterCoffres.statut,
        motif: transfertsInterCoffres.motif,
        typeConditionnement: transfertsInterCoffres.typeConditionnement,
        numeroScelle: transfertsInterCoffres.numeroScelle,
        createdAt: transfertsInterCoffres.createdAt,
      })
      .from(transfertsInterCoffres)
      .where(whereClause)
      .orderBy(desc(transfertsInterCoffres.dateTransfert));

    // Filtrage montant en JS (les champs numeric sont des strings)
    let filteredRows = rows;
    if (montantMin) filteredRows = filteredRows.filter(r => parseFloat(r.montant || '0') >= parseFloat(montantMin as string));
    if (montantMax) filteredRows = filteredRows.filter(r => parseFloat(r.montant || '0') <= parseFloat(montantMax as string));

    const header = 'Référence;Date;Montant;Devise;Type;Statut;Motif;Conditionnement;N° Scellé';
    const csvRows = filteredRows.map(r =>
      [
        r.reference,
        r.dateTransfert ? new Date(r.dateTransfert).toLocaleDateString('fr-FR') : '',
        r.montant,
        r.devise,
        r.typeTransfert,
        r.statut,
        `"${(r.motif || '').replace(/"/g, '""')}"`,
        r.typeConditionnement,
        r.numeroScelle || '',
      ].join(';')
    );

    const csv = [header, ...csvRows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=transferts_inter_coffres_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send('\uFEFF' + csv); // BOM for Excel
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /transferts/export/csv');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /taches/stats - Statistiques des tâches de régularisation
transfertsInterCoffresRouter.get("/taches/stats", async (req, res) => {
  try {
    const taches = await db.select().from(tachesRegularisation);
    const stats = {
      total: taches.length,
      open: taches.filter(t => t.statut === StatutTacheRegularisation.OPEN).length,
      inProgress: taches.filter(t => t.statut === 'IN_PROGRESS').length,
      resolved: taches.filter(t => t.statut === StatutTacheRegularisation.RESOLVED).length,
      escalated: taches.filter(t => t.statut === 'ESCALATED').length,
      critical: taches.filter(t => t.priorite === 'CRITICAL').length,
      high: taches.filter(t => t.priorite === 'HIGH').length,
    };
    res.json({ success: true, data: stats });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /taches/stats');
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /taches/:id/escalate - Escalader une tâche
transfertsInterCoffresRouter.post("/taches/:id/escalate", attachAbility, requireAbility(Actions.APPROVE, Subjects.COFFRE_TRANSFERT), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const [updated] = await db
      .update(tachesRegularisation)
      .set({
        statut: 'ESCALATED' as any,
        priorite: 'CRITICAL' as any,
        updatedAt: new Date(),
      })
      .where(eq(tachesRegularisation.id, id))
      .returning();

    if (!updated) return res.status(404).json({ success: false, error: "Tâche introuvable" });

    broadcastTransfertUpdate('TASK_ESCALATED', id, { tacheId: id });
    res.json({ success: true, tache: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /taches/:id/escalate');
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /reconciliations/:id/resolve - Résoudre manuellement une réconciliation
transfertsInterCoffresRouter.post("/reconciliations/:id/resolve", attachAbility, requireAbility(Actions.APPROVE, Subjects.COFFRE_TRANSFERT), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const schema = z.object({
      resolution: z.string().min(10),
      montantAjuste: z.number().optional(),
    });
    const { resolution, montantAjuste } = schema.parse(req.body);

    const updateData: any = {
      statut: StatutReconciliation.RECONCILED,
      commentaire: resolution,
      resolvedBy: userId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    };
    if (montantAjuste !== undefined) {
      updateData.montantRecu = montantAjuste.toString();
    }

    const [updated] = await db
      .update(reconciliationsLiaison)
      .set(updateData)
      .where(eq(reconciliationsLiaison.id, id))
      .returning();

    if (!updated) return res.status(404).json({ success: false, error: "Réconciliation introuvable" });

    broadcastTransfertUpdate('RECONCILIATION_RESOLVED', id);
    res.json({ success: true, reconciliation: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur POST /reconciliations/:id/resolve');
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /transferts/stale - Transferts bloqués (escalation check)
transfertsInterCoffresRouter.get("/transferts/stale", async (req, res) => {
  try {
    const hoursThreshold = parseInt(req.query.hours as string) || 24;
    const cutoff = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);

    const stale = await db.select()
      .from(transfertsInterCoffres)
      .where(and(
        inArray(transfertsInterCoffres.statut, [
          StatutTransfertInterCoffre.SUBMITTED,
          StatutTransfertInterCoffre.APPROVED_L1,
          StatutTransfertInterCoffre.IN_TRANSIT,
        ] as any),
        lte(transfertsInterCoffres.updatedAt, cutoff),
      ))
      .orderBy(asc(transfertsInterCoffres.updatedAt));

    res.json({ success: true, data: stale, count: stale.length, thresholdHours: hoursThreshold });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /transferts/stale');
    res.status(500).json({ success: false, error: error.message });
  }
});
