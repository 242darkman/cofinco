/**
 * Tontine Smart Dispatcher Service
 *
 * Ce service gère intelligemment la répartition des paiements tontine :
 * - Priorité 1 : Pénalités impayées
 * - Priorité 2 : Tours passés en retard (rattrapage)
 * - Priorité 3 : Tour courant et tours futurs (avances)
 *
 * Supporte les paiements partiels et les paiements groupés multi-tours.
 */

import { db } from "../db";
import {
  tontines,
  membresTontine,
  contributionsTontine,
  tontinePenalites,
  tontineDistributions,
  operationsCaisse,
  comptes
} from "@shared/schema";
import { eq, and, sql, desc, asc, lte } from "drizzle-orm";
import {
  executeWithLedger,
  updateTontineSolde,
  updateSessionSolde,
  generateReference,
  validateUserId
} from "./ledger";
import {
  StatutMembreTontine,
  StatutContributionTontine,
  StatutTransaction,
  ModeDistributionTontine,
  MethodePaiement,
  TypeOperationCaisse,
} from "@shared/enum/status-constants";

// ============ STATUS CONSTANTS (for DB values) ============
// These map to the enum values and are used for DB queries
const DB_STATUT_MEMBRE_ACTIF = StatutMembreTontine.ACTIVE;
const DB_STATUT_PENALITE_IMPAYE = "impaye";
const DB_STATUT_PENALITE_PAYE = "paye";
// Use standardized English status for transactions
const DB_STATUT_TRANSACTION_POSTE = StatutTransaction.POSTED;

// ============ TYPES ============

export interface DispatchResult {
  penalitesPaid: Array<{ id: string; montant: number }>;
  contributionsCreated: Array<{
    id: string;
    tourNumero: number;
    montant: number;
    type: 'FULL' | 'PARTIAL';
  }>;
  remainingAmount: number;
  totalDispatched: number;
  mouvementId: string;
}

export interface MemberTontineState {
  membre: {
    id: string;
    clientId: string;
    totalCotisations: number;
  };
  tontine: {
    id: string;
    montantCotisation: number;
    tourActuel: number;
    nombreMembres: number;
  };
  penalitesImpayees: Array<{
    id: string;
    montant: number;
    dateFaute: Date;
  }>;
  contributionsParTour: Map<number, number>; // tourNumero -> montant total payé
  toursEnRetard: number[]; // Liste des tours non/partiellement payés < tourActuel
}

// ============ HELPER FUNCTIONS ============

/**
 * Récupère l'état complet d'un membre dans une tontine
 */
export async function getMemberTontineState(
  clientId: string,
  tontineId: string
): Promise<MemberTontineState | null> {
  // 1. Récupérer la tontine avec le tour actuel
  const [tontineData] = await db
    .select({
      id: tontines.id,
      montantCotisation: tontines.montantCotisation,
      nombreMembres: tontines.nombreMembres,
      tourActuel: sql<number>`COALESCE((
        SELECT MAX(tour_numero) FROM tontine_distributions WHERE tontine_id = ${tontineId}
      ), 0) + 1`.mapWith(Number)
    })
    .from(tontines)
    .where(eq(tontines.id, tontineId));

  if (!tontineData) return null;

  // 2. Récupérer le membre
  const [membreData] = await db
    .select({
      id: membresTontine.id,
      clientId: membresTontine.clientId,
      totalCotisations: membresTontine.totalCotisations
    })
    .from(membresTontine)
    .where(and(
      eq(membresTontine.tontineId, tontineId),
      eq(membresTontine.clientId, clientId),
      eq(membresTontine.statut, DB_STATUT_MEMBRE_ACTIF)
    ));

  if (!membreData) return null;

  // 3. Récupérer les pénalités impayées (ordre chronologique)
  const penalitesData = await db
    .select({
      id: tontinePenalites.id,
      montant: tontinePenalites.montant,
      dateFaute: tontinePenalites.dateFaute
    })
    .from(tontinePenalites)
    .where(and(
      eq(tontinePenalites.membreId, membreData.id),
      eq(tontinePenalites.statut, DB_STATUT_PENALITE_IMPAYE)
    ))
    .orderBy(asc(tontinePenalites.dateFaute));

  // 4. Récupérer toutes les contributions validées groupées par tour
  const contributionsData = await db
    .select({
      tourNumero: contributionsTontine.tourNumero,
      totalMontant: sql<number>`SUM(CAST(${contributionsTontine.montant} AS NUMERIC))`.mapWith(Number)
    })
    .from(contributionsTontine)
    .where(and(
      eq(contributionsTontine.tontineId, tontineId),
      eq(contributionsTontine.clientId, clientId),
      eq(contributionsTontine.statutTransaction, DB_STATUT_TRANSACTION_POSTE)
    ))
    .groupBy(contributionsTontine.tourNumero);

  const contributionsParTour = new Map<number, number>();
  for (const c of contributionsData) {
    contributionsParTour.set(c.tourNumero || 1, c.totalMontant);
  }

  // 5. Calculer les tours en retard (< tourActuel avec paiement incomplet)
  const montantCotisation = Number(tontineData.montantCotisation);
  const toursEnRetard: number[] = [];

  for (let tour = 1; tour < tontineData.tourActuel; tour++) {
    const montantPaye = contributionsParTour.get(tour) || 0;
    if (montantPaye < montantCotisation) {
      toursEnRetard.push(tour);
    }
  }

  return {
    membre: {
      id: membreData.id,
      clientId: membreData.clientId,
      totalCotisations: Number(membreData.totalCotisations || 0)
    },
    tontine: {
      id: tontineData.id,
      montantCotisation,
      tourActuel: tontineData.tourActuel,
      nombreMembres: tontineData.nombreMembres || 0
    },
    penalitesImpayees: penalitesData.map(p => ({
      id: p.id,
      montant: Number(p.montant),
      dateFaute: p.dateFaute || new Date()
    })),
    contributionsParTour,
    toursEnRetard
  };
}

