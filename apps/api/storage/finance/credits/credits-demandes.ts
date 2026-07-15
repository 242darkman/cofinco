import type { StatutDemandeDz } from "@shared/enum/enums";
import { DureeUnite, StatutDemande } from "@shared/enum/status-constants";
import { validateDemandeTransition } from "@shared/machines/demande-workflow";
import {
  agences,
  clients,
  demandesCredit,
  users,
  type DemandeCredit, type InsertDemandeCredit
} from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "../../../db";
import { createLogger } from "../../../lib/logger";

const logger = createLogger('Finance');

export async function getDemandeCredit(id: string, includeDeleted = false): Promise<DemandeCredit | undefined> {
  const conditions = [eq(demandesCredit.id, id)];
  if (!includeDeleted) {
    conditions.push(sql`${demandesCredit.deletedAt} IS NULL`);
  }

  const results = await db.select({
    demande: demandesCredit,
    client: clients,
    user: users,
    agence: agences
  })
  .from(demandesCredit)
  .leftJoin(clients, eq(demandesCredit.clientId, clients.id))
  .leftJoin(users, eq(clients.userId, users.id))
  .leftJoin(agences, eq(clients.agenceId, agences.id))
  .where(and(...conditions));

  if (!results.length) return undefined;

  const { demande, client, user, agence } = results[0];
  return {
    ...demande,
    clients: client ? {
      id: client.id,
      nom: user?.nom,
      prenom: user?.prenom,
      email: user?.email,
      telephone: user?.telephone,
      photoProfile: user?.photoProfile,
      tauxRemboursement: Number(client.tauxRemboursement) || 0,
      creditTotal: Number(client.creditTotal) || 0,
      agence: agence?.nom,
      agenceId: client.agenceId,
    } : undefined
  } as DemandeCredit;
}

export async function getDemandesByClient(clientId: string): Promise<DemandeCredit[]> {
  return db.select().from(demandesCredit)
    .where(and(eq(demandesCredit.clientId, clientId), sql`${demandesCredit.deletedAt} IS NULL`))
    .orderBy(desc(demandesCredit.createdAt));
}

export async function getAllDemandes(filter: { agence?: string, agenceId?: string, includeDeleted?: boolean } = {}): Promise<DemandeCredit[]> {
  const conditions = [];

  if (!filter.includeDeleted) {
      conditions.push(sql`${demandesCredit.deletedAt} IS NULL`);
  }

  // Utilisation de agenceId directement si fourni (plus sûr)
  if (filter.agenceId && filter.agenceId !== "all") {
    conditions.push(eq(clients.agenceId, filter.agenceId));
  } else if (filter.agence && filter.agence !== "all") {
    // Repli : rechercher l'agenceId par nom
    const [agenceRecord] = await db.select({ id: agences.id })
      .from(agences)
      .where(eq(agences.nom, filter.agence))
      .limit(1);
    if (agenceRecord) {
      conditions.push(eq(clients.agenceId, agenceRecord.id));
    }
  }

  let baseQuery = db.select({
    demande: demandesCredit,
    client: clients,
    user: users,
    agence: agences
  })
  .from(demandesCredit)
  .leftJoin(clients, eq(demandesCredit.clientId, clients.id))
  .leftJoin(users, eq(clients.userId, users.id))
  .leftJoin(agences, eq(clients.agenceId, agences.id))
  .$dynamic();

  if (conditions.length > 0) {
    baseQuery = baseQuery.where(and(...conditions));
  }

  const results = await baseQuery.orderBy(desc(demandesCredit.createdAt));

  return results.map(({ demande, client, user, agence }) => ({
    ...demande,
    numeroDemande: demande.numeroDemande,
    clients: client ? {
      id: client.id,
      nom: user?.nom,
      prenom: user?.prenom,
      email: user?.email,
      telephone: user?.telephone,
      photoProfile: user?.photoProfile,
      tauxRemboursement: Number(client.tauxRemboursement) || 0,
      creditTotal: Number(client.creditTotal) || 0,
      agence: agence?.nom,
      agenceId: client.agenceId,
      revenuMensuel: client.revenuMensuel,
      revenuJournalier: client.revenuJournalier,
      typeRevenu: client.typeRevenu,
    } : undefined
  })) as DemandeCredit[];
}

