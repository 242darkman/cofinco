/**
 * Gestion des congés : soldes, validation des demandes et transitions
 * de statut (soumission, approbation, rejet/annulation).
 */

import { db } from "../../db";
import {
  leaveBalances,
  demandesConges,
  presences,
  LeaveStatus,
  LeaveType,
  PresenceStatus,
  type LeaveBalance,
} from "@shared/schema";
import { eq, and, or, sql, gte, lte, desc } from "drizzle-orm";
import type { LeaveValidationResult } from "./types";

export class HrLeaveService {
  /**
   * Récupère le solde de congés d'un employé
   */
  async getLeaveBalance(
    employeId: string,
    year: number = new Date().getFullYear(),
    leaveType: string = LeaveType.ANNUAL
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
   * Récupère tous les soldes de congés d'un employé
   */
  async getAllLeaveBalances(employeId: string): Promise<LeaveBalance[]> {
    return db
      .select()
      .from(leaveBalances)
      .where(eq(leaveBalances.employeId, employeId))
      .orderBy(desc(leaveBalances.year));
  }

  /**
   * Initialise le solde de congés pour une nouvelle année
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
        leaveType: LeaveType.ANNUAL,
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
   * Calcule les jours ouvrés entre deux dates (week-ends exclus)
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
   * Valide une demande de congé
   */
  async validateLeaveRequest(
    employeId: string,
    dateDebut: string,
    dateFin: string,
    leaveType: string = LeaveType.ANNUAL,
    excludeCongeId?: number
  ): Promise<LeaveValidationResult> {
    // 1. Valider les dates
    if (new Date(dateFin) < new Date(dateDebut)) {
      return {
        valid: false,
        error: 'La date de fin doit être postérieure ou égale à la date de début',
        code: 'INVALID_DATES',
      };
    }

    // 2. Vérifier le chevauchement avec des congés existants
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

    // 3. Vérifier le solde (uniquement pour le congé annuel)
    if (leaveType === LeaveType.ANNUAL) {
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
   * Met à jour le solde lorsqu'un congé est approuvé
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
   * Crée des présences « Congé » pour chaque jour ouvré d'un congé approuvé.
   * Ignore les jours ayant déjà un enregistrement de présence.
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
        statut: PresenceStatus.ON_LEAVE,
        commentaire: `Congé ${conge.type} (#${conge.id})`,
      }))
    );

    return newDates.length;
  }

  /**
   * Met à jour le solde lorsqu'une demande de congé est soumise
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
   * Met à jour le solde lorsqu'un congé est rejeté ou annulé
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
}
