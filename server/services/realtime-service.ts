import { Server as SocketServer, Socket } from "socket.io";
import { Server } from "http";
import jwt from "jsonwebtoken";
import { logger } from "@/lib/logger";
import { db } from "@/db";
import { users } from "@shared/schema/auth";
import { eq } from "drizzle-orm";
import { Redis } from "ioredis";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  agenceId?: string;
  role?: string;
}

export class RealtimeService {
  private io: SocketServer | null = null;
  private redis: Redis;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private agencySockets: Map<string, Set<string>> = new Map(); // agenceId -> Set of socketIds

  constructor() {
    // Initialize Redis for pub/sub in clustered environments
    this.redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on("error", (err) => {
      logger.error("Redis connection error:", err);
    });

    this.redis.on("connect", () => {
      logger.info("Redis connected for realtime service");
    });
  }

  /**
   * Initialize Socket.IO server
   */
  initialize(server: Server) {
    this.io = new SocketServer(server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        credentials: true,
      },
      transports: ["websocket", "polling"],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupEventHandlers();
    this.setupRedisSubscriber();

    logger.info("Realtime service initialized");
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers() {
    if (!this.io) return;

    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        // Extract token from auth header or query
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        
        if (!token) {
          return next(new Error("Authentication required"));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret") as any;
        
        // Get user details
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, decoded.userId))
          .limit(1);

        if (!user) {
          return next(new Error("User not found"));
        }

        // Attach user info to socket
        socket.userId = user.id;
        socket.agenceId = user.agenceId || undefined;
        socket.role = user.role;

        next();
      } catch (error) {
        logger.error("Socket authentication failed:", error);
        next(new Error("Authentication failed"));
      }
    });

    this.io.on("connection", (socket: AuthenticatedSocket) => {
      if (!socket.userId) return;

      logger.info(`User ${socket.userId} connected via socket ${socket.id}`);

      // Track user socket
      if (!this.userSockets.has(socket.userId)) {
        this.userSockets.set(socket.userId, new Set());
      }
      this.userSockets.get(socket.userId)?.add(socket.id);

      // Track agency socket
      if (socket.agenceId) {
        if (!this.agencySockets.has(socket.agenceId)) {
          this.agencySockets.set(socket.agenceId, new Set());
        }
        this.agencySockets.get(socket.agenceId)?.add(socket.id);

        // Join agency room
        socket.join(`agency:${socket.agenceId}`);
      }

      // Join user room
      socket.join(`user:${socket.userId}`);

      // Join role room
      if (socket.role) {
        socket.join(`role:${socket.role}`);
      }

      // Handle custom events
      this.setupSocketEventHandlers(socket);

      // Handle disconnection
      socket.on("disconnect", () => {
        logger.info(`User ${socket.userId} disconnected from socket ${socket.id}`);

        // Remove from tracking
        if (socket.userId) {
          const userSockets = this.userSockets.get(socket.userId);
          if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
              this.userSockets.delete(socket.userId);
            }
          }
        }

        if (socket.agenceId) {
          const agencySockets = this.agencySockets.get(socket.agenceId);
          if (agencySockets) {
            agencySockets.delete(socket.id);
            if (agencySockets.size === 0) {
              this.agencySockets.delete(socket.agenceId);
            }
          }
        }
      });
    });
  }

  /**
   * Setup custom socket event handlers
   */
  private setupSocketEventHandlers(socket: AuthenticatedSocket) {
    // Subscribe to investigation updates
    socket.on("subscribe:investigations", () => {
      if (socket.userId) {
        socket.join(`investigations:${socket.userId}`);
        logger.info(`User ${socket.userId} subscribed to investigations`);
      }
    });

    // Subscribe to activity updates
    socket.on("subscribe:activities", () => {
      if (socket.userId) {
        socket.join(`activities:${socket.userId}`);
        logger.info(`User ${socket.userId} subscribed to activities`);
      }
    });

    // Subscribe to agency updates (for supervisors)
    socket.on("subscribe:agency", (agenceId: string) => {
      if (socket.role === "superviseur" || socket.role === "administrateur") {
        socket.join(`agency:${agenceId}`);
        logger.info(`User ${socket.userId} subscribed to agency ${agenceId}`);
      }
    });

    // Handle ping/pong for connection health
    socket.on("ping", () => {
      socket.emit("pong", { timestamp: Date.now() });
    });

    // Mark notification as read
    socket.on("notification:read", async (notificationId: string) => {
      try {
        // Update notification status in database
        // await notificationService.markAsRead(notificationId, socket.userId!);
        socket.emit("notification:read:success", { notificationId });
      } catch (error) {
        socket.emit("notification:read:error", { error: "Failed to mark as read" });
      }
    });
  }

  /**
   * Setup Redis subscriber for cross-server communication
   */
  private setupRedisSubscriber() {
    const subscriber = this.redis.duplicate();

    subscriber.on("message", (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);
        
        // Route message based on channel
        if (channel.startsWith("user:")) {
          const userId = channel.split(":")[1];
          this.emitToUser(userId, data.event, data.payload);
        } else if (channel.startsWith("agency:")) {
          const agencyId = channel.split(":")[1];
          this.emitToAgency(agencyId, data.event, data.payload);
        } else if (channel.startsWith("role:")) {
          const role = channel.split(":")[1];
          this.emitToRole(role, data.event, data.payload);
        } else if (channel === "broadcast") {
          this.broadcast(data.event, data.payload);
        }
      } catch (error) {
        logger.error("Failed to process Redis message:", error);
      }
    });

    // Subscribe to channels
    subscriber.subscribe("broadcast");
    subscriber.psubscribe("user:*");
    subscriber.psubscribe("agency:*");
    subscriber.psubscribe("role:*");
  }

  // ============================================
  // EMIT METHODS
  // ============================================

  /**
   * Send event to specific user
   */
  async sendToUser(userId: string, event: any) {
    try {
      // Emit directly if we have local sockets
      this.emitToUser(userId, event.type, event);

      // Publish to Redis for other servers
      await this.redis.publish(
        `user:${userId}`,
        JSON.stringify({ event: event.type, payload: event })
      );
    } catch (error) {
      logger.error(`Failed to send to user ${userId}:`, error);
    }
  }

  /**
   * Send event to all users in an agency
   */
  async sendToAgency(agencyId: string, event: any) {
    try {
      // Emit directly if we have local sockets
      this.emitToAgency(agencyId, event.type, event);

      // Publish to Redis for other servers
      await this.redis.publish(
        `agency:${agencyId}`,
        JSON.stringify({ event: event.type, payload: event })
      );
    } catch (error) {
      logger.error(`Failed to send to agency ${agencyId}:`, error);
    }
  }

  /**
   * Send event to all users with specific role
   */
  async sendToRole(role: string, event: any) {
    try {
      // Emit directly if we have local sockets
      this.emitToRole(role, event.type, event);

      // Publish to Redis for other servers
      await this.redis.publish(
        `role:${role}`,
        JSON.stringify({ event: event.type, payload: event })
      );
    } catch (error) {
      logger.error(`Failed to send to role ${role}:`, error);
    }
  }

  /**
   * Broadcast event to all connected users
   */
  async broadcastEvent(event: any) {
    try {
      // Emit directly to all local sockets
      this.broadcast(event.type, event);

      // Publish to Redis for other servers
      await this.redis.publish(
        "broadcast",
        JSON.stringify({ event: event.type, payload: event })
      );
    } catch (error) {
      logger.error("Failed to broadcast event:", error);
    }
  }

  // ============================================
  // INTERNAL EMIT METHODS
  // ============================================

  private emitToUser(userId: string, event: string, data: any) {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, data);
  }

  private emitToAgency(agencyId: string, event: string, data: any) {
    if (!this.io) return;
    this.io.to(`agency:${agencyId}`).emit(event, data);
  }

  private emitToRole(role: string, event: string, data: any) {
    if (!this.io) return;
    this.io.to(`role:${role}`).emit(event, data);
  }

  private broadcast(event: string, data: any) {
    if (!this.io) return;
    this.io.emit(event, data);
  }

  // ============================================
  // STATUS METHODS
  // ============================================

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  /**
   * Get online users count for agency
   */
  getAgencyOnlineCount(agencyId: string): number {
    return this.agencySockets.get(agencyId)?.size || 0;
  }

  /**
   * Get all online users
   */
  getOnlineUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  /**
   * Disconnect user sockets
   */
  disconnectUser(userId: string) {
    const sockets = this.userSockets.get(userId);
    if (sockets && this.io) {
      sockets.forEach(socketId => {
        const socket = this.io!.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      });
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.io) {
      this.io.disconnectSockets(true);
      this.io.close();
    }
    await this.redis.quit();
  }
}

// Singleton instance
export const realtimeService = new RealtimeService();