/**
 * Types pour la nouvelle architecture Users/Employes/Clients
 *
 * Architecture:
 * - User: Source de vérité pour l'identité (nom, prenom, email, telephone, etc.)
 * - Employe: Données RH liées à un User (matricule, poste, salaire, etc.)
 * - Client: Données métier client liées optionnellement à un User (score, limites, etc.)
 * - AgentTerrain: Données terrain liées à un Employe (zone, GPS, objectifs, etc.)
 */

// ============================================
// TYPES DE BASE
// ============================================

export type TypeCompte = 'employe' | 'client' | 'both';
export type Sexe = 'M' | 'F';
export type Statut = 'Actif' | 'Inactif' | 'Suspendu';
export type TypeContrat = 'CDI' | 'CDD' | 'Stage' | 'Intérim';
export type ModeCalculPaie = 'Mensuel' | 'Horaire' | 'Journalier';
export type RoleSystem = 'admin' | 'chef_agence' | 'comptable' | 'caissier' | 'agent' | 'terrain' | 'credit' | 'superviseur';

// ============================================
// USER - Source de vérité identité
// ============================================

export interface User {
  id: string;
  username: string | null;
  password?: string; // Jamais renvoyé par l'API
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  sexe: Sexe | null;
  photoProfile: string | null;
  typeCompte: TypeCompte;
  canLogin: boolean;
  statut: Statut;
  mustChangePassword: boolean;

  // Champs legacy (à ignorer dans le nouveau code)
  role?: string;
  agence?: string;

  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ============================================
// EMPLOYE - Données RH
// ============================================

export interface Employe {
  id: string;
  userId: string;
  matricule: string | null;
  poste: string | null;
  departement: string | null;
  dateEmbauche: string | null;
  typeContrat: TypeContrat;
  agenceId: string | null;
  managerId: string | null;
  roleSystem: RoleSystem;
  salaireBase: number;
  tauxHoraire: number;
  tauxJournalier: number;
  modeCalculPaie: ModeCalculPaie;
  caissePin?: string; // Jamais renvoyé par l'API
  createdAt: string;
  updatedAt: string;
}

// Employe avec données utilisateur jointes
export interface EmployeWithUser extends Employe {
  user: {
    id: string;
    username: string | null;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    sexe: Sexe | null;
    photoProfile: string | null;
    statut: Statut;
  };
}

// ============================================
// CLIENT - Données métier client
// ============================================

export interface Client {
  id: string;
  userId: string | null; // Optionnel - pas tous les clients ont un compte

  // Champs legacy (utilisés si userId est null)
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  photoUrl: string | null;
  photoProfile: string | null;

  // Adresses
  adresse: string | null;
  adresseDomicile: string | null;
  lieuActivite: string | null;
  ville: string | null;
  pays: string | null;

  // Documents
  dateNaissance: string | null;
  numeroPiece: string | null;
  typePiece: string | null;

  // Situation professionnelle
  profession: string | null;
  employeur: string | null;
  revenuMensuel: string | null;

  // Classification
  typeMarcheId: string | null;
  segment: string;
  frequenceCarte: string | null;

  // Géolocalisation
  latitude: string | null;
  longitude: string | null;

  // Scoring & Limites
  score: number;
  creditTotal: string;
  epargneTotal: string;
  tauxRemboursement: string;
  limiteRetraitJournalier: string;
  limiteRetraitHebdomadaire: string;
  limiteRetraitMensuel: string;

  // Fidélité
  pointsFidelite: number;
  scoreEngagement: number;
  derniereActivite: string | null;

  // Organisation
  agence: string | null; // Legacy
  agenceId: string | null;
  agentReferentId: string | null;

  // Statut
  status: string;

  // Dates
  dateAdhesion: string | null;
  dateInscription: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Client avec données utilisateur jointes (si lié)
export interface ClientWithUser extends Client {
  user?: {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    sexe: Sexe | null;
    photoProfile: string | null;
  } | null;
}

// ============================================
// AGENT TERRAIN - Données terrain
// ============================================

export interface AgentTerrain {
  id: string;
  employeId: string | null;

  // Champs legacy
  nom: string | null;
  prenom: string | null;
  telephone: string | null;
  email: string | null;

  // Zone d'affectation
  zoneAffectation: string | null;
  zoneLatitude: string | null;
  zoneLongitude: string | null;
  zoneRayon: string | null;
  zonePolygon: string | null;

  // Tracking GPS
  lastLatitude: string | null;
  lastLongitude: string | null;
  lastSeenAt: string | null;

  // Performance
  statut: string;
  objectifMensuel: string | null;
  totalProspections: number;
  totalVisites: number;
  totalPaiements: string;
  tauxConversion: string;

  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Agent terrain avec données employé et utilisateur jointes
export interface AgentTerrainWithEmploye extends AgentTerrain {
  employe?: EmployeWithUser | null;
}

// ============================================
// FORMULAIRES - Types pour création/mise à jour
// ============================================

export interface CreateEmployeWithUserData {
  // Données utilisateur
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  sexe?: Sexe;
  username?: string;
  password?: string;
  photoProfile?: string;

  // Données employé
  matricule?: string;
  poste?: string;
  departement?: string;
  dateEmbauche?: string;
  typeContrat?: TypeContrat;
  agenceId?: string;
  managerId?: string;
  roleSystem?: RoleSystem;
  salaireBase?: number;
  tauxHoraire?: number;
  tauxJournalier?: number;
  modeCalculPaie?: ModeCalculPaie;
}

export interface UpdateEmployeWithUserData {
  // Données utilisateur
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  sexe?: Sexe;
  photoProfile?: string;
  statut?: Statut;

  // Données employé
  matricule?: string;
  poste?: string;
  departement?: string;
  dateEmbauche?: string;
  typeContrat?: TypeContrat;
  agenceId?: string;
  managerId?: string;
  roleSystem?: RoleSystem;
  salaireBase?: number;
  tauxHoraire?: number;
  tauxJournalier?: number;
  modeCalculPaie?: ModeCalculPaie;
}

export interface CreateClientWithUserData {
  // Données utilisateur
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  sexe?: Sexe;
  username?: string;
  password?: string;

  // Données client
  adresse?: string;
  ville?: string;
  pays?: string;
  profession?: string;
  segment?: string;
  agenceId?: string;
  agence?: string;
}

// ============================================
// HELPERS - Fonctions utilitaires
// ============================================

/**
 * Obtenir le nom complet d'un user ou d'une entité avec champs legacy
 */
export function getFullName(entity: { nom?: string | null; prenom?: string | null } | null | undefined): string {
  if (!entity) return '';
  const nom = entity.nom || '';
  const prenom = entity.prenom || '';
  return `${prenom} ${nom}`.trim() || 'Sans nom';
}

/**
 * Obtenir le nom complet d'un employé (via ses données user)
 */
export function getEmployeFullName(employe: EmployeWithUser | null | undefined): string {
  if (!employe?.user) return '';
  return getFullName(employe.user);
}

/**
 * Obtenir le nom complet d'un client (via user si lié, sinon champs legacy)
 */
export function getClientFullName(client: ClientWithUser | Client | null | undefined): string {
  if (!client) return '';

  // Si le client a un user lié, utiliser ses données
  if ('user' in client && client.user) {
    return getFullName(client.user);
  }

  // Sinon utiliser les champs legacy
  return getFullName(client);
}
