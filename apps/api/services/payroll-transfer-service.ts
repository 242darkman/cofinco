/**
 * Service de génération de fichiers de virement bancaire pour la paie
 * Génère des fichiers CSV format Congo-Brazzaville à partir des runs de paie
 */

import { db } from "../db";
import {
  bulletinsPaie,
  employes,
  payrollRuns,
  payrollTransferFiles,
  users,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("PayrollTransferService");

export interface TransferEntry {
  employeId: string;
  employeNom: string;
  bankName: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  accountKey: string;
  montantNet: number;
  reference: string;
}

export interface TransferPreviewResult {
  valid: TransferEntry[];
  invalid: Array<{
    employeId: string;
    employeNom: string;
    montantNet: number;
    errors: string[];
  }>;
  totalAmount: number;
  employeeCount: number;
}

/**
 * Récupère l'aperçu des virements pour un run (avant génération)
 */
export async function getTransferPreview(runId: number): Promise<TransferPreviewResult> {
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
  if (!run) throw new Error("Run de paie introuvable");

  // Récupérer les bulletins du run pour les employés payés par virement
  const bulletins = await db
    .select({
      bulletinId: bulletinsPaie.id,
      employeId: bulletinsPaie.employeId,
      salaireNet: bulletinsPaie.salaireNet,
      bankName: employes.bankName,
      bankCode: employes.bankCode,
      branchCode: employes.branchCode,
      bankAccountNumber: employes.bankAccountNumber,
      accountKey: employes.accountKey,
      paymentMethod: employes.paymentMethod,
      nom: users.nom,
      prenom: users.prenom,
    })
    .from(bulletinsPaie)
    .innerJoin(employes, eq(bulletinsPaie.employeId, employes.id))
    .innerJoin(users, eq(employes.userId, users.id))
    .where(
      and(
        eq(bulletinsPaie.payrollRunId, runId),
        eq(employes.paymentMethod, "TRANSFER")
      )
    );

  const valid: TransferEntry[] = [];
  const invalid: TransferPreviewResult["invalid"] = [];

  for (const b of bulletins) {
    const employeNom = `${b.nom} ${b.prenom || ""}`.trim();
    const montantNet = Number(b.salaireNet) || 0;
    const errors = validateBankDetails(b);

    if (errors.length === 0) {
      valid.push({
        employeId: b.employeId,
        employeNom,
        bankName: b.bankName!,
        bankCode: b.bankCode!,
        branchCode: b.branchCode!,
        accountNumber: b.bankAccountNumber!,
        accountKey: b.accountKey!,
        montantNet,
        reference: `Paie ${run.period} - ${employeNom}`,
      });
    } else {
      invalid.push({ employeId: b.employeId, employeNom, montantNet, errors });
    }
  }

  const totalAmount = valid.reduce((sum, e) => sum + e.montantNet, 0);

  return { valid, invalid, totalAmount, employeeCount: valid.length };
}

/**
 * Génère le fichier de virement CSV + bordereau récapitulatif
 */
export async function generateTransferFile(
  runId: number,
  userId: string
): Promise<{ fileId: string; csvContent: string; bordereauContent: string; warnings: string[] }> {
  const preview = await getTransferPreview(runId);
  const warnings: string[] = [];

  if (preview.valid.length === 0) {
    throw new Error("Aucun employé avec des coordonnées bancaires complètes pour ce run");
  }

  if (preview.invalid.length > 0) {
    warnings.push(
      `${preview.invalid.length} employé(s) exclu(s) : coordonnées bancaires incomplètes`
    );
  }

  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));

  // Générer le CSV
  const csvContent = buildTransferCsv(preview.valid);

  // Générer le bordereau
  const bordereauContent = buildBordereau(run!.period, preview.valid, preview.totalAmount);

  // Sauvegarder en base (sans MinIO pour l'instant - le contenu est retourné directement)
  const fileName = `virement_paie_${run!.period}_${Date.now()}.csv`;

  const [file] = await db
    .insert(payrollTransferFiles)
    .values({
      payrollRunId: runId,
      fileName,
      storageKey: `transfers/${runId}/${fileName}`,
      format: "CSV",
      employeeCount: preview.employeeCount,
      totalAmount: preview.totalAmount.toString(),
      generatedBy: userId,
    })
    .returning();

  logger.info(
    { runId, fileId: file.id, employees: preview.employeeCount, total: preview.totalAmount },
    "Fichier de virement généré"
  );

  return { fileId: file.id, csvContent, bordereauContent, warnings };
}

/**
 * Construit le contenu CSV du fichier de virement
 */
function buildTransferCsv(entries: TransferEntry[]): string {
  const header = "EMPLOYE;BANQUE;CODE_BANQUE;CODE_GUICHET;NUMERO_COMPTE;CLE_RIB;MONTANT_NET;REFERENCE";
  const lines = entries.map((e) =>
    [
      `"${e.employeNom}"`,
      `"${e.bankName}"`,
      e.bankCode,
      e.branchCode,
      e.accountNumber,
      e.accountKey,
      e.montantNet,
      `"${e.reference}"`,
    ].join(";")
  );
  return [header, ...lines].join("\n");
}

/**
 * Construit le bordereau récapitulatif
 */
