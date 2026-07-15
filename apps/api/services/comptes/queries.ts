import { currencyCode } from "@shared/config/currency";
import {
  deriveSensFromType,
  formatTransactionDescription,
} from "@shared/config/transaction-labels";
import {
  compteAgencesHistorique,
  comptes,
  mouvementsFinanciers,
  transactionsCompte
} from "@shared/schema";
import { eachDayOfInterval, endOfDay, format, subMonths, subYears } from "date-fns";
import { and, desc, eq, gte, isNull, lt, lte } from "drizzle-orm";
import { db } from "../../db";

// Import standardized status constants
import {
  StatutCompte as StatutCompteConst,
  TypeCompte as TypeCompteEnum
} from "@shared/enum/status-constants";


// ============================================================================
// PORTFOLIO & QUERIES
// ============================================================================

/**
 * Récupère le portfolio complet d'un client
 */
export async function getClientPortfolio(clientId: string) {
  const { credits, membresTontine, tontines } = await import("@shared/schema");

  const [comptesResult, creditsResult, memberships] = await Promise.all([
    db.select().from(comptes).where(and(eq(comptes.clientId, clientId), isNull(comptes.deletedAt))),
    db.select().from(credits).where(eq(credits.clientId, clientId)),
    db
      .select({
        membre: membresTontine,
        tontine: tontines,
      })
      .from(membresTontine)
      .leftJoin(tontines, eq(membresTontine.tontineId, tontines.id))
      .where(eq(membresTontine.clientId, clientId)),
  ]);

  // Calculate totals - ONLY count ACTIVE accounts for real totals
  // Pending account funds (PENDING_PAYMENT, PENDING_APPROVAL, etc.) are virtual (not yet deposited)
  const isActiveAccount = (c: typeof comptesResult[0]) =>
    c.statut === StatutCompteConst.ACTIVE;

  const totalEpargne = comptesResult
    .filter((c) => c.typeCompte === TypeCompteEnum.SAVINGS && isActiveAccount(c))
    .reduce((sum, c) => sum + parseFloat(c.soldeCourant || "0"), 0);

  const totalCourant = comptesResult
    .filter((c) => c.typeCompte === TypeCompteEnum.CURRENT && isActiveAccount(c))
    .reduce((sum, c) => sum + parseFloat(c.soldeCourant || "0"), 0);

  const totalBloque = comptesResult
    .filter((c) => c.typeCompte === TypeCompteEnum.BLOCKED && isActiveAccount(c))
    .reduce((sum, c) => sum + parseFloat(c.soldeCourant || "0"), 0);

  // Calculate pending deposits (virtual funds waiting to be deposited)
  const pendingStatuses = [
    StatutCompteConst.PENDING_PAYMENT,
    StatutCompteConst.PENDING_PAYMENT_AND_APPROVAL,
    StatutCompteConst.PENDING_ACTIVATION, // legacy
  ];
  const totalPendingDeposit = comptesResult
    .filter((c) => (pendingStatuses as readonly string[]).includes(c.statut))
    .reduce((sum, c) => sum + parseFloat(c.soldeCourant || "0"), 0);

  const totalCreditsRestant = creditsResult.reduce(
    (sum, c) => sum + parseFloat(c.soldeRestant || "0"),
    0
  );

  return {
    comptes: comptesResult,
    credits: creditsResult,
    tontines: memberships.map((m) => ({
      ...m.tontine,
      membre: m.membre,
    })),
    totaux: {
      epargne: totalEpargne,
      courant: totalCourant,
      bloque: totalBloque,
      totalComptes: totalEpargne + totalCourant + totalBloque,
      pendingDeposit: totalPendingDeposit, // Virtual funds awaiting deposit
      creditsRestant: totalCreditsRestant,
    },
  };
}

/**
 * Récupère l'historique des agences d'un compte
 */
export async function getCompteAgenceHistorique(compteId: string) {
  return db
    .select()
    .from(compteAgencesHistorique)
    .where(eq(compteAgencesHistorique.compteId, compteId))
    .orderBy(compteAgencesHistorique.dateDebut);
}

/**
 * Récupère les transactions d'un compte
 */
