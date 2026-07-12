/**
 * Service de lettrage des comptes de tiers.
 *
 * Fournit le lettrage manuel et automatique des lignes débit/crédit sur les
 * comptes de classe 4, ainsi que la balance âgée des lignes non lettrées.
 */

import { db } from "../db";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import { lignesEcritures, ecritures, EntryStatus } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { incrementLettrageKey } from "./lettrage-key";
import type {
  BalanceAgeeEntry,
  BalanceAgeeTranche,
  LettrageResult,
  LigneNonLettree,
} from "./lettrage-types";

const logger = createLogger('LettrageService');

const LETTRAGE_TOLERANCE = 1;
const AUTO_MATCH_TOLERANCE = 0.01;

/**
 * Lettre un ensemble de lignes comptables.
 *
 * Toutes les lignes doivent appartenir au même compte de tiers et le total
 * débit doit équilibrer le total crédit dans la tolérance autorisée.
 */
export async function lettrerLignes(
  ligneIds: string[],
  userId: string,
): Promise<LettrageResult> {
  if (ligneIds.length < 2) {
    throw new Error('Au moins 2 lignes sont nécessaires pour le lettrage');
  }

  return db.transaction(async (tx) => {
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

    const compteIds = new Set(lignes.map(l => l.compteId));
    if (compteIds.size > 1) {
      throw new Error('Toutes les lignes doivent être sur le même compte');
    }

    const numeroCompte = lignes[0].numeroCompte;
    if (!isTierAccount(numeroCompte)) {
      throw new Error(`Le compte ${numeroCompte} n'est pas un compte de tiers (classe 4)`);
    }

    const alreadyMatched = lignes.filter(l => l.lettrageKey);
    if (alreadyMatched.length > 0) {
      throw new Error(`${alreadyMatched.length} ligne(s) déjà lettrée(s)`);
    }

    const totalDebit = lignes.reduce((s, l) => s + parseFloat(l.debit), 0);
    const totalCredit = lignes.reduce((s, l) => s + parseFloat(l.credit), 0);
    if (Math.abs(totalDebit - totalCredit) > LETTRAGE_TOLERANCE) {
      throw new Error(
        `Le lettrage n'est pas équilibré : débit=${totalDebit.toFixed(2)}, crédit=${totalCredit.toFixed(2)} (écart=${Math.abs(totalDebit - totalCredit).toFixed(2)})`
      );
    }

    const lettrageKey = await getNextLettrageKey(tx, numeroCompte);

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

/**
 * Supprime le lettrage associé à une clé sur un compte donné.
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

/**
 * Tente de lettrer automatiquement les lignes débit/crédit de même montant.
 *
 * Lorsque les métadonnées contiennent un `clientId`, le rapprochement privilégie
 * une contrepartie du même client.
 */
export async function autoLettrage(
  compteId: string,
  agenceId: string,
  userId: string,
): Promise<{ matched: number; keys: string[] }> {
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

  const debitLines = unmatched.filter(l => parseFloat(l.debit) > 0);
  const creditLines = unmatched.filter(l => parseFloat(l.credit) > 0);

  let totalMatched = 0;
  const keys: string[] = [];
  const usedIds = new Set<string>();

  for (const debitLine of debitLines) {
    if (usedIds.has(debitLine.id)) continue;
    const debitAmount = parseFloat(debitLine.debit);
    const debitClientId = (debitLine.metadata as Record<string, unknown>)?.clientId;

    const match = creditLines.find(cl => {
      if (usedIds.has(cl.id)) return false;
      const creditAmount = parseFloat(cl.credit);
      if (Math.abs(debitAmount - creditAmount) > AUTO_MATCH_TOLERANCE) return false;
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
      } catch (error) {
        logger.debug({ err: error, debitLineId: debitLine.id, creditLineId: match.id }, 'Auto-lettrage pair skipped');
      }
    }
  }

  logger.info({ compteId, matched: totalMatched, keys: keys.length }, 'Auto-lettrage completed');
  return { matched: totalMatched, keys };
}

/**
 * Retourne les lignes non lettrées d'un compte de tiers pour une agence.
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

const BALANCE_AGEE_TRANCHES: BalanceAgeeTranche[] = [
  { label: '0-30 jours', min: 0, max: 30 },
  { label: '31-60 jours', min: 31, max: 60 },
  { label: '61-90 jours', min: 61, max: 90 },
  { label: 'Plus de 90 jours', min: 91, max: null },
];

/**
 * Calcule la balance âgée des lignes non lettrées d'un compte de tiers.
 */
export async function getBalanceAgee(
  compteId: string,
  agenceId: string,
  dateReference?: Date,
): Promise<BalanceAgeeEntry[]> {
  const refDate = dateReference || new Date();
  const refDateStr = refDate.toISOString().split("T")[0];

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

  const result: BalanceAgeeEntry[] = BALANCE_AGEE_TRANCHES.map(t => ({
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

function isTierAccount(numeroCompte: string): boolean {
  return numeroCompte.startsWith('4');
}

async function getNextLettrageKey(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  numeroCompte: string,
): Promise<string> {
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

  return incrementLettrageKey(last.lettrageKey);
}