/**
 * Calcule la prévisualisation d'un paiement (pour l'UI)
 */
export function previewPaymentDispatch(
  montant: number,
  montantCotisation: number,
  penalitesTotal: number,
  toursEnRetard: number
): {
  penalites: number;
  toursComplets: number;
  partiel: number;
} {
  let remaining = montant;
  let penalitesPaid = 0;
  let toursComplets = 0;
  let partiel = 0;

  // Pénalités
  if (penalitesTotal > 0 && remaining >= penalitesTotal) {
    penalitesPaid = penalitesTotal;
    remaining -= penalitesTotal;
  }

  // Tours
  if (remaining > 0 && montantCotisation > 0) {
    toursComplets = Math.floor(remaining / montantCotisation);
    partiel = remaining % montantCotisation;
  }

  return {
    penalites: penalitesPaid,
    toursComplets,
    partiel
  };
}

// ============ MAIN DISPATCHER ============

/**
 * Dispatch intelligent d'un paiement tontine
 *
 * Algorithme :
 * 1. Payer les pénalités impayées (ordre chronologique)
 * 2. Rattraper les tours passés non payés
 * 3. Payer le tour courant
 * 4. Créer des avances pour les tours futurs
 *
 * @param clientId - ID du client
 * @param tontineId - ID de la tontine
 * @param amountTotal - Montant total à dispatcher
 * @param sessionCaisseId - ID de la session caisse (pour paiements espèces)
 * @param userId - ID de l'utilisateur effectuant l'opération
 */
