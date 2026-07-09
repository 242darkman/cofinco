/**
 * Service Encaisse — Single Source of Truth basé sur le Grand Livre (GL)
 *
 * Ce service calcule l'encaisse disponible UNIQUEMENT à partir des soldes GL
 * des comptes de trésorerie (classe 5 OHADA):
 * - 521xxx: Caisse Guichet
 * - 531xxx: Coffre-Fort
 * - 573xxx: Mobile Money
 * - 512xxx: Banque
 *
 * L'encaisse opérationnelle (coffres_forts.solde, sessions_caisse.montant_fermeture_theorique)
 * est utilisée UNIQUEMENT pour la réconciliation, jamais comme source primaire.
 */

import { db } from "../../db";
import { sql, eq, and, or, like, sum, max, count, desc } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  planComptable,
  lignesEcritures,
  ecritures,
  EntryStatus,
} from "@shared/schema/accounting";
import { sessionsCaisse, caisses } from "@shared/schema/finance";
import { coffresForts } from "@shared/schema/coffres-forts";
import { createLogger } from "../../lib/logger";

const logger = createLogger("Treasury:EncaisseService");

// Transaction type alias for cleaner signatures
type Tx = PgTransaction<any, any, any> | typeof db;

// ============================================================================
// TYPES
// ============================================================================

export interface EncaisseBreakdown {
  caisseGuichet: number; // Comptes 521xxx
  coffreCentral: number; // Comptes 531xxx
  mobileMoney: number; // Comptes 573xxx
  banque: number; // Comptes 512xxx
  fondsEnTransit: number; // Comptes 581xxx (informatif)
  reservesBloques: number; // Fonds bloqués (si applicable)
}

export interface EncaisseMeta {
  computedAt: string; // ISO timestamp
  source: "GL"; // Toujours 'GL'
  agenceId: string | null;
  lastEcritureId?: string;
  lastPostingAt?: string;
}

export interface ReconciliationStatus {
  operationalTotal: number; // Depuis caches opérationnels
  glTotal: number; // Depuis GL
  ecart: number; // Différence (operational - GL)
  status: "OK" | "MINOR" | "MAJOR" | "CRITICAL";
  details?: {
    coffresOperational: number;
    caissesOperational: number;
    coffresGL: number;
    caissesGL: number;
  };
}

export interface EncaisseCanonique {
  totalDisponible: number;
  breakdown: EncaisseBreakdown;
  meta: EncaisseMeta;
  reconciliation?: ReconciliationStatus;
}

// Seuils de réconciliation en FCFA
const RECONCILIATION_THRESHOLDS = {
  OK: 500, // < 500 FCFA = OK
  MINOR: 50_000, // < 50k = MINOR
  MAJOR: 500_000, // < 500k = MAJOR
  // >= 500k = CRITICAL
};

// Préfixes de comptes GL de liquidité (classe 5 OHADA)
// NOTE: Le compte 571 est obsolète - migration 0063 a tout transféré vers 521
const GL_ACCOUNT_PREFIXES = {
  CAISSE_GUICHET: ["521"], // Caisse centrale et guichets
  COFFRE_CENTRAL: ["531"], // Coffres-forts
  MOBILE_MONEY: ["573"], // Mobile Money (MTN, Airtel)
  BANQUE: ["512"], // Comptes bancaires
  TRANSIT: ["581"], // Virements internes (informatif uniquement)
};

// ============================================================================
// SERVICE
// ============================================================================

class EncaisseService {
  /**
   * Calcule l'encaisse disponible depuis le Grand Livre (GL)
   * C'est la SINGLE SOURCE OF TRUTH pour l'encaisse.
   *
   * @param agenceId ID de l'agence (ou 'all')
   * @param tx Transaction optionnelle pour cohérence snapshot
   */
  async getEncaisseFromGL(agenceId?: string, tx: Tx = db): Promise<EncaisseCanonique> {
    const startTime = Date.now();
    const isAllAgences = !agenceId || agenceId === "all";

    try {
      // 1. Récupérer les soldes GL par préfixe de compte
      const [caisseSolde, coffreSolde, mmoSolde, banqueSolde, transitSolde, lastEcriture] =
        await Promise.all([
          this.getGLBalanceByPrefix(GL_ACCOUNT_PREFIXES.CAISSE_GUICHET, agenceId, tx),
          this.getGLBalanceByPrefix(GL_ACCOUNT_PREFIXES.COFFRE_CENTRAL, agenceId, tx),
          this.getGLBalanceByPrefix(GL_ACCOUNT_PREFIXES.MOBILE_MONEY, agenceId, tx),
          this.getGLBalanceByPrefix(GL_ACCOUNT_PREFIXES.BANQUE, agenceId, tx),
          this.getGLBalanceByPrefix(GL_ACCOUNT_PREFIXES.TRANSIT, agenceId, tx),
          this.getLastEcriture(agenceId, tx),
        ]);

      // 2. Calculer le total disponible (exclut transit)
      const totalDisponible = caisseSolde + coffreSolde + mmoSolde + banqueSolde;

      // 3. Construire la réponse
      const result: EncaisseCanonique = {
        totalDisponible,
        breakdown: {
          caisseGuichet: caisseSolde,
          coffreCentral: coffreSolde,
          mobileMoney: mmoSolde,
          banque: banqueSolde,
          fondsEnTransit: transitSolde,
          reservesBloques: 0, // TODO: Implémenter si nécessaire
        },
        meta: {
          computedAt: new Date().toISOString(),
          source: "GL",
          agenceId: isAllAgences ? null : agenceId!,
          lastEcritureId: lastEcriture?.id,
          lastPostingAt: lastEcriture?.createdAt,
        },
      };

      const elapsed = Date.now() - startTime;
      logger.debug(
        { agenceId, totalDisponible, elapsed },
        "Encaisse GL calculée"
      );

      return result;
    } catch (error) {
      logger.error({ err: error, agenceId }, "Erreur calcul encaisse GL");
      throw error;
    }
  }

