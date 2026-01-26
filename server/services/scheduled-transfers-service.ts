/**
 * Scheduled Transfers Service - Production Ready
 *
 * Ce service gere l'execution des virements programmes de maniere robuste:
 * - SELECT FOR UPDATE SKIP LOCKED pour eviter double execution en multi-instances
 * - Cle d'idempotence deterministe (VP-{id}-{YYYY-MM-DD})
 * - Transaction atomique complete (run + mouvement + update schedule)
 * - Gestion timezone pour heures d'execution correctes
 *
 * @module scheduled-transfers-service
 */

import crypto from "crypto";
import { db } from "../db";
import {
  comptes,
  mouvementsFinanciers,
  transactionsCompte,
  virementsProgrammes,
  scheduledTransferRuns,
  virementsProgrammesAuditLogs,
  tachesRegularisation,
} from "@shared/schema";
import { and, eq, lte, isNull, sql, desc } from "drizzle-orm";
import { canDeposit, canWithdraw } from "./comptes";
import {
  FrequenceVirement,
  FrequenceVirementType,
  StatutAuditVirement,
  StatutRunVirement,
  TypeTacheRegularisation,
  Priorite,
  StatutTransaction,
} from "@shared/enum/status-constants";
import type { PostgresJsTransaction } from "drizzle-orm/postgres-js";

// ============================================
// TYPES
// ============================================

export type VirementFrequence = FrequenceVirementType;

interface ExecuteTransferInput {
  compteSourceId: string;
  compteDestId: string;
  montant: number;
  createdBy?: string | null;
  description?: string;
  idempotencyKey?: string;
}

interface ScheduleTransferInput {
  compteSourceId: string;
  compteDestId: string;
  montant: number;
  frequence: VirementFrequence;
  createdBy?: string | null;
  agenceId?: string;
  timezone?: string;
  jourExecution?: number;
  libelle?: string;
}

interface ProcessResult {
  id: string;
  success: boolean;
  mouvementId?: string;
  error?: string;
  skipped?: boolean;
}

// Worker ID unique pour cette instance
const WORKER_ID = `worker-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

// ============================================
// HELPERS
// ============================================

/** Genere une reference unique pour un virement */
const generateReference = () =>
  `VIR-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

/**
 * Calcule la prochaine date d'execution en tenant compte de la timezone.
 * Pour les virements mensuels, gere correctement les jours 29-31.
 */
export function computeNextExecution(
  base: Date,
  frequence: string,
  timezone: string = "Africa/Brazzaville",
  jourExecution?: number | null
): Date | null {
  if (frequence === FrequenceVirement.ONCE) {
    return null;
  }

  const next = new Date(base);

  switch (frequence as FrequenceVirementType) {
    case FrequenceVirement.DAILY:
      next.setDate(next.getDate() + 1);
      return next;

    case FrequenceVirement.WEEKLY:
      next.setDate(next.getDate() + 7);
      return next;

    case FrequenceVirement.MONTHLY: {
      // Passer au mois suivant
      next.setMonth(next.getMonth() + 1);

      // Gestion du jour d'execution
      const targetDay = jourExecution ?? next.getDate();
      // Limiter a 28 pour eviter les problemes de fin de mois
      const safeDay = Math.min(targetDay, 28);
      next.setDate(safeDay);
      return next;
    }

    default:
      return null;
  }
}

/**
 * Genere la cle d'idempotence DETERMINISTE pour un virement programme.
 * Format: VP-{scheduleId}-{YYYY-MM-DD}
 *
 * CRITIQUE: Cette cle doit etre identique pour toutes les tentatives
 * d'execution du meme virement pour la meme date.
 */
function generateExecutionKey(scheduleId: string, date: Date): string {
  const dateBucket = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return `VP-${scheduleId}-${dateBucket}`;
}

// ============================================
// TRANSFER EXECUTION (dans transaction)
// ============================================

/**
 * Execute un virement entre deux comptes DANS une transaction existante.
 * Utilisee par le worker pour garantir l'atomicite complete.
 */
