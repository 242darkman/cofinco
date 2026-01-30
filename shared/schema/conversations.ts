/**
 * Conversations Schema - Système de messagerie conversation-centric
 *
 * Architecture:
 * - conversations: Conteneur DM/GROUP
 * - conversation_participants: Membres avec tracking "vu à"
 * - messages_v2: Messages avec support multi-type (TEXT, IMAGE, FILE, AUDIO)
 * - message_reactions: Réactions emoji par utilisateur
 * - (message_receipts removed - unused, read tracking via conversation_participants.lastReadAt)
 *
 * Index optimisés pour:
 * - Liste conversations par utilisateur (tri updatedAt)
 * - Pagination messages (conversationId + createdAt DESC)
 * - Recherche messages par sender
 * - Calcul unread count
 */

import { pgTable, pgEnum, text, varchar, boolean, timestamp, uuid, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";
import { users } from "./auth";
import { agences } from "./agences";

// ══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ══════════════════════════════════════════════════════════════════════════════

export const conversationTypeEnum = pgEnum('conversation_type', ['DM', 'GROUP']);
export const participantRoleEnum = pgEnum('participant_role', ['MEMBER', 'ADMIN']);
export const messageContentTypeEnum = pgEnum('message_content_type', ['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'SYSTEM']);

// Type constants for runtime use
export const ConversationType = {
  DM: 'DM',
  GROUP: 'GROUP',
} as const;
export type ConversationTypeValue = (typeof ConversationType)[keyof typeof ConversationType];

export const ParticipantRole = {
  MEMBER: 'MEMBER',
  ADMIN: 'ADMIN',
} as const;
export type ParticipantRoleValue = (typeof ParticipantRole)[keyof typeof ParticipantRole];

export const MessageContentType = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  FILE: 'FILE',
  AUDIO: 'AUDIO',
  SYSTEM: 'SYSTEM', // Pour messages système (participant joined, etc.)
} as const;
export type MessageContentTypeValue = (typeof MessageContentType)[keyof typeof MessageContentType];

// ══════════════════════════════════════════════════════════════════════════════
// CONVERSATIONS TABLE
// ══════════════════════════════════════════════════════════════════════════════

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: conversationTypeEnum('type').notNull().default('DM'),
  title: text('title'), // Nullable - uniquement pour GROUP

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),

  // Créateur
  createdById: uuid('created_by_id').notNull().references(() => users.id),

  // Optimisation: dernier message pour tri et aperçu rapide
  // Note: FK circulaire, ajoutée via ALTER après création table messages
  lastMessageId: uuid('last_message_id'),
  lastMessageAt: timestamp('last_message_at'), // Pour tri rapide sans JOIN
  lastMessagePreview: text('last_message_preview'), // Aperçu tronqué (optionnel)

  // Scoping par agence (optionnel)
  agenceId: uuid('agence_id').references(() => agences.id),

  // Archivage soft
  isArchived: boolean('is_archived').default(false).notNull(),

  // Clé unique pour DM: garantit une seule conversation entre 2 users
  // Format: "uuid1:uuid2" où uuid1 < uuid2 (tri alphabétique)
  dmKey: varchar('dm_key', { length: 73 }).unique(),
}, (table) => [
  // Index principal: liste conversations triées par activité récente
  index('idx_conversations_updated_at').on(table.updatedAt.desc()),
  index('idx_conversations_last_message_at').on(table.lastMessageAt.desc()),

  // Index pour filtrage par agence
  index('idx_conversations_agence_id').on(table.agenceId),

  // Index créateur
  index('idx_conversations_created_by').on(table.createdById),

  // Index pour DM lookup rapide
  index('idx_conversations_dm_key').on(table.dmKey),
]);

// ══════════════════════════════════════════════════════════════════════════════
// CONVERSATION PARTICIPANTS TABLE
// ══════════════════════════════════════════════════════════════════════════════

