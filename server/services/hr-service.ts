/**
 * HR Service - Production Ready
 *
 * Handles:
 * - Leave balance management
 * - Leave overlap validation
 * - Payroll calculation engine
 * - HR audit logging
 */

import { db } from "../db";
import {
  leaveBalances,
  demandesConges,
  bulletinsPaie,
  payrollConfig,
  hrAuditLog,
  presences,
  avantagesEmployes,
  employes,
  LeaveStatus,
  BulletinStatus,
  IprBracket,
  type LeaveBalance,
  type PayrollConfig,
  type InsertHrAuditLog,
} from "@shared/schema";
import { users } from "@shared/schema/auth";
import { eq, and, or, sql, gte, lte, desc } from "drizzle-orm";

// ============================================
// TYPES
// ============================================

interface PayrollInput {
  employeId: string;
  salaireBase: number;
  modeCalculPaie: 'MONTHLY' | 'HOURLY' | 'DAILY';
  tauxHoraire?: number;
  tauxJournalier?: number;
  dateEmbauche?: string;
}

interface PayrollResult {
  salaireBase: number;
  primeAnciennete: number;
  primeTransport: number;
  primeRendement: number;
  autresPrimes: number;
  salaireBrut: number;
  cnssEmploye: number;
  cnssPatronale: number;
  ipr: number;
  autresRetenues: number;
  totalRetenues: number;
  salaireNet: number;
}

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
          // Date overlap check
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
        // Auto-create balance if missing
        await this.initializeLeaveBalance(employeId, year);
      }

      const daysRequested = this.calculateBusinessDays(dateDebut, dateFin);
      const currentBalance = balance
        ? balance.acquired + (balance.carryOver || 0) - balance.used - balance.pending
        : 30; // Default if just created

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

    // Find existing presence entries for this employee in the date range
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

    // Ensure balance exists
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
  // PAYROLL CALCULATION ENGINE
  // ============================================

  /**
   * Get active payroll config
   */
  async getPayrollConfig(agenceId?: string): Promise<PayrollConfig | null> {
    // First try agency-specific config
    if (agenceId) {
      const [agencyConfig] = await db
        .select()
        .from(payrollConfig)
        .where(
          and(
            eq(payrollConfig.agenceId, agenceId),
            eq(payrollConfig.isActive, true)
          )
        )
        .orderBy(desc(payrollConfig.effectiveFrom))
        .limit(1);

      if (agencyConfig) return agencyConfig;
    }

    // Fall back to global config
    const [globalConfig] = await db
      .select()
      .from(payrollConfig)
      .where(
        and(
          sql`${payrollConfig.agenceId} IS NULL`,
          eq(payrollConfig.isActive, true)
        )
      )
      .orderBy(desc(payrollConfig.effectiveFrom))
      .limit(1);

    return globalConfig || null;
  }

  /**
   * Calculate IPR (progressive income tax)
   */
  calculateIPR(baseImposable: number, brackets: IprBracket[]): number {
    let impot = 0;
    let remaining = baseImposable;

    // Sort brackets by min value
    const sortedBrackets = [...brackets].sort((a, b) => a.min - b.min);

    for (const bracket of sortedBrackets) {
      if (remaining <= 0) break;

      const bracketSize = bracket.max !== null ? bracket.max - bracket.min : Infinity;
      const taxable = Math.min(remaining, bracketSize);

      impot += Math.round(taxable * bracket.rate);
      remaining -= taxable;
    }

    return impot;
  }

  /**
   * Calculate seniority bonus based on hire date
   */
  calculateSeniorityBonus(dateEmbauche: string | null | undefined, salaireBase: number): number {
    if (!dateEmbauche) return 0;

    const hireDate = new Date(dateEmbauche);
    const now = new Date();
    const yearsOfService = Math.floor(
      (now.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );

    // 2% per year, capped at 30%
    const rate = Math.min(yearsOfService * 0.02, 0.30);
    return Math.round(salaireBase * rate);
  }

  /**
   * Calculate payroll for a single employee
   */
  async calculatePayroll(
    input: PayrollInput,
    month: string,
    config: PayrollConfig
  ): Promise<PayrollResult> {
    // 1. Get employee advantages
    const avantages = await db
      .select()
      .from(avantagesEmployes)
      .where(
        and(
          eq(avantagesEmployes.employeId, input.employeId),
          eq(avantagesEmployes.statut, 'ACTIVE')
        )
      );

    // 2. Get presences for the month (for hourly/daily calculation)
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);

    const monthPresences = await db
      .select()
      .from(presences)
      .where(
        and(
          eq(presences.employeId, input.employeId),
          gte(presences.date, startDate.toISOString().split('T')[0]),
          lte(presences.date, endDate.toISOString().split('T')[0])
        )
      );

    // 3. Calculate base salary based on mode
    let salaireBase = 0;
    switch (input.modeCalculPaie) {
      case 'MONTHLY':
        salaireBase = input.salaireBase;
        break;
      case 'HOURLY':
        const heuresTravaillees = monthPresences.reduce(
          (sum, p) => sum + ((p.heuresTravaillees || 0) / 60),
          0
        );
        salaireBase = Math.round((input.tauxHoraire || 0) * heuresTravaillees);
        break;
      case 'DAILY':
        const joursTravailles = monthPresences.filter(
          (p) => p.statut === 'Présent'
        ).length;
        salaireBase = Math.round((input.tauxJournalier || 0) * joursTravailles);
        break;
    }

    // 4. Calculate bonuses
    const primeTransport = Number(config.transportAllowance) || 0;
    const primeAnciennete = this.calculateSeniorityBonus(input.dateEmbauche, salaireBase);
    const autresPrimes = avantages.reduce((sum, a) => sum + (a.montant || 0), 0);

    // 5. Calculate overtime
    const heuresSupp = monthPresences.reduce(
      (sum, p) => sum + ((p.heuresSupplementaires || 0) / 60),
      0
    );
    const tauxHoraire = input.tauxHoraire || Math.round(salaireBase / 173); // 173 = avg hours/month
    const primeRendement = Math.round(heuresSupp * tauxHoraire * Number(config.overtimeRate || 1.5));

    // 6. Gross salary
    const salaireBrut = salaireBase + primeTransport + primeAnciennete + autresPrimes + primeRendement;

    // 7. CNSS contributions
    const cnssEmploye = Math.round(salaireBrut * Number(config.cnssEmployeeRate));
    const cnssPatronale = Math.round(salaireBrut * Number(config.cnssEmployerRate));

    // 8. IPR calculation
    const baseImposable = salaireBrut - cnssEmploye;
    const ipr = this.calculateIPR(baseImposable, config.iprBrackets as IprBracket[]);

    // 9. Total deductions
    const autresRetenues = 0; // Can be extended for loans, etc.
    const totalRetenues = cnssEmploye + ipr + autresRetenues;

    // 10. Net salary
    const salaireNet = salaireBrut - totalRetenues;

    return {
      salaireBase,
      primeAnciennete,
      primeTransport,
      primeRendement,
      autresPrimes,
      salaireBrut,
      cnssEmploye,
      cnssPatronale,
      ipr,
      autresRetenues,
      totalRetenues,
      salaireNet,
    };
  }

  /**
   * Generate monthly payroll for all active employees
   */
  async generateMonthlyPayroll(
    month: string,
    generatedBy: string,
    agenceId?: string
  ): Promise<{ generated: number; skipped: number; bulletins: any[] }> {
    // Get config
    const config = await this.getPayrollConfig(agenceId);
    if (!config) {
      throw new Error('Configuration paie non trouvée');
    }

    // Get all active employees
    const whereConditions = agenceId
      ? and(eq(employes.statut, 'ACTIVE'), eq(employes.agenceId, agenceId))
      : eq(employes.statut, 'ACTIVE');

    const employeesList = await db
      .select({
        employe: employes,
        user: users,
      })
      .from(employes)
      .innerJoin(users, eq(employes.userId, users.id))
      .where(whereConditions);

    const results: any[] = [];
    let skipped = 0;

    for (const { employe, user } of employeesList) {
      // Check if bulletin already exists
      const existing = await db
        .select()
        .from(bulletinsPaie)
        .where(
          and(
            eq(bulletinsPaie.employeId, employe.id),
            eq(bulletinsPaie.mois, month)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Calculate payroll
      const payroll = await this.calculatePayroll(
        {
          employeId: employe.id,
          salaireBase: employe.salaireBase || 0,
          modeCalculPaie: (employe.modeCalculPaie as 'MONTHLY' | 'HOURLY' | 'DAILY') || 'MONTHLY',
          tauxHoraire: employe.tauxHoraire || undefined,
          tauxJournalier: employe.tauxJournalier || undefined,
          dateEmbauche: employe.dateEmbauche || undefined,
        },
        month,
        config
      );

      // Create bulletin
      const [bulletin] = await db
        .insert(bulletinsPaie)
        .values({
          employeId: employe.id,
          employeNom: `${user.nom} ${user.prenom || ''}`.trim(),
          mois: month,
          salaireBase: payroll.salaireBase.toString(),
          primeAnciennete: payroll.primeAnciennete.toString(),
          primeTransport: payroll.primeTransport.toString(),
          primeRendement: payroll.primeRendement.toString(),
          autresPrimes: payroll.autresPrimes.toString(),
          salaireBrut: payroll.salaireBrut.toString(),
          cnssEmploye: payroll.cnssEmploye.toString(),
          ipr: payroll.ipr.toString(),
          autresRetenues: payroll.autresRetenues.toString(),
          totalRetenues: payroll.totalRetenues.toString(),
          salaireNet: payroll.salaireNet.toString(),
          cnssPatronale: payroll.cnssPatronale.toString(),
          genereParId: generatedBy,
          statut: BulletinStatus.DRAFT,
        })
        .returning();

      results.push(bulletin);
    }

    return {
      generated: results.length,
      skipped,
      bulletins: results,
    };
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
    // Compute diff
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
