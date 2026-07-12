import {
  type AgencyMigration
} from "@shared/schema/agency_migration";
import { createLogger } from "../../lib/logger";

export const logger = createLogger('AgencyMigration');

export interface MigrationContext {
  migration: AgencyMigration;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface StepLog {
  step: string;
  timestamp: string;
  details?: any;
  success: boolean;
  count?: number;
  durationMs?: number;
}

export type PreFlightCheckType =
  | "OPEN_SESSIONS"
  | "PENDING_TRANSFERS"
  | "ACTIVE_OPERATIONS"
  | "BALANCE_VERIFICATION"
  | "DATA_INTEGRITY"
  | "TREASURY_RULES";

export class MigrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

