/**
 * Salary Payment Service
 * Orchestrateur des paiements salaires (CASH, MOBILE_MONEY, TRANSFER, CHECK)
 *
 * Responsabilités :
 * - Création de jobs de paiement (batch)
 * - Routage par méthode de paiement
 * - GL per-bulletin selon la méthode
 * - Callbacks webhook (SUCCESS/FAILED)
 * - Retry logic
 * - Confirmation manuelle (TRANSFER/CHECK)
 * - Annulation
 */

import { db } from "../db";
import { eq, and, or, inArray, isNull, sql, lte, desc } from "drizzle-orm";
import {
  salaryPaymentJobs,
  bulletinsPaie,
  payrollRuns,
  employes,
  users,
  paymentIntents,
  payrollConfig,
  BulletinStatus,
  SalaryPaymentJobStatus,
  PaymentExecutionMode,
  PayrollRunStatus,
  type SalaryPaymentJob,
} from "@shared/schema";
import { createLogger } from "../lib/logger";
import { postEntry } from "./accounting-posting-service";
import { currencyCode } from "@shared/config/currency";
import { normalizePhone } from "@shared/utils/phone";

const logger = createLogger("SalaryPaymentService");

// Retry backoff: 1min, 5min, 15min
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000];

// ============================================================================
// TYPES
// ============================================================================

interface CreateJobsInput {
  runId: number;
  bulletins: {
    bulletinId: number;
    employeId: string;
    paymentMethod: string;
    salaireNet: number;
    employeNom?: string;
    employePrenom?: string;
    msisdn?: string;
  }[];
  executionMode: "IMMEDIATE" | "SCHEDULED";
  scheduledAt?: Date;
  agenceId?: string;
  userId: string;
}

interface CreateJobsResult {
  cashJobs: SalaryPaymentJob[];
  momoJobs: SalaryPaymentJob[];
  manualJobs: SalaryPaymentJob[];
  total: number;
}

// ============================================================================
// JOB CREATION (batch)
// ============================================================================

/**
 * Crée les salary_payment_jobs pour un ensemble de bulletins.
 * Idempotent : si un job actif existe déjà pour un bulletin, il est ignoré.
 */
export async function createPaymentJobs(input: CreateJobsInput): Promise<CreateJobsResult> {
  const { runId, bulletins, executionMode, scheduledAt, agenceId, userId } = input;
  const result: CreateJobsResult = { cashJobs: [], momoJobs: [], manualJobs: [], total: 0 };

  for (const b of bulletins) {
    const idempotencyKey = `salary-pay-${b.bulletinId}-${runId}-${Date.now()}`;

    // Vérifier qu'il n'existe pas de job actif pour ce bulletin
    const [existingJob] = await db
      .select({ id: salaryPaymentJobs.id })
      .from(salaryPaymentJobs)
      .where(
        and(
          eq(salaryPaymentJobs.bulletinId, b.bulletinId),
          sql`${salaryPaymentJobs.status} NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED')`
        )
      )
      .limit(1);

    if (existingJob) {
      logger.info({ bulletinId: b.bulletinId }, "Job actif existant, ignoré");
      continue;
    }

    const initialStatus = executionMode === "SCHEDULED"
      ? SalaryPaymentJobStatus.SCHEDULED
      : SalaryPaymentJobStatus.QUEUED;

    const [job] = await db.insert(salaryPaymentJobs).values({
      bulletinId: b.bulletinId,
      payrollRunId: runId,
      employeId: b.employeId,
      agenceId: agenceId || null,
      paymentMethod: b.paymentMethod,
      executionMode,
      scheduledAt: scheduledAt || null,
      amount: b.salaireNet.toString(),
      currency: currencyCode(),
      status: initialStatus,
      msisdn: b.msisdn || null,
      idempotencyKey,
      createdBy: userId,
      metadata: {
        employeNom: b.employeNom,
        employePrenom: b.employePrenom,
      },
    }).returning();

    // Mettre à jour le statut du bulletin
    const bulletinStatus = executionMode === "SCHEDULED"
      ? BulletinStatus.SCHEDULED
      : b.paymentMethod === "CASH"
        ? BulletinStatus.PENDING_CAISSE
        : BulletinStatus.PAYOUT_PENDING;

    await db
      .update(bulletinsPaie)
      .set({ statut: bulletinStatus })
      .where(eq(bulletinsPaie.id, b.bulletinId));

    // Catégoriser
    if (b.paymentMethod === "CASH") {
      result.cashJobs.push(job);
    } else if (b.paymentMethod === "MOBILE_MONEY") {
      result.momoJobs.push(job);
    } else {
      result.manualJobs.push(job);
    }
    result.total++;
  }

  return result;
}

