/**
 * Service de Workflow d'Approbation des Écarts de Caisse
 *
 * Implémente l'approbation hiérarchique pour les écarts dépassant les seuils configurés:
 * - Seuil auto-approve: Écarts <= 100 XOF auto-approuvés
 * - Seuil N1: Écarts entre 100 et 5000 XOF → Superviseur/Chef Caisse
 * - Seuil N2: Écarts > 5000 XOF → Chef Agence/Directeur
 */

import { db } from "../../db";
import {
  configEcartCaisse,
  ecartsApprovalRequests,
  ecartsApprovalAuditLog,
  sessionsCaisse,
  users,
  type ConfigEcartCaisse,
  type EcartApprovalRequest,
} from "@shared/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { getWsInstance } from "../../ws-server";

const logger = createLogger('EcartApprovalService');

// ============================================================================
// TYPES
// ============================================================================

export interface CreateApprovalRequestParams {
  sessionId: string;
  caissierId: string;
  agenceId: string;
  soldeTheorique: number;
  montantPhysique: number;
  ecart: number;
  justification: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateApprovalResult {
  success: boolean;
  request?: EcartApprovalRequest;
  autoApproved?: boolean;
  error?: string;
}

export interface ApproveEcartParams {
  requestId: string;
  approverId: string;
  decision: 'APPROVED' | 'REJECTED';
  comment?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ApproveEcartResult {
  success: boolean;
  request?: EcartApprovalRequest;
  error?: string;
}

// ============================================================================
// CONFIGURATION PAR DÉFAUT
// ============================================================================

const DEFAULT_CONFIG: Omit<ConfigEcartCaisse, 'id' | 'agenceId' | 'createdAt' | 'updatedAt'> = {
  seuilAutoApprove: "100",
  seuilN1Approval: "5000",
  seuilN2Approval: "50000",
  rolesApprobateursN1: ['SUPERVISEUR', 'CAISSIER'],
  rolesApprobateursN2: ['CHEF_AGENCE', 'ADMIN'],
  blockCloseUntilApproved: true,
  allowSelfApprovalIfRole: false,
  requireDoubleApprovalN2: false,
  actif: true,
};

// ============================================================================
// SERVICE
// ============================================================================

export class EcartApprovalService {