function buildBordereau(period: string, entries: TransferEntry[], totalAmount: number): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR");

  // Récapitulatif par banque
  const byBank = new Map<string, { count: number; total: number }>();
  for (const e of entries) {
    const existing = byBank.get(e.bankName) || { count: 0, total: 0 };
    existing.count++;
    existing.total += e.montantNet;
    byBank.set(e.bankName, existing);
  }

  const bankLines = Array.from(byBank.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([bank, data]) => `  - ${bank}: ${data.count} employé(s), ${formatAmount(data.total)} FCFA`);

  return [
    "BORDEREAU DE VIREMENT",
    "=".repeat(40),
    "",
    `Période: ${period}`,
    `Date de génération: ${dateStr}`,
    "",
    `Nombre d'employés: ${entries.length}`,
    `Montant total: ${formatAmount(totalAmount)} FCFA`,
    "",
    "Détails par banque:",
    ...bankLines,
    "",
    "=".repeat(40),
    "Document généré automatiquement par MicroFlex",
  ].join("\n");
}

/**
 * Valide les coordonnées bancaires d'un employé
 */
function validateBankDetails(emp: {
  bankName: string | null;
  bankCode: string | null;
  branchCode: string | null;
  bankAccountNumber: string | null;
  accountKey: string | null;
}): string[] {
  const errors: string[] = [];
  if (!emp.bankName) errors.push("Nom de banque manquant");
  if (!emp.bankCode) errors.push("Code banque manquant");
  if (!emp.branchCode) errors.push("Code guichet manquant");
  if (!emp.bankAccountNumber) errors.push("Numéro de compte manquant");
  if (!emp.accountKey) errors.push("Clé RIB manquante");
  return errors;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount);
}

/**
 * Génère le fichier de virement au format XLSX (Excel)
 */
export async function generateTransferXlsx(
  runId: number,
  userId: string
): Promise<{ fileId: string; xlsxBuffer: Buffer; bordereauContent: string; warnings: string[] }> {
  const preview = await getTransferPreview(runId);
  const warnings: string[] = [];

  if (preview.valid.length === 0) {
    throw new Error("Aucun employé avec des coordonnées bancaires complètes pour ce run");
  }

  if (preview.invalid.length > 0) {
    warnings.push(
      `${preview.invalid.length} employé(s) exclu(s) : coordonnées bancaires incomplètes`
    );
  }

  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));

  // Fichier de virements construit avec ExcelJS
  const { default: ExcelJS } = await import("exceljs");

  const headers = ["Employé", "Banque", "Code Banque", "Code Guichet", "N° Compte", "Clé RIB", "Montant Net (FCFA)", "Référence"];
  const rows = preview.valid.map(e => [
    e.employeNom,
    e.bankName,
    e.bankCode,
    e.branchCode,
    e.accountNumber,
    e.accountKey,
    e.montantNet,
    e.reference,
  ]);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Virements");
  worksheet.addRow(headers);
  worksheet.getRow(1).font = { bold: true };
  for (const row of rows) worksheet.addRow(row);
  const columnWidths = [30, 20, 12, 12, 18, 8, 15, 35];
  columnWidths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
  const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

  // Bordereau
  const bordereauContent = buildBordereau(run!.period, preview.valid, preview.totalAmount);

  // Save record
  const fileName = `virement_paie_${run!.period}_${Date.now()}.xlsx`;
  const [file] = await db
    .insert(payrollTransferFiles)
    .values({
      payrollRunId: runId,
      fileName,
      storageKey: `transfers/${runId}/${fileName}`,
      format: "XLSX",
      employeeCount: preview.employeeCount,
      totalAmount: preview.totalAmount.toString(),
      generatedBy: userId,
    })
    .returning();

  logger.info(
    { runId, fileId: file.id, employees: preview.employeeCount, total: preview.totalAmount, format: "XLSX" },
    "Fichier de virement XLSX généré"
  );

  return { fileId: file.id, xlsxBuffer, bordereauContent, warnings };
}

/**
 * Crée des batches de paiement groupés par banque à partir d'un run de paie
 */
export async function createPaymentBatches(
  runId: number,
  transferFileId: string | null,
  userId: string
): Promise<{ batchCount: number; totalAmount: number }> {
  const preview = await getTransferPreview(runId);

  if (preview.valid.length === 0) {
    throw new Error("Aucun employé éligible au virement pour ce run");
  }

  // Group by bank
  const byBank = new Map<string, TransferEntry[]>();
  for (const entry of preview.valid) {
    const existing = byBank.get(entry.bankName) || [];
    existing.push(entry);
    byBank.set(entry.bankName, existing);
  }

  const { payrollPaymentBatches, payrollBatchItems } = await import("@shared/schema");

  let totalAmount = 0;
  let batchCount = 0;

  for (const [bankName, entries] of byBank) {
    const bankTotal = entries.reduce((sum, e) => sum + e.montantNet, 0);
    totalAmount += bankTotal;

    // Create batch
    const [batch] = await db
      .insert(payrollPaymentBatches)
      .values({
        payrollRunId: runId,
        transferFileId: transferFileId || undefined,
        bankName,
        statut: "GENERATED",
        employeeCount: entries.length,
        totalAmount: bankTotal.toString(),
      })
      .returning();

    // Create batch items
    await db.insert(payrollBatchItems).values(
      entries.map(e => ({
        batchId: batch.id,
        employeId: e.employeId,
        employeNom: e.employeNom,
        bankCode: e.bankCode,
        branchCode: e.branchCode,
        accountNumber: e.accountNumber,
        accountKey: e.accountKey,
        montantNet: e.montantNet,
        statut: "PENDING",
      }))
    );

    batchCount++;
  }

  logger.info(
    { runId, batchCount, totalAmount },
    "Payment batches créés"
  );

  return { batchCount, totalAmount };
}
