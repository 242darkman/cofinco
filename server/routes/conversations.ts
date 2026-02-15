/**
 * Conversations API Routes V2
 *
 * Système de messagerie conversation-centric avec support:
 * - DM (1-to-1) et GROUP conversations
 * - Pagination cursor-based
 * - Read receipts avec "vu à [heure]"
 * - Réactions aux messages
 * - Sanitization XSS
 * - IDOR protection
 *
 * Base URL: /api/v2/conversations
 */

import type { Express, Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";
import { requireAuth } from "../auth";

const logger = createLogger('Routes:Conversations');
import { db } from "../db";
import {
  conversations,
  conversationParticipants,
  messagesV2,
  messageReactions,
  users,
  userAgences,
  agences,
  userRoles,
  notifications,
  generateDMKey,
  truncateMessagePreview,
  createDMSchema,
  createGroupSchema,
  sendMessageSchema,
  markAsReadSchema,
  reactionSchema,
  paginationSchema,
  ALLOWED_REACTION_EMOJIS,
  ConversationType,
  ParticipantRole,
  MessageContentType,
  type SelectConversation,
  type SelectConversationParticipant,
  type SelectMessageV2,
} from "@shared/schema";
import { eq, and, or, desc, asc, sql, ne, lt, gt, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { getWsInstance } from "../ws-server";
import DOMPurify from "isomorphic-dompurify";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

// Type-safe user extraction from authenticated request
interface AuthUser {
  id: string;
  username?: string;
  role?: string;
  agenceId?: string;
}

function getAuthUser(req: Request): AuthUser | null {
  return (req as any).user || null;
}

interface ConversationWithDetails extends SelectConversation {
  participants: Array<{
    id: string;
    nom: string;
    prenom: string | null;
    photoProfile: string | null;
    role: string | null;
    agence: string | null;
    lastReadAt: Date | null;
    lastReadMessageId: string | null;
  }>;
  unreadCount: number;
  lastMessage: SelectMessageV2 | null;
}

interface MessageWithSender extends SelectMessageV2 {
  sender: {
    id: string;
    nom: string;
    prenom: string | null;
    photoProfile: string | null;
  };
  reactions: Array<{
    emoji: string;
    count: number;
    users: Array<{ id: string; nom: string }>;
    hasReacted: boolean;
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Sanitize user input pour éviter XSS
 */
function sanitizeContent(content: string | null | undefined): string {
  if (!content) return "";
  // Strip HTML tags and sanitize
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [], // No HTML allowed
    ALLOWED_ATTR: [],
  }).trim();
}

/**
 * Vérifie si l'utilisateur est participant d'une conversation
 * Retourne le participant ou null si non autorisé
 */
async function getParticipantOrNull(
  conversationId: string,
  userId: string
): Promise<SelectConversationParticipant | null> {
  const participant = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
        isNull(conversationParticipants.leftAt) // N'a pas quitté
      )
    )
    .limit(1);

  return participant[0] || null;
}

/**
 * Middleware IDOR: vérifie que l'utilisateur est participant
 */
function requireParticipant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const conversationId = req.params.conversationId || req.params.id;

  if (!conversationId) {
    res.status(400).json({ message: "Conversation ID required" });
    return;
  }

  const user = getAuthUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  getParticipantOrNull(conversationId, user.id)
    .then((participant) => {
      if (!participant) {
        res.status(403).json({ message: "Access denied: not a participant" });
        return;
      }
      // Attach participant to request for later use
      (req as any).participant = participant;
      next();
    })
    .catch((error) => {
      logger.error({ err: error }, 'Error checking participant');
      res.status(500).json({ message: "Internal server error" });
    });
}

/**
 * Vérifie si l'utilisateur est admin de la conversation
 */
async function isConversationAdmin(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const participant = await getParticipantOrNull(conversationId, userId);
  return participant?.role === ParticipantRole.ADMIN;
}

/**
 * Récupère tous les participants d'une conversation (pour broadcast WS)
 */
async function getConversationParticipantIds(
  conversationId: string
): Promise<string[]> {
  const participants = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        isNull(conversationParticipants.leftAt)
      )
    );

  return participants.map((p) => p.userId);
}

/**
 * Broadcast WS à tous les participants d'une conversation
 */
function broadcastToConversation(
  conversationId: string,
  participantIds: string[],
  type: "CHAT_MESSAGE_V2" | "TYPING_V2" | "READ_UPDATE" | "CONVERSATION_UPDATE" | "MESSAGE_REACTION" | "MESSAGE_DELETED" | "MESSAGE_EDITED",
  payload: any
): void {
  const wsInstance = getWsInstance();
  if (!wsInstance) return;

  for (const userId of participantIds) {
    wsInstance.sendToUser(userId, { type, payload });
  }
}

/**
 * Parse le cursor de pagination (format: "timestamp:id" ou ISO date)
 */
function parseCursor(cursor: string): { timestamp: Date; id?: string } {
  if (cursor.includes(":")) {
    const [timestamp, id] = cursor.split(":");
    return { timestamp: new Date(timestamp), id };
  }
  return { timestamp: new Date(cursor) };
}

/**
 * Crée le cursor pour la pagination
 */
