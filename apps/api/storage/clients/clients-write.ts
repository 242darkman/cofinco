import { SegmentClient, StatutUser } from "@shared/enum/status-constants";
import { activityTypes, agences, clients, professions, sectors, userRoles, users, type Client } from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { normalizePhone } from "@shared/utils/phone";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { StorageService } from "../../services/storage-service";
import { normalizeNom, normalizePrenom } from "../name-utils";
import { ClientFull, CreateClientApiInput } from "./clients-types";

const logger = createLogger('ClientsWrite');

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
    } as ClientFull;
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

    // Soft delete: définir deletedAt au lieu d'une suppression physique
    const [softDeleted] = await db
      .update(clients)
      .set({ deletedAt: new Date() } as any)
      .where(eq(clients.id, id))
      .returning();

    // Désactiver également l'utilisateur lié
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

// createClientsBulk vit dans clients-bulk.ts (limite de 400 lignes)
