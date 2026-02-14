/**
 * Liquidity Guard Service
 *
 * Service centralisé de vérification de liquidité basé sur le GL OHADA.
 * Utilisé comme garde de sécurité avant toute opération financière critique
 * (décaissements, retraits, transferts).
 *
 * Stratégie:
 * - Tente la lecture GL (source de vérité)
 * - Si erreur/pas de données GL, fallback sur cache avec log d'alerte
 * - Compare GL vs cache pour détecter les écarts
 *
 * Le GL est la source de vérité. Le cache est le filet de sécurité.
 */

import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { comptes, sessionsCaisse, caisses } from "@shared/schema";
import { coffresForts } from "@shared/schema/coffres-forts";
import { glBalanceReader } from "./treasury/gl-balance-reader";
import { InsufficientFundsError, type LiquidityEntityType } from "../storage/errors";
import { createLogger } from "../lib/logger";

const logger = createLogger("LiquidityGuard");

type Tx = PgTransaction<any, any, any> | typeof db;

// ============================================================================
// TYPES
// ============================================================================

export interface LiquidityCheckResult {
  allowed: boolean;
  glBalance: number;
  cachedBalance: number;
  variance: number;
  variancePercent: number;
  source: "GL" | "CACHE_FALLBACK";
  checkedAt: string;
  entityType: LiquidityEntityType;
  entityId: string;
  requestedAmount: number;
}

export interface CashAvailabilityResult {
  source: "CAISSE" | "COFFRE" | "INSUFFICIENT";
  caisseBalance: number;
  coffreBalance: number;
  requestedAmount: number;
  requiresCoffreTransfer: boolean;
  transferAmount?: number;
}

// Variance threshold for alerting (>= 1% écart GL vs cache)
const VARIANCE_ALERT_THRESHOLD = 0.01;

// ============================================================================
// SERVICE
// ============================================================================

class LiquidityGuardService {

  /**
   * Vérifie la liquidité d'un compte client avant un retrait/débit.
   */
  async checkCompteLiquidity(
    compteId: string,
    montant: number,
    tx: Tx = db
  ): Promise<LiquidityCheckResult> {
    // 1. Lire le solde cached
    const [compte] = await tx
      .select({ soldeCourant: comptes.soldeCourant, agenceId: comptes.agenceId })
      .from(comptes)
      .where(eq(comptes.id, compteId))
      .limit(1);

    if (!compte) {
      return this.buildResult("compte", compteId, montant, 0, 0, "CACHE_FALLBACK");
    }

    const cachedBalance = parseFloat(compte.soldeCourant || "0");

    // 2. Tenter la lecture GL (via le compte épargne — les mouvements sont trackés via le GL)
    // Note: les comptes clients ne sont pas directement mappés à un numéro GL individuel,
    // donc on utilise le cached balance comme source primaire avec pessimistic lock guard dans updateCompteSolde
    // La validation GL se fait au niveau des comptes de trésorerie (caisse, coffre, MM)
    return this.buildResult("compte", compteId, montant, cachedBalance, cachedBalance, "CACHE_FALLBACK");
  }

  /**
   * Vérifie la liquidité d'une session caisse avant un retrait/décaissement.
   * Utilise le GL (comptes 521xxx) comme source de vérité.
   */
  async checkCaisseLiquidity(
    sessionId: string,
    montant: number,
    tx: Tx = db
  ): Promise<LiquidityCheckResult> {
    // 1. Récupérer la session et la caisse associée
    const [session] = await tx
      .select({
        id: sessionsCaisse.id,
        caisseId: sessionsCaisse.caisseId,
        solde: sessionsCaisse.montantFermetureTheorique,
      })
      .from(sessionsCaisse)
      .where(eq(sessionsCaisse.id, sessionId))
      .limit(1);

    if (!session) {
      return this.buildResult("session", sessionId, montant, 0, 0, "CACHE_FALLBACK");
    }

    const cachedBalance = parseFloat(session.solde || "0");

    // 2. Tenter la lecture GL pour la caisse
    try {
      const glResult = await glBalanceReader.getGlBalanceForCaisse(session.caisseId, tx);

      if (glResult.success && glResult.balance && glResult.balance.source !== "NO_GL_DATA") {
        const glBalance = glResult.balance.glBalance;
        const result = this.buildResult("session", sessionId, montant, glBalance, cachedBalance, "GL");
        this.logVariance(result, "caisse", session.caisseId);
        return result;
      }
    } catch (error) {
      logger.warn({ err: error, sessionId }, "GL read failed for caisse, using cache fallback");
    }

    // 3. Fallback sur cache
    return this.buildResult("session", sessionId, montant, cachedBalance, cachedBalance, "CACHE_FALLBACK");
  }

  /**
   * Vérifie la liquidité d'un coffre-fort avant un transfert sortant.
   * Utilise le GL (comptes 531xxx) comme source de vérité.
   */
  async checkCoffreLiquidity(
    coffreId: string,
    montant: number,
    tx: Tx = db
  ): Promise<LiquidityCheckResult> {
    // 1. Lire le solde cached
    const [coffre] = await tx
      .select({ solde: coffresForts.solde })
      .from(coffresForts)
      .where(eq(coffresForts.id, coffreId))
      .limit(1);

    const cachedBalance = parseFloat(coffre?.solde || "0");

    // 2. Tenter la lecture GL
    try {
      const glResult = await glBalanceReader.getGlBalanceForCoffre(coffreId, tx);

      if (glResult.success && glResult.balance && glResult.balance.source !== "NO_GL_DATA") {
        const glBalance = glResult.balance.glBalance;
        const result = this.buildResult("coffre", coffreId, montant, glBalance, cachedBalance, "GL");
        this.logVariance(result, "coffre", coffreId);
        return result;
      }
    } catch (error) {
      logger.warn({ err: error, coffreId }, "GL read failed for coffre, using cache fallback");
    }

    // 3. Fallback sur cache
    return this.buildResult("coffre", coffreId, montant, cachedBalance, cachedBalance, "CACHE_FALLBACK");
  }

