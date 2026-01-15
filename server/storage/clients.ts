import { clients, typesMarches, tags, clientTags, clientActivities, users, agences } from "@shared/schema";
import { type Client, type InsertClient, type ClientTag, type InsertClientTag, type Tag, type InsertTag, type ClientActivity, type InsertClientActivity, type User } from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, isNull } from "drizzle-orm";

// Type pour client avec données utilisateur
export interface ClientWithUser extends Client {
  user?: {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    sexe: string | null;
    photoProfile: string | null;
  } | null;
}

// Clients
export async function getClient(id: string): Promise<Client | undefined> {
  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  return client || undefined;
}

export async function getAllClients(filter: { agence?: string; agenceId?: string } = {}): Promise<(Client & { type_marche_nom?: string | null; agence_nom?: string | null })[]> {
  const conditions = [];

  // Filtrer par agenceId (prioritaire) ou par agence (legacy)
  if (filter.agenceId && filter.agenceId !== "all") {
    conditions.push(eq(clients.agenceId, filter.agenceId));
  } else if (filter.agence && filter.agence !== "all") {
    conditions.push(eq(clients.agence, filter.agence));
  }

  let query = db
    .select({
      client: clients,
      type_marche_nom: typesMarches.nom,
      agence_nom: agences.nom,
      user_nom: users.nom,
      user_prenom: users.prenom,
      user_telephone: users.telephone,
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

  return results.map(r => ({
    ...r.client,
    // Use user data as source of truth for identity, fallback to legacy fields
    nom: r.user_nom || r.client.nom,
    prenom: r.user_prenom || r.client.prenom,
    telephone: r.user_telephone || r.client.telephone,
    type_marche_nom: r.type_marche_nom,
    agence_nom: r.agence_nom
  }));
}

export async function createClient(insertClient: InsertClient): Promise<Client> {
  const [client] = await db.insert(clients).values(insertClient).returning();
  return client;
}

export async function updateClient(id: string, updateData: Partial<InsertClient>): Promise<Client | undefined> {
  const [client] = await db
    .update(clients)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning();
  return client || undefined;
}

export async function deleteClient(id: string): Promise<boolean> {
  try {
    const result = await db.delete(clients).where(eq(clients.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  } catch (error: any) {
    if (error?.code === "23503") { // Foreign key violation
      const [updated] = await db
        .update(clients)
        .set({ status: "Supprimé", updatedAt: new Date() })
        .where(eq(clients.id, id))
        .returning();
      return !!updated;
    }
    throw error;
  }
}

// Types Marches
export async function getAllTypesMarches(): Promise<any[]> {
  return db.select().from(typesMarches);
}

// Tags
export async function getAllTags(): Promise<Tag[]> {
  return db.select().from(tags);
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
  .innerJoin(tags, eq(clientTags.tagId, tags.id))
  .where(eq(clientTags.clientId, clientId));

  return rows.map(r => ({ ...r.clientTag, tag: r.tag }));
}

export async function addClientTag(entry: InsertClientTag): Promise<ClientTag> {
    const [ct] = await db.insert(clientTags).values(entry).returning();
    return ct;
}

export async function removeClientTag(clientId: string, tagId: string): Promise<boolean> {
    const res = await db.delete(clientTags).where(and(eq(clientTags.clientId, clientId), eq(clientTags.tagId, tagId)));
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
import { historiquePoints, type InsertHistoriquePoints } from "@shared/schema";
import { sql } from "drizzle-orm";

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
  },
  clientData: Omit<InsertClient, 'userId' | 'nom' | 'prenom' | 'email' | 'telephone'>
): Promise<{ user: User; client: Client }> {
  return await db.transaction(async (tx) => {
    // Créer l'utilisateur
    const [user] = await tx.insert(users).values({
      nom: userData.nom,
      prenom: userData.prenom,
      email: userData.email,
      telephone: userData.telephone,
      sexe: userData.sexe,
      username: userData.username,
      password: userData.password,
      typeCompte: 'client',
      canLogin: !!userData.username, // Peut se connecter seulement si username est fourni
      statut: 'Actif',
    }).returning();

    // Créer le client lié
    const [client] = await tx.insert(clients).values({
      ...clientData,
      userId: user.id,
      // Champs legacy - copiés depuis user pour rétro-compatibilité
      nom: userData.nom,
      prenom: userData.prenom,
      email: userData.email,
      telephone: userData.telephone,
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
 */
export async function createClientForUser(userId: string, clientData: Omit<InsertClient, 'userId'>): Promise<Client> {
  // Récupérer les données user pour les champs legacy
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  const [client] = await db.insert(clients).values({
    ...clientData,
    userId,
    // Champs legacy copiés depuis user
    nom: clientData.nom || user?.nom,
    prenom: clientData.prenom || user?.prenom,
    email: clientData.email || user?.email,
    telephone: clientData.telephone || user?.telephone,
  }).returning();

  // Mettre à jour le type_compte du user si nécessaire
  if (user && user.typeCompte === 'employe') {
    await db.update(users)
      .set({ typeCompte: 'both' })
      .where(eq(users.id, userId));
  }

  return client;
}
