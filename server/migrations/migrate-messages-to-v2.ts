/**
 * Migration Script: Messages v1 -> Conversations + Messages v2
 *
 * Ce script migre les messages existants (user-to-user) vers le nouveau
 * modèle conversation-centric avec support groupes.
 *
 * Stratégie:
 * 1. Pour chaque paire unique (sender, receiver), créer une conversation DM
 * 2. Ajouter les 2 participants
 * 3. Migrer tous les messages de cette paire vers messages_v2
 * 4. Calculer lastReadAt basé sur les messages marqués "read"
 * 5. Mettre à jour lastMessageId et lastMessageAt sur conversation
 *
 * Usage:
 *   npx tsx server/migrations/migrate-messages-to-v2.ts
 *
 * Options:
 *   --dry-run    Affiche ce qui serait fait sans modifier la DB
 *   --batch=100  Nombre de conversations à traiter par batch
 */

import { db, pool } from '../db';
import { sql, eq, and, or, desc } from 'drizzle-orm';
import {
  messages,
  conversations,
  conversationParticipants,
  messagesV2,
  generateDMKey,
  truncateMessagePreview,
  ConversationType,
  ParticipantRole,
  MessageContentType,
} from '@shared/schema';
import { createLogger } from '../lib/logger';

const logger = createLogger('MigrateMessagesV2');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '100');

interface MigrationStats {
  conversationsCreated: number;
  participantsCreated: number;
  messagesMigrated: number;
  errors: string[];
  startTime: Date;
  endTime?: Date;
}

const stats: MigrationStats = {
  conversationsCreated: 0,
  participantsCreated: 0,
  messagesMigrated: 0,
  errors: [],
  startTime: new Date(),
};

/**
 * Récupère toutes les paires uniques de conversations existantes
 */
async function getUniquePairs(): Promise<Array<{ user1: string; user2: string }>> {
  logger.info('Fetching unique conversation pairs...');

  const result = await db.execute<{ user1: string; user2: string }>(sql`
    SELECT DISTINCT
      LEAST(sender_id, receiver_id) as user1,
      GREATEST(sender_id, receiver_id) as user2
    FROM messages
    ORDER BY user1, user2
  `);

  logger.info({ count: result.rows.length }, 'Found unique conversation pairs');
  return result.rows;
}

/**
 * Vérifie si une conversation DM existe déjà
 */
async function getDMConversation(dmKey: string) {
  const existing = await db
    .select()
    .from(conversations)
    .where(eq(conversations.dmKey, dmKey))
    .limit(1);

  return existing[0] || null;
}

/**
 * Migre une paire de users vers le nouveau système
 */
