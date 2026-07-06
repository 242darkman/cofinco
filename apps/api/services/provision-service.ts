/**
 * Provision Service — COBAC-compliant credit provisioning
 *
 * Calculates provisions for doubtful credits based on aging buckets (PAR).
 * Posts GL entries: dotation D691/C2917, reprise D2917/C79.
 * Uses postMultiLineEntry() for idempotent, balanced GL postings.
 */

import { db } from "../db";
import { eq, and, sql, or, isNull, desc } from "drizzle-orm";
import {
  baremeProvisions,
  provisionsCredits,
  exercices,
  planComptable,
  type BaremeProvision,
} from "@shared/schema";
import { credits } from "@shared/schema/finance";
import { postMultiLineEntry } from "./accounting-posting-service";
import { createLogger } from "../lib/logger";
import { D, roundMoney } from "../lib/money";

const logger = createLogger('ProvisionService');

// ============================================================================
// TYPES
// ============================================================================

export interface ProvisionResult {
  agenceId: string;
  periodeDate: string;
  totalDotations: number;
  totalReprises: number;
  creditsTraites: number;
  details: ProvisionDetail[];
}

interface ProvisionDetail {
  creditId: string;
  numeroCredit?: string;
  soldeRestant: number;
  joursRetard: number;
  categorie: string;
  tauxProvision: number;
  montantProvision: number;
  provisionPrecedente: number;
  dotation: number;
  reprise: number;
}