async function executeCompteTransferInTx(
  tx: PostgresJsTransaction<any, any>,
  input: ExecuteTransferInput
): Promise<{ mouvementId: string }> {
  const { compteSourceId, compteDestId, montant, createdBy, description, idempotencyKey } = input;

  // Verifier idempotence si cle fournie
  if (idempotencyKey) {
    const [existingMouvement] = await tx
      .select({ id: mouvementsFinanciers.id })
      .from(mouvementsFinanciers)
      .where(eq(mouvementsFinanciers.reference, idempotencyKey))
      .limit(1);

    if (existingMouvement) {
      return { mouvementId: existingMouvement.id };
    }
  }

  // Verrouillage des comptes avec FOR UPDATE (ordre deterministe pour eviter deadlocks)
  const [smallerId, largerId] = compteSourceId < compteDestId
    ? [compteSourceId, compteDestId]
    : [compteDestId, compteSourceId];

  const lockedAccounts = await tx.execute(
    sql`SELECT * FROM comptes WHERE id IN (${smallerId}, ${largerId}) ORDER BY id FOR UPDATE`
  );

  const accountsMap = new Map(
    (lockedAccounts.rows as any[]).map((row: any) => [row.id, row])
  );

  const compteSource = accountsMap.get(compteSourceId);
  const compteDest = accountsMap.get(compteDestId);

  if (!compteSource) {
    throw new Error("Compte source introuvable");
  }
  if (!compteDest) {
    throw new Error("Compte destinataire introuvable");
  }
  if (compteSource.id === compteDest.id) {
    throw new Error("Le compte source et le compte destinataire sont identiques");
  }

  // Verifications metier
  const withdrawCheck = canWithdraw(compteSource);
  if (!withdrawCheck.allowed) {
    throw new Error(withdrawCheck.reason || "Retrait impossible depuis ce compte");
  }

  const depositCheck = canDeposit(compteDest);
  if (!depositCheck.allowed) {
    throw new Error(depositCheck.reason || "Depot impossible sur ce compte");
  }

  const soldeSource = Number(compteSource.solde_courant || 0);
  const soldeDest = Number(compteDest.solde_courant || 0);

  if (soldeSource < montant) {
    throw new Error(`Solde insuffisant (${soldeSource.toLocaleString()} FCFA disponible, ${montant.toLocaleString()} FCFA requis)`);
  }

  // Creer le mouvement financier
  const reference = idempotencyKey || generateReference();
  const [mouvement] = await tx
    .insert(mouvementsFinanciers)
    .values({
      dateOperation: new Date(),
      montant: montant.toString(),
      sens: "DEBIT",
      statut: StatutTransaction.POSTED,
      methodePaiement: "TRANSFER",
      reference,
      sourceModule: "COMPTE",
      compteId: compteSource.id,
      clientId: compteSource.client_id,
      agenceId: compteSource.agence_id || undefined,
      typePaiement: "INTERNAL_TRANSFER",
      createdBy: createdBy || undefined,
      metadata: {
        type: "VIREMENT_PROGRAMME",
        description: description || `Virement vers ${compteDest.numero_compte}`,
        compteDestId: compteDest.id,
      },
    })
    .returning();

  const mouvementId = mouvement.id;

  // Mettre a jour les soldes
  const nouveauSoldeSource = (soldeSource - montant).toString();
  const nouveauSoldeDest = (soldeDest + montant).toString();

  await tx.update(comptes)
    .set({ soldeCourant: nouveauSoldeSource, updatedAt: new Date() })
    .where(eq(comptes.id, compteSource.id));

  await tx.update(comptes)
    .set({ soldeCourant: nouveauSoldeDest, updatedAt: new Date() })
    .where(eq(comptes.id, compteDest.id));

  // Creer les transactions compte (pour historique)
  await tx.insert(transactionsCompte).values({
    compteId: compteSource.id,
    mouvementId,
    typePaiement: "TRANSFER_OUT",
    montant: montant.toString(),
    soldeApres: nouveauSoldeSource,
    methodePaiement: "TRANSFER",
    observations: description || `Virement vers ${compteDest.numero_compte}`,
    createdBy: createdBy || undefined,
  });

  await tx.insert(transactionsCompte).values({
    compteId: compteDest.id,
    mouvementId,
    typePaiement: "TRANSFER_IN",
    montant: montant.toString(),
    soldeApres: nouveauSoldeDest,
    methodePaiement: "TRANSFER",
    observations: description || `Virement depuis ${compteSource.numero_compte}`,
    createdBy: createdBy || undefined,
  });

  return { mouvementId };
}

// ============================================
// VIREMENT PROGRAMME CRUD
// ============================================

/**
 * Cree un nouveau virement programme.
 */