// ============================================================================
// JOB PROCESSING (appelé par le cron ou directement)
// ============================================================================

/**
 * Traite un job QUEUED selon sa méthode de paiement.
 */
export async function processQueuedJob(job: SalaryPaymentJob): Promise<void> {
  const method = job.paymentMethod;

  try {
    switch (method) {
      case "CASH":
        await processCashJob(job);
        break;
      case "MOBILE_MONEY":
        await processMobileMoneyJob(job);
        break;
      case "TRANSFER":
      case "CHECK":
        await processManualJob(job);
        break;
      default:
        logger.error({ jobId: job.id, method }, "Méthode de paiement inconnue");
        await markJobFailed(job.id, "UNKNOWN_METHOD", `Méthode inconnue: ${method}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error({ jobId: job.id, err: error }, "Erreur traitement job");
    await markJobFailed(job.id, "PROCESSING_ERROR", msg);
  }
}

/**
 * CASH : Crée une demande dans la file caisse.
 * Le bulletin est déjà en PENDING_CAISSE.
 * Quand le caissier valide, processSalaryPayment() marquera PAID.
 */
async function processCashJob(job: SalaryPaymentJob): Promise<void> {
  const { createCaisseRequest } = await import("./caisse-queue-service");

  const amount = Number(job.amount);
  if (amount <= 0) {
    await markJobFailed(job.id, "ZERO_AMOUNT", "Montant nul ou négatif");
    return;
  }

  const metadata = job.metadata as Record<string, unknown> | null;

  const request = await createCaisseRequest({
    category: "SALARY_PAYMENT",
    direction: "OUT",
    agenceId: job.agenceId!,
    sourceType: "bulletin_paie",
    sourceId: String(job.bulletinId),
    employeeId: job.employeId,
    montant: amount,
    label: `Salaire ${metadata?.employeNom || ""} ${metadata?.employePrenom || ""}`.trim(),
    description: `Paiement salaire — ${amount.toLocaleString("fr-FR")} ${currencyCode()}`,
    metadata: {
      payrollRunId: job.payrollRunId,
      salaryPaymentJobId: job.id,
    },
    createdBy: job.createdBy || undefined,
  });

  // Lier la caisse request au job et passer en PROCESSING
  await db.update(salaryPaymentJobs).set({
    status: SalaryPaymentJobStatus.PROCESSING,
    caisseRequestId: request.id,
    processedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(salaryPaymentJobs.id, job.id));

  logger.info({ jobId: job.id, caisseRequestId: request.id }, "Caisse request créée");
}

/**
 * MOBILE_MONEY : Crée un payment intent via PaymentService.initiatePayout().
 * Le webhook pawaPay appellera handlePayoutSuccess/handlePayoutFailure.
 */
async function processMobileMoneyJob(job: SalaryPaymentJob): Promise<void> {
  const { paymentService } = await import("./mobile-money/payment-service");
  const { resolveOperatorFromPhone, operatorToCorrespondent } = await import("./mobile-money/providers/pawapay/pawapay-config");

  const amount = Number(job.amount);
  const phone = normalizePhone(job.msisdn) || job.msisdn;

  if (!phone) {
    await markJobFailed(job.id, "MISSING_MSISDN", "Numéro Mobile Money non renseigné");
    await db.update(bulletinsPaie)
      .set({ statut: BulletinStatus.PAYMENT_FAILED })
      .where(eq(bulletinsPaie.id, job.bulletinId));
    return;
  }

  // Résoudre l'opérateur
  let operator = job.operator as "MTN" | "AIRTEL" | null;
  let correspondent = job.correspondent;

  if (!operator) {
    // Résoudre via l'API predict correspondent (inclut fallback local)
    try {
      const { default: PawaPayProvider } = await import("./mobile-money/providers/pawapay/pawapay-provider");
      const { providerRegistry } = await import("./mobile-money/provider-registry");
      const pawaPayProvider = providerRegistry.getPawaPay() as InstanceType<typeof PawaPayProvider>;
      correspondent = await pawaPayProvider.predictCorrespondent(phone);
      if (correspondent) {
        const { correspondentToOperator } = await import("./mobile-money/providers/pawapay/pawapay-config");
        operator = correspondentToOperator(correspondent);
      }
    } catch (err) {
      logger.warn({ jobId: job.id, err }, "Predict correspondent indisponible");
    }

    if (!operator) {
      const resolved = resolveOperatorFromPhone(phone);
      if (!resolved) {
        await markJobFailed(job.id, "OPERATOR_RESOLUTION_FAILED", `Impossible de détecter l'opérateur pour ${maskPhone(phone)}`);
        await db.update(bulletinsPaie)
          .set({ statut: BulletinStatus.PAYMENT_FAILED })
          .where(eq(bulletinsPaie.id, job.bulletinId));
        return;
      }
      operator = resolved;
      correspondent = operatorToCorrespondent(operator);
    }
  }

  const metadata = job.metadata as Record<string, unknown> | null;

  // Lire la config frais MM (agence-specific d'abord, fallback global)
  const [feeConfig] = await db.select({ mmSalaryFeeOption: payrollConfig.mmSalaryFeeOption })
    .from(payrollConfig)
    .where(and(
      eq(payrollConfig.isActive, true),
      or(
        job.agenceId ? eq(payrollConfig.agenceId, job.agenceId) : isNull(payrollConfig.agenceId),
        isNull(payrollConfig.agenceId),
      ),
    ))
    .orderBy(desc(payrollConfig.agenceId)) // agence-specific en premier
    .limit(1);

  const mmFeeOption = feeConfig?.mmSalaryFeeOption || "COMPANY_ABSORBS";
  const feeOption = mmFeeOption === "EMPLOYEE_PAYS" ? "FEES_DEDUCTED" as const : undefined;

  // Stocker le feeOption sur le job
  await db.update(salaryPaymentJobs).set({ feeOption: mmFeeOption })
    .where(eq(salaryPaymentJobs.id, job.id));

  try {
    const intent = await paymentService.initiatePayout({
      provider: operator,
      amount,
      phone,
      clientId: "", // Pas de client — paiement salaire employé
      agenceId: job.agenceId || undefined,
      description: `Salaire ${metadata?.employeNom || ""} ${metadata?.employePrenom || ""}`.trim(),
      idempotencyKey: `salary-momo-${job.id}`,
      feeOption,
      metadata: {
        useCase: "SALARY_PAYOUT",
        jobId: job.id,
        bulletinId: job.bulletinId,
        payrollRunId: job.payrollRunId,
        employeId: job.employeId,
      },
    }, job.createdBy || undefined);

    // Mettre à jour le job avec les infos de l'intent
    await db.update(salaryPaymentJobs).set({
      status: SalaryPaymentJobStatus.PROCESSING,
      operator,
      correspondent: correspondent || undefined,
      paymentIntentId: intent.id,
      processedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(salaryPaymentJobs.id, job.id));

    // Bulletin → PAYOUT_PROCESSING
    await db.update(bulletinsPaie)
      .set({ statut: BulletinStatus.PAYOUT_PROCESSING })
      .where(eq(bulletinsPaie.id, job.bulletinId));

    logger.info({ jobId: job.id, intentId: intent.id, operator }, "Payout Mobile Money initié");
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await markJobFailed(job.id, "PAYOUT_INITIATION_FAILED", msg);
    await db.update(bulletinsPaie)
      .set({ statut: BulletinStatus.PAYMENT_FAILED })
      .where(eq(bulletinsPaie.id, job.bulletinId));
  }
}

/**
 * TRANSFER/CHECK : Passe immédiatement en PROCESSING (en attente de confirmation manuelle).
 */
async function processManualJob(job: SalaryPaymentJob): Promise<void> {
  await db.update(salaryPaymentJobs).set({
    status: SalaryPaymentJobStatus.PROCESSING,
    processedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(salaryPaymentJobs.id, job.id));

  await db.update(bulletinsPaie)
    .set({ statut: BulletinStatus.PAYOUT_PROCESSING })
    .where(eq(bulletinsPaie.id, job.bulletinId));

  logger.info({ jobId: job.id, method: job.paymentMethod }, "Job en attente de confirmation manuelle");
}

// ============================================================================
// CALLBACKS (webhook, caisse validation)
// ============================================================================

/**
 * Appelé quand le payout Mobile Money est confirmé SUCCESS par le webhook pawaPay.
 * Marque le bulletin PAID, poste le GL, vérifie si le run est complet.
 */
export async function handlePayoutSuccess(jobId: string, mouvementId: string): Promise<void> {
  const [job] = await db.select().from(salaryPaymentJobs).where(eq(salaryPaymentJobs.id, jobId));
  if (!job) {
    logger.warn({ jobId }, "handlePayoutSuccess: job introuvable");
    return;
  }

  if (job.status === SalaryPaymentJobStatus.SUCCEEDED) {
    logger.info({ jobId }, "handlePayoutSuccess: job déjà SUCCEEDED (idempotent)");
    return;
  }

  // Récupérer les frais depuis le payment_intent (rempli par le webhook pawaPay)
  let intentFeeAmount: string | null = null;
  let intentMontantNet: string | null = null;
  if (job.paymentIntentId) {
    const [intent] = await db.select({
      feeAmount: paymentIntents.feeAmount,
      montantNet: paymentIntents.montantNet,
    }).from(paymentIntents).where(eq(paymentIntents.id, job.paymentIntentId));
    if (intent) {
      intentFeeAmount = intent.feeAmount;
      intentMontantNet = intent.montantNet;
    }
  }

  await db.transaction(async (tx) => {
    // 1. Marquer le job SUCCEEDED + stocker les frais
    await tx.update(salaryPaymentJobs).set({
      status: SalaryPaymentJobStatus.SUCCEEDED,
      mouvementId,
      feeAmount: intentFeeAmount,
      montantNet: intentMontantNet || job.amount,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(salaryPaymentJobs.id, jobId));

    // 2. Marquer le bulletin PAID
    await tx.update(bulletinsPaie).set({
      statut: BulletinStatus.PAID,
      datePaiement: new Date().toISOString().split("T")[0],
      paiementMouvementId: mouvementId,
    }).where(eq(bulletinsPaie.id, job.bulletinId));
  });

  // 3. Poster GL per-bulletin (hors transaction pour idempotence)
  if (job.agenceId) {
    try {
      const ecritureId = await postSalaryPaymentGL(job);
      if (ecritureId) {
        await db.update(salaryPaymentJobs).set({ ecritureId }).where(eq(salaryPaymentJobs.id, jobId));
        await db.update(bulletinsPaie).set({ paiementEcritureId: ecritureId }).where(eq(bulletinsPaie.id, job.bulletinId));
      }
    } catch (err) {
      logger.error({ jobId, err }, "Erreur GL per-bulletin (non-bloquant)");
    }
  }

  // 4. Vérifier si le run est complet
  await checkAndFinalizeRun(job.payrollRunId, job.createdBy || "system");

  // 5. Broadcast WebSocket
  broadcastSalaryPaymentUpdate(job, "SUCCEEDED");

  logger.info({ jobId, bulletinId: job.bulletinId }, "Payout salary SUCCESS");
}

/**
 * Appelé quand le payout Mobile Money échoue (webhook pawaPay FAILED).
 * Programme un retry si possible.
 */
export async function handlePayoutFailure(jobId: string, errorCode: string, errorMessage: string): Promise<void> {
  const [job] = await db.select().from(salaryPaymentJobs).where(eq(salaryPaymentJobs.id, jobId));
  if (!job) {
    logger.warn({ jobId }, "handlePayoutFailure: job introuvable");
    return;
  }

  if (job.status === SalaryPaymentJobStatus.SUCCEEDED) {
    logger.warn({ jobId }, "handlePayoutFailure: job déjà SUCCEEDED, ignoré");
    return;
  }

  const newRetryCount = job.retryCount + 1;
  const canRetry = newRetryCount < job.maxRetries;

  if (canRetry) {
    const delayMs = RETRY_DELAYS_MS[Math.min(newRetryCount - 1, RETRY_DELAYS_MS.length - 1)];
    const nextRetryAt = new Date(Date.now() + delayMs);

    await db.update(salaryPaymentJobs).set({
      status: SalaryPaymentJobStatus.FAILED,
      failureCode: errorCode,
      failureReason: errorMessage,
      retryCount: newRetryCount,
      nextRetryAt,
      updatedAt: new Date(),
    }).where(eq(salaryPaymentJobs.id, jobId));

    logger.info({ jobId, retryCount: newRetryCount, nextRetryAt }, "Payout FAILED, retry programmé");
  } else {
    await markJobFailed(jobId, errorCode, errorMessage);
  }

  // Bulletin → PAYMENT_FAILED
  await db.update(bulletinsPaie)
    .set({ statut: BulletinStatus.PAYMENT_FAILED })
    .where(eq(bulletinsPaie.id, job.bulletinId));

  broadcastSalaryPaymentUpdate(job, "FAILED");
}

/**
 * Appelé quand le caissier valide un paiement CASH.
 * Invoqué depuis processSalaryPayment() dans caisse-queue-service.
 */
export async function handleCaisseValidation(bulletinId: number, mouvementId: string): Promise<void> {
  const [job] = await db.select().from(salaryPaymentJobs)
    .where(
      and(
        eq(salaryPaymentJobs.bulletinId, bulletinId),
        eq(salaryPaymentJobs.status, SalaryPaymentJobStatus.PROCESSING)
      )
    )
    .limit(1);

  if (!job) {
    // Pas de job — c'est un paiement legacy (avant la refonte), on laisse passer
    logger.info({ bulletinId }, "Pas de salary_payment_job trouvé pour la validation caisse (legacy)");
    return;
  }

  await db.update(salaryPaymentJobs).set({
    status: SalaryPaymentJobStatus.SUCCEEDED,
    mouvementId,
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(salaryPaymentJobs.id, job.id));

  // Vérifier si le run est complet
  await checkAndFinalizeRun(job.payrollRunId, job.createdBy || "system");

  broadcastSalaryPaymentUpdate(job, "SUCCEEDED");

  logger.info({ jobId: job.id, bulletinId }, "Caisse validation → job SUCCEEDED");
}

// ============================================================================
// MANUAL CONFIRMATION (TRANSFER / CHECK)
// ============================================================================

/**
 * Confirme manuellement le paiement pour les méthodes TRANSFER/CHECK.
 * Marque le job SUCCEEDED, le bulletin PAID, et poste le GL.
 */
export async function confirmManualPayment(
  jobIds: string[],
  userId: string,
  reference?: string
): Promise<{ succeeded: number; errors: string[] }> {
  const errors: string[] = [];
  let succeeded = 0;

  for (const jobId of jobIds) {
    try {
      const [job] = await db.select().from(salaryPaymentJobs).where(eq(salaryPaymentJobs.id, jobId));

      if (!job) {
        errors.push(`Job ${jobId} introuvable`);
        continue;
      }

      if (job.status !== SalaryPaymentJobStatus.PROCESSING) {
        errors.push(`Job ${jobId} n'est pas en PROCESSING (statut: ${job.status})`);
        continue;
      }

      if (job.paymentMethod !== "TRANSFER" && job.paymentMethod !== "CHECK") {
        errors.push(`Job ${jobId}: méthode ${job.paymentMethod} ne supporte pas la confirmation manuelle`);
        continue;
      }

      await db.transaction(async (tx) => {
        await tx.update(salaryPaymentJobs).set({
          status: SalaryPaymentJobStatus.SUCCEEDED,
          processedBy: userId,
          completedAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            ...(job.metadata as Record<string, unknown> || {}),
            confirmationReference: reference,
            confirmedBy: userId,
            confirmedAt: new Date().toISOString(),
          },
        }).where(eq(salaryPaymentJobs.id, jobId));

        await tx.update(bulletinsPaie).set({
          statut: BulletinStatus.PAID,
          datePaiement: new Date().toISOString().split("T")[0],
        }).where(eq(bulletinsPaie.id, job.bulletinId));
      });

      // GL per-bulletin
      if (job.agenceId) {
        try {
          const ecritureId = await postSalaryPaymentGL(job);
          if (ecritureId) {
            await db.update(salaryPaymentJobs).set({ ecritureId }).where(eq(salaryPaymentJobs.id, jobId));
            await db.update(bulletinsPaie).set({ paiementEcritureId: ecritureId }).where(eq(bulletinsPaie.id, job.bulletinId));
          }
        } catch (err) {
          logger.error({ jobId, err }, "Erreur GL confirmation manuelle");
        }
      }

      await checkAndFinalizeRun(job.payrollRunId, userId);
      broadcastSalaryPaymentUpdate(job, "SUCCEEDED");
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      errors.push(`Job ${jobId}: ${msg}`);
    }
  }

  return { succeeded, errors };
}

// ============================================================================
// RETRY & CANCEL
// ============================================================================

/**
 * Relance un ou plusieurs jobs FAILED.
 */
export async function retryJobs(jobIds: string[], userId: string): Promise<{ queued: number; errors: string[] }> {
  const errors: string[] = [];
  let queued = 0;

  for (const jobId of jobIds) {
    const [job] = await db.select().from(salaryPaymentJobs).where(eq(salaryPaymentJobs.id, jobId));
    if (!job) { errors.push(`Job ${jobId} introuvable`); continue; }
    if (job.status !== SalaryPaymentJobStatus.FAILED) { errors.push(`Job ${jobId} n'est pas en FAILED`); continue; }

    await db.update(salaryPaymentJobs).set({
      status: SalaryPaymentJobStatus.QUEUED,
      failureCode: null,
      failureReason: null,
      nextRetryAt: null,
      // Nouveau idempotency key pour le retry
      idempotencyKey: `salary-pay-${job.bulletinId}-retry-${Date.now()}`,
      updatedAt: new Date(),
    }).where(eq(salaryPaymentJobs.id, jobId));

    // Remettre le bulletin en état d'attente
    const bulletinStatus = job.paymentMethod === "CASH"
      ? BulletinStatus.PENDING_CAISSE
      : BulletinStatus.PAYOUT_PENDING;

    await db.update(bulletinsPaie)
      .set({ statut: bulletinStatus })
      .where(eq(bulletinsPaie.id, job.bulletinId));

    queued++;
  }

  return { queued, errors };
}

/**
 * Annule un ou plusieurs jobs (CREATED, SCHEDULED, QUEUED, FAILED).
 * Remet le bulletin en VALIDATED.
 */
export async function cancelJobs(jobIds: string[], userId: string): Promise<{ cancelled: number; errors: string[] }> {
  const errors: string[] = [];
  let cancelled = 0;
  const cancellableStatuses = [
    SalaryPaymentJobStatus.CREATED,
    SalaryPaymentJobStatus.SCHEDULED,
    SalaryPaymentJobStatus.QUEUED,
    SalaryPaymentJobStatus.FAILED,
  ];

  for (const jobId of jobIds) {
    const [job] = await db.select().from(salaryPaymentJobs).where(eq(salaryPaymentJobs.id, jobId));
    if (!job) { errors.push(`Job ${jobId} introuvable`); continue; }
    if (!cancellableStatuses.includes(job.status as any)) {
      errors.push(`Job ${jobId} ne peut pas être annulé (statut: ${job.status})`);
      continue;
    }

    await db.update(salaryPaymentJobs).set({
      status: SalaryPaymentJobStatus.CANCELLED,
      processedBy: userId,
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...(job.metadata as Record<string, unknown> || {}),
        cancelledBy: userId,
        cancelledAt: new Date().toISOString(),
      },
    }).where(eq(salaryPaymentJobs.id, jobId));

    // Remettre le bulletin en VALIDATED
    await db.update(bulletinsPaie)
      .set({ statut: BulletinStatus.VALIDATED })
      .where(eq(bulletinsPaie.id, job.bulletinId));

    cancelled++;
  }

  return { cancelled, errors };
}

// ============================================================================
// GL POSTING PER-BULLETIN
// ============================================================================

/**
 * Poste l'écriture GL de paiement pour un bulletin individuel.
 * D 4211 (Personnel rémunérations dues) / C {compte trésorerie}
 */
async function postSalaryPaymentGL(job: SalaryPaymentJob): Promise<string | null> {
  const amount = Number(job.amount);
  if (amount <= 0) return null;

  const { resolveAccount } = await getHrAccountingHelpers();

  const debitAccount = await resolveAccount("4211");
  if (!debitAccount) {
    logger.error({ jobId: job.id }, "Compte 4211 introuvable");
    return null;
  }

  let creditAccountNum: string;
  let journalCode: string;

  switch (job.paymentMethod) {
    case "CASH":
      creditAccountNum = "521";
      journalCode = "CAI";
      break;
    case "MOBILE_MONEY":
      creditAccountNum = job.operator === "AIRTEL" ? "5782" : "5781";
      journalCode = "OD";
      break;
    case "TRANSFER":
    case "CHECK":
    default:
      creditAccountNum = "521";
      journalCode = "BNQ";
      break;
  }

  const creditAccount = await resolveAccount(creditAccountNum);
  if (!creditAccount) {
    logger.error({ jobId: job.id, account: creditAccountNum }, "Compte crédit introuvable");
    return null;
  }

  const metadata = job.metadata as Record<string, unknown> | null;
  const employeLabel = `${metadata?.employeNom || ""} ${metadata?.employePrenom || ""}`.trim();

  try {
    const result = await postEntry({
      agenceId: job.agenceId!,
      sourceType: "SALARY_PAYMENT",
      sourceId: `salary-job-${job.id}`,
      journalCode,
      entryDate: new Date(),
      description: `Paiement salaire ${employeLabel} — ${job.paymentMethod}`,
      lines: [
        {
          compteId: debitAccount.id,
          numeroCompte: "4211",
          libelle: `Personnel rémun. dues — ${employeLabel}`,
          debit: amount,
          credit: 0,
        },
        {
          compteId: creditAccount.id,
          numeroCompte: creditAccountNum,
          libelle: `${job.paymentMethod === "CASH" ? "Caisse" : job.paymentMethod === "MOBILE_MONEY" ? `Mobile Money ${job.operator}` : "Banque"} — Salaire ${employeLabel}`,
          debit: 0,
          credit: amount,
        },
      ],
      metadata: {
        salaryPaymentJobId: job.id,
        bulletinId: job.bulletinId,
        payrollRunId: job.payrollRunId,
        employeId: job.employeId,
        paymentMethod: job.paymentMethod,
        operator: job.operator,
        type: "SALARY_PAYMENT",
      },
      userId: job.processedBy || job.createdBy || "system",
    });

    logger.info({ jobId: job.id, ecritureId: result.ecritureId }, "GL salary payment posté");
    return result.ecritureId;
  } catch (err) {
    logger.error({ jobId: job.id, err }, "Échec GL salary payment");
    return null;
  }
}

/**
 * Lazy-load resolveAccount from hr-accounting-service to avoid circular deps.
 */
async function getHrAccountingHelpers() {
  const { planComptable } = await import("@shared/schema");
  return {
    resolveAccount: async (accountNumber: string) => {
      const [account] = await db
        .select({ id: planComptable.id, numeroCompte: planComptable.numeroCompte })
        .from(planComptable)
        .where(eq(planComptable.numeroCompte, accountNumber))
        .limit(1);
      return account || null;
    },
  };
}

// ============================================================================
// RUN FINALIZATION
// ============================================================================

/**
 * Vérifie si tous les bulletins d'un run sont PAID et finalise le run.
 */
export async function checkAndFinalizeRun(runId: number, userId: string): Promise<boolean> {
  // Compter les bulletins non-PAID et non-CANCELLED du run
  const [counts] = await db
    .select({
      total: sql<number>`count(*)`,
      paid: sql<number>`count(*) filter (where ${bulletinsPaie.statut} = 'PAID')`,
      cancelled: sql<number>`count(*) filter (where ${bulletinsPaie.cancelled} = true)`,
    })
    .from(bulletinsPaie)
    .where(eq(bulletinsPaie.payrollRunId, runId));

  const activeTotal = Number(counts.total) - Number(counts.cancelled);
  const paidCount = Number(counts.paid);

  if (activeTotal > 0 && paidCount >= activeTotal) {
    // Tous les bulletins actifs sont PAID → finaliser le run
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (run && run.status !== PayrollRunStatus.PAID) {
      await db.update(payrollRuns).set({
        status: PayrollRunStatus.PAID,
        paidBy: userId,
        paidAt: new Date(),
      }).where(eq(payrollRuns.id, runId));

      logger.info({ runId, paidCount, activeTotal }, "Run finalisé → PAID");
      return true;
    }
  }

  return false;
}

// ============================================================================
// SCHEDULED JOBS (appelé par le cron)
// ============================================================================

/**
 * Récupère et active les jobs SCHEDULED arrivés à échéance.
 */
export async function activateScheduledJobs(): Promise<number> {
  const now = new Date();
  const jobs = await db.select().from(salaryPaymentJobs)
    .where(
      and(
        eq(salaryPaymentJobs.status, SalaryPaymentJobStatus.SCHEDULED),
        lte(salaryPaymentJobs.scheduledAt, now)
      )
    );

  for (const job of jobs) {
    await db.update(salaryPaymentJobs).set({
      status: SalaryPaymentJobStatus.QUEUED,
      updatedAt: new Date(),
    }).where(eq(salaryPaymentJobs.id, job.id));

    // Mettre à jour le bulletin
    const bulletinStatus = job.paymentMethod === "CASH"
      ? BulletinStatus.PENDING_CAISSE
      : BulletinStatus.PAYOUT_PENDING;

    await db.update(bulletinsPaie)
      .set({ statut: bulletinStatus })
      .where(eq(bulletinsPaie.id, job.bulletinId));
  }

  if (jobs.length > 0) {
    logger.info({ count: jobs.length }, "Jobs SCHEDULED activés → QUEUED");
  }

  return jobs.length;
}

/**
 * Récupère les jobs FAILED éligibles au retry.
 */
export async function getRetryableJobs(): Promise<SalaryPaymentJob[]> {
  const now = new Date();
  return db.select().from(salaryPaymentJobs)
    .where(
      and(
        eq(salaryPaymentJobs.status, SalaryPaymentJobStatus.FAILED),
        sql`${salaryPaymentJobs.retryCount} < ${salaryPaymentJobs.maxRetries}`,
        lte(salaryPaymentJobs.nextRetryAt, now)
      )
    );
}

/**
 * Récupère les jobs QUEUED à traiter.
 */
export async function getQueuedJobs(): Promise<SalaryPaymentJob[]> {
  return db.select().from(salaryPaymentJobs)
    .where(eq(salaryPaymentJobs.status, SalaryPaymentJobStatus.QUEUED));
}

/**
 * Liste les jobs d'un run avec leurs statuts.
 */
export async function getJobsByRunId(runId: number) {
  const rows = await db
    .select({
      id: salaryPaymentJobs.id,
      bulletinId: salaryPaymentJobs.bulletinId,
      payrollRunId: salaryPaymentJobs.payrollRunId,
      employeId: salaryPaymentJobs.employeId,
      paymentMethod: salaryPaymentJobs.paymentMethod,
      executionMode: salaryPaymentJobs.executionMode,
      scheduledAt: salaryPaymentJobs.scheduledAt,
      amount: salaryPaymentJobs.amount,
      status: salaryPaymentJobs.status,
      failureReason: salaryPaymentJobs.failureReason,
      failureCode: salaryPaymentJobs.failureCode,
      retryCount: salaryPaymentJobs.retryCount,
      maxRetries: salaryPaymentJobs.maxRetries,
      operator: salaryPaymentJobs.operator,
      correspondent: salaryPaymentJobs.correspondent,
      feeOption: salaryPaymentJobs.feeOption,
      feeAmount: salaryPaymentJobs.feeAmount,
      montantNet: salaryPaymentJobs.montantNet,
      createdAt: salaryPaymentJobs.createdAt,
      completedAt: salaryPaymentJobs.completedAt,
      employeNom: sql<string>`COALESCE(${users.nom}, '') || ' ' || COALESCE(${users.prenom}, '')`.as("employe_nom"),
      bulletinStatut: bulletinsPaie.statut,
    })
    .from(salaryPaymentJobs)
    .leftJoin(employes, eq(salaryPaymentJobs.employeId, employes.id))
    .leftJoin(users, eq(employes.userId, users.id))
    .leftJoin(bulletinsPaie, eq(salaryPaymentJobs.bulletinId, bulletinsPaie.id))
    .where(eq(salaryPaymentJobs.payrollRunId, runId))
    .orderBy(salaryPaymentJobs.createdAt);

  return rows;
}

// ============================================================================
// HELPERS
// ============================================================================

async function markJobFailed(jobId: string, code: string, reason: string): Promise<void> {
  const [job] = await db.select().from(salaryPaymentJobs).where(eq(salaryPaymentJobs.id, jobId));
  if (!job) return;

  const newRetryCount = job.retryCount + 1;
  await db.update(salaryPaymentJobs).set({
    status: SalaryPaymentJobStatus.FAILED,
    failureCode: code,
    failureReason: reason,
    retryCount: newRetryCount,
    updatedAt: new Date(),
  }).where(eq(salaryPaymentJobs.id, jobId));
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return phone.slice(0, 3) + "****" + phone.slice(-2);
}

function broadcastSalaryPaymentUpdate(job: SalaryPaymentJob, action: string): void {
  try {
    const { getWsInstance } = require("../ws-server");
    const ws = getWsInstance();
    if (ws) {
      ws.broadcast({
        type: "HR_UPDATE",
        payload: {
          entity: "salary_payment",
          action,
          id: job.id,
          extra: {
            bulletinId: job.bulletinId,
            payrollRunId: job.payrollRunId,
            status: action === "SUCCEEDED" ? SalaryPaymentJobStatus.SUCCEEDED : SalaryPaymentJobStatus.FAILED,
            paymentMethod: job.paymentMethod,
          },
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch {
    // Non-critique
  }
}
