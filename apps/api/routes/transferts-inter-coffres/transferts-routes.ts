import { Router } from "express";
import { z } from "zod";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:TransfertsInterCoffres');
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import * as coffresQueries from "../../services/transfert-inter-coffres/coffres-queries";
import * as coffresOperations from "../../services/transfert-inter-coffres/coffres-operations";
import * as coffresConfig from "../../services/transfert-inter-coffres/coffres-config";
import {
  createTransfert,
  submitTransfert,
  approveTransfert,
  cancelTransfert
} from "../../services/transfert-inter-coffres/transfert-creation";
import {
  dispatchTransfert,
  receiveTransfert
} from "../../services/transfert-inter-coffres/transfert-workflow";
import {
  getTransfertDetails,
  listTransferts,
  getDocuments,
  getAuditLogs,
  getTransfertStats
} from "../../services/transfert-inter-coffres/transfert-queries";
import { db } from "../../db";
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
import { getWsInstance } from "../../ws-server";
import { broadcastTransfertUpdate } from "./utils";


export const transfertsRouter = Router();



// Middleware d'authentification pour toutes les routes
transfertsRouter.get("/stats/transferts", async (req, res) => {
  try {
    const result = await getTransfertStats();
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
transfertsRouter.get("/transferts", async (req, res) => {
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

    const result = await listTransferts({
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
transfertsRouter.post("/transferts", async (req, res) => {
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

    const result = await createTransfert({
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
transfertsRouter.get("/transferts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getTransfertDetails(id);

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
transfertsRouter.get("/transferts/:id/documents", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getDocuments(id);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /transferts/:id/documents');
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /transferts/:id/audit - Logs d'audit d'un transfert
transfertsRouter.get("/transferts/:id/audit", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getAuditLogs(id);
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
transfertsRouter.delete("/transferts/:id", async (req, res) => {
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
transfertsRouter.get("/transferts/export/csv", async (req, res) => {
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
    if (montantMin) filteredRows = filteredRows.filter((r: any) => parseFloat(r.montant || '0') >= parseFloat(montantMin as string));
    if (montantMax) filteredRows = filteredRows.filter((r: any) => parseFloat(r.montant || '0') <= parseFloat(montantMax as string));

    const header = 'Référence;Date;Montant;Devise;Type;Statut;Motif;Conditionnement;N° Scellé';
    const csvRows = filteredRows.map((r: any) =>
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
transfertsRouter.get("/transferts/stale", async (req, res) => {
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