export const conversationParticipants = pgTable('conversation_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Rôle dans la conversation (MEMBER par défaut, ADMIN pour créateur/modérateurs de groupe)
  role: participantRoleEnum('role').notNull().default('MEMBER'),

  // Timestamps participation
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  leftAt: timestamp('left_at'), // Nullable - si l'utilisateur a quitté

  // ══════════════════════════════════════════════════════════════════════════
  // READ TRACKING - "Vu à [heure]"
  // lastReadAt: timestamp du dernier message lu (pour afficher "Vu à 18:25")
  // lastReadMessageId: ID du dernier message lu (pour calcul unread count précis)
  // ══════════════════════════════════════════════════════════════════════════
  lastReadAt: timestamp('last_read_at'),
  lastReadMessageId: uuid('last_read_message_id'),

  // Notifications
  muteUntil: timestamp('mute_until'), // Nullable = notifications actives

  // Métadonnées
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  // Contrainte unique: un user ne peut être qu'une fois dans une conversation
  uniqueIndex('idx_participants_unique').on(table.conversationId, table.userId),

  // Index pour lookup par conversation
  index('idx_participants_conversation').on(table.conversationId),

  // Index pour lookup par user (liste des conversations d'un user)
  index('idx_participants_user').on(table.userId),

  // Index partiel: uniquement les participants actifs (non partis)
  index('idx_participants_user_active').on(table.userId).where(sql`left_at IS NULL`),
]);

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGES V2 TABLE (CONVERSATION-CENTRIC)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Metadata schema pour différents types de contenu:
 *
 * TEXT: {}
 * IMAGE: { url: string, width?: number, height?: number, thumbnail?: string }
 * FILE: { url: string, filename: string, size: number, mimeType: string }
 * AUDIO: { url: string, duration: number, waveform?: number[] }
 * SYSTEM: { action: 'joined' | 'left' | 'renamed', targetUserId?: string, oldValue?: string, newValue?: string }
 */
export const messagesV2 = pgTable('messages_v2', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id),

  // Contenu
  content: text('content'), // Nullable pour attachments purs
  contentType: messageContentTypeEnum('content_type').notNull().default('TEXT'),

  // Metadata JSON pour fichiers, images, audio, etc.
  // Structure dépend de contentType
  metadata: jsonb('metadata').$type<MessageMetadata>(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  editedAt: timestamp('edited_at'), // Non-null si message édité
  deletedAt: timestamp('deleted_at'), // Non-null si soft-deleted

  // Réponse à un message (threading)
  replyToMessageId: uuid('reply_to_message_id'),
}, (table) => [
  // Index principal: fetch messages d'une conversation (pagination cursor)
  index('idx_messages_v2_conversation_created').on(table.conversationId, table.createdAt.desc()),

  // Index pour timeline personnelle d'un user
  index('idx_messages_v2_sender_created').on(table.senderId, table.createdAt.desc()),

  // Index pour messages non supprimés uniquement
  index('idx_messages_v2_conversation_active').on(table.conversationId, table.createdAt.desc())
    .where(sql`deleted_at IS NULL`),

  // Index pour replies (optionnel, si feature utilisée)
  index('idx_messages_v2_reply_to').on(table.replyToMessageId),
]);

// Type pour metadata des messages
export interface MessageMetadata {
  // Pour IMAGE
  url?: string;
  width?: number;
  height?: number;
  thumbnail?: string;

  // Pour FILE
  filename?: string;
  size?: number;
  mimeType?: string;

  // Pour AUDIO
  duration?: number;
  waveform?: number[];

  // Pour SYSTEM
  action?: 'joined' | 'left' | 'renamed' | 'created';
  targetUserId?: string;
  oldValue?: string;
  newValue?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGE REACTIONS TABLE
// ══════════════════════════════════════════════════════════════════════════════

// Emojis autorisés pour les réactions (whitelist sécurité)
export const ALLOWED_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🙏', '👏', '🔥'] as const;
export type AllowedReactionEmoji = (typeof ALLOWED_REACTION_EMOJIS)[number];

export const messageReactions = pgTable('message_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messagesV2.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Emoji unicode (ex: "👍", "❤️")
  // Limité à 10 chars pour supporter emojis composés
  emoji: varchar('emoji', { length: 10 }).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  // Un user ne peut mettre qu'une fois le même emoji sur un message
  uniqueIndex('idx_reactions_unique').on(table.messageId, table.userId, table.emoji),

  // Index pour fetch réactions d'un message
  index('idx_reactions_message').on(table.messageId),

  // Index pour stats réactions d'un user (optionnel)
  index('idx_reactions_user').on(table.userId),
]);

// ══════════════════════════════════════════════════════════════════════════════
// RELATIONS DRIZZLE ORM
// ══════════════════════════════════════════════════════════════════════════════

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [conversations.createdById],
    references: [users.id],
    relationName: 'conversationsCreated',
  }),
  agence: one(agences, {
    fields: [conversations.agenceId],
    references: [agences.id],
    relationName: 'conversationAgence',
  }),
  // Note: lastMessage relation circulaire, définie après messagesV2Relations
  participants: many(conversationParticipants, { relationName: 'conversationParticipants' }),
  messages: many(messagesV2, { relationName: 'conversationMessages' }),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
    relationName: 'conversationParticipants',
  }),
  user: one(users, {
    fields: [conversationParticipants.userId],
    references: [users.id],
    relationName: 'userConversationParticipants',
  }),
  lastReadMessage: one(messagesV2, {
    fields: [conversationParticipants.lastReadMessageId],
    references: [messagesV2.id],
    relationName: 'participantLastReadMessage',
  }),
}));