interface CreditForProvision {
  id: string;
  agenceId: string;
  clientId: string;
  numeroCredit: string | null;
  soldeRestant: string;
  joursRetard: number;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Calculate provisions for all credits of an agence at a given date.
 * Creates GL entries for net dotations/reprises.
 */
export async function calculateProvisions(
  agenceId: string,
  periodeDate: Date,
  userId?: string,
): Promise<ProvisionResult> {
  const periodeDateStr = periodeDate.toISOString().split("T")[0];
  logger.info({ agenceId, periodeDate: periodeDateStr }, 'Starting provision calculation');

  // 1. Load active barème
  const bareme = await loadBareme(agenceId);
  if (bareme.length === 0) {
    throw new Error('No active provision scale (bareme_provisions) found');
  }

  // 2. Get current exercice
  const exerciceId = await getCurrentExerciceId(agenceId, periodeDate);

  // 3. Query credits with days overdue
  const overdueCredits = await getCreditsForProvision(agenceId);

  if (overdueCredits.length === 0) {
    logger.info({ agenceId }, 'No credits to provision');
    return {
      agenceId,
      periodeDate: periodeDateStr,
      totalDotations: 0,
      totalReprises: 0,
      creditsTraites: 0,
      details: [],
    };
  }

  // 4. Get GL account IDs for posting
  const account691 = await getAccountId('691', agenceId);
  const account2917 = await getAccountId('2917', agenceId);
  const account79 = await getAccountId('79', agenceId);

  // 5. Process each credit
  const details: ProvisionDetail[] = [];
  let totalDotations = 0;
  let totalReprises = 0;

  for (const credit of overdueCredits) {
    const soldeRestant = D(credit.soldeRestant);
    const joursRetard = Math.max(0, credit.joursRetard);

    // Find matching bucket
    const bucket = findBucket(bareme, joursRetard);
    if (!bucket) continue;

    const tauxProvision = D(bucket.tauxProvision).div(100);
    const montantProvision = soldeRestant.times(tauxProvision);
    const montantProvisionNum = parseFloat(roundMoney(montantProvision));

    // Get previous provision for this credit
    const prevProvision = await getPreviousProvision(credit.id);
    const provisionPrecedente = prevProvision ? parseFloat(prevProvision.montantProvision) : 0;

    // Calculate delta
    const delta = montantProvisionNum - provisionPrecedente;
    const dotation = delta > 0 ? delta : 0;
    const reprise = delta < 0 ? Math.abs(delta) : 0;

    // Post GL entry if there's a change
    let ecritureId: string | undefined;

    if (dotation > 0.01) {
      // Dotation: D691 (charge) / C2917 (contra-actif)
      const result = await db.transaction(async (tx) => {
        return postMultiLineEntry(tx, {
          agenceId,
          sourceType: "PROVISION",
          sourceId: `${credit.id}-${periodeDateStr}`,
          journalCode: "OD",
          entryDate: periodeDate,
          description: `Dotation provision crédit ${credit.numeroCredit || credit.id} - ${bucket.categorie}`,
          lines: [
            { compteId: account691.id, numeroCompte: '691', libelle: `Dotation provision ${credit.numeroCredit}`, debit: dotation, credit: 0 },
            { compteId: account2917.id, numeroCompte: '2917', libelle: `Provision crédit ${credit.numeroCredit}`, debit: 0, credit: dotation },
          ],
          metadata: { creditId: credit.id, categorie: bucket.categorie, tauxProvision: bucket.tauxProvision, type: 'DOTATION' },
          userId,
        });
      });
      ecritureId = result.ecritureId;
      totalDotations += dotation;
    } else if (reprise > 0.01) {
      // Reprise: D2917 / C79 (produit)
      const result = await db.transaction(async (tx) => {
        return postMultiLineEntry(tx, {
          agenceId,
          sourceType: "PROVISION_REVERSAL",
          sourceId: `${credit.id}-${periodeDateStr}`,
          journalCode: "OD",
          entryDate: periodeDate,
          description: `Reprise provision crédit ${credit.numeroCredit || credit.id} - ${bucket.categorie}`,
          lines: [
            { compteId: account2917.id, numeroCompte: '2917', libelle: `Reprise provision ${credit.numeroCredit}`, debit: reprise, credit: 0 },
            { compteId: account79.id, numeroCompte: '79', libelle: `Reprise provision ${credit.numeroCredit}`, debit: 0, credit: reprise },
          ],
          metadata: { creditId: credit.id, categorie: bucket.categorie, tauxProvision: bucket.tauxProvision, type: 'REPRISE' },
          userId,
        });
      });
      ecritureId = result.ecritureId;
      totalReprises += reprise;
    }

    // Insert provision record
    await db.insert(provisionsCredits).values({
      agenceId,
      creditId: credit.id,
      exerciceId,
      periodeDate: periodeDateStr,
      soldeRestant: roundMoney(soldeRestant),
      joursRetard,
      categorie: bucket.categorie,
      tauxProvision: bucket.tauxProvision,
      montantProvision: roundMoney(montantProvision),
      provisionPrecedente: provisionPrecedente.toFixed(2),
      dotation: dotation.toFixed(2),
      reprise: reprise.toFixed(2),
      ecritureId,
    }).onConflictDoUpdate({
      target: [provisionsCredits.creditId, provisionsCredits.periodeDate],
      set: {
        soldeRestant: roundMoney(soldeRestant),
        joursRetard,
        categorie: bucket.categorie,
        tauxProvision: bucket.tauxProvision,
        montantProvision: roundMoney(montantProvision),
        provisionPrecedente: provisionPrecedente.toFixed(2),
        dotation: dotation.toFixed(2),
        reprise: reprise.toFixed(2),
        ecritureId,
      },
    });

    details.push({
      creditId: credit.id,
      numeroCredit: credit.numeroCredit || undefined,
      soldeRestant: parseFloat(roundMoney(soldeRestant)),
      joursRetard,
      categorie: bucket.categorie,
      tauxProvision: parseFloat(bucket.tauxProvision),
      montantProvision: montantProvisionNum,
      provisionPrecedente,
      dotation,
      reprise,
    });
  }

  logger.info({
    agenceId,
    periodeDate: periodeDateStr,
    creditsTraites: details.length,
    totalDotations,
    totalReprises,
  }, 'Provision calculation complete');

  return {
    agenceId,
    periodeDate: periodeDateStr,
    totalDotations,
    totalReprises,
    creditsTraites: details.length,
    details,
  };
}

/**
 * Get provision summary by category (PAR report).
 */
export async function getProvisionSummary(
  agenceId: string,
  periodeDate?: string,
): Promise<{
  categories: { categorie: string; nbCredits: number; soldeTotal: number; provisionTotal: number; tauxMoyen: number }[];
  totalSolde: number;
  totalProvision: number;
  tauxCouverture: number;
}> {
  const dateFilter = periodeDate || new Date().toISOString().split("T")[0];

  const rows = await db
    .select({
      categorie: provisionsCredits.categorie,
      nbCredits: sql<number>`COUNT(*)`,
      soldeTotal: sql<string>`SUM(${provisionsCredits.soldeRestant})`,
      provisionTotal: sql<string>`SUM(${provisionsCredits.montantProvision})`,
    })
    .from(provisionsCredits)
    .where(
      and(
        eq(provisionsCredits.agenceId, agenceId),
        eq(provisionsCredits.periodeDate, dateFilter),
      )
    )
    .groupBy(provisionsCredits.categorie);

  const categories = rows.map(r => ({
    categorie: r.categorie,
    nbCredits: Number(r.nbCredits),
    soldeTotal: parseFloat(r.soldeTotal || '0'),
    provisionTotal: parseFloat(r.provisionTotal || '0'),
    tauxMoyen: parseFloat(r.soldeTotal || '0') > 0
      ? (parseFloat(r.provisionTotal || '0') / parseFloat(r.soldeTotal || '0')) * 100
      : 0,
  }));

  const totalSolde = categories.reduce((s, c) => s + c.soldeTotal, 0);
  const totalProvision = categories.reduce((s, c) => s + c.provisionTotal, 0);

  return {
    categories,
    totalSolde,
    totalProvision,
    tauxCouverture: totalSolde > 0 ? (totalProvision / totalSolde) * 100 : 0,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function loadBareme(agenceId: string): Promise<BaremeProvision[]> {
  return db
    .select()
    .from(baremeProvisions)
    .where(
      and(
        or(eq(baremeProvisions.agenceId, agenceId), isNull(baremeProvisions.agenceId)),
        eq(baremeProvisions.actif, true),
      )
    )
    .orderBy(baremeProvisions.joursRetardMin);
}

function findBucket(bareme: BaremeProvision[], joursRetard: number): BaremeProvision | undefined {
  return bareme.find(b => {
    const min = b.joursRetardMin;
    const max = b.joursRetardMax;
    if (max === null) return joursRetard >= min;
    return joursRetard >= min && joursRetard <= max;
  });
}

async function getCreditsForProvision(agenceId: string): Promise<CreditForProvision[]> {
  const rows = await db.execute(sql`
    SELECT
      id,
      agence_id AS "agenceId",
      client_id AS "clientId",
      numero_credit AS "numeroCredit",
      solde_restant AS "soldeRestant",
      GREATEST(0, EXTRACT(DAY FROM NOW() - prochaine_echeance)::int) AS "joursRetard"
    FROM credits
    WHERE statut IN ('ACTIVE', 'LATE')
      AND agence_id = ${agenceId}
      AND deleted_at IS NULL
      AND solde_restant > 0
    ORDER BY prochaine_echeance ASC
  `);
  return rows.rows as unknown as CreditForProvision[];
}

async function getPreviousProvision(creditId: string) {
  const [prev] = await db
    .select()
    .from(provisionsCredits)
    .where(eq(provisionsCredits.creditId, creditId))
    .orderBy(desc(provisionsCredits.periodeDate))
    .limit(1);
  return prev || null;
}

async function getCurrentExerciceId(agenceId: string, date: Date): Promise<string> {
  const year = date.getFullYear();
  const [existing] = await db
    .select()
    .from(exercices)
    .where(
      and(
        eq(exercices.code, year.toString()),
        or(eq(exercices.agenceId, agenceId), isNull(exercices.agenceId)),
      )
    )
    .limit(1);

  if (existing) return existing.id;

  // Auto-create exercice
  const [created] = await db
    .insert(exercices)
    .values({
      code: year.toString(),
      dateDebut: `${year}-01-01`,
      dateFin: `${year}-12-31`,
      statut: "OPEN",
      description: `Exercice ${year}`,
      agenceId,
    })
    .returning();

  return created.id;
}

async function getAccountId(
  numeroCompte: string,
  agenceId: string,
): Promise<{ id: string; numeroCompte: string }> {
  const [account] = await db
    .select({ id: planComptable.id, numeroCompte: planComptable.numeroCompte })
    .from(planComptable)
    .where(
      and(
        eq(planComptable.numeroCompte, numeroCompte),
        or(eq(planComptable.agenceId, agenceId), isNull(planComptable.agenceId)),
        eq(planComptable.actif, true),
      )
    )
    .limit(1);

  if (!account) {
    throw new Error(`GL account ${numeroCompte} not found in plan comptable`);
  }

  return account;
}