  /**
   * Vérifie la liquidité Mobile Money avant un payout.
   * Utilise le GL (comptes 578x) comme source de vérité.
   */
  async checkMobileMoneyLiquidity(
    operator: "MTN" | "AIRTEL",
    agenceId: string,
    montant: number,
    tx: Tx = db
  ): Promise<LiquidityCheckResult> {
    try {
      const glResult = await glBalanceReader.getGlBalanceForMobileMoney(operator, agenceId, tx);

      if (glResult.success && glResult.balance && glResult.balance.source !== "NO_GL_DATA") {
        return this.buildResult("mobile_money", `${operator}:${agenceId}`, montant, glResult.balance.glBalance, 0, "GL");
      }
    } catch (error) {
      logger.warn({ err: error, operator, agenceId }, "GL read failed for mobile money");
    }

    // No cache fallback for mobile money — return 0 balance
    return this.buildResult("mobile_money", `${operator}:${agenceId}`, montant, 0, 0, "CACHE_FALLBACK");
  }

  /**
   * Logique cascade caisse → coffre pour les paiements en espèces.
   * Implémente le spec §5 Cas 2:
   * - Si solde caisse >= montant → OK (source = CAISSE)
   * - Sinon si solde coffre >= montant → proposer transfert coffre→caisse
   * - Sinon → INSUFFICIENT
   */
  async checkCashAvailability(
    sessionId: string,
    coffreId: string,
    montant: number,
    tx: Tx = db
  ): Promise<CashAvailabilityResult> {
    // 1. Vérifier la caisse
    const caisseCheck = await this.checkCaisseLiquidity(sessionId, montant, tx);

    if (caisseCheck.allowed) {
      return {
        source: "CAISSE",
        caisseBalance: caisseCheck.glBalance,
        coffreBalance: 0,
        requestedAmount: montant,
        requiresCoffreTransfer: false,
      };
    }

    // 2. Caisse insuffisante — vérifier le coffre
    const coffreCheck = await this.checkCoffreLiquidity(coffreId, montant, tx);

    if (coffreCheck.allowed) {
      return {
        source: "COFFRE",
        caisseBalance: caisseCheck.glBalance,
        coffreBalance: coffreCheck.glBalance,
        requestedAmount: montant,
        requiresCoffreTransfer: true,
        transferAmount: montant - caisseCheck.glBalance,
      };
    }

    // 3. Ni caisse ni coffre ne suffisent
    return {
      source: "INSUFFICIENT",
      caisseBalance: caisseCheck.glBalance,
      coffreBalance: coffreCheck.glBalance,
      requestedAmount: montant,
      requiresCoffreTransfer: false,
    };
  }

  /**
   * Vérifie la liquidité et throw InsufficientFundsError si insuffisant.
   * Méthode raccourci pour les opérations critiques.
   */
  async requireLiquidity(
    entityType: LiquidityEntityType,
    entityId: string,
    montant: number,
    tx: Tx = db
  ): Promise<LiquidityCheckResult> {
    let result: LiquidityCheckResult;

    switch (entityType) {
      case "compte":
        result = await this.checkCompteLiquidity(entityId, montant, tx);
        break;
      case "session":
        result = await this.checkCaisseLiquidity(entityId, montant, tx);
        break;
      case "coffre":
        result = await this.checkCoffreLiquidity(entityId, montant, tx);
        break;
      default:
        throw new Error(`Entity type non supporté pour la vérification de liquidité: ${entityType}`);
    }

    if (!result.allowed) {
      throw new InsufficientFundsError(
        entityType,
        entityId,
        result.glBalance,
        montant
      );
    }

    return result;
  }

  // ============================================================================
  // PRIVATE
  // ============================================================================

  private buildResult(
    entityType: LiquidityEntityType,
    entityId: string,
    requestedAmount: number,
    glBalance: number,
    cachedBalance: number,
    source: "GL" | "CACHE_FALLBACK"
  ): LiquidityCheckResult {
    const variance = Math.abs(glBalance - cachedBalance);
    const variancePercent = cachedBalance !== 0 ? variance / Math.abs(cachedBalance) : 0;

    return {
      allowed: glBalance >= requestedAmount,
      glBalance,
      cachedBalance,
      variance,
      variancePercent,
      source,
      checkedAt: new Date().toISOString(),
      entityType,
      entityId,
      requestedAmount,
    };
  }

  private logVariance(
    result: LiquidityCheckResult,
    label: string,
    entityId: string
  ): void {
    if (result.variance > 0 && result.variancePercent >= VARIANCE_ALERT_THRESHOLD) {
      logger.warn({
        label,
        entityId,
        glBalance: result.glBalance,
        cachedBalance: result.cachedBalance,
        variance: result.variance,
        variancePercent: (result.variancePercent * 100).toFixed(2) + "%",
      }, "GL/Cache variance detected — potential data inconsistency");
    }
  }
}

// Export singleton
export const liquidityGuard = new LiquidityGuardService();
export default liquidityGuard;
