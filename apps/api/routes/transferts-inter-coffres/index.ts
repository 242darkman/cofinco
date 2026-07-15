import { Router } from "express";
import { requireAuth } from "../../auth";
import { coffresRouter } from "./coffres-routes";
import { reconciliationsRouter } from "./reconciliations-routes";
import { tachesRouter } from "./taches-routes";
import { configRouter } from "./config-routes";
import { transfertsRouter } from "./transferts-routes";
import { transfertsWorkflowRouter } from "./transferts-workflow-routes";

export const transfertsInterCoffresRouter = Router();

// Middleware d'authentification pour toutes les routes
transfertsInterCoffresRouter.use(requireAuth);

// Mount sub-routers
transfertsInterCoffresRouter.use("/coffres", coffresRouter);
transfertsInterCoffresRouter.use("/reconciliations", reconciliationsRouter);
transfertsInterCoffresRouter.use("/taches", tachesRouter);
transfertsInterCoffresRouter.use("/config", configRouter);

// Transferts (and stats)
// Le sous-routeur workflow est monté sous /transferts
transfertsInterCoffresRouter.use("/transferts", transfertsWorkflowRouter);
// Pour éviter les conflits, nous laissons "transfertsRouter" gérer les routes restantes (racine et autres)
transfertsInterCoffresRouter.use("/", transfertsRouter);
