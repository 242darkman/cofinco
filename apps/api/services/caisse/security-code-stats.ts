import { db } from "../../db";
import { caisseSecurityCodes, caisseCodeUsages } from "@shared/schema";
import { eq, and, gte, lte, count } from "drizzle-orm";
import type { CodeStatistics } from "./security-code-types";

export class SecurityCodeStats {
  /**
   * Récupère les statistiques des codes
   */
  async getStatistics(agenceId?: string): Promise<CodeStatistics> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);

    const baseConditions = agenceId
      ? [eq(caisseSecurityCodes.agenceId, agenceId)]
      : [];

    const [activeResult] = await db.select({ count: count() })
      .from(caisseSecurityCodes)
      .where(and(eq(caisseSecurityCodes.active, true), ...baseConditions));

    const [expiredResult] = await db.select({ count: count() })
      .from(caisseSecurityCodes)
      .where(and(eq(caisseSecurityCodes.active, false), ...baseConditions));

    const byType = await db.select({
      codeType: caisseSecurityCodes.codeType,
      count: count(),
    })
    .from(caisseSecurityCodes)
    .where(and(eq(caisseSecurityCodes.active, true), ...baseConditions))
    .groupBy(caisseSecurityCodes.codeType);

    const [usageResult] = await db.select({ count: count() })
      .from(caisseCodeUsages)
      .where(and(
        gte(caisseCodeUsages.usedAt, startOfDay),
        eq(caisseCodeUsages.success, true)
      ));

    const [expiringResult] = await db.select({ count: count() })
      .from(caisseSecurityCodes)
      .where(and(
        eq(caisseSecurityCodes.active, true),
        gte(caisseSecurityCodes.expiresAt, now),
        lte(caisseSecurityCodes.expiresAt, in7Days),
        ...baseConditions
      ));

    const totalByType: Record<string, number> = {};
    for (const item of byType) {
      totalByType[item.codeType || 'UNKNOWN'] = item.count;
    }

    return {
      totalActive: activeResult?.count || 0,
      totalExpired: expiredResult?.count || 0,
      totalByType,
      usageCountToday: usageResult?.count || 0,
      expiringIn7Days: expiringResult?.count || 0,
    };
  }
}

export const securityCodeStats = new SecurityCodeStats();
