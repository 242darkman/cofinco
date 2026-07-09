/**
 * HR Service — Leave management + Audit logging
 *
 * Payroll calculation is now handled by payroll-engine.ts
 */

import { db } from "../db";
import {
  leaveBalances,
  demandesConges,
  hrAuditLog,
  presences,
  LeaveStatus,
  type LeaveBalance,
} from "@shared/schema";
import { eq, and, or, sql, gte, lte, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger('Service:HR');

// ============================================
// TYPES
// ============================================

interface LeaveValidationResult {
  valid: boolean;
  error?: string;
  code?: 'OVERLAP' | 'INSUFFICIENT_BALANCE' | 'INVALID_DATES' | 'EMPLOYEE_NOT_FOUND';
  details?: any;
}

interface AuditContext {
  userId?: string;
  userName?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  agenceId?: string;
}

// ============================================
// LEAVE BALANCE MANAGEMENT
// ============================================

export class HrService {
  /**
   * Get leave balance for an employee
   */
  async getLeaveBalance(
    employeId: string,
    year: number = new Date().getFullYear(),
    leaveType: string = 'Congé Annuel'
  ): Promise<LeaveBalance | null> {
    const [balance] = await db
      .select()
      .from(leaveBalances)
      .where(
        and(
          eq(leaveBalances.employeId, employeId),
          eq(leaveBalances.year, year),
          eq(leaveBalances.leaveType, leaveType)
        )
      );
    return balance || null;
  }

  /**
   * Get all leave balances for an employee
   */
  async getAllLeaveBalances(employeId: string): Promise<LeaveBalance[]> {
    return db
      .select()
      .from(leaveBalances)
      .where(eq(leaveBalances.employeId, employeId))
      .orderBy(desc(leaveBalances.year));
  }

  /**
   * Initialize leave balance for a new year
   */
  async initializeLeaveBalance(
    employeId: string,
    year: number,
    initialAllocation: number = 30,
    carryOver: number = 0
  ): Promise<LeaveBalance> {
    const [balance] = await db
      .insert(leaveBalances)
      .values({
        employeId,
        year,
        leaveType: 'Congé Annuel',
        initialAllocation,
        acquired: initialAllocation,
        used: 0,
        pending: 0,
        carryOver,
      })
      .onConflictDoUpdate({
        target: [leaveBalances.employeId, leaveBalances.year, leaveBalances.leaveType],
        set: {
          initialAllocation,
          carryOver,
          updatedAt: new Date(),
        },
      })
      .returning();
    return balance;
  }

  /**
   * Calculate business days between two dates (excluding weekends)
   */
  calculateBusinessDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) return 0;

    let count = 0;
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  /**
   * Validate a leave request
   */
  async validateLeaveRequest(
    employeId: string,
    dateDebut: string,
    dateFin: string,
    leaveType: string = 'Congé Annuel',
    excludeCongeId?: number
  ): Promise<LeaveValidationResult> {
    // 1. Validate dates
    if (new Date(dateFin) < new Date(dateDebut)) {
      return {
        valid: false,
        error: 'La date de fin doit être postérieure ou égale à la date de début',
        code: 'INVALID_DATES',
      };
    }

    // 2. Check for overlap with existing leaves
    const overlappingLeaves = await db
      .select()
      .from(demandesConges)
      .where(
        and(
          eq(demandesConges.employeId, employeId),
          or(
            eq(demandesConges.statut, LeaveStatus.PENDING),
            eq(demandesConges.statut, LeaveStatus.APPROVED)
          ),
          excludeCongeId ? sql`${demandesConges.id} != ${excludeCongeId}` : sql`1=1`,
          or(
            and(
              lte(demandesConges.dateDebut, dateFin),
              gte(demandesConges.dateFin, dateDebut)
            )
          )
        )
      );

    if (overlappingLeaves.length > 0) {
      return {
        valid: false,
        error: 'La période demandée chevauche une demande de congé existante',
        code: 'OVERLAP',
        details: {
          overlapping: overlappingLeaves.map((l) => ({
            id: l.id,
            dateDebut: l.dateDebut,
            dateFin: l.dateFin,
            statut: l.statut,
          })),
        },
      };
    }

    // 3. Check leave balance (only for annual leave)
    if (leaveType === 'Congé Annuel') {
      const year = new Date(dateDebut).getFullYear();
      const balance = await this.getLeaveBalance(employeId, year, leaveType);

      if (!balance) {
        await this.initializeLeaveBalance(employeId, year);
      }

      const daysRequested = this.calculateBusinessDays(dateDebut, dateFin);
      const currentBalance = balance
        ? balance.acquired + (balance.carryOver || 0) - balance.used - balance.pending
        : 30;

      if (daysRequested > currentBalance) {
        return {
          valid: false,
          error: `Solde insuffisant. Vous avez ${currentBalance} jour(s) disponible(s), ${daysRequested} demandé(s).`,
          code: 'INSUFFICIENT_BALANCE',
          details: {
            available: currentBalance,
            requested: daysRequested,
          },
        };
      }
    }

    return { valid: true };
  }

  /**
   * Update leave balance when a leave is approved
   */
  async onLeaveApproved(congeId: number): Promise<void> {
    const [conge] = await db
      .select()
      .from(demandesConges)
      .where(eq(demandesConges.id, congeId));

    if (!conge) return;

    const days = this.calculateBusinessDays(conge.dateDebut, conge.dateFin);
    const year = new Date(conge.dateDebut).getFullYear();

    await db
      .update(leaveBalances)
      .set({
        used: sql`${leaveBalances.used} + ${days}`,
        pending: sql`GREATEST(0, ${leaveBalances.pending} - ${days})`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(leaveBalances.employeId, conge.employeId),
          eq(leaveBalances.year, year)
        )
      );
  }

  /**
   * Create 'Congé' presence entries for each business day of an approved leave.
   * Skips days that already have a presence record.
   */
  async createLeavePresenceEntries(congeId: number): Promise<number> {
    const [conge] = await db
      .select()
      .from(demandesConges)
      .where(eq(demandesConges.id, congeId));

    if (!conge) return 0;

    const start = new Date(conge.dateDebut);
    const end = new Date(conge.dateFin);
    const current = new Date(start);
    const datesToCreate: string[] = [];

    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
        datesToCreate.push(current.toISOString().split("T")[0]);
      }
      current.setDate(current.getDate() + 1);
    }

    if (datesToCreate.length === 0) return 0;

    const existing = await db
      .select({ date: presences.date })
      .from(presences)
      .where(
        and(
          eq(presences.employeId, conge.employeId),
          gte(presences.date, conge.dateDebut),
          lte(presences.date, conge.dateFin)
        )
      );

    const existingDates = new Set(existing.map((e) => e.date));
    const newDates = datesToCreate.filter((d) => !existingDates.has(d));

    if (newDates.length === 0) return 0;

    await db.insert(presences).values(
      newDates.map((date) => ({
        employeId: conge.employeId,
        date,
        statut: "Congé",
        commentaire: `Congé ${conge.type} (#${conge.id})`,
      }))
    );

    return newDates.length;
  }

  /**
   * Update leave balance when a leave request is submitted
   */
  async onLeaveRequested(employeId: string, dateDebut: string, dateFin: string): Promise<void> {
    const days = this.calculateBusinessDays(dateDebut, dateFin);
    const year = new Date(dateDebut).getFullYear();

    const balance = await this.getLeaveBalance(employeId, year);
    if (!balance) {
      await this.initializeLeaveBalance(employeId, year);
    }

    await db
      .update(leaveBalances)
      .set({
        pending: sql`${leaveBalances.pending} + ${days}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(leaveBalances.employeId, employeId),
          eq(leaveBalances.year, year)
        )
      );
  }

  /**
   * Update leave balance when a leave is rejected or cancelled
   */
  async onLeaveRejectedOrCancelled(congeId: number): Promise<void> {
    const [conge] = await db
      .select()
      .from(demandesConges)
      .where(eq(demandesConges.id, congeId));

    if (!conge) return;

    const days = this.calculateBusinessDays(conge.dateDebut, conge.dateFin);
    const year = new Date(conge.dateDebut).getFullYear();

    await db
      .update(leaveBalances)
      .set({
        pending: sql`GREATEST(0, ${leaveBalances.pending} - ${days})`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(leaveBalances.employeId, conge.employeId),
          eq(leaveBalances.year, year)
        )
      );
  }

  // ============================================
  // AUDIT LOGGING
  // ============================================

  /**
   * Log an HR action
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
   * Get audit log for an entity
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

// Singleton instance
export const hrService = new HrService();
