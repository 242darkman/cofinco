/**
 * CaisseAgentService - Gestion des caisses internes des agents terrain
 */

import { db } from "../../db";
import {
  caissesAgent,
  operationsTerrain,
  agentsTerrain,
  type CaisseAgent,
  type CaisseAgentSummary,
} from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { StatutCaisseAgent } from "@shared/enum/status-constants";

export class CaisseAgentService {
  /**
   * Crée une caisse agent pour un agent existant
   */
  async createCaisseAgent(params: {
    agentId: string;
    createdBy: string;
    devise?: string;
  }): Promise<{ success: boolean; caisseAgent?: CaisseAgent; error?: string; errorCode?: string }> {
    try {
      // 1. Vérifier que l'agent existe
      const [agent] = await db
        .select()
        .from(agentsTerrain)
        .where(and(eq(agentsTerrain.id, params.agentId), isNull(agentsTerrain.deletedAt)));

      if (!agent) {
        return {
          success: false,
          error: "Agent non trouvé",
          errorCode: "AGENT_NOT_FOUND",
        };
      }

      // 2. Vérifier qu'il n'a pas déjà une caisse active
      const [existingCaisse] = await db
        .select()
        .from(caissesAgent)
        .where(and(eq(caissesAgent.agentId, params.agentId), isNull(caissesAgent.deletedAt)));

      if (existingCaisse) {
        return {
          success: false,
          error: "L'agent possède déjà une caisse active",
          errorCode: "CAISSE_ALREADY_EXISTS",
        };
      }

      // 3. Créer la caisse avec solde initial 0
      const [caisseAgent] = await db
        .insert(caissesAgent)
        .values({
          agentId: params.agentId,
          soldeValide: "0",
          devise: params.devise || "XOF",
          statut: StatutCaisseAgent.ACTIVE,
          createdBy: params.createdBy,
        })
        .returning();

      return { success: true, caisseAgent };
    } catch (error: any) {
      console.error("Erreur création caisse agent:", error);
      return {
        success: false,
        error: error.message || "Erreur interne",
        errorCode: "INTERNAL_ERROR",
      };
    }
  }

  /**
   * Récupère la caisse d'un agent (ou la crée si elle n'existe pas)
   */
  async getOrCreateCaisseAgent(agentId: string, createdBy?: string): Promise<CaisseAgent | null> {
    // Chercher la caisse existante
    const [existing] = await db
      .select()
      .from(caissesAgent)
      .where(and(eq(caissesAgent.agentId, agentId), isNull(caissesAgent.deletedAt)));

    if (existing) {
      return existing;
    }

    // Créer si elle n'existe pas et qu'on a un createdBy
    if (createdBy) {
      const result = await this.createCaisseAgent({ agentId, createdBy });
      return result.caisseAgent || null;
    }

    return null;
  }

