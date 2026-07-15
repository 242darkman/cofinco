/**
 * Requêtes sur les comptes clients, transactions de compte, plans et
 * objectifs d'épargne.
 */
import { enrichCompteData } from "./misc";
import {
  comptes,
  transactionsCompte,
  plansEpargne,
  objectifsEpargne,
  clients,
  agences,
  users,
  produitsCompte,
  type Compte, type InsertCompte,
  type TransactionCompte, type InsertTransactionCompte,
  type PlanEpargne, type InsertPlanEpargne,
  type ObjectifEpargne, type InsertObjectifEpargne,
} from "@shared/schema";
import type { StatutCompteDz, TypeCompteDz } from "@shared/enum/enums";
import { DecaissementInsufficientFundsError, InsufficientFundsError, type InsufficientFundsErrorData } from "../errors";
import { db } from "../../db";
import { eq, desc, and, or, count, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

// Réexportation pour compatibilité
export { DecaissementInsufficientFundsError, InsufficientFundsError, type InsufficientFundsErrorData };

export async function getCompte(id: string): Promise<Compte | undefined> {
    const [result] = await db
      .select({ compte: comptes, produit: produitsCompte })
      .from(comptes)
      .leftJoin(produitsCompte, eq(comptes.produitId, produitsCompte.id))
      .where(eq(comptes.id, id))
      .limit(1);

    if (!result?.compte) return undefined;

    const produitInfo = result.produit
      ? {
          id: result.produit.id,
          code: result.produit.code,
          nom: result.produit.nom,
          typeCompte: result.produit.typeCompte,
          tauxInteret: Number(result.produit.tauxInteret || 0),
          taux_interet: Number(result.produit.tauxInteret || 0),
        }
      : null;

    return {
      ...enrichCompteData(result.compte),
      produit: produitInfo,
      taux_interet: produitInfo?.tauxInteret ?? undefined,
    } as any;
  }

  export async function getComptesByClient(clientId: string): Promise<Compte[]> {
    const results = await db
      .select({ compte: comptes, produit: produitsCompte })
      .from(comptes)
      .leftJoin(produitsCompte, eq(comptes.produitId, produitsCompte.id))
      .where(eq(comptes.clientId, clientId));

    return results.map(({ compte, produit }) => {
      const produitInfo = produit
        ? {
            id: produit.id,
            code: produit.code,
            nom: produit.nom,
            typeCompte: produit.typeCompte,
            tauxInteret: Number(produit.tauxInteret || 0),
            taux_interet: Number(produit.tauxInteret || 0),
          }
        : null;

      return {
        ...enrichCompteData(compte),
        produit: produitInfo,
        taux_interet: produitInfo?.tauxInteret ?? undefined,
      } as any;
    });
  }

  export async function getAllComptes(filter: { agenceId?: string; agence?: string } = {}): Promise<Compte[]> {
    // Determine agency ID to filter by
    let agenceIdToFilter: string | undefined;

    if (filter.agenceId) {
      agenceIdToFilter = filter.agenceId;
    } else if (filter.agence) {
      // Support hérité : recherche par nom d'agence
      const agenceResult = await db.select({ id: agences.id }).from(agences).where(eq(agences.nom, filter.agence)).limit(1);
      if (agenceResult.length > 0) {
        agenceIdToFilter = agenceResult[0].id;
      }
    }

    if (agenceIdToFilter) {
      const results = await db.select({ compte: comptes })
        .from(comptes)
        .innerJoin(clients, eq(comptes.clientId, clients.id))
        .where(eq(clients.agenceId, agenceIdToFilter))
        .orderBy(desc(comptes.createdAt));
      return results.map(r => r.compte);
    }
    return db.select().from(comptes).orderBy(desc(comptes.createdAt));
  }

  /**
   * Get all comptes with client information, search, and pagination support
   * @param filter - Agency filter
   * @param options - Search and pagination options
   */
  export async function getAllComptesWithClients(
    filter: { agenceId?: string; agence?: string } = {},
    options: { search?: string; page?: number; limit?: number; typeCompte?: string; statut?: string } = {}
  ): Promise<{ data: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    // Construction des conditions
    const conditions: any[] = [];

    // Filtre d'agence - préférer agenceId (UUID) à agence (nom)
    if (filter.agenceId && filter.agenceId !== 'all') {
      conditions.push(eq(clients.agenceId, filter.agenceId));
    } else if (filter.agence && filter.agence !== 'all') {
      // Support hérité : recherche par nom d'agence
      const agenceResult = await db.select({ id: agences.id }).from(agences).where(eq(agences.nom, filter.agence)).limit(1);
      if (agenceResult.length > 0) {
        conditions.push(eq(clients.agenceId, agenceResult[0].id));
      }
    }

    // Filtre de type
    if (options.typeCompte) {
      conditions.push(eq(comptes.typeCompte, options.typeCompte as TypeCompteDz));
    }

    // Filtre de statut
    if (options.statut) {
      conditions.push(eq(comptes.statut, options.statut as StatutCompteDz));
    }

    // Filtre de recherche (par nom de client ou numéro de compte)
    if (options.search && options.search.trim()) {
      const searchTerm = `%${options.search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          sql`LOWER(${users.nom}) LIKE ${searchTerm}`,
          sql`LOWER(${users.prenom}) LIKE ${searchTerm}`,
          sql`LOWER(${comptes.numeroCompte}) LIKE ${searchTerm}`,
          sql`LOWER(${users.telephone}) LIKE ${searchTerm}`
        )
      );
    }

    // Comptage du total
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countQuery = db.select({ count: count() })
      .from(comptes)
      .leftJoin(clients, eq(comptes.clientId, clients.id))
      .leftJoin(users, eq(clients.userId, users.id));

    const countResult = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    const total = countResult[0]?.count || 0;

    // Récupération des données avec pagination
    let dataQuery = db.select({
      compte: comptes,
      client: clients,
      user: users,
      produit: produitsCompte,
      agence: agences,
    })
    .from(comptes)
    .leftJoin(clients, eq(comptes.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .leftJoin(produitsCompte, eq(comptes.produitId, produitsCompte.id))
    .leftJoin(agences, eq(clients.agenceId, agences.id))
    .orderBy(desc(comptes.createdAt))
    .limit(limit)
    .offset(offset);

    const results = whereClause
      ? await dataQuery.where(whereClause)
      : await dataQuery;

    // Transformation des données avec les informations du client incluses
    const data = results.map(({ compte, client, user, produit, agence }) => {
      const produitInfo = produit
        ? {
            id: produit.id,
            code: produit.code,
            nom: produit.nom,
            typeCompte: produit.typeCompte,
            tauxInteret: Number(produit.tauxInteret || 0),
            taux_interet: Number(produit.tauxInteret || 0),
          }
        : null;

      return {
        ...enrichCompteData(compte),
        produit: produitInfo,
        taux_interet: produitInfo?.tauxInteret ?? undefined,
      // Informations du client incluses
      clients: client ? {
        id: client.id,
        nom: user?.nom,
        prenom: user?.prenom,
        telephone: user?.telephone,
        email: user?.email,
        agence: agence?.nom,
        photoProfile: user?.photoProfile,
      } : null
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  export async function createCompte(insertCompte: InsertCompte): Promise<Compte> {
    const [compte] = await db.insert(comptes).values(insertCompte).returning();
    return compte;
  }

  export async function updateCompte(id: string, updateData: Partial<InsertCompte>): Promise<Compte | undefined> {
    // Suppression des champs financiers — le solde ne doit être mis à jour que via executeWithLedger()
    const { soldeCourant, ...safeData } = updateData as any;
    if (soldeCourant !== undefined) {
      console.warn(`[GUARD] updateCompte: stripped soldeCourant from generic update (id=${id})`);
    }
    const [compte] = await db.update(comptes).set({ ...safeData, updatedAt: new Date() }).where(eq(comptes.id, id)).returning();
    return compte || undefined;
  }

  export async function updateClientAccount(
    id: string,
    updateData: { typeCompte?: string; tauxInteret?: string; statut?: string; solde?: string }
  ): Promise<Compte | undefined> {
    // Suppression des champs financiers — le solde ne doit être mis à jour que via executeWithLedger()
    const { solde, ...safeData } = updateData;
    if (solde !== undefined) {
      console.warn(`[GUARD] updateClientAccount: stripped solde from generic update (id=${id})`);
    }
    const [compte] = await db.update(comptes)
      .set({ ...safeData, updatedAt: new Date() } as any)
      .where(eq(comptes.id, id))
      .returning();
    return compte || undefined;
  }

  export async function getTransactionCompte(id: string): Promise<TransactionCompte | undefined> {
    const [transaction] = await db.select().from(transactionsCompte).where(eq(transactionsCompte.id, id));
    return transaction || undefined;
  }

  export async function getTransactionsByCompte(compteId: string): Promise<TransactionCompte[]> {
    return db.select().from(transactionsCompte).where(eq(transactionsCompte.compteId, compteId)).orderBy(desc(transactionsCompte.createdAt));
  }

  export async function createTransactionCompte(insertTransaction: InsertTransactionCompte, tx?: PgTransaction<any, any, any>): Promise<TransactionCompte> {
    const [transaction] = await (tx || db).insert(transactionsCompte).values(insertTransaction).returning();
    return transaction;
  }

  export async function getPlanEpargne(id: string): Promise<PlanEpargne | undefined> {
    const [plan] = await db.select().from(plansEpargne).where(eq(plansEpargne.id, id));
    return plan || undefined;
  }

  export async function getPlansByCredit(creditId: string): Promise<PlanEpargne[]> {
    return db.select().from(plansEpargne).where(eq(plansEpargne.creditId, creditId));
  }

  export async function getPlansByClient(clientId: string): Promise<PlanEpargne[]> {
    return db.select().from(plansEpargne).where(eq(plansEpargne.clientId, clientId)).orderBy(desc(plansEpargne.createdAt));
  }

  export async function createPlanEpargne(insertPlan: InsertPlanEpargne): Promise<PlanEpargne> {
    const [plan] = await db.insert(plansEpargne).values(insertPlan).returning();
    return plan;
  }

  export async function getObjectifEpargne(id: string): Promise<ObjectifEpargne | undefined> {
    const [objectif] = await db.select().from(objectifsEpargne).where(eq(objectifsEpargne.id, id));
    return objectif || undefined;
  }

  export async function getObjectifsByCompte(compteId: string): Promise<ObjectifEpargne[]> {
    return db.select().from(objectifsEpargne).where(eq(objectifsEpargne.compteId, compteId)).orderBy(desc(objectifsEpargne.createdAt));
  }

  export async function createObjectifEpargne(insertObjectif: InsertObjectifEpargne): Promise<ObjectifEpargne> {
    const [objectif] = await db.insert(objectifsEpargne).values(insertObjectif).returning();
    return objectif;
  }

  export async function updateObjectifEpargne(id: string, updateData: Partial<InsertObjectifEpargne>): Promise<ObjectifEpargne | undefined> {
    const [objectif] = await db.update(objectifsEpargne).set(updateData).where(eq(objectifsEpargne.id, id)).returning();
    return objectif || undefined;
  }

  export async function deleteObjectifEpargne(id: string): Promise<boolean> {
    await db.update(objectifsEpargne).set({ actif: false }).where(eq(objectifsEpargne.id, id));
    return true;
  }
