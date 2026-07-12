import { Router } from "express";
import { z } from "zod";
import { createLogger } from "../../lib/logger";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../../db";
import { reconciliationsLiaison } from "@shared/schema";
import { StatutReconciliation } from "@shared/enum/status-constants";
import { eq, and, desc, gte } from "drizzle-orm";
import { broadcastTransfertUpdate } from "./utils";

const logger = createLogger('Routes:ReconciliationsCoffres');

export const reconciliationsRouter = Router();

// GET /reconciliations - Liste des réconciliations
reconciliationsRouter.get("/", async (req, res) => {
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

// POST /reconciliations/:id/resolve - Résoudre une réconciliation
reconciliationsRouter.post("/:id/resolve", attachAbility, requireAbility(Actions.APPROVE, Subjects.COFFRE_TRANSFERT), async (req, res) => {
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
