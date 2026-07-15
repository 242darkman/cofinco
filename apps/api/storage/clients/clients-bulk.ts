import { SegmentClient, StatutUser } from "@shared/enum/status-constants";
import { clients, userRoles, users, type Client } from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
import { db } from "../../db";
import { normalizeNom, normalizePrenom } from "../name-utils";
import { CreateClientApiInput } from "./clients-types";

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
