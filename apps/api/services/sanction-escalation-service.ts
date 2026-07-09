/**
 * Service de gestion de l'escalade automatique des sanctions
 *
 * Fonctionnalités:
 * - Configuration des règles d'escalade par agence
 * - Vérification automatique à la création d'une sanction
 * - Application de l'escalade avec traçabilité
 */

import { eq, and, gte, desc, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  sanctions,
  sanctionEscalationRules,
  SanctionEscalationRule,
} from "@shared/schema/hr";
import { employes } from "@shared/schema/employes";

export interface EscalationCheckResult {
  shouldEscalate: boolean;
  rule?: SanctionEscalationRule;
  sanctionCount?: number;
  escalatedGravite?: string;
  message?: string;
}

export interface EscalationApplyResult {
  success: boolean;
  originalSanction: any;
  escalatedSanction?: any;
  message: string;
}

class SanctionEscalationService {
  /**
   * Récupère les règles d'escalade pour une agence
   */
  async getRules(agenceId?: string): Promise<SanctionEscalationRule[]> {
    const conditions = [eq(sanctionEscalationRules.actif, true)];

    if (agenceId) {
      conditions.push(eq(sanctionEscalationRules.agenceId, agenceId));
    }

    return db
      .select()
      .from(sanctionEscalationRules)
      .where(and(...conditions))
      .orderBy(sanctionEscalationRules.sanctionCountThreshold);
  }

  /**
   * Crée ou met à jour une règle d'escalade
   */
  async upsertRule(data: {
    id?: string;
    agenceId?: string;
    nom: string;
    description?: string;
    sanctionCountThreshold: number;
    periodMonths?: number;
    sourceGravite: string;
    escalateToGravite: string;
    notificationRequired?: boolean;
    autoApply?: boolean;
    createdBy?: string;
  }): Promise<SanctionEscalationRule> {
    if (data.id) {
      const [updated] = await db
        .update(sanctionEscalationRules)
        .set({
          nom: data.nom,
          description: data.description,
          sanctionCountThreshold: data.sanctionCountThreshold,
          periodMonths: data.periodMonths,
          sourceGravite: data.sourceGravite,
          escalateToGravite: data.escalateToGravite,
          notificationRequired: data.notificationRequired,
          autoApply: data.autoApply,
          updatedAt: new Date(),
        })
        .where(eq(sanctionEscalationRules.id, data.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(sanctionEscalationRules)
      .values({
        agenceId: data.agenceId,
        nom: data.nom,
        description: data.description,
        sanctionCountThreshold: data.sanctionCountThreshold,
        periodMonths: data.periodMonths || 12,
        sourceGravite: data.sourceGravite,
        escalateToGravite: data.escalateToGravite,
        notificationRequired: data.notificationRequired ?? true,
        autoApply: data.autoApply ?? false,
        createdBy: data.createdBy,
      })
      .returning();

    return created;
  }

  /**
   * Supprime une règle d'escalade (soft delete)
   */
  async deleteRule(id: string): Promise<void> {
    await db
      .update(sanctionEscalationRules)
      .set({ actif: false, updatedAt: new Date() })
      .where(eq(sanctionEscalationRules.id, id));
  }

  /**
   * Compte les sanctions d'un employé pour une gravité donnée dans la période
   */
  async getSanctionCountInPeriod(
    employeId: string,
    gravite: string,
    periodMonths: number
  ): Promise<number> {
    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - periodMonths);

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(sanctions)
      .where(
        and(
          eq(sanctions.employeId, employeId),
          eq(sanctions.gravite, gravite),
          gte(sanctions.date, periodStart.toISOString().split('T')[0])
        )
      );

    return Number(result[0]?.count || 0);
  }

  /**
   * Vérifie si une sanction doit déclencher une escalade
   */
  async checkAndApplyEscalation(
    sanctionId: number,
    employeId: string,
    gravite: string,
    agenceId?: string
  ): Promise<EscalationCheckResult> {
    // Récupérer l'agence de l'employé si non fournie
    if (!agenceId) {
      const [employe] = await db
        .select({ agenceId: employes.agenceId })
        .from(employes)
        .where(eq(employes.id, employeId))
        .limit(1);
      agenceId = employe?.agenceId || undefined;
    }

    // Récupérer les règles applicables pour cette gravité
    const rules = await this.getRules(agenceId);
    const applicableRules = rules.filter(
      (r) => r.sourceGravite === gravite && r.actif
    );

    if (applicableRules.length === 0) {
      return { shouldEscalate: false, message: 'Aucune règle applicable' };
    }

    // Vérifier chaque règle
    for (const rule of applicableRules) {
      const count = await this.getSanctionCountInPeriod(
        employeId,
        gravite,
        rule.periodMonths || 12
      );

      // Le count inclut la sanction actuelle qui vient d'être créée
      if (count >= (rule.sanctionCountThreshold || 1)) {
        return {
          shouldEscalate: true,
          rule,
          sanctionCount: count,
          escalatedGravite: rule.escalateToGravite,
          message: `${count} sanctions de type "${gravite}" dans les ${rule.periodMonths} derniers mois`,
        };
      }
    }

    return { shouldEscalate: false };
  }

  /**
   * Applique l'escalade et crée une nouvelle sanction escaladée
   */
  async applyEscalation(
    originalSanctionId: number,
    rule: SanctionEscalationRule,
    emetteurId?: string
  ): Promise<EscalationApplyResult> {
    // Récupérer la sanction originale
    const [original] = await db
      .select()
      .from(sanctions)
      .where(eq(sanctions.id, originalSanctionId))
      .limit(1);

    if (!original) {
      return {
        success: false,
        originalSanction: null,
        message: 'Sanction originale non trouvée',
      };
    }

    // Créer la sanction escaladée
    const [escalatedSanction] = await db
      .insert(sanctions)
      .values({
        employeId: original.employeId,
        employeNom: original.employeNom,
        type: `${original.type} (Escaladé)`,
        motif: `Escalade automatique: ${original.motif}\n\nRègle: ${rule.nom}`,
        date: new Date().toISOString().split('T')[0],
        gravite: rule.escalateToGravite,
        emetteurId: emetteurId || original.emetteurId,
        statutWorkflow: 'DRAFT',
        escalatedFromId: originalSanctionId,
        autoEscalated: true,
        escalationRuleId: rule.id,
      })
      .returning();

    // Mettre à jour la sanction originale pour indiquer qu'elle a déclenché une escalade
    await db
      .update(sanctions)
      .set({
        escalationRuleId: rule.id,
      })
      .where(eq(sanctions.id, originalSanctionId));

    return {
      success: true,
      originalSanction: original,
      escalatedSanction,
      message: `Sanction escaladée de "${original.gravite}" à "${rule.escalateToGravite}"`,
    };
  }

  /**
   * Récupère l'historique d'escalade d'une sanction
   */
  async getEscalationHistory(sanctionId: number) {
    const history: any[] = [];
    let currentId: number | null = sanctionId;

    while (currentId) {
      const [sanction] = await db
        .select()
        .from(sanctions)
        .where(eq(sanctions.id, currentId))
        .limit(1);

      if (sanction) {
        history.push(sanction);
        currentId = sanction.escalatedFromId;
      } else {
        break;
      }
    }

    return history.reverse(); // Du plus ancien au plus récent
  }
}

export const sanctionEscalationService = new SanctionEscalationService();
