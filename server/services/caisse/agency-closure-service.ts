/**
 * Service de Clôture Journalière Agence (Multi-Caisse Validation)
 *
 * Valide que toutes les conditions sont remplies avant de permettre
 * la clôture du coffre-fort de l'agence:
 * - Toutes les caisses fermées
 * - Tous les transferts exécutés
 * - Toutes les remises terrain réglées
 * - Tous les écarts approuvés
 */

import { db } from "../../db";
import {
  agencyDailyClosure,
  agencyClosureBlockers,
  agencyClosureAuditLog,
  sessionsCaisse,
  caisses,
  transfertsCoffreCaisse,
  ecartsApprovalRequests,
  agences,
  users,
  type AgencyDailyClosure,
  type AgencyClosureBlocker,
} from "@shared/schema";
import { eq, and, sql, count, gte, lt, ne } from "drizzle-orm";
import { createLogger } from "../../lib/logger";

const logger = createLogger('AgencyClosureService');

// ============================================================================
// TYPES
// ============================================================================

export interface ClosureBlocker {
  type: 'CAISSE_OPEN' | 'TRANSFER_PENDING' | 'REMISE_PENDING' | 'ECART_PENDING' | 'MM_DISCREPANCY';
  entityId?: string;
  entityType?: string;
  description: string;
  montant?: number;
}

export interface ClosureReadinessResult {
  ready: boolean;
  agenceId: string;
  date: string;
  totalCaisses: number;
  caissesOpen: number;
  caissesClosed: number;
  pendingTransfers: number;
  pendingRemises: number;
  pendingEcarts: number;
  blockers: ClosureBlocker[];
  closure?: AgencyDailyClosure;
}

export interface FinalizeClosureParams {
  agenceId: string;
  closedBy: string;
  observations?: string;
  ipAddress?: string;
}

export interface FinalizeClosureResult {
  success: boolean;
  closure?: AgencyDailyClosure;
  error?: string;
}

// ============================================================================
// SERVICE
// ============================================================================

export class AgencyClosureService {

  /**
   * Récupère ou crée l'enregistrement de clôture journalière pour une agence
   */
  async getOrCreateDailyClosure(agenceId: string, date?: Date): Promise<AgencyDailyClosure> {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Chercher existant
    const [existing] = await db.select()
      .from(agencyDailyClosure)
      .where(and(
        eq(agencyDailyClosure.agenceId, agenceId),
        eq(agencyDailyClosure.dateCloture, dateStr)
      ));

    if (existing) {
      return existing;
    }

    // Compter les caisses de l'agence
    const [caisseCount] = await db.select({ count: count() })
      .from(caisses)
      .where(and(
        eq(caisses.agenceId, agenceId),
        sql`${caisses.deletedAt} IS NULL`
      ));

    // Créer nouveau
    const [closure] = await db.insert(agencyDailyClosure).values({
      agenceId,
      dateCloture: dateStr,
      statut: 'OPEN',
      totalCaisses: (caisseCount?.count || 0).toString(),
    }).returning();

    logger.info({ agenceId, date: dateStr }, 'Clôture journalière créée');

    return closure;
  }

  /**
   * Vérifie si l'agence est prête pour la clôture journalière
   */
  async checkClosureReadiness(agenceId: string, date?: Date): Promise<ClosureReadinessResult> {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0];
    const startOfDay = new Date(dateStr);
    const endOfDay = new Date(dateStr);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const blockers: ClosureBlocker[] = [];

    // Récupérer ou créer la clôture
    const closure = await this.getOrCreateDailyClosure(agenceId, targetDate);

    // 1. Compter les caisses et leurs statuts
    const allCaisses = await db.select({
      id: caisses.id,
      nom: caisses.nom,
      statut: caisses.statut,
    })
    .from(caisses)
    .where(and(
      eq(caisses.agenceId, agenceId),
      sql`${caisses.deletedAt} IS NULL`
    ));

    const totalCaisses = allCaisses.length;