  /**
   * Récupère la configuration des écarts pour une agence
   * Fallback sur la configuration globale si pas de config spécifique
   */
  async getConfig(agenceId: string): Promise<ConfigEcartCaisse> {
    // Chercher config spécifique à l'agence
    const [agenceConfig] = await db.select()
      .from(configEcartCaisse)
      .where(and(
        eq(configEcartCaisse.agenceId, agenceId),
        eq(configEcartCaisse.actif, true)
      ));

    if (agenceConfig) {
      return agenceConfig;
    }

    // Chercher config globale (agenceId = NULL)
    const [globalConfig] = await db.select()
      .from(configEcartCaisse)
      .where(and(
        isNull(configEcartCaisse.agenceId),
        eq(configEcartCaisse.actif, true)
      ));

    if (globalConfig) {
      return globalConfig;
    }

    // Retourner config par défaut si rien trouvé
    return {
      id: 'default',
      agenceId: null,
      ...DEFAULT_CONFIG,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ConfigEcartCaisse;
  }

  /**
   * Détermine le niveau d'approbation requis pour un écart
   */
  determineApprovalLevel(ecart: number, config: ConfigEcartCaisse): 'AUTO' | 'N1' | 'N2' {
    const absEcart = Math.abs(ecart);
    const seuilAuto = Number(config.seuilAutoApprove);
    const seuilN1 = Number(config.seuilN1Approval);
    const seuilN2 = Number(config.seuilN2Approval);

    if (absEcart <= seuilAuto) {
      return 'AUTO';
    }
    if (absEcart <= seuilN1) {
      return 'N1';
    }
    return 'N2';
  }

  /**
   * Crée une demande d'approbation pour un écart
   * Si l'écart est mineur, auto-approuve
   */
  async createApprovalRequest(params: CreateApprovalRequestParams): Promise<CreateApprovalResult> {
    const {
      sessionId,
      caissierId,
      agenceId,
      soldeTheorique,
      montantPhysique,
      ecart,
      justification,
      ipAddress,
      userAgent,
    } = params;

    try {
      const config = await this.getConfig(agenceId);
      const approvalLevel = this.determineApprovalLevel(ecart, config);
      const typeEcart = ecart > 0 ? 'SURPLUS' : 'DEFICIT';

      // Auto-approbation pour les petits écarts
      if (approvalLevel === 'AUTO') {
        const [request] = await db.insert(ecartsApprovalRequests).values({
          sessionId,
          caissierId,
          agenceId,
          soldeTheorique: soldeTheorique.toString(),
          montantPhysique: montantPhysique.toString(),
          ecart: ecart.toString(),
          typeEcart,
          justification,
          niveauRequis: 'N1', // Not really used for auto
          statut: 'AUTO_APPROVED',
          thresholdApplied: config.seuilAutoApprove,
          configSnapshot: config,
        }).returning();

        // Log d'audit
        await db.insert(ecartsApprovalAuditLog).values({
          requestId: request.id,
          action: 'AUTO_APPROVED',
          actorId: caissierId,
          comment: `Écart mineur (${Math.abs(ecart)} XOF <= ${config.seuilAutoApprove} XOF)`,
          metadata: { ecart, threshold: config.seuilAutoApprove },
          ipAddress: ipAddress as any,
          userAgent,
        });

        // Mettre à jour la session
        await db.update(sessionsCaisse)
          .set({
            ecartApprovalId: request.id,
            ecartApprovalStatus: 'AUTO_APPROVED',
          })
          .where(eq(sessionsCaisse.id, sessionId));

        logger.info({ sessionId, ecart, level: 'AUTO' }, 'Écart auto-approuvé');

        return {
          success: true,
          request,
          autoApproved: true,
        };
      }

      // Créer demande d'approbation
      const threshold = approvalLevel === 'N1' ? config.seuilN1Approval : config.seuilN2Approval;
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Expire après 24h

      const [request] = await db.insert(ecartsApprovalRequests).values({
        sessionId,
        caissierId,
        agenceId,
        soldeTheorique: soldeTheorique.toString(),
        montantPhysique: montantPhysique.toString(),
        ecart: ecart.toString(),
        typeEcart,
        justification,
        niveauRequis: approvalLevel,
        statut: 'PENDING_APPROVAL',
        thresholdApplied: threshold,
        configSnapshot: config,
        expiresAt,
      }).returning();

      // Log d'audit
      await db.insert(ecartsApprovalAuditLog).values({
        requestId: request.id,
        action: 'CREATED',
        actorId: caissierId,
        comment: `Demande d'approbation niveau ${approvalLevel} créée`,
        metadata: { ecart, threshold, level: approvalLevel },
        ipAddress: ipAddress as any,
        userAgent,
      });

      // Mettre à jour la session
      await db.update(sessionsCaisse)
        .set({
          ecartApprovalId: request.id,
          ecartApprovalStatus: 'PENDING_APPROVAL',
        })
        .where(eq(sessionsCaisse.id, sessionId));

      logger.info({ sessionId, ecart, level: approvalLevel, requestId: request.id }, 'Demande approbation écart créée');

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: 'ECART_APPROVAL_REQUEST' as any,
          payload: { requestId: request.id, sessionId, ecart, level: approvalLevel }
        });
      }

      return {
        success: true,
        request,
        autoApproved: false,
      };
    } catch (error: any) {
      logger.error({ err: error, sessionId }, 'Erreur création demande approbation');
      return {
        success: false,
        error: error.message || 'Erreur lors de la création de la demande',
      };
    }
  }