async function migratePair(user1: string, user2: string): Promise<void> {
  const dmKey = generateDMKey(user1, user2);

  // Vérifier si déjà migré
  const existing = await getDMConversation(dmKey);
  if (existing) {
    logger.info({ dmKey }, '[SKIP] Conversation already exists');
    return;
  }

  // Récupérer tous les messages de cette paire
  const pairMessages = await db
    .select()
    .from(messages)
    .where(
      or(
        and(eq(messages.senderId, user1), eq(messages.receiverId, user2)),
        and(eq(messages.senderId, user2), eq(messages.receiverId, user1))
      )
    )
    .orderBy(messages.createdAt);

  if (pairMessages.length === 0) {
    logger.info({ dmKey }, '[SKIP] No messages for pair');
    return;
  }

  const firstMessage = pairMessages[0];
  const lastMessage = pairMessages[pairMessages.length - 1];

  if (DRY_RUN) {
    logger.info({ dmKey, messageCount: pairMessages.length }, '[DRY-RUN] Would create conversation');
    stats.conversationsCreated++;
    stats.participantsCreated += 2;
    stats.messagesMigrated += pairMessages.length;
    return;
  }

  try {
    // Transaction pour atomicité
    await db.transaction(async (tx) => {
      // 1. Créer la conversation
      const [newConversation] = await tx
        .insert(conversations)
        .values({
          type: 'DM',
          dmKey,
          createdById: firstMessage.senderId,
          createdAt: firstMessage.createdAt ?? new Date(),
          updatedAt: lastMessage.createdAt ?? new Date(),
          lastMessageAt: lastMessage.createdAt,
          lastMessagePreview: truncateMessagePreview(lastMessage.content),
        })
        .returning();

      stats.conversationsCreated++;

      // 2. Calculer lastReadAt pour chaque participant
      // Pour chaque user, trouver le dernier message qu'il a reçu et qui est marqué "read"
      const user1LastRead = pairMessages
        .filter(m => m.receiverId === user1 && m.read)
        .pop();

      const user2LastRead = pairMessages
        .filter(m => m.receiverId === user2 && m.read)
        .pop();

      // 3. Créer les participants
      await tx.insert(conversationParticipants).values([
        {
          conversationId: newConversation.id,
          userId: user1,
          role: 'MEMBER',
          joinedAt: firstMessage.createdAt ?? new Date(),
          lastReadAt: user1LastRead?.createdAt ?? null,
        },
        {
          conversationId: newConversation.id,
          userId: user2,
          role: 'MEMBER',
          joinedAt: firstMessage.createdAt ?? new Date(),
          lastReadAt: user2LastRead?.createdAt ?? null,
        },
      ]);
      stats.participantsCreated += 2;

      // 4. Migrer les messages
      const newMessages = await tx
        .insert(messagesV2)
        .values(
          pairMessages.map((msg) => ({
            conversationId: newConversation.id,
            senderId: msg.senderId,
            content: msg.content,
            contentType: 'TEXT' as const,
            createdAt: msg.createdAt ?? new Date(),
          }))
        )
        .returning({ id: messagesV2.id });

      stats.messagesMigrated += newMessages.length;

      // 5. Mettre à jour lastMessageId de la conversation
      const lastNewMessage = newMessages[newMessages.length - 1];
      await tx
        .update(conversations)
        .set({ lastMessageId: lastNewMessage.id })
        .where(eq(conversations.id, newConversation.id));

      // 6. Mettre à jour lastReadMessageId des participants
      if (user1LastRead) {
        const user1LastReadIndex = pairMessages.findIndex(m => m.id === user1LastRead.id);
        if (user1LastReadIndex >= 0) {
          await tx
            .update(conversationParticipants)
            .set({ lastReadMessageId: newMessages[user1LastReadIndex].id })
            .where(
              and(
                eq(conversationParticipants.conversationId, newConversation.id),
                eq(conversationParticipants.userId, user1)
              )
            );
        }
      }

      if (user2LastRead) {
        const user2LastReadIndex = pairMessages.findIndex(m => m.id === user2LastRead.id);
        if (user2LastReadIndex >= 0) {
          await tx
            .update(conversationParticipants)
            .set({ lastReadMessageId: newMessages[user2LastReadIndex].id })
            .where(
              and(
                eq(conversationParticipants.conversationId, newConversation.id),
                eq(conversationParticipants.userId, user2)
              )
            );
        }
      }

      logger.info({ dmKey, messageCount: pairMessages.length }, '[OK] Created conversation');
    });
  } catch (error) {
    const errorMsg = `Failed to migrate pair ${dmKey}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    logger.error({ err: error, dmKey }, '[ERROR] Migration failed');
    stats.errors.push(errorMsg);
  }
}

/**
 * Fonction principale de migration
 */
async function migrate(): Promise<void> {
  logger.info('='.repeat(60));
  logger.info('MIGRATION: Messages v1 -> Conversations + Messages v2');
  logger.info('='.repeat(60));
  logger.info({ mode: DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE', batchSize: BATCH_SIZE, startedAt: stats.startTime.toISOString() }, 'Migration started');

  // Vérifier que les tables existent
  try {
    await db.execute(sql`SELECT 1 FROM conversations LIMIT 1`);
    await db.execute(sql`SELECT 1 FROM conversation_participants LIMIT 1`);
    await db.execute(sql`SELECT 1 FROM messages_v2 LIMIT 1`);
  } catch (error) {
    logger.error({ err: error }, 'ERROR: New tables do not exist. Please run db:push first.');
    process.exit(1);
  }

  // Récupérer les paires à migrer
  const pairs = await getUniquePairs();

  if (pairs.length === 0) {
    logger.info('No messages to migrate.');
    return;
  }

  // Migrer par batches
  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    const batch = pairs.slice(i, i + BATCH_SIZE);
    logger.info({ batchNumber: Math.floor(i / BATCH_SIZE) + 1, totalBatches: Math.ceil(pairs.length / BATCH_SIZE), pairsInBatch: batch.length }, 'Processing batch...');

    for (const pair of batch) {
      await migratePair(pair.user1, pair.user2);
    }
  }

  // Résumé
  stats.endTime = new Date();
  const duration = (stats.endTime.getTime() - stats.startTime.getTime()) / 1000;

  logger.info('='.repeat(60));
  logger.info('MIGRATION COMPLETE');
  logger.info('='.repeat(60));
  logger.info({
    durationSeconds: duration.toFixed(2),
    conversationsCreated: stats.conversationsCreated,
    participantsCreated: stats.participantsCreated,
    messagesMigrated: stats.messagesMigrated,
    errorCount: stats.errors.length
  }, 'Migration summary');

  if (stats.errors.length > 0) {
    logger.error({ errors: stats.errors }, 'Migration errors occurred');
  }

  if (DRY_RUN) {
    logger.info('[DRY RUN] No changes were made to the database.');
    logger.info('Run without --dry-run to perform the actual migration.');
  }
}

/**
 * Fonction de rollback (supprime les données v2)
 */
async function rollback(): Promise<void> {
  if (DRY_RUN) {
    logger.info('[DRY RUN] Would delete all conversations, participants, and messages_v2');
    return;
  }

  logger.info('Rolling back migration...');

  await db.transaction(async (tx) => {
    // Les cascades s'occupent de tout
    await tx.delete(conversations);
  });

  logger.info('Rollback complete.');
}

// Point d'entrée
const action = process.argv[2];

if (action === 'rollback') {
  rollback()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ err: error }, 'Rollback failed');
      pool.end();
      process.exit(1);
    });
} else {
  migrate()
    .then(() => {
      pool.end();
      process.exit(stats.errors.length > 0 ? 1 : 0);
    })
    .catch((error) => {
      logger.error({ err: error }, 'Migration failed');
      pool.end();
      process.exit(1);
    });
}
