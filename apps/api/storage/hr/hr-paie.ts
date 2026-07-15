import { ModeCalculPaie, StatutBulletin, StatutPresence, StatutUser } from "@shared/enum/status-constants";
import {
  bankReconciliationLines,
  bankReconciliationSessions,
  bulletinsPaie,
  employes,
  InsertBulletinPaie,
  payrollBatchItems,
  payrollConfigHistory,
  payrollPaymentBatches,
  payrollTransferFiles,
  presences,
  users
} from "@shared/schema";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db";

// Bulletins
export async function getBulletins(employeId?: string) {
    if (employeId) {
        return await db.select().from(bulletinsPaie).where(eq(bulletinsPaie.employeId, employeId)).orderBy(desc(bulletinsPaie.mois));
    }
    return await db.select().from(bulletinsPaie).orderBy(desc(bulletinsPaie.mois));
}

// Gestion de la Paie
export async function createBulletinPaie(data: InsertBulletinPaie): Promise<any> {
    const [bulletin] = await db.insert(bulletinsPaie).values(data).returning();
    return bulletin;
}

export async function updateBulletinStatut(id: number, statut: string): Promise<any> {
    const [updated] = await db.update(bulletinsPaie)
        .set({ statut })
        .where(eq(bulletinsPaie.id, id))
        .returning();
    return updated;
}

