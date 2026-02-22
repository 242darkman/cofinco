/**
 * Engagements Hors Bilan Service — Off-Balance Sheet Commitments (Class 8)
 *
 * Tracks guarantees given/received, credit commitments, and collateral
 * per OHADA SYSCOHADA class 8 accounts.
 */

import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { engagementsHorsBilan, EngagementType, EngagementStatut } from "@shared/schema";
import { credits } from "@shared/schema/finance";
import { createLogger } from "../lib/logger";

const logger = createLogger('EngagementsHorsBilan');

// ============================================================================
// TYPES
// ============================================================================

export interface EngagementSection {
  compteHorsBilan: string;
  libelle: string;
  montant: number;
  count: number;
}

export interface EtatEngagementsHorsBilan {
  agenceId: string;
  dateReference: string;
  engagementsDonnes: {
    sections: EngagementSection[];
    total: number;
  };
  engagementsRecus: {
    sections: EngagementSection[];
    total: number;
  };
}

export interface SyncResult {
  created: number;
  updated: number;
  expired: number;
}

// ============================================================================
// SYNC FROM CREDITS
// ============================================================================

/**
 * Synchronize off-balance sheet commitments from credit data.
 * - Class 81: credits awaiting disbursement (WAITING_DISBURSEMENT)
 * - Class 82: guarantees received from active credits
 */
export async function syncEngagementsFromCredits(
  agenceId: string,
): Promise<SyncResult> {
  let created = 0;
  let updated = 0;
  let expired = 0;

  // 1. Class 81: Credits en attente de décaissement
  const undisbursedCredits = await db
    .select({
      id: credits.id,
      montant: credits.montant,
      clientId: credits.clientId,
      numeroCredit: credits.numeroCredit,
    })
    .from(credits)
    .where(
      and(
        eq(credits.agenceId, agenceId),
        sql`${credits.statut} = 'WAITING_DISBURSEMENT'`,
        sql`${credits.deletedAt} IS NULL`,
      )
    );

  for (const credit of undisbursedCredits) {
    const [existing] = await db
      .select({ id: engagementsHorsBilan.id })
      .from(engagementsHorsBilan)
      .where(
        and(
          eq(engagementsHorsBilan.creditId, credit.id),
          eq(engagementsHorsBilan.typeEngagement, EngagementType.CREDIT_NON_DECAISSE),
          eq(engagementsHorsBilan.statut, EngagementStatut.ACTIVE),
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(engagementsHorsBilan)
        .set({ montant: credit.montant, updatedAt: new Date() })
        .where(eq(engagementsHorsBilan.id, existing.id));
      updated++;
    } else {
      await db.insert(engagementsHorsBilan).values({
        agenceId,
        classe: 8,
        sousClasse: '81',
        compteHorsBilan: '812',
        typeEngagement: EngagementType.CREDIT_NON_DECAISSE,
        clientId: credit.clientId,
        montant: credit.montant,
        dateDebut: new Date().toISOString().split('T')[0],
        statut: EngagementStatut.ACTIVE,
        creditId: credit.id,
        description: `Crédit non décaissé ${credit.numeroCredit}`,
        reference: credit.numeroCredit,
      });
      created++;
    }
  }

  // 2. Class 82: Garanties reçues (from active credits with garanties)
  const activeCreditsWithGuarantees = await db
    .select({
      id: credits.id,
      garanties: credits.garanties,
      clientId: credits.clientId,
      numeroCredit: credits.numeroCredit,
      montant: credits.montant,
    })
    .from(credits)
    .where(
      and(
        eq(credits.agenceId, agenceId),
        sql`${credits.statut} IN ('ACTIVE', 'LATE')`,
        sql`${credits.garanties} IS NOT NULL AND ${credits.garanties} != ''`,
        sql`${credits.deletedAt} IS NULL`,
      )
    );

  for (const credit of activeCreditsWithGuarantees) {
    const [existing] = await db
      .select({ id: engagementsHorsBilan.id })
      .from(engagementsHorsBilan)
      .where(
        and(
          eq(engagementsHorsBilan.creditId, credit.id),
          eq(engagementsHorsBilan.sousClasse, '82'),
          eq(engagementsHorsBilan.statut, EngagementStatut.ACTIVE),
        )
      )
      .limit(1);

    if (!existing) {
      const garantiesText = (credit.garanties || '').toLowerCase();
      const typeEngagement = garantiesText.includes('immobili') || garantiesText.includes('terrain') || garantiesText.includes('maison')
        ? EngagementType.SURETE_REELLE
        : EngagementType.SURETE_PERSONNELLE;
      const compteHB = typeEngagement === EngagementType.SURETE_REELLE ? '822' : '823';

      await db.insert(engagementsHorsBilan).values({
        agenceId,
        classe: 8,
        sousClasse: '82',
        compteHorsBilan: compteHB,
        typeEngagement,
        clientId: credit.clientId,
        montant: credit.montant,
        dateDebut: new Date().toISOString().split('T')[0],
        statut: EngagementStatut.ACTIVE,
        creditId: credit.id,
        description: `Garantie: ${credit.garanties}`,
        reference: credit.numeroCredit,
      });
      created++;
    }
  }

  // 3. Expire engagements for closed/paid credits
  const closedCreditIds = await db
    .select({ id: credits.id })
    .from(credits)
    .where(
      and(
        eq(credits.agenceId, agenceId),
        sql`${credits.statut} IN ('CLOSED', 'PAID', 'CANCELLED')`,
      )
    );

  if (closedCreditIds.length > 0) {
    const ids = closedCreditIds.map(c => c.id);
    const expiredResult = await db
      .update(engagementsHorsBilan)
      .set({ statut: EngagementStatut.EXPIRE, updatedAt: new Date() })
      .where(
        and(
          eq(engagementsHorsBilan.agenceId, agenceId),
          eq(engagementsHorsBilan.statut, EngagementStatut.ACTIVE),
          inArray(engagementsHorsBilan.creditId, ids),
        )
      )
      .returning({ id: engagementsHorsBilan.id });

    expired = expiredResult.length;
  }

  logger.info({ agenceId, created, updated, expired }, 'Engagements sync completed');
  return { created, updated, expired };
}

// ============================================================================
// CRUD
// ============================================================================

export async function createEngagement(data: {
  agenceId: string;
  sousClasse: string;
  compteHorsBilan: string;
  typeEngagement: string;
  clientId?: string;
  contrepartie?: string;
  montant: string;
  dateDebut: string;
  dateEcheance?: string;
  creditId?: string;
  description?: string;
  reference?: string;
  createdBy?: string;
}) {
  const [result] = await db.insert(engagementsHorsBilan).values({
    ...data,
    classe: 8,
    statut: EngagementStatut.ACTIVE,
  }).returning();

  logger.info({ id: result.id, type: data.typeEngagement }, 'Engagement created');
  return result;
}

export async function updateEngagement(
  id: string,
  data: Partial<{
    montant: string;
    statut: string;
    dateEcheance: string;
    description: string;
    reference: string;
  }>,
) {
  const [result] = await db
    .update(engagementsHorsBilan)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(engagementsHorsBilan.id, id))
    .returning();

  return result;
}

