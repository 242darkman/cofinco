import { clients, typesMarches, tags, clientTags, clientActivities, users, agences, historiquePoints, userRoles } from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { StatutUser, SegmentClient } from "@shared/enum/status-constants";
import { type Client, type InsertClient, type ClientTag, type InsertClientTag, type Tag, type InsertTag, type ClientActivity, type InsertClientActivity, type User, type InsertHistoriquePoints } from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, isNull, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { StorageService } from "../services/storage-service";
import { normalizeNom, normalizePrenom } from "./name-utils";
import { createLogger } from "../lib/logger";

const logger = createLogger('Clients');

// ============================================
// TYPES ET SCHEMAS API
// ============================================

/**
 * Type pour client avec données utilisateur (pour les lectures)
 * Les champs d'identité viennent de la table users (source de vérité)
 */
export interface ClientWithUser extends Client {
  statut?: string;
  user?: {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    sexe: string | null;
    photoProfile: string | null;
    statut?: string;
    username?: string | null;
    canLogin?: boolean | null;
    mustChangePassword?: boolean | null;
  } | null;
}

/**
 * Type étendu retourné par les fonctions de lecture
 * Fusionne les données client + user pour l'API
 */
export interface ClientTagCompact {
  id: string;
  name: string;
  color: string;
}

export interface ClientFull extends Client {
  // Champs d'identité (depuis users)
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  photoProfile: string | null;
  statut: string;
  // Champs enrichis
  type_marche_nom?: string | null;
  agence_nom?: string | null;
  photoUrl?: string | null;
  // Tags assignés (eager loaded pour la liste)
  tags?: ClientTagCompact[];
}

/**
 * Schema API pour la création de client
 * Sépare les données user (identité) des données client (métier)
 */
export const createClientApiSchema = z.object({
  // Données d'identité (iront dans users)
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().optional().nullable(),
  email: z.string().email("Email invalide").optional().nullable(),
  telephone: z.string().optional().nullable(),
  sexe: z.enum(['M', 'F']).optional().nullable(),
  photoProfile: z.string().optional().nullable(),

  // Données métier client
  adresseDomicile: z.string().optional().nullable(),
  lieuActivite: z.string().optional().nullable(),
  ville: z.string().optional().nullable(),
  pays: z.string().optional().nullable(),
  dateNaissance: z.string().optional().nullable(),
  numeroPiece: z.string().optional().nullable(),
  typePiece: z.string().optional().nullable(),
  profession: z.string().optional().nullable(),
  employeur: z.string().optional().nullable(),
  typeActivite: z.string().optional().nullable(),
  revenuMensuel: z.string().optional().nullable().transform(v => v === '' ? null : v),
  revenuJournalier: z.string().optional().nullable().transform(v => v === '' ? null : v),
  typeRevenu: z.string().optional().nullable(),
  documents: z.any().optional().nullable(),
  typeMarcheId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  segment: z.string().optional().default(SegmentClient.STANDARD),
  frequenceCarte: z.string().optional().nullable(),
  latitude: z.string().optional().nullable().transform(v => v === '' ? null : v),
  longitude: z.string().optional().nullable().transform(v => v === '' ? null : v),
  agenceId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  agentReferentId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  statut: z.string().optional().default(StatutUser.ACTIVE),
  // UUID temporaire utilisé pour les uploads avant la création de l'entité
  tempEntityId: z.string().uuid().optional().nullable(),
});

export type CreateClientApiInput = z.infer<typeof createClientApiSchema>;

/**
 * Schema API pour la mise à jour partielle de client
 * Tous les champs sont optionnels, sépare identité et métier
 */
export const updateClientApiSchema = createClientApiSchema.partial();
export type UpdateClientApiInput = z.infer<typeof updateClientApiSchema>;

// ============================================
// FONCTIONS DE LECTURE
// ============================================

/**
 * Récupérer un client par son ID avec données utilisateur fusionnées
 * Retourne un objet unifié avec les champs d'identité depuis users
 */
export async function getClient(id: string): Promise<ClientFull | undefined> {
  const result = await db
    .select({
      client: clients,
      user_nom: users.nom,
      user_prenom: users.prenom,
      user_email: users.email,
      user_telephone: users.telephone,
      user_photo_profile: users.photoProfile,
      user_statut: users.statut,
      agence_nom: agences.nom,
      type_marche_nom: typesMarches.nom,
    })
    .from(clients)
    .leftJoin(users, eq(clients.userId, users.id))
    .leftJoin(agences, eq(clients.agenceId, agences.id))
    .leftJoin(typesMarches, eq(clients.typeMarcheId, typesMarches.id))
    .where(eq(clients.id, id));

  if (result.length === 0) return undefined;

  const r = result[0];
  return {
    ...r.client,
    // Champs d'identité depuis users (source de vérité)
    nom: r.user_nom || "Client",
    prenom: r.user_prenom,
    email: r.user_email,
    telephone: r.user_telephone,
    photoProfile: r.user_photo_profile,
    statut: r.user_statut || StatutUser.ACTIVE,
    // Champs enrichis
    type_marche_nom: r.type_marche_nom,
    agence_nom: r.agence_nom,
    photoUrl: r.user_photo_profile,
  };
}

