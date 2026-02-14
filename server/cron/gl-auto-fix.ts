/**
 * SEMI-AUTOMATIC GL CORRECTION (Optionnel - Désactivé par défaut)
 *
 * Corrige automatiquement les PETITS écarts (< 10k FCFA)
 * Alerte pour les GROS écarts (≥ 10k FCFA) sans corriger
 *
 * ⚠️  IMPORTANT: À utiliser avec précaution!
 * Ce système est désactivé par défaut. Pour l'activer, voir instructions ci-dessous.
 */

import { pool } from "../db";
import { logger } from "../lib/logger";
import { v4 as uuidv4 } from "uuid";
import { currencySymbol } from "@shared/config/currency";

const AUTO_FIX_THRESHOLD = 10_000; // 10k FCFA
const ALERT_THRESHOLD = 100_000; // 100k FCFA

interface AutoFixResult {
  action: 'FIXED' | 'ALERTED' | 'SKIPPED';
  discrepancy: number;
  details: string;
}

/**
 * Tente une correction automatique si écart petit
 * Sinon alerte équipe technique
 */
export async function attemptAutoFixGlDiscrepancy(): Promise<AutoFixResult> {
  const client = await pool.connect();

  try {
    // 1. Diagnostic rapide
    const coffresOp = await client.query(`
      SELECT COALESCE(SUM(CAST(solde AS DECIMAL)), 0) as total
      FROM coffres_forts
    `);
    const coffresTotal = parseFloat(coffresOp.rows[0].total);

    const coffresGL = await client.query(`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) -
        COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as solde
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '531%'
        AND e.statut = 'POSTED'
    `);
    const glTotal = parseFloat(coffresGL.rows[0].solde);

    const discrepancy = Math.abs(coffresTotal - glTotal);

    // 2. Décision basée sur le seuil
    if (discrepancy < 500) {
      // Écart négligeable, OK
      return {
        action: 'SKIPPED',
        discrepancy,
        details: `Écart acceptable (< 500 ${currencySymbol()})`,
      };
    }

    if (discrepancy >= ALERT_THRESHOLD) {
      // Écart trop important, ALERTE uniquement
      logger.error(
        { discrepancy },
        '[GL Auto-Fix] ÉCART CRITIQUE - Correction manuelle requise'
      );

      // TODO: Envoyer email/Slack à l'équipe
      return {
        action: 'ALERTED',
        discrepancy,
        details: `Écart critique de ${discrepancy.toLocaleString()} ${currencySymbol()} - Équipe alertée`,
      };
    }

    if (discrepancy >= AUTO_FIX_THRESHOLD) {
      // Écart moyen, ALERTE sans correction
      logger.warn(
        { discrepancy },
        '[GL Auto-Fix] Écart détecté - Correction manuelle recommandée'
      );

      return {
        action: 'ALERTED',
        discrepancy,
        details: `Écart de ${discrepancy.toLocaleString()} ${currencySymbol()} - Investigation requise`,
      };
    }

    // 3. CORRECTION AUTOMATIQUE pour petits écarts (< 10k)
    logger.info(
      { discrepancy },
      '[GL Auto-Fix] Correction automatique en cours...'
    );

    await client.query('BEGIN');

    // Récupérer les IDs nécessaires
    const [compteCoffre] = (
      await client.query(`
        SELECT id, numero_compte
        FROM plan_comptable
        WHERE numero_compte = '531' OR numero_compte = '5311'
        ORDER BY numero_compte
        LIMIT 1
      `)
    ).rows;

    const [compteAttente] = (
      await client.query(`
        SELECT id, numero_compte
        FROM plan_comptable
        WHERE numero_compte = '401' OR numero_compte LIKE '401%'
        ORDER BY numero_compte
        LIMIT 1
      `)
    ).rows;

    const [journal] = (
      await client.query(`
        SELECT id FROM journaux_comptables WHERE code = 'OD' LIMIT 1
      `)
    ).rows;

    const [exercice] = (
      await client.query(`
        SELECT id
        FROM exercices_comptables
        WHERE date_debut <= CURRENT_DATE AND date_fin >= CURRENT_DATE
        ORDER BY date_debut DESC
        LIMIT 1
      `)
    ).rows;

    const [agence] = (
      await client.query(`SELECT id FROM agences ORDER BY created_at LIMIT 1`)
    ).rows;

    if (!compteCoffre || !compteAttente || !journal || !exercice || !agence) {
      throw new Error('Données comptables manquantes pour la régularisation');
    }

    // Créer écriture de régularisation
    const ecritureId = uuidv4();
    const dateJour = new Date().toISOString().split('T')[0];
    const reference = `AUTO-REG-${Date.now()}`;

    await client.query(
      `
      INSERT INTO ecritures_comptables (
        id, exercice_id, journal_id, date_ecriture, numero_piece,
        libelle, statut, agence_id, source_type, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'POSTED', $7, 'AUTO_REGULARISATION', NOW()
      )
    `,
      [
        ecritureId,
        exercice.id,
        journal.id,
        dateJour,
        reference,
        `Régularisation automatique écart ${discrepancy.toLocaleString()} ${currencySymbol()}`,
        agence.id,
      ]
    );

    // Lignes d'écriture
    await client.query(
      `
      INSERT INTO lignes_ecritures (
        id, ecriture_id, compte_id, numero_compte, debit, credit, libelle
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, 0, 'Régularisation automatique coffre'
      )
    `,
      [ecritureId, compteCoffre.id, compteCoffre.numero_compte, discrepancy]
    );

    await client.query(
      `
      INSERT INTO lignes_ecritures (
        id, ecriture_id, compte_id, numero_compte, debit, credit, libelle
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, 0, $4, 'Contrepartie régularisation auto'
      )
    `,
      [ecritureId, compteAttente.id, compteAttente.numero_compte, discrepancy]
    );

    await client.query('COMMIT');

    logger.info(
      { discrepancy, reference },
      '[GL Auto-Fix] ✅ Correction automatique réussie'
    );

    return {
      action: 'FIXED',
      discrepancy,
      details: `Écart de ${discrepancy.toLocaleString()} ${currencySymbol()} corrigé automatiquement (${reference})`,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      '[GL Auto-Fix] Échec correction automatique'
    );
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Planifie l'exécution automatique (quotidienne à 3h du matin)
 * ⚠️  DÉSACTIVÉ PAR DÉFAUT - Activer avec précaution
 */
export function scheduleAutoFix() {
  logger.warn(
    '[GL Auto-Fix] ⚠️  SYSTÈME D\'AUTO-CORRECTION ACTIVÉ - Vérifications quotidiennes à 3h'
  );

  // Exécution immédiate au démarrage
  attemptAutoFixGlDiscrepancy().catch((error) => {
    logger.error({ error }, '[GL Auto-Fix] Erreur lors de la première exécution');
  });

  // Puis quotidiennement à 3h du matin
  const now = new Date();
  const next3AM = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    3,
    0,
    0
  );
  const msUntil3AM = next3AM.getTime() - now.getTime();

  setTimeout(() => {
    attemptAutoFixGlDiscrepancy().catch((error) => {
      logger.error({ error }, '[GL Auto-Fix] Erreur lors de l\'exécution planifiée');
    });

    // Puis toutes les 24h
    setInterval(
      () => {
        attemptAutoFixGlDiscrepancy().catch((error) => {
          logger.error({ error }, '[GL Auto-Fix] Erreur lors de l\'exécution planifiée');
        });
      },
      24 * 60 * 60 * 1000
    );
  }, msUntil3AM);
}

/**
 * INSTRUCTIONS D'ACTIVATION
 *
 * Pour activer l'auto-correction, ajouter dans server/index.ts:
 *
 * import { scheduleAutoFix } from './cron/gl-auto-fix';
 *
 * // APRÈS les autres cron jobs
 * scheduleAutoFix();
 * logger.info('GL auto-fix started (daily at 3 AM)');
 *
 * ⚠️  ATTENTION:
 * - Tester d'abord en environnement de développement
 * - Surveiller les logs pendant 1 semaine
 * - S'assurer que les alertes email/Slack sont configurées
 * - Documenter chaque correction automatique
 */
