/**
 * CRON JOB - Monitoring Réconciliation GL
 *
 * Vérifie automatiquement la synchronisation entre soldes opérationnels
 * et Grand Livre toutes les heures
 *
 * Envoie des alertes en cas d'écart significatif
 */

import { db } from "../db";
import { pool } from "../db";
import { logger } from "../lib/logger";
import { assessDiscrepancy, THRESHOLDS, type ReconciliationIssue } from "../services/treasury/gl-sync-guard";

interface ReconciliationResult {
  timestamp: Date;
  status: 'OK' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  issues: ReconciliationIssue[];
  totalDiscrepancy: number;
  details: {
    coffres: { operational: number; gl: number; discrepancy: number };
    caisses: { operational: number; gl: number; discrepancy: number };
  };
}

/**
 * Exécute la vérification de réconciliation
 */
export async function runGlReconciliationCheck(): Promise<ReconciliationResult> {
  const startTime = Date.now();
  const client = await pool.connect();
  const issues: ReconciliationIssue[] = [];

  try {
    logger.info('[GL Monitor] Démarrage vérification réconciliation');

    // 1. Soldes opérationnels Coffres
    const coffresOp = await client.query(`
      SELECT
        id,
        code,
        nom,
        CAST(solde AS DECIMAL) as solde
      FROM coffres_forts
      WHERE statut = 'ACTIVE'
    `);

    const totalCoffresOp = coffresOp.rows.reduce(
      (sum, c) => sum + parseFloat(c.solde || '0'),
      0
    );

    // 2. Soldes GL Coffres (531xxx)
    const coffresGL = await client.query(`
      SELECT
        pc.numero_compte,
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) -
        COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as solde
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '531%'
        AND e.statut = 'POSTED'
      GROUP BY pc.numero_compte
    `);

    const totalCoffresGL = coffresGL.rows.reduce(
      (sum, c) => sum + parseFloat(c.solde || '0'),
      0
    );

    // 3. Vérifier chaque coffre individuellement
    for (const coffre of coffresOp.rows) {
      const coffreId = coffre.id;
      const operationalBalance = parseFloat(coffre.solde);

      // Trouver le solde GL correspondant (approximatif - chercher par code coffre)
      // Note: Idéalement, il faudrait un mapping explicite coffre → compte GL
      const glBalance = totalCoffresGL; // Simplifié pour l'instant

      const issue = assessDiscrepancy(
        'COFFRE',
        coffreId,
        operationalBalance,
        glBalance
      );

      if (issue.severity !== 'ACCEPTABLE') {
        issues.push(issue);
      }
    }

    // 4. Soldes opérationnels Caisses
    // IMPORTANT: Seules les sessions OUVERTES comptent comme solde opérationnel
    // Une session fermée signifie que le cash a été compté et potentiellement retourné au coffre
    const caissesOp = await client.query(`
      SELECT COALESCE(SUM(solde_reel), 0) as total FROM (
        SELECT
          c.id,
          COALESCE(
            CAST(s.montant_fermeture_theorique AS DECIMAL),
            CAST(s.montant_ouverture AS DECIMAL),
            0
          ) as solde_reel
        FROM caisses c
        LEFT JOIN sessions_caisse s ON s.caisse_id = c.id AND s.closed_at IS NULL
      ) sub
    `);

    const totalCaissesOp = parseFloat(caissesOp.rows[0].total);

    // 5. Soldes GL Caisses (521xxx)
    const caissesGL = await client.query(`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) -
        COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as solde
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '521%'
        AND e.statut = 'POSTED'
    `);

    const totalCaissesGL = parseFloat(caissesGL.rows[0].solde);

    // 6. Évaluation globale
    const coffreDiscrepancy = Math.abs(totalCoffresOp - totalCoffresGL);
    const caisseDiscrepancy = Math.abs(totalCaissesOp - totalCaissesGL);
    const totalDiscrepancy = coffreDiscrepancy + caisseDiscrepancy;

    // Ajouter les écarts globaux
    if (coffreDiscrepancy > THRESHOLDS.ACCEPTABLE) {
      issues.push(
        assessDiscrepancy('COFFRE', 'global', totalCoffresOp, totalCoffresGL)
      );
    }

    if (caisseDiscrepancy > THRESHOLDS.ACCEPTABLE) {
      issues.push(
        assessDiscrepancy('CAISSE', 'global', totalCaissesOp, totalCaissesGL)
      );
    }

    // 7. Déterminer le statut global
    let status: ReconciliationResult['status'] = 'OK';
    for (const issue of issues) {
      if (issue.severity === 'CRITICAL' && status !== 'CRITICAL') {
        status = 'CRITICAL';
      } else if (issue.severity === 'MAJOR' && status === 'OK') {
        status = 'MAJOR';
      } else if (issue.severity === 'MINOR' && status === 'OK') {
        status = 'MINOR';
      }
    }

    const duration = Date.now() - startTime;

    const result: ReconciliationResult = {
      timestamp: new Date(),
      status,
      issues,
      totalDiscrepancy,
      details: {
        coffres: {
          operational: totalCoffresOp,
          gl: totalCoffresGL,
          discrepancy: coffreDiscrepancy,
        },
        caisses: {
          operational: totalCaissesOp,
          gl: totalCaissesGL,
          discrepancy: caisseDiscrepancy,
        },
      },
    };

    // 8. Loguer le résultat
    if (status === 'CRITICAL') {
      logger.error(
        { result, durationMs: duration },
        '[GL Monitor] ❌ ÉCART CRITIQUE DÉTECTÉ'
      );
    } else if (status === 'MAJOR') {
      logger.warn(
        { result, durationMs: duration },
        '[GL Monitor] ⚠️  Écart majeur détecté'
      );
    } else if (status === 'MINOR') {
      logger.info(
        { result, durationMs: duration },
        '[GL Monitor] ⚡ Écart mineur détecté'
      );
    } else {
      logger.info(
        { totalDiscrepancy, durationMs: duration },
        '[GL Monitor] ✅ Réconciliation OK'
      );
    }

    return result;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      '[GL Monitor] Erreur lors de la vérification'
    );
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Planifie l'exécution automatique du monitoring
 * À appeler au démarrage du serveur
 */
export function scheduleGlReconciliationMonitoring(intervalMinutes: number = 60) {
  logger.info(
    { intervalMinutes },
    '[GL Monitor] Planification monitoring réconciliation'
  );

  // Exécution immédiate
  runGlReconciliationCheck().catch((error) => {
    logger.error({ error }, '[GL Monitor] Erreur lors de la première exécution');
  });

  // Puis toutes les X minutes
  setInterval(
    () => {
      runGlReconciliationCheck().catch((error) => {
        logger.error({ error }, '[GL Monitor] Erreur lors de l\'exécution planifiée');
      });
    },
    intervalMinutes * 60 * 1000
  );
}