/**
 * Batch-fetch tags pour une liste de clients (évite N+1)
 * Retourne un Map<clientId, ClientTagCompact[]>
 */
async function batchFetchClientTags(clientIds: string[]): Promise<Map<string, ClientTagCompact[]>> {
  const map = new Map<string, ClientTagCompact[]>();
  if (clientIds.length === 0) return map;

  const rows = await db.select({
    clientId: clientTags.clientId,
    tagId: tags.id,
    tagName: tags.name,
    tagColor: tags.color,
  })
  .from(clientTags)
  .innerJoin(tags, and(eq(clientTags.tagId, tags.id), isNull(tags.deletedAt)))
  .where(inArray(clientTags.clientId, clientIds));

  for (const row of rows) {
    const arr = map.get(row.clientId) || [];
    arr.push({ id: row.tagId, name: row.tagName, color: row.tagColor || '#6b7280' });
    map.set(row.clientId, arr);
  }
  return map;
}

/**
 * Récupérer tous les clients avec données utilisateur fusionnées
 */
export async function getAllClients(filter: { agence?: string; agenceId?: string } = {}): Promise<ClientFull[]> {
  const conditions = [isNull(clients.deletedAt)];

  // Filtrer par agenceId (prioritaire)
  if (filter.agenceId && filter.agenceId !== "all") {
    conditions.push(eq(clients.agenceId, filter.agenceId));
  }

  let query = db
    .select({
      client: clients,
      type_marche_nom: typesMarches.nom,
      agence_nom: agences.nom,
      // Source de vérité: users
      user_nom: users.nom,
      user_prenom: users.prenom,
      user_email: users.email,
      user_telephone: users.telephone,
      user_photo_profile: users.photoProfile,
      user_statut: users.statut,
    })
    .from(clients)
    .leftJoin(typesMarches, eq(clients.typeMarcheId, typesMarches.id))
    .leftJoin(agences, eq(clients.agenceId, agences.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .$dynamic();

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const results = await query.orderBy(desc(clients.createdAt));

  const clientList = results.map(r => ({
    ...r.client,
    nom: r.user_nom || "Client",
    prenom: r.user_prenom,
    email: r.user_email,
    telephone: r.user_telephone,
    photoProfile: r.user_photo_profile,
    statut: r.user_statut || StatutUser.ACTIVE,
    type_marche_nom: r.type_marche_nom,
    agence_nom: r.agence_nom,
    photoUrl: (() => {
      const url = r.user_photo_profile;
      if (url && url.trim().startsWith('[')) {
          try {
              const parsed = JSON.parse(url);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
          } catch (e) { /* ignore */ }
      }
      return url;
    })()
  })) as ClientFull[];

  // Batch-fetch tags
  const tagsMap = await batchFetchClientTags(clientList.map(c => c.id));
  for (const client of clientList) {
    client.tags = tagsMap.get(client.id) || [];
  }
  return clientList;
}

/**
 * Récupérer les clients paginés avec données utilisateur fusionnées
 * P5.9: Optimized to exclude heavy 'documents' field from list responses (~1MB → ~150KB)
 */
export async function getClientsPaginated(
  filter: { agence?: string; agenceId?: string } = {},
  page: number = 1,
  perPage: number = 25
): Promise<{ data: ClientFull[]; total: number }> {
  const conditions = [isNull(clients.deletedAt)];

  if (filter.agenceId && filter.agenceId !== "all") {
    conditions.push(eq(clients.agenceId, filter.agenceId));
  }

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(clients)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

  // P5.9: Select only needed fields, excluding heavy 'documents' JSONB
  let query = db
    .select({
      // Client fields (excluding documents)
      id: clients.id,
      userId: clients.userId,
      adresseDomicile: clients.adresseDomicile,
      lieuActivite: clients.lieuActivite,
      ville: clients.ville,
      pays: clients.pays,
      dateNaissance: clients.dateNaissance,
      numeroPiece: clients.numeroPiece,
      typePiece: clients.typePiece,
      profession: clients.profession,
      employeur: clients.employeur,
      typeActivite: clients.typeActivite,
      revenuMensuel: clients.revenuMensuel,
      revenuJournalier: clients.revenuJournalier,
      typeRevenu: clients.typeRevenu,
      typeMarcheId: clients.typeMarcheId,
      segment: clients.segment,
      frequenceCarte: clients.frequenceCarte,
      latitude: clients.latitude,
      longitude: clients.longitude,
      score: clients.score,
      creditTotal: clients.creditTotal,
      epargneTotal: clients.epargneTotal,
      tauxRemboursement: clients.tauxRemboursement,
      limiteRetraitJournalier: clients.limiteRetraitJournalier,
      limiteRetraitHebdomadaire: clients.limiteRetraitHebdomadaire,
      limiteRetraitMensuel: clients.limiteRetraitMensuel,
      pointsFidelite: clients.pointsFidelite,
      scoreEngagement: clients.scoreEngagement,
      derniereActivite: clients.derniereActivite,
      agenceId: clients.agenceId,
      agentReferentId: clients.agentReferentId,
      dateAdhesion: clients.dateAdhesion,
      dateInscription: clients.dateInscription,
      createdBy: clients.createdBy,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
      deletedAt: clients.deletedAt,
      // Related fields
      type_marche_nom: typesMarches.nom,
      agence_nom: agences.nom,
      user_nom: users.nom,
      user_prenom: users.prenom,
      user_email: users.email,
      user_telephone: users.telephone,
      user_photo_profile: users.photoProfile,
      user_statut: users.statut,
    })
    .from(clients)
    .leftJoin(typesMarches, eq(clients.typeMarcheId, typesMarches.id))
    .leftJoin(agences, eq(clients.agenceId, agences.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .$dynamic();

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const results = await query
    .orderBy(desc(clients.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const data = results.map((r) => ({
    id: r.id,
    userId: r.userId,
    adresseDomicile: r.adresseDomicile,
    lieuActivite: r.lieuActivite,
    ville: r.ville,
    pays: r.pays,
    dateNaissance: r.dateNaissance,
    numeroPiece: r.numeroPiece,
    typePiece: r.typePiece,
    profession: r.profession,
    employeur: r.employeur,
    typeActivite: r.typeActivite,
    revenuMensuel: r.revenuMensuel,
    revenuJournalier: r.revenuJournalier,
    typeRevenu: r.typeRevenu,
    typeMarcheId: r.typeMarcheId,
    segment: r.segment,
    frequenceCarte: r.frequenceCarte,
    latitude: r.latitude,
    longitude: r.longitude,
    score: r.score,
    creditTotal: r.creditTotal,
    epargneTotal: r.epargneTotal,
    tauxRemboursement: r.tauxRemboursement,
    limiteRetraitJournalier: r.limiteRetraitJournalier,
    limiteRetraitHebdomadaire: r.limiteRetraitHebdomadaire,
    limiteRetraitMensuel: r.limiteRetraitMensuel,
    pointsFidelite: r.pointsFidelite,
    scoreEngagement: r.scoreEngagement,
    derniereActivite: r.derniereActivite,
    agenceId: r.agenceId,
    agentReferentId: r.agentReferentId,
    dateAdhesion: r.dateAdhesion,
    dateInscription: r.dateInscription,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    // Identity fields from users
    nom: r.user_nom || "Client",
    prenom: r.user_prenom,
    email: r.user_email,
    telephone: r.user_telephone,
    photoProfile: r.user_photo_profile,
    statut: r.user_statut || StatutUser.ACTIVE,
    // Enriched fields
    type_marche_nom: r.type_marche_nom,
    agence_nom: r.agence_nom,
    photoUrl: (() => {
      const url = r.user_photo_profile;
      if (url && url.trim().startsWith('[')) {
          try {
              const parsed = JSON.parse(url);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
          } catch (e) { /* ignore */ }
      }
      return url;
    })(),
  })) as ClientFull[];

  // Batch-fetch tags
  const tagsMap = await batchFetchClientTags(data.map(c => c.id));
  for (const client of data) {
    client.tags = tagsMap.get(client.id) || [];
  }

  return { data, total };
}

// ============================================
// FONCTIONS DE CRÉATION
// ============================================

/**
 * Créer un client avec création automatique du user associé
 *
 * @param input - Données API combinées (identité + métier)
 * @returns Client créé
 *
 * FLUX:
 * 1. Créer le user avec les données d'identité (nom, prenom, email, telephone)
 * 2. Créer le rôle CLIENT dans userRoles (Architecture V3)
 * 3. Créer le client avec référence userId et données métier
 */
export async function createClient(input: CreateClientApiInput): Promise<Client> {
  return await db.transaction(async (tx) => {
    // 1. Créer le user avec les données d'identité (nom normalisé en MAJUSCULES, prénom capitalisé)
    const [user] = await tx.insert(users).values({
      nom: normalizeNom(input.nom),
      prenom: normalizePrenom(input.prenom),
      email: input.email,
      telephone: input.telephone,
      photoProfile: input.photoProfile,
      sexe: input.sexe,
      typeCompte: "client",
      canLogin: false, // Par défaut, pas d'accès portail
      statut: input.statut || StatutUser.ACTIVE,
      mustChangePassword: true,
    }).returning();

    // 2. Créer le rôle CLIENT dans userRoles (Architecture V3)
    await tx.insert(userRoles).values({
      userId: user.id,
      role: SystemRole.CLIENT,
      agenceId: input.agenceId || null,
      isPrimary: true,
    });

    // 3. Créer le client avec les données métier (sans champs d'identité)
    const [client] = await tx.insert(clients).values({
      userId: user.id,
      adresseDomicile: input.adresseDomicile,
      lieuActivite: input.lieuActivite,
      ville: input.ville,
      pays: input.pays,
      dateNaissance: input.dateNaissance,
      numeroPiece: input.numeroPiece,
      typePiece: input.typePiece,
      profession: input.profession,
      employeur: input.employeur,
      typeActivite: input.typeActivite,
      revenuMensuel: input.revenuMensuel,
      revenuJournalier: input.revenuJournalier,
      typeRevenu: input.typeRevenu,
      documents: input.documents,
      typeMarcheId: input.typeMarcheId,
      segment: input.segment || SegmentClient.STANDARD,
      frequenceCarte: input.frequenceCarte,
      latitude: input.latitude,
      longitude: input.longitude,
      agenceId: input.agenceId,
      agentReferentId: input.agentReferentId,
    }).returning();

    return client;
  });
}

/**
 * Créer un client pour un user existant (sans créer de nouveau user)
 * Utilisé quand on veut ajouter un profil client à un user déjà existant
 */
export async function createClientWithExistingUser(userId: string, input: Omit<CreateClientApiInput, 'nom' | 'prenom' | 'email' | 'telephone' | 'photoProfile' | 'sexe'>): Promise<Client> {
  return await db.transaction(async (tx) => {
    // Vérifier que le user existe
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new Error("Utilisateur non trouvé");
    }

    // Vérifier si le rôle CLIENT existe déjà
    const [existingRole] = await tx.select()
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.role, SystemRole.CLIENT)
      ));

    // Ajouter le rôle CLIENT si non existant
    if (!existingRole) {
      const [anyRole] = await tx.select().from(userRoles).where(eq(userRoles.userId, userId));
      await tx.insert(userRoles).values({
        userId,
        role: SystemRole.CLIENT,
        agenceId: input.agenceId || null,
        isPrimary: !anyRole,
      });
    }

    // Créer le client
    const [client] = await tx.insert(clients).values({
      userId,
      adresseDomicile: input.adresseDomicile,
      lieuActivite: input.lieuActivite,
      ville: input.ville,
      pays: input.pays,
      dateNaissance: input.dateNaissance,
      numeroPiece: input.numeroPiece,
      typePiece: input.typePiece,
      profession: input.profession,
      employeur: input.employeur,
      typeActivite: input.typeActivite,
      revenuMensuel: input.revenuMensuel,
      revenuJournalier: input.revenuJournalier,
      typeRevenu: input.typeRevenu,
      documents: input.documents,
      typeMarcheId: input.typeMarcheId,
      segment: input.segment || SegmentClient.STANDARD,
      frequenceCarte: input.frequenceCarte,
      latitude: input.latitude,
      longitude: input.longitude,
      agenceId: input.agenceId,
      agentReferentId: input.agentReferentId,
    }).returning();

    // Mettre à jour typeCompte si nécessaire
    if (user.typeCompte === 'employe') {
      await tx.update(users).set({ typeCompte: 'both' }).where(eq(users.id, userId));
    }

    return client;
  });
}

// ============================================
// FONCTIONS DE MISE À JOUR
// ============================================

/**
 * Mettre à jour un client et son user associé
 *
 * Les données d'identité (nom, prenom, email, telephone, photoProfile, sexe)
 * sont mises à jour dans la table users (source de vérité).
 * Les données métier sont mises à jour dans clients.
 */
export async function updateClient(id: string, updateData: Partial<CreateClientApiInput>): Promise<ClientFull | undefined> {
  // Séparer les champs d'identité des champs métier
  const identityFields = ['nom', 'prenom', 'email', 'telephone', 'photoProfile', 'sexe', 'statut'] as const;

  const identityData: Record<string, any> = {};
  const businessData: Record<string, any> = {};

  for (const [key, value] of Object.entries(updateData)) {
    if (identityFields.includes(key as any) && value !== undefined) {
      identityData[key] = value;
    } else if (value !== undefined) {
      businessData[key] = value;
    }
  }

  // Normaliser nom et prénom si présents
  if (identityData.nom !== undefined) {
    identityData.nom = normalizeNom(identityData.nom);
  }
  if (identityData.prenom !== undefined) {
    identityData.prenom = normalizePrenom(identityData.prenom);
  }

  return await db.transaction(async (tx) => {
    // Récupérer le client pour avoir le userId
    const [currentClient] = await tx.select().from(clients).where(eq(clients.id, id));
    if (!currentClient) return undefined;

    // Si le client a un userId, mettre à jour le user pour les champs d'identité
    if (currentClient.userId && Object.keys(identityData).length > 0) {
      await tx.update(users)
        .set({ ...identityData, updatedAt: new Date() })
        .where(eq(users.id, currentClient.userId));
    }

    // Mettre à jour le client (données métier uniquement)
    if (Object.keys(businessData).length > 0) {
      await tx
        .update(clients)
        .set({ ...businessData, updatedAt: new Date() })
        .where(eq(clients.id, id));
    }

    // Retourner le client mis à jour avec les données fusionnées
    const result = await tx
      .select({
        client: clients,
        user_nom: users.nom,
        user_prenom: users.prenom,
        user_email: users.email,
        user_telephone: users.telephone,
        user_photo_profile: users.photoProfile,
        user_statut: users.statut,
        agence_nom: agences.nom,
        type_marche_nom: typesMarches.nom,
      })
      .from(clients)
      .leftJoin(users, eq(clients.userId, users.id))
      .leftJoin(agences, eq(clients.agenceId, agences.id))
      .leftJoin(typesMarches, eq(clients.typeMarcheId, typesMarches.id))
      .where(eq(clients.id, id));

    if (result.length === 0) return undefined;

    const r = result[0];
    return {
      ...r.client,
      nom: r.user_nom || "Client",
      prenom: r.user_prenom,
      email: r.user_email,
      telephone: r.user_telephone,
      photoProfile: r.user_photo_profile,
      statut: r.user_statut || StatutUser.ACTIVE,
      type_marche_nom: r.type_marche_nom,
      agence_nom: r.agence_nom,
      photoUrl: r.user_photo_profile,
    };
  });
}

export async function deleteClient(id: string): Promise<boolean> {
  try {
    // Récupérer le client pour avoir le userId
    const [currentClient] = await db.select().from(clients).where(eq(clients.id, id));
    if (!currentClient) return false;

    // Supprimer les fichiers MinIO associés au client (CASCADE)
    try {
      const { publicDeleted, privateDeleted } = await StorageService.deleteEntityFiles('client', id);
      if (publicDeleted > 0 || privateDeleted > 0) {
        logger.info({ clientId: id, publicDeleted, privateDeleted }, 'Client cascade MinIO deletion completed');
      }
    } catch (storageError) {
      // Log l'erreur mais continue la suppression du client
      logger.error({ err: storageError, clientId: id }, 'Error deleting MinIO files for client');
    }

    // Soft delete: set deletedAt instead of hard delete
    const [softDeleted] = await db
      .update(clients)
      .set({ deletedAt: new Date() } as any)
      .where(eq(clients.id, id))
      .returning();

    // Also deactivate the linked user
    if (softDeleted?.userId) {
      await db
        .update(users)
        .set({ statut: StatutUser.INACTIVE, updatedAt: new Date() })
        .where(eq(users.id, softDeleted.userId));
    }

    return !!softDeleted;
  } catch (error: any) {
    throw error;
  }
}

// Types Marches
export async function getAllTypesMarches(): Promise<any[]> {
  return db.select().from(typesMarches);
}

// Tags
export async function getAllTags(): Promise<Tag[]> {
  return db.select().from(tags).where(isNull(tags.deletedAt));
}

export async function createTag(tag: InsertTag): Promise<Tag> {
  const [newTag] = await db.insert(tags).values(tag).returning();
  return newTag;
}

export async function getClientTags(clientId: string): Promise<(ClientTag & { tag: Tag })[]> {
  const rows = await db.select({
      clientTag: clientTags,
      tag: tags
  })
  .from(clientTags)
  .innerJoin(tags, and(eq(clientTags.tagId, tags.id), isNull(tags.deletedAt)))
  .where(eq(clientTags.clientId, clientId));

  return rows.map(r => ({ ...r.clientTag, tag: r.tag }));
}

export async function addClientTag(entry: InsertClientTag): Promise<ClientTag & { tag: Tag }> {
    const [ct] = await db.insert(clientTags).values(entry).returning();

    // Récupérer le tag complet pour le retourner avec l'assignation
    const [tag] = await db.select().from(tags).where(eq(tags.id, entry.tagId));

    return { ...ct, tag };
}

export async function removeClientTag(clientId: string, tagId: string): Promise<boolean> {
    const res = await db.delete(clientTags).where(and(eq(clientTags.clientId, clientId), eq(clientTags.tagId, tagId)));
    return (res.rowCount || 0) > 0;
}

export async function deleteTag(tagId: string): Promise<boolean> {
    // Supprimer d'abord toutes les assignations de ce tag
    await db.delete(clientTags).where(eq(clientTags.tagId, tagId));
    // Soft-delete le tag
    const res = await db.update(tags).set({ deletedAt: new Date() }).where(eq(tags.id, tagId));
    return (res.rowCount || 0) > 0;
}

// Activities
export async function logClientActivity(activity: InsertClientActivity): Promise<ClientActivity> {
    const [act] = await db.insert(clientActivities).values(activity).returning();
    return act;
}

export async function getClientActivities(clientId: string): Promise<ClientActivity[]> {
    return db.select().from(clientActivities).where(eq(clientActivities.clientId, clientId)).orderBy(desc(clientActivities.createdAt));
}

// Loyalty Points System

export async function addLoyaltyPoints(
  clientId: string,
  points: number,
  type: string,
  description: string,
  montantAssocie?: number
): Promise<void> {
  // Add to history
  await db.insert(historiquePoints).values({
    clientId,
    points,
    type,
    description,
    montantAssocie
  });

  // Update client total
  await db
    .update(clients)
    .set({
      pointsFidelite: sql`${clients.pointsFidelite} + ${points}`,
      derniereActivite: new Date()
    })
    .where(eq(clients.id, clientId));
}

export async function calculateEngagementScore(clientId: string): Promise<number> {
  const client = await getClient(clientId);
  if (!client) return 0;

  // Score components (0-100)
  const epargneScore = Math.min(30, (parseFloat(client.epargneTotal?.toString() || '0') / 1000000) * 30);
  const remboursementScore = Math.min(40, parseFloat(client.tauxRemboursement?.toString() || '100') * 0.4);
  
  // Calculate transaction frequency (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentActivities = await db
    .select()
    .from(clientActivities)
    .where(and(
      eq(clientActivities.clientId, clientId),
      sql`${clientActivities.createdAt} >= ${thirtyDaysAgo}`
    ));
  const frequenceScore = Math.min(20, (recentActivities.length / 10) * 20);

  // Calculate seniority
  const inscriptionDate = client.dateInscription || new Date();
  const monthsSinceInscription = (Date.now() - inscriptionDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
  const ancienneteScore = Math.min(10, (monthsSinceInscription / 12) * 10);

  const totalScore = Math.round(epargneScore + remboursementScore + frequenceScore + ancienneteScore);

  // Update client score
  await db
    .update(clients)
    .set({ scoreEngagement: totalScore })
    .where(eq(clients.id, clientId));

  return totalScore;
}

export async function getLoyaltyHistory(clientId: string): Promise<any[]> {
  return db
    .select()
    .from(historiquePoints)
    .where(eq(historiquePoints.clientId, clientId))
    .orderBy(desc(historiquePoints.createdAt));
}

// ============================================
// NOUVELLES FONCTIONS POUR ARCHITECTURE users/clients
// ============================================

/**
 * Récupérer un client par son userId (lien vers users)
 */
export async function getClientByUserId(userId: string): Promise<Client | undefined> {
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId));
  return client || undefined;
}

/**
 * Récupérer un client avec ses données utilisateur
 */
export async function getClientWithUser(id: string): Promise<ClientWithUser | undefined> {
  const result = await db.select({
    client: clients,
    user: {
      id: users.id,
      nom: users.nom,
      prenom: users.prenom,
      email: users.email,
      telephone: users.telephone,
      sexe: users.sexe,
      photoProfile: users.photoProfile,
      username: users.username,
      canLogin: users.canLogin,
      mustChangePassword: users.mustChangePassword,
    }
  })
  .from(clients)
  .leftJoin(users, eq(clients.userId, users.id))
  .where(eq(clients.id, id));

  if (result.length === 0) return undefined;

  return {
    ...result[0].client,
    user: result[0].user
  };
}

/**
 * Créer un client avec un user associé (pour portail client futur)
 * Architecture V3: utilise userRoles
 */
export async function createClientWithUser(
  userData: {
    nom: string;
    prenom?: string;
    email?: string;
    telephone?: string;
    sexe?: 'M' | 'F';
    username?: string;
    password?: string;
    statut?: string;
  },
  clientData: Omit<CreateClientApiInput, 'nom' | 'prenom' | 'email' | 'telephone' | 'sexe' | 'photoProfile'>
): Promise<{ user: User; client: Client }> {
  return await db.transaction(async (tx) => {
    // 1. Créer l'utilisateur (nom normalisé en MAJUSCULES, prénom capitalisé)
    const [user] = await tx.insert(users).values({
      nom: normalizeNom(userData.nom),
      prenom: normalizePrenom(userData.prenom),
      email: userData.email,
      telephone: userData.telephone,
      sexe: userData.sexe,
      username: userData.username,
      password: userData.password,
      typeCompte: 'client',
      canLogin: !!userData.username,
      statut: userData.statut || StatutUser.ACTIVE,
    }).returning();

    // 2. Créer le rôle CLIENT dans userRoles (Architecture V3)
    await tx.insert(userRoles).values({
      userId: user.id,
      role: SystemRole.CLIENT,
      agenceId: clientData.agenceId || null,
      isPrimary: true,
    });

    // 3. Créer le client lié (données métier uniquement)
    const [client] = await tx.insert(clients).values({
      userId: user.id,
      adresseDomicile: clientData.adresseDomicile,
      lieuActivite: clientData.lieuActivite,
      ville: clientData.ville,
      pays: clientData.pays,
      dateNaissance: clientData.dateNaissance,
      numeroPiece: clientData.numeroPiece,
      typePiece: clientData.typePiece,
      profession: clientData.profession,
      employeur: clientData.employeur,
      typeActivite: clientData.typeActivite,
      revenuMensuel: clientData.revenuMensuel,
      revenuJournalier: clientData.revenuJournalier,
      typeRevenu: clientData.typeRevenu,
      documents: clientData.documents,
      typeMarcheId: clientData.typeMarcheId,
      segment: clientData.segment || SegmentClient.STANDARD,
      frequenceCarte: clientData.frequenceCarte,
      latitude: clientData.latitude,
      longitude: clientData.longitude,
      agenceId: clientData.agenceId,
      agentReferentId: clientData.agentReferentId,
    }).returning();

    return { user, client };
  });
}

/**
 * Lier un client existant à un user existant
 */
export async function linkClientToUser(clientId: string, userId: string): Promise<Client | undefined> {
  const [client] = await db.update(clients)
    .set({ userId, updatedAt: new Date() })
    .where(eq(clients.id, clientId))
    .returning();
  return client || undefined;
}

/**
 * Créer un profil client pour un user existant
 * Architecture V3: ajoute le rôle CLIENT si non existant
 */
export async function createClientForUser(userId: string, clientData: Omit<CreateClientApiInput, 'nom' | 'prenom' | 'email' | 'telephone' | 'sexe' | 'photoProfile'>): Promise<Client> {
  return await db.transaction(async (tx) => {
    // Récupérer les données user
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new Error("Utilisateur non trouvé");
    }

    // 1. Créer le client (données métier uniquement)
    const [client] = await tx.insert(clients).values({
      userId,
      adresseDomicile: clientData.adresseDomicile,
      lieuActivite: clientData.lieuActivite,
      ville: clientData.ville,
      pays: clientData.pays,
      dateNaissance: clientData.dateNaissance,
      numeroPiece: clientData.numeroPiece,
      typePiece: clientData.typePiece,
      profession: clientData.profession,
      employeur: clientData.employeur,
      typeActivite: clientData.typeActivite,
      revenuMensuel: clientData.revenuMensuel,
      revenuJournalier: clientData.revenuJournalier,
      typeRevenu: clientData.typeRevenu,
      documents: clientData.documents,
      typeMarcheId: clientData.typeMarcheId,
      segment: clientData.segment || SegmentClient.STANDARD,
      frequenceCarte: clientData.frequenceCarte,
      latitude: clientData.latitude,
      longitude: clientData.longitude,
      agenceId: clientData.agenceId,
      agentReferentId: clientData.agentReferentId,
    }).returning();

    // 2. Vérifier si le rôle CLIENT existe déjà dans userRoles
    const [existingClientRole] = await tx.select()
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.role, SystemRole.CLIENT)
      ));

    // 3. Si pas de rôle CLIENT, l'ajouter (non-primary si d'autres rôles existent)
    if (!existingClientRole) {
      const [anyRole] = await tx.select()
        .from(userRoles)
        .where(eq(userRoles.userId, userId));

      await tx.insert(userRoles).values({
        userId,
        role: SystemRole.CLIENT,
        agenceId: clientData.agenceId || null,
        isPrimary: !anyRole,
      });
    }

    // 4. Mettre à jour le type_compte du user si nécessaire
    if (user.typeCompte === 'employe') {
      await tx.update(users)
        .set({ typeCompte: 'both' })
        .where(eq(users.id, userId));
    }

    return client;
  });
}

