/**
 * Service de gestion du workflow d'approbation des embauches
 *
 * Fonctionnalités:
 * - Configuration des niveaux d'approbation par agence
 * - Initialisation du workflow pour une candidature
 * - Soumission d'approbation/rejet par niveau
 * - Récupération des approbations en attente par rôle
 */

import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  hiringApprovalConfig,
  hiringApprovals,
  candidatures,
  HiringApprovalLevel,
} from "@shared/schema/hr";
import { users } from "@shared/schema/auth";

export interface ApprovalSubmission {
  candidatureId: number;
  approverId: string;
  decision: 'APPROVED' | 'REJECTED';
  commentaire?: string;
}

export interface PendingApproval {
  id: string;
  candidatureId: number;
  candidatureNom: string;
  candidaturePrenom: string;
  posteVise: string;
  level: number;
  approverRole: string;
  createdAt: Date | null;
}

class HiringApprovalService {
  /**
   * Récupère la configuration d'approbation pour une agence
   */
  async getConfig(agenceId: string) {
    const [config] = await db
      .select()
      .from(hiringApprovalConfig)
      .where(and(
        eq(hiringApprovalConfig.agenceId, agenceId),
        eq(hiringApprovalConfig.actif, true)
      ))
      .limit(1);

    return config;
  }