    // Vérifier les sessions ouvertes du jour
    const openSessions = await db.select({
      id: sessionsCaisse.id,
      caisseId: sessionsCaisse.caisseId,
      statut: sessionsCaisse.statut,
      caisseNom: caisses.nom,
    })
    .from(sessionsCaisse)
    .innerJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
    .where(and(
      eq(caisses.agenceId, agenceId),
      gte(sessionsCaisse.openedAt, startOfDay),
      lt(sessionsCaisse.openedAt, endOfDay),
      ne(sessionsCaisse.statut, 'CLOSED')
    ));

    const caissesOpen = openSessions.length;
    const caissesClosed = totalCaisses - caissesOpen;

    // Ajouter blockers pour sessions ouvertes
    for (const session of openSessions) {
      blockers.push({
        type: 'CAISSE_OPEN',
        entityId: session.id,
        entityType: 'session',
        description: `Caisse "${session.caisseNom}" en statut ${session.statut}`,
      });
    }

    // 2. Vérifier les transferts en attente
    const pendingTransfersResult = await db.select({
      id: transfertsCoffreCaisse.id,
      typeTransfert: transfertsCoffreCaisse.typeTransfert,
      montant: transfertsCoffreCaisse.montant,
      statut: transfertsCoffreCaisse.statut,
    })
    .from(transfertsCoffreCaisse)
    .innerJoin(caisses, eq(transfertsCoffreCaisse.caisseId, caisses.id))
    .where(and(
      eq(caisses.agenceId, agenceId),
      gte(transfertsCoffreCaisse.createdAt, startOfDay),
      lt(transfertsCoffreCaisse.createdAt, endOfDay),
      sql`${transfertsCoffreCaisse.statut} NOT IN ('EXECUTED', 'REJECTED', 'CANCELLED')`
    ));

    const pendingTransfers = pendingTransfersResult.length;

    for (const transfer of pendingTransfersResult) {
      blockers.push({
        type: 'TRANSFER_PENDING',
        entityId: transfer.id,
        entityType: 'transfert',
        description: `Transfert ${transfer.typeTransfert} en statut ${transfer.statut}`,
        montant: Number(transfer.montant),
      });
    }

    // 3. Vérifier les écarts en attente d'approbation
    const pendingEcartsResult = await db.select({
      id: ecartsApprovalRequests.id,
      ecart: ecartsApprovalRequests.ecart,
      typeEcart: ecartsApprovalRequests.typeEcart,
    })
    .from(ecartsApprovalRequests)
    .where(and(
      eq(ecartsApprovalRequests.agenceId, agenceId),
      eq(ecartsApprovalRequests.statut, 'PENDING_APPROVAL'),
      gte(ecartsApprovalRequests.createdAt, startOfDay),
      lt(ecartsApprovalRequests.createdAt, endOfDay)
    ));

    const pendingEcarts = pendingEcartsResult.length;

    for (const ecart of pendingEcartsResult) {
      blockers.push({
        type: 'ECART_PENDING',
        entityId: ecart.id,
        entityType: 'ecart',
        description: `Écart ${ecart.typeEcart} de ${ecart.ecart} XOF en attente`,
        montant: Number(ecart.ecart),
      });
    }

    // 4. TODO: Vérifier les remises terrain en attente
    const pendingRemises = 0; // À implémenter avec la table remisesTerrain

    // Déterminer si prêt
    const ready = blockers.length === 0;

    // Mettre à jour la clôture
    await db.update(agencyDailyClosure)
      .set({
        caissesClosed: caissesClosed.toString(),
        caissesWithPendingTransfers: pendingTransfers.toString(),
        caissesWithPendingEcarts: pendingEcarts.toString(),
        caissesWithPendingRemises: pendingRemises.toString(),
        allCaissesClosed: caissesOpen === 0,
        allTransfersExecuted: pendingTransfers === 0,
        allEcartsApproved: pendingEcarts === 0,
        allRemisesSettled: pendingRemises === 0,
        updatedAt: new Date(),
      })
      .where(eq(agencyDailyClosure.id, closure.id));

