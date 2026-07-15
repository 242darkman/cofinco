import { StatutUser } from "@shared/enum/status-constants";
import { activityTypes, agences, clients, professions, sectors, users } from "@shared/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { ClientFull } from "./clients-types";
import { batchFetchClientTags } from "./clients-read";

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