export async function dispatchTontinePayment(
  clientId: string,
  tontineId: string,
  amountTotal: number,
  sessionCaisseId?: string,
  userId?: string
): Promise<DispatchResult> {
  // Validation initiale
  if (amountTotal <= 0) {
    throw new Error("Le montant doit être supérieur à 0");
  }

  // Récupérer l'état du membre
  const state = await getMemberTontineState(clientId, tontineId);
  if (!state) {
    throw new Error("Membre non trouvé dans cette tontine");
  }

  const { tontine, membre, penalitesImpayees, contributionsParTour, toursEnRetard } = state;
  const isCash = !!sessionCaisseId;

  // Exécuter dans une transaction avec ledger
  return await executeWithLedger<DispatchResult>(
    "TONTINE",
    {
      montant: amountTotal.toString(),
      sens: "CREDIT",
      clientId,
      tontineId,
      sessionCaisseId: isCash ? sessionCaisseId : undefined,
      typePaiement: "TONTINE_CONTRIBUTION",
      methodePaiement: isCash ? "CASH" : "TRANSFER",
      metadata: {
        description: "Paiement Tontine Groupé (Smart Dispatch)",
        dispatchType: "smart"
      }
    },
    async (tx, mouvement) => {
      let remaining = amountTotal;
      const penalitesPaid: DispatchResult['penalitesPaid'] = [];
      const contributionsCreated: DispatchResult['contributionsCreated'] = [];

      // ========== PRIORITÉ 1 : PÉNALITÉS ==========
      for (const penalite of penalitesImpayees) {
        if (remaining <= 0) break;
        if (remaining >= penalite.montant) {
          // Payer la pénalité complètement
          await tx
            .update(tontinePenalites)
            .set({
              statut: DB_STATUT_PENALITE_PAYE,
              datePaiement: new Date(),
              updatedAt: new Date()
            })
            .where(eq(tontinePenalites.id, penalite.id));

          penalitesPaid.push({ id: penalite.id, montant: penalite.montant });
          remaining -= penalite.montant;
        }
        // Note: Les pénalités partielles ne sont pas supportées
      }

      // ========== PRIORITÉ 2 : RATTRAPAGE (TOURS PASSÉS) ==========
      for (const tour of toursEnRetard) {
        if (remaining <= 0) break;

        const montantDejaPaye = contributionsParTour.get(tour) || 0;
        const montantManquant = tontine.montantCotisation - montantDejaPaye;

        if (montantManquant <= 0) continue;

        const montantAPayer = Math.min(remaining, montantManquant);
        const isComplete = montantAPayer >= montantManquant;

        // Créer la contribution
        const [contribution] = await tx
          .insert(contributionsTontine)
          .values({
            tontineId,
            clientId,
            mouvementId: mouvement.id,
            typeOperation: TypeOperationCaisse.TONTINE_CONTRIBUTION,
            montant: montantAPayer.toString(),
            tourNumero: tour,
            methodePaiement: isCash ? MethodePaiement.CASH : MethodePaiement.TRANSFER,
            statutTransaction: DB_STATUT_TRANSACTION_POSTE,
            reference: `${mouvement.reference}-T${tour}`,
            observations: `Rattrapage Tour ${tour} (${isComplete ? 'Complet' : 'Partiel'})`
          })
          .returning();

        contributionsCreated.push({
          id: contribution.id,
          tourNumero: tour,
          montant: montantAPayer,
          type: isComplete ? 'FULL' : 'PARTIAL'
        });

        remaining -= montantAPayer;
      }

      // ========== PRIORITÉ 3 : TOUR COURANT & FUTURS ==========
      let tourCible = tontine.tourActuel;
      const maxTour = tontine.nombreMembres; // Un membre ne paie pas plus que le nombre de tours

      while (remaining > 0 && tourCible <= maxTour) {
        const montantDejaPaye = contributionsParTour.get(tourCible) || 0;
        const montantManquant = tontine.montantCotisation - montantDejaPaye;

        if (montantManquant <= 0) {
          tourCible++;
          continue;
        }

        const montantAPayer = Math.min(remaining, montantManquant);
        const isComplete = montantAPayer >= montantManquant;

        // Créer la contribution
        const [contribution] = await tx
          .insert(contributionsTontine)
          .values({
            tontineId,
            clientId,
            mouvementId: mouvement.id,
            typeOperation: TypeOperationCaisse.TONTINE_CONTRIBUTION,
            montant: montantAPayer.toString(),
            tourNumero: tourCible,
            methodePaiement: isCash ? MethodePaiement.CASH : MethodePaiement.TRANSFER,
            statutTransaction: DB_STATUT_TRANSACTION_POSTE,
            reference: `${mouvement.reference}-T${tourCible}`,
            observations: tourCible > tontine.tourActuel
              ? `Avance Tour ${tourCible} (${isComplete ? 'Complet' : 'Partiel'})`
              : `Tour ${tourCible} (${isComplete ? 'Complet' : 'Partiel'})`
          })
          .returning();

        contributionsCreated.push({
          id: contribution.id,
          tourNumero: tourCible,
          montant: montantAPayer,
          type: isComplete ? 'FULL' : 'PARTIAL'
        });

        // Mettre à jour le cache local pour les tours suivants
        contributionsParTour.set(tourCible, montantDejaPaye + montantAPayer);

        remaining -= montantAPayer;

        if (isComplete) {
          tourCible++;
        }
      }

      // ========== MISES À JOUR FINALES ==========

      // 1. Mettre à jour le solde de la tontine
      await updateTontineSolde(tx, tontineId, amountTotal);

      // 2. Mettre à jour le solde de la session caisse (si espèces)
      let nouveauSoldeSession;
      if (isCash && sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, sessionCaisseId, amountTotal);

        // Créer l'opération caisse
        const validatedUserId = await validateUserId(tx, userId);
        await tx.insert(operationsCaisse).values({
          sessionId: sessionCaisseId,
          mouvementId: mouvement.id,
          typeOperation: "TONTINE_CONTRIBUTION" as any,
          montant: amountTotal.toString(),
          methodePaiement: "CASH" as any,
          reference: `TON-DISPATCH-${mouvement.reference}`,
          description: `Paiement Tontine Groupé: ${contributionsCreated.length} contribution(s)`,
          createdBy: validatedUserId
        });
      }

      // 3. Mettre à jour les stats du membre
      const totalContributions = contributionsCreated.reduce((sum, c) => sum + c.montant, 0);
      if (totalContributions > 0) {
        await tx.execute(sql`
          UPDATE membres_tontine
          SET total_cotisations = COALESCE(total_cotisations, 0) + ${totalContributions},
              updated_at = NOW()
          WHERE tontine_id = ${tontineId}
          AND client_id = ${clientId}
        `);
      }

      const result: DispatchResult = {
        penalitesPaid,
        contributionsCreated,
        remainingAmount: remaining,
        totalDispatched: amountTotal - remaining,
        mouvementId: mouvement.id
      };

      return {
        result,
        additionalEventData: {
          nouveauSoldeSession
        }
      };
    },
    userId
  ).then(({ result }) => result);
}

