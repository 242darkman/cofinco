import { Router } from "express";
import { z } from "zod";
import { createLogger } from "../../lib/logger";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { db } from "../../db";
import { configTransfertInterCoffres } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";
import * as coffresConfig from "../../services/transfert-inter-coffres/coffres-config";

const logger = createLogger('Routes:ConfigTransfertsInterCoffres');

export const configRouter = Router();

// GET /config - Configuration globale
configRouter.get("/", async (req, res) => {
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
      const result = await coffresConfig.getOrCreateGlobalConfig();
      config = result.data;
    }

    res.json({ success: true, config });
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur GET /config');
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /config - Mettre à jour la configuration
configRouter.put("/", attachAbility, requireAbility(Actions.MANAGE, Subjects.COFFRE), async (req, res) => {
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

    const result = await coffresConfig.updateConfig(
      agenceId as string | null,
      convertedData
    );

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Erreur PUT /config');
    res.status(400).json({ success: false, error: error.message });
  }
});