// ============================================================================
// REPORTING
// ============================================================================

/**
 * Generate the off-balance sheet commitments report.
 */
export async function getEtatEngagements(
  agenceId: string,
  dateRef?: string,
): Promise<EtatEngagementsHorsBilan> {
  const dateReference = dateRef || new Date().toISOString().split('T')[0];

  const rows = await db.execute(sql`
    SELECT
      sous_classe,
      compte_hors_bilan,
      type_engagement,
      COUNT(*) AS count,
      COALESCE(SUM(montant::numeric), 0) AS total_montant
    FROM engagements_hors_bilan
    WHERE agence_id = ${agenceId}
      AND statut = 'ACTIVE'
      AND date_debut <= ${dateReference}
    GROUP BY sous_classe, compte_hors_bilan, type_engagement
    ORDER BY sous_classe, compte_hors_bilan
  `);

  const LABELS: Record<string, string> = {
    '811': 'Avals et cautions donnés',
    '812': 'Crédits non décaissés',
    '813': 'Engagements de crédit irrévocables',
    '821': 'Avals et cautions reçus',
    '822': 'Sûretés réelles reçues',
    '823': 'Garanties personnelles reçues',
  };

  const donnes: EngagementSection[] = [];
  const recus: EngagementSection[] = [];
  let totalDonnes = 0;
  let totalRecus = 0;

  for (const row of rows.rows as Array<{ sous_classe: string; compte_hors_bilan: string; count: string; total_montant: string }>) {
    const section: EngagementSection = {
      compteHorsBilan: row.compte_hors_bilan,
      libelle: LABELS[row.compte_hors_bilan] || row.compte_hors_bilan,
      montant: parseFloat(row.total_montant),
      count: parseInt(row.count),
    };

    if (row.sous_classe === '81') {
      donnes.push(section);
      totalDonnes += section.montant;
    } else {
      recus.push(section);
      totalRecus += section.montant;
    }
  }

  return {
    agenceId,
    dateReference,
    engagementsDonnes: { sections: donnes, total: totalDonnes },
    engagementsRecus: { sections: recus, total: totalRecus },
  };
}

/**
 * List all engagements with optional filters.
 */
export async function listEngagements(
  agenceId: string,
  filters?: { sousClasse?: string; statut?: string; creditId?: string },
) {
  const conditions = [eq(engagementsHorsBilan.agenceId, agenceId)];

  if (filters?.sousClasse) {
    conditions.push(eq(engagementsHorsBilan.sousClasse, filters.sousClasse));
  }
  if (filters?.statut) {
    conditions.push(eq(engagementsHorsBilan.statut, filters.statut));
  }
  if (filters?.creditId) {
    conditions.push(eq(engagementsHorsBilan.creditId, filters.creditId));
  }

  return db
    .select()
    .from(engagementsHorsBilan)
    .where(and(...conditions))
    .orderBy(engagementsHorsBilan.sousClasse, engagementsHorsBilan.createdAt);
}