  /**
   * Crée ou met à jour la configuration d'approbation
   */
  async upsertConfig(data: {
    agenceId: string;
    approvalLevels: HiringApprovalLevel[];
    minSalaryThreshold?: number;
    createdBy: string;
  }) {
    const existing = await this.getConfig(data.agenceId);

    if (existing) {
      const [updated] = await db
        .update(hiringApprovalConfig)
        .set({
          approvalLevels: data.approvalLevels,
          minSalaryThreshold: data.minSalaryThreshold?.toString(),
          updatedAt: new Date(),
        })
        .where(eq(hiringApprovalConfig.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(hiringApprovalConfig)
      .values({
        agenceId: data.agenceId,
        approvalLevels: data.approvalLevels,
        minSalaryThreshold: data.minSalaryThreshold?.toString(),
        createdBy: data.createdBy,
      })
      .returning();

    return created;
  }

  /**
   * Initialise le workflow d'approbation pour une candidature
   * À appeler quand la candidature passe au statut ACCEPTED
   */
  async initializeWorkflow(candidatureId: number, agenceId: string) {
    const config = await this.getConfig(agenceId);

    if (!config || !config.approvalLevels || config.approvalLevels.length === 0) {
      // Pas de workflow configuré - approbation automatique
      await db
        .update(candidatures)
        .set({
          approvalStatus: 'APPROVED',
          finalApprovedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(candidatures.id, candidatureId));

      return { autoApproved: true, levels: 0 };
    }

    // Créer les instances d'approbation pour chaque niveau
    const approvalInstances = config.approvalLevels.map((level) => ({
      candidatureId,
      level: level.level,
      approverRole: level.role,
      statut: level.level === 1 ? 'PENDING' : 'PENDING',
    }));

    await db.insert(hiringApprovals).values(approvalInstances);

    // Mettre à jour la candidature
    await db
      .update(candidatures)
      .set({
        approvalStatus: 'IN_PROGRESS',
        currentApprovalLevel: 1,
        updatedAt: new Date(),
      })
      .where(eq(candidatures.id, candidatureId));

    return {
      autoApproved: false,
      levels: config.approvalLevels.length,
      firstLevel: config.approvalLevels[0]
    };
  }

  /**
   * Soumet une décision d'approbation
   */
  async submitApproval(submission: ApprovalSubmission) {
    const { candidatureId, approverId, decision, commentaire } = submission;

    // Récupérer la candidature et son niveau actuel
    const [candidature] = await db
      .select()
      .from(candidatures)
      .where(eq(candidatures.id, candidatureId))
      .limit(1);

    if (!candidature) {
      throw new Error('Candidature non trouvée');
    }

    if (candidature.approvalStatus !== 'IN_PROGRESS') {
      throw new Error('Le workflow d\'approbation n\'est pas actif pour cette candidature');
    }

    const currentLevel = candidature.currentApprovalLevel || 1;

    // Récupérer l'approbation en attente pour ce niveau
    const [pendingApproval] = await db
      .select()
      .from(hiringApprovals)
      .where(and(
        eq(hiringApprovals.candidatureId, candidatureId),
        eq(hiringApprovals.level, currentLevel),
        eq(hiringApprovals.statut, 'PENDING')
      ))
      .limit(1);

    if (!pendingApproval) {
      throw new Error('Aucune approbation en attente pour ce niveau');
    }

    // Mettre à jour l'approbation
    await db
      .update(hiringApprovals)
      .set({
        approverId,
        statut: decision,
        commentaire,
        decidedAt: new Date(),
      })
      .where(eq(hiringApprovals.id, pendingApproval.id));

    if (decision === 'REJECTED') {
      // Rejet - workflow terminé
      await db
        .update(candidatures)
        .set({
          approvalStatus: 'REJECTED',
          updatedAt: new Date(),
        })
        .where(eq(candidatures.id, candidatureId));

      return { status: 'REJECTED', finalDecision: true };
    }

    // Approbation - vérifier s'il y a un niveau suivant
    const [nextApproval] = await db
      .select()
      .from(hiringApprovals)
      .where(and(
        eq(hiringApprovals.candidatureId, candidatureId),
        eq(hiringApprovals.level, currentLevel + 1),
        eq(hiringApprovals.statut, 'PENDING')
      ))
      .limit(1);

    if (nextApproval) {
      // Passer au niveau suivant
      await db
        .update(candidatures)
        .set({
          currentApprovalLevel: currentLevel + 1,
          updatedAt: new Date(),
        })
        .where(eq(candidatures.id, candidatureId));

      return {
        status: 'APPROVED',
        finalDecision: false,
        nextLevel: currentLevel + 1,
        nextRole: nextApproval.approverRole
      };
    }

    // Tous les niveaux approuvés - workflow terminé
    await db
      .update(candidatures)
      .set({
        approvalStatus: 'APPROVED',
        finalApprovedAt: new Date(),
        finalApprovedBy: approverId,
        updatedAt: new Date(),
      })
      .where(eq(candidatures.id, candidatureId));

    return { status: 'APPROVED', finalDecision: true };
  }

  /**
   * Récupère les approbations en attente pour un rôle donné
   */
  async getPendingApprovals(role: string, agenceId?: string): Promise<PendingApproval[]> {
    const result = await db
      .select({
        id: hiringApprovals.id,
        candidatureId: hiringApprovals.candidatureId,
        candidatureNom: candidatures.nom,
        candidaturePrenom: candidatures.prenom,
        posteVise: candidatures.posteVise,
        level: hiringApprovals.level,
        approverRole: hiringApprovals.approverRole,
        createdAt: hiringApprovals.createdAt,
      })
      .from(hiringApprovals)
      .innerJoin(candidatures, eq(hiringApprovals.candidatureId, candidatures.id))
      .where(and(
        eq(hiringApprovals.approverRole, role),
        eq(hiringApprovals.statut, 'PENDING'),
        eq(candidatures.approvalStatus, 'IN_PROGRESS')
      ))
      .orderBy(desc(hiringApprovals.createdAt));

    return result;
  }

  /**
   * Récupère l'historique des approbations pour une candidature
   */
  async getApprovalHistory(candidatureId: number) {
    const approvals = await db
      .select({
        id: hiringApprovals.id,
        level: hiringApprovals.level,
        approverRole: hiringApprovals.approverRole,
        approverId: hiringApprovals.approverId,
        approverNom: users.nom,
        approverPrenom: users.prenom,
        statut: hiringApprovals.statut,
        commentaire: hiringApprovals.commentaire,
        decidedAt: hiringApprovals.decidedAt,
        createdAt: hiringApprovals.createdAt,
      })
      .from(hiringApprovals)
      .leftJoin(users, eq(hiringApprovals.approverId, users.id))
      .where(eq(hiringApprovals.candidatureId, candidatureId))
      .orderBy(hiringApprovals.level);

    return approvals;
  }

  /**
   * Récupère le statut du workflow pour une candidature
   */
  async getWorkflowStatus(candidatureId: number) {
    const [candidature] = await db
      .select({
        id: candidatures.id,
        nom: candidatures.nom,
        prenom: candidatures.prenom,
        posteVise: candidatures.posteVise,
        approvalStatus: candidatures.approvalStatus,
        currentApprovalLevel: candidatures.currentApprovalLevel,
        finalApprovedAt: candidatures.finalApprovedAt,
      })
      .from(candidatures)
      .where(eq(candidatures.id, candidatureId))
      .limit(1);

    if (!candidature) {
      return null;
    }

    const history = await this.getApprovalHistory(candidatureId);

    return {
      ...candidature,
      approvals: history,
    };
  }
}

export const hiringApprovalService = new HiringApprovalService();
