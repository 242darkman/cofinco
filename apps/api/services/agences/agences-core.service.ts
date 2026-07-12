import { db } from "../../db";
import { agences, userAgences, coffresForts, comptesLiaison } from "@shared/schema";
import { villes } from "@shared/schema/operations";
import { regions } from "@shared/schema/geography";
import { pays as paysTable } from "@shared/schema/pays";
import { eq, and, ilike, or, desc, asc, sql, isNull } from "drizzle-orm";
import { logAudit } from "../../audit";
import { getWsInstance } from "../../ws-server";
import { TypeAgence, StatutAgence, StatutUser, StatutClient } from "@shared/enum/status-constants";
import { agencyStatusHistory } from "@shared/schema/agences";
import { currencyCode } from "@shared/config/currency";
import { normalizePhone } from "@shared/utils/phone";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Service:Agences:Core');

/**
 * Récupère la liste des agences avec filtres et tris
 */
export async function getAgencesList(params: {
  statut?: string;
  type?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  includeDeleted?: string;
}) {
  const { statut, type, search, sortBy = "nom", sortOrder = "asc", includeDeleted } = params;

  let query = db
    .select({
      id: agences.id,
      codeAgence: agences.codeAgence,
      nom: agences.nom,
      typeAgence: agences.typeAgence,
      adresse: agences.adresse,
      ville: villes.nom,
      villeId: agences.villeId,
      region: regions.nom,
      pays: paysTable.nomFr,
      paysId: villes.paysId,
      telephone: agences.telephone,
      email: agences.email,
      responsableId: agences.responsableId,
      responsableNom: agences.responsableNom,
      responsablePhone: agences.responsablePhone,
      statut: agences.statut,
      dateOuverture: agences.dateOuverture,
      latitude: agences.latitude,
      longitude: agences.longitude,
      notes: agences.notes,
      activatedAt: agences.activatedAt,
      suspendedAt: agences.suspendedAt,
      suspendedReason: agences.suspendedReason,
      deletedAt: agences.deletedAt,
      createdAt: agences.createdAt,
      updatedAt: agences.updatedAt,
      nombreEmployes: sql<number>`(
        SELECT COUNT(*)::int FROM employes e
        INNER JOIN users u ON e.user_id = u.id
        WHERE e.agence_id = agences.id AND u.statut = ${StatutUser.ACTIVE}
      )`,
      nombreClients: sql<number>`(
        SELECT COUNT(*)::int FROM clients c
        INNER JOIN users u ON c.user_id = u.id
        WHERE c.agence_id = agences.id AND u.statut = ${StatutClient.ACTIVE}
      )`,
    })
    .from(agences)
    .leftJoin(villes, eq(agences.villeId, villes.id))
    .leftJoin(regions, eq(villes.regionId, regions.id))
    .leftJoin(paysTable, eq(villes.paysId, paysTable.id));

  const conditions = [];

  if (includeDeleted !== "true") {
    conditions.push(isNull(agences.deletedAt));
  }

  if (statut && statut !== "all") {
    conditions.push(eq(agences.statut, statut as string));
  }
  if (type && type !== "all") {
    conditions.push(eq(agences.typeAgence, type as any));
  }
  if (search) {
    const searchTerm = `%${search}%`;
    conditions.push(
      or(
        ilike(agences.nom, searchTerm),
        ilike(agences.codeAgence, searchTerm),
        ilike(villes.nom, searchTerm)
      )
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const sortColumn = sortBy === "date" ? agences.createdAt : agences.nom;
  query = query.orderBy(sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn)) as typeof query;

  return await query;
}

/**
 * Récupère les détails d'une agence spécifique
 */
export async function getAgenceById(id: string) {
  const [agence] = await db
    .select({
      id: agences.id,
      codeAgence: agences.codeAgence,
      nom: agences.nom,
      typeAgence: agences.typeAgence,
      adresse: agences.adresse,
      ville: villes.nom,
      villeId: agences.villeId,
      region: regions.nom,
      pays: paysTable.nomFr,
      paysId: villes.paysId,
      telephone: agences.telephone,
      email: agences.email,
      responsableId: agences.responsableId,
      responsableNom: agences.responsableNom,
      responsablePhone: agences.responsablePhone,
      statut: agences.statut,
      dateOuverture: agences.dateOuverture,
      latitude: agences.latitude,
      longitude: agences.longitude,
      notes: agences.notes,
      activatedAt: agences.activatedAt,
      activatedBy: agences.activatedBy,
      suspendedAt: agences.suspendedAt,
      suspendedReason: agences.suspendedReason,
      deletedAt: agences.deletedAt,
      createdAt: agences.createdAt,
      updatedAt: agences.updatedAt,
    })
    .from(agences)
    .leftJoin(villes, eq(agences.villeId, villes.id))
    .leftJoin(regions, eq(villes.regionId, regions.id))
    .leftJoin(paysTable, eq(villes.paysId, paysTable.id))
    .where(eq(agences.id, id));

  if (!agence) {
    throw new Error("Agence non trouvée");
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userAgences)
    .where(and(eq(userAgences.agenceId, id), eq(userAgences.actif, true)));

  return {
    ...agence,
    nombreUtilisateurs: Number(countResult?.count || 0)
  };
}

/**
 * Crée une nouvelle agence (avec coffre-fort atomique)
 */
export async function createAgence(data: any, userId: string, req: any) {
  const existing = await db
    .select()
    .from(agences)
    .where(eq(agences.codeAgence, data.code_agence || data.codeAgence));

  if (existing.length > 0) {
    throw new Error("Ce code agence existe déjà");
  }

  let lat = data.latitude;
  let lng = data.longitude;
  const villeId = data.villeId || data.ville_id;

  if (villeId) {
    const [villeData] = await db
      .select({
        latitude: villes.latitude,
        longitude: villes.longitude,
      })
      .from(villes)
      .where(eq(villes.id, villeId));

    if (villeData) {
      lat = lat ?? (villeData.latitude ? Number(villeData.latitude) : undefined);
      lng = lng ?? (villeData.longitude ? Number(villeData.longitude) : undefined);
    }
  }

  const result = await db.transaction(async (tx) => {
    const [newAgence] = await tx
      .insert(agences)
      .values({
        codeAgence: data.code_agence || data.codeAgence,
        nom: data.nom,
        typeAgence: data.type_agence || data.typeAgence || TypeAgence.SECONDARY,
        adresse: data.adresse,
        villeId: villeId || null,
        telephone: normalizePhone(data.telephone),
        email: data.email,
        responsableId: data.responsable_id || data.responsableId,
        responsableNom: data.responsable_nom || data.responsableNom,
        responsablePhone: normalizePhone(data.responsable_phone || data.responsablePhone),
        statut: StatutAgence.DRAFT,
        dateOuverture: data.date_ouverture || data.dateOuverture,
        latitude: lat,
        longitude: lng,
        notes: data.notes
      })
      .returning();

    const coffreCode = `CF-${newAgence.codeAgence}`;
    const coffreNom = `Coffre-fort ${newAgence.nom}`;

    const [newCoffre] = await tx
      .insert(coffresForts)
      .values({
        code: coffreCode,
        nom: coffreNom,
        ownerType: "AGENCE",
        ownerId: newAgence.id,
        devise: currencyCode(),
        solde: "0",
        plafondEncaisse: data.plafondEncaisseCoffre?.toString() || null,
        soldeMinimum: data.soldeMinimumCoffre?.toString() || "0",
        statut: "ACTIVE",
      })
      .returning();

    const [newCompteLiaison] = await tx
      .insert(comptesLiaison)
      .values({
        code: `LIAISON-${newAgence.codeAgence}`,
        intitule: `Compte de liaison - ${newAgence.nom}`,
        numeroComptable: "581200",
        entiteType: "AGENCE",
        entiteId: newAgence.id,
        soldeCourant: "0",
        actif: true,
      })
      .returning();

    await tx
      .insert(agencyStatusHistory)
      .values({
        agenceId: newAgence.id,
        fromStatus: null,
        toStatus: StatutAgence.DRAFT,
        changedBy: userId,
      });

    return { agence: newAgence, coffre: newCoffre, compteLiaison: newCompteLiaison };
  });

  await logAudit(req, "CREATE", "agences", result.agence.id, {
    nom: result.agence.nom,
    codeAgence: result.agence.codeAgence,
    coffreId: result.coffre.id,
    compteLiaisonId: result.compteLiaison.id
  });

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_new', id: result.agence.id } });
  }

  return result;
}