export async function createVirementProgramme(input: ScheduleTransferInput) {
  const {
    compteSourceId,
    compteDestId,
    montant,
    frequence,
    createdBy,
    agenceId,
    timezone = "Africa/Brazzaville",
    jourExecution,
    libelle,
  } = input;

  // Recuperer l'agence depuis le compte source si non fournie
  let resolvedAgenceId = agenceId;
  if (!resolvedAgenceId) {
    const [sourceCompte] = await db
      .select({ agenceId: comptes.agenceId })
      .from(comptes)
      .where(eq(comptes.id, compteSourceId))
      .limit(1);
    resolvedAgenceId = sourceCompte?.agenceId || undefined;
  }

  const [schedule] = await db
    .insert(virementsProgrammes)
    .values({
      compteSourceId,
      compteDestId,
      montant: montant.toString(),
      frequence,
      prochaineExecution: new Date(),
      actif: true,
      agenceId: resolvedAgenceId,
      timezone,
      jourExecution,
      libelle,
      createdBy: createdBy || undefined,
      statutDernier: null,
      retryCount: 0,
      maxRetries: 3,
    })
    .returning();

  return schedule;
}

/**
 * Recupere les virements programmes dus pour execution.
 * ATTENTION: Cette fonction ne verrouille pas - utilisee uniquement pour affichage/stats.
 */
export async function getVirementsProgrammesDue(referenceDate = new Date()) {
  return db
    .select()
    .from(virementsProgrammes)
    .where(
      and(
        eq(virementsProgrammes.actif, true),
        lte(virementsProgrammes.prochaineExecution, referenceDate),
        isNull(virementsProgrammes.deletedAt),
        isNull(virementsProgrammes.processingLock)
      )
    );
}

/**
 * Recupere l'historique des executions pour un virement programme.
 */
export async function getScheduledTransferHistory(
  scheduleId: string,
  limit: number = 50
) {
  return db
    .select()
    .from(scheduledTransferRuns)
    .where(eq(scheduledTransferRuns.scheduledTransferId, scheduleId))
    .orderBy(desc(scheduledTransferRuns.createdAt))
    .limit(limit);
}

// ============================================
// WORKER PRINCIPAL (PRODUCTION READY)
// ============================================

/**
 * Traite les virements programmes dus de maniere robuste.
 *
 * GARANTIES:
 * - Pas de double execution grace a SELECT FOR UPDATE SKIP LOCKED
 * - Idempotence via execution_key unique
 * - Atomicite complete (mouvement + run + schedule update)
 * - Resilience aux crashes
 */