    return {
      ready,
      agenceId,
      date: dateStr,
      totalCaisses,
      caissesOpen,
      caissesClosed,
      pendingTransfers,
      pendingRemises,
      pendingEcarts,
      blockers,
      closure,
    };
  }

  /**
   * Finalise la clôture journalière de l'agence
   */
  async finalizeClosure(params: FinalizeClosureParams): Promise<FinalizeClosureResult> {
    const { agenceId, closedBy, observations, ipAddress } = params;

    try {
      // Vérifier la readiness
      const readiness = await this.checkClosureReadiness(agenceId);

      if (!readiness.ready) {
        return {
          success: false,
          error: `Clôture impossible: ${readiness.blockers.length} élément(s) bloquant(s)`,
        };
      }

      // Mettre à jour la clôture
      const [updatedClosure] = await db.update(agencyDailyClosure)
        .set({
          statut: 'CLOSED',
          closedBy,
          closedAt: new Date(),
          closureObservations: observations,
          coffreReconciled: true,
          updatedAt: new Date(),
        })
        .where(eq(agencyDailyClosure.id, readiness.closure!.id))
        .returning();

      // Log d'audit
      await db.insert(agencyClosureAuditLog).values({
        closureId: updatedClosure.id,
        action: 'FINALIZED',
        actorId: closedBy,
        statutAvant: 'OPEN',
        statutApres: 'CLOSED',
        metadata: {
          totalCaisses: readiness.totalCaisses,
          caissesClosed: readiness.caissesClosed,
          observations,
        },
        ipAddress: ipAddress as any,
      });

      logger.info({
        agenceId,
        closureId: updatedClosure.id,
        date: readiness.date,
        closedBy,
      }, 'Clôture agence finalisée');

      return {
        success: true,
        closure: updatedClosure,
      };
    } catch (error: any) {
      logger.error({ err: error, agenceId }, 'Erreur finalisation clôture');
      return {
        success: false,
        error: error.message || 'Erreur lors de la finalisation',
      };
    }
  }

  /**
   * Met à jour le progrès de clôture quand une caisse ferme
   */
  async updateClosureProgress(agenceId: string): Promise<void> {
    await this.checkClosureReadiness(agenceId);
  }

  /**
   * Récupère l'historique des clôtures d'une agence
   */
  async getClosureHistory(agenceId: string, limit: number = 30): Promise<AgencyDailyClosure[]> {
    const closures = await db.select()
      .from(agencyDailyClosure)
      .where(eq(agencyDailyClosure.agenceId, agenceId))
      .orderBy(sql`${agencyDailyClosure.dateCloture} DESC`)
      .limit(limit);

    return closures;
  }

  /**
   * Rouvre une clôture exceptionnellement
   */
  async reopenClosure(closureId: string, reopenedBy: string, reason: string): Promise<FinalizeClosureResult> {
    try {
      const [closure] = await db.select()
        .from(agencyDailyClosure)
        .where(eq(agencyDailyClosure.id, closureId));

      if (!closure) {
        return { success: false, error: 'Clôture introuvable' };
      }

      if (closure.statut !== 'CLOSED') {
        return { success: false, error: 'Seules les clôtures fermées peuvent être rouvertes' };
      }

      const [updated] = await db.update(agencyDailyClosure)
        .set({
          statut: 'REOPENED',
          reopenedBy,
          reopenedAt: new Date(),
          reopenedReason: reason,
          allCaissesClosed: false,
          coffreReconciled: false,
          updatedAt: new Date(),
        })
        .where(eq(agencyDailyClosure.id, closureId))
        .returning();

      // Log d'audit
      await db.insert(agencyClosureAuditLog).values({
        closureId,
        action: 'REOPENED',
        actorId: reopenedBy,
        statutAvant: 'CLOSED',
        statutApres: 'REOPENED',
        metadata: { reason },
      });

      logger.warn({
        closureId,
        agenceId: closure.agenceId,
        reopenedBy,
        reason,
      }, 'Clôture agence rouverte exceptionnellement');

      return { success: true, closure: updated };
    } catch (error: any) {
      logger.error({ err: error, closureId }, 'Erreur réouverture clôture');
      return { success: false, error: error.message };
    }
  }
}

// Export singleton
export const agencyClosureService = new AgencyClosureService();
