import { clients, sectors, professions, activityTypes, tags, clientTags, clientActivities, users, agences, userRoles, pays } from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { StatutUser, SegmentClient, TypePiece } from "@shared/enum/status-constants";
import { type Client, type InsertClient, type ClientTag, type InsertClientTag, type Tag, type InsertTag, type ClientActivity, type InsertClientActivity, type User } from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, isNull, sql, inArray, aliasedTable } from "drizzle-orm";
import { z } from "zod";
import { StorageService } from "../services/storage-service";
import { normalizeNom, normalizePrenom } from "./name-utils";
import { normalizePhone } from "@shared/utils/phone";
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
  sexe: string | null;
  dateNaissance: Date | null;
  lieuNaissance: string | null;
  photoProfile: string | null;
  statut: string;
  // Champs enrichis
  sector_nom?: string | null;
  profession_nom?: string | null;
  activity_type_nom?: string | null;
  agence_nom?: string | null;
  photoUrl?: string | null;
  // Pays (jointures)
  nationaliteNom?: string | null;
  nationaliteIso2?: string | null;
  paysNaissanceNom?: string | null;
  paysNaissanceIso2?: string | null;
  paysResidenceNom?: string | null;
  paysResidenceIso2?: string | null;
  paysEmissionNom?: string | null;
  paysEmissionIso2?: string | null;
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
  email: z.preprocess(v => v === '' ? null : v, z.string().email("Email invalide").optional().nullable()),
  telephone: z.string().optional().nullable(),
  sexe: z.enum(['M', 'F']).optional().nullable(),
  photoProfile: z.string().optional().nullable(),
  dateNaissance: z.string().optional().nullable(),
  lieuNaissance: z.string().optional().nullable(),
  lieuNaissanceLocalityId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  lieuNaissanceLocalityType: z.enum(['CITY', 'DISTRICT']).optional().nullable(),
  nationaliteId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  paysNaissanceId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),

  // Données métier client
  adresseDomicile: z.string().optional().nullable(),
  lieuActivite: z.string().optional().nullable(),
  villeId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  localityType: z.enum(['CITY', 'DISTRICT']).optional().nullable(),
  paysResidenceId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  statutLogement: z.string().optional().nullable(),
  numeroPiece: z.string().optional().nullable(),
  typePiece: z.enum([TypePiece.CNI, TypePiece.PASSPORT, TypePiece.PERMIS_CONDUIRE, TypePiece.CARTE_RESIDENT]).optional().nullable(),
  dateExpirationPiece: z.string().optional().nullable(),
  paysEmissionId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  professionId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  professionAutreTexte: z.string().optional().nullable(),
  employeur: z.string().optional().nullable(),
  activityTypeId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  ancienneteActiviteMois: z.preprocess(v => v === '' || v === undefined || v === null ? null : Number(v), z.number().int().min(0).optional().nullable()),
  sourceFonds: z.string().optional().nullable(),
  revenuMensuel: z.string().optional().nullable().transform(v => v === '' ? null : v),
  revenuJournalier: z.string().optional().nullable().transform(v => v === '' ? null : v),
  typeRevenu: z.string().optional().nullable(),
  situationMatrimoniale: z.string().optional().nullable(),
  nombrePersonnesCharge: z.preprocess(v => v === '' || v === undefined || v === null ? null : Number(v), z.number().int().min(0).optional().nullable()),
  niveauEducation: z.string().optional().nullable(),
  typeClient: z.string().optional().default("PARTICULIER"),
  documents: z.any().optional().nullable(),
  notes: z.any().optional().nullable(),
  referencesPersonnes: z.any().optional().nullable(),
  sectorId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  segment: z.string().optional().nullable(), // Auto-calculated by scoring engine
  frequenceCarte: z.string().optional().nullable(),
  latitude: z.string().optional().nullable().transform(v => v === '' ? null : v),
  longitude: z.string().optional().nullable().transform(v => v === '' ? null : v),
  agenceId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  agentReferentId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
  statut: z.string().optional().default(StatutUser.ACTIVE),
  isPep: z.boolean().optional().default(false),
  pepDetails: z.string().optional().nullable(),
  consentementDonnees: z.boolean().optional().default(false),
  clientOrigin: z.string().optional().default("OTHER"),
  prospectId: z.preprocess(v => v === '' ? null : v, z.string().uuid().optional().nullable()),
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
  // Aliased pays joins (4 references to the same table)
  const paysNationalite = aliasedTable(pays, "pays_nat");
  const paysNaissance = aliasedTable(pays, "pays_nais");
  const paysResidence = aliasedTable(pays, "pays_res");
  const paysEmission = aliasedTable(pays, "pays_emi");

  const result = await db
    .select({
      client: clients,
      user_nom: users.nom,
      user_prenom: users.prenom,
      user_email: users.email,
      user_telephone: users.telephone,
      user_sexe: users.sexe,
      user_date_naissance: users.dateNaissance,
      user_lieu_naissance: users.lieuNaissance,
      user_photo_profile: users.photoProfile,
      user_statut: users.statut,
      agence_nom: agences.nom,
      sector_nom: sectors.nom,
      profession_nom: professions.nom,
      activity_type_nom: activityTypes.nom,
      // Pays jointures
      nationalite_nom: paysNationalite.nomFr,
      nationalite_iso2: paysNationalite.iso2,
      pays_naissance_nom: paysNaissance.nomFr,
      pays_naissance_iso2: paysNaissance.iso2,
      pays_residence_nom: paysResidence.nomFr,
      pays_residence_iso2: paysResidence.iso2,
      pays_emission_nom: paysEmission.nomFr,
      pays_emission_iso2: paysEmission.iso2,
    })
    .from(clients)
    .leftJoin(users, eq(clients.userId, users.id))
    .leftJoin(agences, eq(clients.agenceId, agences.id))
    .leftJoin(sectors, eq(clients.sectorId, sectors.id))
    .leftJoin(professions, eq(clients.professionId, professions.id))
    .leftJoin(activityTypes, eq(clients.activityTypeId, activityTypes.id))
    .leftJoin(paysNationalite, eq(users.nationaliteId, paysNationalite.id))
    .leftJoin(paysNaissance, eq(users.paysNaissanceId, paysNaissance.id))
    .leftJoin(paysResidence, eq(clients.paysResidenceId, paysResidence.id))
    .leftJoin(paysEmission, eq(clients.paysEmissionId, paysEmission.id))
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
    sexe: r.user_sexe,
    dateNaissance: r.user_date_naissance,
    lieuNaissance: r.user_lieu_naissance,
    photoProfile: r.user_photo_profile,
    statut: r.user_statut || StatutUser.ACTIVE,
    // Champs enrichis
    sector_nom: r.sector_nom,
    profession_nom: r.profession_nom,
    activity_type_nom: r.activity_type_nom,
    agence_nom: r.agence_nom,
    photoUrl: r.user_photo_profile,
    // Pays (nom + ISO2 pour drapeaux)
    nationaliteNom: r.nationalite_nom,
    nationaliteIso2: r.nationalite_iso2,
    paysNaissanceNom: r.pays_naissance_nom,
    paysNaissanceIso2: r.pays_naissance_iso2,
    paysResidenceNom: r.pays_residence_nom,
    paysResidenceIso2: r.pays_residence_iso2,
    paysEmissionNom: r.pays_emission_nom,
    paysEmissionIso2: r.pays_emission_iso2,
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
      sector_nom: sectors.nom,
      profession_nom: professions.nom,
      activity_type_nom: activityTypes.nom,
      agence_nom: agences.nom,
      // Source de vérité: users
      user_nom: users.nom,
      user_prenom: users.prenom,
      user_email: users.email,
      user_telephone: users.telephone,
      user_sexe: users.sexe,
      user_date_naissance: users.dateNaissance,
      user_lieu_naissance: users.lieuNaissance,
      user_photo_profile: users.photoProfile,
      user_statut: users.statut,
    })
    .from(clients)
    .leftJoin(sectors, eq(clients.sectorId, sectors.id))
    .leftJoin(professions, eq(clients.professionId, professions.id))
    .leftJoin(activityTypes, eq(clients.activityTypeId, activityTypes.id))
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
    sexe: r.user_sexe,
    dateNaissance: r.user_date_naissance,
    lieuNaissance: r.user_lieu_naissance,
    photoProfile: r.user_photo_profile,
    statut: r.user_statut || StatutUser.ACTIVE,
    sector_nom: r.sector_nom,
    profession_nom: r.profession_nom,
    activity_type_nom: r.activity_type_nom,
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
      villeId: clients.villeId,
      paysResidenceId: clients.paysResidenceId,
      statutLogement: clients.statutLogement,
      numeroPiece: clients.numeroPiece,
      typePiece: clients.typePiece,
      dateExpirationPiece: clients.dateExpirationPiece,
      paysEmissionId: clients.paysEmissionId,
      statutVerificationPiece: clients.statutVerificationPiece,
      situationMatrimoniale: clients.situationMatrimoniale,
      nombrePersonnesCharge: clients.nombrePersonnesCharge,
      niveauEducation: clients.niveauEducation,
      typeClient: clients.typeClient,
      sectorId: clients.sectorId,
      professionId: clients.professionId,
      professionAutreTexte: clients.professionAutreTexte,
      activityTypeId: clients.activityTypeId,
      employeur: clients.employeur,
      ancienneteActiviteMois: clients.ancienneteActiviteMois,
      sourceFonds: clients.sourceFonds,
      revenuMensuel: clients.revenuMensuel,
      revenuJournalier: clients.revenuJournalier,
      typeRevenu: clients.typeRevenu,
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
      isPep: clients.isPep,
      isBlacklisted: clients.isBlacklisted,
      riskLevel: clients.riskLevel,
      kycStatus: clients.kycStatus,
      consentementDonnees: clients.consentementDonnees,
      referencesPersonnes: clients.referencesPersonnes,
      clientOrigin: clients.clientOrigin,
      agenceId: clients.agenceId,
      agentReferentId: clients.agentReferentId,
      dateAdhesion: clients.dateAdhesion,
      createdBy: clients.createdBy,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
      deletedAt: clients.deletedAt,
      version: clients.version,
      // Related fields
      sector_nom: sectors.nom,
      profession_nom: professions.nom,
      activity_type_nom: activityTypes.nom,
      agence_nom: agences.nom,
      user_nom: users.nom,
      user_prenom: users.prenom,
      user_email: users.email,
      user_telephone: users.telephone,
      user_sexe: users.sexe,
      user_date_naissance: users.dateNaissance,
      user_lieu_naissance: users.lieuNaissance,
      user_photo_profile: users.photoProfile,
      user_statut: users.statut,
    })
    .from(clients)
    .leftJoin(sectors, eq(clients.sectorId, sectors.id))
    .leftJoin(professions, eq(clients.professionId, professions.id))
    .leftJoin(activityTypes, eq(clients.activityTypeId, activityTypes.id))
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
    villeId: r.villeId,
    paysResidenceId: r.paysResidenceId,
    statutLogement: r.statutLogement,
    numeroPiece: r.numeroPiece,
    typePiece: r.typePiece,
    dateExpirationPiece: r.dateExpirationPiece,
    paysEmissionId: r.paysEmissionId,
    statutVerificationPiece: r.statutVerificationPiece,
    situationMatrimoniale: r.situationMatrimoniale,
    nombrePersonnesCharge: r.nombrePersonnesCharge,
    niveauEducation: r.niveauEducation,
    typeClient: r.typeClient,
    sectorId: r.sectorId,
    professionId: r.professionId,
    professionAutreTexte: r.professionAutreTexte,
    activityTypeId: r.activityTypeId,
    employeur: r.employeur,
    ancienneteActiviteMois: r.ancienneteActiviteMois,
    sourceFonds: r.sourceFonds,
    revenuMensuel: r.revenuMensuel,
    revenuJournalier: r.revenuJournalier,
    typeRevenu: r.typeRevenu,
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
    isPep: r.isPep,
    isBlacklisted: r.isBlacklisted,
    riskLevel: r.riskLevel,
    kycStatus: r.kycStatus,
    consentementDonnees: r.consentementDonnees,
    referencesPersonnes: r.referencesPersonnes,
    clientOrigin: r.clientOrigin,
    agenceId: r.agenceId,
    agentReferentId: r.agentReferentId,
    dateAdhesion: r.dateAdhesion,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    version: r.version,
    // Identity fields from users
    nom: r.user_nom || "Client",
    prenom: r.user_prenom,
    email: r.user_email,
    telephone: r.user_telephone,
    sexe: r.user_sexe,
    dateNaissance: r.user_date_naissance,
    lieuNaissance: r.user_lieu_naissance,
    photoProfile: r.user_photo_profile,
    statut: r.user_statut || StatutUser.ACTIVE,
    // Enriched fields
    sector_nom: r.sector_nom,
    profession_nom: r.profession_nom,
    activity_type_nom: r.activity_type_nom,
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
      telephone: normalizePhone(input.telephone),
      photoProfile: input.photoProfile,
      sexe: input.sexe,
      dateNaissance: input.dateNaissance ? new Date(input.dateNaissance) : null,
      lieuNaissance: input.lieuNaissance,
      lieuNaissanceLocalityId: input.lieuNaissanceLocalityId,
      lieuNaissanceLocalityType: input.lieuNaissanceLocalityType,
      nationaliteId: input.nationaliteId,
      paysNaissanceId: input.paysNaissanceId,
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
      villeId: input.villeId,
      localityType: input.localityType,
      paysResidenceId: input.paysResidenceId,
      statutLogement: input.statutLogement,
      numeroPiece: input.numeroPiece,
      typePiece: input.typePiece,
      dateExpirationPiece: input.dateExpirationPiece ? new Date(input.dateExpirationPiece) : null,
      paysEmissionId: input.paysEmissionId,
      professionId: input.professionId,
      professionAutreTexte: input.professionAutreTexte,
      employeur: input.employeur,
      activityTypeId: input.activityTypeId,
      ancienneteActiviteMois: input.ancienneteActiviteMois,
      sourceFonds: input.sourceFonds,
      revenuMensuel: input.revenuMensuel,
      revenuJournalier: input.revenuJournalier,
      typeRevenu: input.typeRevenu,
      situationMatrimoniale: input.situationMatrimoniale,
      nombrePersonnesCharge: input.nombrePersonnesCharge,
      niveauEducation: input.niveauEducation,
      typeClient: input.typeClient || "PARTICULIER",
      documents: input.documents,
      referencesPersonnes: input.referencesPersonnes,
      sectorId: input.sectorId,
      segment: input.segment || SegmentClient.STANDARD,
      frequenceCarte: input.frequenceCarte,
      latitude: input.latitude,
      longitude: input.longitude,
      agenceId: input.agenceId,
      agentReferentId: input.agentReferentId,
      isPep: input.isPep || false,
      pepDetails: input.pepDetails,
      consentementDonnees: input.consentementDonnees || false,
      clientOrigin: input.clientOrigin || "OTHER",
      prospectId: input.prospectId,
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
      villeId: input.villeId,
      localityType: input.localityType,
      paysResidenceId: input.paysResidenceId,
      statutLogement: input.statutLogement,
      numeroPiece: input.numeroPiece,
      typePiece: input.typePiece,
      dateExpirationPiece: input.dateExpirationPiece ? new Date(input.dateExpirationPiece) : null,
      paysEmissionId: input.paysEmissionId,
      professionId: input.professionId,
      professionAutreTexte: input.professionAutreTexte,
      employeur: input.employeur,
      activityTypeId: input.activityTypeId,
      ancienneteActiviteMois: input.ancienneteActiviteMois,
      sourceFonds: input.sourceFonds,
      revenuMensuel: input.revenuMensuel,
      revenuJournalier: input.revenuJournalier,
      typeRevenu: input.typeRevenu,
      situationMatrimoniale: input.situationMatrimoniale,
      nombrePersonnesCharge: input.nombrePersonnesCharge,
      niveauEducation: input.niveauEducation,
      typeClient: input.typeClient || "PARTICULIER",
      documents: input.documents,
      referencesPersonnes: input.referencesPersonnes,
      sectorId: input.sectorId,
      segment: input.segment || SegmentClient.STANDARD,
      frequenceCarte: input.frequenceCarte,
      latitude: input.latitude,
      longitude: input.longitude,
      agenceId: input.agenceId,
      agentReferentId: input.agentReferentId,
      isPep: input.isPep || false,
      pepDetails: input.pepDetails,
      consentementDonnees: input.consentementDonnees || false,
      clientOrigin: input.clientOrigin || "OTHER",
      prospectId: input.prospectId,
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
  const identityFields = ['nom', 'prenom', 'email', 'telephone', 'photoProfile', 'sexe', 'statut', 'dateNaissance', 'lieuNaissance', 'lieuNaissanceLocalityId', 'lieuNaissanceLocalityType', 'nationaliteId', 'paysNaissanceId'] as const;

  const identityData: Record<string, any> = {};
  const businessData: Record<string, any> = {};

  for (const [key, value] of Object.entries(updateData)) {
    if (identityFields.includes(key as any) && value !== undefined) {
      identityData[key] = value;
    } else if (value !== undefined) {
      businessData[key] = value;
    }
  }

  // Normaliser nom, prénom et téléphone si présents
  if (identityData.nom !== undefined) {
    identityData.nom = normalizeNom(identityData.nom);
  }
  if (identityData.prenom !== undefined) {
    identityData.prenom = normalizePrenom(identityData.prenom);
  }
  if (identityData.telephone !== undefined) {
    identityData.telephone = normalizePhone(identityData.telephone);
  }
  if (identityData.dateNaissance !== undefined) {
    identityData.dateNaissance = identityData.dateNaissance ? new Date(identityData.dateNaissance) : null;
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
        user_sexe: users.sexe,
        user_date_naissance: users.dateNaissance,
        user_lieu_naissance: users.lieuNaissance,
        user_photo_profile: users.photoProfile,
        user_statut: users.statut,
        agence_nom: agences.nom,
        sector_nom: sectors.nom,
        profession_nom: professions.nom,
        activity_type_nom: activityTypes.nom,
      })
      .from(clients)
      .leftJoin(users, eq(clients.userId, users.id))
      .leftJoin(agences, eq(clients.agenceId, agences.id))
      .leftJoin(sectors, eq(clients.sectorId, sectors.id))
      .leftJoin(professions, eq(clients.professionId, professions.id))
      .leftJoin(activityTypes, eq(clients.activityTypeId, activityTypes.id))
      .where(eq(clients.id, id));

    if (result.length === 0) return undefined;

    const r = result[0];
    return {
      ...r.client,
      nom: r.user_nom || "Client",
      prenom: r.user_prenom,
      email: r.user_email,
      telephone: r.user_telephone,
      sexe: r.user_sexe,
      dateNaissance: r.user_date_naissance,
      lieuNaissance: r.user_lieu_naissance,
      photoProfile: r.user_photo_profile,
      statut: r.user_statut || StatutUser.ACTIVE,
      sector_nom: r.sector_nom,
      profession_nom: r.profession_nom,
      activity_type_nom: r.activity_type_nom,
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
      telephone: normalizePhone(userData.telephone),
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
      villeId: clientData.villeId,
      localityType: clientData.localityType,
      paysResidenceId: clientData.paysResidenceId,
      statutLogement: clientData.statutLogement,
      numeroPiece: clientData.numeroPiece,
      typePiece: clientData.typePiece,
      dateExpirationPiece: clientData.dateExpirationPiece ? new Date(clientData.dateExpirationPiece) : null,
      paysEmissionId: clientData.paysEmissionId,
      professionId: clientData.professionId,
      professionAutreTexte: clientData.professionAutreTexte,
      employeur: clientData.employeur,
      activityTypeId: clientData.activityTypeId,
      ancienneteActiviteMois: clientData.ancienneteActiviteMois,
      sourceFonds: clientData.sourceFonds,
      revenuMensuel: clientData.revenuMensuel,
      revenuJournalier: clientData.revenuJournalier,
      typeRevenu: clientData.typeRevenu,
      situationMatrimoniale: clientData.situationMatrimoniale,
      nombrePersonnesCharge: clientData.nombrePersonnesCharge,
      niveauEducation: clientData.niveauEducation,
      typeClient: clientData.typeClient || "PARTICULIER",
      documents: clientData.documents,
      referencesPersonnes: clientData.referencesPersonnes,
      sectorId: clientData.sectorId,
      segment: clientData.segment || SegmentClient.STANDARD,
      frequenceCarte: clientData.frequenceCarte,
      latitude: clientData.latitude,
      longitude: clientData.longitude,
      agenceId: clientData.agenceId,
      agentReferentId: clientData.agentReferentId,
      isPep: clientData.isPep || false,
      pepDetails: clientData.pepDetails,
      consentementDonnees: clientData.consentementDonnees || false,
      clientOrigin: clientData.clientOrigin || "OTHER",
      prospectId: clientData.prospectId,
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
      villeId: clientData.villeId,
      localityType: clientData.localityType,
      paysResidenceId: clientData.paysResidenceId,
      statutLogement: clientData.statutLogement,
      numeroPiece: clientData.numeroPiece,
      typePiece: clientData.typePiece,
      dateExpirationPiece: clientData.dateExpirationPiece ? new Date(clientData.dateExpirationPiece) : null,
      paysEmissionId: clientData.paysEmissionId,
      professionId: clientData.professionId,
      professionAutreTexte: clientData.professionAutreTexte,
      employeur: clientData.employeur,
      activityTypeId: clientData.activityTypeId,
      ancienneteActiviteMois: clientData.ancienneteActiviteMois,
      sourceFonds: clientData.sourceFonds,
      revenuMensuel: clientData.revenuMensuel,
      revenuJournalier: clientData.revenuJournalier,
      typeRevenu: clientData.typeRevenu,
      situationMatrimoniale: clientData.situationMatrimoniale,
      nombrePersonnesCharge: clientData.nombrePersonnesCharge,
      niveauEducation: clientData.niveauEducation,
      typeClient: clientData.typeClient || "PARTICULIER",
      documents: clientData.documents,
      referencesPersonnes: clientData.referencesPersonnes,
      sectorId: clientData.sectorId,
      segment: clientData.segment || SegmentClient.STANDARD,
      frequenceCarte: clientData.frequenceCarte,
      latitude: clientData.latitude,
      longitude: clientData.longitude,
      agenceId: clientData.agenceId,
      agentReferentId: clientData.agentReferentId,
      isPep: clientData.isPep || false,
      pepDetails: clientData.pepDetails,
      consentementDonnees: clientData.consentementDonnees || false,
      clientOrigin: clientData.clientOrigin || "OTHER",
      prospectId: clientData.prospectId,
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
  newClientsConditions.push(sql`${clients.dateAdhesion} >= ${startOfMonth}`);

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
         dateNaissance: data.dateNaissance ? new Date(data.dateNaissance) : null,
         lieuNaissance: data.lieuNaissance,
         lieuNaissanceLocalityId: data.lieuNaissanceLocalityId,
         lieuNaissanceLocalityType: data.lieuNaissanceLocalityType,
         nationaliteId: data.nationaliteId,
         paysNaissanceId: data.paysNaissanceId,
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
         villeId: data.villeId,
         localityType: data.localityType,
         paysResidenceId: data.paysResidenceId,
         statutLogement: data.statutLogement,
         numeroPiece: data.numeroPiece,
         typePiece: data.typePiece,
         dateExpirationPiece: data.dateExpirationPiece ? new Date(data.dateExpirationPiece) : null,
         paysEmissionId: data.paysEmissionId,
         professionId: data.professionId,
         professionAutreTexte: data.professionAutreTexte,
         employeur: data.employeur,
         activityTypeId: data.activityTypeId,
         ancienneteActiviteMois: data.ancienneteActiviteMois,
         sourceFonds: data.sourceFonds,
         revenuMensuel: data.revenuMensuel,
         revenuJournalier: data.revenuJournalier,
         typeRevenu: data.typeRevenu,
         situationMatrimoniale: data.situationMatrimoniale,
         nombrePersonnesCharge: data.nombrePersonnesCharge,
         niveauEducation: data.niveauEducation,
         typeClient: data.typeClient || "PARTICULIER",
         documents: data.documents,
         referencesPersonnes: data.referencesPersonnes,
         sectorId: data.sectorId,
         segment: data.segment || SegmentClient.STANDARD,
         frequenceCarte: data.frequenceCarte,
         latitude: data.latitude,
         longitude: data.longitude,
         agenceId: data.agenceId,
         agentReferentId: data.agentReferentId,
         isPep: data.isPep || false,
         pepDetails: data.pepDetails,
         consentementDonnees: data.consentementDonnees || false,
         clientOrigin: data.clientOrigin || "OTHER",
         prospectId: data.prospectId,
       }).returning();

       results.push(client);
    }

    return results;
  });
}
