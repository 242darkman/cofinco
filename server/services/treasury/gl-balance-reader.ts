/**
 * GL Balance Reader Service
 *
 * Service spécialisé pour lire les soldes GL des caisses.
 * Utilisé par le système GL Guard pour vérifier la cohérence
 * entre le billetage physique et le solde comptable à l'ouverture.
 *
 * OHADA Classe 5 - Comptes de trésorerie:
 * - 521xxx: Caisse Guichet
 */

import { db } from "../../db";
import { sql, eq, and, like, or } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  planComptable,
  lignesEcritures,
  ecritures,
  EntryStatus,
} from "@shared/schema/accounting";
import { caisses } from "@shared/schema/finance";
import { createLogger } from "../../lib/logger";

const logger = createLogger("Treasury:GlBalanceReader");

// Transaction type alias
type Tx = PgTransaction<any, any, any> | typeof db;

// ============================================================================
// TYPES
// ============================================================================

export interface CaisseGlBalance {
  caisseId: string;
  caisseNom: string;
  agenceId: string;
  glBalance: number;
  glAccountNumber: string | null; // Numéro de compte GL si trouvé
  source: "DEDICATED_ACCOUNT" | "AGENCY_AGGREGATE" | "NO_GL_DATA";
  computedAt: string;
  lastPostingAt?: string;
}

export interface GlBalanceReadResult {
  success: boolean;
  balance: CaisseGlBalance | null;
  error?: string;
}

// Préfixe des comptes de caisse (OHADA classe 5)
const CAISSE_ACCOUNT_PREFIX = "521";

// ============================================================================
// SERVICE
// ============================================================================

class GlBalanceReaderService {
  /**
   * Obtient le solde GL pour une caisse spécifique.
   *
   * Stratégie de recherche:
   * 1. Cherche un compte GL dédié à la caisse (521xxx avec intitulé contenant le nom)
   * 2. Si pas trouvé, agrège tous les comptes 521xxx de l'agence
   * 3. Si aucune donnée GL, retourne 0 avec flag "NO_GL_DATA"
   *
   * @param caisseId ID de la caisse
   * @param tx Transaction optionnelle pour cohérence snapshot
   */
  async getGlBalanceForCaisse(
    caisseId: string,
    tx: Tx = db
  ): Promise<GlBalanceReadResult> {
    try {
      // 1. Récupérer les infos de la caisse
      const [caisse] = await tx
        .select({
          id: caisses.id,
          nom: caisses.nom,
          agenceId: caisses.agenceId,
        })
        .from(caisses)
        .where(eq(caisses.id, caisseId))
        .limit(1);

      if (!caisse) {
        return {
          success: false,
          balance: null,
          error: `Caisse non trouvée: ${caisseId}`,
        };
      }

      // 2. Chercher un compte GL dédié à cette caisse
      const dedicatedAccount = await this.findDedicatedGlAccount(
        caisse.nom,
        caisse.agenceId,
        tx
      );

      let glBalance: number;
      let source: CaisseGlBalance["source"];
      let glAccountNumber: string | null = null;

      if (dedicatedAccount) {
        // Compte dédié trouvé - utiliser son solde
        glBalance = await this.getAccountBalance(dedicatedAccount.numeroCompte, caisse.agenceId, tx);
        source = "DEDICATED_ACCOUNT";
        glAccountNumber = dedicatedAccount.numeroCompte;

        logger.debug(
          { caisseId, glAccountNumber, glBalance },
          "Solde GL depuis compte dédié"
        );
      } else {
        // Pas de compte dédié - agréger tous les comptes 521xxx de l'agence
        glBalance = await this.getAgencyTotalCaisseBalance(caisse.agenceId, tx);
        source = glBalance === 0 ? "NO_GL_DATA" : "AGENCY_AGGREGATE";

        logger.debug(
          { caisseId, agenceId: caisse.agenceId, glBalance },
          "Solde GL agrégé (pas de compte dédié)"
        );
      }

      // 3. Récupérer le timestamp du dernier posting
      const lastPosting = await this.getLastCaissePosting(caisse.agenceId, tx);

      return {
        success: true,
        balance: {
          caisseId: caisse.id,
          caisseNom: caisse.nom,
          agenceId: caisse.agenceId,
          glBalance,
          glAccountNumber,
          source,
          computedAt: new Date().toISOString(),
          lastPostingAt: lastPosting?.toISOString(),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, caisseId }, "Erreur lecture solde GL caisse");

      return {
        success: false,
        balance: null,
        error: message,
      };
    }
  }

  /**
   * Obtient le solde GL total pour toutes les caisses d'une agence.
   * Somme de tous les comptes 521xxx.
   */
  async getGlBalanceForAgency(
    agenceId: string,
    tx: Tx = db
  ): Promise<number> {
    return this.getAgencyTotalCaisseBalance(agenceId, tx);
  }