export async function generateMonthlyPaie(mois: string, genereParId?: string): Promise<any[]> {
    // 1. Get all active employees with salary info from employes + users
    const employeesData = await db.select({
        employeId: employes.id,
        userId: users.id,
        nom: users.nom,
        prenom: users.prenom,
        salaireBase: employes.salaireBase,
        tauxHoraire: employes.tauxHoraire,
        tauxJournalier: employes.tauxJournalier,
        modeCalculPaie: employes.modeCalculPaie,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(eq(users.statut, StatutUser.ACTIVE));
    
    const results = [];

    // Parse month to get date range
    const [year, month] = mois.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    for (const emp of employeesData) {
        // Check if bulletin already exists
        const existing = await db.select().from(bulletinsPaie).where(
            and(eq(bulletinsPaie.employeId, emp.employeId), eq(bulletinsPaie.mois, mois))
        );
        
        if (existing.length > 0) continue; // Skip if exists

        // Fetch presences for the month
        const monthPresences = await db.select().from(presences).where(
            and(
                eq(presences.employeId, emp.employeId),
                gte(presences.date, startDate),
                lte(presences.date, endDate)
            )
        );

        let salaireBrut = 0;
        const modeCalcul = emp.modeCalculPaie || ModeCalculPaie.MONTHLY;

        if (modeCalcul === ModeCalculPaie.HOURLY) {
            // Calculate based on hours worked
            const totalMinutes = monthPresences.reduce((sum, p) => sum + (p.heuresTravaillees || 0), 0);
            const totalHours = totalMinutes / 60;
            const tauxHoraire = emp.tauxHoraire || 0;
            salaireBrut = Math.round(totalHours * tauxHoraire);

            // Overtime (1.5x rate)
            const overtimeMinutes = monthPresences.reduce((sum, p) => sum + (p.heuresSupplementaires || 0), 0);
            const overtimeHours = overtimeMinutes / 60;
            salaireBrut += Math.round(overtimeHours * tauxHoraire * 1.5);

        } else if (modeCalcul === ModeCalculPaie.DAILY) {
            // Calculate based on days present
            const joursPresents = monthPresences.filter(p => p.statut === StatutPresence.PRESENT || p.statut === StatutPresence.LATE).length;
            const tauxJournalier = emp.tauxJournalier || 0;
            salaireBrut = joursPresents * tauxJournalier;

        } else {
            // MONTHLY (fixed monthly salary)
            salaireBrut = emp.salaireBase || 0;
        }

        // Add transport allowance
        const transport = 50000;
        salaireBrut += transport;

        // Deductions
        const cnss = Math.round(salaireBrut * 0.05);
        const ipr = Math.round(salaireBrut * 0.15);
        const net = salaireBrut - cnss - ipr;

        const bulletinData: InsertBulletinPaie = {
            employeId: emp.employeId,
            employeNom: `${emp.nom} ${emp.prenom || ''}`,
            mois,
            salaireBaseSnapshot: salaireBrut - transport,
            salaireBrut: salaireBrut.toString(),
            totalChargesSalariales: cnss.toString(),
            irpp: ipr.toString(),
            totalRetenues: (cnss + ipr).toString(),
            salaireNet: net.toString(),
            totalChargesPatronales: Math.round(salaireBrut * 0.1).toString(),
            statut: StatutBulletin.DRAFT,
            genereParId: genereParId
        };
        
        const [bulletin] = await db.insert(bulletinsPaie).values(bulletinData).returning();
        results.push(bulletin);
    }
    
    return results;
}

// =============================================================================
// FICHIERS DE TRANSFERT DE PAIE
// =============================================================================

export async function getTransferFiles(runId: number) {
    return db.select().from(payrollTransferFiles).where(eq(payrollTransferFiles.payrollRunId, runId)).orderBy(desc(payrollTransferFiles.createdAt));
}

// =============================================================================
// LOTS DE PAIEMENT
// =============================================================================

export async function getPaymentBatches(runId: number) {
  return db.select()
    .from(payrollPaymentBatches)
    .where(eq(payrollPaymentBatches.payrollRunId, runId))
    .orderBy(asc(payrollPaymentBatches.bankName));
}

export async function getPaymentBatchById(batchId: string) {
  const [batch] = await db.select()
    .from(payrollPaymentBatches)
    .where(eq(payrollPaymentBatches.id, batchId));
  if (!batch) return null;

  const items = await db.select()
    .from(payrollBatchItems)
    .where(eq(payrollBatchItems.batchId, batchId))
    .orderBy(asc(payrollBatchItems.employeNom));

  return { ...batch, items };
}

// =============================================================================
// RAPPROCHEMENT BANCAIRE
// =============================================================================

export async function getReconciliationSessions(filter?: { period?: string; bankName?: string }) {
  let query = db.select()
    .from(bankReconciliationSessions)
    .orderBy(desc(bankReconciliationSessions.createdAt))
    .$dynamic();

  const conditions = [];
  if (filter?.period) conditions.push(eq(bankReconciliationSessions.period, filter.period));
  if (filter?.bankName) conditions.push(eq(bankReconciliationSessions.bankName, filter.bankName));
  if (conditions.length > 0) query = query.where(and(...conditions));

  return query;
}

export async function getReconciliationSessionById(sessionId: string) {
  const [session] = await db.select()
    .from(bankReconciliationSessions)
    .where(eq(bankReconciliationSessions.id, sessionId));
  if (!session) return null;

  const lines = await db.select()
    .from(bankReconciliationLines)
    .where(eq(bankReconciliationLines.sessionId, sessionId))
    .orderBy(asc(bankReconciliationLines.source), desc(bankReconciliationLines.montant));

  return { ...session, lines };
}

export async function updateReconciliationSessionStats(sessionId: string) {
  const lines = await db.select()
    .from(bankReconciliationLines)
    .where(eq(bankReconciliationLines.sessionId, sessionId));

  const transferLines = lines.filter(l => l.source === 'TRANSFER');
  const matchedLines = lines.filter(l => l.matchStatus === 'MATCHED');
  const unmatchedLines = lines.filter(l => l.matchStatus === 'UNMATCHED');

  const totalExpected = transferLines.reduce((s, l) => s + l.montant, 0);
  const totalMatched = matchedLines.reduce((s, l) => s + l.montant, 0);
  const totalUnmatched = unmatchedLines.reduce((s, l) => s + l.montant, 0);

  await db.update(bankReconciliationSessions)
    .set({
      totalExpected: totalExpected.toString(),
      totalMatched: totalMatched.toString(),
      totalUnmatched: totalUnmatched.toString(),
      matchedCount: matchedLines.length,
      unmatchedCount: unmatchedLines.length,
    })
    .where(eq(bankReconciliationSessions.id, sessionId));
}

// ─── Historique de Configuration de la Paie ─────────────────────────────────────────────────

export async function logPayrollConfigChange(data: {
  payrollConfigId: string;
  agenceId: string | null;
  changedBy: string;
  changeType: string;
  oldValues: any;
  newValues: any;
  reason?: string;
}): Promise<void> {
  await db.insert(payrollConfigHistory).values({
    payrollConfigId: data.payrollConfigId,
    agenceId: data.agenceId,
    changedBy: data.changedBy,
    changeType: data.changeType,
    oldValues: data.oldValues,
    newValues: data.newValues,
    reason: data.reason,
  });
}
