import {
  creditPlanFees,
  creditPlans,
  type CreditPlanFee,
  type InsertCreditPlan,
  type InsertCreditPlanFee,
  type UserCreditPlan
} from "@shared/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../db";

export async function getAllCreditPlans(filter: { isActive?: boolean, agenceId?: string } = {}): Promise<(UserCreditPlan & { fees: CreditPlanFee[] })[]> {
  const conditions = [];
  if (filter.isActive !== undefined) conditions.push(eq(creditPlans.isActive, filter.isActive));
  if (filter.agenceId) conditions.push(eq(creditPlans.agenceId, filter.agenceId));

  const plans = await db.select().from(creditPlans)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(creditPlans.createdAt));

  if (plans.length === 0) return [];

  const planIds = plans.map(p => p.id);
  const fees = await db.select().from(creditPlanFees)
    .where(inArray(creditPlanFees.planId, planIds))
    .orderBy(creditPlanFees.sortOrder);

  const feesByPlan = new Map<string, CreditPlanFee[]>();
  for (const fee of fees) {
    const list = feesByPlan.get(fee.planId) || [];
    list.push(fee);
    feesByPlan.set(fee.planId, list);
  }

  return plans.map(p => ({ ...p, fees: feesByPlan.get(p.id) || [] }));
}

export async function getCreditPlan(id: string): Promise<(UserCreditPlan & { fees: CreditPlanFee[] }) | undefined> {
  const [plan] = await db.select().from(creditPlans).where(eq(creditPlans.id, id));
  if (!plan) return undefined;

  const fees = await db.select().from(creditPlanFees)
    .where(eq(creditPlanFees.planId, id))
    .orderBy(creditPlanFees.sortOrder);

  return { ...plan, fees };
}

export async function createCreditPlan(
  plan: InsertCreditPlan,
  fees: InsertCreditPlanFee[] = [],
): Promise<UserCreditPlan & { fees: CreditPlanFee[] }> {
  return await db.transaction(async (tx) => {
    const [newPlan] = await tx.insert(creditPlans).values(plan).returning();

    const insertedFees: CreditPlanFee[] = [];
    if (fees.length > 0) {
      const feesWithPlanId = fees.map((f, i) => ({ ...f, planId: newPlan.id, sortOrder: i }));
      const result = await tx.insert(creditPlanFees).values(feesWithPlanId).returning();
      insertedFees.push(...result);
    }

    return { ...newPlan, fees: insertedFees };
  });
}

export async function updateCreditPlan(
  id: string,
  plan: Partial<InsertCreditPlan>,
  fees?: InsertCreditPlanFee[],
  expectedVersion?: number,
): Promise<(UserCreditPlan & { fees: CreditPlanFee[] }) | undefined> {
  return await db.transaction(async (tx) => {
    // Verrouillage optimiste
    if (expectedVersion !== undefined) {
      const [existing] = await tx.select({ version: creditPlans.version }).from(creditPlans).where(eq(creditPlans.id, id));
      if (!existing || existing.version !== expectedVersion) {
        throw new Error("CONFLICT: Le plan a été modifié par un autre utilisateur");
      }
    }

    const updateData = {
      ...plan,
      version: sql`${creditPlans.version} + 1`,
      updatedAt: new Date(),
    };
    const [updated] = await tx.update(creditPlans).set(updateData).where(eq(creditPlans.id, id)).returning();
    if (!updated) return undefined;

    // Remplacement des frais si fournis
    let resultFees: CreditPlanFee[];
    if (fees !== undefined) {
      await tx.delete(creditPlanFees).where(eq(creditPlanFees.planId, id));
      resultFees = [];
      if (fees.length > 0) {
        const feesWithPlanId = fees.map((f, i) => ({ ...f, planId: id, sortOrder: i }));
        resultFees = await tx.insert(creditPlanFees).values(feesWithPlanId).returning();
      }
    } else {
      resultFees = await tx.select().from(creditPlanFees)
        .where(eq(creditPlanFees.planId, id))
        .orderBy(creditPlanFees.sortOrder);
    }

    return { ...updated, fees: resultFees };
  });
}

export async function deleteCreditPlan(id: string): Promise<boolean> {
  const result = await db.update(creditPlans).set({ isActive: false }).where(eq(creditPlans.id, id)).returning();
  return result.length > 0;
}