export async function getCompteTransactions(
  compteId: string,
  limit = 50,
  cursor?: string // ISO timestamp of last item (createdAt) — items before this will be returned
) {
  const conditions = [eq(transactionsCompte.compteId, compteId)];
  if (cursor) {
    conditions.push(lt(transactionsCompte.createdAt, new Date(cursor)));
  }

  // Fetch limit + 1 to detect if there are more items
  // Now using sens directly from transactionsCompte (stored at insert time)
  const rawResult = await db
    .select({
      id: transactionsCompte.id,
      createdAt: transactionsCompte.createdAt,
      montant: transactionsCompte.montant,
      // sens is now stored directly in transactionsCompte
      sens: transactionsCompte.sens,
      typePaiement: transactionsCompte.typePaiement,
      observations: transactionsCompte.observations,
      recu_numero: transactionsCompte.referenceExterne,
      referenceExterne: transactionsCompte.referenceExterne,
      solde_apres: transactionsCompte.soldeApres,
      mouvementId: transactionsCompte.mouvementId,
      factureId: transactionsCompte.factureId,
      statut: transactionsCompte.statut,
      reversalOfId: transactionsCompte.reversalOfId,
      // Métadonnées pour enrichir les libellés (numéro compte dest, etc.)
      metadata: mouvementsFinanciers.metadata,
    })
    .from(transactionsCompte)
    .leftJoin(mouvementsFinanciers, eq(transactionsCompte.mouvementId, mouvementsFinanciers.id))
    .where(and(...conditions))
    .orderBy(desc(transactionsCompte.createdAt))
    .limit(limit + 1);

  const hasMore = rawResult.length > limit;
  const items = hasMore ? rawResult.slice(0, limit) : rawResult;

  const data = items.map(t => {
    // Use stored sens, fallback to derivation for records without sens (pre-migration)
    const effectiveSens = t.sens || deriveSensFromType(t.typePaiement);

    // Extraire les métadonnées du mouvement pour enrichir le libellé
    const mouvementMeta = (t as any).metadata as Record<string, unknown> | null;
    const metadata = mouvementMeta ? {
      compteDestNumero: mouvementMeta.compteDestNumero as string | undefined,
      compteSourceNumero: mouvementMeta.compteSourceNumero as string | undefined,
      numeroCredit: mouvementMeta.numeroCredit as string | undefined,
      tontineName: mouvementMeta.tontineName as string | undefined,
      motif: mouvementMeta.motif as string | undefined,
    } : undefined;

    // Générer un libellé bancaire professionnel
    const description = formatTransactionDescription(
      t.typePaiement,
      t.observations,
      metadata
    );

    return {
      ...t,
      sens: effectiveSens,
      type: t.typePaiement,
      description,
      factureId: t.factureId,
    };
  });

  const nextCursor = hasMore && data.length > 0
    ? data[data.length - 1].createdAt?.toISOString() ?? null
    : null;

  return { data, nextCursor, hasMore };
}

export async function getCompteStats(
  compteId: string,
  period: '1M' | '3M' | '6M' | '1Y' = '1M'
) {
  const endDate = new Date();
  let startDate = new Date();

  switch (period) {
    case '1M': startDate = subMonths(endDate, 1); break;
    case '3M': startDate = subMonths(endDate, 3); break;
    case '6M': startDate = subMonths(endDate, 6); break;
    case '1Y': startDate = subYears(endDate, 1); break;
    default: startDate = subMonths(endDate, 1);
  }

  // 1. Get initial balance before start date
  // Find last transaction before startDate
  const [lastTxBefore] = await db
    .select({ soldeApres: transactionsCompte.soldeApres })
    .from(transactionsCompte)
    .where(
      and(
        eq(transactionsCompte.compteId, compteId),
        lte(transactionsCompte.createdAt, startDate)
      )
    )
    .orderBy(desc(transactionsCompte.createdAt))
    .limit(1);

  let currentBalance = lastTxBefore ? parseFloat(lastTxBefore.soldeApres || '0') : 0;

  // 2. Get all transactions in range
  const transactions = await db
    .select({
      createdAt: transactionsCompte.createdAt,
      soldeApres: transactionsCompte.soldeApres,
      montant: transactionsCompte.montant,
    })
    .from(transactionsCompte)
    .where(
      and(
        eq(transactionsCompte.compteId, compteId),
        gte(transactionsCompte.createdAt, startDate),
        lte(transactionsCompte.createdAt, endDate)
      )
    )
    .orderBy(transactionsCompte.createdAt); // Ascending for traversal

  // 3. Build daily points
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const dataPoints = [];
  let txIndex = 0;

  for (const day of days) {
    const dayEnd = endOfDay(day);
    let dailyCredit = 0;
    let dailyDebit = 0;
    
    // Process all transactions for this day
    while (
      txIndex < transactions.length && 
      transactions[txIndex].createdAt <= dayEnd
    ) {
      const tx = transactions[txIndex];
      const newBalance = parseFloat(tx.soldeApres || '0');
      const diff = newBalance - currentBalance;

      // In case of slight floating point issues or 0 diff (rare but possible if logic allows)
      if (diff > 0.0001) {
        dailyCredit += diff;
      } else if (diff < -0.0001) {
        dailyDebit += Math.abs(diff);
      }
      
      currentBalance = newBalance;
      txIndex++;
    }

    dataPoints.push({
      date: format(day, 'yyyy-MM-dd'),
      balance: currentBalance,
      credit: dailyCredit,
      debit: dailyDebit
    });
  }

  // Determine trend (start vs end)
  const startBal = dataPoints[0]?.balance || 0;
  const endBal = dataPoints[dataPoints.length - 1]?.balance || 0;
  // Simple trend: verify if any point was negative (red zone) or just global direction?
  // User says: "Vert si la tendance globale est positive, Rouge si le compte a été à découvert sur la période."
  // BUT logic also says: "Rouge si le compte a été à découvert".
  // Let's check for overdraft.
  const hasOverdraft = dataPoints.some(p => p.balance < 0);
  const trend = hasOverdraft ? 'negative' : (endBal >= startBal ? 'positive' : 'neutral');

  return {
    period,
    currency: currencyCode(),
    trend,
    data_points: dataPoints
  };
}