// ============ UTILITY FUNCTIONS ============

/**
 * Vérifie si un membre a déjà payé complètement un tour spécifique
 */
export async function isTourFullyPaid(
  clientId: string,
  tontineId: string,
  tourNumero: number
): Promise<{ isPaid: boolean; montantPaye: number; montantRestant: number }> {
  // Récupérer le montant de cotisation
  const [tontineData] = await db
    .select({ montantCotisation: tontines.montantCotisation })
    .from(tontines)
    .where(eq(tontines.id, tontineId));

  if (!tontineData) {
    throw new Error("Tontine non trouvée");
  }

  const montantCotisation = Number(tontineData.montantCotisation);

  // Calculer le total payé pour ce tour
  const [result] = await db
    .select({
      totalMontant: sql<number>`COALESCE(SUM(CAST(${contributionsTontine.montant} AS NUMERIC)), 0)`.mapWith(Number)
    })
    .from(contributionsTontine)
    .where(and(
      eq(contributionsTontine.tontineId, tontineId),
      eq(contributionsTontine.clientId, clientId),
      eq(contributionsTontine.tourNumero, tourNumero),
      eq(contributionsTontine.statutTransaction, DB_STATUT_TRANSACTION_POSTE)
    ));

  const montantPaye = result?.totalMontant || 0;
  const montantRestant = Math.max(0, montantCotisation - montantPaye);

  return {
    isPaid: montantRestant <= 0,
    montantPaye,
    montantRestant
  };
}

/**
 * Récupère le résumé de l'état de paiement d'un membre
 */
export async function getMemberPaymentSummary(
  clientId: string,
  tontineId: string
): Promise<{
  toursPayes: number;
  toursEnRetard: number;
  toursEnAvance: number;
  penalitesImpayees: number;
  montantTotalDu: number;
  estAJour: boolean;
}> {
  const state = await getMemberTontineState(clientId, tontineId);

  if (!state) {
    throw new Error("Membre non trouvé dans cette tontine");
  }

  const { tontine, penalitesImpayees, contributionsParTour, toursEnRetard } = state;

  // Calculer les tours payés complètement
  let toursPayesComplets = 0;
  contributionsParTour.forEach((montant, tour) => {
    if (montant >= tontine.montantCotisation) {
      toursPayesComplets++;
    }
  });

  // Tours en avance = tours payés au-delà du tour actuel
  const toursEnAvance = Math.max(0, toursPayesComplets - tontine.tourActuel);

  // Total des pénalités impayées
  const totalPenalites = penalitesImpayees.reduce((sum, p) => sum + p.montant, 0);

  // Montant total dû = pénalités + tours en retard
  const montantRetard = toursEnRetard.length * tontine.montantCotisation;
  const montantTotalDu = totalPenalites + montantRetard;

  return {
    toursPayes: toursPayesComplets,
    toursEnRetard: toursEnRetard.length,
    toursEnAvance,
    penalitesImpayees: totalPenalites,
    montantTotalDu,
    estAJour: toursEnRetard.length === 0 && totalPenalites === 0
  };
}

