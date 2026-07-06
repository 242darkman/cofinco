/**
 * Lettrage Service — Account Reconciliation for Tier Accounts
 *
 * Provides manual and automatic matching (lettrage) of debit/credit lines
 * on tier accounts (class 4: 411xxx, 401xxx).
 * Also provides balance âgée (aging analysis) for unmatched lines.
 */

import { db } from "../db";
import { eq, and, sql, isNull, inArray, gte, lte } from "drizzle-orm";
import { lignesEcritures, ecritures, planComptable, EntryStatus } from "@shared/schema";
import { createLogger } from "../lib/logger";

const logger = createLogger('LettrageService');

// ============================================================================
// TYPES
// ============================================================================

export interface LettrageResult {
  lettrageKey: string;
  totalDebit: number;
  totalCredit: number;
  lignesCount: number;
}

export interface BalanceAgeeEntry {
  tranche: string;
  joursMin: number;
  joursMax: number | null;
  nbLignes: number;
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

export interface LigneNonLettree {
  id: string;
  ecritureId: string;
  dateEcriture: string;
  numeroPiece: string;
  libelle: string;
  debit: number;
  credit: number;
  numeroCompte: string;
  refExterne: string | null;
  metadata: Record<string, unknown> | null;
}

// ============================================================================
// LETTRAGE MANUEL
// ============================================================================

/**
 * Match (lettrer) a set of entry lines.
 * All lines must be on the same account, and total debit must equal total credit.
 */
export async function lettrerLignes(
  ligneIds: string[],
  userId: string,
): Promise<LettrageResult> {
  if (ligneIds.length < 2) {
    throw new Error('Au moins 2 lignes sont nécessaires pour le lettrage');
  }

  return db.transaction(async (tx) => {
    // 1. Fetch all lines
    const lignes = await tx
      .select({
        id: lignesEcritures.id,
        compteId: lignesEcritures.compteId,
        numeroCompte: lignesEcritures.numeroCompte,
        debit: lignesEcritures.debit,
        credit: lignesEcritures.credit,
        lettrageKey: lignesEcritures.lettrageKey,
      })
      .from(lignesEcritures)
      .where(inArray(lignesEcritures.id, ligneIds));

    if (lignes.length !== ligneIds.length) {
      throw new Error(`${ligneIds.length - lignes.length} ligne(s) non trouvée(s)`);
    }

    // 2. Check all lines are on the same account
    const compteIds = new Set(lignes.map(l => l.compteId));
    if (compteIds.size > 1) {
      throw new Error('Toutes les lignes doivent être sur le même compte');
    }

    // 3. Check account is a tier account (class 4)
    const numeroCompte = lignes[0].numeroCompte;
    if (!isTierAccount(numeroCompte)) {
      throw new Error(`Le compte ${numeroCompte} n'est pas un compte de tiers (classe 4)`);
    }

    // 4. Check no line is already matched
    const alreadyMatched = lignes.filter(l => l.lettrageKey);
    if (alreadyMatched.length > 0) {
      throw new Error(`${alreadyMatched.length} ligne(s) déjà lettrée(s)`);
    }

    // 5. Verify balance (debit == credit within tolerance)
    const totalDebit = lignes.reduce((s, l) => s + parseFloat(l.debit), 0);
    const totalCredit = lignes.reduce((s, l) => s + parseFloat(l.credit), 0);
    if (Math.abs(totalDebit - totalCredit) > 1) {
      throw new Error(
        `Le lettrage n'est pas équilibré : débit=${totalDebit.toFixed(2)}, crédit=${totalCredit.toFixed(2)} (écart=${Math.abs(totalDebit - totalCredit).toFixed(2)})`
      );
    }

    // 6. Generate next lettrage key for this account
    const lettrageKey = await getNextLettrageKey(tx, numeroCompte);

    // 7. Update all lines
    const now = new Date().toISOString().split("T")[0];
    await tx
      .update(lignesEcritures)
      .set({
        lettrageKey,
        lettrageDate: now,
        lettrageUserId: userId,
      })
      .where(inArray(lignesEcritures.id, ligneIds));

    logger.info({ lettrageKey, lignesCount: ligneIds.length, compte: numeroCompte }, 'Lignes lettrées');

    return { lettrageKey, totalDebit, totalCredit, lignesCount: ligneIds.length };
  });
}

// ============================================================================
// DE-LETTRAGE
// ============================================================================

/**
 * Remove matching (dé-lettrer) for a given lettrage key.
 */
export async function delettrerLignes(
  lettrageKey: string,
  compteId: string,
): Promise<{ count: number }> {
  const result = await db
    .update(lignesEcritures)
    .set({
      lettrageKey: null,
      lettrageDate: null,
      lettrageUserId: null,
    })
    .where(
      and(
        eq(lignesEcritures.lettrageKey, lettrageKey),
        eq(lignesEcritures.compteId, compteId),
      )
    )
    .returning({ id: lignesEcritures.id });

  logger.info({ lettrageKey, count: result.length }, 'Lignes dé-lettrées');
  return { count: result.length };
}

// ============================================================================
// LETTRAGE AUTOMATIQUE
// ============================================================================

/**
 * Automatically match debit/credit lines with the same amount on a tier account.
 * Groups by clientId (from metadata) when available.
 */
export async function autoLettrage(
  compteId: string,
  agenceId: string,
  userId: string,
): Promise<{ matched: number; keys: string[] }> {
  // 1. Get all unmatched lines for this account
  const unmatched = await db
    .select({
      id: lignesEcritures.id,
      debit: lignesEcritures.debit,
      credit: lignesEcritures.credit,
      numeroCompte: lignesEcritures.numeroCompte,
      metadata: ecritures.metadata,
    })
    .from(lignesEcritures)
    .innerJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
    .where(
      and(
        eq(lignesEcritures.compteId, compteId),
        isNull(lignesEcritures.lettrageKey),
        eq(ecritures.agenceId, agenceId),
        eq(ecritures.statut, EntryStatus.POSTED),
      )
    );

  if (unmatched.length < 2) {
    return { matched: 0, keys: [] };
  }

  // 2. Group by clientId (from metadata) for better matching
  const debitLines = unmatched.filter(l => parseFloat(l.debit) > 0);
  const creditLines = unmatched.filter(l => parseFloat(l.credit) > 0);

  let totalMatched = 0;
  const keys: string[] = [];
  const usedIds = new Set<string>();

  // 3. Match exact amounts
  for (const debitLine of debitLines) {
    if (usedIds.has(debitLine.id)) continue;
    const debitAmount = parseFloat(debitLine.debit);
    const debitClientId = (debitLine.metadata as Record<string, unknown>)?.clientId;

    // Find matching credit with same amount (prefer same client)
    const match = creditLines.find(cl => {
      if (usedIds.has(cl.id)) return false;
      const creditAmount = parseFloat(cl.credit);
      if (Math.abs(debitAmount - creditAmount) > 0.01) return false;
      // Prefer same client match
      const creditClientId = (cl.metadata as Record<string, unknown>)?.clientId;
      return debitClientId && creditClientId ? debitClientId === creditClientId : true;
    });

    if (match) {
      try {
        const result = await lettrerLignes([debitLine.id, match.id], userId);
        usedIds.add(debitLine.id);
        usedIds.add(match.id);
        totalMatched += 2;
        keys.push(result.lettrageKey);
      } catch {
        // Skip if lettrage fails (shouldn't happen with valid pairs)
      }
    }
  }

  logger.info({ compteId, matched: totalMatched, keys: keys.length }, 'Auto-lettrage completed');
  return { matched: totalMatched, keys };
}

// ============================================================================
// LIGNES NON LETTREES
// ============================================================================

/**
 * Get all unmatched lines for a tier account.
 */
export async function getLignesNonLettrees(
  compteId: string,
  agenceId: string,
): Promise<LigneNonLettree[]> {
  const rows = await db
    .select({
      id: lignesEcritures.id,
      ecritureId: lignesEcritures.ecritureId,
      dateEcriture: ecritures.dateEcriture,
      numeroPiece: ecritures.numeroPiece,
      libelle: lignesEcritures.libelle,
      debit: lignesEcritures.debit,
      credit: lignesEcritures.credit,
      numeroCompte: lignesEcritures.numeroCompte,
      refExterne: lignesEcritures.refExterne,
      metadata: ecritures.metadata,
    })
    .from(lignesEcritures)
    .innerJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
    .where(
      and(
        eq(lignesEcritures.compteId, compteId),
        isNull(lignesEcritures.lettrageKey),
        eq(ecritures.agenceId, agenceId),
        eq(ecritures.statut, EntryStatus.POSTED),
      )
    )
    .orderBy(ecritures.dateEcriture);

  return rows.map(r => ({
    id: r.id,
    ecritureId: r.ecritureId,
    dateEcriture: r.dateEcriture,
    numeroPiece: r.numeroPiece,
    libelle: r.libelle || '',
    debit: parseFloat(r.debit),
    credit: parseFloat(r.credit),
    numeroCompte: r.numeroCompte,
    refExterne: r.refExterne,
    metadata: r.metadata as Record<string, unknown> | null,
  }));
}

// ============================================================================
// BALANCE AGEE
// ============================================================================

const TRANCHES = [
  { label: '0-30 jours', min: 0, max: 30 },
  { label: '31-60 jours', min: 31, max: 60 },
  { label: '61-90 jours', min: 61, max: 90 },
  { label: 'Plus de 90 jours', min: 91, max: null },
];

/**
 * Get aging analysis for unmatched lines on a tier account.
 */
export async function getBalanceAgee(
  compteId: string,
  agenceId: string,
  dateReference?: Date,
): Promise<BalanceAgeeEntry[]> {
  const refDate = dateReference || new Date();
  const refDateStr = refDate.toISOString().split("T")[0];

  // Get all unmatched lines with their age
  const rows = await db.execute(sql`
    SELECT
      le.id,
      le.debit::numeric AS debit,
      le.credit::numeric AS credit,
      ec.date_ecriture,
      (${refDateStr}::date - ec.date_ecriture::date) AS jours
    FROM lignes_ecritures le
    JOIN ecritures_comptables ec ON le.ecriture_id = ec.id
    WHERE le.compte_id = ${compteId}
      AND le.lettrage_key IS NULL
      AND ec.agence_id = ${agenceId}
      AND ec.statut = 'POSTED'
    ORDER BY ec.date_ecriture
  `);

  const result: BalanceAgeeEntry[] = TRANCHES.map(t => ({
    tranche: t.label,
    joursMin: t.min,
    joursMax: t.max,
    nbLignes: 0,
    totalDebit: 0,
    totalCredit: 0,
    solde: 0,
  }));

  for (const row of rows.rows as Array<{ debit: string; credit: string; jours: number }>) {
    const jours = Number(row.jours);
    const debit = parseFloat(row.debit || '0');
    const credit = parseFloat(row.credit || '0');

    const tranche = result.find(t => {
      if (t.joursMax === null) return jours >= t.joursMin;
      return jours >= t.joursMin && jours <= t.joursMax;
    });

    if (tranche) {
      tranche.nbLignes++;
      tranche.totalDebit += debit;
      tranche.totalCredit += credit;
      tranche.solde += debit - credit;
    }
  }

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function isTierAccount(numeroCompte: string): boolean {
  // Class 4 accounts: 4xxxxx (clients, fournisseurs, etc.)
  return numeroCompte.startsWith('4');
}

async function getNextLettrageKey(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  numeroCompte: string,
): Promise<string> {
  // Find the highest existing lettrage key for this account
  const [last] = await tx
    .select({ lettrageKey: lignesEcritures.lettrageKey })
    .from(lignesEcritures)
    .where(
      and(
        eq(lignesEcritures.numeroCompte, numeroCompte),
        sql`${lignesEcritures.lettrageKey} IS NOT NULL`,
      )
    )
    .orderBy(sql`${lignesEcritures.lettrageKey} DESC`)
    .limit(1);

  if (!last?.lettrageKey) return 'AA';

  return incrementKey(last.lettrageKey);
}

/**
 * Increment alphabetical key: AA -> AB -> ... -> AZ -> BA -> ... -> ZZ -> AAA
 */
function incrementKey(key: string): string {
  const chars = key.split('');

  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] < 'Z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join('');
    }
    chars[i] = 'A';
  }

  // All chars were Z — add another character
  return 'A' + chars.join('');
}
