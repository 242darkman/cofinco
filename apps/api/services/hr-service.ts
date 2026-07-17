/**
 * HR Service — façade préservant l'API publique historique.
 *
 * Les responsabilités sont découpées dans `./hr/` :
 * - `hr/leave-service.ts` : soldes et cycle de vie des congés ;
 * - `hr/audit-service.ts` : journal d'audit RH.
 *
 * Le calcul de paie est géré par payroll-engine.ts.
 */

import type { LeaveBalance } from "@shared/schema";
import { HrLeaveService } from "./hr/leave-service";
import { HrAuditService } from "./hr/audit-service";
import type { AuditContext, LeaveValidationResult } from "./hr/types";

export type { AuditContext, LeaveValidationResult } from "./hr/types";
export { HrLeaveService } from "./hr/leave-service";
export { HrAuditService } from "./hr/audit-service";

export class HrService {
  private readonly leaves = new HrLeaveService();
  private readonly audit = new HrAuditService();

  // ---- Congés ----

  getLeaveBalance(
    employeId: string,
    year?: number,
    leaveType?: string
  ): Promise<LeaveBalance | null> {
    return this.leaves.getLeaveBalance(employeId, year, leaveType);
  }

  getAllLeaveBalances(employeId: string): Promise<LeaveBalance[]> {
    return this.leaves.getAllLeaveBalances(employeId);
  }

  initializeLeaveBalance(
    employeId: string,
    year: number,
    initialAllocation?: number,
    carryOver?: number
  ): Promise<LeaveBalance> {
    return this.leaves.initializeLeaveBalance(employeId, year, initialAllocation, carryOver);
  }

  calculateBusinessDays(startDate: string, endDate: string): number {
    return this.leaves.calculateBusinessDays(startDate, endDate);
  }

  validateLeaveRequest(
    employeId: string,
    dateDebut: string,
    dateFin: string,
    leaveType?: string,
    excludeCongeId?: number
  ): Promise<LeaveValidationResult> {
    return this.leaves.validateLeaveRequest(employeId, dateDebut, dateFin, leaveType, excludeCongeId);
  }

  onLeaveRequested(employeId: string, dateDebut: string, dateFin: string): Promise<void> {
    return this.leaves.onLeaveRequested(employeId, dateDebut, dateFin);
  }

  onLeaveApproved(congeId: number): Promise<void> {
    return this.leaves.onLeaveApproved(congeId);
  }

  onLeaveRejectedOrCancelled(congeId: number): Promise<void> {
    return this.leaves.onLeaveRejectedOrCancelled(congeId);
  }

  createLeavePresenceEntries(congeId: number): Promise<number> {
    return this.leaves.createLeavePresenceEntries(congeId);
  }

  // ---- Audit ----

  logAction(
    entityType: string,
    entityId: string | number,
    action: string,
    context: AuditContext,
    oldValues?: any,
    newValues?: any,
    reason?: string,
    severity?: 'info' | 'warning' | 'critical'
  ): Promise<void> {
    return this.audit.logAction(
      entityType,
      entityId,
      action,
      context,
      oldValues,
      newValues,
      reason,
      severity
    );
  }

  getAuditLog(entityType?: string, entityId?: string, limit?: number): Promise<any[]> {
    return this.audit.getAuditLog(entityType, entityId, limit);
  }
}

// Instance singleton
export const hrService = new HrService();