/**
 * Modifie une agence existante
 */
export async function updateAgence(id: string, data: any, req: any) {
  let lat = data.latitude;
  let lng = data.longitude;
  const villeId = data.villeId || data.ville_id;

  if (villeId) {
    const [villeData] = await db
      .select({
        latitude: villes.latitude,
        longitude: villes.longitude,
      })
      .from(villes)
      .where(eq(villes.id, villeId));

    if (villeData) {
      lat = lat ?? (villeData.latitude ? Number(villeData.latitude) : undefined);
      lng = lng ?? (villeData.longitude ? Number(villeData.longitude) : undefined);
    }
  }

  const [updated] = await db
    .update(agences)
    .set({
      nom: data.nom,
      typeAgence: data.type_agence || data.typeAgence,
      adresse: data.adresse,
      villeId: villeId || undefined,
      telephone: data.telephone ? normalizePhone(data.telephone) : data.telephone,
      email: data.email,
      responsableId: data.responsable_id || data.responsableId,
      responsableNom: data.responsable_nom || data.responsableNom,
      responsablePhone: normalizePhone(data.responsable_phone || data.responsablePhone),
      dateOuverture: data.date_ouverture || data.dateOuverture,
      latitude: lat,
      longitude: lng,
      notes: data.notes,
      updatedAt: new Date()
    })
    .where(eq(agences.id, id))
    .returning();

  if (!updated) {
    throw new Error("Agence non trouvée");
  }

  await logAudit(req, "UPDATE", "agences", id, { changes: data });

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_updated', id } });
  }

  return updated;
}

/**
 * Supprime (soft delete) une agence
 */
export async function deleteAgence(id: string, req: any) {
  const [activeCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agences)
    .where(and(isNull(agences.deletedAt), eq(agences.statut, StatutAgence.ACTIVE)));

  if (Number(activeCount?.count || 0) <= 1) {
    throw new Error("Impossible de supprimer la dernière agence active");
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userAgences)
    .where(and(eq(userAgences.agenceId, id), eq(userAgences.actif, true)));

  if (Number(countResult?.count || 0) > 0) {
    throw new Error("Impossible de supprimer cette agence car des utilisateurs y sont affectés");
  }

  const [deleted] = await db
    .update(agences)
    .set({
      statut: StatutAgence.INACTIVE,
      deletedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(agences.id, id))
    .returning();

  if (!deleted) {
    throw new Error("Agence non trouvée");
  }

  await logAudit(req, "DELETE", "agences", id, { nom: deleted.nom });

  const wsInstance = getWsInstance();
  if (wsInstance) {
    wsInstance.broadcast({ type: "AGENCE_UPDATE", payload: { type: 'agence_deleted', id } });
  }

  return deleted;
}
