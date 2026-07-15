import { StatutUser, TypePiece } from "@shared/enum/status-constants";
import { type Client } from "@shared/schema";
import { z } from "zod";

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
  // Tags assignés (chargés pour la liste)
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
  segment: z.string().optional().nullable(), // Auto-calculé par le moteur de scoring
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