  /**
   * Calcule l'encaisse avec réconciliation (comparaison GL vs Opérationnel)
   *
   * IMPORTANT: Utilise une transaction avec isolation REPEATABLE READ pour garantir
   * que les lectures GL et Opérationnelles voient le même snapshot de la base.
   * Cela évite les faux positifs dus aux Race Conditions.
   */
  async getEncaisseWithReconciliation(
    agenceId?: string
  ): Promise<EncaisseCanonique> {
    // On force une transaction REPEATABLE READ pour la cohérence snapshot
    return await db.transaction(async (tx) => {
      // Si supported par le driver, on peut set l'isolation level
      // Note: drizzle/node-postgres ne supporte pas toujours explicitement l'API d'isolation
      // On le fait manuellement en SQL si besoin, mais db.transaction utilise souvent READ COMMITTED.
      // Pour être sûr, on exécute SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);

      const [encaisseGL, operationalData] = await Promise.all([
        this.getEncaisseFromGL(agenceId, tx),
        this.getOperationalBalances(agenceId, tx),
      ]);

      // Calcul de l'écart
      const ecart = operationalData.total - encaisseGL.totalDisponible;
      const absEcart = Math.abs(ecart);

      // Déterminer le statut
      let status: ReconciliationStatus["status"] = "OK";
      if (absEcart >= RECONCILIATION_THRESHOLDS.MAJOR) {
        status = "CRITICAL";
      } else if (absEcart >= RECONCILIATION_THRESHOLDS.MINOR) {
        status = "MAJOR";
      } else if (absEcart >= RECONCILIATION_THRESHOLDS.OK) {
        status = "MINOR";
      }

      encaisseGL.reconciliation = {
        operationalTotal: operationalData.total,
        glTotal: encaisseGL.totalDisponible,
        ecart,
        status,
        details: {
          coffresOperational: operationalData.coffres,
          caissesOperational: operationalData.caisses,
          coffresGL: encaisseGL.breakdown.coffreCentral,
          caissesGL: encaisseGL.breakdown.caisseGuichet,
        },
      };

      if (status !== "OK") {
        logger.warn(
          {
            agenceId,
            ecart,
            status,
            glTotal: encaisseGL.totalDisponible,
            operationalTotal: operationalData.total,
          },
          "Écart de réconciliation détecté"
        );
      }

      return encaisseGL;
    });
  }

