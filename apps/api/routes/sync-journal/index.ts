import { Router } from "express";
import { handshakeRouter } from "./handshake";
import { journalUploadRouter } from "./journal";
import { pullRouter } from "./pull";
import { devicesRouter } from "./devices";
import { auditRouter } from "./audit";

export const syncJournalRouter = Router();

// Phase 1: Handshake
syncJournalRouter.use("/", handshakeRouter);

// Phase 2: Upload Journal
syncJournalRouter.use("/", journalUploadRouter);

// Phase 3: Pull Updates
syncJournalRouter.use("/", pullRouter);

// Device Key Management
syncJournalRouter.use("/devices", devicesRouter);

// COBAC Compliance
syncJournalRouter.use("/", auditRouter);