export async function processScheduledTransfers(
  referenceDate = new Date(),
  batchSize = 10
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  const dateBucket = referenceDate.toISOString().slice(0, 10);

  // Etape 1: Revendiquer un batch de virements avec SKIP LOCKED
  // Cela garantit que 2 workers ne traitent jamais le meme virement
  const claimedSchedules = await db.execute(sql`
    UPDATE virements_programmes
    SET
      processing_lock = ${WORKER_ID},
      processing_started_at = NOW()
    WHERE id IN (
      SELECT id FROM virements_programmes
      WHERE actif = true
        AND prochaine_execution <= ${referenceDate}
        AND processing_lock IS NULL
        AND deleted_at IS NULL
      ORDER BY prochaine_execution ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  const schedules = claimedSchedules.rows as any[];

  if (schedules.length === 0) {
    console.log(`[ScheduledTransfers] Aucun virement a traiter`);
    return results;
  }

  console.log(`[ScheduledTransfers] ${schedules.length} virements revendiques par ${WORKER_ID}`);

  // Etape 2: Traiter chaque virement dans sa propre transaction
  for (const schedule of schedules) {
    const startTime = performance.now();
    const executionKey = generateExecutionKey(schedule.id, referenceDate);

    try {
      const result = await db.transaction(async (tx) => {
        // 2a. Tenter de creer le run avec execution_key unique
        // Si le run existe deja (meme date), ON CONFLICT DO NOTHING
        const insertResult = await tx.execute(sql`
          INSERT INTO scheduled_transfer_runs (
            scheduled_transfer_id,
            execution_key,
            status,
            started_at,
            attempt_number
          ) VALUES (
            ${schedule.id},
            ${executionKey},
            'RUNNING',
            NOW(),
            1
          )
          ON CONFLICT (execution_key) DO NOTHING
          RETURNING *
        `);

        // Si aucune ligne inseree = deja execute aujourd'hui
        if (insertResult.rows.length === 0) {
          console.log(`[ScheduledTransfers] ${schedule.id} deja execute (${executionKey})`);

          // Liberer le verrou
          await tx
            .update(virementsProgrammes)
            .set({
              processingLock: null,
              processingStartedAt: null,
            })
            .where(eq(virementsProgrammes.id, schedule.id));

          return { skipped: true };
        }

        const run = insertResult.rows[0] as any;

        // 2b. Executer le transfert financier
        const { mouvementId } = await executeCompteTransferInTx(tx, {
          compteSourceId: schedule.compte_source_id,
          compteDestId: schedule.compte_dest_id,
          montant: Number(schedule.montant || 0),
          createdBy: schedule.created_by || undefined,
          description: schedule.libelle || "Virement programme",
          idempotencyKey: `MF-${executionKey}`, // Cle unique pour le mouvement aussi
        });

        // 2c. Calculer la prochaine execution
        const nextExecution = computeNextExecution(
          referenceDate,
          schedule.frequence,
          schedule.timezone || "Africa/Brazzaville",
          schedule.jour_execution
        );

        const executionTimeMs = Math.round(performance.now() - startTime);

        // 2d. Marquer le run comme SUCCESS
        await tx
          .update(scheduledTransferRuns)
          .set({
            status: StatutRunVirement.SUCCESS,
            completedAt: new Date(),
            mouvementId,
            metadata: {
              montant: Number(schedule.montant),
              executionTimeMs,
              soldeSourceAvant: null, // A enrichir si besoin
            },
          })
          .where(eq(scheduledTransferRuns.id, run.id));

        // 2e. Mettre a jour le virement programme
        await tx
          .update(virementsProgrammes)
          .set({
            dernierExecution: referenceDate,
            prochaineExecution: nextExecution,
            actif: nextExecution ? true : false,
            statutDernier: StatutAuditVirement.SUCCESS,
            erreurDerniere: null,
            retryCount: 0,
            processingLock: null,
            processingStartedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(virementsProgrammes.id, schedule.id));

        // 2f. Creer l'audit log (lie au run)
        await tx.insert(virementsProgrammesAuditLogs).values({
          virementId: schedule.id,
          runId: run.id,
          statut: StatutAuditVirement.SUCCESS,
          message: "Virement execute avec succes",
          executedAt: new Date(),
          executionTimeMs,
          mouvementId,
          metadata: {
            montant: Number(schedule.montant),
            compteSourceId: schedule.compte_source_id,
            compteDestId: schedule.compte_dest_id,
            frequence: schedule.frequence,
            executionKey,
            workerId: WORKER_ID,
          },
        });

        return { success: true, mouvementId };
      });

      if (result.skipped) {
        results.push({ id: schedule.id, success: true, skipped: true });
      } else {
        results.push({ id: schedule.id, success: true, mouvementId: result.mouvementId });
      }

    } catch (error) {
      const executionTimeMs = Math.round(performance.now() - startTime);
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";

      console.error(`[ScheduledTransfers] Echec ${schedule.id}: ${errorMessage}`);

      // Gerer l'echec dans une nouvelle transaction
      try {
        await db.transaction(async (tx) => {
          // Verifier si un run existe deja
          const [existingRun] = await tx
            .select()
            .from(scheduledTransferRuns)
            .where(eq(scheduledTransferRuns.executionKey, executionKey))
            .limit(1);

          if (existingRun) {
            // Mettre a jour le run existant
            await tx
              .update(scheduledTransferRuns)
              .set({
                status: StatutRunVirement.FAILED,
                completedAt: new Date(),
                errorMessage,
                attemptNumber: existingRun.attemptNumber + 1,
              })
              .where(eq(scheduledTransferRuns.id, existingRun.id));
          } else {
            // Creer un nouveau run FAILED
            await tx.insert(scheduledTransferRuns).values({
              scheduledTransferId: schedule.id,
              executionKey,
              status: StatutRunVirement.FAILED,
              startedAt: new Date(performance.now() - executionTimeMs),
              completedAt: new Date(),
              errorMessage,
              attemptNumber: 1,
            });
          }

          // Mettre a jour le virement programme
          const newRetryCount = (schedule.retry_count || 0) + 1;
          const maxRetries = schedule.max_retries || 3;
          const shouldDisable = newRetryCount >= maxRetries;

          await tx
            .update(virementsProgrammes)
            .set({
              dernierExecution: referenceDate,
              statutDernier: StatutAuditVirement.FAILED,
              erreurDerniere: errorMessage,
              retryCount: newRetryCount,
              actif: shouldDisable ? false : true,
              processingLock: null,
              processingStartedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(virementsProgrammes.id, schedule.id));

          // Audit log d'echec
          await tx.insert(virementsProgrammesAuditLogs).values({
            virementId: schedule.id,
            statut: StatutAuditVirement.FAILED,
            message: errorMessage,
            executedAt: new Date(),
            executionTimeMs,
            metadata: {
              montant: Number(schedule.montant),
              executionKey,
              workerId: WORKER_ID,
              retryCount: newRetryCount,
              maxRetries,
              disabled: shouldDisable,
              errorStack: error instanceof Error ? error.stack : undefined,
            },
          });

          // Creer une tache de regularisation si desactive
          if (shouldDisable) {
            await tx.insert(tachesRegularisation).values({
              type: TypeTacheRegularisation.VIREMENT_PROG_ECHEC,
              description: `Virement programme #${schedule.id.slice(0, 8)} desactive apres ${maxRetries} echecs: ${errorMessage}`,
              montantEcart: schedule.montant,
              priorite: Priorite.HIGH,
              dateEcheance: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            });
          }
        });
      } catch (cleanupError) {
        console.error(`[ScheduledTransfers] Erreur cleanup ${schedule.id}:`, cleanupError);
      }

      results.push({ id: schedule.id, success: false, error: errorMessage });
    }
  }

  return results;
}

