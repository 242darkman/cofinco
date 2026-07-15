/**
 * Requêtes sur les mouvements financiers (grand livre), décaissements en
 * attente et portefeuille client.
 * Extrait de operations.ts pour respecter la limite de 400 lignes.
 */
import {
  credits,
  comptes,
  clients,
  users,
  mouvementsFinanciers,
  type Credit,
  type Compte,
} from "@shared/schema";
import { TypeOperationCaisse, StatutTransaction } from "@shared/enum/status-constants";
import type {
  StatutCreditDz,
  TypePaiementTerrainDz,
  SourceModuleDz,
  DisbursementStatusDz,
  DisbursementChannelDz,
} from "@shared/enum/enums";
import type { MouvementFinancier } from "../../services/ledger";
import { db } from "../../db";
import { eq, desc, and, or, gte, lte, inArray, isNull } from "drizzle-orm";

// Types de retrait depuis typePaiementTerrainEnum (EN)
const WITHDRAWAL_TYPES = [
  TypeOperationCaisse.WITHDRAWAL_SAVINGS,
  TypeOperationCaisse.WITHDRAWAL_CURRENT,
  TypeOperationCaisse.WITHDRAWAL_BLOCKED,
  TypeOperationCaisse.TONTINE_WITHDRAWAL,
] as const;

// Types de dépôt depuis typePaiementTerrainEnum (EN)
const DEPOSIT_TYPES = [
  TypeOperationCaisse.DEPOSIT_SAVINGS,
  TypeOperationCaisse.DEPOSIT_CURRENT,
  TypeOperationCaisse.DEPOSIT_BLOCKED,
  TypeOperationCaisse.TONTINE_CONTRIBUTION,
] as const;

/**
 * Get movements by client and date range from mouvementsFinanciers (source of truth)
 * Supports generic Filtre de types: 'retrait' for all withdrawals, 'depot' for all deposits
 */
export async function getMouvementsByClientAndDateRange(
  clientId: string,
  start: Date,
  end: Date,
  type?: 'retrait' | 'depot' | string
) {
  const conditions = [
    eq(mouvementsFinanciers.clientId, clientId),
    gte(mouvementsFinanciers.dateOperation, start),
    lte(mouvementsFinanciers.dateOperation, end),
    eq(mouvementsFinanciers.statut, StatutTransaction.POSTED), // Ne compter que les transactions postées
  ];

  if (type) {
    if (type === 'retrait') {
      // Tous les types de retrait
      conditions.push(inArray(mouvementsFinanciers.typePaiement, [...WITHDRAWAL_TYPES]));
    } else if (type === 'depot') {
      // Tous les types de dépôt
      conditions.push(inArray(mouvementsFinanciers.typePaiement, [...DEPOSIT_TYPES]));
    } else {
      // Valeur d'énumération directe
      conditions.push(eq(mouvementsFinanciers.typePaiement, type as TypePaiementTerrainDz));
    }
  }

  return db.select().from(mouvementsFinanciers)
    .where(and(...conditions))
    .orderBy(desc(mouvementsFinanciers.dateOperation));
}

/**
 * Get pending loan disbursements for a specific agency
 * Used by the cashier dashboard to see which loans need to be paid out
 */
export async function getPendingLoanDisbursements(agenceId?: string, caisseId?: string): Promise<Array<{
    credit: Credit;
    client: { id: string; nom: string; prenom: string | null; photoUrl?: string | null };
    demande?: any;
}>> {
    // Build base conditions
    const baseConditions = and(
        eq(credits.statut, 'WAITING_DISBURSEMENT' as StatutCreditDz),
        eq(credits.disbursementChannel, 'CASH' as DisbursementChannelDz),
        eq(credits.disbursementStatus, 'PENDING' as DisbursementStatusDz),
        agenceId ? eq(credits.agenceId, agenceId) : undefined,
        caisseId ? or(eq(credits.targetCaisseId, caisseId), isNull(credits.targetCaisseId)) : undefined,
    );

    const results = await db.select({
        credit: credits,
        clientId: clients.id,
        userNom: users.nom,
        userPrenom: users.prenom,
        userPhotoProfile: users.photoProfile
    })
    .from(credits)
    .innerJoin(clients, eq(credits.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .where(baseConditions)
    .orderBy(desc(credits.createdAt));

    return results.map(r => ({
        credit: r.credit,
        client: {
            id: r.clientId,
            nom: r.userNom || 'N/A',
            prenom: r.userPrenom,
            photoUrl: r.userPhotoProfile
        }
    }));
}

/**
 * Get mouvements financiers with filtering
 */
export async function getMouvementsFinanciers(filter: {
  sourceModule?: string;
  clientId?: string;
  compteId?: string;
  creditId?: string;
  sessionCaisseId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
} = {}): Promise<MouvementFinancier[]> {
  const conditions = [];

  if (filter.sourceModule) {
    conditions.push(eq(mouvementsFinanciers.sourceModule, filter.sourceModule as SourceModuleDz));
  }
  if (filter.clientId) {
    conditions.push(eq(mouvementsFinanciers.clientId, filter.clientId));
  }
  if (filter.compteId) {
    conditions.push(eq(mouvementsFinanciers.compteId, filter.compteId));
  }
  if (filter.creditId) {
    conditions.push(eq(mouvementsFinanciers.creditId, filter.creditId));
  }
  if (filter.sessionCaisseId) {
    conditions.push(eq(mouvementsFinanciers.sessionCaisseId, filter.sessionCaisseId));
  }
  if (filter.from) {
    conditions.push(gte(mouvementsFinanciers.dateOperation, filter.from));
  }
  if (filter.to) {
    conditions.push(lte(mouvementsFinanciers.dateOperation, filter.to));
  }

  let query = db.select().from(mouvementsFinanciers).$dynamic();

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  query = query.orderBy(desc(mouvementsFinanciers.dateOperation));

  if (filter.limit) {
    query = query.limit(filter.limit);
  }

  return query;
}

/**
 * Get client portfolio (accounts, credits, tontines)
 */
export async function getClientPortfolio(clientId: string): Promise<{
  comptes: Compte[];
  credits: Credit[];
  tontines: any[];
}> {
  const [clientsComptes, creditsResult] = await Promise.all([
    db.select().from(comptes).where(eq(comptes.clientId, clientId)),
    db.select().from(credits).where(eq(credits.clientId, clientId)),
  ]);

  // Get tontines via membresTontine
  const { membresTontine, tontines } = await import("@shared/schema");
  const memberships = await db.select({
    membre: membresTontine,
    tontine: tontines,
  })
    .from(membresTontine)
    .leftJoin(tontines, eq(membresTontine.tontineId, tontines.id))
    .where(eq(membresTontine.clientId, clientId));

  return {
    comptes: clientsComptes,
    credits: creditsResult,
    tontines: memberships.map(m => ({
      ...m.tontine,
      membre: m.membre,
    })),
  };
}