// ============================================
// STATISTIQUES CLIENTS (AGRÉGATION SQL)
// ============================================

export interface ClientStats {
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  suspendedClients: number;
  newClientsThisMonth: number;
  segmentDistribution: {
    vip: number;
    premium: number;
    standard: number;
  };
  financialSummary: {
    totalCredit: number;
    totalEpargne: number;
    avgRepaymentRate: number;
    totalLoyaltyPoints: number;
  };
}

/**
 * Récupère les statistiques agrégées des clients via SQL COUNT
 * Optimisé pour éviter de charger tous les objets en mémoire
 */
export async function getClientStats(filter: { agenceId?: string } = {}): Promise<ClientStats> {
  const conditions = [];

  if (filter.agenceId && filter.agenceId !== "all") {
    conditions.push(eq(clients.agenceId, filter.agenceId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Requête unique avec agrégation SQL
  const [stats] = await db
    .select({
      totalClients: sql<number>`count(*)`,
      activeClients: sql<number>`count(*) filter (where ${users.statut} = 'ACTIVE')`,
      inactiveClients: sql<number>`count(*) filter (where ${users.statut} = 'INACTIVE')`,
      suspendedClients: sql<number>`count(*) filter (where ${users.statut} = 'SUSPENDED')`,
      vipCount: sql<number>`count(*) filter (where lower(${clients.segment}) = 'vip')`,
      premiumCount: sql<number>`count(*) filter (where lower(${clients.segment}) = 'premium')`,
      standardCount: sql<number>`count(*) filter (where lower(${clients.segment}) = 'standard')`,
      totalCredit: sql<number>`coalesce(sum(cast(${clients.creditTotal} as numeric)), 0)`,
      totalEpargne: sql<number>`coalesce(sum(cast(${clients.epargneTotal} as numeric)), 0)`,
      avgRepaymentRate: sql<number>`coalesce(avg(cast(${clients.tauxRemboursement} as numeric)), 0)`,
      totalLoyaltyPoints: sql<number>`coalesce(sum(${clients.pointsFidelite}), 0)`,
    })
    .from(clients)
    .leftJoin(users, eq(clients.userId, users.id))
    .where(whereClause);

  // Comptage des nouveaux clients ce mois-ci (requête séparée pour clarté)
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const newClientsConditions = [...conditions];
  newClientsConditions.push(sql`${clients.dateInscription} >= ${startOfMonth}`);

  const [newClientsResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clients)
    .where(and(...newClientsConditions));

  return {
    totalClients: Number(stats?.totalClients) || 0,
    activeClients: Number(stats?.activeClients) || 0,
    inactiveClients: Number(stats?.inactiveClients) || 0,
    suspendedClients: Number(stats?.suspendedClients) || 0,
    newClientsThisMonth: Number(newClientsResult?.count) || 0,
    segmentDistribution: {
      vip: Number(stats?.vipCount) || 0,
      premium: Number(stats?.premiumCount) || 0,
      standard: Number(stats?.standardCount) || 0,
    },
    financialSummary: {
      totalCredit: Number(stats?.totalCredit) || 0,
      totalEpargne: Number(stats?.totalEpargne) || 0,
      avgRepaymentRate: Math.round(Number(stats?.avgRepaymentRate) || 0),
      totalLoyaltyPoints: Number(stats?.totalLoyaltyPoints) || 0,
    },
  };
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Création de clients en masse (Bulk Insert)
 * Utilise une transaction pour l'atomicité.
 *
 * @param clientsData - Tableau de données API (identité + métier combinées)
 * @returns Tableau de clients créés
 */
export async function createClientsBulk(clientsData: CreateClientApiInput[]): Promise<Client[]> {
  return await db.transaction(async (tx) => {
    if (clientsData.length === 0) return [];

    const results: Client[] = [];

    for (const data of clientsData) {
       // 1. Créer le user avec les données d'identité (nom normalisé en MAJUSCULES, prénom capitalisé)
       const [user] = await tx.insert(users).values({
         nom: normalizeNom(data.nom),
         prenom: normalizePrenom(data.prenom),
         email: data.email,
         telephone: data.telephone,
         photoProfile: data.photoProfile,
         sexe: data.sexe,
         typeCompte: "client",
         statut: data.statut || StatutUser.ACTIVE,
         canLogin: false,
         mustChangePassword: true
       }).returning();

       // 2. Créer le rôle CLIENT dans userRoles (Architecture V3)
       await tx.insert(userRoles).values({
         userId: user.id,
         role: SystemRole.CLIENT,
         agenceId: data.agenceId || null,
         isPrimary: true,
       });

       // 3. Créer le client avec les données métier
       const [client] = await tx.insert(clients).values({
         userId: user.id,
         adresseDomicile: data.adresseDomicile,
         lieuActivite: data.lieuActivite,
         ville: data.ville,
         pays: data.pays,
         dateNaissance: data.dateNaissance,
         numeroPiece: data.numeroPiece,
         typePiece: data.typePiece,
         profession: data.profession,
         employeur: data.employeur,
         typeActivite: data.typeActivite,
         revenuMensuel: data.revenuMensuel,
         revenuJournalier: data.revenuJournalier,
         typeRevenu: data.typeRevenu,
         documents: data.documents,
         typeMarcheId: data.typeMarcheId,
         segment: data.segment || SegmentClient.STANDARD,
         frequenceCarte: data.frequenceCarte,
         latitude: data.latitude,
         longitude: data.longitude,
         agenceId: data.agenceId,
         agentReferentId: data.agentReferentId,
       }).returning();

       results.push(client);
    }

    return results;
  });
}