  /**
   * Approuve ou rejette une demande d'écart
   */
  async approveEcart(params: ApproveEcartParams): Promise<ApproveEcartResult> {
    const { requestId, approverId, decision, comment, ipAddress, userAgent } = params;

    try {
      return await db.transaction(async (tx) => {
        // Récupérer la demande
        const [request] = await tx.select()
          .from(ecartsApprovalRequests)
          .where(eq(ecartsApprovalRequests.id, requestId));

        if (!request) {
          return { success: false, error: 'Demande introuvable' };
        }

        if (request.statut !== 'PENDING_APPROVAL') {
          return { success: false, error: `Demande déjà traitée (statut: ${request.statut})` };
        }

        // Vérifier que l'approbateur n'est pas le caissier (sauf si config le permet)
        const config = request.configSnapshot as ConfigEcartCaisse;
        if (request.caissierId === approverId && !config?.allowSelfApprovalIfRole) {
          return { success: false, error: 'Vous ne pouvez pas approuver votre propre écart' };
        }

        // Vérification du rôle: le niveau d'approbation détermine qui peut approuver
        // N1 (superviseur/chef caisse) et N2 (chef agence/directeur)
        // Le check ABAC/CASL est fait au niveau route — ici on vérifie juste que ce n'est pas le caissier

        // Mettre à jour la demande
        const [updatedRequest] = await tx.update(ecartsApprovalRequests)
          .set({
            statut: decision,
            approverId,
            approvedAt: new Date(),
            approvalDecision: decision,
            approvalComment: comment,
            updatedAt: new Date(),
          })
          .where(eq(ecartsApprovalRequests.id, requestId))
          .returning();

        // Mettre à jour la session
        await tx.update(sessionsCaisse)
          .set({
            ecartApprovalStatus: decision,
          })
          .where(eq(sessionsCaisse.id, request.sessionId));

        // Log d'audit
        await tx.insert(ecartsApprovalAuditLog).values({
          requestId,
          action: decision,
          actorId: approverId,
          comment: comment || `Écart ${decision.toLowerCase()}`,
          metadata: { decision, previousStatus: request.statut },
          ipAddress: ipAddress as any,
          userAgent,
        });

        logger.info({
          requestId,
          sessionId: request.sessionId,
          decision,
          approverId,
        }, 'Écart traité');

        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.broadcast({
            type: 'ECART_APPROVAL_DECISION' as any,
            payload: { requestId, sessionId: request.sessionId, decision }
          });
        }

        return {
          success: true,
          request: updatedRequest,
        };
      });
    } catch (error: any) {
      logger.error({ err: error, requestId }, 'Erreur approbation écart');
      return {
        success: false,
        error: error.message || 'Erreur lors du traitement',
      };
    }
  }

  /**
   * Récupère les demandes en attente pour une agence
   */
  async getPendingForAgence(agenceId: string): Promise<EcartApprovalRequest[]> {
    const requests = await db.select()
      .from(ecartsApprovalRequests)
      .where(and(
        eq(ecartsApprovalRequests.agenceId, agenceId),
        eq(ecartsApprovalRequests.statut, 'PENDING_APPROVAL')
      ))
      .orderBy(desc(ecartsApprovalRequests.createdAt));

    return requests;
  }

  /**
   * Vérifie si une session a un écart en attente d'approbation
   */
  async hasПendingApproval(sessionId: string): Promise<boolean> {
    const [session] = await db.select({
      ecartApprovalStatus: sessionsCaisse.ecartApprovalStatus,
    })
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.id, sessionId));

    return session?.ecartApprovalStatus === 'PENDING_APPROVAL';
  }

  /**
   * Récupère la demande d'approbation d'une session
   */
  async getApprovalForSession(sessionId: string): Promise<EcartApprovalRequest | null> {
    const [request] = await db.select()
      .from(ecartsApprovalRequests)
      .where(eq(ecartsApprovalRequests.sessionId, sessionId))
      .orderBy(desc(ecartsApprovalRequests.createdAt))
      .limit(1);

    return request || null;
  }
}

// Export singleton
export const ecartApprovalService = new EcartApprovalService();