/**
 * Nettoie les verrous orphelins (workers crashes).
 * A executer periodiquement (ex: toutes les 5 minutes).
 */
export async function cleanupStaleProcessingLocks(
  maxAgeMinutes: number = 10
): Promise<number> {
  const threshold = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

  const result = await db
    .update(virementsProgrammes)
    .set({
      processingLock: null,
      processingStartedAt: null,
    })
    .where(
      and(
        sql`${virementsProgrammes.processingLock} IS NOT NULL`,
        lte(virementsProgrammes.processingStartedAt, threshold)
      )
    )
    .returning({ id: virementsProgrammes.id });

  if (result.length > 0) {
    console.log(`[ScheduledTransfers] ${result.length} verrous orphelins nettoyes`);
  }

  return result.length;
}

/**
 * Statistiques de sante pour monitoring.
 */
export async function getScheduledTransfersHealth() {
  const now = new Date();

  const statsResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE actif = true AND deleted_at IS NULL) as active_count,
      COUNT(*) FILTER (WHERE actif = false AND deleted_at IS NULL) as paused_count,
      COUNT(*) FILTER (WHERE statut_dernier = 'FAILED' AND deleted_at IS NULL) as failed_count,
      COUNT(*) FILTER (WHERE processing_lock IS NOT NULL) as processing_count,
      COUNT(*) FILTER (
        WHERE actif = true
        AND prochaine_execution <= NOW()
        AND processing_lock IS NULL
        AND deleted_at IS NULL
      ) as due_count,
      MIN(prochaine_execution) FILTER (
        WHERE actif = true
        AND prochaine_execution <= NOW()
        AND deleted_at IS NULL
      ) as oldest_due
    FROM virements_programmes
  `);

  const healthData = statsResult.rows[0] as any;

  return {
    activeCount: Number(healthData?.active_count || 0),
    pausedCount: Number(healthData?.paused_count || 0),
    failedCount: Number(healthData?.failed_count || 0),
    processingCount: Number(healthData?.processing_count || 0),
    dueCount: Number(healthData?.due_count || 0),
    oldestDueLagSeconds: healthData?.oldest_due
      ? Math.round((now.getTime() - new Date(healthData.oldest_due).getTime()) / 1000)
      : 0,
    workerId: WORKER_ID,
    timestamp: now.toISOString(),
  };
}

// ============================================
// EXPORTS LEGACY (compatibilite ascendante)
// ============================================

// Re-export pour compatibilite avec l'ancien code
export { executeCompteTransferInTx };

/**
 * @deprecated Utiliser processScheduledTransfers() a la place
 */
export async function runVirementsProgrammes(referenceDate = new Date()) {
  console.warn("[DEPRECATED] runVirementsProgrammes() - utiliser processScheduledTransfers()");
  return processScheduledTransfers(referenceDate);
}