export const messagesV2Relations = relations(messagesV2, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messagesV2.conversationId],
    references: [conversations.id],
    relationName: 'conversationMessages',
  }),
  sender: one(users, {
    fields: [messagesV2.senderId],
    references: [users.id],
    relationName: 'userSentMessages',
  }),
  replyToMessage: one(messagesV2, {
    fields: [messagesV2.replyToMessageId],
    references: [messagesV2.id],
    relationName: 'messageReplies',
  }),
  reactions: many(messageReactions, { relationName: 'messageReactions' }),
}));

export const messageReactionsRelations = relations(messageReactions, ({ one }) => ({
  message: one(messagesV2, {
    fields: [messageReactions.messageId],
    references: [messagesV2.id],
    relationName: 'messageReactions',
  }),
  user: one(users, {
    fields: [messageReactions.userId],
    references: [users.id],
    relationName: 'userMessageReactions',
  }),
}));


// ══════════════════════════════════════════════════════════════════════════════
// INSERT/SELECT TYPES
// ══════════════════════════════════════════════════════════════════════════════

export type InsertConversation = typeof conversations.$inferInsert;
export type SelectConversation = typeof conversations.$inferSelect;

export type InsertConversationParticipant = typeof conversationParticipants.$inferInsert;
export type SelectConversationParticipant = typeof conversationParticipants.$inferSelect;

export type InsertMessageV2 = typeof messagesV2.$inferInsert;
export type SelectMessageV2 = typeof messagesV2.$inferSelect;

export type InsertMessageReaction = typeof messageReactions.$inferInsert;
export type SelectMessageReaction = typeof messageReactions.$inferSelect;


// ══════════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS (VALIDATION)
// ══════════════════════════════════════════════════════════════════════════════

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastMessageId: true,
  lastMessageAt: true,
  lastMessagePreview: true,
});

export const insertConversationParticipantSchema = createInsertSchema(conversationParticipants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageV2Schema = createInsertSchema(messagesV2).omit({
  id: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
});

export const insertMessageReactionSchema = createInsertSchema(messageReactions).omit({
  id: true,
  createdAt: true,
});


// ══════════════════════════════════════════════════════════════════════════════
// API REQUEST/RESPONSE SCHEMAS
// ══════════════════════════════════════════════════════════════════════════════

// Création DM
export const createDMSchema = z.object({
  userId: z.string().uuid('ID utilisateur invalide'),
});

// Création Group
export const createGroupSchema = z.object({
  title: z.string().min(1, 'Le titre est requis').max(100, 'Titre trop long'),
  participantIds: z.array(z.string().uuid()).min(1, 'Au moins un participant requis'),
});

// Envoi message
export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Le contenu est requis').max(10000, 'Message trop long').optional(),
  contentType: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO']).default('TEXT'),
  metadata: z.record(z.unknown()).optional(),
  replyToMessageId: z.string().uuid().optional(),
});

// Marquer comme lu
export const markAsReadSchema = z.object({
  lastReadMessageId: z.string().uuid('ID message invalide'),
});

// Réaction
export const reactionSchema = z.object({
  emoji: z.string().refine(
    (val) => (ALLOWED_REACTION_EMOJIS as readonly string[]).includes(val),
    'Emoji non autorisé'
  ),
});

// Pagination cursor
export const paginationSchema = z.object({
  cursor: z.string().optional(), // ISO date string ou "id:date" composite
  limit: z.coerce.number().min(1).max(100).default(50),
});

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Génère une clé DM déterministe pour une paire d'utilisateurs.
 * Garantit que la même clé est générée peu importe l'ordre des IDs.
 */
export function generateDMKey(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort();
  return `${sorted[0]}:${sorted[1]}`;
}

/**
 * Extrait les user IDs d'une clé DM.
 */
export function parseDMKey(dmKey: string): [string, string] {
  const parts = dmKey.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid DM key format');
  }
  return [parts[0], parts[1]];
}

/**
 * Tronque le contenu d'un message pour l'aperçu.
 */
export function truncateMessagePreview(content: string | null, maxLength = 100): string {
  if (!content) return '';
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength - 3) + '...';
}
