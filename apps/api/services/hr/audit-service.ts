/**
 * Journal d'audit RH : enregistrement et consultation des actions
 * sur les entités RH (diff automatique ancien/nouveau).
 */

import { db } from "../../db";
import { hrAuditLog } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import type { AuditContext } from "./types";

export class HrAuditService {
  /**
   * Journalise une action RH
   */
  async logAction(
    entityType: string,
    entityId: string | number,
    action: string,
    context: AuditContext,
    oldValues?: any,
    newValues?: any,
    reason?: string,
    severity: 'info' | 'warning' | 'critical' = 'info'
  ): Promise<void> {
    let diff: Record<string, { old: any; new: any }> | undefined;
    if (oldValues && newValues) {
      diff = {};
      const allKeys = Array.from(new Set([
        ...Object.keys(oldValues || {}),
        ...Object.keys(newValues || {}),
      ]));
      for (const key of allKeys) {
        if (oldValues?.[key] !== newValues?.[key]) {
          diff[key] = { old: oldValues?.[key], new: newValues?.[key] };
        }
      }
    }

    await db.insert(hrAuditLog).values({
      entityType,
      entityId: String(entityId),
      action,
      actorUserId: context.userId,
      actorName: context.userName,
      actorRole: context.userRole,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      oldValues,
      newValues,
      diff,
      reason,
      severity,
      agenceId: context.agenceId,
    });
  }

  /**
   * Récupère le journal d'audit d'une entité
   */
  async getAuditLog(
    entityType?: string,
    entityId?: string,
    limit: number = 50
  ): Promise<any[]> {
    let query = db.select().from(hrAuditLog);

    const conditions = [];
    if (entityType) conditions.push(eq(hrAuditLog.entityType, entityType));
    if (entityId) conditions.push(eq(hrAuditLog.entityId, entityId));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query.orderBy(desc(hrAuditLog.createdAt)).limit(limit);
  }
}