  /**
   * Obtient le solde GL dans une transaction isolée (REPEATABLE READ).
   * Utilisé pour garantir la cohérence snapshot lors de l'ouverture de session.
   */
  async getGlBalanceForCaisseIsolated(
    caisseId: string
  ): Promise<GlBalanceReadResult> {
    return await db.transaction(async (tx) => {
      // Forcer REPEATABLE READ pour cohérence snapshot
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);
      return this.getGlBalanceForCaisse(caisseId, tx);
    });
  }

  /**
   * Vérifie si une caisse a des données GL (écritures postées).
   */
  async caisseHasGlData(caisseId: string, tx: Tx = db): Promise<boolean> {
    const result = await this.getGlBalanceForCaisse(caisseId, tx);
    return result.success && result.balance?.source !== "NO_GL_DATA";
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Cherche un compte GL dédié à une caisse spécifique.
   * Recherche dans les comptes 521xxx avec un intitulé contenant le nom de la caisse.
   */
  private async findDedicatedGlAccount(
    caisseNom: string,
    agenceId: string,
    tx: Tx = db
  ): Promise<{ numeroCompte: string; intitule: string } | null> {
    // Nettoyer le nom pour la recherche (case insensitive)
    const searchPattern = `%${caisseNom}%`;

    const result = await tx
      .select({
        numeroCompte: planComptable.numeroCompte,
        intitule: planComptable.intitule,
      })
      .from(planComptable)
      .where(
        and(
          like(planComptable.numeroCompte, `${CAISSE_ACCOUNT_PREFIX}%`),
          sql`lower(${planComptable.intitule}) LIKE lower(${searchPattern})`,
          or(
            eq(planComptable.agenceId, agenceId),
            sql`${planComptable.agenceId} IS NULL` // Comptes globaux
          ),
          eq(planComptable.actif, true)
        )
      )
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Calcule le solde d'un compte GL spécifique.
   * Pour les comptes d'actif (classe 5): solde = Σ débits - Σ crédits
   */
  private async getAccountBalance(
    numeroCompte: string,
    agenceId: string,
    tx: Tx = db
  ): Promise<number> {
    const result = await tx
      .select({
        totalDebit: sql<string>`COALESCE(SUM(CAST(${lignesEcritures.debit} AS DECIMAL)), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(CAST(${lignesEcritures.credit} AS DECIMAL)), 0)`,
      })
      .from(lignesEcritures)
      .innerJoin(planComptable, eq(lignesEcritures.compteId, planComptable.id))
      .innerJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
      .where(
        and(
          eq(planComptable.numeroCompte, numeroCompte),
          eq(ecritures.statut, EntryStatus.POSTED),
          or(
            eq(ecritures.agenceId, agenceId),
            sql`${ecritures.agenceId} IS NULL`
          )
        )
      );

    const totalDebit = Number(result[0]?.totalDebit || 0);
    const totalCredit = Number(result[0]?.totalCredit || 0);

    return totalDebit - totalCredit;
  }

  /**
   * Calcule le solde total de tous les comptes 521xxx pour une agence.
   */
  private async getAgencyTotalCaisseBalance(
    agenceId: string,
    tx: Tx = db
  ): Promise<number> {
    const result = await tx
      .select({
        totalDebit: sql<string>`COALESCE(SUM(CAST(${lignesEcritures.debit} AS DECIMAL)), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(CAST(${lignesEcritures.credit} AS DECIMAL)), 0)`,
      })
      .from(lignesEcritures)
      .innerJoin(planComptable, eq(lignesEcritures.compteId, planComptable.id))
      .innerJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
      .where(
        and(
          like(planComptable.numeroCompte, `${CAISSE_ACCOUNT_PREFIX}%`),
          eq(ecritures.statut, EntryStatus.POSTED),
          or(
            eq(ecritures.agenceId, agenceId),
            sql`${ecritures.agenceId} IS NULL`
          )
        )
      );

    const totalDebit = Number(result[0]?.totalDebit || 0);
    const totalCredit = Number(result[0]?.totalCredit || 0);

    return totalDebit - totalCredit;
  }

  /**
   * Récupère le timestamp du dernier posting sur les comptes caisse de l'agence.
   */
  private async getLastCaissePosting(
    agenceId: string,
    tx: Tx = db
  ): Promise<Date | null> {
    const result = await tx
      .select({
        createdAt: ecritures.createdAt,
      })
      .from(ecritures)
      .innerJoin(lignesEcritures, eq(lignesEcritures.ecritureId, ecritures.id))
      .innerJoin(planComptable, eq(lignesEcritures.compteId, planComptable.id))
      .where(
        and(
          like(planComptable.numeroCompte, `${CAISSE_ACCOUNT_PREFIX}%`),
          eq(ecritures.statut, EntryStatus.POSTED),
          or(
            eq(ecritures.agenceId, agenceId),
            sql`${ecritures.agenceId} IS NULL`
          )
        )
      )
      .orderBy(sql`${ecritures.createdAt} DESC`)
      .limit(1);

    return result[0]?.createdAt || null;
  }
}

// Export singleton
export const glBalanceReader = new GlBalanceReaderService();
export default glBalanceReader;