// ============ DISTRIBUTION FUNCTIONS ============

export interface DistributionResult {
  distributionId: string;
  beneficiaireId: string;
  montantTotal: number;
  modeDistribution: string;
  modePaiement: string;
  compteId?: string;
  reference: string;
  tourNumero: number;
}

/**
 * Distribue le gain d'un tour de tontine à un bénéficiaire
 *
 * Supporte deux modes de distribution :
 * - CASH_WITHDRAWAL: Retrait espèces au guichet (via session caisse)
 * - ACCOUNT_TRANSFER: Virement sur compte épargne du bénéficiaire
 *
 * @param tontineId - ID de la tontine
 * @param membreId - ID du membre bénéficiaire
 * @param tourNumero - Numéro du tour de distribution
 * @param modeDistribution - CASH_WITHDRAWAL ou ACCOUNT_TRANSFER
 * @param modePaiement - Mode de paiement (CASH, MOBILE_MONEY, TRANSFER)
 * @param sessionCaisseId - ID de la session caisse (requis pour CASH_WITHDRAWAL)
 * @param compteId - ID du compte épargne (requis pour ACCOUNT_TRANSFER)
 * @param userId - ID de l'utilisateur effectuant l'opération
 * @param notes - Notes optionnelles
 */
export async function distributeTontineGain(
  tontineId: string,
  membreId: string,
  tourNumero: number,
  modeDistribution: string,
  modePaiement: string,
  sessionCaisseId?: string,
  compteId?: string,
  userId?: string,
  notes?: string
): Promise<DistributionResult> {
  // 1. Validation des paramètres selon le mode
  if (modeDistribution === ModeDistributionTontine.CASH_WITHDRAWAL && !sessionCaisseId) {
    throw new Error("Session caisse requise pour un retrait espèces");
  }
  if (modeDistribution === ModeDistributionTontine.ACCOUNT_TRANSFER && !compteId) {
    throw new Error("ID du compte requis pour un virement sur compte");
  }

  // 2. Récupérer les informations de la tontine
  const [tontineData] = await db
    .select({
      id: tontines.id,
      montantCotisation: tontines.montantCotisation,
      nombreMembres: tontines.nombreMembres,
      solde: tontines.solde,
      nom: tontines.nom
    })
    .from(tontines)
    .where(eq(tontines.id, tontineId));

  if (!tontineData) {
    throw new Error("Tontine non trouvée");
  }

  // 3. Récupérer le membre bénéficiaire
  const [membreData] = await db
    .select({
      id: membresTontine.id,
      clientId: membresTontine.clientId,
      aRecuBenefice: membresTontine.aRecuBenefice
    })
    .from(membresTontine)
    .where(and(
      eq(membresTontine.id, membreId),
      eq(membresTontine.tontineId, tontineId),
      eq(membresTontine.statut, DB_STATUT_MEMBRE_ACTIF)
    ));

  if (!membreData) {
    throw new Error("Membre non trouvé ou n'est pas actif dans cette tontine");
  }

  if (membreData.aRecuBenefice) {
    throw new Error("Ce membre a déjà reçu son bénéfice pour ce cycle");
  }

  // 4. Calculer le montant total de la distribution
  const montantTotal = Number(tontineData.montantCotisation) * (tontineData.nombreMembres || 0);

  // 5. Vérifier le solde disponible
  const soldeDisponible = Number(tontineData.solde || 0);
  if (soldeDisponible < montantTotal) {
    throw new Error(
      `Solde insuffisant. Disponible: ${soldeDisponible} FCFA, Requis: ${montantTotal} FCFA`
    );
  }

  // 6. Vérifier si une distribution existe déjà pour ce tour
  const [existingDistribution] = await db
    .select({ id: tontineDistributions.id })
    .from(tontineDistributions)
    .where(and(
      eq(tontineDistributions.tontineId, tontineId),
      eq(tontineDistributions.tourNumero, tourNumero)
    ));

  if (existingDistribution) {
    throw new Error("Une distribution existe déjà pour ce tour");
  }

  // 7. Exécuter dans une transaction avec ledger
  return await executeWithLedger<DistributionResult>(
    "TONTINE",
    {
      montant: montantTotal.toString(),
      sens: "DEBIT",
      clientId: membreData.clientId,
      tontineId,
      sessionCaisseId: modeDistribution === ModeDistributionTontine.CASH_WITHDRAWAL ? sessionCaisseId : undefined,
      typePaiement: "TONTINE_DISTRIBUTION",
      methodePaiement: modePaiement,
      metadata: {
        description: `Distribution Tontine Tour #${tourNumero}`,
        modeDistribution,
        beneficiaireId: membreId,
        notes
      }
    },
    async (tx, mouvement) => {
      // Créer la distribution
      const [distribution] = await tx
        .insert(tontineDistributions)
        .values({
          tontineId,
          membreId,
          tourNumero,
          montantTotal: montantTotal.toString(),
          dateDistribution: new Date(),
          modePaiement,
          referencePaiement: mouvement.reference,
          notes: notes || `Distribution automatique - Mode: ${modeDistribution === ModeDistributionTontine.CASH_WITHDRAWAL ? 'Retrait espèces' : 'Virement compte'}`
        })
        .returning();

      // Mettre à jour le solde de la tontine (débit)
      await tx.execute(sql`
        UPDATE tontines
        SET solde = COALESCE(solde, 0) - ${montantTotal},
            updated_at = NOW()
        WHERE id = ${tontineId}
      `);

      // Marquer le membre comme ayant reçu son bénéfice
      await tx
        .update(membresTontine)
        .set({
          aRecuBenefice: true,
          dateBenefice: new Date(),
          updatedAt: new Date()
        })
        .where(eq(membresTontine.id, membreId));

      // Traitement spécifique selon le mode de distribution
      if (modeDistribution === ModeDistributionTontine.ACCOUNT_TRANSFER && compteId) {
        // Créditer le compte épargne du bénéficiaire
        await tx.execute(sql`
          UPDATE comptes_epargne
          SET solde_courant = COALESCE(solde_courant, 0) + ${montantTotal},
              updated_at = NOW()
          WHERE id = ${compteId}
        `);

        // Note: On pourrait aussi créer une entrée dans les mouvements du compte
      } else if (modeDistribution === ModeDistributionTontine.CASH_WITHDRAWAL && sessionCaisseId) {
        // Débiter la session caisse (le montant sort en espèces)
        await tx.execute(sql`
          UPDATE sessions_caisse
          SET solde_courant = COALESCE(solde_courant, 0) - ${montantTotal},
              updated_at = NOW()
          WHERE id = ${sessionCaisseId}
        `);

        // Créer l'opération caisse
        const validatedUserId = await validateUserId(tx, userId);
        await tx.insert(operationsCaisse).values({
          sessionId: sessionCaisseId,
          mouvementId: mouvement.id,
          typeOperation: "TONTINE_DISTRIBUTION" as any,
          montant: montantTotal.toString(),
          methodePaiement: modePaiement as any,
          reference: `TON-DIST-${mouvement.reference}`,
          description: `Distribution Tontine "${tontineData.nom}" - Tour #${tourNumero}`,
          createdBy: validatedUserId
        });
      }

      const result: DistributionResult = {
        distributionId: distribution.id,
        beneficiaireId: membreId,
        montantTotal,
        modeDistribution,
        modePaiement,
        compteId: modeDistribution === ModeDistributionTontine.ACCOUNT_TRANSFER ? compteId : undefined,
        reference: mouvement.reference,
        tourNumero
      };

      return {
        result,
        // additionalEventData removed - distributionType is not part of the expected schema
      };
    },
    userId
  ).then(({ result }) => result);
}

export default {
  dispatchTontinePayment,
  getMemberTontineState,
  getMemberPaymentSummary,
  isTourFullyPaid,
  previewPaymentDispatch,
  distributeTontineGain
};
