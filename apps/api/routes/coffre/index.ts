import { Router } from "express";
import { transfertsCoffreRouter } from "./transferts-routes";
import { operationsCoffreRouter } from "./operations-routes";
import { supervisionCoffreRouter } from "./supervision-routes";
import { configCoffreRouter } from "./config-routes";

export const coffreRouter = Router();

coffreRouter.use("/", transfertsCoffreRouter);
coffreRouter.use("/", operationsCoffreRouter);
coffreRouter.use("/", supervisionCoffreRouter);
coffreRouter.use("/", configCoffreRouter);
