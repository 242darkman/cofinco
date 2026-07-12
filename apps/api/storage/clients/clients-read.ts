import { StatutUser } from "@shared/enum/status-constants";
import { activityTypes, agences, clients, clientTags, pays, professions, sectors, tags, users } from "@shared/schema";
import { aliasedTable, and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { ClientFull, ClientStats, ClientTagCompact } from "./clients-types";

/**
 * Récupérer un client par son ID avec données utilisateur fusionnées
 * Retourne un objet unifié avec les champs d'identité depuis users
 */
export async function getClient(id: string): Promise<ClientFull | undefined> {
  // Alias de jointures pays (4 références à la même table)
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
      // Jointures Pays
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
 * Récupération groupée des tags pour une liste de clients (évite le problème N+1)
 * Retourne une Map<clientId, ClientTagCompact[]>
 */
export async function batchFetchClientTags(clientIds: string[]): Promise<Map<string, ClientTagCompact[]>> {
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
    query = query.where(and(...conditions)) as any;
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

  // Récupération groupée des tags
  const tagsMap = await batchFetchClientTags(clientList.map(c => c.id));
  for (const client of clientList) {
    client.tags = tagsMap.get(client.id) || [];
  }
  return clientList;
}

/**
 * Récupérer les clients paginés avec données utilisateur fusionnées
 * Optimisé pour exclure le champ lourd 'documents' des réponses de liste
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

  // Sélectionner uniquement les champs nécessaires, en excluant le JSONB lourd 'documents'
  let query = db
    .select({
      // Champs client (sans documents)
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
      // Champs liés
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
    // Champs d'identité depuis users
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

  // Récupération groupée des tags
  const tagsMap = await batchFetchClientTags(data.map(c => c.id));
  for (const client of data) {
    client.tags = tagsMap.get(client.id) || [];
  }

  return { data, total };
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
