/**
 * CRON JOB - Comptabilisation des intérêts courus (SYSCOHADA art. 46)
 *
 * Calcule et comptabilise mensuellement les intérêts courus non échus
 * sur tous les crédits actifs.
 *
 * Écriture : D 2718 (Intérêts courus sur prêts) / C 7071 (Intérêts sur prêts)
 * Matching rule : CREDIT_INTEREST_ACCRUAL (sourceType=MOUVEMENT, eventType=CREDIT_INTEREST_ACCRUAL)
 *
 * Chaque crédit éligible passe par executeWithLedger pour garantir
 * l'atomicité mouvement + écriture GL dans la même transaction.
 *
 * Fréquence : 1er de chaque mois à 2h00
 */

import { pool } from "../db";
import { executeWithLedger } from "../services/ledger";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

interface AccrualResult {
  creditId: string;
  numeroCredit: string;
  montantInterets: number;
  periode: string;
  mouvementId?: string;
  glStatus?: string;
}

/**
 * Calcule les intérêts courus pour un mois donné sur tous les crédits actifs.
 *
 * Logique : Pour chaque crédit ACTIVE, prend les échéances du mois dont les intérêts
 * n'ont pas encore été payés et n'ont pas déjà été comptabilisés en accrual.
 * Crée un mouvement + écriture GL (D 2718 / C 7071) via executeWithLedger.
 */
export async function runInterestAccrual(targetDate?: Date): Promise<{
  processed: number;
  totalAmount: number;
  details: AccrualResult[];
}> {
  const now = targetDate || new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const periodeLabel = `${year}-${String(month + 1).padStart(2, '0')}`;

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

  logger.info({ periode: periodeLabel }, '[Interest Accrual] Démarrage comptabilisation intérêts courus');

  // Phase 1 : Identifier les crédits éligibles (requête légère, libérer la connexion vite)
  const client = await pool.connect();
  let rows: any[];

  try {
    const result = await client.query(`
      SELECT
        e.credit_id,
        c.numero_credit,
        c.client_id,
        c.agence_id,
        SUM(CAST(e.montant_interet AS DECIMAL)) as total_interet
      FROM echeances_credits e
      INNER JOIN credits c ON e.credit_id = c.id
      WHERE c.statut = 'ACTIVE'
        AND e.date_echeance >= $1
        AND e.date_echeance <= $2
        AND e.statut != 'PAID'
        AND e.accrual_posted IS NOT TRUE
      GROUP BY e.credit_id, c.numero_credit, c.client_id, c.agence_id
      HAVING SUM(CAST(e.montant_interet AS DECIMAL)) > 0
    `, [startOfMonth.toISOString(), endOfMonth.toISOString()]);

    rows = result.rows;
  } finally {
    client.release(); // Libérer avant la boucle — executeWithLedger gère ses propres transactions
  }

  if (rows.length === 0) {
    logger.info({ periode: periodeLabel }, '[Interest Accrual] Aucun intérêt à comptabiliser ce mois');
    return { processed: 0, totalAmount: 0, details: [] };
  }

  // Phase 2 : Pour chaque crédit, créer mouvement + écriture GL atomiquement
  const details: AccrualResult[] = [];
  let totalAmount = 0;

  for (const row of rows) {
    const montant = parseFloat(row.total_interet);
    if (montant <= 0) continue;

    try {
      const { mouvement } = await executeWithLedger(
        "CREDIT",
        {
          montant: montant.toString(),
          sens: "DEBIT", // Débit du compte 2718 (actif : intérêts à recevoir)
          typePaiement: "CREDIT_INTEREST_ACCRUAL",
          creditId: row.credit_id,
          clientId: row.client_id,
          agenceId: row.agence_id,
          requiresGlPosting: true,
          metadata: {
            periode: periodeLabel,
            accrualType: 'MONTHLY',
            numeroCredit: row.numero_credit,
          },
        },
        async (tx, mouvement) => {
          // Dans la même transaction : marquer les échéances comme comptabilisées
          await tx.execute(sql`
            UPDATE echeances_credits
            SET accrual_posted = true
            WHERE credit_id = ${row.credit_id}
              AND date_echeance >= ${startOfMonth.toISOString()}
              AND date_echeance <= ${endOfMonth.toISOString()}
              AND statut != 'PAID'
              AND accrual_posted IS NOT TRUE
          `);

          return { result: { creditId: row.credit_id, montant } };
        }
      );

      details.push({
        creditId: row.credit_id,
        numeroCredit: row.numero_credit,
        montantInterets: montant,
        periode: periodeLabel,
        mouvementId: mouvement.id,
        glStatus: (mouvement as any).glPostingStatus || 'UNKNOWN',
      });

      totalAmount += montant;

      logger.info({
        creditId: row.credit_id,
        numeroCredit: row.numero_credit,
        montant,
        mouvementId: mouvement.id,
        glStatus: (mouvement as any).glPostingStatus,
        periode: periodeLabel,
      }, '[Interest Accrual] Écriture GL créée (D 2718 / C 7071)');

    } catch (err) {
      // Un crédit en erreur ne bloque pas les suivants
      logger.error({
        creditId: row.credit_id,
        numeroCredit: row.numero_credit,
        error: err instanceof Error ? err.message : String(err),
      }, '[Interest Accrual] Erreur pour ce crédit — on continue avec les suivants');
    }
  }

  logger.info({
    periode: periodeLabel,
    nbCredits: details.length,
    totalAmount,
  }, '[Interest Accrual] Comptabilisation terminée');

  return { processed: details.length, totalAmount, details };
}

/**
 * Planifie l'exécution mensuelle de la comptabilisation des intérêts courus.
 * S'exécute le 1er de chaque mois à 2h00.
 */
export function startInterestAccrualCron() {
  logger.info('[Interest Accrual] Planification cron mensuel');

  // Vérifier toutes les 5 minutes si on est le 1er du mois à 2h
  setInterval(() => {
    const now = new Date();
    if (now.getDate() === 1 && now.getHours() === 2 && now.getMinutes() < 5) {
      runInterestAccrual().catch((error) => {
        logger.error({ error }, '[Interest Accrual] Erreur lors de l\'exécution planifiée');
      });
    }
  }, 5 * 60 * 1000);
}
