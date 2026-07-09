import type { PgTransaction } from "drizzle-orm/pg-core";
import type { SessionCaisse, TransfertCoffreCaisse } from "@shared/schema";

export type SessionRow = SessionCaisse;
export type TransfertRow = TransfertCoffreCaisse;
export type DbTransaction = PgTransaction<any, any, any>;

export interface BilletageRecord {
  "10000": number | null;
  "5000": number | null;
  "2000": number | null;
  "1000": number | null;
  "500": number | null;
  "250": number | null;
  "100": number | null;
  "50": number | null;
  "25": number | null;
}