  /**
   * Récupère le résumé de la caisse d'un agent
   */
  async getCaisseAgentSummary(agentId: string): Promise<CaisseAgentSummary | null> {
    // 1. Récupérer la caisse agent
    const [caisseAgent] = await db
      .select()
      .from(caissesAgent)
      .where(and(eq(caissesAgent.agentId, agentId), isNull(caissesAgent.deletedAt)));

    if (!caisseAgent) {
      return null;
    }

    // 2. Calculer pendingIn (somme des COLLECT_CASH en SUBMITTED)
    const [pendingInResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${operationsTerrain.montant}), 0)`,
      })
      .from(operationsTerrain)
      .where(
        and(
          eq(operationsTerrain.caisseAgentId, caisseAgent.id),
          eq(operationsTerrain.type, "COLLECT_CASH"),
          eq(operationsTerrain.statut, "SUBMITTED")
        )
      );

    // 3. Calculer pendingOut (somme des SETTLEMENT_CASH en SUBMITTED)
    const [pendingOutResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${operationsTerrain.montant}), 0)`,
      })
      .from(operationsTerrain)
      .where(
        and(
          eq(operationsTerrain.caisseAgentId, caisseAgent.id),
          eq(operationsTerrain.type, "SETTLEMENT_CASH"),
          eq(operationsTerrain.statut, "SUBMITTED")
        )
      );

    const soldeValide = parseFloat(caisseAgent.soldeValide || "0");
    const pendingIn = parseFloat(pendingInResult?.total || "0");
    const pendingOut = parseFloat(pendingOutResult?.total || "0");

    // 4. Calculer disponible = soldeValide - pendingOut (ce qu'on peut remettre)
    const disponible = Math.max(0, soldeValide - pendingOut);

    return {
      caisseId: caisseAgent.id,
      agentId: caisseAgent.agentId,
      soldeValide: soldeValide.toString(),
      pendingIn: pendingIn.toString(),
      pendingOut: pendingOut.toString(),
      disponible: disponible.toString(),
      devise: caisseAgent.devise,
      statut: caisseAgent.statut,
    };
  }

  /**
   * Récupère la caisse d'un agent par son ID
   */
  async getCaisseAgentByAgentId(agentId: string): Promise<CaisseAgent | null> {
    const [caisseAgent] = await db
      .select()
      .from(caissesAgent)
      .where(and(eq(caissesAgent.agentId, agentId), isNull(caissesAgent.deletedAt)));

    return caisseAgent || null;
  }

  /**
   * Récupère une caisse par son ID
   */
  async getCaisseAgentById(caisseId: string): Promise<CaisseAgent | null> {
    const [caisseAgent] = await db
      .select()
      .from(caissesAgent)
      .where(and(eq(caissesAgent.id, caisseId), isNull(caissesAgent.deletedAt)));

    return caisseAgent || null;
  }

  /**
   * Suspend une caisse agent (bloque les nouvelles opérations)
   */
  async suspendCaisseAgent(params: {
    agentId: string;
    suspendedBy: string;
    reason?: string;
  }): Promise<{ success: boolean; caisseAgent?: CaisseAgent; error?: string }> {
    const [caisseAgent] = await db
      .select()
      .from(caissesAgent)
      .where(and(eq(caissesAgent.agentId, params.agentId), isNull(caissesAgent.deletedAt)));

    if (!caisseAgent) {
      return { success: false, error: "Caisse non trouvée" };
    }

    if (caisseAgent.statut === StatutCaisseAgent.SUSPENDED) {
      return { success: false, error: "La caisse est déjà suspendue" };
    }

    const [updated] = await db
      .update(caissesAgent)
      .set({
        statut: StatutCaisseAgent.SUSPENDED,
        updatedAt: new Date(),
      })
      .where(eq(caissesAgent.id, caisseAgent.id))
      .returning();

    return { success: true, caisseAgent: updated };
  }

  /**
   * Réactive une caisse agent
   */
  async reactivateCaisseAgent(params: {
    agentId: string;
    reactivatedBy: string;
  }): Promise<{ success: boolean; caisseAgent?: CaisseAgent; error?: string }> {
    const [caisseAgent] = await db
      .select()
      .from(caissesAgent)
      .where(and(eq(caissesAgent.agentId, params.agentId), isNull(caissesAgent.deletedAt)));

    if (!caisseAgent) {
      return { success: false, error: "Caisse non trouvée" };
    }

    if (caisseAgent.statut === StatutCaisseAgent.ACTIVE) {
      return { success: false, error: "La caisse est déjà active" };
    }

    if (caisseAgent.statut === StatutCaisseAgent.CLOSED) {
      return { success: false, error: "Impossible de réactiver une caisse clôturée" };
    }

    const [updated] = await db
      .update(caissesAgent)
      .set({
        statut: StatutCaisseAgent.ACTIVE,
        updatedAt: new Date(),
      })
      .where(eq(caissesAgent.id, caisseAgent.id))
      .returning();

    return { success: true, caisseAgent: updated };
  }

  /**
   * Vérifie si une caisse est active et peut recevoir des opérations
   */
  async isCaisseActive(caisseId: string): Promise<boolean> {
    const [caisseAgent] = await db
      .select({ statut: caissesAgent.statut })
      .from(caissesAgent)
      .where(and(eq(caissesAgent.id, caisseId), isNull(caissesAgent.deletedAt)));

    return caisseAgent?.statut === StatutCaisseAgent.ACTIVE;
  }

  /**
   * Vérifie si l'agent a un solde suffisant pour une remise
   */
  async hasSufficientBalance(agentId: string, montant: number): Promise<{
    sufficient: boolean;
    disponible: string;
    error?: string;
  }> {
    const summary = await this.getCaisseAgentSummary(agentId);

    if (!summary) {
      return { sufficient: false, disponible: "0", error: "Caisse non trouvée" };
    }

    const disponible = parseFloat(summary.disponible);
    const sufficient = disponible >= montant;

    return {
      sufficient,
      disponible: summary.disponible,
      error: sufficient ? undefined : `Solde disponible insuffisant: ${summary.disponible} < ${montant}`,
    };
  }
}

// Export singleton pour usage dans les routes
export const caisseAgentService = new CaisseAgentService();
