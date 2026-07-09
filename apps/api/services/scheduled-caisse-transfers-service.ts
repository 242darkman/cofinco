/**
 * Service de gestion des transferts inter-agences planifiés
 *
 * Fonctionnalités:
 * - CRUD des transferts planifiés
 * - Exécution automatique via cron
 * - Gestion des récurrences
 */

import { eq, and, lte, desc, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { scheduledCaisseTransfers, caisseTransferts, ScheduledCaisseTransfer } from "@shared/schema/finance";

export interface ScheduledTransferInput {
  agenceSourceId: string;
  agenceDestId: string;
  montant: number;
  datePrevue: string;
  frequence?: string;
  jourSemaine?: number;
  jourMois?: number;
  motif?: string;
  maxExecutions?: number;
  createdBy?: string;
}

class ScheduledCaisseTransfersService {
  /**
   * Récupère tous les transferts planifiés
   */
  async getAll(filters?: {
    agenceSourceId?: string;
    agenceDestId?: string;
    statut?: string;
  }): Promise<ScheduledCaisseTransfer[]> {
    const conditions = [];

    if (filters?.agenceSourceId) {
      conditions.push(eq(scheduledCaisseTransfers.agenceSourceId, filters.agenceSourceId));
    }
    if (filters?.agenceDestId) {
      conditions.push(eq(scheduledCaisseTransfers.agenceDestId, filters.agenceDestId));
    }
    if (filters?.statut) {
      conditions.push(eq(scheduledCaisseTransfers.statut, filters.statut));
    }

    const query = db.select().from(scheduledCaisseTransfers);
    const result = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(scheduledCaisseTransfers.datePrevue))
      : await query.orderBy(desc(scheduledCaisseTransfers.datePrevue));

    return result;
  }

  /**
   * Récupère un transfert planifié par ID
   */
  async getById(id: string): Promise<ScheduledCaisseTransfer | null> {
    const [transfer] = await db
      .select()
      .from(scheduledCaisseTransfers)
      .where(eq(scheduledCaisseTransfers.id, id))
      .limit(1);

    return transfer || null;
  }

  /**
   * Crée un nouveau transfert planifié
   */
  async create(data: ScheduledTransferInput): Promise<ScheduledCaisseTransfer> {
    const prochaineExecution = this.calculateNextExecution(
      data.datePrevue,
      data.frequence || "ONE_TIME",
      data.jourSemaine,
      data.jourMois
    );

    const [created] = await db
      .insert(scheduledCaisseTransfers)
      .values({
        agenceSourceId: data.agenceSourceId,
        agenceDestId: data.agenceDestId,
        montant: data.montant.toString(),
        datePrevue: data.datePrevue,
        frequence: data.frequence || "ONE_TIME",
        jourSemaine: data.jourSemaine,
        jourMois: data.jourMois,
        motif: data.motif,
        maxExecutions: data.maxExecutions,
        prochaineExecution: prochaineExecution,
        createdBy: data.createdBy,
      })
      .returning();

    return created;
  }

  /**
   * Met à jour un transfert planifié
   */
  async update(id: string, data: Partial<ScheduledTransferInput>): Promise<ScheduledCaisseTransfer | null> {
    const existing = await this.getById(id);
    if (!existing || existing.statut !== "SCHEDULED") {
      return null;
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (data.montant !== undefined) updateData.montant = data.montant.toString();
    if (data.datePrevue !== undefined) updateData.datePrevue = data.datePrevue;
    if (data.frequence !== undefined) updateData.frequence = data.frequence;
    if (data.jourSemaine !== undefined) updateData.jourSemaine = data.jourSemaine;
    if (data.jourMois !== undefined) updateData.jourMois = data.jourMois;
    if (data.motif !== undefined) updateData.motif = data.motif;
    if (data.maxExecutions !== undefined) updateData.maxExecutions = data.maxExecutions;

    // Recalculate next execution if schedule changed
    if (data.datePrevue || data.frequence || data.jourSemaine !== undefined || data.jourMois !== undefined) {
      updateData.prochaineExecution = this.calculateNextExecution(
        data.datePrevue || existing.datePrevue,
        data.frequence || existing.frequence || "ONE_TIME",
        data.jourSemaine ?? existing.jourSemaine,
        data.jourMois ?? existing.jourMois
      );
    }

    const [updated] = await db
      .update(scheduledCaisseTransfers)
      .set(updateData)
      .where(eq(scheduledCaisseTransfers.id, id))
      .returning();

    return updated;
  }

  /**
   * Annule un transfert planifié
   */
  async cancel(id: string): Promise<boolean> {
    const [updated] = await db
      .update(scheduledCaisseTransfers)
      .set({
        statut: "CANCELLED",
        updatedAt: new Date(),
      })
      .where(and(
        eq(scheduledCaisseTransfers.id, id),
        eq(scheduledCaisseTransfers.statut, "SCHEDULED")
      ))
      .returning();

    return !!updated;
  }

  /**
   * Récupère les transferts à exécuter (pour le cron)
   */
  async getPendingExecutions(): Promise<ScheduledCaisseTransfer[]> {
    const now = new Date();

    return db
      .select()
      .from(scheduledCaisseTransfers)
      .where(and(
        eq(scheduledCaisseTransfers.statut, "SCHEDULED"),
        lte(scheduledCaisseTransfers.prochaineExecution, now)
      ))
      .orderBy(scheduledCaisseTransfers.prochaineExecution);
  }

  /**
   * Marque un transfert comme exécuté
   */
  async markExecuted(
    id: string,
    transfertId: string
  ): Promise<ScheduledCaisseTransfer | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const newExecutionCount = (existing.nombreExecutions || 0) + 1;
    const isRecurring = existing.frequence !== "ONE_TIME";
    const maxReached = existing.maxExecutions && newExecutionCount >= existing.maxExecutions;

    let newStatut = "EXECUTED";
    let nextExecution = null;

    if (isRecurring && !maxReached) {
      newStatut = "SCHEDULED";
      nextExecution = this.calculateNextExecution(
        new Date().toISOString().split('T')[0],
        existing.frequence || "ONE_TIME",
        existing.jourSemaine,
        existing.jourMois,
        true // next occurrence
      );
    }

    const [updated] = await db
      .update(scheduledCaisseTransfers)
      .set({
        statut: newStatut,
        transfertId,
        derniereExecution: new Date(),
        prochaineExecution: nextExecution,
        nombreExecutions: newExecutionCount,
        updatedAt: new Date(),
      })
      .where(eq(scheduledCaisseTransfers.id, id))
      .returning();

    return updated;
  }

  /**
   * Marque un transfert comme échoué
   */
  async markFailed(id: string, reason?: string): Promise<void> {
    await db
      .update(scheduledCaisseTransfers)
      .set({
        statut: "FAILED",
        motif: reason,
        updatedAt: new Date(),
      })
      .where(eq(scheduledCaisseTransfers.id, id));
  }

  /**
   * Calcule la prochaine date d'exécution
   */
  private calculateNextExecution(
    datePrevue: string,
    frequence: string,
    jourSemaine?: number | null,
    jourMois?: number | null,
    fromNow: boolean = false
  ): Date {
    const baseDate = fromNow ? new Date() : new Date(datePrevue);

    switch (frequence) {
      case "DAILY":
        if (fromNow) baseDate.setDate(baseDate.getDate() + 1);
        break;

      case "WEEKLY":
        if (jourSemaine !== undefined && jourSemaine !== null) {
          const currentDay = baseDate.getDay();
          const daysUntilTarget = (jourSemaine - currentDay + 7) % 7;
          baseDate.setDate(baseDate.getDate() + (daysUntilTarget || (fromNow ? 7 : 0)));
        } else if (fromNow) {
          baseDate.setDate(baseDate.getDate() + 7);
        }
        break;

      case "MONTHLY":
        if (jourMois !== undefined && jourMois !== null) {
          if (fromNow || baseDate.getDate() > jourMois) {
            baseDate.setMonth(baseDate.getMonth() + 1);
          }
          baseDate.setDate(Math.min(jourMois, this.getDaysInMonth(baseDate)));
        } else if (fromNow) {
          baseDate.setMonth(baseDate.getMonth() + 1);
        }
        break;

      case "ONE_TIME":
      default:
        // No change needed
        break;
    }

    return baseDate;
  }

  /**
   * Retourne le nombre de jours dans un mois
   */
  private getDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }
}

export const scheduledCaisseTransfersService = new ScheduledCaisseTransfersService();
