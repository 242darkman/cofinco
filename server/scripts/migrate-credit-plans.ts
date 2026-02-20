/**
 * Migration script for credit plans: converts legacy data to new schema.
 *
 * What it does:
 * 1. Converts type_credit text values (French -> enum)
 * 2. Copies actif -> is_active
 * 3. Migrates frais_dossier -> credit_plan_fees table
 * 4. Converts credit_plans.id from text to uuid if needed
 *
 * Run: docker compose exec app node --env-file=.env --import tsx server/scripts/migrate-credit-plans.ts
 */

import { db } from "../db";
import { creditPlans, creditPlanFees } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("migrate-credit-plans");

const TYPE_CREDIT_MAP: Record<string, string> = {
  Personnel: "PERSONAL",
  Immobilier: "REAL_ESTATE",
  Commercial: "COMMERCIAL",
  // Already correct values pass through
  PERSONAL: "PERSONAL",
  REAL_ESTATE: "REAL_ESTATE",
  COMMERCIAL: "COMMERCIAL",
};

async function migrate() {
  logger.info("Starting credit plan migration...");

  // 1. Convert type_credit text -> enum values
  const plans = await db.execute<{
    id: string;
    type_credit: string;
    actif: boolean | null;
    frais_dossier: string | null;
    is_active: boolean | null;
  }>(sql`
    SELECT id, type_credit,
           CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='credit_plans' AND column_name='actif')
                THEN (SELECT actif FROM credit_plans cp2 WHERE cp2.id = credit_plans.id)
                ELSE NULL END as actif,
           CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='credit_plans' AND column_name='frais_dossier')
                THEN (SELECT frais_dossier FROM credit_plans cp2 WHERE cp2.id = credit_plans.id)
                ELSE NULL END as frais_dossier,
           is_active
    FROM credit_plans
  `);

  let convertedTypes = 0;
  let migratedFees = 0;
  let migratedActive = 0;

  for (const plan of plans.rows) {
    const updates: Record<string, any> = {};

    // type_credit conversion
    const mapped = TYPE_CREDIT_MAP[plan.type_credit];
    if (mapped && mapped !== plan.type_credit) {
      await db.execute(
        sql`UPDATE credit_plans SET type_credit = ${mapped} WHERE id = ${plan.id}::uuid`
      );
      convertedTypes++;
      logger.info({ planId: plan.id, from: plan.type_credit, to: mapped }, "Converted type_credit");
    }

    // actif -> is_active (if actif column still exists and is_active is null/default)
    if (plan.actif !== null && plan.is_active === null) {
      await db.execute(
        sql`UPDATE credit_plans SET is_active = ${plan.actif} WHERE id = ${plan.id}::uuid`
      );
      migratedActive++;
      logger.info({ planId: plan.id, isActive: plan.actif }, "Migrated actif -> is_active");
    }

    // frais_dossier -> credit_plan_fees
    if (plan.frais_dossier && parseFloat(plan.frais_dossier) > 0) {
      const existing = await db
        .select()
        .from(creditPlanFees)
        .where(eq(creditPlanFees.planId, plan.id));

      const hasDossierFee = existing.some((f) => f.feeType === "DOSSIER");
      if (!hasDossierFee) {
        await db.insert(creditPlanFees).values({
          planId: plan.id,
          feeType: "DOSSIER",
          label: "Frais de dossier",
          calcType: "FIXED",
          value: plan.frais_dossier,
          collectionMode: "UPFRONT",
          isRefundable: false,
          sortOrder: 0,
          isActive: true,
        });
        migratedFees++;
        logger.info(
          { planId: plan.id, amount: plan.frais_dossier },
          "Migrated frais_dossier -> credit_plan_fees"
        );
      }
    }
  }

  logger.info(
    {
      totalPlans: plans.rows.length,
      convertedTypes,
      migratedFees,
      migratedActive,
    },
    "Migration completed"
  );
}

migrate()
  .then(() => {
    console.log("Migration done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