  /**
   * Calcule le solde GL pour un ensemble de préfixes de comptes
   * Pour les comptes d'actif (classe 5): solde = Σ débits - Σ crédits
   */
  private async getGLBalanceByPrefix(
    prefixes: string[],
    agenceId?: string,
    tx: Tx = db
  ): Promise<number> {
    const isAllAgences = !agenceId || agenceId === "all";

    // Construire les conditions LIKE pour les préfixes
    const prefixConditions = prefixes.map((p) => like(planComptable.numeroCompte, `${p}%`));

    // Requête pour sommer les débits et crédits des lignes d'écritures POSTED
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
          // Filtrer par préfixes de compte
          or(...prefixConditions),
          // Uniquement les écritures postées
          eq(ecritures.statut, EntryStatus.POSTED),
          // Filtrer par agence si spécifié
          isAllAgences ? undefined : eq(ecritures.agenceId, agenceId)
        )
      );

    const totalDebit = Number(result[0]?.totalDebit || 0);
    const totalCredit = Number(result[0]?.totalCredit || 0);

    // Pour les comptes d'actif (classe 5), le solde = Débits - Crédits
    return totalDebit - totalCredit;
  }

  /**
   * Récupère la dernière écriture postée (pour metadata)
   */
  private async getLastEcriture(
    agenceId?: string,
    tx: Tx = db
  ): Promise<{ id: string; createdAt: string } | null> {
    const isAllAgences = !agenceId || agenceId === "all";

    const result = await tx
      .select({
        id: ecritures.id,
        createdAt: ecritures.createdAt,
      })
      .from(ecritures)
      .where(
        and(
          eq(ecritures.statut, EntryStatus.POSTED),
          isAllAgences ? undefined : eq(ecritures.agenceId, agenceId)
        )
      )
      .orderBy(desc(ecritures.createdAt))
      .limit(1);

    if (result.length === 0) return null;

    return {
      id: result[0].id,
      createdAt: result[0].createdAt?.toISOString() || new Date().toISOString(),
    };
  }

  /**
   * Récupère les soldes opérationnels (pour réconciliation)
   * Ces données NE SONT PAS la source de vérité, uniquement pour comparaison.
   */
  private async getOperationalBalances(
    agenceId?: string,
    tx: Tx = db
  ): Promise<{ coffres: number; caisses: number; total: number }> {
    const isAllAgences = !agenceId || agenceId === "all";

    // 1. Total Coffres
    const coffresResult = await tx
      .select({
        total: sum(coffresForts.solde),
      })
      .from(coffresForts)
      .where(isAllAgences ? undefined : eq(coffresForts.ownerId, agenceId));

    // 2. Total Caisses via sessions
    const caissesResult = await tx.execute(sql`
      SELECT COALESCE(SUM(solde_reel), 0) as total FROM (
        SELECT DISTINCT ON (c.id)
          COALESCE(
            CAST(s.montant_fermeture_theorique AS DECIMAL),
            CAST(s.montant_ouverture AS DECIMAL),
            0
          ) as solde_reel
        FROM caisses c
        LEFT JOIN sessions_caisse s ON s.caisse_id = c.id
        WHERE c.deleted_at IS NULL
          ${isAllAgences ? sql`` : sql`AND c.agence_id = ${agenceId}`}
        ORDER BY c.id, s.closed_at DESC NULLS FIRST
      ) sub
    `);

    const coffres = Number(coffresResult[0]?.total || 0);
    const caisseRows = (caissesResult as any).rows || [];
    const caissess = Number(caisseRows[0]?.total || 0);

    return {
      coffres,
      caisses: caissess,
      total: coffres + caissess,
    };
  }

  /**
   * Récupère le détail des comptes GL de trésorerie avec leurs soldes
   */
  async getEncaisseBreakdownDetailed(agenceId?: string): Promise<
    Array<{
      numeroCompte: string;
      intitule: string;
      solde: number;
      categorie: string;
    }>
  > {
    const isAllAgences = !agenceId || agenceId === "all";

    // Tous les préfixes de liquidité
    const allPrefixes = [
      ...GL_ACCOUNT_PREFIXES.CAISSE_GUICHET,
      ...GL_ACCOUNT_PREFIXES.COFFRE_CENTRAL,
      ...GL_ACCOUNT_PREFIXES.MOBILE_MONEY,
      ...GL_ACCOUNT_PREFIXES.BANQUE,
    ];

    const prefixConditions = allPrefixes.map((p) =>
      like(planComptable.numeroCompte, `${p}%`)
    );

    const result = await db
      .select({
        numeroCompte: planComptable.numeroCompte,
        intitule: planComptable.intitule,
        totalDebit: sql<string>`COALESCE(SUM(CAST(${lignesEcritures.debit} AS DECIMAL)), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(CAST(${lignesEcritures.credit} AS DECIMAL)), 0)`,
      })
      .from(planComptable)
      .leftJoin(lignesEcritures, eq(lignesEcritures.compteId, planComptable.id))
      .leftJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
      .where(
        and(
          or(...prefixConditions),
          // Uniquement les écritures postées (ou null si pas d'écritures)
          or(eq(ecritures.statut, EntryStatus.POSTED), sql`${ecritures.id} IS NULL`),
          isAllAgences ? undefined : or(
            eq(ecritures.agenceId, agenceId),
            sql`${ecritures.id} IS NULL`
          )
        )
      )
      .groupBy(planComptable.numeroCompte, planComptable.intitule)
      .orderBy(planComptable.numeroCompte);

    return result.map((r) => {
      const solde = Number(r.totalDebit) - Number(r.totalCredit);
      let categorie = "Autre";

      if (r.numeroCompte.startsWith("521")) categorie = "Caisse Guichet";
      else if (r.numeroCompte.startsWith("531")) categorie = "Coffre-Fort";
      else if (r.numeroCompte.startsWith("573")) categorie = "Mobile Money";
      else if (r.numeroCompte.startsWith("512")) categorie = "Banque";

      return {
        numeroCompte: r.numeroCompte,
        intitule: r.intitule,
        solde,
        categorie,
      };
    });
  }
}

// Export singleton
export const encaisseService = new EncaisseService();
export default encaisseService;