function createCursor(timestamp: Date, id?: string): string {
  if (id) {
    return `${timestamp.toISOString()}:${id}`;
  }
  return timestamp.toISOString();
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTE REGISTRATION
// ══════════════════════════════════════════════════════════════════════════════

export function registerConversationsRoutes(app: Express): void {
  // ════════════════════════════════════════════════════════════════════════════
  // CONVERSATIONS CRUD
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v2/conversations
   * Liste les conversations de l'utilisateur avec pagination cursor-based
   */
  app.get("/api/v2/conversations", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { cursor, limit } = paginationSchema.parse(req.query);
      const userId = user.id;

      // Base query: conversations où l'utilisateur est participant actif
      let query = db
        .select({
          conversation: conversations,
          participant: conversationParticipants,
        })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          and(
            eq(conversationParticipants.conversationId, conversations.id),
            eq(conversationParticipants.userId, userId),
            isNull(conversationParticipants.leftAt)
          )
        )
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.updatedAt))
        .limit(limit + 1); // +1 pour détecter s'il y a une page suivante

      // Appliquer cursor si présent
      if (cursor) {
        const { timestamp } = parseCursor(cursor);
        query = query.where(
          or(
            lt(conversations.lastMessageAt, timestamp),
            and(
              eq(conversations.lastMessageAt, timestamp),
              lt(conversations.updatedAt, timestamp)
            )
          )
        ) as typeof query;
      }

      const results = await query;

      // Vérifier s'il y a une page suivante
      const hasMore = results.length > limit;
      const items = hasMore ? results.slice(0, -1) : results;

      // Enrichir avec détails
      const enrichedConversations = await Promise.all(
        items.map(async ({ conversation, participant }) => {
          // Récupérer tous les participants avec infos user
          const allParticipants = await db
            .select({
              id: users.id,
              nom: users.nom,
              prenom: users.prenom,
              photoProfile: users.photoProfile,
              role: userRoles.role,
              agence: agences.nom,
              lastReadAt: conversationParticipants.lastReadAt,
              lastReadMessageId: conversationParticipants.lastReadMessageId,
            })
            .from(conversationParticipants)
            .innerJoin(users, eq(users.id, conversationParticipants.userId))
            .leftJoin(
              userRoles,
              and(eq(userRoles.userId, users.id), eq(userRoles.isPrimary, true))
            )
            .leftJoin(
              userAgences,
              and(
                eq(userAgences.userId, users.id),
                eq(userAgences.isPrimary, true),
                eq(userAgences.actif, true)
              )
            )
            .leftJoin(agences, eq(agences.id, userAgences.agenceId))
            .where(
              and(
                eq(conversationParticipants.conversationId, conversation.id),
                isNull(conversationParticipants.leftAt)
              )
            );

          // Calculer unread count
          const unreadResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(messagesV2)
            .where(
              and(
                eq(messagesV2.conversationId, conversation.id),
                ne(messagesV2.senderId, userId),
                isNull(messagesV2.deletedAt),
                participant.lastReadAt
                  ? gt(messagesV2.createdAt, participant.lastReadAt)
                  : sql`true`
              )
            );

          // Récupérer le dernier message
          const lastMessage = conversation.lastMessageId
            ? await db
                .select()
                .from(messagesV2)
                .where(eq(messagesV2.id, conversation.lastMessageId))
                .limit(1)
                .then((r) => r[0] || null)
            : null;

          return {
            ...conversation,
            participants: allParticipants,
            unreadCount: unreadResult[0]?.count || 0,
            lastMessage,
            // Pour DM: titre = nom du partenaire
            displayTitle:
              conversation.type === "DM"
                ? allParticipants
                    .filter((p) => p.id !== userId)
                    .map((p) => `${p.nom} ${p.prenom || ""}`.trim())
                    .join(", ") || "Conversation"
                : conversation.title || "Groupe sans nom",
          };
        })
      );

      // Créer le nextCursor
      const lastItem = items[items.length - 1];
      const nextCursor = hasMore && lastItem
        ? createCursor(
            lastItem.conversation.lastMessageAt || lastItem.conversation.updatedAt
          )
        : null;

      res.json({
        data: enrichedConversations,
        nextCursor,
        hasMore,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching conversations');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid parameters", errors: error.errors });
      }
      res.status(500).json({ message: "Error fetching conversations" });
    }
  });

  /**
   * GET /api/v2/conversations/unread-count
   * Retourne le nombre total de messages non lus
   * IMPORTANT: Cette route DOIT être définie AVANT /api/v2/conversations/:id
   */
  app.get("/api/v2/conversations/unread-count", requireAuth, async (req, res) => {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) return res.status(401).json({ message: "Unauthorized" });

      // Récupérer les participations de l'utilisateur avec leur lastReadAt
      const participations = await db
        .select({
          conversationId: conversationParticipants.conversationId,
          lastReadAt: conversationParticipants.lastReadAt,
        })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.userId, authUser.id));

      if (participations.length === 0) {
        return res.json({ totalUnread: 0, conversations: [] });
      }

      // Compter les messages non lus pour chaque conversation
      const conversationsWithUnread: Array<{ id: string; unreadCount: number }> = [];
      let totalUnread = 0;

      for (const participation of participations) {
        // Construire les conditions de requête
        const conditions = [
          eq(messagesV2.conversationId, participation.conversationId),
          ne(messagesV2.senderId, authUser.id),
          isNull(messagesV2.deletedAt),
        ];

        // Si lastReadAt existe, ne compter que les messages après cette date
        if (participation.lastReadAt) {
          conditions.push(gt(messagesV2.createdAt, participation.lastReadAt));
        }

        const result = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(messagesV2)
          .where(and(...conditions));

        const unreadCount = result[0]?.count ?? 0;

        if (unreadCount > 0) {
          totalUnread += unreadCount;
          conversationsWithUnread.push({
            id: participation.conversationId,
            unreadCount,
          });
        }
      }

      res.json({
        totalUnread,
        conversations: conversationsWithUnread,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error getting unread count');
      res.status(500).json({ message: "Error getting unread count" });
    }
  });

  /**
   * GET /api/v2/conversations/:id
   * Détails d'une conversation
   */
  app.get(
    "/api/v2/conversations/:id",
    requireAuth,
    requireParticipant,
    async (req, res) => {
      try {
        const conversationId = req.params.id;
        const userId = getAuthUser(req)!.id;

        const conversation = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, conversationId))
          .limit(1);

        if (!conversation[0]) {
          return res.status(404).json({ message: "Conversation not found" });
        }

        // Récupérer participants
        const participants = await db
          .select({
            id: users.id,
            nom: users.nom,
            prenom: users.prenom,
            photoProfile: users.photoProfile,
            role: userRoles.role,
            agence: agences.nom,
            participantRole: conversationParticipants.role,
            joinedAt: conversationParticipants.joinedAt,
            lastReadAt: conversationParticipants.lastReadAt,
          })
          .from(conversationParticipants)
          .innerJoin(users, eq(users.id, conversationParticipants.userId))
          .leftJoin(
            userRoles,
            and(eq(userRoles.userId, users.id), eq(userRoles.isPrimary, true))
          )
          .leftJoin(
            userAgences,
            and(
              eq(userAgences.userId, users.id),
              eq(userAgences.isPrimary, true),
              eq(userAgences.actif, true)
            )
          )
          .leftJoin(agences, eq(agences.id, userAgences.agenceId))
          .where(
            and(
              eq(conversationParticipants.conversationId, conversationId),
              isNull(conversationParticipants.leftAt)
            )
          );

        res.json({
          ...conversation[0],
          participants,
          displayTitle:
            conversation[0].type === "DM"
              ? participants
                  .filter((p) => p.id !== userId)
                  .map((p) => `${p.nom} ${p.prenom || ""}`.trim())
                  .join(", ") || "Conversation"
              : conversation[0].title || "Groupe sans nom",
        });
      } catch (error) {
        logger.error({ err: error }, 'Error fetching conversation');
        res.status(500).json({ message: "Error fetching conversation" });
      }
    }
  );

  /**
   * POST /api/v2/conversations/dm
   * Créer ou récupérer une conversation DM avec un utilisateur
   */
  app.post("/api/v2/conversations/dm", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { userId: targetUserId } = createDMSchema.parse(req.body);
      const currentUserId = user.id;

      // Impossible de créer un DM avec soi-même
      if (targetUserId === currentUserId) {
        return res.status(400).json({ message: "Cannot create DM with yourself" });
      }

      // Vérifier que l'utilisateur cible existe
      const targetUser = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      if (!targetUser[0]) {
        return res.status(404).json({ message: "User not found" });
      }

      // Générer la clé DM déterministe
      const dmKey = generateDMKey(currentUserId, targetUserId);

      // Vérifier si une conversation existe déjà
      const existingConversation = await db
        .select()
        .from(conversations)
        .where(eq(conversations.dmKey, dmKey))
        .limit(1);

      if (existingConversation[0]) {
        // Vérifier que l'utilisateur actuel n'a pas quitté
        const myParticipation = await getParticipantOrNull(
          existingConversation[0].id,
          currentUserId
        );

        if (!myParticipation) {
          // Réintégrer l'utilisateur
          await db
            .update(conversationParticipants)
            .set({ leftAt: null, updatedAt: new Date() })
            .where(
              and(
                eq(conversationParticipants.conversationId, existingConversation[0].id),
                eq(conversationParticipants.userId, currentUserId)
              )
            );
        }

        return res.json({ conversation: existingConversation[0], created: false });
      }

      // Créer nouvelle conversation
      const [newConversation] = await db
        .insert(conversations)
        .values({
          type: "DM",
          dmKey,
          createdById: currentUserId,
        })
        .returning();

      // Ajouter les deux participants
      await db.insert(conversationParticipants).values([
        {
          conversationId: newConversation.id,
          userId: currentUserId,
          role: "MEMBER",
        },
        {
          conversationId: newConversation.id,
          userId: targetUserId,
          role: "MEMBER",
        },
      ]);

      // Notifier le target user via WS
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.sendToUser(targetUserId, {
          type: "CONVERSATION_UPDATE",
          payload: {
            action: "created",
            conversation: newConversation,
          },
        });
      }

      res.status(201).json({ conversation: newConversation, created: true });
    } catch (error) {
      logger.error({ err: error }, 'Error creating DM');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating conversation" });
    }
  });

  /**
   * POST /api/v2/conversations/group
   * Créer une conversation de groupe
   */
  app.post("/api/v2/conversations/group", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { title, participantIds } = createGroupSchema.parse(req.body);
      const currentUserId = user.id;

      // Sanitize title
      const sanitizedTitle = sanitizeContent(title);

      // S'assurer que le créateur est dans la liste (utiliser Array.from pour compatibilité)
      const allParticipantIds = Array.from(new Set([currentUserId, ...participantIds]));

      // Vérifier que tous les participants existent
      const existingUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, allParticipantIds));

      if (existingUsers.length !== allParticipantIds.length) {
        return res.status(400).json({ message: "One or more users not found" });
      }

      // Créer la conversation
      const [newConversation] = await db
        .insert(conversations)
        .values({
          type: "GROUP",
          title: sanitizedTitle,
          createdById: currentUserId,
        })
        .returning();

      // Ajouter les participants
      await db.insert(conversationParticipants).values(
        allParticipantIds.map((userId) => ({
          conversationId: newConversation.id,
          userId,
          role: (userId === currentUserId ? "ADMIN" : "MEMBER") as "ADMIN" | "MEMBER",
        }))
      );

      // Message système de création
      const [systemMessage] = await db
        .insert(messagesV2)
        .values({
          conversationId: newConversation.id,
          senderId: currentUserId,
          contentType: "SYSTEM",
          metadata: {
            action: "created",
            newValue: sanitizedTitle,
          },
        })
        .returning();

      // Mettre à jour lastMessage
      await db
        .update(conversations)
        .set({
          lastMessageId: systemMessage.id,
          lastMessageAt: systemMessage.createdAt,
          lastMessagePreview: `Groupe "${sanitizedTitle}" créé`,
        })
        .where(eq(conversations.id, newConversation.id));

      // Notifier les participants via WS
      broadcastToConversation(
        newConversation.id,
        allParticipantIds.filter((id) => id !== currentUserId),
        "CONVERSATION_UPDATE",
        {
          action: "created",
          conversation: newConversation,
        }
      );

      res.status(201).json({ conversation: newConversation, created: true });
    } catch (error) {
      logger.error({ err: error }, 'Error creating group');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating group" });
    }
  });

  /**
   * PATCH /api/v2/conversations/:id
   * Modifier une conversation (titre pour groupe)
   */
  app.patch(
    "/api/v2/conversations/:id",
    requireAuth,
    requireParticipant,
    async (req, res) => {
      try {
        const conversationId = req.params.id;
        const userId = getAuthUser(req)!.id;

        // Vérifier que c'est un groupe
        const conversation = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, conversationId))
          .limit(1);

        if (!conversation[0]) {
          return res.status(404).json({ message: "Conversation not found" });
        }

        if (conversation[0].type !== "GROUP") {
          return res.status(400).json({ message: "Cannot modify DM conversation" });
        }

        // Vérifier que l'utilisateur est admin
        const isAdmin = await isConversationAdmin(conversationId, userId);
        if (!isAdmin) {
          return res.status(403).json({ message: "Only admins can modify group" });
        }

        const updateSchema = z.object({
          title: z.string().min(1).max(100).optional(),
        });

        const { title } = updateSchema.parse(req.body);

        const updates: Partial<SelectConversation> = {
          updatedAt: new Date(),
        };

        if (title) {
          updates.title = sanitizeContent(title);
        }

        const [updated] = await db
          .update(conversations)
          .set(updates)
          .where(eq(conversations.id, conversationId))
          .returning();

        // Message système de modification
        if (title) {
          const [systemMessage] = await db
            .insert(messagesV2)
            .values({
              conversationId,
              senderId: userId,
              contentType: "SYSTEM" as const,
              metadata: {
                action: "renamed",
                oldValue: conversation[0].title ?? undefined,
                newValue: sanitizeContent(title),
              },
            })
            .returning();

          // Mettre à jour lastMessage
          await db
            .update(conversations)
            .set({
              lastMessageId: systemMessage.id,
              lastMessageAt: systemMessage.createdAt,
              lastMessagePreview: `Groupe renommé en "${sanitizeContent(title)}"`,
            })
            .where(eq(conversations.id, conversationId));
        }

        // Notifier les participants
        const participantIds = await getConversationParticipantIds(conversationId);
        broadcastToConversation(conversationId, participantIds, "CONVERSATION_UPDATE", {
          action: "updated",
          conversation: updated,
        });

        res.json(updated);
      } catch (error) {
        logger.error({ err: error }, 'Error updating conversation');
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Invalid input", errors: error.errors });
        }
        res.status(500).json({ message: "Error updating conversation" });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PARTICIPANTS MANAGEMENT
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v2/conversations/:id/participants
   * Ajouter un participant à un groupe
   */
  app.post(
    "/api/v2/conversations/:id/participants",
    requireAuth,
    requireParticipant,
    async (req, res) => {
      try {
        const conversationId = req.params.id;
        const userId = getAuthUser(req)!.id;

        const addSchema = z.object({
          userId: z.string().uuid(),
        });

        const { userId: newUserId } = addSchema.parse(req.body);

        // Vérifier que c'est un groupe
        const conversation = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, conversationId))
          .limit(1);

        if (!conversation[0] || conversation[0].type !== "GROUP") {
          return res.status(400).json({ message: "Can only add participants to groups" });
        }

        // Vérifier que l'utilisateur est admin
        const isAdmin = await isConversationAdmin(conversationId, userId);
        if (!isAdmin) {
          return res.status(403).json({ message: "Only admins can add participants" });
        }

        // Vérifier que l'utilisateur cible existe
        const targetUser = await db
          .select()
          .from(users)
          .where(eq(users.id, newUserId))
          .limit(1);

        if (!targetUser[0]) {
          return res.status(404).json({ message: "User not found" });
        }

        // Vérifier si déjà participant
        const existingParticipant = await db
          .select()
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.conversationId, conversationId),
              eq(conversationParticipants.userId, newUserId)
            )
          )
          .limit(1);

        if (existingParticipant[0]) {
          if (!existingParticipant[0].leftAt) {
            return res.status(400).json({ message: "User already in conversation" });
          }
          // Réintégrer l'utilisateur
          await db
            .update(conversationParticipants)
            .set({ leftAt: null, joinedAt: new Date(), updatedAt: new Date() })
            .where(eq(conversationParticipants.id, existingParticipant[0].id));
        } else {
          // Ajouter le participant
          await db.insert(conversationParticipants).values({
            conversationId,
            userId: newUserId,
            role: "MEMBER",
          });
        }

        // Message système
        const [systemMessage] = await db
          .insert(messagesV2)
          .values({
            conversationId,
            senderId: userId,
            contentType: "SYSTEM",
            metadata: {
              action: "joined",
              targetUserId: newUserId,
            },
          })
          .returning();

        // Mettre à jour lastMessage
        await db
          .update(conversations)
          .set({
            lastMessageId: systemMessage.id,
            lastMessageAt: systemMessage.createdAt,
            lastMessagePreview: `${targetUser[0].nom} a rejoint le groupe`,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conversationId));

        // Notifier les participants
        const participantIds = await getConversationParticipantIds(conversationId);
        broadcastToConversation(
          conversationId,
          participantIds,
          "CONVERSATION_UPDATE",
          {
            action: "participant_joined",
            conversationId,
            userId: newUserId,
            user: targetUser[0],
          }
        );

        res.status(201).json({ success: true });
      } catch (error) {
        logger.error({ err: error }, 'Error adding participant');
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Invalid input", errors: error.errors });
        }
        res.status(500).json({ message: "Error adding participant" });
      }
    }
  );

  /**
   * DELETE /api/v2/conversations/:id/participants/:userId
   * Retirer un participant ou quitter le groupe
   */
  app.delete(
    "/api/v2/conversations/:id/participants/:userId",
    requireAuth,
    requireParticipant,
    async (req, res) => {
      try {
        const conversationId = req.params.id;
        const targetUserId = req.params.userId;
        const currentUserId = getAuthUser(req)!.id;

        // Vérifier que c'est un groupe
        const conversation = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, conversationId))
          .limit(1);

        if (!conversation[0] || conversation[0].type !== "GROUP") {
          return res.status(400).json({ message: "Can only leave/remove from groups" });
        }

        const isSelf = targetUserId === currentUserId;
        const isAdmin = await isConversationAdmin(conversationId, currentUserId);

        // Seul un admin peut retirer quelqu'un d'autre
        if (!isSelf && !isAdmin) {
          return res.status(403).json({ message: "Only admins can remove participants" });
        }

        // Récupérer info utilisateur cible
        const targetUser = await db
          .select()
          .from(users)
          .where(eq(users.id, targetUserId))
          .limit(1);

        // Marquer comme parti
        await db
          .update(conversationParticipants)
          .set({ leftAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(conversationParticipants.conversationId, conversationId),
              eq(conversationParticipants.userId, targetUserId)
            )
          );

        // Message système
        const [systemMessage] = await db
          .insert(messagesV2)
          .values({
            conversationId,
            senderId: currentUserId,
            contentType: "SYSTEM",
            metadata: {
              action: "left",
              targetUserId,
            },
          })
          .returning();

        // Mettre à jour lastMessage
        const leaveMessage = isSelf
          ? `${targetUser[0]?.nom || "Utilisateur"} a quitté le groupe`
          : `${targetUser[0]?.nom || "Utilisateur"} a été retiré du groupe`;

        await db
          .update(conversations)
          .set({
            lastMessageId: systemMessage.id,
            lastMessageAt: systemMessage.createdAt,
            lastMessagePreview: leaveMessage,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conversationId));

        // Notifier les participants restants
        const participantIds = await getConversationParticipantIds(conversationId);
        broadcastToConversation(
          conversationId,
          participantIds,
          "CONVERSATION_UPDATE",
          {
            action: "participant_left",
            conversationId,
            userId: targetUserId,
          }
        );

        res.json({ success: true });
      } catch (error) {
        logger.error({ err: error }, 'Error removing participant');
        res.status(500).json({ message: "Error removing participant" });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // MESSAGES
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v2/conversations/:id/messages
   * Liste les messages d'une conversation avec pagination cursor-based
   */
  app.get(
    "/api/v2/conversations/:id/messages",
    requireAuth,
    requireParticipant,
    async (req, res) => {
      try {
        const conversationId = req.params.id;
        const userId = getAuthUser(req)!.id;
        const { cursor, limit } = paginationSchema.parse(req.query);

        // Base query
        let conditions = and(
          eq(messagesV2.conversationId, conversationId),
          isNull(messagesV2.deletedAt)
        );

        // Appliquer cursor
        if (cursor) {
          const { timestamp, id } = parseCursor(cursor);
          conditions = and(
            conditions,
            or(
              lt(messagesV2.createdAt, timestamp),
              and(
                eq(messagesV2.createdAt, timestamp),
                id ? lt(messagesV2.id, id) : sql`true`
              )
            )
          );
        }

        const messagesResult = await db
          .select()
          .from(messagesV2)
          .where(conditions)
          .orderBy(desc(messagesV2.createdAt), desc(messagesV2.id))
          .limit(limit + 1);

        const hasMore = messagesResult.length > limit;
        const items = hasMore ? messagesResult.slice(0, -1) : messagesResult;

        // Enrichir avec sender et reactions
        const enrichedMessages = await Promise.all(
          items.map(async (message) => {
            // Sender info
            const [sender] = await db
              .select({
                id: users.id,
                nom: users.nom,
                prenom: users.prenom,
                photoProfile: users.photoProfile,
              })
              .from(users)
              .where(eq(users.id, message.senderId))
              .limit(1);

            // Reactions agregées
            const reactions = await db
              .select({
                emoji: messageReactions.emoji,
                userId: messageReactions.userId,
                userName: users.nom,
              })
              .from(messageReactions)
              .innerJoin(users, eq(users.id, messageReactions.userId))
              .where(eq(messageReactions.messageId, message.id));

            // Grouper par emoji
            const reactionMap = new Map<
              string,
              { count: number; users: Array<{ id: string; nom: string }>; hasReacted: boolean }
            >();
            for (const r of reactions) {
              if (!reactionMap.has(r.emoji)) {
                reactionMap.set(r.emoji, { count: 0, users: [], hasReacted: false });
              }
              const entry = reactionMap.get(r.emoji)!;
              entry.count++;
              entry.users.push({ id: r.userId, nom: r.userName });
              if (r.userId === userId) {
                entry.hasReacted = true;
              }
            }

            return {
              ...message,
              sender: sender || { id: message.senderId, nom: "Utilisateur", prenom: null, photoProfile: null },
              reactions: Array.from(reactionMap.entries()).map(([emoji, data]) => ({
                emoji,
                ...data,
              })),
            };
          })
        );

        // Reverse pour ordre chronologique (plus ancien en premier)
        enrichedMessages.reverse();

        // Cursor pour la page suivante (messages plus anciens)
        const oldestItem = items[items.length - 1];
        const nextCursor = hasMore && oldestItem
          ? createCursor(oldestItem.createdAt, oldestItem.id)
          : null;

        res.json({
          data: enrichedMessages,
          nextCursor,
          hasMore,
        });
      } catch (error) {
        logger.error({ err: error }, 'Error fetching messages');
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Invalid parameters", errors: error.errors });
        }
        res.status(500).json({ message: "Error fetching messages" });
      }
    }
  );

  /**
   * POST /api/v2/conversations/:id/messages
   * Envoyer un message dans une conversation
   */
  app.post(
    "/api/v2/conversations/:id/messages",
    requireAuth,
    requireParticipant,
    async (req, res) => {
      try {
        const conversationId = req.params.id;
        const senderId = getAuthUser(req)!.id;

        const { content, contentType, metadata, replyToMessageId } = sendMessageSchema.parse(
          req.body
        );

        // Sanitize content
        const sanitizedContent = sanitizeContent(content);

        if (!sanitizedContent && contentType === "TEXT") {
          return res.status(400).json({ message: "Content is required for text messages" });
        }

        // Vérifier le message de réponse si présent
        if (replyToMessageId) {
          const replyTo = await db
            .select()
            .from(messagesV2)
            .where(
              and(
                eq(messagesV2.id, replyToMessageId),
                eq(messagesV2.conversationId, conversationId)
              )
            )
            .limit(1);

          if (!replyTo[0]) {
            return res.status(400).json({ message: "Reply message not found" });
          }
        }

        // Créer le message
        const [newMessage] = await db
          .insert(messagesV2)
          .values({
            conversationId,
            senderId,
            content: sanitizedContent || null,
            contentType: (contentType as any) || "TEXT",
            metadata: metadata as any,
            replyToMessageId,
          })
          .returning();

        // Generate user-friendly preview based on contentType
        const ct = (contentType as string) || "TEXT";
        let preview: string;
        if (ct === "IMAGE") {
          preview = "📷 Photo";
        } else if (ct === "FILE") {
          preview = `📎 ${(metadata as any)?.filename || "Fichier"}`;
        } else if (ct === "AUDIO") {
          preview = "🎵 Audio";
        } else {
          preview = truncateMessagePreview(sanitizedContent);
        }

        // Mettre à jour la conversation
        await db
          .update(conversations)
          .set({
            lastMessageId: newMessage.id,
            lastMessageAt: newMessage.createdAt,
            lastMessagePreview: preview,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conversationId));

        // Récupérer sender info
        const [sender] = await db
          .select({
            id: users.id,
            nom: users.nom,
            prenom: users.prenom,
            photoProfile: users.photoProfile,
          })
          .from(users)
          .where(eq(users.id, senderId))
          .limit(1);

        const messageWithSender = {
          ...newMessage,
          sender,
          reactions: [],
        };

        // Broadcast à tous les participants
        const participantIds = await getConversationParticipantIds(conversationId);
        broadcastToConversation(conversationId, participantIds, "CHAT_MESSAGE_V2", {
          conversationId,
          message: messageWithSender,
        });

        // Créer des notifications pour tous les participants (sauf l'expéditeur)
        const otherParticipantIds = participantIds.filter(id => id !== senderId);
        if (otherParticipantIds.length > 0) {
          const senderName = sender ? `${sender.nom}${sender.prenom ? ' ' + sender.prenom : ''}` : 'Utilisateur';
          const preview = sanitizedContent ? sanitizedContent.substring(0, 50) : 'Nouveau message';

          // Créer les notifications en batch
          const notificationsToCreate = otherParticipantIds.map(userId => ({
            userId,
            type: 'message',
            titre: `Message de ${senderName}`,
            message: preview + (sanitizedContent && sanitizedContent.length > 50 ? '...' : ''),
            lien: `/messages?conversation=${conversationId}`,
            priorite: 'NORMAL',
            referenceId: conversationId,
            referenceType: 'conversation',
          }));

          try {
            await db.insert(notifications).values(notificationsToCreate);

            // Broadcast notification updates via WebSocket
            const wsInstance = getWsInstance();
            if (wsInstance) {
              for (const participantId of otherParticipantIds) {
                wsInstance.sendToUser(participantId, {
                  type: 'NOTIFICATION',
                  payload: {
                    action: 'created',
                    type: 'message',
                  }
                });
              }
            }
          } catch (notifError) {
            // Log but don't fail the request
            logger.warn({ err: notifError }, 'Failed to create message notifications');
          }
        }

        res.status(201).json(messageWithSender);
      } catch (error) {
        logger.error({ err: error }, 'Error sending message');
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Invalid input", errors: error.errors });
        }
        res.status(500).json({ message: "Error sending message" });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // READ RECEIPTS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v2/conversations/:id/read
   * Marquer la conversation comme lue jusqu'à un certain message
   */
  app.post(
    "/api/v2/conversations/:id/read",
    requireAuth,
    requireParticipant,
    async (req, res) => {
      try {
        const conversationId = req.params.id;
        const userId = getAuthUser(req)!.id;

        const { lastReadMessageId } = markAsReadSchema.parse(req.body);

        // Vérifier que le message existe dans cette conversation
        const message = await db
          .select()
          .from(messagesV2)
          .where(
            and(
              eq(messagesV2.id, lastReadMessageId),
              eq(messagesV2.conversationId, conversationId)
            )
          )
          .limit(1);

        if (!message[0]) {
          return res.status(400).json({ message: "Message not found in conversation" });
        }

        const now = new Date();

        // Mettre à jour le participant
        await db
          .update(conversationParticipants)
          .set({
            lastReadAt: now,
            lastReadMessageId,
            updatedAt: now,
          })
          .where(
            and(
              eq(conversationParticipants.conversationId, conversationId),
              eq(conversationParticipants.userId, userId)
            )
          );

        // Broadcast READ_UPDATE aux autres participants
        const participantIds = await getConversationParticipantIds(conversationId);
        broadcastToConversation(
          conversationId,
          participantIds.filter((id) => id !== userId),
          "READ_UPDATE",
          {
            conversationId,
            userId,
            lastReadAt: now.toISOString(),
            lastReadMessageId,
          }
        );

        res.json({
          success: true,
          lastReadAt: now.toISOString(),
          lastReadMessageId,
        });
      } catch (error) {
        logger.error({ err: error }, 'Error marking as read');
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Invalid input", errors: error.errors });
        }
        res.status(500).json({ message: "Error marking as read" });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // REACTIONS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v2/messages/:id/reactions
   * Ajouter une réaction à un message
   */
  app.post("/api/v2/messages/:id/reactions", requireAuth, async (req, res) => {
    try {
      const messageId = req.params.id;
      const userId = getAuthUser(req)!.id;

      const { emoji } = reactionSchema.parse(req.body);

      // Récupérer le message et vérifier l'accès
      const message = await db
        .select()
        .from(messagesV2)
        .where(eq(messagesV2.id, messageId))
        .limit(1);

      if (!message[0]) {
        return res.status(404).json({ message: "Message not found" });
      }

      // Vérifier que l'utilisateur est participant
      const participant = await getParticipantOrNull(message[0].conversationId, userId);
      if (!participant) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Vérifier si la réaction existe déjà
      const existingReaction = await db
        .select()
        .from(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, messageId),
            eq(messageReactions.userId, userId),
            eq(messageReactions.emoji, emoji)
          )
        )
        .limit(1);

      if (existingReaction[0]) {
        return res.status(400).json({ message: "Reaction already exists" });
      }

      // Ajouter la réaction
      await db.insert(messageReactions).values({
        messageId,
        userId,
        emoji,
      });

      // Broadcast
      const participantIds = await getConversationParticipantIds(message[0].conversationId);
      broadcastToConversation(
        message[0].conversationId,
        participantIds,
        "MESSAGE_REACTION",
        {
          messageId,
          conversationId: message[0].conversationId,
          userId,
          emoji,
          action: "added",
        }
      );

      res.status(201).json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error adding reaction');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Error adding reaction" });
    }
  });

  /**
   * DELETE /api/v2/messages/:id/reactions
   * Retirer une réaction d'un message
   */
  app.delete("/api/v2/messages/:id/reactions", requireAuth, async (req, res) => {
    try {
      const messageId = req.params.id;
      const userId = getAuthUser(req)!.id;

      const { emoji } = reactionSchema.parse(req.body);

      // Récupérer le message et vérifier l'accès
      const message = await db
        .select()
        .from(messagesV2)
        .where(eq(messagesV2.id, messageId))
        .limit(1);

      if (!message[0]) {
        return res.status(404).json({ message: "Message not found" });
      }

      // Vérifier que l'utilisateur est participant
      const participant = await getParticipantOrNull(message[0].conversationId, userId);
      if (!participant) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Supprimer la réaction
      const deleted = await db
        .delete(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, messageId),
            eq(messageReactions.userId, userId),
            eq(messageReactions.emoji, emoji)
          )
        )
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ message: "Reaction not found" });
      }

      // Broadcast
      const participantIds = await getConversationParticipantIds(message[0].conversationId);
      broadcastToConversation(
        message[0].conversationId,
        participantIds,
        "MESSAGE_REACTION",
        {
          messageId,
          conversationId: message[0].conversationId,
          userId,
          emoji,
          action: "removed",
        }
      );

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error removing reaction');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Error removing reaction" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // MESSAGE EDIT/DELETE
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * PATCH /api/v2/messages/:id
   * Modifier un message
   */
  app.patch("/api/v2/messages/:id", requireAuth, async (req, res) => {
    try {
      const messageId = req.params.id;
      const userId = getAuthUser(req)!.id;

      const editSchema = z.object({
        content: z.string().min(1).max(10000),
      });

      const { content } = editSchema.parse(req.body);
      const sanitizedContent = sanitizeContent(content);

      // Récupérer le message
      const message = await db
        .select()
        .from(messagesV2)
        .where(eq(messagesV2.id, messageId))
        .limit(1);

      if (!message[0]) {
        return res.status(404).json({ message: "Message not found" });
      }

      // Vérifier que c'est le sender
      if (message[0].senderId !== userId) {
        return res.status(403).json({ message: "Can only edit your own messages" });
      }

      // Vérifier que ce n'est pas un message système
      if (message[0].contentType === "SYSTEM") {
        return res.status(400).json({ message: "Cannot edit system messages" });
      }

      // Mettre à jour
      const [updated] = await db
        .update(messagesV2)
        .set({
          content: sanitizedContent,
          editedAt: new Date(),
        })
        .where(eq(messagesV2.id, messageId))
        .returning();

      // Broadcast
      const participantIds = await getConversationParticipantIds(message[0].conversationId);
      broadcastToConversation(
        message[0].conversationId,
        participantIds,
        "MESSAGE_EDITED",
        {
          conversationId: message[0].conversationId,
          messageId,
          newContent: sanitizedContent,
          editedAt: updated.editedAt?.toISOString(),
        }
      );

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Error editing message');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Error editing message" });
    }
  });

  /**
   * DELETE /api/v2/messages/:id
   * Supprimer un message (soft delete)
   */
  app.delete("/api/v2/messages/:id", requireAuth, async (req, res) => {
    try {
      const messageId = req.params.id;
      const userId = getAuthUser(req)!.id;

      // Récupérer le message
      const message = await db
        .select()
        .from(messagesV2)
        .where(eq(messagesV2.id, messageId))
        .limit(1);

      if (!message[0]) {
        return res.status(404).json({ message: "Message not found" });
      }

      // Vérifier que c'est le sender ou admin de la conversation
      const isAdmin = await isConversationAdmin(message[0].conversationId, userId);
      if (message[0].senderId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Can only delete your own messages" });
      }

      // Soft delete
      await db
        .update(messagesV2)
        .set({ deletedAt: new Date() })
        .where(eq(messagesV2.id, messageId));

      // Broadcast
      const participantIds = await getConversationParticipantIds(message[0].conversationId);
      broadcastToConversation(
        message[0].conversationId,
        participantIds,
        "MESSAGE_DELETED",
        {
          conversationId: message[0].conversationId,
          messageId,
        }
      );

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting message');
      res.status(500).json({ message: "Error deleting message" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // USER SEARCH (amélioré avec scoping agence)
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v2/conversations/users/search
   * Rechercher des utilisateurs pour démarrer une conversation
   * Avec filtrage par agence optionnel
   */
  app.get("/api/v2/conversations/users/search", requireAuth, async (req, res) => {
    try {
      if (!getAuthUser(req)) return res.status(401).json({ message: "Unauthorized" });

      const query = req.query.q as string;
      const agenceOnly = req.query.agenceOnly === "true";

      if (!query || query.length < 2) return res.json([]);

      // Limite de rate (10 recherches par minute par user)
      // NOTE: Implémenter rate limiting via middleware si nécessaire

      const authUser = getAuthUser(req);
      const searchPattern = `%${query}%`;
      const searchCondition = sql`(
        ${users.username} ILIKE ${searchPattern} OR
        ${users.nom} ILIKE ${searchPattern} OR
        COALESCE(${users.prenom}, '') ILIKE ${searchPattern} OR
        (${users.nom} || ' ' || COALESCE(${users.prenom}, '')) ILIKE ${searchPattern} OR
        (COALESCE(${users.prenom}, '') || ' ' || ${users.nom}) ILIKE ${searchPattern}
      )`;

      // Build where conditions based on agenceOnly filter
      const whereConditions = agenceOnly && authUser?.agenceId
        ? and(
            ne(users.id, authUser.id),
            eq(users.canLogin, true),
            eq(agences.id, authUser.agenceId),
            searchCondition
          )
        : and(
            ne(users.id, authUser!.id),
            eq(users.canLogin, true),
            searchCondition
          );

      const foundUsers = await db
        .select({
          id: users.id,
          username: users.username,
          nom: users.nom,
          prenom: users.prenom,
          photoProfile: users.photoProfile,
          role: userRoles.role,
          agence: agences.nom,
          agenceId: agences.id,
          typeCompte: users.typeCompte,
        })
        .from(users)
        .leftJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.isPrimary, true)))
        .leftJoin(
          userAgences,
          and(
            eq(userAgences.userId, users.id),
            eq(userAgences.isPrimary, true),
            eq(userAgences.actif, true)
          )
        )
        .leftJoin(agences, eq(userAgences.agenceId, agences.id))
        .where(whereConditions)
        .limit(15);
      res.json(foundUsers);
    } catch (error) {
      logger.error({ err: error }, 'Error searching users');
      res.status(500).json({ message: "Error searching users" });
    }
  });
}