export async function createDemandeCredit(insertDemande: InsertDemandeCredit): Promise<DemandeCredit> {
  // Import dynamique pour éviter les dépendances circulaires
  const { calculerScoreMicrofinance } = await import("../../../services/microfinance-scoring");
  const { recalculateClientScore } = await import("../../../services/scoring-engine");

  // Calculer automatiquement le score de crédit
  let scoreCredit: number | null = null;
  try {
    // Convertir la durée en mois selon l'unité
    let dureeMois = insertDemande.dureeValeur || 1;
    if (insertDemande.dureeUnite === DureeUnite.DAY) {
      dureeMois = Math.ceil(dureeMois / 30);
    } else if (insertDemande.dureeUnite === DureeUnite.WEEK) {
      dureeMois = Math.ceil(dureeMois / 4);
    }

    const scoringResult = await calculerScoreMicrofinance({
      clientId: insertDemande.clientId,
      montantDemande: parseFloat(insertDemande.montantDemande?.toString() || '0'),
      dureeMois,
      revenuMensuel: insertDemande.revenusMensuels ? parseFloat(insertDemande.revenusMensuels.toString()) : undefined,
      chargesMensuelles: insertDemande.chargesMensuelles ? parseFloat(insertDemande.chargesMensuelles.toString()) : undefined
    });

    scoreCredit = scoringResult.score;

    // Recalculer le score global du client via le scoring engine
    await recalculateClientScore(insertDemande.clientId).catch((err: any) => logger.error({ err }, 'Erreur lors de la mise à jour du score client'));
  } catch (error) {
    logger.error({ err: error }, 'Erreur lors du calcul du score de crédit');
    // Continuer sans score en cas d'erreur
  }

  // Forcer le statut "PENDING_FEES" - les frais d'engagement sont obligatoires avant toute enquête
  const demandeAvecStatut = {
    ...insertDemande,
    statut: StatutDemande.PENDING_FEES as StatutDemandeDz, // Toujours "PENDING_FEES" à la création
    fraisEngagementPayes: false,
    scoreCredit: scoreCredit ?? insertDemande.scoreCredit ?? null
  };
  const [demande] = await db.insert(demandesCredit).values(demandeAvecStatut).returning();
  return demande;
}

export async function updateDemandeCredit(id: string, updateData: Partial<InsertDemandeCredit>, tx?: PgTransaction<any, any, any>): Promise<DemandeCredit | undefined> {
  // Garde de machine à état : Valider la transition de statut s'il est mis à jour
  if (updateData.statut) {
    const [currentDemande] = await (tx || db).select({ statut: demandesCredit.statut }).from(demandesCredit).where(eq(demandesCredit.id, id));
    if (currentDemande && currentDemande.statut) {
      // validateDemandeTransition lève une DemandeTransitionError si la transition est invalide
      validateDemandeTransition(currentDemande.statut, updateData.statut);
    }
  }

  const [demande] = await (tx || db).update(demandesCredit).set(updateData).where(eq(demandesCredit.id, id)).returning();
  return demande || undefined;
}

export async function deleteDemandeCredit(id: string): Promise<boolean> {
  const [demande] = await db.update(demandesCredit)
    .set({ 
      deletedAt: new Date(),
      statut: StatutDemande.DELETED 
    })
    .where(eq(demandesCredit.id, id))
    .returning();
  return !!demande;
}

export async function cancelDemandeCredit(id: string, motif?: string): Promise<DemandeCredit | undefined> {
  // Garde de machine à état : Valider la transition vers 'CANCELLED'
  const [currentDemande] = await db.select({ statut: demandesCredit.statut }).from(demandesCredit).where(eq(demandesCredit.id, id));
  if (currentDemande && currentDemande.statut) {
    // validateDemandeTransition lève une DemandeTransitionError si la transition est invalide
    validateDemandeTransition(currentDemande.statut, StatutDemande.CANCELLED);
  }

  const [demande] = await db.update(demandesCredit)
    .set({
      statut: StatutDemande.CANCELLED as StatutDemandeDz,
      motifRejet: motif // On utilise motifRejet pour stocker la raison de l'annulation
    })
    .where(eq(demandesCredit.id, id))
    .returning();
  return demande || undefined;
}
