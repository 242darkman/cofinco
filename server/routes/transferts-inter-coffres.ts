import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth";
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
import { eq, and, desc, asc, gte, isNull } from "drizzle-orm";

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
    console.error("Erreur GET /coffres:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /coffres/siege - Coffre du siège
transfertsInterCoffresRouter.get("/coffres/siege", async (req, res) => {
  try {
    const result = await coffresService.getCoffreSiege();
    res.json(result);
  } catch (error: any) {
    console.error("Erreur GET /coffres/siege:", error);
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
    console.error("Erreur GET /coffres/:id:", error);
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
    console.error("Erreur GET /coffres/agence/:agenceId:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /coffres/:id - Modifier un coffre
transfertsInterCoffresRouter.patch("/coffres/:id", requireRole("admin", "Directeur", "Directeur Financier"), async (req, res) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      nom: z.string().optional(),
      plafondEncaisse: z.number().positive().optional(),
      soldeMinimum: z.number().min(0).optional(),
      statut: z.enum(["Actif", "Suspendu", "Fermé"]).optional(),
      description: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const result = await coffresService.updateCoffre(id, data);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error("Erreur PATCH /coffres/:id:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /coffres/:id/approvisionner - Approvisionner un coffre
transfertsInterCoffresRouter.post("/coffres/:id/approvisionner", requireRole("admin", "Directeur", "Directeur Financier", "Trésorier"), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

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
    console.error("Erreur POST /coffres/:id/approvisionner:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /coffres/stats - Statistiques des coffres
transfertsInterCoffresRouter.get("/stats/coffres", async (req, res) => {
  try {
    const result = await coffresService.getStatistiques();
    res.json(result);
  } catch (error: any) {
    console.error("Erreur GET /stats/coffres:", error);
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
    });

    res.json(result);
  } catch (error: any) {
    console.error("Erreur GET /transferts:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /transferts - Créer un brouillon de transfert
transfertsInterCoffresRouter.post("/transferts", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

    if (!userId) {
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    const schema = z.object({
      coffreSourceId: z.string().uuid(),
      coffreDestinationId: z.string().uuid(),
      montant: z.number().positive(),
      devise: z.string().default("XAF"),
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

    res.status(201).json(result);
  } catch (error: any) {
    console.error("Erreur POST /transferts:", error);
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
    console.error("Erreur GET /transferts/:id:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/submit - Soumettre un transfert
transfertsInterCoffresRouter.post("/transferts/:id/submit", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

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

    res.json(result);
  } catch (error: any) {
    console.error("Erreur POST /transferts/:id/submit:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/approve - Approuver un transfert
transfertsInterCoffresRouter.post("/transferts/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { level } = req.query;
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

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

    res.json(result);
  } catch (error: any) {
    console.error("Erreur POST /transferts/:id/approve:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/reject - Rejeter un transfert (alias pour approve avec approved=false)
transfertsInterCoffresRouter.post("/transferts/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { level } = req.query;
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

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

    res.json(result);
  } catch (error: any) {
    console.error("Erreur POST /transferts/:id/reject:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/dispatch - Dispatcher un transfert
transfertsInterCoffresRouter.post("/transferts/:id/dispatch", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

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
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error("Erreur POST /transferts/:id/dispatch:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/receive - Réceptionner un transfert
transfertsInterCoffresRouter.post("/transferts/:id/receive", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

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
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error("Erreur POST /transferts/:id/receive:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /transferts/:id/cancel - Annuler un transfert
transfertsInterCoffresRouter.post("/transferts/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

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

    res.json(result);
  } catch (error: any) {
    console.error("Erreur POST /transferts/:id/cancel:", error);
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
    console.error("Erreur GET /transferts/:id/documents:", error);
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
    console.error("Erreur GET /transferts/:id/audit:", error);
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

    // Stats
    const stats = {
      rapprochees: reconciliations.filter(r => r.statut === "Rapproché").length,
      enAttente: reconciliations.filter(r => r.statut === "En attente").length,
      ecarts: reconciliations.filter(r => r.statut === "Écart détecté").length,
    };

    res.json({ success: true, reconciliations, stats });
  } catch (error: any) {
    console.error("Erreur GET /reconciliations:", error);
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
    console.error("Erreur GET /taches:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /taches/:id/resolve - Résoudre une tâche
transfertsInterCoffresRouter.post("/taches/:id/resolve", requireRole("admin", "Comptable", "Directeur Financier"), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const schema = z.object({
      resolution: z.string().min(10),
    });

    const { resolution } = schema.parse(req.body);

    const [updated] = await db
      .update(tachesRegularisation)
      .set({
        statut: "Résolue",
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
    console.error("Erreur POST /taches/:id/resolve:", error);
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
    console.error("Erreur GET /config:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /config - Mettre à jour la configuration
transfertsInterCoffresRouter.put("/config", requireRole("admin", "Directeur"), async (req, res) => {
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
    console.error("Erreur PUT /config:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});
