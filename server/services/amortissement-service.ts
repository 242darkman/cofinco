/**
 * Amortissement Service — Fixed Asset Depreciation
 *
 * Calculates monthly depreciation for fixed assets (immobilisations).
 * Posts GL entries: D681 (Dotations amortissements) / C28x (Amortissements).
 * Supports linear (lineaire) and declining balance (degressif) methods.
 */

import { db } from "../db";
import { eq, and, sql, or, isNull, desc, ne } from "drizzle-orm";
import {
  immobilisations,
  amortissements,
  exercices,
  planComptable,
  ImmobilisationStatut,
} from "@shared/schema";
import { postMultiLineEntry } from "./accounting-posting-service";
import { createLogger } from "../lib/logger";
import { D, roundMoney, isEffectivelyZero } from "../lib/money";

const logger = createLogger('AmortissementService');

// ============================================================================
// TYPES
// ============================================================================

export interface AmortissementResult {
  agenceId: string;
  periodeDate: string;
  totalDotations: number;
  immosTraitees: number;
  immosTotallyDepreciated: number;
  details: AmortissementDetail[];
}

interface AmortissementDetail {
  immobilisationId: string;
  code: string;
  designation: string;
  montantDotation: number;
  cumulApres: number;
  vnc: number;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Calculate monthly depreciation for all active assets of an agence.
 */
export async function calculateAmortissements(
  agenceId: string,
  periodeDate: Date,
  userId?: string,
): Promise<AmortissementResult> {
  const periodeDateStr = periodeDate.toISOString().split("T")[0];
  logger.info({ agenceId, periodeDate: periodeDateStr }, 'Starting amortissement calculation');

  // 1. Get current exercice
  const exerciceId = await getCurrentExerciceId(agenceId, periodeDate);

  // 2. Get all active immobilisations for this agence
  const activeAssets = await db
    .select()
    .from(immobilisations)
    .where(
      and(
        eq(immobilisations.agenceId, agenceId),
        eq(immobilisations.statut, ImmobilisationStatut.ACTIVE),
      )
    );

  if (activeAssets.length === 0) {
    logger.info({ agenceId }, 'No active assets to depreciate');
    return {
      agenceId,
      periodeDate: periodeDateStr,
      totalDotations: 0,
      immosTraitees: 0,
      immosTotallyDepreciated: 0,
      details: [],
    };
  }

  // 3. Get GL accounts for amortissement
  const account681 = await getAccountId('681', agenceId);

  const details: AmortissementDetail[] = [];
  let totalDotations = 0;
  let immosTotallyDepreciated = 0;

  for (const asset of activeAssets) {
    // Skip if mise en service date is after the period
    const dateRef = asset.dateMiseEnService || asset.dateAcquisition;
    if (dateRef > periodeDateStr) continue;

    // Calculate monthly depreciation
    const valeurAcquisition = D(asset.valeurAcquisition);
    const valeurResiduelle = D(asset.valeurResiduelle);
    const baseAmortissable = valeurAcquisition.minus(valeurResiduelle);
    const cumulActuel = D(asset.cumulAmortissements);
    const resteAmortir = baseAmortissable.minus(cumulActuel);

    if (isEffectivelyZero(resteAmortir) || resteAmortir.lt(0)) continue;

    let dotationMensuelle: ReturnType<typeof D>;

    if (asset.methodeAmortissement === 'DEGRESSIF') {
      // Declining balance: (VNC × taux annuel) / 12
      const taux = asset.tauxAmortissement
        ? D(asset.tauxAmortissement).div(100)
        : D(1).div(asset.dureeAmortissementMois / 12);
      const vnc = valeurAcquisition.minus(cumulActuel);
      dotationMensuelle = vnc.times(taux).div(12);
    } else {
      // Linear: base amortissable / durée en mois
      dotationMensuelle = baseAmortissable.div(asset.dureeAmortissementMois);
    }

    // Cap at remaining amount
    if (dotationMensuelle.gt(resteAmortir)) {
      dotationMensuelle = resteAmortir;
    }

    const montantDotation = parseFloat(roundMoney(dotationMensuelle));
    if (montantDotation < 0.01) continue;

    const cumulApres = cumulActuel.plus(dotationMensuelle);
    const vnc = valeurAcquisition.minus(cumulApres);
    const isFullyDepreciated = isEffectivelyZero(baseAmortissable.minus(cumulApres)) || cumulApres.gte(baseAmortissable);

    // Get the amortissement account
    const compteAmort = await getAccountId(asset.compteAmortissement, agenceId);

    // Post GL entry: D681 / C28x
    let ecritureId: string | undefined;
    try {
      const result = await db.transaction(async (tx) => {
        return postMultiLineEntry(tx, {
          agenceId,
          sourceType: "AMORTISSEMENT",
          sourceId: `${asset.id}-${periodeDateStr}`,
          journalCode: "OD",
          entryDate: periodeDate,
          description: `Dotation amortissement ${asset.designation} (${asset.code})`,
          lines: [
            { compteId: account681.id, numeroCompte: '681', libelle: `Amortissement ${asset.code}`, debit: montantDotation, credit: 0 },
            { compteId: compteAmort.id, numeroCompte: asset.compteAmortissement, libelle: `Amortissement ${asset.code}`, debit: 0, credit: montantDotation },
          ],
          metadata: {
            immobilisationId: asset.id,
            code: asset.code,
            categorie: asset.categorie,
            methode: asset.methodeAmortissement,
            type: 'DOTATION_AMORTISSEMENT',
          },
          userId,
        });
      });
      ecritureId = result.ecritureId;
    } catch (err) {
      // Idempotent — if already posted, skip
      if (err instanceof Error && err.message.includes('not balanced')) throw err;
      logger.warn({ assetId: asset.id, err }, 'Amortissement entry may already exist');
    }

    // Record amortissement history
    await db.insert(amortissements).values({
      agenceId,
      immobilisationId: asset.id,
      exerciceId,
      periodeDate: periodeDateStr,
      baseAmortissable: roundMoney(baseAmortissable),
      tauxApplique: asset.tauxAmortissement || (100 / (asset.dureeAmortissementMois / 12)).toFixed(4),
      montantDotation: roundMoney(dotationMensuelle),
      cumulAvant: roundMoney(cumulActuel),
      cumulApres: roundMoney(cumulApres),
      valeurNetteComptable: roundMoney(vnc),
      ecritureId,
    }).onConflictDoUpdate({
      target: [amortissements.immobilisationId, amortissements.periodeDate],
      set: {
        baseAmortissable: roundMoney(baseAmortissable),
        montantDotation: roundMoney(dotationMensuelle),
        cumulAvant: roundMoney(cumulActuel),
        cumulApres: roundMoney(cumulApres),
        valeurNetteComptable: roundMoney(vnc),
        ecritureId,
      },
    });

    // Update immobilisation cumul
    await db.update(immobilisations).set({
      cumulAmortissements: roundMoney(cumulApres),
      valeurNetteComptable: roundMoney(vnc),
      ...(isFullyDepreciated ? { statut: ImmobilisationStatut.FULLY_DEPRECIATED } : {}),
      updatedAt: new Date(),
    }).where(eq(immobilisations.id, asset.id));

    if (isFullyDepreciated) immosTotallyDepreciated++;
    totalDotations += montantDotation;

    details.push({
      immobilisationId: asset.id,
      code: asset.code,
      designation: asset.designation,
      montantDotation,
      cumulApres: parseFloat(roundMoney(cumulApres)),
      vnc: parseFloat(roundMoney(vnc)),
    });
  }

  logger.info({
    agenceId,
    periodeDate: periodeDateStr,
    immosTraitees: details.length,
    totalDotations,
    immosTotallyDepreciated,
  }, 'Amortissement calculation complete');

  return {
    agenceId,
    periodeDate: periodeDateStr,
    totalDotations,
    immosTraitees: details.length,
    immosTotallyDepreciated,
    details,
  };
}

/**
 * Get depreciation summary for reporting.
 */
export async function getAmortissementSummary(
  agenceId: string,
): Promise<{
  categories: { categorie: string; nbImmos: number; valeurBrute: number; cumulAmortissements: number; vnc: number }[];
  totalBrut: number;
  totalAmortissements: number;
  totalVNC: number;
}> {
  const rows = await db.execute(sql`
    SELECT
      categorie,
      COUNT(*) AS nb_immos,
      COALESCE(SUM(valeur_acquisition::numeric), 0) AS valeur_brute,
      COALESCE(SUM(cumul_amortissements::numeric), 0) AS cumul_amortissements,
      COALESCE(SUM(valeur_nette_comptable::numeric), 0) AS vnc
    FROM immobilisations
    WHERE agence_id = ${agenceId}
      AND statut != 'DISPOSED'
    GROUP BY categorie
    ORDER BY categorie
  `);

  const categories = (rows.rows as Array<{
    categorie: string;
    nb_immos: string;
    valeur_brute: string;
    cumul_amortissements: string;
    vnc: string;
  }>).map(r => ({
    categorie: r.categorie,
    nbImmos: parseInt(r.nb_immos),
    valeurBrute: parseFloat(r.valeur_brute),
    cumulAmortissements: parseFloat(r.cumul_amortissements),
    vnc: parseFloat(r.vnc),
  }));

  return {
    categories,
    totalBrut: categories.reduce((s, c) => s + c.valeurBrute, 0),
    totalAmortissements: categories.reduce((s, c) => s + c.cumulAmortissements, 0),
    totalVNC: categories.reduce((s, c) => s + c.vnc, 0),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

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
