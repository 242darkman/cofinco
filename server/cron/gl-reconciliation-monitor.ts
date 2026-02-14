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
import { currencySymbol } from "@shared/config/currency";

interface ReconciliationResult {
  timestamp: Date;
  status: 'OK' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  issues: ReconciliationIssue[];
  totalDiscrepancy: number;
  details: {
    coffres: { operational: number; gl: number; discrepancy: number };
    caisses: { operational: number; gl: number; discrepancy: number };
    transit581: { gl: number; isZero: boolean };
    agents573: { operational: number; gl: number; discrepancy: number };
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

    // 6. Contrôle compte de transit 581 (SYSCOHADA : doit être soldé à zéro)
    const transit581 = await client.query(`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) -
        COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as solde
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '581%'
        AND e.statut = 'POSTED'
    `);

    const transit581Balance = parseFloat(transit581.rows[0]?.solde || '0');
    const transit581IsZero = Math.abs(transit581Balance) <= THRESHOLDS.ACCEPTABLE;

    if (!transit581IsZero) {
      issues.push({
        severity: Math.abs(transit581Balance) > THRESHOLDS.MAJOR ? 'CRITICAL' : 'MAJOR',
        entityType: 'TRANSIT',
        entityId: '581',
        operationalBalance: 0,
        glBalance: transit581Balance,
        discrepancy: Math.abs(transit581Balance),
        message: `Compte de transit 581 non soldé : ${transit581Balance.toLocaleString()} ${currencySymbol()} (doit être 0 — SYSCOHADA)`,
      });
    }

    // 7. Réconciliation agents terrain : GL 573 vs caisses_agent.solde_valide
    const agents573Op = await client.query(`
      SELECT COALESCE(SUM(CAST(solde_valide AS DECIMAL)), 0) as total
      FROM caisses_agent
      WHERE statut = 'ACTIVE' AND deleted_at IS NULL
    `);

    const totalAgents573Op = parseFloat(agents573Op.rows[0]?.total || '0');

    const agents573GL = await client.query(`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) -
        COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as solde
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '573%'
        AND e.statut = 'POSTED'
    `);

    const totalAgents573GL = parseFloat(agents573GL.rows[0]?.solde || '0');
    const agents573Discrepancy = Math.abs(totalAgents573Op - totalAgents573GL);

    if (agents573Discrepancy > THRESHOLDS.ACCEPTABLE) {
      issues.push(
        assessDiscrepancy('AGENT', '573-global', totalAgents573Op, totalAgents573GL)
      );
    }

    // 8. Évaluation globale
    const coffreDiscrepancy = Math.abs(totalCoffresOp - totalCoffresGL);
    const caisseDiscrepancy = Math.abs(totalCaissesOp - totalCaissesGL);
    const totalDiscrepancy = coffreDiscrepancy + caisseDiscrepancy + agents573Discrepancy + Math.abs(transit581Balance);

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

    // 9. Déterminer le statut global
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
        transit581: {
          gl: transit581Balance,
          isZero: transit581IsZero,
        },
        agents573: {
          operational: totalAgents573Op,
          gl: totalAgents573GL,
          discrepancy: agents573Discrepancy,
        },
      },
    };

    // 10. Loguer le résultat
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
