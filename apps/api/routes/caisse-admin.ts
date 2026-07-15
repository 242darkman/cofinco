import { Router } from "express";
import { requireAuth } from "../auth";
import { registerCaisseAdminClosuresRoutes } from "./caisse-admin/caisse-admin-closures";
import { registerCaisseAdminDenominationRoutes } from "./caisse-admin/caisse-admin-denomination";
import { registerCaisseAdminEcartsRoutes } from "./caisse-admin/caisse-admin-ecarts";
import { registerCaisseAdminHandoversRoutes } from "./caisse-admin/caisse-admin-handovers";
import { registerCaisseAdminHistoriqueRoutes } from "./caisse-admin/caisse-admin-historique";
import { registerCaisseAdminLiquidationRoutes } from "./caisse-admin/caisse-admin-liquidation";
import { registerCaisseAdminPaymentsRoutes } from "./caisse-admin/caisse-admin-payments";
import { registerCaisseAdminSecurityRoutes } from "./caisse-admin/caisse-admin-security";

export const caisseAdminRouter = Router();
caisseAdminRouter.use(requireAuth);

registerCaisseAdminLiquidationRoutes(caisseAdminRouter);
registerCaisseAdminHistoriqueRoutes(caisseAdminRouter);
registerCaisseAdminDenominationRoutes(caisseAdminRouter);
registerCaisseAdminEcartsRoutes(caisseAdminRouter);
registerCaisseAdminClosuresRoutes(caisseAdminRouter);
registerCaisseAdminHandoversRoutes(caisseAdminRouter);
registerCaisseAdminSecurityRoutes(caisseAdminRouter);
registerCaisseAdminPaymentsRoutes(caisseAdminRouter);

export default caisseAdminRouter;
