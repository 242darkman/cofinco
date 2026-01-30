/**
 * Service de gestion du comptage à deux (dual count verification)
 *
 * Fonctionnalités:
 * - Configuration par agence des règles de double comptage
 * - Vérification si double comptage requis
 * - Soumission du comptage de vérification
 * - Comparaison des deux comptages
 */

import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db";
import { comptageBillets, dualCountConfig, sessionsCaisse, DualCountConfig } from "@shared/schema/operations";
import { agences } from "@shared/schema/agences";

export interface DualCountCheckResult {
  required: boolean;
  reason?: string;
  config?: DualCountConfig;
}

export interface DualCountSubmitResult {
  success: boolean;
  verificationTotal: number;
  primaryTotal: number;
  ecartVerification: number;
  matched: boolean;
  withinTolerance: boolean;
  message: string;
}

class DualCountService {
  /**
   * Récupère la configuration de double comptage pour une agence
   */
  async getConfig(agenceId: string): Promise<DualCountConfig | null> {
    const [config] = await db
      .select()
      .from(dualCountConfig)
      .where(and(
        eq(dualCountConfig.agenceId, agenceId),
        eq(dualCountConfig.actif, true)
      ))
      .limit(1);

    return config || null;
  }

  /**
   * Crée ou met à jour la configuration
   */
  async upsertConfig(data: {
    agenceId: string;
    thresholdMontant?: number;
    alwaysRequiredForClosing?: boolean;
    requireDifferentUser?: boolean;
    maxEcartTolerance?: number;
  }): Promise<DualCountConfig> {
    const existing = await this.getConfig(data.agenceId);

    if (existing) {
      const [updated] = await db
        .update(dualCountConfig)
        .set({
          thresholdMontant: data.thresholdMontant?.toString(),
          alwaysRequiredForClosing: data.alwaysRequiredForClosing,
          requireDifferentUser: data.requireDifferentUser,
          maxEcartTolerance: data.maxEcartTolerance?.toString(),
          updatedAt: new Date(),
        })
        .where(eq(dualCountConfig.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(dualCountConfig)
      .values({
        agenceId: data.agenceId,
        thresholdMontant: data.thresholdMontant?.toString() || "1000000",
        alwaysRequiredForClosing: data.alwaysRequiredForClosing ?? true,
        requireDifferentUser: data.requireDifferentUser ?? true,
        maxEcartTolerance: data.maxEcartTolerance?.toString() || "100",
      })
      .returning();

    return created;
  }

  /**
   * Vérifie si le double comptage est requis pour une session
   */
  async requiresDualCount(sessionId: string, montant: number): Promise<DualCountCheckResult> {
    // Récupérer la session et son agence
    const [session] = await db
      .select({
        id: sessionsCaisse.id,
        agenceId: sessionsCaisse.agenceId,
      })
      .from(sessionsCaisse)
      .where(eq(sessionsCaisse.id, sessionId))
      .limit(1);

    if (!session || !session.agenceId) {
      return { required: false, reason: "Session ou agence non trouvée" };
    }

    const config = await this.getConfig(session.agenceId);

    if (!config) {
      return { required: false, reason: "Pas de configuration de double comptage" };
    }

    // Vérifier les conditions
    if (config.alwaysRequiredForClosing) {
      return {
        required: true,
        reason: "Double comptage toujours requis pour la clôture",
        config,
      };
    }

    const threshold = Number(config.thresholdMontant) || 1000000;
    if (montant >= threshold) {
      return {
        required: true,
        reason: `Montant (${montant}) supérieur au seuil (${threshold})`,
        config,
      };
    }

    return { required: false, config };
  }

  /**
   * Soumet un comptage de vérification
   */
  async submitVerification(
    sessionId: string,
    verificateurId: string,
    billetage: Record<string, number>,
    observations?: string
  ): Promise<DualCountSubmitResult> {
    // Récupérer le comptage primaire
    const [primaryCount] = await db
      .select()
      .from(comptageBillets)
      .where(and(
        eq(comptageBillets.sessionId, sessionId),
        eq(comptageBillets.typeComptage, "CLOSING")
      ))
      .orderBy(desc(comptageBillets.createdAt))
      .limit(1);

    if (!primaryCount) {
      throw new Error("Aucun comptage primaire trouvé pour cette session");
    }

    // Calculer le total de vérification
    const verificationTotal = this.calculateTotal(billetage);
    const primaryTotal = Number(primaryCount.totalCalcule) || 0;
    const ecartVerification = verificationTotal - primaryTotal;

    // Récupérer la config pour la tolérance
    const [session] = await db
      .select({ agenceId: sessionsCaisse.agenceId })
      .from(sessionsCaisse)
      .where(eq(sessionsCaisse.id, sessionId))
      .limit(1);

    const config = session?.agenceId ? await this.getConfig(session.agenceId) : null;
    const tolerance = Number(config?.maxEcartTolerance) || 100;
    const withinTolerance = Math.abs(ecartVerification) <= tolerance;
    const matched = ecartVerification === 0;

    // Vérifier si le vérificateur est différent du compteur primaire
    if (config?.requireDifferentUser && primaryCount.compteurId === verificateurId) {
      throw new Error("Le vérificateur doit être différent du compteur principal");
    }

    // Mettre à jour le comptage avec les données de vérification
    await db
      .update(comptageBillets)
      .set({
        verificateurId,
        verificationBilletage: billetage,
        verificationTotal: verificationTotal.toString(),
        ecartVerification: ecartVerification.toString(),
        dualCountCompleted: true,
        verificationSubmittedAt: new Date(),
        observations: observations
          ? `${primaryCount.observations || ''}\n[Vérification] ${observations}`
          : primaryCount.observations,
      })
      .where(eq(comptageBillets.id, primaryCount.id));

    return {
      success: true,
      verificationTotal,
      primaryTotal,
      ecartVerification,
      matched,
      withinTolerance,
      message: matched
        ? "Les deux comptages concordent parfaitement"
        : withinTolerance
          ? `Écart de ${ecartVerification} dans la tolérance (±${tolerance})`
          : `Écart de ${ecartVerification} HORS tolérance (±${tolerance})`,
    };
  }

  /**
   * Récupère les comptages (primaire et vérification) pour une session
   */
  async getCounts(sessionId: string) {
    const [count] = await db
      .select()
      .from(comptageBillets)
      .where(and(
        eq(comptageBillets.sessionId, sessionId),
        eq(comptageBillets.typeComptage, "CLOSING")
      ))
      .orderBy(desc(comptageBillets.createdAt))
      .limit(1);

    if (!count) {
      return null;
    }

    return {
      primary: {
        total: Number(count.totalCalcule),
        compteurId: count.compteurId,
        billetage: {
          billets_10000: count.billets10000,
          billets_5000: count.billets5000,
          billets_2000: count.billets2000,
          billets_1000: count.billets1000,
          billets_500: count.billets500,
          pieces_250: count.pieces250,
          pieces_100: count.pieces100,
          pieces_50: count.pieces50,
          pieces_25: count.pieces25,
        },
      },
      verification: count.dualCountCompleted ? {
        total: Number(count.verificationTotal),
        verificateurId: count.verificateurId,
        billetage: count.verificationBilletage,
        submittedAt: count.verificationSubmittedAt,
      } : null,
      ecartVerification: count.ecartVerification ? Number(count.ecartVerification) : null,
      matched: count.ecartVerification ? Number(count.ecartVerification) === 0 : null,
      dualCountRequired: count.dualCountRequired,
      dualCountCompleted: count.dualCountCompleted,
    };
  }

  /**
   * Calcule le total à partir du billetage
   */
  private calculateTotal(billetage: Record<string, number>): number {
    const denominations: Record<string, number> = {
      billets_10000: 10000,
      billets_5000: 5000,
      billets_2000: 2000,
      billets_1000: 1000,
      billets_500: 500,
      pieces_250: 250,
      pieces_100: 100,
      pieces_50: 50,
      pieces_25: 25,
      // Also support numeric keys
      "10000": 10000,
      "5000": 5000,
      "2000": 2000,
      "1000": 1000,
      "500": 500,
      "250": 250,
      "100": 100,
      "50": 50,
      "25": 25,
    };

    return Object.entries(billetage).reduce((total, [key, count]) => {
      const value = denominations[key] || 0;
      return total + value * (count || 0);
    }, 0);
  }

  /**
   * Marque un comptage comme nécessitant une vérification
   */
  async markRequiresDualCount(comptageBilletsId: string) {
    await db
      .update(comptageBillets)
      .set({ dualCountRequired: true })
      .where(eq(comptageBillets.id, comptageBilletsId));
  }
}

export const dualCountService = new DualCountService();
