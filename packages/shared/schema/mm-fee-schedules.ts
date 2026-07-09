/**
 * Mobile Money Fee Schedules
 * Barème des frais facturés aux clients pour les opérations Mobile Money.
 * Formule: fee = max(minFee, min(maxFee, feeFixed + amount × feePct / 100))
 */

import { pgTable, text, numeric, boolean, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { mobileMoneyProviderEnum, typePaymentIntentEnum } from "@shared/enum/enums";

// Fee option type (which party bears the fee)
export const feeOptionValues = ["CLIENT_PAYS", "FEES_DEDUCTED"] as const;
export type FeeOption = typeof feeOptionValues[number];

export const mmFeeSchedules = pgTable(
  "mm_fee_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Which operator + direction this schedule applies to
    provider: mobileMoneyProviderEnum("provider").notNull(),   // MTN | AIRTEL
    direction: typePaymentIntentEnum("direction").notNull(),    // COLLECTION | PAYOUT

    // Fee formula components
    feePct: numeric("fee_pct").notNull().default("0"),         // Percentage (e.g., 4.0 = 4%)
    feeFixed: numeric("fee_fixed").notNull().default("0"),     // Fixed amount component
    minFee: numeric("min_fee").notNull().default("0"),         // Floor
    maxFee: numeric("max_fee").notNull().default("999999999"), // Cap

    active: boolean("active").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idxProviderDirection: index("idx_mm_fee_schedules_provider_direction")
      .on(t.provider, t.direction),
    idxActive: index("idx_mm_fee_schedules_active").on(t.active),
    // One active schedule per provider+direction
    uqProviderDirectionActive: uniqueIndex("uq_mm_fee_schedules_provider_direction_active")
      .on(t.provider, t.direction)
      .where(sql`${t.active} = true`),
  })
);

export const insertMmFeeScheduleSchema = createInsertSchema(mmFeeSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMmFeeSchedule = z.infer<typeof insertMmFeeScheduleSchema>;
export type MmFeeSchedule = typeof mmFeeSchedules.$inferSelect;
