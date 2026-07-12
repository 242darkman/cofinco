import { SegmentClient, StatutUser } from "@shared/enum/status-constants";
import { clients, userRoles, users, type Client, type User } from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { normalizePhone } from "@shared/utils/phone";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { normalizeNom, normalizePrenom } from "../name-utils";
import { ClientWithUser, CreateClientApiInput } from "./clients-types";

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
