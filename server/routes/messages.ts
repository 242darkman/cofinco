import type { Express } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import { messages, users, userAgences, agences, userRoles, employes } from "@shared/schema";
import { eq, or, and, desc, asc, sql, ne } from "drizzle-orm";
import { z } from "zod";
import { getWsInstance } from "../ws-server";

const sendMessageSchema = z.object({
  receiverId: z.string().uuid(),
  content: z.string().min(1),
});

export function registerMessagesRoutes(app: Express) {
  // Get conversations list (unique partners with last message)
  app.get("/api/messages/conversations", requireAuth, async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Unauthorized");
      const userId = req.user.id;

      // Complex query to get last message for each conversation partner
      const conversations = await db.execute(sql`
        WITH LastMessages AS (
          SELECT DISTINCT ON (
            CASE WHEN sender_id < receiver_id THEN sender_id ELSE receiver_id END,
            CASE WHEN sender_id < receiver_id THEN receiver_id ELSE sender_id END
          ) 
            id, 
            sender_id, 
            receiver_id, 
            content, 
            created_at,
            read,
            CASE 
              WHEN sender_id = ${userId} THEN receiver_id 
              ELSE sender_id 
            END as partner_id
          FROM messages
          WHERE sender_id = ${userId} OR receiver_id = ${userId}
          ORDER BY 
            CASE WHEN sender_id < receiver_id THEN sender_id ELSE receiver_id END,
            CASE WHEN sender_id < receiver_id THEN receiver_id ELSE sender_id END,
            created_at DESC
        )
        SELECT 
          lm.*, 
          COALESCE(NULLIF(TRIM(u.nom || ' ' || COALESCE(u.prenom, '')), ''), u.username, 'Utilisateur') as partner_name, 
          u.photo_profile as partner_avatar,
          u.statut as partner_status,
          u.role as partner_role,
          a.nom as partner_agence,
          (SELECT COUNT(*) FROM messages m 
           WHERE m.receiver_id = ${userId} 
           AND m.sender_id = lm.partner_id 
           AND m.read = false) as unread_count
        FROM LastMessages lm
        JOIN users u ON u.id = lm.partner_id
        LEFT JOIN user_agences ua ON ua.user_id = u.id AND ua.is_primary = true AND ua.actif = true
        LEFT JOIN agences a ON a.id = ua.agence_id
        ORDER BY lm.created_at DESC
      `);

      res.json(conversations.rows);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Error fetching conversations" });
    }
  });

  // Get messages with a specific user
  app.get("/api/messages/:userId", requireAuth, async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Unauthorized");
      const myId = req.user.id;
      const otherId = req.params.userId;

      const chatHistory = await db.query.messages.findMany({
        where: or(
          and(eq(messages.senderId, myId), eq(messages.receiverId, otherId)),
          and(eq(messages.senderId, otherId), eq(messages.receiverId, myId))
        ),
        orderBy: asc(messages.createdAt),
      });

      // Mark unread messages as read
      const updated = await db
        .update(messages)
        .set({ read: true })
        .where(
          and(
            eq(messages.receiverId, req.user!.id),
            eq(messages.senderId, otherId),
            eq(messages.read, false)
          )
        )
        .returning();

      // WebSocket Broadcast: Notify the sender (userId) that their messages were read by me (req.user.id)
      if (updated.length > 0) {
        const wsInstance = getWsInstance();
        if (wsInstance) {
           wsInstance.sendToUser(otherId, {
              type: "READ_RECEIPT",
              payload: {
                 readerId: req.user!.id,
                 messageIds: updated.map(m => m.id)
              }
           });
        }
      }

      res.json(chatHistory);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Error fetching messages" });
    }
  });

  // Send a message
  app.post("/api/messages", requireAuth, async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Unauthorized");
      const senderId = req.user.id;
      
      const { receiverId, content } = sendMessageSchema.parse(req.body);

      const [newMessage] = await db.insert(messages).values({
        senderId,
        receiverId,
        content,
      }).returning();

      // WebSocket Broadcast
      const wsInstance = getWsInstance();
      if (wsInstance) {
        // Notify Receiver
        wsInstance.sendToUser(receiverId, {
          type: "CHAT_MESSAGE",
          payload: newMessage
        });
        // Notify Sender (to update other tabs)
        wsInstance.sendToUser(senderId, {
          type: "CHAT_MESSAGE",
          payload: newMessage
        });
      }

      res.json(newMessage);
    } catch (error) {
      console.error("Error sending message:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Error sending message" });
    }
  });
  
  // Search users to start new conversation
  app.get("/api/messages/users/search", requireAuth, async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Unauthorized");
      const query = req.query.q as string;
      
      if (!query || query.length < 2) return res.json([]);

      // Search by username, nom, prenom, or full name combination
      // Role is fetched from userRoles (Architecture V3: source de vérité unique)
      const foundUsers = await db.select({
        id: users.id,
        username: users.username,
        nom: users.nom,
        prenom: users.prenom,
        photoProfile: users.photoProfile,
        role: userRoles.role,
        agence: agences.nom,
        typeCompte: users.typeCompte
      })
      .from(users)
      .leftJoin(userRoles, and(
        eq(userRoles.userId, users.id),
        eq(userRoles.isPrimary, true)
      ))
      .leftJoin(userAgences, and(
        eq(userAgences.userId, users.id),
        eq(userAgences.isPrimary, true),
        eq(userAgences.actif, true)
      ))
      .leftJoin(agences, eq(userAgences.agenceId, agences.id))
      .where(
        and(
          ne(users.id, req.user.id),
          eq(users.canLogin, true), // Only users who can login
          sql`(
            username ILIKE ${`%${query}%`} OR
            nom ILIKE ${`%${query}%`} OR
            COALESCE(prenom, '') ILIKE ${`%${query}%`} OR
            (nom || ' ' || COALESCE(prenom, '')) ILIKE ${`%${query}%`} OR
            (COALESCE(prenom, '') || ' ' || nom) ILIKE ${`%${query}%`}
          )`
        )
      )
      .limit(15);

      res.json(foundUsers);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({ message: "Error searching users" });
    }
  });
}
